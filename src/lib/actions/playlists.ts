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
  getSystemPlaylistDetail,
  listAvailablePlaylistTracks,
  listPlaylists,
  moveTrack,
  removeTrackFromPlaylist,
  setPlaylistCover,
  setPlaylistShared,
  setPlaylistSubscription,
  updatePlaylist,
} from "@/lib/playlists";
import {
  getPlaylistRecommendations,
  type PlaylistRecommendation,
} from "@/lib/recommendations";
import { resolveSong } from "@/lib/songResolve";
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

// Subscriber temp downloads live a week + grace, mirroring weekly mix retention.
const SUBSCRIPTION_RETENTION_MS = 8 * 24 * 60 * 60 * 1000;

/**
 * Subscribe/unsubscribe to a system (editorial) playlist. On subscribe, the
 * current picks are resolved to MusicBrainz and temp-downloaded in the
 * background (detached, so the click returns immediately on this long-lived
 * server); future weekly refreshes auto-download the new picks (src/lib/jobs).
 */
export async function setPlaylistSubscriptionAction(
  playlistId: string,
  subscribe: boolean,
): Promise<Result> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  try {
    await setPlaylistSubscription(auth.userId, playlistId, subscribe);
    if (subscribe) {
      void downloadSubscribedPlaylist(auth.userId, playlistId).catch((err) => {
        console.error("[playlists] subscribe download failed:", err);
      });
    }
    revalidatePath(`/playlists/${playlistId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/** Resolve each discovery-shaped track of a system playlist to MusicBrainz and
 * queue a temp download for the user. Sequential resolves keep MB load gentle;
 * best-effort per track. */
async function downloadSubscribedPlaylist(
  userId: string,
  playlistId: string,
): Promise<void> {
  const detail = await getSystemPlaylistDetail(playlistId);
  if (!detail) return;
  const expiresAt = new Date(Date.now() + SUBSCRIPTION_RETENTION_MS);
  for (const t of detail.tracks) {
    const resolved = await resolveSong(t, { includeSingles: true }).catch(() => null);
    if (!resolved) continue;
    await ensureTrackRequested(
      userId,
      {
        albumMbid: resolved.albumMbid,
        albumTitle: resolved.albumTitle,
        artistName: resolved.artistName,
        coverUrl: resolved.coverUrl,
        recordingMbid: resolved.recordingMbid,
        trackTitle: resolved.title,
        albumPosition: resolved.albumPosition,
      },
      { ephemeral: true, expiresAt },
    );
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
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };
  const viewer = {
    id: userId,
    role: (session.user as { role?: string }).role ?? null,
  };
  try {
    const tracks = await listAvailablePlaylistTracks(viewer);
    return { ok: true, tracks };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/**
 * Songs that fit this playlist (Spotify-style). `offset` paginates the ranked
 * pool so the UI's "Refresh" can swap in a fresh batch. Returns [] (not an
 * error) when the playlist is too short, has no recommendations, or no Last.fm
 * key is configured — the shelf simply stays hidden in those cases.
 */
export async function getPlaylistRecommendationsAction(
  playlistId: string,
  offset = 0,
): Promise<Result<{ recommendations: PlaylistRecommendation[] }>> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };
  const viewer = {
    id: userId,
    role: (session.user as { role?: string }).role ?? null,
  };
  try {
    const recommendations = await getPlaylistRecommendations(viewer, playlistId, {
      offset,
    });
    return { ok: true, recommendations };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

type RecommendationAddInput = {
  title: string;
  artistName: string;
  albumTitle: string | null;
  coverUrl: string | null;
  // Present for library tracks (precise identity). Absent for downloadable
  // suggestions, which are resolved against MusicBrainz here.
  albumMbid: string | null;
  albumPosition: number | null;
  recordingMbid: string | null;
};

/**
 * Add a recommended song to the playlist. Library tracks already carry their
 * identity, so they're added directly (autoFetch grants visibility, no
 * re-download). Downloadable suggestions are resolved against MusicBrainz, then
 * inserted — autoFetchMissing kicks off the Soulseek fetch, exactly like the
 * regular "Add songs" flow.
 */
export async function addRecommendationToPlaylistAction(
  playlistId: string,
  rec: RecommendationAddInput,
): Promise<Result> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  try {
    let payload: AddTrackPayload;
    if (rec.albumMbid && rec.albumPosition != null) {
      payload = {
        recordingMbid:
          rec.recordingMbid ?? `${rec.albumMbid}:${rec.albumPosition}`,
        trackFileId: null,
        albumMbid: rec.albumMbid,
        albumPosition: rec.albumPosition,
        title: rec.title,
        artistName: rec.artistName,
        albumTitle: rec.albumTitle,
        coverUrl: rec.coverUrl,
        durationMs: null,
      };
    } else {
      const resolved = await resolveSong(rec, { includeSingles: true });
      if (!resolved) {
        return { ok: false, error: "Couldn't find this track to download." };
      }
      payload = {
        recordingMbid:
          resolved.recordingMbid ??
          `${resolved.albumMbid}:${resolved.albumPosition}`,
        trackFileId: null,
        albumMbid: resolved.albumMbid,
        albumPosition: resolved.albumPosition,
        title: resolved.title,
        artistName: resolved.artistName,
        albumTitle: resolved.albumTitle,
        coverUrl: resolved.coverUrl,
        durationMs: resolved.durationMs,
      };
    }

    await addTrackToPlaylist(auth.userId, playlistId, payload);
    await autoFetchMissing(auth.userId, [payload]);
    revalidatePath("/playlists");
    revalidatePath(`/playlists/${playlistId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
