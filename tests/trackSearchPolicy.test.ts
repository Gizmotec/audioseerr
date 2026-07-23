import { describe, expect, it } from "vitest";
import {
  isTrackSearchDue,
  selectDueTrackSearches,
  trackSearchRetryDelayMs,
} from "@/lib/trackSearchPolicy";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("trackSearchRetryDelayMs", () => {
  it("backs off older missing requests from minutes to one day", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    const delayForAge = (ageMs: number) =>
      trackSearchRetryDelayMs(
        {
          approvedAt: new Date(now.getTime() - ageMs),
          requestedAt: new Date(now.getTime() - ageMs),
        },
        now,
      );

    expect(delayForAge(HOUR)).toBe(30 * MINUTE);
    expect(delayForAge(12 * HOUR)).toBe(2 * HOUR);
    expect(delayForAge(2 * DAY)).toBe(6 * HOUR);
    expect(delayForAge(8 * DAY)).toBe(DAY);
  });
});

describe("isTrackSearchDue", () => {
  it("runs new requests immediately and respects the age-based delay thereafter", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    const requestedAt = new Date(now.getTime() - 8 * DAY);
    const approvedAt = requestedAt;

    expect(
      isTrackSearchDue({ requestedAt, approvedAt, lastSearchedAt: null }, now),
    ).toBe(true);
    expect(
      isTrackSearchDue(
        {
          requestedAt,
          approvedAt,
          lastSearchedAt: new Date(now.getTime() - DAY + MINUTE),
        },
        now,
      ),
    ).toBe(false);
    expect(
      isTrackSearchDue(
        {
          requestedAt,
          approvedAt,
          lastSearchedAt: new Date(now.getTime() - DAY),
        },
        now,
      ),
    ).toBe(true);
  });
});

describe("selectDueTrackSearches", () => {
  it("finds a due recent request behind more than 250 old requests that are not due", () => {
    const now = new Date("2026-07-22T12:00:00.000Z");
    const oldNotDue = Array.from({ length: 251 }, (_, index) => ({
      id: `old-${index}`,
      requestedAt: new Date(now.getTime() - 8 * DAY),
      approvedAt: new Date(now.getTime() - 8 * DAY),
      lastSearchedAt: new Date(now.getTime() - 23 * HOUR),
    }));
    const recentDue = {
      id: "recent-due",
      requestedAt: new Date(now.getTime() - HOUR),
      approvedAt: new Date(now.getTime() - HOUR),
      lastSearchedAt: new Date(now.getTime() - 31 * MINUTE),
    };

    expect(
      selectDueTrackSearches([...oldNotDue, recentDue], now, 5).map(
        (request) => request.id,
      ),
    ).toEqual(["recent-due"]);
  });
});
