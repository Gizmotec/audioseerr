"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import {
  type LidarrQualityProfile,
  type LidarrRootFolder,
  LidarrError,
  listQualityProfiles,
  listRootFolders,
  testConnection,
} from "@/lib/lidarr";
import {
  ProwlarrError,
  testProwlarrConnection,
  type ProwlarrStatus,
} from "@/lib/prowlarr";
import {
  QBittorrentError,
  testQBittorrentConnection,
  type QBittorrentConnectionStatus,
} from "@/lib/qbittorrent";
import { SlskdError, testSlskdConnection } from "@/lib/slskd";
import { getSettings, saveSettings } from "@/lib/settings";
import { parsePathMap } from "@/lib/streaming";
// Sentinel constant for "API key unchanged". Lives in its own module because
// "use server" files may only export async functions.
import { KEY_UNCHANGED_SENTINEL as KEY_UNCHANGED } from "./constants";

async function requireAdmin(): Promise<void> {
  const session = await auth();
  const role = (session?.user as { role?: string } | undefined)?.role;
  if (role !== "ADMIN") {
    throw new Error("Forbidden");
  }
}

const saveInput = z.object({
  lidarrUrl: z.string().url("Lidarr URL must be a valid URL"),
  lidarrApiKey: z.string().min(1, "Lidarr API key is required"),
  lidarrDefaultProfileId: z.coerce.number().int().positive(),
  lidarrRootFolderPath: z.string().min(1, "Root folder is required"),
  prowlarrUrl: z.string(),
  prowlarrApiKey: z.string(),
  qbittorrentUrl: z.string(),
  qbittorrentUsername: z.string(),
  qbittorrentPassword: z.string(),
  trackTorrentCategory: z.string(),
  trackTorrentSavePath: z.string(),
  trackTorrentMaxSizeMb: z.coerce
    .number()
    .int()
    .min(10, "Track torrent size cap must be at least 10 MB.")
    .max(2000, "Track torrent size cap must be 2000 MB or lower."),
  slskdUrl: z.string(),
  slskdApiKey: z.string(),
  slskdDownloadPath: z.string(),
  lastFmApiKey: z.string(),
  mediaPathMap: z.string(),
});

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveAdminSettingsAction(
  raw: Record<string, unknown>,
): Promise<SaveResult> {
  await requireAdmin();

  const parsed = saveInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const data = parsed.data;

  for (const [label, value] of [
    ["Prowlarr URL", data.prowlarrUrl],
    ["qBittorrent URL", data.qbittorrentUrl],
    ["slskd URL", data.slskdUrl],
  ] as const) {
    if (value.trim()) {
      const url = z.string().url(`${label} must be a valid URL`).safeParse(value);
      if (!url.success) {
        return { ok: false, error: url.error.issues[0]?.message ?? "Invalid URL" };
      }
    }
  }

  const prowlarrConfigured =
    data.prowlarrUrl.trim() && data.prowlarrApiKey.trim();
  const qbittorrentConfigured =
    data.qbittorrentUrl.trim() &&
    data.qbittorrentUsername.trim() &&
    data.qbittorrentPassword.trim();
  if (prowlarrConfigured || qbittorrentConfigured) {
    if (!prowlarrConfigured || !qbittorrentConfigured) {
      return {
        ok: false,
        error:
          "Track torrents need Prowlarr URL/key and qBittorrent URL/user/password.",
      };
    }
  }

  // Validate the path-map syntax up front so the user gets a helpful error
  // instead of seeing playback fail silently on the next request.
  if (data.mediaPathMap.trim()) {
    try {
      parsePathMap(data.mediaPathMap);
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : "Invalid media path map",
      };
    }
  }

  await saveSettings({
    lidarrUrl: data.lidarrUrl,
    // Sentinel = "leave existing key alone"; otherwise overwrite.
    ...(data.lidarrApiKey === KEY_UNCHANGED ? {} : { lidarrApiKey: data.lidarrApiKey }),
    lidarrDefaultProfileId: data.lidarrDefaultProfileId,
    lidarrRootFolderPath: data.lidarrRootFolderPath,
    prowlarrUrl: data.prowlarrUrl.trim() ? data.prowlarrUrl.trim() : null,
    ...(data.prowlarrApiKey === KEY_UNCHANGED
      ? {}
      : {
          prowlarrApiKey: data.prowlarrApiKey.trim()
            ? data.prowlarrApiKey.trim()
            : null,
        }),
    qbittorrentUrl: data.qbittorrentUrl.trim()
      ? data.qbittorrentUrl.trim()
      : null,
    qbittorrentUsername: data.qbittorrentUsername.trim()
      ? data.qbittorrentUsername.trim()
      : null,
    ...(data.qbittorrentPassword === KEY_UNCHANGED
      ? {}
      : {
          qbittorrentPassword: data.qbittorrentPassword.trim()
            ? data.qbittorrentPassword.trim()
            : null,
        }),
    trackTorrentCategory: data.trackTorrentCategory.trim()
      ? data.trackTorrentCategory.trim()
      : "audioseerr-tracks",
    trackTorrentSavePath: data.trackTorrentSavePath.trim()
      ? data.trackTorrentSavePath.trim()
      : null,
    trackTorrentMaxSizeMb: data.trackTorrentMaxSizeMb,
    slskdUrl: data.slskdUrl.trim() ? data.slskdUrl.trim() : null,
    ...(data.slskdApiKey === KEY_UNCHANGED
      ? {}
      : {
          slskdApiKey: data.slskdApiKey.trim() ? data.slskdApiKey.trim() : null,
        }),
    slskdDownloadPath: data.slskdDownloadPath.trim()
      ? data.slskdDownloadPath.trim()
      : null,
    lastFmApiKey: data.lastFmApiKey.trim() ? data.lastFmApiKey.trim() : null,
    mediaPathMap: data.mediaPathMap.trim() ? data.mediaPathMap.trim() : null,
  });

  revalidatePath("/admin/settings");
  return { ok: true };
}

