import { prisma } from "@/lib/db";
import {
  classifyAlbum,
  findAlbumByForeignId,
  getQueue,
  type LidarrAlbumState,
  type LidarrConfig,
} from "@/lib/lidarr";
import { getSettings } from "@/lib/settings";
import type { RequestStatus } from "@prisma/client";

let running = false;

/**
 * Runs through APPROVED / DOWNLOADING requests and reconciles their status
 * against Lidarr (design doc §10). One run per cycle — overlapping calls bail
 * out so a slow Lidarr can't pile up workers.
 */
export async function syncActiveRequests(): Promise<{
  scanned: number;
  changed: number;
}> {
  if (running) return { scanned: 0, changed: 0 };
  running = true;
  try {
    const settings = await getSettings();
    if (
      !settings.lidarrUrl ||
      !settings.lidarrApiKey ||
      !settings.setupComplete
    ) {
      return { scanned: 0, changed: 0 };
    }
    const config: LidarrConfig = {
      url: settings.lidarrUrl,
      apiKey: settings.lidarrApiKey,
    };

    const requests = await prisma.request.findMany({
      where: {
        status: { in: ["APPROVED", "DOWNLOADING"] },
        type: "ALBUM",
        lidarrId: { not: null },
      },
    });
    if (requests.length === 0) return { scanned: 0, changed: 0 };

    let queueAlbumIds = new Set<number>();
    try {
      const queue = await getQueue(config);
      queueAlbumIds = new Set(
        queue.map((q) => q.albumId).filter((id): id is number => typeof id === "number"),
      );
    } catch {
      // If the queue endpoint hiccups, treat queue as empty — we'll still
      // catch completions via track counts.
    }

    let changed = 0;
    for (const req of requests) {
      try {
        const album = await findAlbumByForeignId(config, req.lidarrId!, req.mbid);
        if (!album) continue;

        const state: LidarrAlbumState = classifyAlbum(album, queueAlbumIds);
        const next: RequestStatus | null =
          state === "downloaded"
            ? "AVAILABLE"
            : state === "downloading" && req.status !== "DOWNLOADING"
              ? "DOWNLOADING"
              : null;
        if (next && next !== req.status) {
          await prisma.request.update({
            where: { id: req.id },
            data: { status: next },
          });
          changed++;
        }
      } catch {
        // Per-request errors don't fail the whole cycle.
      }
    }

    return { scanned: requests.length, changed };
  } finally {
    running = false;
  }
}
