import { describe, expect, it } from "vitest";
import {
  evaluateSmartPlaylist,
  parseRules,
  validateLimit,
  validateRules,
  SMART_PLAYLIST_DEFAULT_LIMIT,
  SMART_PLAYLIST_MAX_RULES,
  type SmartPlaylistRow,
  type SmartRule,
} from "@/lib/smartPlaylist";

function row(overrides: Partial<SmartPlaylistRow> = {}): SmartPlaylistRow {
  return {
    downloadedTrackId: "dt-1",
    recordingMbid: "rec-1",
    albumMbid: "alb-1",
    albumPosition: 1,
    title: "Song",
    artistName: "Artist",
    albumTitle: "Album",
    coverUrl: null,
    durationMs: null,
    genre: null,
    plays: 0,
    liked: false,
    ...overrides,
  };
}

describe("parseRules", () => {
  it("returns [] for malformed JSON and never throws", () => {
    expect(parseRules("")).toEqual([]);
    expect(parseRules("{not json")).toEqual([]);
    expect(parseRules("[{\"field\":\"artist\",")).toEqual([]);
  });

  it("returns [] for non-array payloads", () => {
    expect(parseRules("null")).toEqual([]);
    expect(parseRules("{}")).toEqual([]);
    expect(parseRules("\"artist\"")).toEqual([]);
    expect(parseRules("42")).toEqual([]);
  });

  it("parses a valid rule set", () => {
    const json = JSON.stringify([
      { field: "artist", op: "eq", value: "Radiohead" },
      { field: "minPlays", op: "gte", value: 3 },
      { field: "liked", op: "eq", value: true },
      { field: "genre", op: "contains", value: "rock" },
    ]);
    expect(parseRules(json)).toEqual([
      { field: "artist", op: "eq", value: "Radiohead" },
      { field: "minPlays", op: "gte", value: 3 },
      { field: "liked", op: "eq", value: true },
      { field: "genre", op: "contains", value: "rock" },
    ]);
  });

  it("drops rules with unknown fields but keeps valid ones", () => {
    const json = JSON.stringify([
      { field: "releasedAfterYear", op: "gte", value: 2000 },
      { field: "artist", op: "eq", value: "Björk" },
      { field: "title", op: "contains", value: "x" },
    ]);
    expect(parseRules(json)).toEqual([
      { field: "artist", op: "eq", value: "Björk" },
    ]);
  });

  it("drops rules with an op that doesn't fit the field", () => {
    const json = JSON.stringify([
      { field: "artist", op: "contains", value: "Rad" }, // artist only allows eq
      { field: "liked", op: "gte", value: true }, // liked only allows eq
      { field: "genre", op: "eq", value: "rock" }, // genre only allows contains
      { field: "minPlays", op: "gte", value: 5 }, // valid
    ]);
    expect(parseRules(json)).toEqual([
      { field: "minPlays", op: "gte", value: 5 },
    ]);
  });

  it("drops rules with wrongly-typed or out-of-range values", () => {
    const json = JSON.stringify([
      { field: "artist", op: "eq", value: 42 },
      { field: "artist", op: "eq", value: "   " },
      { field: "minPlays", op: "gte", value: "5" },
      { field: "minPlays", op: "gte", value: 2.5 },
      { field: "minPlays", op: "gte", value: -1 },
      { field: "liked", op: "eq", value: "true" },
      null,
      "garbage",
      { field: "liked", op: "eq", value: false }, // valid
    ]);
    expect(parseRules(json)).toEqual([
      { field: "liked", op: "eq", value: false },
    ]);
  });

  it("trims string values", () => {
    const json = JSON.stringify([
      { field: "artist", op: "eq", value: "  Portishead  " },
    ]);
    expect(parseRules(json)).toEqual([
      { field: "artist", op: "eq", value: "Portishead" },
    ]);
  });
});

