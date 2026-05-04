"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { clearRecentSearches, deleteRecentSearch } from "@/lib/recentSearches";

type ActionResult = { ok: true } | { ok: false; error: string };

export async function deleteRecentSearchAction(query: string): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };
  await deleteRecentSearch(userId, query);
  revalidatePath("/search");
  return { ok: true };
}

export async function clearRecentSearchesAction(): Promise<ActionResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };
  await clearRecentSearches(userId);
  revalidatePath("/search");
  return { ok: true };
}
