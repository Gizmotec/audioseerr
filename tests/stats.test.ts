import { describe, expect, it } from "vitest";
import {
  longestStreak,
  playsByDay,
  topAlbums,
  topArtists,
  topTracks,
  totalMinutes,
  totalPlays,
  uniqueArtists,
  type PlayRow,
} from "@/lib/stats";

function row(overrides: Partial<PlayRow> = {}): PlayRow {
  return {
    recordingMbid: "rec-1",
    albumMbid: "alb-1",
    artistName: "Artist A",
    title: "Track One",
    durationMs: 180_000,
    playedMs: 180_000,
    playedAt: new Date(Date.UTC(2026, 0, 15, 12)),
    ...overrides,
  };
}

describe("totals", () => {
  it("counts plays and sums unique artists", () => {
    const rows = [
      row({ artistName: "A" }),
      row({ artistName: "B", recordingMbid: "rec-2" }),
      row({ artistName: "A", recordingMbid: "rec-3" }),
    ];
    expect(totalPlays(rows)).toBe(3);
    expect(uniqueArtists(rows)).toBe(2);
  });

  it("sums playedMs into whole minutes", () => {
    const rows = [
      row({ playedMs: 60_000 }),
      row({ playedMs: 90_000 }),
      row({ playedMs: 30_000 }),
    ];
    expect(totalMinutes(rows)).toBe(3);
  });

  it("ignores negative playedMs instead of subtracting time", () => {
    expect(totalMinutes([row({ playedMs: -5_000 }), row({ playedMs: 60_000 })])).toBe(1);
  });

  it("handles empty input", () => {
    expect(totalPlays([])).toBe(0);
    expect(totalMinutes([])).toBe(0);
    expect(uniqueArtists([])).toBe(0);
  });
});

describe("topArtists", () => {
  it("ranks by play count descending", () => {
    const rows = [
      row({ artistName: "Beta" }),
      row({ artistName: "Alpha", recordingMbid: "rec-2" }),
      row({ artistName: "Alpha", recordingMbid: "rec-3" }),
      row({ artistName: "Beta", recordingMbid: "rec-4" }),
      row({ artistName: "Alpha", recordingMbid: "rec-5" }),
    ];
    expect(topArtists(rows, 10)).toEqual([
      { name: "Alpha", plays: 3 },
      { name: "Beta", plays: 2 },
    ]);
  });

  it("keeps first-seen order on ties (stable)", () => {
    const rows = [
      row({ artistName: "Gamma" }),
      row({ artistName: "Alpha", recordingMbid: "rec-2" }),
      row({ artistName: "Beta", recordingMbid: "rec-3" }),
    ];
    expect(topArtists(rows, 10).map((a) => a.name)).toEqual([
      "Gamma",
      "Alpha",
      "Beta",
    ]);
  });

  it("respects n", () => {
    const rows = [
      row({ artistName: "A" }),
      row({ artistName: "B", recordingMbid: "rec-2" }),
      row({ artistName: "C", recordingMbid: "rec-3" }),
    ];
    expect(topArtists(rows, 2)).toHaveLength(2);
    expect(topArtists(rows, 0)).toEqual([]);
  });

  it("handles empty input", () => {
    expect(topArtists([], 10)).toEqual([]);
  });
});

describe("topTracks", () => {
  it("groups by recordingMbid and keeps representative metadata", () => {
    const rows = [
      row({ recordingMbid: "rec-1", title: "One", artistName: "A" }),
      row({ recordingMbid: "rec-2", title: "Two", artistName: "B" }),
      row({ recordingMbid: "rec-1", title: "One", artistName: "A" }),
    ];
    expect(topTracks(rows, 10)).toEqual([
      { recordingMbid: "rec-1", title: "One", artistName: "A", plays: 2 },
      { recordingMbid: "rec-2", title: "Two", artistName: "B", plays: 1 },
    ]);
  });

  it("keeps first-seen order on ties (stable)", () => {
    const rows = [
      row({ recordingMbid: "rec-c" }),
      row({ recordingMbid: "rec-a" }),
      row({ recordingMbid: "rec-b" }),
    ];
    expect(topTracks(rows, 10).map((t) => t.recordingMbid)).toEqual([
      "rec-c",
      "rec-a",
      "rec-b",
    ]);
  });

  it("handles empty input", () => {
    expect(topTracks([], 5)).toEqual([]);
  });
});

describe("topAlbums", () => {
  it("ranks albums and skips rows without an albumMbid", () => {
    const rows = [
      row({ albumMbid: "alb-1" }),
      row({ albumMbid: null, recordingMbid: "rec-2" }),
      row({ albumMbid: "alb-2", artistName: "B", recordingMbid: "rec-3" }),
      row({ albumMbid: "alb-2", artistName: "B", recordingMbid: "rec-4" }),
    ];
    expect(topAlbums(rows, 10)).toEqual([
      { albumMbid: "alb-2", artistName: "B", plays: 2 },
      { albumMbid: "alb-1", artistName: "Artist A", plays: 1 },
    ]);
  });

  it("treats empty-string albumMbid as absent", () => {
    expect(topAlbums([row({ albumMbid: "" })], 10)).toEqual([]);
  });

  it("handles empty input", () => {
    expect(topAlbums([], 5)).toEqual([]);
  });
});

