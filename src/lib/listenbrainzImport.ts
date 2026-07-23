// Pure mapping helpers for the ListenBrainz history import
// (src/lib/importHistory.ts → importListenBrainzHistoryForUser). No
// prisma/fetch imports — unit-tested hermetically in
// tests/listenbrainzImport.test.ts. The input shape is structural so the
// ListenBrainzListen rows from src/lib/scrobble/listenbrainz.ts satisfy it
// directly.

import {
  normalizeKeyPart,
  rowKey,
  type ImportRow,
} from "@/lib/lastfmImport";
import { isRealMbid } from "@/lib/scrobble/types";

/** Structural mirror of the ListenBrainz /listens payload rows we consume. */
export type ListenAdditionalInfo = {
  recording_mbid?: string;
  /** Release-GROUP mbid — present when ListenBrainz's mapper matched. */
  release_group_mbid?: string;
  duration_ms?: number;
  media_player?: string;
  submission_client?: string;
};

export type ListenLike = {
  /** Unix seconds the listen started. */
  listened_at?: number;
  track_metadata?: {
    artist_name?: string;
    track_name?: string;
    additional_info?: ListenAdditionalInfo;
  };
};

/** PlayHistory row data plus the album link ListenBrainz can provide. */
export type ListenBrainzImportRow = ImportRow & {
  /** Release-group MBID when ListenBrainz matched the listen, else null. */
  albumMbid: string | null;
};

// Same pseudo-id scheme as the Last.fm import, own prefix family:
// `listenbrainz:<normalizedArtist>:<normalizedTitle>`. Deterministic so
// re-imports of the same listen dedupe cleanly on (recordingMbid, playedAt).
export function listenBrainzTrackKey(
  artistName: string,
  title: string,
  recordingMbid: string | null,
): string {
  if (isRealMbid(recordingMbid)) return recordingMbid;
  return `listenbrainz:${normalizeKeyPart(artistName)}:${normalizeKeyPart(title)}`;
}

// Audioseerr's own scrobbles (submit-listens sets media_player "Audioseerr";
// some pipelines surface the submitter as submission_client) are already in
// PlayHistory from the play path — re-importing them would double-count.
export function isOwnScrobble(
  info: ListenAdditionalInfo | undefined,
): boolean {
  return [info?.media_player, info?.submission_client].some(
    (v) => typeof v === "string" && v.trim().toLowerCase() === "audioseerr",
  );
}

/**
 * Map ListenBrainz listens to PlayHistory rows. Skips our own scrobbles and
 * rows too broken to display; playedMs uses the track duration when
 * ListenBrainz has one (a listen implies a full playthrough, same reasoning
 * as the Last.fm import), else 0 — the play counts, it contributes no
 * minutes. In-batch duplicates (window overlap between the catch-up and
 * backfill halves of an import run) collapse here.
 */
export function mapListensToRows(
  listens: readonly ListenLike[],
): ListenBrainzImportRow[] {
  const seen = new Set<string>();
  const rows: ListenBrainzImportRow[] = [];
  for (const listen of listens) {
    const ts = listen.listened_at;
    if (typeof ts !== "number" || !Number.isFinite(ts) || ts <= 0) continue;
    const meta = listen.track_metadata ?? {};
    const artistName = (meta.artist_name ?? "").trim();
    const title = (meta.track_name ?? "").trim();
    if (!artistName || !title) continue;
    const info = meta.additional_info;
    if (isOwnScrobble(info)) continue;

    const recordingMbid = listenBrainzTrackKey(
      artistName,
      title,
      info?.recording_mbid ?? null,
    );
    const playedAt = new Date(ts * 1000);
    const key = rowKey(recordingMbid, playedAt);
    if (seen.has(key)) continue;
    seen.add(key);

    const durationMs =
      typeof info?.duration_ms === "number" &&
      Number.isFinite(info.duration_ms) &&
      info.duration_ms > 0
        ? Math.round(info.duration_ms)
        : null;
    const rgMbid = info?.release_group_mbid;
    rows.push({
      recordingMbid,
      artistName,
      title,
      playedMs: durationMs ?? 0,
      durationMs,
      playedAt,
      albumMbid: isRealMbid(rgMbid) ? rgMbid : null,
    });
  }
  return rows;
}
