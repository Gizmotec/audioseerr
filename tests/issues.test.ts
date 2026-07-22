// Unit tests for the pure issue-reporting helpers in src/lib/issues.ts.
// The module is dependency-free (no prisma), so the suite stays hermetic.
import { describe, expect, it } from "vitest";
import {
  ISSUE_CONTEXT_FIELD_MAX,
  ISSUE_DESCRIPTION_MAX,
  ISSUE_RESOLVER_NOTE_MAX,
  ISSUE_STATUS_LABELS,
  ISSUE_STATUSES,
  ISSUE_TITLE_MAX,
  ISSUE_TYPE_LABELS,
  ISSUE_TYPES,
  isIssueStatus,
  isIssueType,
  issueStatusBadgeVariant,
  issueStatusLabel,
  issueTypeLabel,
  sanitizeContextField,
  validateIssueInput,
  validateResolverNote,
} from "@/lib/issues";

describe("issue type/status maps", () => {
  it("has a human label for every type and status", () => {
    for (const t of ISSUE_TYPES) {
      expect(ISSUE_TYPE_LABELS[t]).toBeTruthy();
      expect(ISSUE_TYPE_LABELS[t]).not.toBe(t);
    }
    for (const s of ISSUE_STATUSES) {
      expect(ISSUE_STATUS_LABELS[s]).toBeTruthy();
    }
    expect(ISSUE_TYPE_LABELS.WRONG_MATCH).toBe("Wrong match");
  });

  it("guards accept known values and reject others", () => {
    expect(isIssueType("METADATA")).toBe(true);
    expect(isIssueType("metadata")).toBe(false);
    expect(isIssueType("NOPE")).toBe(false);
    expect(isIssueStatus("OPEN")).toBe(true);
    expect(isIssueStatus("PENDING")).toBe(false);
  });

  it("label helpers fall back to the raw value for unknown enums", () => {
    expect(issueTypeLabel("PLAYBACK")).toBe("Playback");
    expect(issueTypeLabel("FUTURE_TYPE")).toBe("FUTURE_TYPE");
    expect(issueStatusLabel("CLOSED")).toBe("Closed");
    expect(issueStatusLabel("FUTURE_STATUS")).toBe("FUTURE_STATUS");
  });

  it("maps statuses onto existing Badge variants", () => {
    expect(issueStatusBadgeVariant("OPEN")).toBe("warning");
    expect(issueStatusBadgeVariant("RESOLVED")).toBe("success");
    expect(issueStatusBadgeVariant("CLOSED")).toBe("muted");
  });
});

describe("validateIssueInput", () => {
  it("accepts a well-formed report, trimming and nulling empty description", () => {
    const r = validateIssueInput({
      type: "WRONG_MATCH",
      title: "  Wrong album art  ",
      description: "   ",
    });
    expect(r).toEqual({
      ok: true,
      value: { type: "WRONG_MATCH", title: "Wrong album art", description: null },
    });
  });

  it("keeps a real description", () => {
    const r = validateIssueInput({
      type: "OTHER",
      title: "x",
      description: "  details here ",
    });
    expect(r.ok && r.value.description).toBe("details here");
  });

  it("rejects an unknown type", () => {
    const r = validateIssueInput({ type: "BROKEN", title: "x" });
    expect(r.ok).toBe(false);
  });

  it("rejects an empty or whitespace-only title", () => {
    expect(validateIssueInput({ type: "OTHER", title: "" }).ok).toBe(false);
    expect(validateIssueInput({ type: "OTHER", title: "   " }).ok).toBe(false);
  });

  it("rejects over-long title and description", () => {
    expect(
      validateIssueInput({ type: "OTHER", title: "a".repeat(ISSUE_TITLE_MAX + 1) }).ok,
    ).toBe(false);
    expect(
      validateIssueInput({
        type: "OTHER",
        title: "ok",
        description: "a".repeat(ISSUE_DESCRIPTION_MAX + 1),
      }).ok,
    ).toBe(false);
    expect(
      validateIssueInput({ type: "OTHER", title: "a".repeat(ISSUE_TITLE_MAX) }).ok,
    ).toBe(true);
  });
});

describe("validateResolverNote", () => {
  it("treats missing/blank notes as null", () => {
    expect(validateResolverNote(undefined)).toEqual({ ok: true, note: null });
    expect(validateResolverNote(null)).toEqual({ ok: true, note: null });
    expect(validateResolverNote("   ")).toEqual({ ok: true, note: null });
  });

  it("trims real notes and rejects over-long ones", () => {
    expect(validateResolverNote("  fixed  ")).toEqual({ ok: true, note: "fixed" });
    expect(validateResolverNote("a".repeat(ISSUE_RESOLVER_NOTE_MAX + 1)).ok).toBe(false);
  });
});

describe("sanitizeContextField", () => {
  it("trims, caps, and nulls empties", () => {
    expect(sanitizeContextField("  Radiohead ")).toBe("Radiohead");
    expect(sanitizeContextField("")).toBeNull();
    expect(sanitizeContextField("   ")).toBeNull();
    expect(sanitizeContextField(null)).toBeNull();
    expect(sanitizeContextField(undefined)).toBeNull();
    const long = "a".repeat(ISSUE_CONTEXT_FIELD_MAX + 50);
    expect(sanitizeContextField(long)).toHaveLength(ISSUE_CONTEXT_FIELD_MAX);
  });

  it("honours a custom cap", () => {
    expect(sanitizeContextField("x".repeat(100), 64)).toHaveLength(64);
  });
});
