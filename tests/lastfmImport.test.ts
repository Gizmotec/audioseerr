import { describe, expect, it } from "vitest";
import {
  filterExistingRows,
  lastFmTrackKey,
  mapRecentTracksToRows,
  rowKey,
  type RecentTrackLike,
} from "@/lib/lastfmImport";

const REAL_MBID = "b4c6a5f0-1234-4abc-9def-0123456789ab";

function track(overrides: Partial<RecentTrackLike> = {}): RecentTrackLike {
  return {
    name: "Track Title",
    artistName: "The Artist",
    albumTitle: "The Album",
    mbid: null,
    playedAt: new Date("2026-07-20T10:00:00Z"),
    durationMs: null,
    ...overrides,
  };
}

describe("lastFmTrackKey", () => {
  it("uses the real recording MBID when present", () => {
    expect(lastFmTrackKey("A", "T", REAL_MBID)).toBe(REAL_MBID);
  });

  it("builds a deterministic normalized pseudo-id without an MBID", () => {
    expect(lastFmTrackKey("The  Artist", "Track Title", null)).toBe(
      "lastfm:the artist:track title",
    );
    expect(lastFmTrackKey("  THE ARTIST ", "TRACK TITLE", null)).toBe(
      "lastfm:the artist:track title",
    );
  });

  it("rejects malformed mbids into the pseudo-id path", () => {
    expect(lastFmTrackKey("A", "T", "not-an-mbid")).toBe("lastfm:a:t");
  });
});

describe("mapRecentTracksToRows", () => {
  it("maps a full scrobble to a PlayHistory row", () => {
    const playedAt = new Date("2026-07-20T10:00:00Z");
    const rows = mapRecentTracksToRows([
      track({ mbid: REAL_MBID, durationMs: 245_000, playedAt }),
    ]);
    expect(rows).toEqual([
      {
        recordingMbid: REAL_MBID,
        artistName: "The Artist",
        title: "Track Title",
        playedMs: 245_000,
        durationMs: 245_000,
        playedAt,
      },
    ]);
  });

  it("playedMs falls back to 0 when duration is absent", () => {
    const rows = mapRecentTracksToRows([track({ durationMs: null })]);
    expect(rows[0]!.playedMs).toBe(0);
    expect(rows[0]!.durationMs).toBeNull();
  });

  it("drops the now-playing row (no timestamp yet)", () => {
    expect(mapRecentTracksToRows([track({ playedAt: null })])).toEqual([]);
  });

  it("drops rows with blank artist or title", () => {
    expect(
      mapRecentTracksToRows([
        track({ artistName: "  " }),
        track({ name: "" }),
      ]),
    ).toEqual([]);
  });

  it("collapses in-batch duplicates (page-boundary overlap)", () => {
    const dupe = track({ mbid: REAL_MBID });
    const rows = mapRecentTracksToRows([dupe, dupe, track()]);
    expect(rows).toHaveLength(2);
  });

  it("keeps distinct plays of the same track at different times", () => {
    const rows = mapRecentTracksToRows([
      track({ playedAt: new Date("2026-07-20T10:00:00Z") }),
      track({ playedAt: new Date("2026-07-20T11:00:00Z") }),
    ]);
    expect(rows).toHaveLength(2);
  });

  it("ignores the album title (PlayHistory has no column for it)", () => {
    const rows = mapRecentTracksToRows([track({ albumTitle: "The Album" })]);
    expect(rows[0]).not.toHaveProperty("albumTitle");
  });
});

describe("filterExistingRows", () => {
  it("splits fresh rows from already-known ones", () => {
    const [a, b, c] = mapRecentTracksToRows([
      track({ mbid: REAL_MBID, playedAt: new Date("2026-07-20T10:00:00Z") }),
      track({ playedAt: new Date("2026-07-20T11:00:00Z") }),
      track({ playedAt: new Date("2026-07-20T12:00:00Z") }),
    ]);
    const existing = new Set([
      rowKey(a!.recordingMbid, a!.playedAt),
      rowKey(c!.recordingMbid, c!.playedAt),
    ]);
    const { fresh, skipped } = filterExistingRows([a!, b!, c!], existing);
    expect(fresh).toEqual([b]);
    expect(skipped).toBe(2);
  });

  it("returns everything when nothing is known", () => {
    const rows = mapRecentTracksToRows([track()]);
    const { fresh, skipped } = filterExistingRows(rows, new Set());
    expect(fresh).toHaveLength(1);
    expect(skipped).toBe(0);
  });
});
