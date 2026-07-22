// Pure resume-playback helpers shared by the player (client bundle) and the
// position libs/actions (server). No prisma imports — safe for the browser
// and for hermetic unit tests. Semantics mirror Plex/Spotify "continue where
// you left off": a position only counts as resumable once it's past the
// intro, and a track near its end counts as finished.

/** Stops in the first 10s are treated as a fresh start, not a resume point. */
export const RESUME_MIN_POSITION_MS = 10_000;
/** At/after this fraction of the track, it counts as finished. */
export const RESUME_NEAR_END_RATIO = 0.95;
/** How often the player persists progress while a full stream plays. */
export const POSITION_SAVE_INTERVAL_MS = 10_000;

/**
 * Whether a stored position is worth resuming from: strictly past the 10s
 * intro threshold and strictly before the 95% near-end point. Anything else
 * (track barely started, essentially finished, bogus numbers) starts from 0.
 */
export function shouldResume(positionMs: number, durationMs: number): boolean {
  if (!Number.isFinite(positionMs) || !Number.isFinite(durationMs)) return false;
  if (durationMs <= 0) return false;
  if (positionMs <= RESUME_MIN_POSITION_MS) return false;
  return positionMs < durationMs * RESUME_NEAR_END_RATIO;
}

/**
 * Whether the position is close enough to the end that the track counts as
 * finished and its resume point should be cleared rather than saved.
 */
export function isNearEnd(positionMs: number, durationMs: number): boolean {
  if (!Number.isFinite(positionMs) || !Number.isFinite(durationMs)) return false;
  if (durationMs <= 0) return false;
  return positionMs >= durationMs * RESUME_NEAR_END_RATIO;
}

/** 0–100 progress for shelf progress bars. 0 for unknown/bogus durations. */
export function progressPercent(positionMs: number, durationMs: number): number {
  if (!Number.isFinite(positionMs) || !Number.isFinite(durationMs)) return 0;
  if (durationMs <= 0) return 0;
  const pct = (positionMs / durationMs) * 100;
  return Math.max(0, Math.min(100, pct));
}
