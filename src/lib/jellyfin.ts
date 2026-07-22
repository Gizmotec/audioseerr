import { createHash, randomBytes } from "node:crypto";
import { sanitizeUsername } from "@/lib/oidc-username";
import { currentAppVersion } from "@/lib/version";

// Jellyfin sign-in: the login page posts a username/password straight to
// Auth.js's "jellyfin" credentials provider, whose authorize() (see
// src/lib/external-auth.ts) verifies them against the configured Jellyfin
// server's /Users/AuthenticateByName endpoint. The local account is then
// linked/provisioned exactly like OIDC and Plex sign-ins.
//
// Config is environment-based (same reason as Plex — no schema changes this
// wave):
//   JELLYFIN_SERVER_URL  e.g. http://jellyfin:8096 — required to enable
//   JELLYFIN_API_KEY     optional; appended as Token=… in X-Emby-Authorization
//   JELLYFIN_DEVICE_ID   optional; defaults to a stable id derived from
//                        AUDIOSEERR_SECRET so Jellyfin's device list doesn't
//                        fill up with a new "device" on every restart.
//
// Email: Jellyfin's UserDto has no standard email field. When the server (or
// a fork/plugin) does return one we link on it; otherwise we synthesize
// <sanitized-username>@jellyfin.local so every Jellyfin user still gets a
// stable, unique local account keyed by their Jellyfin name. Documented in
// the admin settings "External login" section.
//
// Pure helpers stay free of Prisma/Next/Auth.js imports for hermetic unit
// tests (tests/jellyfin.test.ts), same convention as src/lib/oidc-username.ts.

export const JELLYFIN_PROVIDER_ID = "jellyfin";

export const JELLYFIN_EMAIL_DOMAIN = "jellyfin.local";

const JELLYFIN_TIMEOUT_MS = 8000;

export type JellyfinAuthConfig = {
  serverUrl: string; // trailing slashes trimmed
  apiKey: string | null;
  deviceId: string;
};

// Module-level memo: the device id must be stable for the life of the process
// (mirrors the Plex client identifier / oidc.ts boot snapshot).
let resolvedDeviceId: string | undefined;

export function getJellyfinDeviceId(): string {
  if (resolvedDeviceId !== undefined) return resolvedDeviceId;

  const fromEnv = process.env.JELLYFIN_DEVICE_ID?.trim();
  if (fromEnv) return (resolvedDeviceId = fromEnv);

  const secret = process.env.AUDIOSEERR_SECRET ?? process.env.AUTH_SECRET;
  if (secret) {
    return (resolvedDeviceId = createHash("sha256")
      .update(`audioseerr:jellyfin-device:${secret}`)
      .digest("hex")
      .slice(0, 32));
  }

  return (resolvedDeviceId = `audioseerr-${randomBytes(8).toString("hex")}`);
}

/** Jellyfin sign-in is live iff JELLYFIN_SERVER_URL is a valid http(s) URL. */
export function getJellyfinAuthConfig(): JellyfinAuthConfig | null {
  const raw = process.env.JELLYFIN_SERVER_URL?.trim();
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  return {
    serverUrl: raw.replace(/\/+$/, ""),
    apiKey: process.env.JELLYFIN_API_KEY?.trim() || null,
    deviceId: getJellyfinDeviceId(),
  };
}

/**
 * The X-Emby-Authorization header Jellyfin/Emby expects on
 * /Users/AuthenticateByName. Values are stripped of quotes/CRLF so a hostile
 * env value can't break out of the header grammar.
 */
export function buildEmbyAuthorizationHeader(input: {
  client: string;
  version: string;
  device: string;
  deviceId: string;
  token?: string | null;
}): string {
  const clean = (value: string) => value.replace(/["\r\n]/g, "");
  const parts = [
    `Client="${clean(input.client)}"`,
    `Version="${clean(input.version)}"`,
    `Device="${clean(input.device)}"`,
    `DeviceId="${clean(input.deviceId)}"`,
  ];
  if (input.token) parts.push(`Token="${clean(input.token)}"`);
  return `MediaBrowser ${parts.join(", ")}`;
}

export type JellyfinAuthResult = {
  name: string;
  email: string | null;
};

/**
 * Extracts the essentials from a /Users/AuthenticateByName 200 response
 * ({ User: UserDto, AccessToken, … }). Any non-empty User.Email is passed
 * through; standard Jellyfin servers don't send one — see jellyfinEmailForUser.
 */
export function mapJellyfinAuthResponse(
  json: unknown,
): JellyfinAuthResult | null {
  if (typeof json !== "object" || json === null) return null;
  const user = (json as Record<string, unknown>).User;
  if (typeof user !== "object" || user === null) return null;
  const name = (user as Record<string, unknown>).Name;
  if (typeof name !== "string" || name.trim().length === 0) return null;
  const email = (user as Record<string, unknown>).Email;
  return {
    name: name.trim(),
    email:
      typeof email === "string" && email.includes("@") ? email.trim() : null,
  };
}

/**
 * The local link key for a Jellyfin sign-in: the server's own email when it
 * sent one, otherwise a synthesized <username>@jellyfin.local address. The
 * local part goes through the same sanitizeUsername used for OIDC usernames,
 * so a Jellyfin "Alex F" and a future IdP "alex-f" converge on the same
 * namespace instead of colliding on raw display names.
 */
export function jellyfinEmailForUser(user: {
  name: string;
  email: string | null;
}): string {
  if (user.email) return user.email.toLowerCase();
  const localPart = sanitizeUsername(user.name) || "user";
  return `${localPart}@${JELLYFIN_EMAIL_DOMAIN}`;
}

/**
 * Verify username+password against the Jellyfin server. Returns null on 401
 * (bad credentials) and on any transport/server failure alike — the authorize
 * callback treats both as a failed sign-in.
 */
export async function authenticateJellyfinByName(
  config: JellyfinAuthConfig,
  username: string,
  password: string,
): Promise<JellyfinAuthResult | null> {
  const res = await fetch(`${config.serverUrl}/Users/AuthenticateByName`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Emby-Authorization": buildEmbyAuthorizationHeader({
        client: "Audioseerr",
        version: currentAppVersion(),
        // "Device" is Jellyfin's display label for the connecting app instance.
        device: "hermes",
        deviceId: config.deviceId,
        token: config.apiKey,
      }),
    },
    body: JSON.stringify({ Username: username, Pw: password }),
    cache: "no-store",
    signal: AbortSignal.timeout(JELLYFIN_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  return mapJellyfinAuthResponse(await res.json());
}
