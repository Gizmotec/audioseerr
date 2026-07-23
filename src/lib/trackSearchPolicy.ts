const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

type TrackSearchAge = {
  approvedAt: Date | null;
  requestedAt: Date;
};

type TrackSearchTiming = TrackSearchAge & {
  lastSearchedAt: Date | null;
};

/**
 * Recent requests are checked frequently; persistent misses taper to a daily
 * retry so a large backlog cannot flood the Soulseek search network forever.
 */
export function trackSearchRetryDelayMs(
  request: TrackSearchAge,
  now = new Date(),
): number {
  const startedAt = request.approvedAt ?? request.requestedAt;
  const ageMs = Math.max(0, now.getTime() - startedAt.getTime());

  if (ageMs < 6 * HOUR_MS) return 30 * MINUTE_MS;
  if (ageMs < DAY_MS) return 2 * HOUR_MS;
  if (ageMs < 7 * DAY_MS) return 6 * HOUR_MS;
  return DAY_MS;
}

export function isTrackSearchDue(
  request: TrackSearchTiming,
  now = new Date(),
): boolean {
  if (!request.lastSearchedAt) return true;
  return (
    now.getTime() - request.lastSearchedAt.getTime() >=
    trackSearchRetryDelayMs(request, now)
  );
}

/** Filter for eligibility before limiting, ordered by the most-overdue search. */
export function selectDueTrackSearches<T extends TrackSearchTiming>(
  requests: readonly T[],
  now = new Date(),
  limit = 5,
): T[] {
  if (limit <= 0) return [];

  return requests
    .map((request) => ({
      request,
      dueAt: request.lastSearchedAt
        ? request.lastSearchedAt.getTime() + trackSearchRetryDelayMs(request, now)
        : Number.NEGATIVE_INFINITY,
    }))
    .filter(({ dueAt }) => dueAt <= now.getTime())
    .sort(
      (a, b) =>
        a.dueAt - b.dueAt ||
        a.request.requestedAt.getTime() - b.request.requestedAt.getTime(),
    )
    .slice(0, Math.floor(limit))
    .map(({ request }) => request);
}
