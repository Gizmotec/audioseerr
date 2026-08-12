"use server";

// Review-then-act cleanup of a drifted library. The plan is read-only; the
// apply only touches ids the caller passes back, so what was on screen is what
// gets released.

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  applyLibraryRelease,
  planLibraryRelease,
  type ReleasePlan,
} from "@/lib/libraryReconcile";

export async function planLibraryReleaseAction(
  includeManual: boolean,
): Promise<{ ok: true; plan: ReleasePlan } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };
  const plan = await planLibraryRelease(userId, { includeManual });
  return { ok: true, plan };
}

export async function applyLibraryReleaseAction(
  downloadedTrackIds: string[],
): Promise<
  { ok: true; released: number; filesDeleted: number } | { ok: false; error: string }
> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };
  if (downloadedTrackIds.length === 0) {
    return { ok: false, error: "Nothing selected." };
  }
  const { released, filesDeleted } = await applyLibraryRelease(
    userId,
    downloadedTrackIds,
  );
  revalidatePath("/library");
  revalidatePath("/account/cleanup");
  return { ok: true, released, filesDeleted };
}
