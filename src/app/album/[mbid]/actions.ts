"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { executeRequestApproval } from "@/app/admin/requests/actions";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { attachLibraryItemToUser } from "@/lib/userLibrary";

type ActionResult = { ok: true } | { ok: false; error: string };

async function loadRequester(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      autoApproveArtist: true,
      autoApproveAlbum: true,
      autoApproveTrack: true,
    },
  });
}

export async function requestAlbumAction(input: {
  mbid: string;
  title: string;
  artistName: string;
  coverUrl: string | null;
}): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };

  // Idempotency: any in-flight or fulfilled request for this user+mbid blocks
  // creating a duplicate. Declined / failed requests can be re-submitted.
  const existing = await prisma.request.findFirst({
    where: {
      requestedById: userId,
      mbid: input.mbid,
      status: { in: ["PENDING", "APPROVED", "DOWNLOADING", "AVAILABLE"] },
    },
  });
  if (existing) return { ok: false, error: "You've already requested this album." };

  const requester = await loadRequester(userId);
  if (!requester) return { ok: false, error: "User record missing." };

  // Server-wide dedup: if the album is already downloaded for someone else,
  // skip Lidarr/qBittorrent entirely and just attach the user to it. If it's
  // currently downloading, ride along — sync will attach when AVAILABLE.
  const libraryItem = await prisma.libraryItem.findUnique({
    where: { mbid: input.mbid },
    select: { lidarrId: true, status: true },
  });

  if (libraryItem?.status === "downloaded") {
    await prisma.request.create({
      data: {
        type: "ALBUM",
        mbid: input.mbid,
        title: input.title,
        artistName: input.artistName,
        coverUrl: input.coverUrl,
        requestedById: userId,
        status: "AVAILABLE",
        approvedAt: new Date(),
        lidarrId: libraryItem.lidarrId,
      },
    });
    await attachLibraryItemToUser(userId, input.mbid);
    revalidateAlbumPaths(input.mbid);
    return { ok: true };
  }

  if (libraryItem?.status === "downloading") {
    await prisma.request.create({
      data: {
        type: "ALBUM",
        mbid: input.mbid,
        title: input.title,
        artistName: input.artistName,
        coverUrl: input.coverUrl,
        requestedById: userId,
        status: "APPROVED",
        approvedAt: new Date(),
        lidarrId: libraryItem.lidarrId,
      },
    });
    revalidateAlbumPaths(input.mbid);
    return { ok: true };
  }

  // Not on the server yet. Either auto-push or queue for admin approval.
  const created = await prisma.request.create({
    data: {
      type: "ALBUM",
      mbid: input.mbid,
      title: input.title,
      artistName: input.artistName,
      coverUrl: input.coverUrl,
      requestedById: userId,
      status: "PENDING",
    },
  });

  if (requester.autoApproveAlbum) {
    const settings = await getSettings();
    const result = await executeRequestApproval(created, settings);
    if (!result.ok) {
      revalidateAlbumPaths(input.mbid);
      return result;
    }
  }

  revalidateAlbumPaths(input.mbid);
  return { ok: true };
}

export async function requestTrackAction(input: {
  albumMbid: string;
  albumTitle: string;
  artistName: string;
  coverUrl: string | null;
  recordingMbid: string | null;
  trackTitle: string;
  albumPosition: number;
}): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };

  const mbid = input.recordingMbid ?? `${input.albumMbid}:${input.albumPosition}`;
  const existing = await prisma.request.findFirst({
    where: {
      requestedById: userId,
      type: "TRACK",
      mbid,
      status: { in: ["PENDING", "APPROVED", "DOWNLOADING", "AVAILABLE"] },
    },
  });
  if (existing) return { ok: false, error: "You've already requested this track." };

  const requester = await loadRequester(userId);
  if (!requester) return { ok: false, error: "User record missing." };

  // Album-level dedup for tracks: if the parent album is already downloaded,
  // the track file is on disk too. Mark AVAILABLE and attach the user to the
  // album so they can play it from /album/[mbid].
  const parentAlbum = await prisma.libraryItem.findUnique({
    where: { mbid: input.albumMbid },
    select: { lidarrId: true, status: true },
  });

  if (parentAlbum?.status === "downloaded") {
    await prisma.request.create({
      data: {
        type: "TRACK",
        mbid,
        title: input.trackTitle,
        artistName: input.artistName,
        coverUrl: input.coverUrl,
        albumMbid: input.albumMbid,
        albumTitle: input.albumTitle,
        recordingMbid: input.recordingMbid,
        albumPosition: input.albumPosition,
        requestedById: userId,
        status: "AVAILABLE",
        approvedAt: new Date(),
      },
    });
    await attachLibraryItemToUser(userId, input.albumMbid);
    revalidatePath(`/album/${input.albumMbid}`);
    revalidatePath("/requests");
    return { ok: true };
  }

  const created = await prisma.request.create({
    data: {
      type: "TRACK",
      mbid,
      title: input.trackTitle,
      artistName: input.artistName,
      coverUrl: input.coverUrl,
      albumMbid: input.albumMbid,
      albumTitle: input.albumTitle,
      recordingMbid: input.recordingMbid,
      albumPosition: input.albumPosition,
      requestedById: userId,
      status: "PENDING",
    },
  });

  if (requester.autoApproveTrack) {
    const settings = await getSettings();
    const result = await executeRequestApproval(created, settings);
    if (!result.ok) {
      revalidatePath(`/album/${input.albumMbid}`);
      revalidatePath("/requests");
      return result;
    }
  }

  revalidatePath(`/album/${input.albumMbid}`);
  revalidatePath("/requests");
  revalidatePath("/admin/requests");
  return { ok: true };
}

function revalidateAlbumPaths(mbid: string) {
  revalidatePath(`/album/${mbid}`);
  revalidatePath("/requests");
  revalidatePath("/admin/requests");
  revalidatePath("/library");
  revalidatePath("/home");
}
