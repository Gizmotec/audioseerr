import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/encryption";

// Note: the Settings table still carries vestigial lidarr*/prowlarr*/
// qbittorrent*/trackTorrent* columns from before the slskd-only switchover.
// They're intentionally not surfaced here anymore; a later cleanup migration
// can drop them once the library migration is confirmed.

export type SettingsView = {
  setupComplete: boolean;
  slskdUrl: string | null;
  slskdApiKey: string | null;
  slskdDownloadPath: string | null;
  lastFmApiKey: string | null;
  mediaPathMap: string | null;
  preDownloadMixes: boolean;
  notificationWebhookUrl: string | null;
  lastFmApiSecret: string | null;
  oidcEnabled: boolean;
  oidcIssuerUrl: string | null;
  oidcClientId: string | null;
  oidcClientSecret: string | null;
  oidcButtonLabel: string;
};

export const OIDC_BUTTON_LABEL_DEFAULT = "SSO";

// The oidc* columns arrive with the SSO schema migration, which the release
// process applies separately from this code. Until then Prisma simply doesn't
// select them, so the superset cast below reads them as undefined and SSO
// shows as disabled — the app keeps working on the pre-migration schema.
type OidcColumns = {
  oidcEnabled?: boolean | null;
  oidcIssuerUrl?: string | null;
  oidcClientId?: string | null;
  oidcClientSecret?: string | null;
  oidcButtonLabel?: string | null;
};

// Thrown by saveSettings when OIDC fields are written before the SSO schema
// migration has been applied; the settings action turns it into a friendly
// message instead of a 500.
export const OIDC_MIGRATION_PENDING = "OIDC_MIGRATION_PENDING";

// Rows written before a field gained encryption-at-rest may hold plaintext;
// fall back to the raw value when it isn't iv:ct:tag ciphertext.
function decryptOrRaw(value: string): string {
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

export async function getSettings(): Promise<SettingsView> {
  const row = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });
  const oidc = row as unknown as OidcColumns;

  return {
    setupComplete: row.setupComplete,
    slskdUrl: row.slskdUrl,
    slskdApiKey: row.slskdApiKey ? decrypt(row.slskdApiKey) : null,
    slskdDownloadPath: row.slskdDownloadPath,
    lastFmApiKey: row.lastFmApiKey,
    mediaPathMap: row.mediaPathMap,
    preDownloadMixes: row.preDownloadMixes,
    notificationWebhookUrl: row.notificationWebhookUrl,
    lastFmApiSecret: row.lastFmApiSecret
      ? decryptOrRaw(row.lastFmApiSecret)
      : null,
    oidcEnabled: oidc.oidcEnabled ?? false,
    oidcIssuerUrl: oidc.oidcIssuerUrl ?? null,
    oidcClientId: oidc.oidcClientId ?? null,
    oidcClientSecret: oidc.oidcClientSecret
      ? decryptOrRaw(oidc.oidcClientSecret)
      : null,
    oidcButtonLabel:
      oidc.oidcButtonLabel?.trim() || OIDC_BUTTON_LABEL_DEFAULT,
  };
}

export type SettingsUpdate = {
  slskdUrl?: string | null;
  slskdApiKey?: string | null;
  slskdDownloadPath?: string | null;
  lastFmApiKey?: string | null;
  mediaPathMap?: string | null;
  setupComplete?: boolean;
  preDownloadMixes?: boolean;
  notificationWebhookUrl?: string | null;
  lastFmApiSecret?: string | null;
  oidcEnabled?: boolean;
  oidcIssuerUrl?: string | null;
  oidcClientId?: string | null;
  oidcClientSecret?: string | null;
  oidcButtonLabel?: string | null;
};

// Whitelisted column list for the OIDC write — column names are literals
// here, only values are parameterized. Raw SQL because the typed Prisma API
// rejects these keys until the SSO migration + `prisma generate` land; this
// statement works on both sides of that boundary.
const OIDC_COLUMNS = [
  "oidcEnabled",
  "oidcIssuerUrl",
  "oidcClientId",
  "oidcClientSecret",
  "oidcButtonLabel",
] as const;

export async function saveSettings(update: SettingsUpdate): Promise<void> {
  const {
    oidcEnabled,
    oidcIssuerUrl,
    oidcClientId,
    oidcClientSecret,
    oidcButtonLabel,
    ...rest
  } = update;

  // NOTE: no explicit type annotation — rest's inferred Omit<SettingsUpdate,
  // oidc*> keeps the oidc keys (handled via raw SQL below) out of the typed
  // Prisma call. Annotating as SettingsUpdate would reintroduce them at the
  // type level and break against the generated client's required fields.
  const data = { ...rest };
  if (data.slskdApiKey !== undefined && data.slskdApiKey !== null) {
    data.slskdApiKey = encrypt(data.slskdApiKey);
  }
  if (data.lastFmApiSecret !== undefined && data.lastFmApiSecret !== null) {
    data.lastFmApiSecret = encrypt(data.lastFmApiSecret);
  }
  await prisma.settings.upsert({
    where: { id: 1 },
    update: data,
    create: { id: 1, ...data },
  });

  const oidcValues: Record<(typeof OIDC_COLUMNS)[number], unknown> = {
    oidcEnabled: oidcEnabled === undefined ? undefined : oidcEnabled ? 1 : 0,
    oidcIssuerUrl,
    oidcClientId,
    oidcClientSecret:
      oidcClientSecret === undefined || oidcClientSecret === null
        ? oidcClientSecret
        : encrypt(oidcClientSecret),
    oidcButtonLabel,
  };
  const sets: string[] = [];
  const params: unknown[] = [];
  for (const column of OIDC_COLUMNS) {
    const value = oidcValues[column];
    if (value === undefined) continue;
    sets.push(`${column} = ?`);
    params.push(value);
  }
  if (sets.length === 0) return;

  try {
    await prisma.$executeRawUnsafe(
      `UPDATE Settings SET ${sets.join(", ")} WHERE id = 1`,
      ...params,
    );
  } catch (err) {
    // Pre-migration schema: better-sqlite3 reports "no such column: oidc…".
    if (err instanceof Error && /no such column/i.test(err.message)) {
      throw new Error(OIDC_MIGRATION_PENDING);
    }
    throw err;
  }
}

export async function isSetupComplete(): Promise<boolean> {
  const row = await prisma.settings.findUnique({ where: { id: 1 } });
  return row?.setupComplete ?? false;
}