describe("playsByDay", () => {
  const now = new Date(Date.UTC(2026, 6, 22, 15, 30)); // Wed Jul 22 2026 UTC

  it("returns the requested number of consecutive UTC days, oldest first", () => {
    const days = playsByDay([], 14, now);
    expect(days).toHaveLength(14);
    expect(days[0]).toEqual({ date: "2026-07-09", plays: 0 });
    expect(days[13]).toEqual({ date: "2026-07-22", plays: 0 });
    // Every step is exactly one calendar day — no gaps or duplicates.
    for (let i = 1; i < days.length; i++) {
      const prev = Date.parse(days[i - 1].date + "T00:00:00.000Z");
      const cur = Date.parse(days[i].date + "T00:00:00.000Z");
      expect(cur - prev).toBe(86_400_000);
    }
  });

  it("buckets plays into their UTC day", () => {
    const rows = [
      row({ playedAt: new Date(Date.UTC(2026, 6, 22, 0, 30)) }),
      row({ playedAt: new Date(Date.UTC(2026, 6, 22, 23, 30)) }),
      row({ playedAt: new Date(Date.UTC(2026, 6, 21, 12)) }),
    ];
    const days = playsByDay(rows, 3, now);
    expect(days).toEqual([
      { date: "2026-07-20", plays: 0 },
      { date: "2026-07-21", plays: 1 },
      { date: "2026-07-22", plays: 2 },
    ]);
  });

  it("is DST-safe: UTC bucketing never merges or splits days across a DST jump", () => {
    // EU DST ends 2024-10-27 (local days are 25h); US DST started 2024-03-10
    // (local 23h). UTC day keys must stay exactly 24h apart regardless.
    const dstNow = new Date(Date.UTC(2024, 9, 28, 12)); // Oct 28 2024 UTC
    const rows = [
      row({ playedAt: new Date(Date.UTC(2024, 9, 26, 23, 30)) }),
      row({ playedAt: new Date(Date.UTC(2024, 9, 27, 1, 30)) }),
    ];
    const days = playsByDay(rows, 4, dstNow);
    expect(days).toEqual([
      { date: "2024-10-25", plays: 0 },
      { date: "2024-10-26", plays: 1 },
      { date: "2024-10-27", plays: 1 },
      { date: "2024-10-28", plays: 0 },
    ]);
  });

  it("ignores plays outside the window", () => {
    const rows = [row({ playedAt: new Date(Date.UTC(2026, 0, 1)) })];
    expect(playsByDay(rows, 14, now).every((d) => d.plays === 0)).toBe(true);
  });

  it("returns [] for a non-positive window", () => {
    expect(playsByDay([row()], 0, now)).toEqual([]);
  });
});

describe("longestStreak", () => {
  it("finds the longest consecutive run of days with plays", () => {
    expect(
      longestStreak([
        { date: "2026-07-01", plays: 2 },
        { date: "2026-07-02", plays: 1 },
        { date: "2026-07-03", plays: 0 },
        { date: "2026-07-04", plays: 1 },
        { date: "2026-07-05", plays: 3 },
        { date: "2026-07-06", plays: 1 },
      ]),
    ).toBe(3);
  });

  it("counts streaks across month and year boundaries", () => {
    expect(
      longestStreak([
        { date: "2025-12-30", plays: 1 },
        { date: "2025-12-31", plays: 1 },
        { date: "2026-01-01", plays: 1 },
        { date: "2026-01-02", plays: 1 },
      ]),
    ).toBe(4);
    // 31-day month boundary.
    expect(
      longestStreak([
        { date: "2026-01-31", plays: 1 },
        { date: "2026-02-01", plays: 1 },
      ]),
    ).toBe(2);
  });

  it("treats calendar gaps as streak breaks even without zero-play rows", () => {
    expect(
      longestStreak([
        { date: "2026-07-01", plays: 5 },
        { date: "2026-07-03", plays: 5 },
      ]),
    ).toBe(1);
  });

  it("handles unsorted input", () => {
    expect(
      longestStreak([
        { date: "2026-07-03", plays: 1 },
        { date: "2026-07-01", plays: 1 },
        { date: "2026-07-02", plays: 1 },
      ]),
    ).toBe(3);
  });

  it("handles empty and all-zero input", () => {
    expect(longestStreak([])).toBe(0);
    expect(longestStreak([{ date: "2026-07-01", plays: 0 }])).toBe(0);
  });
});
