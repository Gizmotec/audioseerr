"use server";

import { auth } from "@/auth";
import { importLastFmHistoryForUser } from "@/lib/importHistory";

export type ImportHistoryResult =
  | { ok: true; imported: number; skipped: number }
  | { ok: false; error: string };

/** Session-gated wrapper around importLastFmHistoryForUser (which see). */
export async function importLastFmHistoryAction(): Promise<ImportHistoryResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };

  try {
    const outcome = await importLastFmHistoryForUser(userId);
    switch (outcome.status) {
      case "ok":
        return { ok: true, imported: outcome.imported, skipped: outcome.skipped };
      case "not_connected":
        return { ok: false, error: "Connect Last.fm first." };
      case "unconfigured":
        return { ok: false, error: "Last.fm isn't configured on this server." };
    }
  } catch (e) {
    console.warn("[lastfm] history import failed:", e);
    return {
      ok: false,
      error: "Couldn't import from Last.fm right now. Try again later.",
    };
  }
}
