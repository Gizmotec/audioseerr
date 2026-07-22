// Pure listening-stats aggregators. No prisma import — the page fetches plain
// PlayHistory-shaped rows and hands them to these functions, so all the math
// stays unit-testable (see tests/stats.test.ts).

export type PlayRow = {
  recordingMbid: string;
  albumMbid: string | null;
  artistName: string;
  title: string;
  durationMs: number | null;
  playedMs: number;
  playedAt: Date;
};

export type RankedArtist = { name: string; plays: number };
export type RankedTrack = {
  recordingMbid: string;
  title: string;
  artistName: string;
  plays: number;
};
export type RankedAlbum = {
  albumMbid: string;
  artistName: string;
  plays: number;
};
export type DayPlays = { date: string; plays: number };

export function totalPlays(rows: readonly PlayRow[]): number {
  return rows.length;
}

/** Actual listening time (playedMs), rounded to whole minutes. */
export function totalMinutes(rows: readonly PlayRow[]): number {
  const ms = rows.reduce((sum, r) => sum + Math.max(0, r.playedMs), 0);
  return Math.round(ms / 60_000);
}

export function uniqueArtists(rows: readonly PlayRow[]): number {
  return new Set(rows.map((r) => r.artistName)).size;
}

/**
 * Groups rows by `keyOf` and returns the top `n` by play count. Ties keep
 * first-seen order: groups are built in encounter order and Array.sort is
 * stable, so equal counts never reshuffle between renders.
 */
function rank<T extends { plays: number }>(
  rows: readonly PlayRow[],
  keyOf: (r: PlayRow) => string | null,
  build: (key: string, rep: PlayRow) => T,
  n: number,
): T[] {
  if (n <= 0) return [];
  const groups = new Map<string, T>();
  for (const row of rows) {
    const key = keyOf(row);
    if (!key) continue;
    const existing = groups.get(key);
    if (existing) {
      existing.plays += 1;
    } else {
      groups.set(key, { ...build(key, row), plays: 1 });
    }
  }
  return [...groups.values()].sort((a, b) => b.plays - a.plays).slice(0, n);
}

export function topArtists(
  rows: readonly PlayRow[],
  n: number,
): RankedArtist[] {
  return rank(rows, (r) => r.artistName || null, (name) => ({ name, plays: 0 }), n);
}

export function topTracks(rows: readonly PlayRow[], n: number): RankedTrack[] {
  return rank(
    rows,
    (r) => r.recordingMbid || null,
    (recordingMbid, rep) => ({
      recordingMbid,
      title: rep.title,
      artistName: rep.artistName,
      plays: 0,
    }),
    n,
  );
}

/** Plays without an albumMbid never rank — there's nothing to link to. */
export function topAlbums(rows: readonly PlayRow[], n: number): RankedAlbum[] {
  return rank(
    rows,
    (r) => r.albumMbid || null,
    (albumMbid, rep) => ({
      albumMbid,
      artistName: rep.artistName,
      plays: 0,
    }),
    n,
  );
}

/** UTC day key — bucketing in UTC keeps it DST-safe regardless of server TZ. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Play counts for the `days` UTC days ending on `now`'s day, oldest first.
 * Days with no plays are included with 0 so the activity strip has no gaps.
 */
export function playsByDay(
  rows: readonly PlayRow[],
  days: number,
  now: Date = new Date(),
): DayPlays[] {
  if (days <= 0) return [];
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = dayKey(row.playedAt);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  // Start of today's UTC day, then walk backwards.
  const todayStart = Date.parse(dayKey(now) + "T00:00:00.000Z");
  const out: DayPlays[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = dayKey(new Date(todayStart - i * 86_400_000));
    out.push({ date, plays: counts.get(date) ?? 0 });
  }
  return out;
}

/**
 * Longest run of consecutive calendar days with at least one play. Input is
 * the playsByDay shape; gaps (missing dates) and zero-play days both break a
 * streak. Consecutiveness is checked with real UTC date math so month/year
 * boundaries count correctly.
 */
export function longestStreak(days: readonly DayPlays[]): number {
  let best = 0;
  let current = 0;
  let prevTime: number | null = null;
  for (const day of [...days].sort((a, b) => a.date.localeCompare(b.date))) {
    if (day.plays <= 0) {
      current = 0;
      prevTime = null;
      continue;
    }
    const time = Date.parse(day.date + "T00:00:00.000Z");
    current = prevTime !== null && time - prevTime === 86_400_000 ? current + 1 : 1;
    prevTime = time;
    if (current > best) best = current;
  }
  return best;
}
