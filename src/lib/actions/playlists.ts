"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  type AddTrackPayload,
  addTrackToPlaylist,
  createPlaylist,
  deletePlaylist,
  listPlaylists,
  moveTrack,
  removeTrackFromPlaylist,
  updatePlaylist,
} from "@/lib/playlists";

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

export async function addTrackToPlaylistAction(
  playlistId: string,
  payload: AddTrackPayload,
): Promise<Result<{ id: string; position: number }>> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  try {
    const row = await addTrackToPlaylist(auth.userId, playlistId, payload);
    revalidatePath("/playlists");
    revalidatePath(`/playlists/${playlistId}`);
    return { ok: true, id: row.id, position: row.position };
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
