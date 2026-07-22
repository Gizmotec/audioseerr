// Request-creation path for the public REST API (POST /api/v1/request).
//
// TEMPORARY DUPLICATE of the user-facing create flow — the app's own entry
// points (src/app/album/[mbid]/actions.ts, src/app/artist/[mbid]/actions.ts)
// are session-bound server actions: they call auth() internally and take
// client-supplied metadata (title/artistName/coverUrl), so an API-key-authed
// route handler can't reuse them. This module implements the IDENTICAL path —
// duplicate check → quota → cross-user library dedup → row insert →
// auto-approve dispatch via the shared executeRequestApproval — resolving
// metadata from MusicBrainz instead of trusting the client.
//
// DEDUPE RECOMMENDATION (orchestrator): extract the bodies of
// requestAlbumAction / requestArtistAction / requestTrackAction into a shared
// lib like this one (parameterized by userId + metadata), and have both the
// server actions and the API route call it. Delete this file then.
//
// Two deliberate deviations from the page actions:
//   1. Quota: requestQuota (design doc §6: "per week, 0 = unlimited") is
//      enforced here — the web UI has no enforcement code yet. Admins exempt.
//   2. No revalidatePath: every consumer page (/requests, /library, /home,
//      /admin/requests) is force-dynamic, so there is no cached page to bust.

import type { Request } from "@prisma/client";
import { executeRequestApproval } from "@/app/admin/requests/actions";
import { prisma } from "@/lib/db";
import { attachDownloadedTrackToUser } from "@/lib/downloadedTracks";
import { getAlbum, getArtist } from "@/lib/musicbrainz";
import { getSettings } from "@/lib/settings";

export type CreateRequestInput =
  | { type: "ALBUM"; mbid: string }
  | { type: "ARTIST"; mbid: string }
  | {
      type: "TRACK";
      /** Recording MBID when known; MusicBrainz's own recording id wins when
       * the album lookup provides one. Falls back to the synthetic
       * `<albumMbid>:<albumPosition>` key, same as the album page. */
      mbid: string | null;
      albumMbid: string;
      albumPosition: number;
    };

export type CreateRequestResult =
  | { ok: true; request: Request }
  | { ok: false; status: 400 | 403 | 409; error: string };

/** Design doc §6: requestQuota is per week; 0 = unlimited. */
const QUOTA_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const IN_FLIGHT_STATUSES = ["PENDING", "APPROVED", "DOWNLOADING", "AVAILABLE"] as const;

export async function createRequestForUser(
  userId: string,
  input: CreateRequestInput,
): Promise<CreateRequestResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      requestQuota: true,
      autoApproveArtist: true,
      autoApproveAlbum: true,
      autoApproveTrack: true,
    },
  });
  if (!user) return { ok: false, status: 400, error: "User record missing." };

  // Quota gate (see header note). Mirrors no existing app code — the schema +
  // design doc define the semantics; the web UI doesn't enforce it yet.
  if (user.role !== "ADMIN" && user.requestQuota > 0) {
    const recentCount = await prisma.request.count({
      where: {
        requestedById: userId,
        requestedAt: { gte: new Date(Date.now() - QUOTA_WINDOW_MS) },
      },
    });
    if (recentCount >= user.requestQuota) {
      return {
        ok: false,
        status: 403,
        error: `Request quota exceeded (${user.requestQuota} per week).`,
      };
    }
  }

  switch (input.type) {
    case "ALBUM":
      return createAlbumRequest(userId, input.mbid, user.autoApproveAlbum);
    case "ARTIST":
      return createArtistRequest(userId, input.mbid, user.autoApproveArtist);
    case "TRACK":
      return createTrackRequest(userId, input, user.autoApproveTrack);
  }
}

async function createAlbumRequest(
  userId: string,
  mbid: string,
  autoApprove: boolean,
): Promise<CreateRequestResult> {
  // Idempotency mirrors requestAlbumAction: in-flight or fulfilled blocks a
  // duplicate; declined/failed can be re-submitted.
  const existing = await prisma.request.findFirst({
    where: { requestedById: userId, mbid, status: { in: [...IN_FLIGHT_STATUSES] } },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, status: 409, error: "You've already requested this album." };
  }

  const album = await getAlbum(mbid);
  if (!album) {
    return { ok: false, status: 400, error: `Couldn't resolve album ${mbid} on MusicBrainz.` };
  }

  // slskd dedup: album already fully in our own track library (downloaded by
  // anyone) → grant visibility instead of downloading it again.
  const ownedTracks = await prisma.downloadedTrack.findMany({
    where: { albumMbid: mbid, ephemeral: false },
    select: { id: true },
  });
  const fullyOwned = album.tracks.length > 0 && ownedTracks.length >= album.tracks.length;
  if (fullyOwned) {
    const created = await prisma.request.create({
      data: {
        type: "ALBUM",
        mbid,
        title: album.title,
        artistName: album.artistName,
        coverUrl: album.coverUrl,
        requestedById: userId,
        status: "AVAILABLE",
        approvedAt: new Date(),
      },
    });
    for (const t of ownedTracks) {
      await attachDownloadedTrackToUser(userId, t.id);
    }
    return { ok: true, request: created };
  }

  const created = await prisma.request.create({
    data: {
      type: "ALBUM",
      mbid,
      title: album.title,
      artistName: album.artistName,
      coverUrl: album.coverUrl,
      requestedById: userId,
      status: "PENDING",
    },
  });

  return dispatchAutoApprove(created, autoApprove);
}

