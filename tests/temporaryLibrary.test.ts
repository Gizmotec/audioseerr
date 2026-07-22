import { describe, expect, it } from "vitest";
import {
  formatTemporaryExpiryCaption,
  parseLibraryTab,
} from "@/lib/temporaryLibrary";

describe("parseLibraryTab", () => {
  it("selects the temporary tab only for its allowlisted value", () => {
    expect(parseLibraryTab("temporary")).toBe("temporary");
    expect(parseLibraryTab(undefined)).toBe("library");
    expect(parseLibraryTab("anything-else")).toBe("library");
    expect(parseLibraryTab(["temporary", "library"])).toBe("library");
  });
});

describe("formatTemporaryExpiryCaption", () => {
  const now = new Date("2026-07-22T12:00:00.000Z");

  it("shows the exact future expiry with an unambiguous timezone", () => {
    expect(
      formatTemporaryExpiryCaption(
        new Date("2026-07-24T04:05:00.000Z"),
        now,
        "UTC",
      ),
    ).toBe("Expires 24 Jul, 04:05 UTC");
  });

  it("marks an expiry that has already passed", () => {
    expect(
      formatTemporaryExpiryCaption(
        new Date("2026-07-21T04:05:00.000Z"),
        now,
        "UTC",
      ),
    ).toBe("Expired 21 Jul, 04:05 UTC");
  });

  it("handles missing or invalid expiry data safely", () => {
    expect(formatTemporaryExpiryCaption(null, now, "UTC")).toBe(
      "Expiry unavailable",
    );
    expect(
      formatTemporaryExpiryCaption(new Date(Number.NaN), now, "UTC"),
    ).toBe("Expiry unavailable");
  });
});
