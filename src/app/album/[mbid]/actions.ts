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
