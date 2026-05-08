"use server";

import { auth } from "@/auth";
import { recordPlay, type RecordPlayInput } from "@/lib/playHistory";

export async function recordPlayAction(
  input: RecordPlayInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };

  await recordPlay(userId, input);
  return { ok: true };
}
