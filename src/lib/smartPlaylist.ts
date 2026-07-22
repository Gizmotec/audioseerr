// Plex-style smart playlists — pure rule engine. No Prisma imports: this
// module is safe for client components and vitest. The Prisma-touching data
// layer lives in src/lib/smartPlaylists.ts (plural); server actions in
// src/lib/actions/smartPlaylists.ts.
//
// A smart playlist stores a rule SET (SmartPlaylist.rulesJson) that is
// evaluated at view time against the user's library — never a frozen track
// list.
//
// Rule fields (grounded in the actual schema — read schema.prisma before
// adding any):
//   - genre    : string contains (case-insensitive). NOTE: no per-track genre
//                column exists in the schema today, so the data layer passes
//                genre: null and genre rules simply match nothing. The field
//                is fully supported here so a future metadata column only has
//                to populate the row.
//   - artist   : exact match, case-insensitive (DownloadedTrack.artistName).
//   - minPlays : integer play count (PlayHistory rows for the user), gte/lte/eq.
//   - liked    : boolean (Like row with targetType TRACK), eq only.
// releasedAfterYear / releasedBeforeYear from the original brief were DROPPED:
// no year/release-date metadata exists on any model.

export const SMART_RULE_FIELDS = ["genre", "artist", "minPlays", "liked"] as const;
export type SmartRuleField = (typeof SMART_RULE_FIELDS)[number];

export type SmartRuleOp = "eq" | "contains" | "gte" | "lte";

/** Ops the rule builder offers per field (and validateRules accepts). */
export const SMART_FIELD_OPS: Record<SmartRuleField, readonly SmartRuleOp[]> = {
  genre: ["contains"],
  artist: ["eq"],
  minPlays: ["gte", "lte", "eq"],
  liked: ["eq"],
};

export type SmartRule =
  | { field: "genre"; op: "contains"; value: string }
  | { field: "artist"; op: "eq"; value: string }
  | { field: "minPlays"; op: "gte" | "lte" | "eq"; value: number }
  | { field: "liked"; op: "eq"; value: boolean };

/** Joined per-track row the evaluator runs on. Built by the data layer. */
export type SmartPlaylistRow = {
  downloadedTrackId: string;
  recordingMbid: string | null;
  albumMbid: string;
  albumPosition: number;
  title: string;
  artistName: string;
  albumTitle: string | null;
  coverUrl: string | null;
  durationMs: number | null;
  /** Null today — schema stores no per-track genre (see header note). */
  genre: string | null;
  /** Current user's PlayHistory count for this recording. */
  plays: number;
  /** Current user has a TRACK Like for this track. */
  liked: boolean;
};

export const SMART_PLAYLIST_MAX_RULES = 20;
export const SMART_PLAYLIST_MIN_LIMIT = 1;
export const SMART_PLAYLIST_MAX_LIMIT = 500;
export const SMART_PLAYLIST_DEFAULT_LIMIT = 50;

const MAX_STRING_VALUE = 200;

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function isField(x: unknown): x is SmartRuleField {
  return (
    typeof x === "string" &&
    (SMART_RULE_FIELDS as readonly string[]).includes(x)
  );
}

/**
 * Lenient single-rule normalization: returns the rule or null when any part
 * is off (unknown field, wrong op for the field, wrong value type).
 */
function normalizeRule(raw: unknown): SmartRule | null {
  if (!isRecord(raw)) return null;
  const { field, op, value } = raw;
  if (!isField(field)) return null;
  if (typeof op !== "string" || !SMART_FIELD_OPS[field].includes(op as SmartRuleOp)) {
    return null;
  }
  switch (field) {
    case "genre":
    case "artist": {
      if (typeof value !== "string") return null;
      const v = value.trim();
      if (v.length === 0 || v.length > MAX_STRING_VALUE) return null;
      return field === "genre"
        ? { field: "genre", op: "contains", value: v }
        : { field: "artist", op: "eq", value: v };
    }
    case "minPlays": {
      if (typeof value !== "number" || !Number.isInteger(value)) return null;
      if (value < 0 || value > 1_000_000) return null;
      return { field: "minPlays", op: op as "gte" | "lte" | "eq", value };
    }
    case "liked": {
      if (typeof value !== "boolean") return null;
      return { field: "liked", op: "eq", value };
    }
  }
}

