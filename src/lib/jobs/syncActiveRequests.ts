import { prisma } from "@/lib/db";
import {
  classifyAlbum,
  findAlbumByForeignId,
  getQueue,
  type LidarrAlbumState,
  type LidarrConfig,
} from "@/lib/lidarr";
import {
  attachDownloadedTrackToUser,
  registerDownloadedTrack,
  resolveDownloadedFilePath,
  upsertDownloadedTrack,
} from "@/lib/downloadedTracks";
import { getAlbum } from "@/lib/musicbrainz";
import { getSettings } from "@/lib/settings";
import {
  type AlbumFileMatch,
  albumFolderOf,
  classifyTransfer,
  getDownloadTransfer,
  listUserDownloads,
  matchAlbumFiles,
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
    const slskdAlbumRequests = slskdConfig ? await prisma.request.findMany({
      where: {
        status: { in: ["APPROVED", "DOWNLOADING"] },
        type: "ALBUM",
        slskdUsername: { not: null },
        slskdFile: { not: null },
      },
    }) : [];
    if (
      albumRequests.length === 0 &&
      trackRequests.length === 0 &&
      slskdAlbumRequests.length === 0
    ) {
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

    // Give a request this long to make progress before we give up and mark it
    // FAILED, so a stalled download can't pin a row in DOWNLOADING/APPROVED (and
    // the UI in "fetching") forever.
    const STUCK_AFTER_MS = 6 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const isStuck = (approvedAt: Date | null) =>
      approvedAt != null && nowMs - approvedAt.getTime() > STUCK_AFTER_MS;

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
        } else if (state === "missing" && isStuck(req.approvedAt)) {
          // Lidarr never found a release within the window — don't leave it
          // pinned in APPROVED/DOWNLOADING forever.
          await prisma.request.update({
            where: { id: req.id },
            data: {
              status: "FAILED",
              declineReason:
                "Lidarr found no release for this album within the expected time.",
            },
          });
          changed++;
        }
      } catch {
        // Per-request errors don't fail the whole cycle.
      }
    }

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

    for (const req of slskdAlbumRequests) {
      try {
        if (!slskdConfig || !req.slskdUsername || !req.slskdFile) continue;

        const transfers = await listUserDownloads(slskdConfig, req.slskdUsername);
        const folderTransfers = transfers.filter(
          (t) => albumFolderOf(t.filename) === req.slskdFile,
        );

        // No transfers under the folder — peer gone or slskd dropped them.
        if (folderTransfers.length === 0) {
          if (isStuck(req.approvedAt)) {
            await prisma.request.update({
              where: { id: req.id },
              data: {
                status: "FAILED",
                declineReason:
                  "Soulseek album download never started (no active transfers).",
              },
            });
            changed++;
          }
          continue;
        }

        // File→position mapping computed at approval (with durations). Fall back
        // to filename track-numbers (via the same matcher) if it's missing.
        let matches: AlbumFileMatch[] = [];
        if (req.slskdFilesJson) {
          try {
            matches = JSON.parse(req.slskdFilesJson) as AlbumFileMatch[];
          } catch {
            // fall through to the rebuild below
          }
        }
        if (matches.length === 0) {
          const album = await getAlbum(req.mbid);
          if (album) {
            matches = matchAlbumFiles(
              folderTransfers.map((t) => ({ filename: t.filename })),
              album.tracks,
            );
          }
        }

        const stateByFile = new Map(
          folderTransfers.map((t) => [t.filename, classifyTransfer(t.state)]),
        );
        const anyActive = [...stateByFile.values()].includes("active");

        // Tracks of this album already on disk (id by position), so we can both
        // skip re-scanning and attach THIS requester to shared files.
        const existing = new Map(
          (
            await prisma.downloadedTrack.findMany({
              where: { albumMbid: req.mbid },
              select: { id: true, albumPosition: true },
            })
          ).map((r) => [r.albumPosition, r.id]),
        );

        // Positions of this album now available to the requester (registered
        // this run or already on disk + attached). Drives the finalize decision.
        const availablePositions = new Set<number>();
        for (const m of matches) {
          const existingId = existing.get(m.position);
          if (existingId) {
            await attachDownloadedTrackToUser(req.requestedById, existingId);
            availablePositions.add(m.position);
            continue;
          }
          if (stateByFile.get(m.filename) !== "done") continue;
          if (!settings.slskdDownloadPath) continue;
          const absPath = await resolveDownloadedFilePath({
            slskdDownloadPath: settings.slskdDownloadPath,
            mediaPathMap: settings.mediaPathMap,
            remoteFilename: m.filename,
          });
          if (!absPath) continue;
          const id = await upsertDownloadedTrack(
            {
              recordingMbid: m.recordingMbid,
              albumMbid: req.mbid,
              albumPosition: m.position,
              title: m.title,
              artistName: req.artistName,
              albumTitle: req.title,
              coverUrl: req.coverUrl,
              durationMs: m.durationMs,
            },
            absPath,
            req.requestedById,
          );
          if (id) availablePositions.add(m.position);
        }

        if (!anyActive) {
          // All transfers terminal: AVAILABLE if this album produced any
          // playable tracks for the requester, else FAILED.
          await prisma.request.update({
            where: { id: req.id },
            data:
              availablePositions.size > 0
                ? { status: "AVAILABLE" }
                : {
                    status: "FAILED",
                    declineReason:
                      "Soulseek album download produced no playable tracks.",
                  },
          });
          changed++;
        } else if (req.status !== "DOWNLOADING") {
          await prisma.request.update({
            where: { id: req.id },
            data: { status: "DOWNLOADING" },
          });
          changed++;
        } else if (isStuck(req.approvedAt)) {
          await prisma.request.update({
            where: { id: req.id },
            data: {
              status: "FAILED",
              declineReason: "Soulseek album download timed out.",
            },
          });
          changed++;
        }
      } catch {
        // Per-request errors don't fail the whole cycle.
      }
    }

    return {
      scanned:
        albumRequests.length +
        trackRequests.length +
        slskdAlbumRequests.length,
      changed,
    };
  } finally {
    running = false;
  }
}
