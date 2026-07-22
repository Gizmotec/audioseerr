"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import type { SmartPlaylistRow, SmartRule } from "@/lib/smartPlaylist";
import {
  createSmartPlaylist,
  deleteSmartPlaylist,
  getSmartPlaylist,
  getSmartPlaylistTracks,
  listSmartPlaylists,
  updateSmartPlaylist,
  type SmartPlaylistSummary,
} from "@/lib/smartPlaylists";

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true } & T)
  | { ok: false; error: string };

async function requireUser(): Promise<
  | { ok: true; userId: string; role?: string }
  | { ok: false; error: string }
> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };
  return { ok: true, userId, role: (session.user as { role?: string }).role };
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

export async function createSmartPlaylistAction(input: {
  name: string;
  rules: SmartRule[];
  limit?: number;
}): Promise<Result<{ id: string }>> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  try {
    const row = await createSmartPlaylist(auth.userId, input);
    revalidatePath("/playlists");
    return { ok: true, id: row.id };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function updateSmartPlaylistAction(
  id: string,
  input: { name?: string; rules?: SmartRule[]; limit?: number },
): Promise<Result> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  try {
    await updateSmartPlaylist(auth.userId, id, input);
    revalidatePath("/playlists");
    revalidatePath(`/playlists/smart/${id}`);
    return { ok: true } as Result;
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function deleteSmartPlaylistAction(id: string): Promise<Result> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  try {
    await deleteSmartPlaylist(auth.userId, id);
    revalidatePath("/playlists");
    return { ok: true } as Result;
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

export async function listSmartPlaylistsAction(): Promise<
  Result<{ playlists: SmartPlaylistSummary[] }>
> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  try {
    const playlists = await listSmartPlaylists(auth.userId);
    return { ok: true, playlists };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/**
 * Live evaluation for the caller: joins their library/plays/likes and runs
 * the pure evaluator. Read-only; owner-scoped (smart playlists are private).
 */
export async function getSmartPlaylistTracksAction(
  id: string,
): Promise<Result<{ tracks: SmartPlaylistRow[] }>> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  try {
    const playlist = await getSmartPlaylist(auth.userId, id);
    if (!playlist) return { ok: false, error: "Smart playlist not found." };
    const tracks = await getSmartPlaylistTracks(
      { id: auth.userId, role: auth.role },
      playlist,
    );
    return { ok: true, tracks };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
