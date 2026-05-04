"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function requestArtistAction(input: {
  mbid: string;
  name: string;
  imageUrl: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };

  // Idempotency mirrors the album action: any in-flight or fulfilled artist
  // request for this user blocks a duplicate. Declined / failed can resubmit.
  const existing = await prisma.request.findFirst({
    where: {
      requestedById: userId,
      mbid: input.mbid,
      type: "ARTIST",
      status: { in: ["PENDING", "APPROVED", "DOWNLOADING", "AVAILABLE"] },
    },
  });
  if (existing) return { ok: false, error: "You've already requested this artist." };

  await prisma.request.create({
    data: {
      type: "ARTIST",
      mbid: input.mbid,
      // For artist requests we put the artist name in both fields so the
      // shared admin queue row renders sensibly without a type-specific layout.
      title: input.name,
      artistName: input.name,
      coverUrl: input.imageUrl,
      requestedById: userId,
      status: "PENDING",
    },
  });

  revalidatePath(`/artist/${input.mbid}`);
  revalidatePath("/requests");
  revalidatePath("/admin/requests");
  return { ok: true };
}