async function createArtistRequest(
  userId: string,
  mbid: string,
  autoApprove: boolean,
): Promise<CreateRequestResult> {
  const existing = await prisma.request.findFirst({
    where: { requestedById: userId, mbid, type: "ARTIST", status: { in: [...IN_FLIGHT_STATUSES] } },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, status: 409, error: "You've already requested this artist." };
  }

  const artist = await getArtist(mbid);
  if (!artist) {
    return { ok: false, status: 400, error: `Couldn't resolve artist ${mbid} on MusicBrainz.` };
  }

  const created = await prisma.request.create({
    data: {
      type: "ARTIST",
      mbid,
      // Same convention as requestArtistAction: artist name in both fields so
      // the shared admin queue row renders sensibly. No cover — the app's
      // artist images come from Last.fm at page-render time, not MusicBrainz.
      title: artist.name,
      artistName: artist.name,
      coverUrl: null,
      requestedById: userId,
      status: "PENDING",
    },
  });

  return dispatchAutoApprove(created, autoApprove);
}

async function createTrackRequest(
  userId: string,
  input: Extract<CreateRequestInput, { type: "TRACK" }>,
  autoApprove: boolean,
): Promise<CreateRequestResult> {
  const album = await getAlbum(input.albumMbid);
  if (!album) {
    return {
      ok: false,
      status: 400,
      error: `Couldn't resolve album ${input.albumMbid} on MusicBrainz.`,
    };
  }
  const track = album.tracks.find((t) => t.absolutePosition === input.albumPosition);
  if (!track) {
    return {
      ok: false,
      status: 400,
      error: `Album ${input.albumMbid} has no track at position ${input.albumPosition}.`,
    };
  }

  const recordingMbid = track.recordingMbid ?? input.mbid ?? null;
  const mbid = recordingMbid ?? `${input.albumMbid}:${input.albumPosition}`;

  const existing = await prisma.request.findFirst({
    where: { requestedById: userId, type: "TRACK", mbid, status: { in: [...IN_FLIGHT_STATUSES] } },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, status: 409, error: "You've already requested this track." };
  }

  // Dedup: exact track already on disk (downloaded by anyone) → grant
  // visibility instead of downloading it again.
  const owned = await prisma.downloadedTrack.findUnique({
    where: {
      albumMbid_albumPosition: {
        albumMbid: input.albumMbid,
        albumPosition: input.albumPosition,
      },
    },
    select: { id: true },
  });
  if (owned) {
    const created = await prisma.request.create({
      data: {
        type: "TRACK",
        mbid,
        title: track.title,
        artistName: album.artistName,
        coverUrl: album.coverUrl,
        albumMbid: input.albumMbid,
        albumTitle: album.title,
        recordingMbid,
        albumPosition: input.albumPosition,
        requestedById: userId,
        status: "AVAILABLE",
        approvedAt: new Date(),
      },
    });
    await attachDownloadedTrackToUser(userId, owned.id);
    return { ok: true, request: created };
  }

  const created = await prisma.request.create({
    data: {
      type: "TRACK",
      mbid,
      title: track.title,
      artistName: album.artistName,
      coverUrl: album.coverUrl,
      albumMbid: input.albumMbid,
      albumTitle: album.title,
      recordingMbid,
      albumPosition: input.albumPosition,
      requestedById: userId,
      status: "PENDING",
    },
  });

  return dispatchAutoApprove(created, autoApprove);
}

/** Mirror of the page actions' auto-approve dispatch: run the shared approval
 * path (slskd search/enqueue) and re-read the row so the API response reflects
 * the post-dispatch status (APPROVED / DOWNLOADING / FAILED). Dispatch
 * failures don't fail the API call — the request row exists either way, and
 * its status tells the story. */
async function dispatchAutoApprove(
  created: Request,
  autoApprove: boolean,
): Promise<CreateRequestResult> {
  if (!autoApprove) return { ok: true, request: created };
  const settings = await getSettings();
  const result = await executeRequestApproval(created, settings);
  if (!result.ok) {
    console.error(`[requestCreate] auto-approve dispatch for ${created.id}: ${result.error}`);
  }
  const fresh = await prisma.request.findUnique({ where: { id: created.id } });
  return { ok: true, request: fresh ?? created };
}
