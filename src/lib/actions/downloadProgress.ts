"use server";

// Live download-progress lookup for the whole UI. slskd already reports
// per-transfer bytes/percent; we surface it without persisting anything, so the
// bar is always accurate against slskd (the 2-min sync job still owns the
// DB status flip to AVAILABLE/FAILED once a file lands on disk).
//
// Items are keyed twice on the client: by request id (the /requests rows know
// it) and by request mbid (track rows know their own key but never the request
// id). Requests that only just settled are kept in the list for a short window
// so a watching client can render the finish instead of watching the row
// silently vanish.

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

export type DownloadProgressState = "queued" | "active" | "done" | "failed";

export type DownloadProgressItem = {
  id: string;
  /** The request's mbid — recordingMbid, or `albumMbid:position` for a track
   *  MusicBrainz has no recording id for. Matches the key track rows compute. */
  mbid: string;
  /** 0–100, or null when slskd hasn't reported usable bytes yet (queued). */
  percent: number | null;
  state: DownloadProgressState;
  /** Still PENDING — nobody has approved it, so nothing is searching yet. */
  awaitingApproval: boolean;
  /** The request row itself reached AVAILABLE/FAILED — it's in this list only
   *  because it settled recently. Clients use this to end a progress render;
   *  they must not start one from it (or a reload would replay the finish). */
  settled: boolean;
  /** False for requests belonging to another user (admins see everyone's).
   *  Only the caller's own requests are matched to track rows by mbid. */
  mine: boolean;
};

export type DownloadProgressResult = {
  items: DownloadProgressItem[];
  /** False when the lookup itself failed — clients keep their last-known values
   *  rather than reading an empty list as "everything finished". */
  ok: boolean;
};

/** How long a settled request stays in the list so a watching client sees it. */
const SETTLED_WINDOW_MS = 10 * 60 * 1000;

/** Upper bound on rows considered — only matters for admins, who see everyone's. */
const MAX_ROWS = 200;

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
 * not configured) returns `ok: false` so the UI holds its last-known state
 * instead of reading the empty list as a wave of completions.
 */
export async function getDownloadProgressAction(): Promise<DownloadProgressResult> {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return { items: [], ok: true };
    const isAdmin = (session.user as { role?: string }).role === "ADMIN";

    // DB first: the common case is "nothing in flight", and that shouldn't cost
    // a settings read or an slskd round-trip.
    const settledCutoff = new Date(Date.now() - SETTLED_WINDOW_MS);
    const requests = await prisma.request.findMany({
      where: {
        ...(isAdmin ? {} : { requestedById: userId }),
        OR: [
          { status: { in: ["PENDING", "APPROVED", "DOWNLOADING"] } },
          // approvedAt doubles as "when this row last moved" for terminal
          // states — there's no updatedAt on Request.
          {
            status: { in: ["AVAILABLE", "FAILED"] },
            approvedAt: { gte: settledCutoff },
          },
        ],
      },
      select: {
        id: true,
        type: true,
        mbid: true,
        status: true,
        requestedById: true,
        slskdUsername: true,
        slskdFile: true,
      },
      orderBy: { requestedAt: "desc" },
      take: MAX_ROWS,
    });
    if (requests.length === 0) return { items: [], ok: true };

    const items: DownloadProgressItem[] = [];
    const base = (r: (typeof requests)[number]) => ({
      id: r.id,
      mbid: r.mbid,
      mine: r.requestedById === userId,
      awaitingApproval: r.status === "PENDING",
    });

    // Settled and not-yet-approved rows need no slskd call at all.
    const live: typeof requests = [];
    for (const r of requests) {
      if (r.status === "AVAILABLE" || r.status === "FAILED") {
        items.push({
          ...base(r),
          percent: r.status === "AVAILABLE" ? 100 : null,
          state: r.status === "AVAILABLE" ? "done" : "failed",
          settled: true,
        });
      } else if (!r.slskdUsername || !r.slskdFile) {
        // Waiting on approval, or approved but still searching Soulseek.
        items.push({ ...base(r), percent: null, state: "queued", settled: false });
      } else {
        live.push(r);
      }
    }
    if (live.length === 0) return { items, ok: true };

    const settings = await getSettings();
    if (!settings.slskdUrl || !settings.slskdApiKey) {
      // No slskd configured — the transfers are still in flight as far as the
      // DB knows, so report them as queued rather than dropping them.
      for (const r of live) {
        items.push({ ...base(r), percent: null, state: "queued", settled: false });
      }
      return { items, ok: true };
    }
    const slskd: SlskdConfig = {
      url: settings.slskdUrl,
      apiKey: settings.slskdApiKey,
    };

    // One slskd call per unique peer, reused across that peer's requests.
    const usernames = [
      ...new Set(live.map((r) => r.slskdUsername).filter((u): u is string => !!u)),
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

    for (const req of live) {
      if (!req.slskdUsername || !req.slskdFile) continue;
      const transfers = byUser.get(req.slskdUsername) ?? [];

      if (req.type === "ALBUM") {
        const folderTransfers = transfers.filter(
          (t) => albumFolderOf(t.filename) === req.slskdFile,
        );
        if (folderTransfers.length === 0) {
          items.push({ ...base(req), percent: null, state: "queued", settled: false });
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
        items.push({ ...base(req), percent, state, settled: false });
        continue;
      }

      // TRACK: match the single remote file (basename fallback, as the sync job does).
      const target = baseName(req.slskdFile);
      const t =
        transfers.find((x) => x.filename === req.slskdFile) ??
        transfers.find((x) => baseName(x.filename) === target);
      if (!t) {
        items.push({ ...base(req), percent: null, state: "queued", settled: false });
        continue;
      }
      const state = classifyTransfer(t.state);
      const percent = transferPercent(t) ?? (state === "done" ? 100 : null);
      items.push({ ...base(req), percent, state, settled: false });
    }

    return { items, ok: true };
  } catch {
    return { items: [], ok: false };
  }
}
