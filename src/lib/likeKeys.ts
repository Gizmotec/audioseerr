// Client-safe like helpers. Kept separate from likes.ts (which imports the
// Prisma client) so client components can compute like keys without pulling
// better-sqlite3 — and therefore Node's `fs` — into the browser bundle.

/**
 * The stable id a TRACK like is keyed on. Prefer the real recording MBID; fall
 * back to `albumMbid:position` for tracks MusicBrainz has no recording MBID for
 * (the same synthetic-id convention ensureTrackRequested uses). Callers building
 * a liked-set for a list MUST key on this so the per-row `initialLiked` matches
 * what toggleTrackLikeAction writes.
 */
export function trackLikeTargetId(
  recordingMbid: string | null | undefined,
  albumMbid: string | null | undefined,
  albumPosition: number | null | undefined,
): string | null {
  if (recordingMbid) return recordingMbid;
  if (albumMbid && albumPosition != null) return `${albumMbid}:${albumPosition}`;
  return null;
}
