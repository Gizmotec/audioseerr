"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getAlbum } from "@/lib/musicbrainz";
import {
  baseName,
  enqueueDownload,
  groupAlbumFolders,
  matchAlbumFiles,
  pickBestAlbumFolder,
  searchTracks,
  type SlskdConfig,
} from "@/lib/slskd";
import { getSettings, type SettingsView } from "@/lib/settings";
import type { Request } from "@prisma/client";

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not signed in." };
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN") return { ok: false, error: "Admin only." };
  return { ok: true };
}

export async function approveRequestAction(requestId: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const request = await prisma.request.findUnique({ where: { id: requestId } });
  if (!request) return { ok: false, error: "Request not found." };
  if (request.status !== "PENDING" && request.status !== "FAILED") {
    return { ok: false, error: `Already ${request.status.toLowerCase()}.` };
  }

  const settings = await getSettings();
  const result = await executeRequestApproval(request, settings);
  if (result.ok) {
    revalidatePath("/admin/requests");
    revalidatePath("/requests");
    revalidatePath(`/album/${request.albumMbid ?? request.mbid}`);
  }
  return result;
}

/**
 * Push a request through to Lidarr/Prowlarr without admin gating. Used by
 * `approveRequestAction` (admin path) and by the user-side request flow when
 * `user.autoApprove` is on. Mutates request.status to APPROVED/DOWNLOADING/
 * FAILED depending on the outcome.
 */
export async function executeRequestApproval(
  request: Request,
  settings: SettingsView,
): Promise<ActionResult> {
  if (request.type === "TRACK") {
    return approveTrackRequest(request, settings);
  }
  if (request.type === "ALBUM") {
    return approveAlbumViaSlskd(request, settings);
  }
  // Artist follow was a Lidarr feature; it's gone in the slskd-only world.
  return {
    ok: false,
    error:
      "Following whole artists isn't supported — request individual albums or tracks instead.",
  };
}

async function approveTrackRequest(
  request: Request,
  settings: SettingsView,
): Promise<ActionResult> {
  if (!settings.slskdUrl || !settings.slskdApiKey) {
    return {
      ok: false,
      error: "Soulseek (slskd) is not configured in Settings.",
    };
  }

  // Queue it; the background sync job runs the Soulseek search with a generous
  // window (peers trickle in over ~20s) and fails over across peers on a bad
  // transfer. Searching inline here would block playlist imports ~20s per track.
  await prisma.request.update({
    where: { id: request.id },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      declineReason: null,
      lastSearchedAt: null,
      slskdUsername: null,
      slskdFile: null,
      slskdCandidatesJson: null,
      downloadTitle: null,
    },
  });

  // Nudge the job so a single request starts within seconds rather than on the
  // 2-min tick. Fire-and-forget; the job's own guard de-dupes concurrent runs.
  void import("@/lib/jobs/syncActiveRequests")
    .then((m) => m.syncActiveRequests())
    .catch(() => {});

  revalidateTrackRequestPaths(request);
  return { ok: true };
}

async function approveAlbumViaSlskd(
  request: Request,
  settings: SettingsView,
): Promise<ActionResult> {
  if (!settings.slskdUrl || !settings.slskdApiKey) {
    return { ok: false, error: "Soulseek (slskd) is not configured in Settings." };
  }
  const slskd: SlskdConfig = {
    url: settings.slskdUrl,
    apiKey: settings.slskdApiKey,
  };

  try {
    const album = await getAlbum(request.mbid);
    if (!album || album.tracks.length === 0) {
      const reason = "Couldn't load the album tracklist from MusicBrainz.";
      await markFailed(request.id, reason);
      revalidateTrackRequestPaths(request);
      return { ok: false, error: reason };
    }

    const query = `${request.artistName} ${request.title}`;
    const candidates = await searchTracks(slskd, query);
    const best = pickBestAlbumFolder(groupAlbumFolders(candidates), {
      artistName: request.artistName,
      albumTitle: request.title,
      trackCount: album.tracks.length,
    });

    if (!best) {
      const reason =
        candidates.length === 0
          ? `Soulseek returned no files for "${query}".`
          : `Soulseek returned files for "${query}" but no folder matched the album closely enough.`;
      await markFailed(request.id, reason);
      revalidateTrackRequestPaths(request);
      return { ok: false, error: reason };
    }

    // Map files to album positions now, while we still have candidate durations
    // — the sync job only sees transfer filenames. Persist it for registration.
    const matches = matchAlbumFiles(best.files, album.tracks);

    await enqueueDownload(
      slskd,
      best.username,
      best.files.map((f) => ({ filename: f.filename, size: f.size })),
    );

    await prisma.request.update({
      where: { id: request.id },
      data: {
        status: "DOWNLOADING",
        approvedAt: new Date(),
        declineReason: null,
        // For albums, slskdFile holds the remote folder; the sync job polls all
        // transfers under it and registers each completed track via slskdFilesJson.
        slskdUsername: best.username,
        slskdFile: best.folder,
        slskdFilesJson: JSON.stringify(matches),
        downloadTitle: `${best.files.length} files — ${baseName(best.folder) || request.title}`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Soulseek album download failed.";
    await markFailed(request.id, msg);
    revalidateTrackRequestPaths(request);
    return { ok: false, error: msg };
  }

  revalidateTrackRequestPaths(request);
  return { ok: true };
}

export async function declineRequestAction(
  requestId: string,
  reason: string,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const trimmed = reason.trim();
  if (trimmed.length === 0) {
    return { ok: false, error: "Please give a reason." };
  }
  if (trimmed.length > 280) {
    return { ok: false, error: "Reason must be 280 characters or fewer." };
  }

  const request = await prisma.request.findUnique({ where: { id: requestId } });
  if (!request) return { ok: false, error: "Request not found." };
  if (request.status !== "PENDING") {
    return { ok: false, error: `Already ${request.status.toLowerCase()}.` };
  }

  await prisma.request.update({
    where: { id: request.id },
    data: { status: "DECLINED", declineReason: trimmed },
  });

  revalidatePath("/admin/requests");
  revalidatePath("/requests");
  revalidatePath(`/album/${request.albumMbid ?? request.mbid}`);
  return { ok: true };
}

async function markFailed(requestId: string, reason: string) {
  await prisma.request.update({
    where: { id: requestId },
    data: { status: "FAILED", declineReason: reason },
  });
}

function revalidateTrackRequestPaths(request: {
  mbid: string;
  albumMbid: string | null;
}) {
  revalidatePath("/admin/requests");
  revalidatePath("/requests");
  if (request.albumMbid) {
    revalidatePath(`/album/${request.albumMbid}`);
  } else {
    revalidatePath(`/album/${request.mbid}`);
  }
}

export async function syncNowAction(): Promise<
  | {
      ok: true;
      requests: { scanned: number; changed: number };
      library: { albums: number };
    }
  | { ok: false; error: string }
> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const [{ syncActiveRequests }, { syncDownloadedLibrary }] = await Promise.all([
    import("@/lib/jobs/syncActiveRequests"),
    import("@/lib/jobs/syncDownloadedLibrary"),
  ]);

  try {
    const reqs = await syncActiveRequests();
    const lib = await syncDownloadedLibrary();
    revalidatePath("/admin/requests");
    revalidatePath("/requests");
    revalidatePath("/home");
    return {
      ok: true,
      requests: reqs,
      library: { albums: lib.albums },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Sync failed." };
  }
}
