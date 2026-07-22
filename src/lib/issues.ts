// Pure helpers for the Overseerr-style issue-reporting feature: enum value
// lists, human labels, input validation, and status → Badge-variant mapping.
//
// Deliberately free of prisma/@prisma/client imports (same split as
// src/lib/export.ts): the string literals mirror the IssueType/IssueStatus
// prisma enums, so Prisma rows satisfy these types structurally, vitest stays
// hermetic, and client components can import this without dragging
// better-sqlite3 into the browser bundle.

export const ISSUE_TYPES = [
  "WRONG_MATCH",
  "METADATA",
  "PLAYBACK",
  "OTHER",
] as const;
export type IssueTypeValue = (typeof ISSUE_TYPES)[number];

export const ISSUE_STATUSES = ["OPEN", "RESOLVED", "CLOSED"] as const;
export type IssueStatusValue = (typeof ISSUE_STATUSES)[number];

/** Human labels shown over the raw enum everywhere in the UI. */
export const ISSUE_TYPE_LABELS: Record<IssueTypeValue, string> = {
  WRONG_MATCH: "Wrong match",
  METADATA: "Metadata",
  PLAYBACK: "Playback",
  OTHER: "Other",
};

export const ISSUE_STATUS_LABELS: Record<IssueStatusValue, string> = {
  OPEN: "Open",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

export function isIssueType(value: string): value is IssueTypeValue {
  return (ISSUE_TYPES as readonly string[]).includes(value);
}

export function isIssueStatus(value: string): value is IssueStatusValue {
  return (ISSUE_STATUSES as readonly string[]).includes(value);
}

/** Label with graceful fallback for enum values added after this map. */
export function issueTypeLabel(type: string): string {
  return isIssueType(type) ? ISSUE_TYPE_LABELS[type] : type;
}

export function issueStatusLabel(status: string): string {
  return isIssueStatus(status) ? ISSUE_STATUS_LABELS[status] : status;
}

type BadgeVariant = "warning" | "success" | "muted";

/** Reuses the ui Badge variants: OPEN=warning, RESOLVED=success, CLOSED=muted. */
export function issueStatusBadgeVariant(status: IssueStatusValue): BadgeVariant {
  switch (status) {
    case "OPEN":
      return "warning";
    case "RESOLVED":
      return "success";
    case "CLOSED":
      return "muted";
  }
}

export const ISSUE_TITLE_MAX = 120;
export const ISSUE_DESCRIPTION_MAX = 2000;
export const ISSUE_RESOLVER_NOTE_MAX = 500;
/** Caps for the page-supplied display context (artist/album/track strings). */
export const ISSUE_CONTEXT_FIELD_MAX = 200;

export type ValidatedIssueInput = {
  type: IssueTypeValue;
  title: string;
  description: string | null;
};

export function validateIssueInput(input: {
  type: string;
  title: string;
  description?: string | null;
}): { ok: true; value: ValidatedIssueInput } | { ok: false; error: string } {
  if (!isIssueType(input.type)) {
    return { ok: false, error: "Please pick a problem type." };
  }
  const title = input.title.trim();
  if (title.length === 0) {
    return { ok: false, error: "Please give the report a title." };
  }
  if (title.length > ISSUE_TITLE_MAX) {
    return {
      ok: false,
      error: `Title must be ${ISSUE_TITLE_MAX} characters or fewer.`,
    };
  }
  const description = (input.description ?? "").trim();
  if (description.length > ISSUE_DESCRIPTION_MAX) {
    return {
      ok: false,
      error: `Description must be ${ISSUE_DESCRIPTION_MAX} characters or fewer.`,
    };
  }
  return {
    ok: true,
    value: {
      type: input.type,
      title,
      description: description.length > 0 ? description : null,
    },
  };
}

export function validateResolverNote(
  note: string | null | undefined,
): { ok: true; note: string | null } | { ok: false; error: string } {
  const trimmed = (note ?? "").trim();
  if (trimmed.length > ISSUE_RESOLVER_NOTE_MAX) {
    return {
      ok: false,
      error: `Note must be ${ISSUE_RESOLVER_NOTE_MAX} characters or fewer.`,
    };
  }
  return { ok: true, note: trimmed.length > 0 ? trimmed : null };
}

/**
 * The report context (artist/album/track strings) arrives from the client —
 * it originates from the MusicBrainz data the page rendered, but it is still
 * user-editable in flight, so treat it strictly as display text: trim, cap
 * the length, and never use it as a lookup key into other systems.
 */
export function sanitizeContextField(
  value: string | null | undefined,
  max: number = ISSUE_CONTEXT_FIELD_MAX,
): string | null {
  const trimmed = (value ?? "").trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, max);
}
