// Pure helpers for the /releases "new from your artists" feed. No prisma or
// fetch imports — the orchestration lives in src/lib/releases.ts and hands
// plain shapes to these functions, so the merge logic stays unit-testable
// (see tests/releaseFeed.test.ts).

export type FeedRelease = {
  /** Release-group MBID — also the /album/[mbid] route id. */
  mbid: string;
  title: string;
  artistName: string;
  /** MusicBrainz first-release-date; may be partial ("2026", "2026-06"). */
  firstReleaseDate: string | null;
};

export const RELEASE_WINDOW_DAYS = 90;
export const RELEASE_FEED_LIMIT = 50;

/**
 * Normalize an MB date (full or partial) to a full YYYY-MM-DD string. Partial
 * dates pad with the EARLIEST possible day ("2026" → "2026-01-01",
 * "2026-06" → "2026-06-01") — conservative for window filtering and stable
 * for sorting. Returns null for anything unparseable.
 */
export function parseMbDate(raw: string | null): string | null {
  if (!raw) return null;
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(raw.trim());
  if (!m) return null;
  const [, year, month, day] = m;
  return `${year}-${month ?? "01"}-${day ?? "01"}`;
}

/** YYYY-MM-DD lower bound for the release window, for MB queries/cache keys. */
export function sinceDateString(now: Date, windowDays = RELEASE_WINDOW_DAYS): string {
  return new Date(now.getTime() - windowDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Merge per-artist release lists into one feed: keep releases whose date
 * falls inside the window (releases with no/junk date can't be shown as
 * "new" and drop out), dedupe by release-group MBID (the same album can
 * surface under several of the user's artists), sort newest-first, cap.
 * Generic so callers keep richer row types (coverUrl etc.) through the merge.
 */
export function mergeRecentReleases<T extends FeedRelease>(
  lists: readonly (readonly T[])[],
  opts: { now: Date; windowDays?: number; limit?: number },
): T[] {
  const windowDays = opts.windowDays ?? RELEASE_WINDOW_DAYS;
  const limit = opts.limit ?? RELEASE_FEED_LIMIT;
  const since = sinceDateString(opts.now, windowDays);

  const seen = new Set<string>();
  const merged: { release: T; sortDate: string }[] = [];
  for (const list of lists) {
    for (const release of list) {
      if (seen.has(release.mbid)) continue;
      const date = parseMbDate(release.firstReleaseDate);
      if (!date || date < since) continue; // ISO strings compare chronologically
      seen.add(release.mbid);
      merged.push({ release, sortDate: date });
    }
  }
  merged.sort((a, b) => {
    if (a.sortDate !== b.sortDate) return b.sortDate.localeCompare(a.sortDate);
    return a.release.title.localeCompare(b.release.title); // deterministic tie-break
  });
  return merged.slice(0, limit).map((m) => m.release);
}
