"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { RequestType } from "@prisma/client";

export async function unrequestAction(input: {
  requestId?: string;
  type: RequestType;
  mbid: string;
  albumMbid?: string | null;
  artistMbid?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };

  const request = await prisma.request.findFirst({
    where: {
      requestedById: userId,
      ...(input.requestId
        ? { id: input.requestId }
        : {
            type: input.type,
            mbid: input.mbid,
          }),
    },
    orderBy: { requestedAt: "desc" },
    select: {
      id: true,
      type: true,
      mbid: true,
      albumMbid: true,
    },
  });
  if (!request) return { ok: false, error: "Request not found." };

  await prisma.request.delete({ where: { id: request.id } });

  revalidatePath("/requests");
  revalidatePath("/admin/requests");
  if (request.type === "ARTIST") {
    revalidatePath(`/artist/${request.mbid}`);
  } else {
    revalidatePath(`/album/${request.albumMbid ?? input.albumMbid ?? request.mbid}`);
  }
  if (input.artistMbid) {
    revalidatePath(`/artist/${input.artistMbid}`);
  }

  return { ok: true };
}
