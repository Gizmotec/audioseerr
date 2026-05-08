"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

type Result<T = void> =
  | (T extends void ? { ok: true } : { ok: true } & T)
  | { ok: false; error: string };

export async function setPersonalizationEnabledAction(
  enabled: boolean,
): Promise<Result> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in" };

  await prisma.user.update({
    where: { id: userId },
    data: { personalizedSuggestionsEnabled: enabled },
  });

  // Discover reads this flag to decide whether to render personalized rows;
  // bust both pages so the change is immediately visible.
  revalidatePath("/discover");
  revalidatePath("/account");
  return { ok: true };
}

export async function clearPlayHistoryAction(): Promise<Result<{ deleted: number }>> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in" };

  const { count } = await prisma.playEvent.deleteMany({ where: { userId } });

  // Bust the per-user personalized recs cache so the next visit recomputes
  // without the cleared signal. The keys are deterministic from userId.
  await prisma.apiCache
    .deleteMany({
      where: {
        key: {
          in: [
            `personalized:v1:liked-similar:${userId}`,
            `personalized:v1:more-from-library:${userId}`,
            `personalized:v1:new-releases-library:${userId}`,
          ],
        },
      },
    })
    .catch(() => {});

  revalidatePath("/discover");
  revalidatePath("/account");
  return { ok: true, deleted: count };
}
