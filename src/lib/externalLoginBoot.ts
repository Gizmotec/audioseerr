import Database from "better-sqlite3";
import { decrypt } from "@/lib/encryption";

// Boot-time snapshot of the external-login Settings columns (Plex/Jellyfin),
// mirroring src/lib/oidc.ts's readOidcBootConfig: Auth.js builds its provider
// list once when src/auth.ts is first evaluated, so the running process reads
// these columns once at startup — changes in /admin/settings take effect on
// the NEXT server restart, and the admin UI says so next to the fields.
//
// The PLEX_*/JELLYFIN_* environment variables override these values when set
// (see resolvePlexEnabled in plex.ts / resolveJellyfinServerConfig in
// jellyfin.ts); this row is the DB half of that resolution. Kept free of
// Prisma imports so the consuming modules stay unit-testable in isolation.

export type ExternalLoginBootRow = {
  plexEnabled: boolean;
  plexClientIdentifier: string | null;
  jellyfinEnabled: boolean;
  jellyfinServerUrl: string | null;
  jellyfinApiKey: string | null;
};

// The schema defaults, used whenever the row can't be read — DB file not
// created yet, pre-migration schema without the columns, or no Settings row.
// plexEnabled:true matches the schema default (Plex sign-in needs no other
// configuration); Jellyfin stays off without an explicit server URL.
const EXTERNAL_LOGIN_DEFAULTS: ExternalLoginBootRow = {
  plexEnabled: true,
  plexClientIdentifier: null,
  jellyfinEnabled: false,
  jellyfinServerUrl: null,
  jellyfinApiKey: null,
};

// Rows written before the field gained encryption-at-rest may hold plaintext;
// fall back to the raw value when it isn't iv:ct:tag ciphertext (same rule as
// src/lib/settings.ts decryptOrRaw).
function decryptOrRaw(value: string): string {
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

type RawRow = {
  plexEnabled?: number | boolean | null;
  plexClientIdentifier?: string | null;
  jellyfinEnabled?: number | boolean | null;
  jellyfinServerUrl?: string | null;
  jellyfinApiKey?: string | null;
};

/**
 * Synchronous one-shot read straight out of SQLite. better-sqlite3 is already
 * the runtime driver (via the Prisma adapter), so this stays in-process with
 * no new dependencies — same approach as oidc.ts. Any failure simply yields
 * the schema defaults above.
 */
function readExternalLoginBootRow(): ExternalLoginBootRow {
  try {
    const url = process.env.DATABASE_URL ?? "file:./dev.db";
    const file = url.startsWith("file:") ? url.slice("file:".length) : url;
    const db = new Database(file, { readonly: true, fileMustExist: true });
    let row: RawRow | undefined;
    try {
      row = db
        .prepare(
          `SELECT plexEnabled, plexClientIdentifier, jellyfinEnabled, jellyfinServerUrl, jellyfinApiKey
           FROM Settings WHERE id = 1`,
        )
        .get() as RawRow | undefined;
    } finally {
      db.close();
    }
    if (!row) return EXTERNAL_LOGIN_DEFAULTS;
    return {
      plexEnabled: row.plexEnabled === undefined || !!row.plexEnabled,
      plexClientIdentifier: row.plexClientIdentifier?.trim() || null,
      jellyfinEnabled: !!row.jellyfinEnabled,
      jellyfinServerUrl: row.jellyfinServerUrl?.trim() || null,
      jellyfinApiKey: row.jellyfinApiKey
        ? decryptOrRaw(row.jellyfinApiKey)
        : null,
    };
  } catch {
    return EXTERNAL_LOGIN_DEFAULTS;
  }
}

// Module-level snapshot: this is the "restart required" boundary. Both
// src/auth.ts (provider registration) and the login/settings pages read this
// same snapshot via getPlexAuthConfig()/getJellyfinAuthConfig(), so the UI
// and the providers can never disagree within a process.
let cached: ExternalLoginBootRow | undefined;

export function getExternalLoginBootRow(): ExternalLoginBootRow {
  if (cached === undefined) cached = readExternalLoginBootRow();
  return cached;
}
