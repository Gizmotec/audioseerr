// Pure LRC ("[mm:ss.xx] text") parser. No imports — safe for client bundles.

export type LrcLine = {
  /** Absolute position of the line within the track, in milliseconds. */
  timeMs: number;
  /** Lyric text. Empty string for instrumental-break lines ("[01:23.45]"). */
  text: string;
};

// [mm:ss], [mm:ss.xx] or [mm:ss.xxx] — minutes any width, seconds two digits.
// Metadata tags ([ti:...], [ar:...], [offset:...]) don't match: not digits.
const TIMESTAMP = /\[(\d+):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

/**
 * Parse an LRC document into timed lines, sorted by time. A line may carry
 * several timestamps ("[00:10.00][00:20.00] repeated") — each produces its own
 * entry. Lines without a valid timestamp (metadata tags, malformed rows) are
 * skipped. The fraction is read as a decimal fraction of a second, so ".5",
 * ".50" and ".500" all mean 500ms.
 */
export function parseLrc(lrc: string): LrcLine[] {
  const lines: LrcLine[] = [];
  for (const rawLine of lrc.split(/\r?\n/)) {
    const stamps = [...rawLine.matchAll(TIMESTAMP)];
    if (stamps.length === 0) continue;
    const last = stamps[stamps.length - 1]!;
    const text = rawLine.slice(last.index! + last[0].length).trim();
    for (const stamp of stamps) {
      const minutes = Number(stamp[1]);
      const seconds = Number(stamp[2]);
      if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) continue;
      if (seconds >= 60) continue; // malformed timestamp
      const fractionMs = stamp[3] ? Number(`0.${stamp[3]}`) * 1000 : 0;
      lines.push({
        timeMs: Math.round(minutes * 60_000 + seconds * 1000 + fractionMs),
        text,
      });
    }
  }
  return lines.sort((a, b) => a.timeMs - b.timeMs);
}

/**
 * Index of the line active at `nowMs` — the last line whose timestamp is at or
 * before the position, or -1 when playback hasn't reached the first line.
 */
export function activeLrcLineIndex(lines: LrcLine[], nowMs: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let result = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid]!.timeMs <= nowMs) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return result;
}
