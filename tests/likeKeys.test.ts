import { describe, expect, it } from "vitest";
import { trackLikeTargetId } from "@/lib/likeKeys";

describe("trackLikeTargetId", () => {
  it("prefers the recording MBID when present", () => {
    expect(trackLikeTargetId("rec-1", "alb-1", 3)).toBe("rec-1");
  });

  it("ignores album data entirely when a recording MBID exists", () => {
    expect(trackLikeTargetId("rec-1", null, null)).toBe("rec-1");
    expect(trackLikeTargetId("rec-1", undefined, undefined)).toBe("rec-1");
  });

  it("falls back to albumMbid:position without a recording MBID", () => {
    expect(trackLikeTargetId(null, "alb-1", 7)).toBe("alb-1:7");
    expect(trackLikeTargetId(undefined, "alb-1", 7)).toBe("alb-1:7");
  });

  it("treats position 0 as valid (null check, not truthiness)", () => {
    expect(trackLikeTargetId(null, "alb-1", 0)).toBe("alb-1:0");
  });

  it("treats an empty-string recording MBID as absent", () => {
    // Empty string is falsy, so it falls through to the album fallback —
    // important because sparse metadata can hand back "" instead of null.
    expect(trackLikeTargetId("", "alb-1", 2)).toBe("alb-1:2");
    expect(trackLikeTargetId("", null, null)).toBeNull();
  });

  it("returns null when the album MBID is missing", () => {
    expect(trackLikeTargetId(null, null, 5)).toBeNull();
    expect(trackLikeTargetId(null, undefined, 5)).toBeNull();
    expect(trackLikeTargetId(null, "", 5)).toBeNull();
  });

  it("returns null when the position is missing", () => {
    expect(trackLikeTargetId(null, "alb-1", null)).toBeNull();
    expect(trackLikeTargetId(null, "alb-1", undefined)).toBeNull();
  });

  it("returns null when everything is missing", () => {
    expect(trackLikeTargetId(null, null, null)).toBeNull();
    expect(trackLikeTargetId(undefined, undefined, undefined)).toBeNull();
  });
});
