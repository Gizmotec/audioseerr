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
  lastFmApiKey: z.string(),
  mediaPathMap: z.string(),
  registrationMode: z.enum(["CLOSED", "OPEN"]),
  requireApproval: z.union([z.boolean(), z.literal("on"), z.literal("")]).transform(
    (v) => v === true || v === "on",
  ),
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
    lastFmApiKey: data.lastFmApiKey.trim() ? data.lastFmApiKey.trim() : null,
    mediaPathMap: data.mediaPathMap.trim() ? data.mediaPathMap.trim() : null,
    registrationMode: data.registrationMode,
    requireApproval: data.requireApproval,
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

