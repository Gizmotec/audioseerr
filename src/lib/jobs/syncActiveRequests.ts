import { prisma } from "@/lib/db";
import {
  attachDownloadedTrackToUser,
  registerDownloadedTrack,
  resolveDownloadedFilePath,
  upsertDownloadedTrack,
} from "@/lib/downloadedTracks";
import { getAlbum } from "@/lib/musicbrainz";
import { getSettings } from "@/lib/settings";
import { notifyRequestTransition } from "@/lib/notifications";
import { isTrackSearchDue } from "@/lib/trackSearchPolicy";
import {
  type AlbumFileMatch,
  albumFolderOf,
  baseName,
  classifyTransfer,
  enqueueDownload,
  findTrackCandidatesWithFallback,
  getDownloadTransfer,
  listUserDownloads,
  matchAlbumFiles,
  searchTracks,
  type SlskdConfig,
} from "@/lib/slskd";
import { syncDownloadedLibrary } from "./syncDownloadedLibrary";

// Background Soulseek search window. Generous because peers trickle responses in
// over ~15-25s; the old inline 4s/8s window missed slow peers and produced false
// "no files" for songs that are actually shared. We're off the request path here
// so a long search is fine.
const SEARCH_TIMEOUT_MS = 15000;
const SEARCH_MAX_WAIT_MS = 30000;
// Searches per run, so a big playlist import can't monopolise one cycle and
// starve transfer/library reconciliation; the rest get searched next tick.
// ponytail: serial + capped; raise or parallelise if drain latency matters.
const SEARCH_BUDGET_PER_RUN = 5;
// Rows inspected before applying the per-request age-based retry policy. This
// stays bounded while comfortably covering normal request backlogs.
const SEARCH_SCAN_BUDGET = 250;
// Ranked candidates kept for peer failover on transfer errors.
const CANDIDATE_SHORTLIST = 8;

type TrackCandidate = { username: string; filename: string; size: number };

// A run is allowed this long before the next tick assumes it wedged (a
// never-settling network call) and starts fresh. Far above any healthy run:
// 5 searches × ~30s + reconciliation is well under 5 minutes.
const STUCK_RUN_MS = 15 * 60 * 1000;

let running = false;
let runToken = 0;
let runningSince = 0;

/**
 * Reconciles APPROVED / DOWNLOADING track + album requests against slskd
 * transfers, registering finished files into the library. One run per cycle —
 * overlapping calls bail out so a slow slskd can't pile up workers.
 */
