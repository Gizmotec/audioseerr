import { describe, expect, it } from "vitest";
import {
  buildEmbyAuthorizationHeader,
  jellyfinEmailForUser,
  mapJellyfinAuthResponse,
  resolveJellyfinServerConfig,
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

describe("resolveJellyfinServerConfig", () => {
  const settings = (
    over: Partial<{
      jellyfinEnabled: boolean;
      jellyfinServerUrl: string | null;
      jellyfinApiKey: string | null;
    }> = {},
  ) => ({
    jellyfinEnabled: false,
    jellyfinServerUrl: null,
    jellyfinApiKey: null,
    ...over,
  });

  it("is off with no env URL and the Settings toggle disabled", () => {
    expect(
      resolveJellyfinServerConfig({
        envUrl: undefined,
        envApiKey: undefined,
        settings: settings(),
      }),
    ).toBeNull();
  });

  it("is off when the toggle is on but no server URL is configured", () => {
    expect(
      resolveJellyfinServerConfig({
        envUrl: undefined,
        envApiKey: undefined,
        settings: settings({ jellyfinEnabled: true }),
      }),
    ).toBeNull();
  });

  it("uses the Settings URL + API key when the toggle is on", () => {
    expect(
      resolveJellyfinServerConfig({
        envUrl: undefined,
        envApiKey: undefined,
        settings: settings({
          jellyfinEnabled: true,
          jellyfinServerUrl: "http://jellyfin:8096/",
          jellyfinApiKey: "db-key",
        }),
      }),
    ).toEqual({ serverUrl: "http://jellyfin:8096", apiKey: "db-key" });
  });

  it("rejects invalid and non-http(s) Settings URLs", () => {
    expect(
      resolveJellyfinServerConfig({
        envUrl: undefined,
        envApiKey: undefined,
        settings: settings({
          jellyfinEnabled: true,
          jellyfinServerUrl: "ftp://jellyfin",
        }),
      }),
    ).toBeNull();
    expect(
      resolveJellyfinServerConfig({
        envUrl: undefined,
        envApiKey: undefined,
        settings: settings({
          jellyfinEnabled: true,
          jellyfinServerUrl: "not a url",
        }),
      }),
    ).toBeNull();
  });

  it("lets the env URL win and turn the method on even with the toggle off", () => {
    expect(
      resolveJellyfinServerConfig({
        envUrl: "https://jf.example.com/",
        envApiKey: "env-key",
        settings: settings({
          jellyfinEnabled: false,
          jellyfinServerUrl: "http://db:8096",
          jellyfinApiKey: "db-key",
        }),
      }),
    ).toEqual({ serverUrl: "https://jf.example.com", apiKey: "env-key" });
  });

  it("treats an empty env URL as unset", () => {
    expect(
      resolveJellyfinServerConfig({
        envUrl: "  ",
        envApiKey: undefined,
        settings: settings({
          jellyfinEnabled: true,
          jellyfinServerUrl: "http://db:8096",
        }),
      }),
    ).toEqual({ serverUrl: "http://db:8096", apiKey: null });
  });

  it("an invalid env URL disables the method rather than falling back to the DB", () => {
    expect(
      resolveJellyfinServerConfig({
        envUrl: "not a url",
        envApiKey: undefined,
        settings: settings({
          jellyfinEnabled: true,
          jellyfinServerUrl: "http://db:8096",
        }),
      }),
    ).toBeNull();
  });
});
