"use server";

// Live download-progress lookup for the Requests UI. slskd already reports
// per-transfer bytes/percent; we surface it without persisting anything, so the
// bar is always accurate against slskd (the 2-min sync job still owns the
// DB status flip to AVAILABLE/FAILED once a file lands on disk).

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import {
  albumFolderOf,
  baseName,
  classifyTransfer,
  listUserDownloads,
  type SlskdConfig,
  type SlskdTransfer,
} from "@/lib/slskd";

export type DownloadProgressItem = {
  id: string;
  /** 0–100, or null when slskd hasn't reported usable bytes yet (queued). */
  percent: number | null;
  state: "active" | "done" | "failed";
};

export type DownloadProgressResult = { items: DownloadProgressItem[] };

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Prefer bytes (unambiguous) over slskd's own percentComplete. */
function transferPercent(t: SlskdTransfer): number | null {
  if (
    typeof t.size === "number" &&
    t.size > 0 &&
    typeof t.bytesTransferred === "number"
  ) {
    return clampPct((t.bytesTransferred / t.size) * 100);
  }
  if (typeof t.percentComplete === "number") return clampPct(t.percentComplete);
  return null;
}

/**
 * Live progress for the caller's in-flight requests. Admins see everyone's;
 * regular users see only their own. Best-effort: any failure (slskd down,
 * not configured) returns an empty list so the UI just falls back to badges.
 */
export async function getDownloadProgressAction(): Promise<DownloadProgressResult> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return { items: [] };
    const isAdmin = (session.user as { role?: string }).role === "ADMIN";

    const settings = await getSettings();
    if (!settings.slskdUrl || !settings.slskdApiKey) return { items: [] };
    const slskd: SlskdConfig = {
      url: settings.slskdUrl,
      apiKey: settings.slskdApiKey,
    };

    const requests = await prisma.request.findMany({
      where: {
        status: { in: ["APPROVED", "DOWNLOADING"] },
        slskdUsername: { not: null },
        slskdFile: { not: null },
        ...(isAdmin ? {} : { requestedById: userId }),
      },
      select: { id: true, type: true, slskdUsername: true, slskdFile: true },
    });
    if (requests.length === 0) return { items: [] };

    // One slskd call per unique peer, reused across that peer's requests.
    const usernames = [
      ...new Set(
        requests
          .map((r) => r.slskdUsername)
          .filter((u): u is string => !!u),
      ),
    ];
    const byUser = new Map<string, SlskdTransfer[]>();
    await Promise.all(
      usernames.map(async (u) => {
        try {
          byUser.set(u, await listUserDownloads(slskd, u));
        } catch {
          byUser.set(u, []);
        }
      }),
    );

    const items: DownloadProgressItem[] = [];
    for (const req of requests) {
      if (!req.slskdUsername || !req.slskdFile) continue;
      const transfers = byUser.get(req.slskdUsername) ?? [];

      if (req.type === "ALBUM") {
        const folderTransfers = transfers.filter(
          (t) => albumFolderOf(t.filename) === req.slskdFile,
        );
        if (folderTransfers.length === 0) {
          items.push({ id: req.id, percent: null, state: "active" });
          continue;
        }
        const states = folderTransfers.map((t) => classifyTransfer(t.state));
        const state = states.includes("active")
          ? "active"
          : states.includes("done")
            ? "done"
            : "failed";
        const pcts = folderTransfers
          .map(transferPercent)
          .filter((p): p is number => p != null);
        const percent = pcts.length
          ? clampPct(pcts.reduce((s, p) => s + p, 0) / pcts.length)
          : state === "done"
            ? 100
            : null;
        items.push({ id: req.id, percent, state });
        continue;
      }

      // TRACK: match the single remote file (basename fallback, as the sync job does).
      const target = baseName(req.slskdFile);
      const t =
        transfers.find((x) => x.filename === req.slskdFile) ??
        transfers.find((x) => baseName(x.filename) === target);
      if (!t) {
        items.push({ id: req.id, percent: null, state: "active" });
        continue;
      }
      const state = classifyTransfer(t.state);
      const percent = transferPercent(t) ?? (state === "done" ? 100 : null);
      items.push({ id: req.id, percent, state });
    }

    return { items };
  } catch {
    return { items: [] };
  }
}
