import { prisma } from "@/lib/db";
import {
  classifyAlbum,
  findAlbumByForeignId,
  getQueue,
  type LidarrAlbumState,
  type LidarrConfig,
} from "@/lib/lidarr";
import { getTorrent, type QBittorrentConfig } from "@/lib/qbittorrent";
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
    if (!settings.setupComplete) {
      return { scanned: 0, changed: 0 };
    }
    const lidarrConfig: LidarrConfig | null =
      settings.lidarrUrl && settings.lidarrApiKey
        ? { url: settings.lidarrUrl, apiKey: settings.lidarrApiKey }
        : null;
    const qbittorrentConfig: QBittorrentConfig | null =
      settings.qbittorrentUrl &&
      settings.qbittorrentUsername &&
      settings.qbittorrentPassword
        ? {
            url: settings.qbittorrentUrl,
            username: settings.qbittorrentUsername,
            password: settings.qbittorrentPassword,
          }
        : null;

    const albumRequests = lidarrConfig ? await prisma.request.findMany({
      where: {
        status: { in: ["APPROVED", "DOWNLOADING"] },
        type: "ALBUM",
        lidarrId: { not: null },
      },
    }) : [];
    const trackRequests = qbittorrentConfig ? await prisma.request.findMany({
      where: {
        status: { in: ["APPROVED", "DOWNLOADING"] },
        type: "TRACK",
        torrentHash: { not: null },
      },
    }) : [];
    if (albumRequests.length === 0 && trackRequests.length === 0) {
      return { scanned: 0, changed: 0 };
    }

    let queueAlbumIds = new Set<number>();
    if (lidarrConfig) {
      try {
        const queue = await getQueue(lidarrConfig);
        queueAlbumIds = new Set(
          queue
            .map((q) => q.albumId)
            .filter((id): id is number => typeof id === "number"),
        );
      } catch {
        // If the queue endpoint hiccups, treat queue as empty — we'll still
        // catch completions via track counts.
      }
    }

    let changed = 0;
    for (const req of albumRequests) {
      try {
        if (!lidarrConfig) continue;
        const album = await findAlbumByForeignId(
          lidarrConfig,
          req.lidarrId!,
          req.mbid,
        );
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

    for (const req of trackRequests) {
      try {
        if (!qbittorrentConfig || !req.torrentHash) continue;
        const torrent = await getTorrent(qbittorrentConfig, req.torrentHash);
        if (!torrent) continue;
        const done = torrent.progress >= 1 || /uploading|stalledUP|pausedUP/i.test(torrent.state);
        if (done && req.status !== "AVAILABLE") {
          await prisma.request.update({
            where: { id: req.id },
            data: { status: "AVAILABLE" },
          });
          changed++;
        }
      } catch {
        // Per-request errors don't fail the whole cycle.
      }
    }

    return { scanned: albumRequests.length + trackRequests.length, changed };
  } finally {
    running = false;
  }
}
