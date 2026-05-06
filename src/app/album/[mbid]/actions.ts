"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function requestAlbumAction(input: {
  mbid: string;
  title: string;
  artistName: string;
  coverUrl: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
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

  await prisma.request.create({
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

  revalidatePath(`/album/${input.mbid}`);
  revalidatePath("/requests");
  revalidatePath("/admin/requests");
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
}): Promise<{ ok: true } | { ok: false; error: string }> {
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
      status: "PENDING",
    },
  });

  revalidatePath(`/album/${input.albumMbid}`);
  revalidatePath("/requests");
  revalidatePath("/admin/requests");
  return { ok: true };
}
