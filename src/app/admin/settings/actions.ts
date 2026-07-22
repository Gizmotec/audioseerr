"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
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
  slskdUrl: z.string(),
  slskdApiKey: z.string(),
  slskdDownloadPath: z.string(),
  lastFmApiKey: z.string(),
  mediaPathMap: z.string(),
  preDownloadMixes: z.boolean(),
  notificationWebhookUrl: z.string(),
  lastFmApiSecret: z.string(),
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

  if (data.slskdUrl.trim()) {
    const url = z.string().url("slskd URL must be a valid URL").safeParse(data.slskdUrl);
    if (!url.success) {
      return { ok: false, error: url.error.issues[0]?.message ?? "Invalid URL" };
    }
  }

  if (data.notificationWebhookUrl.trim()) {
    const url = z
      .string()
      .url("Webhook URL must be a valid URL")
      .safeParse(data.notificationWebhookUrl.trim());
    if (!url.success) {
      return { ok: false, error: url.error.issues[0]?.message ?? "Invalid webhook URL" };
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
    slskdUrl: data.slskdUrl.trim() ? data.slskdUrl.trim() : null,
    ...(data.slskdApiKey === KEY_UNCHANGED
      ? {}
      : { slskdApiKey: data.slskdApiKey.trim() ? data.slskdApiKey.trim() : null }),
    slskdDownloadPath: data.slskdDownloadPath.trim()
      ? data.slskdDownloadPath.trim()
      : null,
    lastFmApiKey: data.lastFmApiKey.trim() ? data.lastFmApiKey.trim() : null,
    mediaPathMap: data.mediaPathMap.trim() ? data.mediaPathMap.trim() : null,
    preDownloadMixes: data.preDownloadMixes,
    notificationWebhookUrl: data.notificationWebhookUrl.trim()
      ? data.notificationWebhookUrl.trim()
      : null,
    ...(data.lastFmApiSecret === KEY_UNCHANGED
      ? {}
      : {
          lastFmApiSecret: data.lastFmApiSecret.trim()
            ? data.lastFmApiSecret.trim()
            : null,
        }),
  });

  revalidatePath("/admin/settings");
  return { ok: true };
}

export type SlskdProbeResult = { ok: true } | { ok: false; error: string };

export type WebhookPingResult = { ok: true } | { ok: false; error: string };

/**
 * "Send test notification" button on the Notifications settings card. Posts a
 * small PING payload to the given URL so the admin can verify the receiver
 * before saving. 4s timeout, same as real deliveries.
 */
export async function pingWebhookAction(input: {
  url: string;
}): Promise<WebhookPingResult> {
  await requireAdmin();

  const parsed = z.string().url().safeParse(input.url.trim());
  if (!parsed.success) {
    return { ok: false, error: "Enter a valid webhook URL to test." };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(parsed.data, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: "PING",
        message: "Test notification from Audioseerr.",
        timestamp: new Date().toISOString(),
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { ok: false, error: `Webhook responded HTTP ${res.status}.` };
    }
    return { ok: true };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: "Webhook timed out after 4 seconds." };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not reach the webhook.",
    };
  } finally {
    clearTimeout(timer);
  }
}

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
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
    const msg = cause?.message ?? err.message;
    if (cause?.code === "ENOTFOUND" || /ENOTFOUND/.test(msg)) {
      return "slskd hostname could not be resolved — check the URL.";
    }
    if (cause?.code === "ECONNREFUSED" || /ECONNREFUSED/.test(msg)) {
      return "Connection refused — is slskd running on that URL?";
    }
    if (cause?.code === "ETIMEDOUT" || /ETIMEDOUT/.test(msg)) {
      return "slskd connection timed out.";
    }
    return msg;
  }
  return "Could not connect to slskd.";
}
