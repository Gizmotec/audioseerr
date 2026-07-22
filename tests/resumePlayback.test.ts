import { describe, expect, it } from "vitest";
import {
  POSITION_SAVE_INTERVAL_MS,
  RESUME_MIN_POSITION_MS,
  RESUME_NEAR_END_RATIO,
  isNearEnd,
  progressPercent,
  shouldResume,
} from "@/lib/resumePlayback";

const TRACK_MS = 3 * 60 * 1000; // 3:00 — the fixture duration used below

describe("shouldResume", () => {
  it("accepts a mid-track position", () => {
    expect(shouldResume(60_000, TRACK_MS)).toBe(true);
  });

  it("rejects positions at or under the 10s intro threshold", () => {
    expect(shouldResume(0, TRACK_MS)).toBe(false);
    expect(shouldResume(5_000, TRACK_MS)).toBe(false);
    expect(shouldResume(RESUME_MIN_POSITION_MS, TRACK_MS)).toBe(false);
    expect(shouldResume(RESUME_MIN_POSITION_MS + 1, TRACK_MS)).toBe(true);
  });

  it("rejects positions at or past the 95% near-end point", () => {
    const nearEnd = TRACK_MS * RESUME_NEAR_END_RATIO;
    expect(shouldResume(nearEnd, TRACK_MS)).toBe(false);
    expect(shouldResume(nearEnd - 1, TRACK_MS)).toBe(true);
    expect(shouldResume(TRACK_MS, TRACK_MS)).toBe(false);
  });

  it("rejects bogus inputs instead of resuming blindly", () => {
    expect(shouldResume(60_000, 0)).toBe(false);
    expect(shouldResume(60_000, -1)).toBe(false);
    expect(shouldResume(Number.NaN, TRACK_MS)).toBe(false);
    expect(shouldResume(60_000, Number.NaN)).toBe(false);
    expect(shouldResume(Number.POSITIVE_INFINITY, TRACK_MS)).toBe(false);
  });

  it("rejects negative positions", () => {
    expect(shouldResume(-100, TRACK_MS)).toBe(false);
  });
});

describe("isNearEnd", () => {
  it("is true at and past 95% of the duration", () => {
    const nearEnd = TRACK_MS * RESUME_NEAR_END_RATIO;
    expect(isNearEnd(nearEnd, TRACK_MS)).toBe(true);
    expect(isNearEnd(TRACK_MS, TRACK_MS)).toBe(true);
  });

  it("is false before 95%", () => {
    expect(isNearEnd(TRACK_MS * RESUME_NEAR_END_RATIO - 1, TRACK_MS)).toBe(false);
    expect(isNearEnd(0, TRACK_MS)).toBe(false);
  });

  it("is false for unknown durations", () => {
    expect(isNearEnd(60_000, 0)).toBe(false);
    expect(isNearEnd(60_000, Number.NaN)).toBe(false);
  });
});

describe("progressPercent", () => {
  it("maps position onto 0–100", () => {
    expect(progressPercent(0, TRACK_MS)).toBe(0);
    expect(progressPercent(TRACK_MS / 2, TRACK_MS)).toBe(50);
    expect(progressPercent(TRACK_MS, TRACK_MS)).toBe(100);
  });

  it("clamps out-of-range positions", () => {
    expect(progressPercent(-5_000, TRACK_MS)).toBe(0);
    expect(progressPercent(TRACK_MS * 2, TRACK_MS)).toBe(100);
  });

  it("returns 0 for unknown or bogus durations", () => {
    expect(progressPercent(60_000, 0)).toBe(0);
    expect(progressPercent(60_000, -1)).toBe(0);
    expect(progressPercent(60_000, Number.NaN)).toBe(0);
    expect(progressPercent(Number.NaN, TRACK_MS)).toBe(0);
  });
});

describe("constants", () => {
  it("keeps the save cadence aligned with the brief (~10s)", () => {
    expect(POSITION_SAVE_INTERVAL_MS).toBe(10_000);
  });

  it("keeps the near-end ratio inside (0, 1)", () => {
    expect(RESUME_NEAR_END_RATIO).toBeGreaterThan(0);
    expect(RESUME_NEAR_END_RATIO).toBeLessThan(1);
  });
});
