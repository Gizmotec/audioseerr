import { describe, expect, it } from "vitest";
import {
  buildPlexAuthUrl,
  mapPlexPin,
  mapPlexUser,
  resolvePlexEnabled,
} from "@/lib/plex";

describe("mapPlexPin", () => {
  it("maps a fresh PIN (no authToken yet)", () => {
    expect(
      mapPlexPin({
        id: 123456,
        code: "abcd",
        product: "Audioseerr",
        authToken: null,
        expiresAt: "2026-07-22T12:00:00Z",
      }),
    ).toEqual({
      id: 123456,
      code: "abcd",
      authToken: null,
      expiresAt: "2026-07-22T12:00:00Z",
    });
  });

  it("maps an authorized PIN (authToken present)", () => {
    const pin = mapPlexPin({ id: 42, code: "wxyz", authToken: "tok-123" });
    expect(pin?.authToken).toBe("tok-123");
    expect(pin?.expiresAt).toBeNull();
  });

  it("treats an empty-string authToken as absent", () => {
    expect(mapPlexPin({ id: 1, code: "c", authToken: "" })?.authToken).toBeNull();
  });

  it("rejects malformed responses", () => {
    expect(mapPlexPin(null)).toBeNull();
    expect(mapPlexPin(undefined)).toBeNull();
    expect(mapPlexPin("pin")).toBeNull();
    expect(mapPlexPin({})).toBeNull();
    expect(mapPlexPin({ id: "123", code: "abcd" })).toBeNull(); // id must be numeric
    expect(mapPlexPin({ id: 123 })).toBeNull(); // code required
    expect(mapPlexPin({ id: 123, code: "" })).toBeNull();
    expect(mapPlexPin({ id: Number.NaN, code: "abcd" })).toBeNull();
  });
});

describe("mapPlexUser", () => {
  it("extracts email and username", () => {
    expect(
      mapPlexUser({ id: 7, uuid: "abc", email: "alex@example.com", username: "alex" }),
    ).toEqual({ email: "alex@example.com", username: "alex" });
  });

  it("falls back through friendlyName then title for the username", () => {
    expect(
      mapPlexUser({ email: "a@b.c", friendlyName: "Alex F" })?.username,
    ).toBe("Alex F");
    expect(mapPlexUser({ email: "a@b.c", title: "alexftw" })?.username).toBe(
      "alexftw",
    );
  });

  it("allows a missing email (the sign-in layer vetoes it, like OIDC)", () => {
    expect(mapPlexUser({ username: "alex" })).toEqual({
      email: null,
      username: "alex",
    });
  });

  it("rejects payloads with neither email nor username", () => {
    expect(mapPlexUser({ id: 7 })).toBeNull();
    expect(mapPlexUser(null)).toBeNull();
    expect(mapPlexUser({ email: "  ", username: "" })).toBeNull();
  });
});

describe("buildPlexAuthUrl", () => {
  it("builds the app.plex.tv hash-router URL", () => {
    expect(buildPlexAuthUrl({ clientId: "deadbeef", code: "abcd" })).toBe(
      "https://app.plex.tv/auth#!?clientID=deadbeef&code=abcd",
    );
  });

  it("encodes parameters", () => {
    const url = buildPlexAuthUrl({ clientId: "id with space", code: "c&d" });
    expect(url).toContain("clientID=id+with+space");
    expect(url).toContain("code=c%26d");
  });
});

describe("resolvePlexEnabled", () => {
  it("falls back to the Settings toggle when PLEX_ENABLED is unset or empty", () => {
    expect(resolvePlexEnabled(undefined, true)).toBe(true);
    expect(resolvePlexEnabled(undefined, false)).toBe(false);
    expect(resolvePlexEnabled("", true)).toBe(true);
    expect(resolvePlexEnabled("   ", false)).toBe(false);
  });

  it("lets the env var override the toggle in both directions", () => {
    expect(resolvePlexEnabled("1", false)).toBe(true);
    expect(resolvePlexEnabled("TRUE", false)).toBe(true);
    expect(resolvePlexEnabled("yes", false)).toBe(true);
    // "0" is the kill switch: off even when the admin toggled Plex on.
    expect(resolvePlexEnabled("0", true)).toBe(false);
    expect(resolvePlexEnabled("false", true)).toBe(false);
  });
});
