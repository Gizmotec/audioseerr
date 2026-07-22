"use server";

import { after } from "next/server";
import { auth } from "@/auth";
import { recordPlay, type RecordPlayInput } from "@/lib/playHistory";
import {
  clearPlayPosition,
  getPlayPosition,
  listRecentPositions,
  upsertPlayPosition,
  type SavePlayPositionInput,
} from "@/lib/playPositions";
import { scrobbleTrack } from "@/lib/scrobble";

export async function recordPlayAction(
  input: RecordPlayInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };

  await recordPlay(userId, input);

  // Scrobble to Last.fm/ListenBrainz after the response finishes so external
  // API latency never delays the client. scrobbleTrack swallows per-service
  // errors internally (console.warn), so nothing here can throw into the
  // play path. Deezer 30s previews never reach this action by design.
  after(() => scrobbleTrack(userId, input));

  return { ok: true };
}

// --- Resume playback ("continue where you left off") ------------------------
//
// Same discipline as the scrobble hook: positions are fire-and-forget from
// the player, so every action here catches and console.warns — a persistence
// hiccup must never throw into the play path.

export type { SavePlayPositionInput } from "@/lib/playPositions";

/** Serializable shape returned to the player/shelf. */
export type PlayPositionSnapshot = {
  trackKey: string;
  title: string;
  artistName: string;
  albumTitle: string | null;
  positionMs: number;
  durationMs: number;
  updatedAt: Date;
};

function toSnapshot(row: {
  trackKey: string;
  title: string;
  artistName: string;
  albumTitle: string | null;
  positionMs: number;
  durationMs: number;
  updatedAt: Date;
}): PlayPositionSnapshot {
  return {
    trackKey: row.trackKey,
    title: row.title,
    artistName: row.artistName,
    albumTitle: row.albumTitle,
    positionMs: row.positionMs,
    durationMs: row.durationMs,
    updatedAt: row.updatedAt,
  };
}

export async function savePlayPositionAction(
  input: SavePlayPositionInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return { ok: false, error: "Not signed in." };
    await upsertPlayPosition(userId, input);
    return { ok: true };
  } catch (e) {
    console.warn("[plays] savePlayPosition failed:", e);
    return { ok: false, error: "Couldn't save the playback position." };
  }
}

export async function clearPlayPositionAction(
  trackKey: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return { ok: false, error: "Not signed in." };
    await clearPlayPosition(userId, trackKey);
    return { ok: true };
  } catch (e) {
    console.warn("[plays] clearPlayPosition failed:", e);
    return { ok: false, error: "Couldn't clear the playback position." };
  }
}

/** Stored position for one track, or null when none/unknown/unauthenticated. */
export async function getPlayPositionAction(
  trackKey: string,
): Promise<PlayPositionSnapshot | null> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return null;
    const row = await getPlayPosition(userId, trackKey);
    return row ? toSnapshot(row) : null;
  } catch (e) {
    console.warn("[plays] getPlayPosition failed:", e);
    return null;
  }
}

/** Newest-first resume points for the signed-in user (capped at 20). */
export async function listRecentPositionsAction(
  limit = 20,
): Promise<PlayPositionSnapshot[]> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return [];
    const rows = await listRecentPositions(userId, Math.min(Math.max(limit, 1), 20));
    return rows.map(toSnapshot);
  } catch (e) {
    console.warn("[plays] listRecentPositions failed:", e);
    return [];
  }
}
