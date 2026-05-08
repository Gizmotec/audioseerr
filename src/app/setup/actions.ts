"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  LidarrError,
  type LidarrQualityProfile,
  type LidarrRootFolder,
  listQualityProfiles,
  listRootFolders,
  testConnection,
} from "@/lib/lidarr";

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
import { isSetupComplete, saveSettings } from "@/lib/settings";

const lidarrInput = z.object({
  url: z.string().url("Must be a valid URL"),
  apiKey: z.string().min(1, "Required"),
});

export type LidarrTestResult =
  | {
      ok: true;
      version: string;
      profiles: LidarrQualityProfile[];
      rootFolders: LidarrRootFolder[];
    }
  | { ok: false; error: string };

export async function testLidarrAction(input: {
  url: string;
  apiKey: string;
}): Promise<LidarrTestResult> {
  if (await isSetupComplete()) {
    return { ok: false, error: "Setup is already complete." };
  }

  const parsed = lidarrInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
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

const finalizeInput = z.object({
  admin: z.object({
    username: z.string().min(2).max(64),
    email: z.string().email(),
    password: z.string().min(8, "At least 8 characters"),
  }),
  lidarr: z.object({
    url: z.string().url(),
    apiKey: z.string().min(1),
    qualityProfileId: z.number().int(),
    rootFolderPath: z.string().min(1),
  }),
  lastFmApiKey: z.string().optional().or(z.literal("")),
});

export async function finalizeSetupAction(
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (await isSetupComplete()) {
    return { ok: false, error: "Setup is already complete." };
  }

  const parsed = finalizeInput.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const { admin, lidarr, lastFmApiKey } = parsed.data;

  const usernameTaken = await prisma.user.findUnique({ where: { username: admin.username } });
  if (usernameTaken) return { ok: false, error: "Username already in use." };
  const emailTaken = await prisma.user.findUnique({ where: { email: admin.email } });
  if (emailTaken) return { ok: false, error: "Email already in use." };

  const passwordHash = await bcrypt.hash(admin.password, 10);

  await prisma.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        username: admin.username,
        email: admin.email,
        passwordHash,
        role: "ADMIN",
        requestQuota: 0,
      },
    });
  });

  await saveSettings({
    lidarrUrl: lidarr.url,
    lidarrApiKey: lidarr.apiKey,
    lidarrDefaultProfileId: lidarr.qualityProfileId,
    lidarrRootFolderPath: lidarr.rootFolderPath,
    lastFmApiKey: lastFmApiKey?.trim() ? lastFmApiKey.trim() : null,
    setupComplete: true,
  });

  return { ok: true };
}