export async function syncActiveRequests(): Promise<{
  scanned: number;
  changed: number;
}> {
  if (running) {
    if (Date.now() - runningSince < STUCK_RUN_MS) {
      return { scanned: 0, changed: 0 };
    }
    // The previous run never settled — without this escape hatch the guard
    // stays pinned for the process's lifetime and the job silently dies.
    console.warn(
      "[sync] previous syncActiveRequests run exceeded 15m; assuming it wedged and starting fresh.",
    );
  }
  running = true;
  runningSince = Date.now();
  const token = ++runToken;
  try {
    const settings = await getSettings();
    if (!settings.setupComplete) {
      return { scanned: 0, changed: 0 };
    }
    const slskdConfig: SlskdConfig | null =
      settings.slskdUrl && settings.slskdApiKey
        ? { url: settings.slskdUrl, apiKey: settings.slskdApiKey }
        : null;

    let changed = 0;

    // Search pass: newly-approved TRACK requests (no transfer enqueued yet) get
    // their Soulseek search here — in the background, with a generous window.
    // Runs before the reconciliation queries so a fresh approval isn't skipped
    // by the empty-inflight early-return below.
    if (slskdConfig) changed += await runTrackSearches(slskdConfig);

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
    if (trackRequests.length === 0 && slskdAlbumRequests.length === 0) {
      if (changed > 0) await syncDownloadedLibrary().catch(() => {});
      return { scanned: 0, changed };
    }

    // Give a request this long to make progress before we give up and mark it
    // FAILED, so a stalled download can't pin a row in DOWNLOADING/APPROVED (and
    // the UI in "fetching") forever.
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
            const reason =
              "Soulseek download never started (no active transfer).";
            await prisma.request.update({
              where: { id: req.id },
              data: {
                status: "FAILED",
                declineReason: reason,
              },
            });
            await notifyRequestTransition(req, "REQUEST_FAILED", { reason });
            changed++;
          }
          continue;
        }

        const state = classifyTransfer(transfer.state);

        if (state === "failed") {
          // The chosen peer errored — fail over to the next-ranked candidate
          // before giving up. Only mark FAILED once the shortlist is exhausted.
          if (await failoverTrack(slskdConfig, req)) {
            changed++;
            continue;
          }
          await prisma.request.update({
            where: { id: req.id },
            data: {
              status: "FAILED",
              declineReason: `Soulseek transfer failed (${transfer.state}).`,
            },
          });
          await notifyRequestTransition(req, "REQUEST_FAILED", {
            reason: `Soulseek transfer failed (${transfer.state}).`,
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
            await notifyRequestTransition(req, "REQUEST_AVAILABLE");
            changed++;
          } else {
            // Not landed yet, path unset, or filename couldn't be matched.
            // Retry next tick — but fail once it's clearly been too long so it
            // can't stick forever.
            console.warn(
              `[sync] track request ${req.id} reports done but file unresolved (path=${settings.slskdDownloadPath ?? "unset"}, file=${req.slskdFile}).`,
            );
            if (isStuck(req.approvedAt)) {
              const reason =
                "Download finished but the file couldn't be located on disk — check the slskd download path and path map.";
              await prisma.request.update({
                where: { id: req.id },
                data: {
                  status: "FAILED",
                  declineReason: reason,
                },
              });
              await notifyRequestTransition(req, "REQUEST_FAILED", { reason });
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
            const reason =
              "Soulseek album download never started (no active transfers).";
            await prisma.request.update({
              where: { id: req.id },
              data: {
                status: "FAILED",
                declineReason: reason,
              },
            });
            await notifyRequestTransition(req, "REQUEST_FAILED", { reason });
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
          const available = availablePositions.size > 0;
          const reason = available
            ? null
            : "Soulseek album download produced no playable tracks.";
          await prisma.request.update({
            where: { id: req.id },
            data: available
              ? { status: "AVAILABLE" }
              : {
                  status: "FAILED",
                  declineReason: reason,
                },
          });
          await notifyRequestTransition(
            req,
            available ? "REQUEST_AVAILABLE" : "REQUEST_FAILED",
            { reason },
          );
          changed++;
        } else if (req.status !== "DOWNLOADING") {
          await prisma.request.update({
            where: { id: req.id },
            data: { status: "DOWNLOADING" },
          });
          changed++;
        } else if (isStuck(req.approvedAt)) {
          const reason = "Soulseek album download timed out.";
          await prisma.request.update({
            where: { id: req.id },
            data: {
              status: "FAILED",
              declineReason: reason,
            },
          });
          await notifyRequestTransition(req, "REQUEST_FAILED", { reason });
          changed++;
        }
      } catch {
        // Per-request errors don't fail the whole cycle.
      }
    }

    // Newly-registered tracks should show up in the library views promptly.
    if (changed > 0) {
      await syncDownloadedLibrary().catch(() => {});
    }

    return {
      scanned: trackRequests.length + slskdAlbumRequests.length,
      changed,
    };
  } finally {
    // A wedged run that eventually settles must not clear the guard for the
    // fresh run that replaced it.
    if (runToken === token) running = false;
  }
}

/**
 * Search Soulseek for newly-approved TRACK requests and start the best download,
 * keeping a ranked shortlist for failover. Bounded per run. Returns the number
 * of requests moved out of APPROVED (to DOWNLOADING or FAILED).
 */