export type LidarrProbeResult =
  | {
      ok: true;
      version: string;
      profiles: LidarrQualityProfile[];
      rootFolders: LidarrRootFolder[];
    }
  | { ok: false; error: string };

export type ProwlarrProbeResult =
  | { ok: true; status: ProwlarrStatus }
  | { ok: false; error: string };

export type QBittorrentProbeResult =
  | {
      ok: true;
      status: QBittorrentConnectionStatus;
      categoryExists: boolean | null;
    }
  | { ok: false; error: string };

/**
 * Live-tests a Lidarr URL/key (used both when changing config and when the
 * dropdowns need refreshing — Lidarr profiles can be added later). Mirrors
 * setup/actions.ts:testLidarrAction but without the "setup not yet complete"
 * guard since admins use it any time.
 */
export async function probeLidarrAction(input: {
  url: string;
  // The sentinel means "use the currently-stored key" — lets the user click
  // Test connection without re-typing their key every time.
  apiKey: string;
}): Promise<LidarrProbeResult> {
  await requireAdmin();

  let apiKey = input.apiKey;
  if (apiKey === KEY_UNCHANGED) {
    const saved = await getSettings();
    if (!saved.lidarrApiKey) {
      return { ok: false, error: "No saved API key — type one to test." };
    }
    apiKey = saved.lidarrApiKey;
  }

  const inputSchema = z.object({
    url: z.string().url(),
    apiKey: z.string().min(1),
  });
  const parsed = inputSchema.safeParse({ url: input.url, apiKey });
  if (!parsed.success) {
    return { ok: false, error: "URL and API key are required." };
  }

  try {
    const status = await testConnection(parsed.data);
    const [profiles, rootFolders] = await Promise.all([
      listQualityProfiles(parsed.data),
      listRootFolders(parsed.data),
    ]);
    return { ok: true, version: status.version, profiles, rootFolders };
  } catch (err) {
    return { ok: false, error: explainLidarrError(err) };
  }
}

export async function probeProwlarrAction(input: {
  url: string;
  apiKey: string;
}): Promise<ProwlarrProbeResult> {
  await requireAdmin();

  let apiKey = input.apiKey;
  if (apiKey === KEY_UNCHANGED) {
    const saved = await getSettings();
    if (!saved.prowlarrApiKey) {
      return { ok: false, error: "No saved Prowlarr API key — type one to test." };
    }
    apiKey = saved.prowlarrApiKey;
  }

  const parsed = z
    .object({ url: z.string().url(), apiKey: z.string().min(1) })
    .safeParse({ url: input.url, apiKey });
  if (!parsed.success) {
    return { ok: false, error: "Prowlarr URL and API key are required." };
  }

  try {
    const status = await testProwlarrConnection(parsed.data);
    return { ok: true, status };
  } catch (err) {
    return { ok: false, error: explainProwlarrError(err) };
  }
}

