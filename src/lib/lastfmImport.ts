// Pure mapping helpers for the Last.fm history import
// (src/lib/actions/importHistory.ts). No prisma/fetch imports — unit-tested
// hermetically in tests/lastfmImport.test.ts. The input shape is structural so
// the LastFmRecentTrack rows from src/lib/lastfm.ts satisfy it directly.

import { isRealMbid } from "@/lib/scrobble/types";

export type RecentTrackLike = {
  name: string;
  artistName: string;
  /** Accepted for shape-compatibility with LastFmRecentTrack; not stored
   * (PlayHistory has no albumTitle column). */
  albumTitle: string | null;
  mbid: string | null;
  playedAt: Date | null;
  durationMs: number | null;
};

/** Plain PlayHistory row data (everything except userId + id). Note the real
 * PlayHistory model has NO albumTitle column, so the Last.fm album name is
 * dropped here; albumMbid stays null (Last.fm gives a name, not an MBID). */
export type ImportRow = {
  recordingMbid: string;
  artistName: string;
  title: string;
  playedMs: number;
  durationMs: number | null;
  playedAt: Date;
};

// PlayHistory's key scheme: a real recording MBID where we have one, otherwise
// a prefixed pseudo-id (`lidarr:<id>`, `local:<id>` — see PlayPosition's
// trackKey comment). Imported scrobbles without an MBID get a deterministic
// `lastfm:` pseudo-id so re-imports of the same scrobble dedupe cleanly.
function normalizeKeyPart(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}
export { normalizeKeyPart };

export function lastFmTrackKey(
  artistName: string,
  title: string,
  mbid: string | null,
): string {
  if (isRealMbid(mbid)) return mbid;
  return `lastfm:${normalizeKeyPart(artistName)}:${normalizeKeyPart(title)}`;
}

/** Dedupe key matching the (userId, trackKey, playedAt) uniqueness the import enforces per user. */
export function rowKey(recordingMbid: string, playedAt: Date): string {
  return `${recordingMbid}|${playedAt.getTime()}`;
}

/**
 * Map Last.fm recent-track shapes to PlayHistory rows. Drops the "now
 * playing" row (no timestamp yet — it becomes a real scrobble later) and
 * rows too broken to display. playedMs uses the track duration when Last.fm
 * provides one (a scrobble implies a full listen by Last.fm's own
 * threshold rules), else 0 — the play still counts, it just contributes no
 * minutes. In-batch duplicates (page-boundary overlap) collapse here.
 */
export function mapRecentTracksToRows(
  tracks: readonly RecentTrackLike[],
): ImportRow[] {
  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  for (const t of tracks) {
    if (!t.playedAt) continue; // now-playing row
    const artistName = t.artistName.trim();
    const title = t.name.trim();
    if (!artistName || !title) continue;
    const recordingMbid = lastFmTrackKey(artistName, title, t.mbid);
    const key = rowKey(recordingMbid, t.playedAt);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      recordingMbid,
      artistName,
      title,
      playedMs: t.durationMs ?? 0,
      durationMs: t.durationMs,
      playedAt: t.playedAt,
    });
  }
  return rows;
}

/**
 * Split mapped rows into ones not already in PlayHistory (fresh) and the
 * count skipped as duplicates. `existingKeys` comes from a bounded read of
 * existing (recordingMbid, playedAt) pairs — sqlite's Prisma adapter has no
 * createMany skipDuplicates, and PlayHistory has no DB-level unique
 * constraint for this tuple, so dedupe is enforced here. Generic over the row
 * type so the ListenBrainz importer's extended rows keep their extra fields
 * (albumMbid) through the split.
 */
export function filterExistingRows<T extends ImportRow>(
  rows: readonly T[],
  existingKeys: ReadonlySet<string>,
): { fresh: T[]; skipped: number } {
  const fresh: T[] = [];
  let skipped = 0;
  for (const row of rows) {
    if (existingKeys.has(rowKey(row.recordingMbid, row.playedAt))) {
      skipped += 1;
    } else {
      fresh.push(row);
    }
  }
  return { fresh, skipped };
}
