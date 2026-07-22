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
};

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
};

export async function saveSettings(update: SettingsUpdate): Promise<void> {
  const data: SettingsUpdate = { ...update };
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
}

export async function isSetupComplete(): Promise<boolean> {
  const row = await prisma.settings.findUnique({ where: { id: 1 } });
  return row?.setupComplete ?? false;
}
