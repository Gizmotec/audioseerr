"use server";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  type AddTrackPayload,
  addTracksToPlaylist,
  addTrackToPlaylist,
  createPlaylist,
  deletePlaylist,
  getPlaylistCoverForUser,
  listAvailablePlaylistTracks,
  listPlaylists,
  moveTrack,
  removeTrackFromPlaylist,
  setPlaylistCover,
  setPlaylistShared,
  updatePlaylist,
} from "@/lib/playlists";
import { ensureTrackRequested } from "@/lib/trackRequests";

/**
 * For any added payloads we don't already have a file for (no Lidarr
 * trackFileId), kick off a Soulseek fetch so the track becomes playable. Runs
 * after the rows are inserted; best-effort per track.
 */
async function autoFetchMissing(
  userId: string,
  payloads: AddTrackPayload[],
): Promise<void> {
  await Promise.all(
    payloads
      .filter((p) => p.trackFileId == null)
      .map((p) =>
        ensureTrackRequested(userId, {
          albumMbid: p.albumMbid,
          albumTitle: p.albumTitle ?? null,
          artistName: p.artistName,
          coverUrl: p.coverUrl ?? null,
          recordingMbid: p.recordingMbid,
          trackTitle: p.title,
          albumPosition: p.albumPosition,
        }),
      ),
  );
}

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true } & T)
  | { ok: false; error: string };

async function requireUserId(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };
  return { ok: true, userId };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

const PLAYLIST_COVER_MAX_BYTES = 4 * 1024 * 1024;
const PLAYLIST_COVER_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

function localPlaylistCoverPath(url: string): string | null {
  if (!url.startsWith("/uploads/playlists/")) return null;
  const fileName = path.basename(url);
  if (fileName !== url.slice("/uploads/playlists/".length)) return null;
  return path.join(process.cwd(), "public", "uploads", "playlists", fileName);
}

export async function createPlaylistAction(input: {
  name: string;
  description?: string | null;
}): Promise<Result<{ id: string }>> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  try {
    const row = await createPlaylist(auth.userId, input);
    revalidatePath("/playlists");
    return { ok: true, id: row.id };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function updatePlaylistAction(
  playlistId: string,
  input: { name?: string; description?: string | null },
): Promise<Result> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  try {
    await updatePlaylist(auth.userId, playlistId, input);
    revalidatePath("/playlists");
    revalidatePath(`/playlists/${playlistId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function uploadPlaylistCoverAction(
  playlistId: string,
  formData: FormData,
): Promise<Result<{ coverUrl: string }>> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;

  const file = formData.get("cover");
  if (!(file instanceof File)) {
    return { ok: false, error: "Choose an image file." };
  }
  if (file.size === 0) {
    return { ok: false, error: "Choose an image file." };
  }
  if (file.size > PLAYLIST_COVER_MAX_BYTES) {
    return { ok: false, error: "Cover image must be 4 MB or smaller." };
  }

  const ext = PLAYLIST_COVER_TYPES.get(file.type);
  if (!ext) {
    return {
      ok: false,
      error: "Cover must be a JPEG, PNG, WebP, or GIF image.",
    };
  }

  try {
    const playlist = await getPlaylistCoverForUser(auth.userId, playlistId);
    if (!playlist) throw new Error("Playlist not found.");

    const dir = path.join(process.cwd(), "public", "uploads", "playlists");
    await mkdir(dir, { recursive: true });

    const fileName = `${playlistId}-${randomUUID()}.${ext}`;
    const filePath = path.join(dir, fileName);
    const coverUrl = `/uploads/playlists/${fileName}`;
    await writeFile(filePath, Buffer.from(await file.arrayBuffer()));

    await setPlaylistCover(auth.userId, playlistId, coverUrl);
    const previousPath = playlist.coverUrl
      ? localPlaylistCoverPath(playlist.coverUrl)
      : null;
    if (previousPath) {
      await unlink(previousPath).catch(() => {
        /* stale file cleanup is best-effort */
      });
    }

    revalidatePath("/playlists");
    revalidatePath(`/playlists/${playlistId}`);
    return { ok: true, coverUrl };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function deletePlaylistAction(
  playlistId: string,
): Promise<Result> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  try {
    await deletePlaylist(auth.userId, playlistId);
    revalidatePath("/playlists");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function setPlaylistSharedAction(
  playlistId: string,
  isShared: boolean,
): Promise<Result> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  try {
    await setPlaylistShared(auth.userId, playlistId, isShared);
    revalidatePath("/playlists");
    revalidatePath(`/playlists/${playlistId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function addTrackToPlaylistAction(
  playlistId: string,
  payload: AddTrackPayload,
): Promise<Result<{ id: string; position: number }>> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  try {
    const row = await addTrackToPlaylist(auth.userId, playlistId, payload);
    await autoFetchMissing(auth.userId, [payload]);
    revalidatePath("/playlists");
    revalidatePath(`/playlists/${playlistId}`);
    return { ok: true, id: row.id, position: row.position };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function addTracksToPlaylistAction(
  playlistId: string,
  payloads: AddTrackPayload[],
): Promise<Result<{ count: number }>> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  try {
    const result = await addTracksToPlaylist(auth.userId, playlistId, payloads);
    await autoFetchMissing(auth.userId, payloads);
    revalidatePath("/playlists");
    revalidatePath(`/playlists/${playlistId}`);
    return { ok: true, count: result.count };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function removeTrackAction(
  playlistId: string,
  trackRowId: string,
): Promise<Result> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  try {
    await removeTrackFromPlaylist(auth.userId, playlistId, trackRowId);
    revalidatePath("/playlists");
    revalidatePath(`/playlists/${playlistId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function moveTrackAction(
  playlistId: string,
  trackRowId: string,
  newPosition: number,
): Promise<Result> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  try {
    await moveTrack(auth.userId, playlistId, trackRowId, newPosition);
    revalidatePath(`/playlists/${playlistId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/**
 * Returns the user's playlists for the "Add to playlist" dropdown on the
 * album page. Read-only; no revalidation needed.
 */
export async function listMyPlaylistsAction(): Promise<
  Result<{ playlists: Array<{ id: string; name: string; trackCount: number }> }>
> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  const playlists = await listPlaylists(auth.userId);
  return {
    ok: true,
    playlists: playlists.map((p) => ({
      id: p.id,
      name: p.name,
      trackCount: p.trackCount,
    })),
  };
}

export async function listAvailablePlaylistTracksAction(): Promise<
  Result<{ tracks: Awaited<ReturnType<typeof listAvailablePlaylistTracks>> }>
> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  try {
    const tracks = await listAvailablePlaylistTracks();
    return { ok: true, tracks };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
