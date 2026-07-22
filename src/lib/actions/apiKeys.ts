"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { apiKeyDisplayPrefix, generateApiKey, hashApiKey } from "@/lib/apiKeys";
import { prisma } from "@/lib/db";

type ActionResult = { ok: true } | { ok: false; error: string };

const LABEL_MAX_LENGTH = 100;

/**
 * Create an API key for the signed-in user. The RAW key is returned exactly
 * once — only its sha256 digest + display prefix are persisted, so it can
 * never be retrieved again after the client shows it.
 */
export async function createApiKeyAction(input: {
  label: string;
}): Promise<{ ok: true; id: string; key: string; prefix: string } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };

  const label = input.label.trim();
  if (!label) return { ok: false, error: "Label is required." };
  if (label.length > LABEL_MAX_LENGTH) {
    return { ok: false, error: `Label must be ${LABEL_MAX_LENGTH} characters or fewer.` };
  }

  const rawKey = generateApiKey();
  const created = await prisma.apiKey.create({
    data: {
      userId,
      label,
      prefix: apiKeyDisplayPrefix(rawKey),
      keyHash: hashApiKey(rawKey),
    },
  });

  revalidatePath("/account/api-keys");
  return { ok: true, id: created.id, key: rawKey, prefix: created.prefix };
}

/** Revoke one of the signed-in user's own keys (deleteMany scoped to userId —
 * a key id belonging to someone else simply matches nothing). */
export async function revokeApiKeyAction(id: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };

  const result = await prisma.apiKey.deleteMany({ where: { id, userId } });
  if (result.count === 0) return { ok: false, error: "Key not found." };

  revalidatePath("/account/api-keys");
  return { ok: true };
}