export async function probeQBittorrentAction(input: {
  url: string;
  username: string;
  password: string;
  category: string;
}): Promise<QBittorrentProbeResult> {
  await requireAdmin();

  let password = input.password;
  if (password === KEY_UNCHANGED) {
    const saved = await getSettings();
    if (!saved.qbittorrentPassword) {
      return {
        ok: false,
        error: "No saved qBittorrent password — type one to test.",
      };
    }
    password = saved.qbittorrentPassword;
  }

  const parsed = z
    .object({
      url: z.string().url(),
      username: z.string().min(1),
      password: z.string().min(1),
      category: z.string(),
    })
    .safeParse({ ...input, password });
  if (!parsed.success) {
    return {
      ok: false,
      error: "qBittorrent URL, username, and password are required.",
    };
  }

  try {
    const status = await testQBittorrentConnection({
      url: parsed.data.url,
      username: parsed.data.username,
      password: parsed.data.password,
    });
    const category = parsed.data.category.trim();
    return {
      ok: true,
      status,
      categoryExists: category
        ? Object.prototype.hasOwnProperty.call(status.categories, category)
        : null,
    };
  } catch (err) {
    return { ok: false, error: explainQBittorrentError(err) };
  }
}

export type SlskdProbeResult =
  | { ok: true }
  | { ok: false; error: string };

export async function probeSlskdAction(input: {
  url: string;
  apiKey: string;
}): Promise<SlskdProbeResult> {
  await requireAdmin();

  let apiKey = input.apiKey;
  if (apiKey === KEY_UNCHANGED) {
    const saved = await getSettings();
    if (!saved.slskdApiKey) {
      return { ok: false, error: "No saved slskd API key — type one to test." };
    }
    apiKey = saved.slskdApiKey;
  }

  const parsed = z
    .object({ url: z.string().url(), apiKey: z.string().min(1) })
    .safeParse({ url: input.url, apiKey });
  if (!parsed.success) {
    return { ok: false, error: "slskd URL and API key are required." };
  }

  try {
    await testSlskdConnection(parsed.data);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: explainSlskdError(err) };
  }
}

function explainSlskdError(err: unknown): string {
  if (err instanceof SlskdError) {
    if (err.status === 401 || err.status === 403) {
      return "API key was rejected by slskd.";
    }
    if (err.status === 404) return "slskd responded 404 — check the URL path.";
    return `slskd returned HTTP ${err.status}.`;
  }
  return explainNetworkError(err, "slskd");
}

function explainLidarrError(err: unknown): string {
  if (err instanceof LidarrError) {
    if (err.status === 401) return "API key was rejected by Lidarr.";
    if (err.status === 404) return "Lidarr responded 404 — check the URL path.";
    return `Lidarr returned HTTP ${err.status}.`;
  }
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
    const msg = cause?.message ?? err.message;
    if (cause?.code === "ENOTFOUND" || /ENOTFOUND/.test(msg)) {
      return "Hostname could not be resolved — check the URL.";
    }
    if (cause?.code === "ECONNREFUSED" || /ECONNREFUSED/.test(msg)) {
      return "Connection refused — is Lidarr running on that URL?";
    }
    if (cause?.code === "ETIMEDOUT" || /ETIMEDOUT/.test(msg)) {
      return "Connection timed out.";
    }
  }
  return "Could not connect to Lidarr.";
}

function explainProwlarrError(err: unknown): string {
  if (err instanceof ProwlarrError) {
    if (err.status === 401) return "API key was rejected by Prowlarr.";
    if (err.status === 404) return "Prowlarr responded 404 — check the URL path.";
    return `Prowlarr returned HTTP ${err.status}.`;
  }
  return explainNetworkError(err, "Prowlarr");
}

function explainQBittorrentError(err: unknown): string {
  if (err instanceof QBittorrentError) {
    if (err.status === 403 || err.status === 401) {
      return "qBittorrent rejected the login.";
    }
    if (err.status === 404) {
      return "qBittorrent responded 404 — check the Web UI URL.";
    }
    return err.message || `qBittorrent returned HTTP ${err.status}.`;
  }
  return explainNetworkError(err, "qBittorrent");
}

function explainNetworkError(err: unknown, service: string): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
    const msg = cause?.message ?? err.message;
    if (cause?.code === "ENOTFOUND" || /ENOTFOUND/.test(msg)) {
      return `${service} hostname could not be resolved — check the URL.`;
    }
    if (cause?.code === "ECONNREFUSED" || /ECONNREFUSED/.test(msg)) {
      return `Connection refused — is ${service} running on that URL?`;
    }
    if (cause?.code === "ETIMEDOUT" || /ETIMEDOUT/.test(msg)) {
      return `${service} connection timed out.`;
    }
    return msg;
  }
  return `Could not connect to ${service}.`;
}
