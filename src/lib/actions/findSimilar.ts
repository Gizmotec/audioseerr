"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { findSimilarStation, type FindSimilarSeed } from "@/lib/findSimilar";
import {
  type AddTrackPayload,
  addTracksToPlaylist,
  createPlaylist,
} from "@/lib/playlists";
import type { PlaylistRecommendation } from "@/lib/recommendations";
import { resolveSong } from "@/lib/songResolve";
import { ensureTrackRequested } from "@/lib/trackRequests";

// A new (not-yet-owned) station track — the minimum the slskd request path
// needs to resolve and fetch it.
type NewTrack = {
  title: string;
  artistName: string;
  albumTitle: string | null;
  coverUrl: string | null;
};

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}

/**
 * Build the "Find Similar" radio station for one seed song. Returns the station
 * title plus its tracks (owned + new, interleaved) so the client can start the
 * queue immediately. The auto-download of the new tracks is a separate call
 * (autoDownloadStationAction) so playback never waits on it.
 */
export async function findSimilarStationAction(
  seed: FindSimilarSeed,
): Promise<
  | { ok: true; title: string; tracks: PlaylistRecommendation[] }
  | { ok: false; error: string }
> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };
  if (!seed?.title || !seed?.artistName) {
    return { ok: false, error: "Missing track." };
  }

  const viewer = {
    id: userId,
    role: (session.user as { role?: string }).role ?? null,
  };
  try {
    const station = await findSimilarStation(viewer, seed);
    if (station.tracks.length === 0) {
      return {
        ok: false,
        error:
          "No similar songs found. (Find Similar needs a Last.fm API key — set one in Settings.)",
      };
    }
    return { ok: true, title: station.title, tracks: station.tracks };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}

/**
 * Auto-download every new song in a station: resolve each to a MusicBrainz
 * album+position, then hand it to the existing slskd request path (idempotent,
 * dedupes owned/in-flight). Best-effort — a track that can't be resolved is
 * skipped, not fatal. Returns how many were requested.
 */
export async function autoDownloadStationAction(
  tracks: NewTrack[],
): Promise<{ ok: true; requested: number } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };
  if (tracks.length === 0) return { ok: true, requested: 0 };

  const results = await Promise.allSettled(
    tracks.map(async (t) => {
      const resolved = await resolveSong(t, { includeSingles: true });
      if (!resolved) return false;
      await ensureTrackRequested(userId, {
        albumMbid: resolved.albumMbid,
        albumTitle: resolved.albumTitle,
        artistName: resolved.artistName,
        coverUrl: resolved.coverUrl,
        recordingMbid: resolved.recordingMbid,
        trackTitle: resolved.title,
        albumPosition: resolved.albumPosition,
      });
      return true;
    }),
  );

  const requested = results.filter(
    (r) => r.status === "fulfilled" && r.value,
  ).length;
  revalidatePath("/requests");
  return { ok: true, requested };
}

/**
 * Persist a station as a real playlist. Owned tracks already carry their
 * identity; new ones are resolved against MusicBrainz (and have a fetch kicked
 * off) exactly like the regular recommendation add-flow. Unresolvable tracks
 * are skipped rather than failing the whole save.
 */
export async function saveStationAsPlaylistAction(
  name: string,
  tracks: PlaylistRecommendation[],
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };
  const trimmed = (name ?? "").trim().slice(0, 100) || "Similar songs";

  try {
    const payloads: AddTrackPayload[] = [];
    for (const rec of tracks) {
      if (rec.albumMbid && rec.albumPosition != null) {
        payloads.push({
          recordingMbid:
            rec.recordingMbid ?? `${rec.albumMbid}:${rec.albumPosition}`,
          trackFileId: null,
          albumMbid: rec.albumMbid,
          albumPosition: rec.albumPosition,
          title: rec.title,
          artistName: rec.artistName,
          albumTitle: rec.albumTitle,
          coverUrl: rec.coverUrl,
          durationMs: rec.durationMs,
        });
        continue;
      }
      const resolved = await resolveSong(rec, { includeSingles: true });
      if (!resolved) continue;
      payloads.push({
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
      });
    }

    if (payloads.length === 0) {
      return { ok: false, error: "Couldn't resolve any of these songs to save." };
    }

    const playlist = await createPlaylist(userId, { name: trimmed });
    await addTracksToPlaylist(userId, playlist.id, payloads);

    // Kick off fetches for anything we don't already have a file for.
    await Promise.allSettled(
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

    revalidatePath("/playlists");
    return { ok: true, id: playlist.id };
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