async function runTrackSearches(slskdConfig: SlskdConfig): Promise<number> {
  // Fresh approvals (lastSearchedAt null) sort first in SQLite ASC, so a backlog
  // of never-found tracks can't starve a new request out of the per-run budget.
  const now = new Date();
  const searchCandidates = await prisma.request.findMany({
    where: {
      status: "APPROVED",
      type: "TRACK",
      slskdFile: null,
    },
    orderBy: { lastSearchedAt: "asc" },
    take: SEARCH_SCAN_BUDGET,
  });
  const pending = searchCandidates
    .filter((request) => isTrackSearchDue(request, now))
    .slice(0, SEARCH_BUDGET_PER_RUN);

  let changed = 0;
  for (const req of pending) {
    try {
      // Expected duration: the strongest signal for rejecting the wrong file
      // (remix/live/extended/mislabel) among noisy Soulseek results.
      let durationSec: number | null = null;
      if (req.albumMbid && req.albumPosition != null) {
        try {
          const album = await getAlbum(req.albumMbid);
          const mbTrack = album?.tracks.find(
            (t) => t.absolutePosition === req.albumPosition,
          );
          if (mbTrack?.lengthMs) durationSec = Math.round(mbTrack.lengthMs / 1000);
        } catch {
          // Duration is a bonus signal; proceed without it.
        }
      }

      const outcome = await findTrackCandidatesWithFallback(
        {
          artistName: req.artistName,
          trackTitle: req.title,
          albumTitle: req.albumTitle,
          durationSec,
        },
        (query) =>
          searchTracks(slskdConfig, query, {
            searchTimeoutMs: SEARCH_TIMEOUT_MS,
            maxWaitMs: SEARCH_MAX_WAIT_MS,
          }),
      );
      const ranked = outcome.ranked.slice(0, CANDIDATE_SHORTLIST);

      console.log(
        `[sync] track search ${req.id} tried=${outcome.queriesTried.length} queries=${JSON.stringify(outcome.queriesTried)} candidates=${outcome.candidateCount} matches=${ranked.length}`,
      );

      if (ranked.length === 0) {
        // Not found (yet). Keep it APPROVED and stamp lastSearchedAt so it
        // retries on the age-based cadence — the track may appear later, or a
        // temporarily-suppressed query may start returning responses again.
        await prisma.request.update({
          where: { id: req.id },
          data: {
            lastSearchedAt: new Date(),
            declineReason:
              outcome.candidateCount === 0
                ? `No Soulseek responses to ${outcome.queriesTried.length} search variations yet — we'll keep checking.`
                : `Found ${outcome.candidateCount} files across ${outcome.queriesTried.length} searches but none matched the artist, title, and duration closely enough yet.`,
          },
        });
        continue;
      }

      const shortlist: TrackCandidate[] = ranked.map((c) => ({
        username: c.username,
        filename: c.filename,
        size: c.size,
      }));
      const head = shortlist[0]!;
      await enqueueDownload(slskdConfig, head.username, [
        { filename: head.filename, size: head.size },
      ]);
      await prisma.request.update({
        where: { id: req.id },
        data: {
          status: "DOWNLOADING",
          slskdUsername: head.username,
          slskdFile: head.filename,
          downloadTitle: baseName(head.filename),
          slskdCandidatesJson: JSON.stringify(shortlist),
        },
      });
      changed++;
    } catch (err) {
      // Transient (slskd down, Soulseek disconnected, enqueue rejected): leave
      // it APPROVED with no file so a later tick retries the search — but
      // stamp the attempt and the reason. Without that, a persistent outage
      // is invisible (the requests sit "fetching" forever) and the same
      // never-searched requests sort to the head of the queue every run,
      // consuming the whole per-run search budget indefinitely.
      const msg = err instanceof Error ? err.message : "Soulseek search failed.";
      console.warn(
        `[sync] track search failed for ${req.id} (${req.artistName} — ${req.title}): ${msg}`,
      );
      await prisma.request
        .update({
          where: { id: req.id },
          data: { lastSearchedAt: new Date(), declineReason: msg },
        })
        .catch(() => {});
    }
  }
  return changed;
}

/**
 * After a failed track transfer, drop the current peer and start the next-ranked
 * candidate. Walks past peers that refuse the enqueue. Returns true if a
 * fallback was started, false if the shortlist is exhausted (caller marks
 * FAILED).
 */
async function failoverTrack(
  slskdConfig: SlskdConfig,
  req: {
    id: string;
    slskdFile: string | null;
    slskdCandidatesJson: string | null;
  },
): Promise<boolean> {
  let shortlist: TrackCandidate[] = [];
  if (req.slskdCandidatesJson) {
    try {
      shortlist = JSON.parse(req.slskdCandidatesJson) as TrackCandidate[];
    } catch {
      return false;
    }
  }
  // Drop the candidate that just failed (matched by the current remote file).
  let remaining = shortlist.filter((c) => c.filename !== req.slskdFile);

  while (remaining.length > 0) {
    const next = remaining[0]!;
    try {
      await enqueueDownload(slskdConfig, next.username, [
        { filename: next.filename, size: next.size },
      ]);
    } catch {
      // This peer won't take the download; drop it and try the next.
      remaining = remaining.slice(1);
      continue;
    }
    await prisma.request.update({
      where: { id: req.id },
      data: {
        status: "DOWNLOADING",
        slskdUsername: next.username,
        slskdFile: next.filename,
        downloadTitle: baseName(next.filename),
        slskdCandidatesJson: JSON.stringify(remaining),
        // Restart the stuck-timer for the new peer.
        approvedAt: new Date(),
      },
    });
    return true;
  }
  return false;
}
