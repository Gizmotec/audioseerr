import { describe, expect, it } from "vitest";
import { isVersionNewer } from "@/lib/version";

describe("isVersionNewer", () => {
  it("detects patch, minor, and major bumps", () => {
    expect(isVersionNewer("0.1.1", "0.1.0")).toBe(true);
    expect(isVersionNewer("0.2.0", "0.1.9")).toBe(true);
    expect(isVersionNewer("1.0.0", "0.9.9")).toBe(true);
  });

  it("returns false for older or equal versions", () => {
    expect(isVersionNewer("0.1.0", "0.1.1")).toBe(false);
    expect(isVersionNewer("0.1.0", "0.2.0")).toBe(false);
    expect(isVersionNewer("1.2.3", "1.2.3")).toBe(false);
  });

  it("accepts an optional leading v", () => {
    expect(isVersionNewer("v0.2.0", "0.1.0")).toBe(true);
    expect(isVersionNewer("v1.0.0", "1.0.0")).toBe(false);
    expect(isVersionNewer("0.2.0", "v0.1.0")).toBe(true);
  });

  it("ignores build metadata", () => {
    expect(isVersionNewer("1.0.1+build.5", "1.0.0")).toBe(true);
    expect(isVersionNewer("1.0.0+build.1", "1.0.0+build.2")).toBe(false);
  });

  it("orders a release above its prereleases", () => {
    expect(isVersionNewer("1.0.0", "1.0.0-beta")).toBe(true);
    expect(isVersionNewer("1.0.0-beta", "1.0.0")).toBe(false);
  });

  it("orders prereleases per semver rules", () => {
    // alpha < beta
    expect(isVersionNewer("1.0.0-beta", "1.0.0-alpha")).toBe(true);
    // numeric identifiers compare numerically
    expect(isVersionNewer("1.0.0-alpha.2", "1.0.0-alpha.1")).toBe(true);
    expect(isVersionNewer("1.0.0-alpha.10", "1.0.0-alpha.9")).toBe(true);
    // numeric identifiers sort before alphanumeric ones
    expect(isVersionNewer("1.0.0-alpha", "1.0.0-1")).toBe(true);
    // more identifiers win when the shared prefix is equal
    expect(isVersionNewer("1.0.0-alpha.1", "1.0.0-alpha")).toBe(true);
  });

  it("treats malformed versions as never newer", () => {
    expect(isVersionNewer("not-a-version", "1.0.0")).toBe(false);
    expect(isVersionNewer("1.0.0", "not-a-version")).toBe(false);
    expect(isVersionNewer("", "")).toBe(false);
    expect(isVersionNewer("1.2", "1.1.9")).toBe(false); // two-part version unparsable
    expect(isVersionNewer("1.2.3.4", "1.2.3")).toBe(false);
  });

  it("handles surrounding whitespace", () => {
    expect(isVersionNewer("  0.2.0  ", "0.1.0")).toBe(true);
  });
});
