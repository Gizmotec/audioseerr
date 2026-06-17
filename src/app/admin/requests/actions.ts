"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  addArtist,
  findArtistByMbid,
  pollForAlbum,
  setAlbumsMonitored,
  triggerAlbumSearch,
  triggerArtistSearch,
  type LidarrConfig,
} from "@/lib/lidarr";
import { getAlbum } from "@/lib/musicbrainz";
import {
  baseName,
  enqueueDownload,
  pickBestTrackFile,
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
  return pushAlbumOrArtistToLidarr(request, settings);
}

async function pushAlbumOrArtistToLidarr(
  request: Request,
  settings: SettingsView,
): Promise<ActionResult> {
  if (
    !settings.lidarrUrl ||
    !settings.lidarrApiKey ||
    !settings.lidarrDefaultProfileId ||
    !settings.lidarrRootFolderPath
  ) {
    return { ok: false, error: "Lidarr is not fully configured in setup." };
  }
  const lidarr: LidarrConfig = {
    url: settings.lidarrUrl,
    apiKey: settings.lidarrApiKey,
  };

  // Resolve the artist MBID — for album requests we need to look it up via MB.
  let artistMbid: string | null = null;
  if (request.type === "ARTIST") {
    artistMbid = request.mbid;
  } else {
    const album = await getAlbum(request.mbid);
    artistMbid = album?.artistMbid ?? null;
  }
  if (!artistMbid) {
    await markFailed(request.id, "Couldn't resolve the artist MBID for this album.");
    return { ok: false, error: "MusicBrainz didn't return an artist for this album." };
  }

  try {
    // 1. Find or add the artist. Album requests add with monitor=none so we
    //    can opt-in a single album below; artist requests add with monitor=all
    //    + searchForMissingAlbums so Lidarr fans out across the back catalog
    //    (design doc §8).
    const existing = await findArtistByMbid(lidarr, artistMbid);
    const lidarrArtistId = existing
      ? existing.id
      : (
          await addArtist(lidarr, artistMbid, request.artistName, {
            qualityProfileId: settings.lidarrDefaultProfileId,
            rootFolderPath: settings.lidarrRootFolderPath,
            monitor: request.type === "ARTIST" ? "all" : "none",
            searchForMissingAlbums: request.type === "ARTIST",
          })
        ).id;

    // 2. Wait for the album to appear under the artist. For existing artists
    //    this is immediate; for fresh adds Lidarr's metadata refresh takes a
    //    handful of seconds.
    const album =
      request.type === "ALBUM"
        ? await pollForAlbum(lidarr, lidarrArtistId, request.mbid)
        : null;

    // 3. If we found the album, monitor + search just that one. We don't
    //    touch other albums' monitoring state, so existing user setups are
    //    preserved.
    if (album) {
      await setAlbumsMonitored(lidarr, [album.id], true);
      await triggerAlbumSearch(lidarr, [album.id]).catch(() => {
        // Search failures don't block the approval state change.
      });
    }
    // If `album` is null (poll timeout / artist-typed request), the request
    // still advances to APPROVED — milestone 8's status sync will reconcile.

    // 4. Artist requests against an already-imported artist won't trigger
    //    Lidarr's add-time search — kick one off explicitly so existing
    //    monitored albums get searched. Newly-added artists already searched
    //    via addOptions.searchForMissingAlbums above.
    if (request.type === "ARTIST" && existing) {
      await triggerArtistSearch(lidarr, lidarrArtistId).catch(() => {});
    }

    await prisma.request.update({
      where: { id: request.id },
      data: {
        status: "APPROVED",
        approvedAt: new Date(),
        lidarrId: lidarrArtistId,
        qualityProfileId: settings.lidarrDefaultProfileId,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Lidarr push failed.";
    return { ok: false, error: msg };
  }

  return { ok: true };
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

  const slskd: SlskdConfig = {
    url: settings.slskdUrl,
    apiKey: settings.slskdApiKey,
  };

  try {
    // Best-effort expected duration — the strongest signal for rejecting the
    // wrong file (remix/live/extended/mislabel) among noisy Soulseek results.
    let durationSec: number | null = null;
    if (request.albumMbid && request.albumPosition != null) {
      try {
        const album = await getAlbum(request.albumMbid);
        const mbTrack = album?.tracks.find(
          (t) => t.absolutePosition === request.albumPosition,
        );
        if (mbTrack?.lengthMs) durationSec = Math.round(mbTrack.lengthMs / 1000);
      } catch {
        // Duration is a bonus signal; proceed without it.
      }
    }

    const query = `${request.artistName} ${request.title}`;
    const candidates = await searchTracks(slskd, query);
    const best = pickBestTrackFile(candidates, {
      artistName: request.artistName,
      trackTitle: request.title,
      durationSec,
    });

    if (!best) {
      const reason = buildNoMatchReason(query, candidates.length);
      await markFailed(request.id, reason);
      revalidateTrackRequestPaths(request);
      return { ok: false, error: reason };
    }

    await enqueueDownload(slskd, best.username, [
      { filename: best.filename, size: best.size },
    ]);

    await prisma.request.update({
      where: { id: request.id },
      data: {
        status: "DOWNLOADING",
        approvedAt: new Date(),
        declineReason: null,
        slskdUsername: best.username,
        slskdFile: best.filename,
        downloadTitle: baseName(best.filename),
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Soulseek download failed.";
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

function buildNoMatchReason(query: string, candidateCount: number): string {
  if (candidateCount === 0) {
    return `Soulseek returned no files for "${query}".`;
  }
  return `Soulseek returned ${candidateCount} files for "${query}" but none matched the track closely enough (title or duration).`;
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
      library: { artists: number; albums: number };
    }
  | { ok: false; error: string }
> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const [{ syncActiveRequests }, { syncLibrary }] = await Promise.all([
    import("@/lib/jobs/syncActiveRequests"),
    import("@/lib/jobs/syncLibrary"),
  ]);

  try {
    // Library first so freshly-added items show up before the request scan
    // reconciles their per-request status.
    const lib = await syncLibrary();
    const reqs = await syncActiveRequests();
    revalidatePath("/admin/requests");
    revalidatePath("/requests");
    revalidatePath("/home");
    return {
      ok: true,
      requests: reqs,
      library: { artists: lib.artists, albums: lib.albums },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Sync failed." };
  }
}
