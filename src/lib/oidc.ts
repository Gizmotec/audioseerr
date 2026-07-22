import { randomBytes } from "node:crypto";
import Database from "better-sqlite3";
import bcrypt from "bcryptjs";
import type { OIDCConfig } from "next-auth/providers";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import {
  deriveBaseUsername,
  uniquifyUsername,
} from "@/lib/oidc-username";

// Auth.js builds its provider list once, when src/auth.ts is first evaluated.
// OIDC settings live in the database, so the running process reads them once
// at startup (this module) — changing SSO settings in /admin/settings takes
// effect on the NEXT server restart. The admin UI says so next to the fields.
export const OIDC_PROVIDER_ID = "oidc";

export type OidcBootConfig = {
  issuer: string;
  clientId: string;
  clientSecret: string;
  buttonLabel: string;
};

type OidcSettingsRow = {
  oidcEnabled?: number | boolean | null;
  oidcIssuerUrl?: string | null;
  oidcClientId?: string | null;
  oidcClientSecret?: string | null;
  oidcButtonLabel?: string | null;
};

// Rows written before a field gained encryption-at-rest may hold plaintext;
// fall back to the raw value when it isn't iv:ct:tag ciphertext (same rule
// as src/lib/settings.ts decryptOrRaw).
function decryptOrRaw(value: string): string {
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

/**
 * Synchronous one-shot read of the OIDC columns straight out of SQLite.
 * better-sqlite3 is already the runtime driver (via the Prisma adapter), so
 * this stays in-process with no new dependencies. Any failure — DB file not
 * created yet, pre-migration schema without the oidc* columns, unset
 * AUDIOSEERR_SECRET — simply means "SSO is off".
 */
function readOidcBootConfig(): OidcBootConfig | null {
  try {
    const url = process.env.DATABASE_URL ?? "file:./dev.db";
    const file = url.startsWith("file:") ? url.slice("file:".length) : url;
    const db = new Database(file, { readonly: true, fileMustExist: true });
    let row: OidcSettingsRow | undefined;
    try {
      row = db
        .prepare(
          `SELECT oidcEnabled, oidcIssuerUrl, oidcClientId, oidcClientSecret, oidcButtonLabel
           FROM Settings WHERE id = 1`,
        )
        .get() as OidcSettingsRow | undefined;
    } finally {
      db.close();
    }
    if (!row || !row.oidcEnabled) return null;

    const issuer = row.oidcIssuerUrl?.trim();
    const clientId = row.oidcClientId?.trim();
    const encryptedSecret = row.oidcClientSecret;
    if (!issuer || !clientId || !encryptedSecret) return null;

    return {
      issuer,
      clientId,
      clientSecret: decryptOrRaw(encryptedSecret),
      buttonLabel: row.oidcButtonLabel?.trim() || "SSO",
    };
  } catch {
    return null;
  }
}

// Module-level snapshot: this is the "restart required" boundary. Both
// src/auth.ts (provider registration) and the login page (SSO button) read
// this same snapshot, so they can never disagree within a process.
let cached: OidcBootConfig | null | undefined;

export function getOidcBootConfig(): OidcBootConfig | null {
  if (cached === undefined) cached = readOidcBootConfig();
  return cached;
}

/**
 * The Auth.js provider registration for the configured IdP, or null when SSO
 * is disabled/incomplete. There is no built-in generic "oidc" provider in
 * next-auth — any config with `type: "oidc"` + an issuer gets OIDC discovery
 * (issuer + /.well-known/openid-configuration), which covers Authentik,
 * Keycloak, Pocket ID, etc.
 */
export function buildOidcProvider(): OIDCConfig<Record<string, unknown>> | null {
  const config = getOidcBootConfig();
  if (!config) return null;
  return {
    id: OIDC_PROVIDER_ID,
    name: config.buttonLabel,
    type: "oidc",
    issuer: config.issuer,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  };
}

export type OidcProfileClaims = {
  email?: string | null;
  preferred_username?: string | null;
  name?: string | null;
};

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "P2002"
  );
}

/**
 * Finds or creates the local User for an OIDC sign-in.
 * - Link by email: a user whose email matches the IdP claim signs into that
 *   existing account (keeping whatever role it already has).
 * - Otherwise auto-provision: role USER (never ADMIN), a username derived
 *   from preferred_username / the email local-part (deduped with a numeric
 *   suffix), and an unusable random password so credentials login can't be
 *   used on the account.
 * Returns null when the profile carries no usable email — the signIn callback
 * vetoes those before this is reached, so null here means "could not create".
 */
export async function provisionOidcUser(
  profile: OidcProfileClaims,
): Promise<{ id: string; role: string } | null> {
  const email = profile.email?.trim().toLowerCase();
  if (!email) return null;

  // Case-insensitive match: local account emails may have been typed with
  // different casing than the IdP's claim (Prisma-on-SQLite unique lookups
  // are case-sensitive, so this goes through raw SQL).
  const matches = await prisma.$queryRaw<{ id: string; role: string }[]>`
    SELECT id, role FROM User WHERE LOWER(email) = ${email} LIMIT 1`;
  const existing = matches[0];
  if (existing) return { id: existing.id, role: existing.role };

  const base = deriveBaseUsername({
    preferredUsername: profile.preferred_username ?? profile.name ?? null,
    email,
  });

  // Dedupe against current usernames, then create; a concurrent first login
  // for the same person can still hit the unique constraint, so retry with a
  // freshly-read collision set a couple of times.
  for (let attempt = 0; attempt < 3; attempt++) {
    const siblings = await prisma.user.findMany({
      where: { username: { startsWith: base } },
      select: { username: true },
    });
    const taken = new Set(siblings.map((s) => s.username.toLowerCase()));
    const username = uniquifyUsername(base, taken);

    try {
      const user = await prisma.user.create({
        data: {
          email,
          username,
          // Unusable: random plaintext, hashed, immediately discarded. SSO
          // accounts can never authenticate via the credentials provider.
          passwordHash: await bcrypt.hash(randomBytes(24).toString("base64url"), 10),
          role: "USER",
        },
      });
      return { id: user.id, role: user.role };
    } catch (err) {
      if (isUniqueViolation(err) && attempt < 2) continue;
      throw err;
    }
  }
  return null;
}