/**
 * Parse a stored rulesJson string. NEVER throws: malformed JSON, a non-array
 * payload, or individually-invalid entries all degrade gracefully — invalid
 * entries are dropped and valid ones kept; anything worse yields [].
 */
export function parseRules(json: string): SmartRule[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const rules: SmartRule[] = [];
  for (const entry of parsed) {
    const rule = normalizeRule(entry);
    if (rule) rules.push(rule);
    if (rules.length >= SMART_PLAYLIST_MAX_RULES) break;
  }
  return rules;
}

export type ValidateRulesResult =
  | { ok: true; rules: SmartRule[] }
  | { ok: false; error: string };

/**
 * Strict validation for create/update inputs. Unlike parseRules this reports
 * the first problem instead of silently dropping rules, so a user building a
 * playlist in the UI finds out their rule was rejected.
 */
export function validateRules(input: unknown): ValidateRulesResult {
  if (!Array.isArray(input)) {
    return { ok: false, error: "Rules must be an array." };
  }
  if (input.length > SMART_PLAYLIST_MAX_RULES) {
    return {
      ok: false,
      error: `Too many rules (max ${SMART_PLAYLIST_MAX_RULES}).`,
    };
  }
  const rules: SmartRule[] = [];
  for (const entry of input) {
    const rule = normalizeRule(entry);
    if (!rule) {
      return { ok: false, error: "One of the rules is invalid." };
    }
    rules.push(rule);
  }
  return { ok: true, rules };
}

/** Validate a playlist track cap from user input (default when undefined). */
export function validateLimit(input: unknown): number | null {
  if (input === undefined || input === null) return SMART_PLAYLIST_DEFAULT_LIMIT;
  if (typeof input !== "number" || !Number.isInteger(input)) return null;
  if (input < SMART_PLAYLIST_MIN_LIMIT || input > SMART_PLAYLIST_MAX_LIMIT) {
    return null;
  }
  return input;
}

function matchesRule(row: SmartPlaylistRow, rule: SmartRule): boolean {
  switch (rule.field) {
    case "genre":
      // Unknown genre never "contains" anything (same as Plex's treatment of
      // missing metadata).
      return row.genre != null &&
        row.genre.toLowerCase().includes(rule.value.toLowerCase());
    case "artist":
      return row.artistName.toLowerCase() === rule.value.toLowerCase();
    case "minPlays":
      switch (rule.op) {
        case "gte":
          return row.plays >= rule.value;
        case "lte":
          return row.plays <= rule.value;
        case "eq":
          return row.plays === rule.value;
      }
      return false;
    case "liked":
      return row.liked === rule.value;
  }
}

/**
 * Evaluate a rule set against joined library rows. Semantics:
 *   - Rules combine with AND (every rule must match).
 *   - An EMPTY rule set matches ALL rows (a filter-less smart playlist is
 *     your whole library, capped by the limit) — documented Plex behavior.
 *   - Output ordering is deterministic: plays desc, then artist asc, then
 *     title asc — so the "top" of a rule set is stable between views.
 *   - The result is sliced to `limit` (when > 0).
 */
export function evaluateSmartPlaylist(
  rows: SmartPlaylistRow[],
  rules: SmartRule[],
  limit: number,
): SmartPlaylistRow[] {
  const matched = rules.length === 0
    ? [...rows]
    : rows.filter((row) => rules.every((rule) => matchesRule(row, rule)));
  matched.sort(
    (a, b) =>
      b.plays - a.plays ||
      a.artistName.toLowerCase().localeCompare(b.artistName.toLowerCase()) ||
      a.title.toLowerCase().localeCompare(b.title.toLowerCase()),
  );
  return limit > 0 ? matched.slice(0, limit) : matched;
}

/** Short human-readable rule summary for tiles/headers ("artist is X"…). */
export function describeRule(rule: SmartRule): string {
  switch (rule.field) {
    case "genre":
      return `genre contains “${rule.value}”`;
    case "artist":
      return `artist is “${rule.value}”`;
    case "minPlays":
      switch (rule.op) {
        case "gte":
          return `plays ≥ ${rule.value}`;
        case "lte":
          return `plays ≤ ${rule.value}`;
        case "eq":
          return `plays = ${rule.value}`;
      }
      return "";
    case "liked":
      return rule.value ? "liked" : "not liked";
  }
}
