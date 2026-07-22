import { createHash, randomBytes } from "node:crypto";

// Plex sign-in (OAuth PIN flow — Plex has no OIDC, so this is a custom flow
// rather than a next-auth provider talking to a discovery document):
//
//   1. Login page button → server action creates a strong PIN at plex.tv
//      (POST /api/v2/pins) and opens https://app.plex.tv/auth for the user.
//   2. The login page polls /api/auth/plex-callback until the PIN carries an
//      authToken (the user approved the app on plex.tv).
//   3. The client completes sign-in through Auth.js's "plex" credentials
//      provider (src/lib/external-auth.ts), which RE-fetches the PIN and the
//      plex.tv user server-side — the authToken never reaches the browser.
//
// Config is environment-based (no Settings columns exist for Plex and the
// schema can't grow any in this wave):
//   PLEX_ENABLED            "1"/"true"/"yes" turns the login button + provider on
//   PLEX_CLIENT_IDENTIFIER  optional; defaults to a stable id derived from
//                           AUDIOSEERR_SECRET (so Plex sees one app identity
//                           across restarts), falling back to a per-process
//                           random id when no secret is configured.
//
// The pure mappers/builders in this module stay free of Prisma/Next/Auth.js
// imports so they're unit-testable in isolation (tests/plex.test.ts) — same
// convention as src/lib/oidc-username.ts.

export const PLEX_PROVIDER_ID = "plex";

const PLEX_API_BASE = "https://plex.tv";
const PLEX_AUTH_APP_BASE = "https://app.plex.tv/auth";
const PLEX_PRODUCT = "Audioseerr";
const PLEX_TIMEOUT_MS = 8000;

export type PlexAuthConfig = {
  clientId: string;
};

function envFlagEnabled(value: string | undefined): boolean {
  return /^(1|true|yes)$/i.test(value?.trim() ?? "");
}

// Module-level memo: the client identifier must be stable for the life of the
// process (the PIN create, the auth URL, and the poll all have to agree), so
// the random fallback is resolved once, mirroring oidc.ts's boot snapshot.
let resolvedClientId: string | undefined;

export function getPlexClientIdentifier(): string {
  if (resolvedClientId !== undefined) return resolvedClientId;

  const fromEnv = process.env.PLEX_CLIENT_IDENTIFIER?.trim();
  if (fromEnv) return (resolvedClientId = fromEnv);

  const secret = process.env.AUDIOSEERR_SECRET ?? process.env.AUTH_SECRET;
  if (secret) {
    return (resolvedClientId = createHash("sha256")
      .update(`audioseerr:plex-client:${secret}`)
      .digest("hex")
      .slice(0, 32));
  }

  // Last resort: random per process. The flow still works; Plex just sees a
  // new app identity after each restart.
  return (resolvedClientId = randomBytes(16).toString("hex"));
}

/** Plex sign-in is live iff PLEX_ENABLED is set (read at process boot). */
export function getPlexAuthConfig(): PlexAuthConfig | null {
  if (!envFlagEnabled(process.env.PLEX_ENABLED)) return null;
  return { clientId: getPlexClientIdentifier() };
}

export type PlexPin = {
  id: number;
  code: string;
  authToken: string | null;
  expiresAt: string | null;
};

/**
 * Validates a /api/v2/pins response (both the create POST and the poll GET)
 * and extracts the fields the flow needs. Returns null on anything malformed
 * so callers treat a weird plex.tv response like a transient failure.
 */
export function mapPlexPin(json: unknown): PlexPin | null {
  if (typeof json !== "object" || json === null) return null;
  const obj = json as Record<string, unknown>;
  if (typeof obj.id !== "number" || !Number.isFinite(obj.id)) return null;
  if (typeof obj.code !== "string" || obj.code.length === 0) return null;
  return {
    id: obj.id,
    code: obj.code,
    authToken:
      typeof obj.authToken === "string" && obj.authToken.length > 0
        ? obj.authToken
        : null,
    expiresAt: typeof obj.expiresAt === "string" ? obj.expiresAt : null,
  };
}

export type PlexUser = {
  email: string | null;
  username: string | null;
};

/**
 * Extracts email + display name from GET /api/v2/user. Plex accounts always
 * have an email, but a missing one simply fails the sign-in (same rule as the
 * OIDC email claim). Username falls back through friendlyName → title.
 */
export function mapPlexUser(json: unknown): PlexUser | null {
  if (typeof json !== "object" || json === null) return null;
  const obj = json as Record<string, unknown>;
  const firstString = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === "string" && value.trim().length > 0) {
        return value.trim();
      }
    }
    return null;
  };
  const email = firstString("email");
  const username = firstString("username", "friendlyName", "title");
  if (!email && !username) return null;
  return { email, username };
}

/**
 * The URL the user authorizes the PIN at. Uses the app.plex.tv hash-router
 * form (https://app.plex.tv/auth#!?clientID=…&code=…).
 */
export function buildPlexAuthUrl(input: {
  clientId: string;
  code: string;
}): string {
  const params = new URLSearchParams({
    clientID: input.clientId,
    code: input.code,
  });
  return `${PLEX_AUTH_APP_BASE}#!?${params.toString()}`;
}

function plexHeaders(clientId: string, authToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "X-Plex-Client-Identifier": clientId,
    "X-Plex-Product": PLEX_PRODUCT,
    Accept: "application/json",
  };
  if (authToken) headers["X-Plex-Token"] = authToken;
  return headers;
}

/** Step 1: mint a strong PIN. Null on any plex.tv failure. */
export async function createPlexPin(clientId: string): Promise<PlexPin | null> {
  const res = await fetch(`${PLEX_API_BASE}/api/v2/pins?strong=true`, {
    method: "POST",
    headers: plexHeaders(clientId),
    cache: "no-store",
    signal: AbortSignal.timeout(PLEX_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  return mapPlexPin(await res.json());
}

/**
 * Poll a PIN. The PIN id goes in the URL path, so it's pinned to digits to
 * keep this from ever becoming a path-injection primitive against plex.tv.
 */
export async function fetchPlexPin(
  clientId: string,
  pinId: string,
): Promise<PlexPin | null> {
  if (!/^\d+$/.test(pinId)) return null;
  const res = await fetch(`${PLEX_API_BASE}/api/v2/pins/${pinId}`, {
    headers: plexHeaders(clientId),
    cache: "no-store",
    signal: AbortSignal.timeout(PLEX_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  return mapPlexPin(await res.json());
}

/** After the PIN is approved: resolve the plex.tv account behind the token. */
export async function fetchPlexUser(
  clientId: string,
  authToken: string,
): Promise<PlexUser | null> {
  const res = await fetch(`${PLEX_API_BASE}/api/v2/user`, {
    headers: plexHeaders(clientId, authToken),
    cache: "no-store",
    signal: AbortSignal.timeout(PLEX_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  return mapPlexUser(await res.json());
}