describe("validateRules", () => {
  it("rejects non-array input", () => {
    expect(validateRules(null).ok).toBe(false);
    expect(validateRules("artist").ok).toBe(false);
    expect(validateRules({}).ok).toBe(false);
  });

  it("rejects a set containing any invalid rule (strict, unlike parseRules)", () => {
    const result = validateRules([
      { field: "artist", op: "eq", value: "Radiohead" },
      { field: "unknownField", op: "eq", value: "x" },
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects rule sets over the max size", () => {
    const tooMany = Array.from({ length: SMART_PLAYLIST_MAX_RULES + 1 }, () => ({
      field: "liked",
      op: "eq",
      value: true,
    }));
    expect(validateRules(tooMany).ok).toBe(false);
  });

  it("accepts and normalizes a valid set (trims strings)", () => {
    const result = validateRules([
      { field: "genre", op: "contains", value: "  indie " },
      { field: "minPlays", op: "lte", value: 10 },
    ]);
    expect(result).toEqual({
      ok: true,
      rules: [
        { field: "genre", op: "contains", value: "indie" },
        { field: "minPlays", op: "lte", value: 10 },
      ],
    });
  });

  it("accepts an empty rule set", () => {
    expect(validateRules([])).toEqual({ ok: true, rules: [] });
  });
});

describe("validateLimit", () => {
  it("defaults when undefined/null", () => {
    expect(validateLimit(undefined)).toBe(SMART_PLAYLIST_DEFAULT_LIMIT);
    expect(validateLimit(null)).toBe(SMART_PLAYLIST_DEFAULT_LIMIT);
  });

  it("rejects non-integers and out-of-range values", () => {
    expect(validateLimit("50")).toBeNull();
    expect(validateLimit(2.5)).toBeNull();
    expect(validateLimit(0)).toBeNull();
    expect(validateLimit(501)).toBeNull();
    expect(validateLimit(50)).toBe(50);
  });
});

describe("evaluateSmartPlaylist", () => {
  const library: SmartPlaylistRow[] = [
    row({
      downloadedTrackId: "a",
      title: "Everything In Its Right Place",
      artistName: "Radiohead",
      genre: "Alternative Rock",
      plays: 12,
      liked: true,
    }),
    row({
      downloadedTrackId: "b",
      title: "Pyramid Song",
      artistName: "radiohead", // case differs on purpose
      genre: "art rock",
      plays: 3,
      liked: false,
    }),
    row({
      downloadedTrackId: "c",
      title: "Hyperballad",
      artistName: "Björk",
      genre: null, // no genre metadata
      plays: 12,
      liked: true,
    }),
    row({
      downloadedTrackId: "d",
      title: "Teardrop",
      artistName: "Massive Attack",
      genre: "Trip-hop",
      plays: 0,
      liked: false,
    }),
  ];

  it("artist: exact match, case-insensitive", () => {
    const rules: SmartRule[] = [{ field: "artist", op: "eq", value: "RADIOHEAD" }];
    const out = evaluateSmartPlaylist(library, rules, 50);
    expect(out.map((r) => r.downloadedTrackId).sort()).toEqual(["a", "b"]);
  });

  it("genre: substring match, case-insensitive; null genre never matches", () => {
    const rules: SmartRule[] = [{ field: "genre", op: "contains", value: "ROCK" }];
    const out = evaluateSmartPlaylist(library, rules, 50);
    expect(out.map((r) => r.downloadedTrackId).sort()).toEqual(["a", "b"]);
  });

  it("minPlays: gte / lte / eq", () => {
    const gte = evaluateSmartPlaylist(
      library,
      [{ field: "minPlays", op: "gte", value: 12 }],
      50,
    );
    expect(gte.map((r) => r.downloadedTrackId).sort()).toEqual(["a", "c"]);

    const lte = evaluateSmartPlaylist(
      library,
      [{ field: "minPlays", op: "lte", value: 3 }],
      50,
    );
    expect(lte.map((r) => r.downloadedTrackId).sort()).toEqual(["b", "d"]);

    const eq = evaluateSmartPlaylist(
      library,
      [{ field: "minPlays", op: "eq", value: 0 }],
      50,
    );
    expect(eq.map((r) => r.downloadedTrackId)).toEqual(["d"]);
  });

  it("liked: boolean eq, both directions", () => {
    const liked = evaluateSmartPlaylist(
      library,
      [{ field: "liked", op: "eq", value: true }],
      50,
    );
    expect(liked.map((r) => r.downloadedTrackId).sort()).toEqual(["a", "c"]);

    const notLiked = evaluateSmartPlaylist(
      library,
      [{ field: "liked", op: "eq", value: false }],
      50,
    );
    expect(notLiked.map((r) => r.downloadedTrackId).sort()).toEqual(["b", "d"]);
  });

  it("combines rules with AND semantics", () => {
    const rules: SmartRule[] = [
      { field: "artist", op: "eq", value: "Radiohead" },
      { field: "minPlays", op: "gte", value: 10 },
      { field: "liked", op: "eq", value: true },
    ];
    const out = evaluateSmartPlaylist(library, rules, 50);
    expect(out.map((r) => r.downloadedTrackId)).toEqual(["a"]);
  });

  it("empty rule set matches ALL rows (documented whole-library behavior)", () => {
    const out = evaluateSmartPlaylist(library, [], 50);
    expect(out).toHaveLength(library.length);
  });

  it("slices to the limit", () => {
    const out = evaluateSmartPlaylist(library, [], 2);
    expect(out).toHaveLength(2);
  });

  it("orders deterministically: plays desc, then artist, then title", () => {
    const out = evaluateSmartPlaylist(library, [], 50);
    // a and c both have 12 plays; "Björk" sorts before "Radiohead".
    expect(out.map((r) => r.downloadedTrackId)).toEqual(["c", "a", "b", "d"]);
  });

  it("does not mutate the input rows array", () => {
    const input = [...library];
    evaluateSmartPlaylist(input, [], 50);
    expect(input.map((r) => r.downloadedTrackId)).toEqual(["a", "b", "c", "d"]);
  });
});
