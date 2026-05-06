import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/encryption";

export type SettingsView = {
  setupComplete: boolean;
  requireApproval: boolean;
  registrationMode: string;
  lidarrUrl: string | null;
  lidarrApiKey: string | null;
  lidarrDefaultProfileId: number | null;
  lidarrRootFolderPath: string | null;
  prowlarrUrl: string | null;
  prowlarrApiKey: string | null;
  qbittorrentUrl: string | null;
  qbittorrentUsername: string | null;
  qbittorrentPassword: string | null;
  trackTorrentCategory: string | null;
  trackTorrentSavePath: string | null;
  trackTorrentMaxSizeMb: number;
  lastFmApiKey: string | null;
  mediaPathMap: string | null;
};

export async function getSettings(): Promise<SettingsView> {
  const row = await prisma.settings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
  });

  return {
    setupComplete: row.setupComplete,
    requireApproval: row.requireApproval,
    registrationMode: row.registrationMode,
    lidarrUrl: row.lidarrUrl,
    lidarrApiKey: row.lidarrApiKey ? decrypt(row.lidarrApiKey) : null,
    lidarrDefaultProfileId: row.lidarrDefaultProfileId,
    lidarrRootFolderPath: row.lidarrRootFolderPath,
    prowlarrUrl: row.prowlarrUrl,
    prowlarrApiKey: row.prowlarrApiKey ? decrypt(row.prowlarrApiKey) : null,
    qbittorrentUrl: row.qbittorrentUrl,
    qbittorrentUsername: row.qbittorrentUsername,
    qbittorrentPassword: row.qbittorrentPassword
      ? decrypt(row.qbittorrentPassword)
      : null,
    trackTorrentCategory: row.trackTorrentCategory,
    trackTorrentSavePath: row.trackTorrentSavePath,
    trackTorrentMaxSizeMb: row.trackTorrentMaxSizeMb,
    lastFmApiKey: row.lastFmApiKey,
    mediaPathMap: row.mediaPathMap,
  };
}

export type SettingsUpdate = {
  lidarrUrl?: string | null;
  lidarrApiKey?: string | null;
  lidarrDefaultProfileId?: number | null;
  lidarrRootFolderPath?: string | null;
  prowlarrUrl?: string | null;
  prowlarrApiKey?: string | null;
  qbittorrentUrl?: string | null;
  qbittorrentUsername?: string | null;
  qbittorrentPassword?: string | null;
  trackTorrentCategory?: string | null;
  trackTorrentSavePath?: string | null;
  trackTorrentMaxSizeMb?: number;
  lastFmApiKey?: string | null;
  mediaPathMap?: string | null;
  registrationMode?: string;
  requireApproval?: boolean;
  setupComplete?: boolean;
};

export async function saveSettings(update: SettingsUpdate): Promise<void> {
  const data: SettingsUpdate = { ...update };
  if (data.lidarrApiKey !== undefined && data.lidarrApiKey !== null) {
    data.lidarrApiKey = encrypt(data.lidarrApiKey);
  }
  if (data.prowlarrApiKey !== undefined && data.prowlarrApiKey !== null) {
    data.prowlarrApiKey = encrypt(data.prowlarrApiKey);
  }
  if (
    data.qbittorrentPassword !== undefined &&
    data.qbittorrentPassword !== null
  ) {
    data.qbittorrentPassword = encrypt(data.qbittorrentPassword);
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
