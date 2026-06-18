"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { SlskdError, testSlskdConnection } from "@/lib/slskd";
import { isSetupComplete, saveSettings } from "@/lib/settings";

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
      return "Hostname could not be resolved — check the URL.";
    }
    if (cause?.code === "ECONNREFUSED" || /ECONNREFUSED/.test(msg)) {
      return "Connection refused — is slskd running on that URL?";
    }
    if (cause?.code === "ETIMEDOUT" || /ETIMEDOUT/.test(msg)) {
      return "Connection timed out.";
    }
  }
  return "Could not connect to slskd.";
}

const slskdInput = z.object({
  url: z.string().url("Must be a valid URL"),
  apiKey: z.string().min(1, "Required"),
});

export type SlskdTestResult = { ok: true } | { ok: false; error: string };

export async function testSlskdAction(input: {
  url: string;
  apiKey: string;
}): Promise<SlskdTestResult> {
  if (await isSetupComplete()) {
    return { ok: false, error: "Setup is already complete." };
  }

  const parsed = slskdInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  try {
    await testSlskdConnection(parsed.data);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: explainSlskdError(err) };
  }
}

const finalizeInput = z.object({
  admin: z.object({
    username: z.string().min(2).max(64),
    email: z.string().email(),
    password: z.string().min(8, "At least 8 characters"),
  }),
  slskd: z.object({
    url: z.string().url(),
    apiKey: z.string().min(1),
    downloadPath: z.string().optional().or(z.literal("")),
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
  const { admin, slskd, lastFmApiKey } = parsed.data;

  const usernameTaken = await prisma.user.findUnique({ where: { username: admin.username } });
  if (usernameTaken) return { ok: false, error: "Username already in use." };
  const emailTaken = await prisma.user.findUnique({ where: { email: admin.email } });
  if (emailTaken) return { ok: false, error: "Email already in use." };

  const passwordHash = await bcrypt.hash(admin.password, 10);

  await prisma.user.create({
    data: {
      username: admin.username,
      email: admin.email,
      passwordHash,
      role: "ADMIN",
      requestQuota: 0,
    },
  });

  await saveSettings({
    slskdUrl: slskd.url,
    slskdApiKey: slskd.apiKey,
    slskdDownloadPath: slskd.downloadPath?.trim() ? slskd.downloadPath.trim() : null,
    lastFmApiKey: lastFmApiKey?.trim() ? lastFmApiKey.trim() : null,
    setupComplete: true,
  });

  return { ok: true };
}
