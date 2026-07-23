import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/db";
import {
  authenticateJellyfinByName,
  getJellyfinAuthConfig,
  JELLYFIN_PROVIDER_ID,
  jellyfinEmailForUser,
} from "@/lib/jellyfin";
import { provisionOidcUser } from "@/lib/oidc";
import {
  fetchPlexPin,
  fetchPlexUser,
  getPlexAuthConfig,
  PLEX_PROVIDER_ID,
} from "@/lib/plex";

// Auth.js provider registrations for the non-OIDC external sign-ins (Plex PIN
// flow, Jellyfin username/password). Both are Credentials providers whose
// authorize() verifies the presented material against the UPSTREAM service —
// plex.tv / the configured Jellyfin server — so a browser can never assert an
// identity the server didn't just confirm. After verification they run the
// exact OIDC link/provision path (provisionOidcUser: link by email, else
// create a role-USER account with an unusable password; never auto-admin).
//
// Like the OIDC provider, these are built once at module init (src/auth.ts):
// Settings/env changes apply on the next server restart, and the login page
// reads the same config helpers, so button and provider always agree.

type LocalUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

/**
 * Shared tail of every external authorize(): find-or-create the local User
 * for a verified upstream identity, then return it in the shape Auth.js's
 * jwt callback expects (the plain `if (user)` branch sets token.id/role).
 */
async function linkOrProvisionLocalUser(
  email: string,
  preferredUsername: string | null,
): Promise<LocalUser | null> {
  const local = await provisionOidcUser({
    email,
    preferred_username: preferredUsername,
  });
  if (!local) return null;
  const user = await prisma.user.findUnique({
    where: { id: local.id },
    select: { id: true, username: true, email: true, role: true },
  });
  if (!user) return null;
  return { id: user.id, name: user.username, email: user.email, role: user.role };
}

/**
 * Plex: the browser presents (pinId, code) from the PIN flow it started.
 * We re-fetch the PIN from plex.tv, require the code to match (the code is
 * only ever shown to the browser that created the PIN — it stops PIN-id
 * guessing), require the PIN to be authorized, then resolve the plex.tv user
 * behind the token. The Plex authToken itself never leaves the server.
 */
async function authorizePlex(
  credentials: Partial<Record<"pinId" | "code", unknown>>,
): Promise<LocalUser | null> {
  const config = getPlexAuthConfig();
  if (!config) return null;
  const { pinId, code } = credentials;
  if (typeof pinId !== "string" || typeof code !== "string" || !code) {
    return null;
  }
  try {
    const pin = await fetchPlexPin(config.clientId, pinId);
    if (!pin || pin.code !== code || !pin.authToken) return null;
    const plexUser = await fetchPlexUser(config.clientId, pin.authToken);
    if (!plexUser?.email) return null;
    return await linkOrProvisionLocalUser(plexUser.email, plexUser.username);
  } catch (err) {
    console.error("[plex] sign-in verification failed:", err);
    return null;
  }
}

/**
 * Jellyfin: the browser presents the username/password from the login form;
 * we verify them against the configured server's AuthenticateByName endpoint
 * and link/provision on the resulting identity (email from the server when
 * present, else the documented <username>@jellyfin.local fallback).
 */
async function authorizeJellyfin(
  credentials: Partial<Record<"username" | "password", unknown>>,
): Promise<LocalUser | null> {
  const config = getJellyfinAuthConfig();
  if (!config) return null;
  const { username, password } = credentials;
  if (
    typeof username !== "string" ||
    typeof password !== "string" ||
    !username.trim() ||
    !password
  ) {
    return null;
  }
  try {
    const result = await authenticateJellyfinByName(
      config,
      username.trim(),
      password,
    );
    if (!result) return null;
    return await linkOrProvisionLocalUser(
      jellyfinEmailForUser(result),
      result.name,
    );
  } catch (err) {
    console.error("[jellyfin] sign-in verification failed:", err);
    return null;
  }
}

/**
 * Provider list slice for src/auth.ts — empty when neither external method is
 * configured, so a stock install behaves exactly as before.
 */
export function buildExternalProviders() {
  const providers = [];
  if (getPlexAuthConfig()) {
    providers.push(
      Credentials({
        id: PLEX_PROVIDER_ID,
        name: "Plex",
        credentials: {
          pinId: { label: "PIN", type: "text" },
          code: { label: "Code", type: "text" },
        },
        authorize: authorizePlex,
      }),
    );
  }
  if (getJellyfinAuthConfig()) {
    providers.push(
      Credentials({
        id: JELLYFIN_PROVIDER_ID,
        name: "Jellyfin",
        credentials: {
          username: { label: "Username", type: "text" },
          password: { label: "Password", type: "password" },
        },
        authorize: authorizeJellyfin,
      }),
    );
  }
  return providers;
}
