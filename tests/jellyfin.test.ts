import { describe, expect, it } from "vitest";
import {
  buildEmbyAuthorizationHeader,
  jellyfinEmailForUser,
  mapJellyfinAuthResponse,
} from "@/lib/jellyfin";

describe("buildEmbyAuthorizationHeader", () => {
  it("builds the MediaBrowser header without a token", () => {
    expect(
      buildEmbyAuthorizationHeader({
        client: "Audioseerr",
        version: "0.1.0",
        device: "hermes",
        deviceId: "abc123",
      }),
    ).toBe(
      'MediaBrowser Client="Audioseerr", Version="0.1.0", Device="hermes", DeviceId="abc123"',
    );
  });

  it("appends Token when an API key is configured", () => {
    expect(
      buildEmbyAuthorizationHeader({
        client: "Audioseerr",
        version: "0.1.0",
        device: "hermes",
        deviceId: "abc123",
        token: "secret-key",
      }),
    ).toContain(', Token="secret-key"');
  });

  it("strips quotes and CRLF so values can't break the header grammar", () => {
    expect(
      buildEmbyAuthorizationHeader({
        client: 'Audio"seerr',
        version: "0.1.0",
        device: "her\r\nmes",
        deviceId: 'abc", Token="injected',
      }),
    ).toBe(
      'MediaBrowser Client="Audioseerr", Version="0.1.0", Device="hermes", DeviceId="abc, Token=injected"',
    );
  });
});

describe("mapJellyfinAuthResponse", () => {
  it("extracts the user name, with no email on a stock server", () => {
    expect(
      mapJellyfinAuthResponse({
        User: { Id: "u1", Name: "alex" },
        AccessToken: "tok",
        ServerId: "s1",
      }),
    ).toEqual({ name: "alex", email: null });
  });

  it("passes through an email when the server provides one", () => {
    expect(
      mapJellyfinAuthResponse({
        User: { Id: "u1", Name: "alex", Email: "alex@example.com" },
      }),
    ).toEqual({ name: "alex", email: "alex@example.com" });
  });

  it("ignores Email values that aren't email-shaped", () => {
    expect(
      mapJellyfinAuthResponse({ User: { Name: "alex", Email: "not-an-email" } })
        ?.email,
    ).toBeNull();
  });

  it("rejects responses without a usable user name", () => {
    expect(mapJellyfinAuthResponse(null)).toBeNull();
    expect(mapJellyfinAuthResponse({})).toBeNull();
    expect(mapJellyfinAuthResponse({ User: null })).toBeNull();
    expect(mapJellyfinAuthResponse({ User: { Id: "u1" } })).toBeNull();
    expect(mapJellyfinAuthResponse({ User: { Name: "  " } })).toBeNull();
  });
});

describe("jellyfinEmailForUser", () => {
  it("prefers the server's email, lowercased", () => {
    expect(
      jellyfinEmailForUser({ name: "alex", email: "Alex@Example.COM" }),
    ).toBe("alex@example.com");
  });

  it("synthesizes <username>@jellyfin.local when no email exists", () => {
    expect(jellyfinEmailForUser({ name: "alex", email: null })).toBe(
      "alex@jellyfin.local",
    );
  });

  it("sanitizes display names into the email local part", () => {
    expect(jellyfinEmailForUser({ name: "Alex F!", email: null })).toBe(
      "alex-f@jellyfin.local",
    );
    expect(jellyfinEmailForUser({ name: "Beyoncé", email: null })).toBe(
      "beyonc@jellyfin.local",
    );
  });

  it("falls back to user@jellyfin.local for unusable names", () => {
    expect(jellyfinEmailForUser({ name: "日本語", email: null })).toBe(
      "user@jellyfin.local",
    );
  });
});
