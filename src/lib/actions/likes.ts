"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { type LikePayload, toggleLike } from "@/lib/likes";

export async function toggleLikeAction(
  payload: LikePayload,
): Promise<{ ok: true; liked: boolean } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };

  const { liked } = await toggleLike(userId, payload);

  // Revalidate the surface where this like is most likely visible. Cheap and
  // covers the common case where the user navigates back after toggling.
  if (payload.targetType === "ALBUM") {
    revalidatePath(`/album/${payload.targetId}`);
  } else if (payload.targetType === "ARTIST") {
    revalidatePath(`/artist/${payload.targetId}`);
  } else if (payload.albumMbid) {
    revalidatePath(`/album/${payload.albumMbid}`);
  }

  return { ok: true, liked };
}
