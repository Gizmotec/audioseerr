import { prisma } from "@/lib/db";
import {
  classifyAlbum,
  findAlbumByForeignId,
  getQueue,
  type LidarrAlbumState,
  type LidarrConfig,
} from "@/lib/lidarr";
import {
  registerDownloadedTrack,
  resolveDownloadedFilePath,
} from "@/lib/downloadedTracks";
import { getSettings } from "@/lib/settings";
import {
  classifyTransfer,
  getDownloadTransfer,
  type SlskdConfig,
} from "@/lib/slskd";
import { attachLibraryItemToUser } from "@/lib/userLibrary";
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
    const slskdConfig: SlskdConfig | null =
      settings.slskdUrl && settings.slskdApiKey
        ? { url: settings.slskdUrl, apiKey: settings.slskdApiKey }
        : null;

    const albumRequests = lidarrConfig ? await prisma.request.findMany({
      where: {
        status: { in: ["APPROVED", "DOWNLOADING"] },
        type: "ALBUM",
        lidarrId: { not: null },
      },
    }) : [];
    const trackRequests = slskdConfig ? await prisma.request.findMany({
      where: {
        status: { in: ["APPROVED", "DOWNLOADING"] },
        type: "TRACK",
        slskdUsername: { not: null },
        slskdFile: { not: null },
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
          // Album just became playable — attach the requester to it so the
          // album shows up in their /library and unlocks streaming. The
          // syncLibrary job upserts LibraryItem before this runs, so the FK
          // target exists.
          if (next === "AVAILABLE") {
            await attachLibraryItemToUser(req.requestedById, req.mbid).catch(() => {
              // Don't fail the cycle if the LibraryItem hasn't been synced
              // yet on this tick — next sync will catch up.
            });
          }
          changed++;
        }
      } catch {
        // Per-request errors don't fail the whole cycle.
      }
    }

    // Give a track request this long to make progress before we give up and
    // mark it FAILED, so a vanished transfer or an unlocatable file can't pin a
    // row in DOWNLOADING (and the UI in "fetching") forever.
    const STUCK_AFTER_MS = 6 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const isStuck = (approvedAt: Date | null) =>
      approvedAt != null && nowMs - approvedAt.getTime() > STUCK_AFTER_MS;

    for (const req of trackRequests) {
      try {
        if (!slskdConfig || !req.slskdUsername || !req.slskdFile) continue;
        const transfer = await getDownloadTransfer(
          slskdConfig,
          req.slskdUsername,
          req.slskdFile,
        );

        // No transfer record — peer offline, slskd dropped/auto-removed it, or
        // the enqueue never took. Retry for a while, then fail so the row
        // doesn't stay DOWNLOADING indefinitely.
        if (!transfer) {
          if (isStuck(req.approvedAt)) {
            await prisma.request.update({
              where: { id: req.id },
              data: {
                status: "FAILED",
                declineReason:
                  "Soulseek download never started (no active transfer).",
              },
            });
            changed++;
          }
          continue;
        }

        const state = classifyTransfer(transfer.state);

        if (state === "failed") {
          await prisma.request.update({
            where: { id: req.id },
            data: {
              status: "FAILED",
              declineReason: `Soulseek transfer failed (${transfer.state}).`,
            },
          });
          changed++;
          continue;
        }

        if (state === "done" && req.status !== "AVAILABLE") {
          // slskd reports the transfer done; find the file it wrote and
          // register it as a playable DownloadedTrack.
          let registeredId: string | null = null;
          if (settings.slskdDownloadPath) {
            const absPath = await resolveDownloadedFilePath({
              slskdDownloadPath: settings.slskdDownloadPath,
              mediaPathMap: settings.mediaPathMap,
              remoteFilename: req.slskdFile,
            });
            if (absPath) registeredId = await registerDownloadedTrack(req, absPath);
          }

          if (registeredId) {
            await prisma.request.update({
              where: { id: req.id },
              data: { status: "AVAILABLE" },
            });
            changed++;
          } else {
            // Not landed yet, path unset, or filename couldn't be matched.
            // Retry next tick — but fail once it's clearly been too long so it
            // can't stick forever.
            console.warn(
              `[sync] track request ${req.id} reports done but file unresolved (path=${settings.slskdDownloadPath ?? "unset"}, file=${req.slskdFile}).`,
            );
            if (isStuck(req.approvedAt)) {
              await prisma.request.update({
                where: { id: req.id },
                data: {
                  status: "FAILED",
                  declineReason:
                    "Download finished but the file couldn't be located on disk — check the slskd download path and path map.",
                },
              });
              changed++;
            }
          }
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
