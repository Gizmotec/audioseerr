"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { executeRequestApproval } from "@/app/admin/requests/actions";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";

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

  const requester = await prisma.user.findUnique({
    where: { id: userId },
    select: { autoApproveArtist: true },
  });
  if (!requester) return { ok: false, error: "User record missing." };

  const created = await prisma.request.create({
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

  if (requester.autoApproveArtist) {
    const settings = await getSettings();
    const result = await executeRequestApproval(created, settings);
    if (!result.ok) {
      revalidatePath(`/artist/${input.mbid}`);
      revalidatePath("/requests");
      revalidatePath("/admin/requests");
      return result;
    }
  }

  revalidatePath(`/artist/${input.mbid}`);
  revalidatePath("/requests");
  revalidatePath("/admin/requests");
  return { ok: true };
}
