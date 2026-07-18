"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { clearSpotifyTokens } from "@/lib/spotify";

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveSpotifyClientIdAction(
  clientId: string,
): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  const trimmed = clientId.trim();
  if (trimmed && !/^[a-f0-9]{32}$/i.test(trimmed)) {
    return {
      ok: false,
      error: "Spotify Client IDs are 32 hex characters. Double-check the value.",
    };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      spotifyClientId: trimmed || null,
      // If the Client ID changes, any tokens we hold belong to the old app
      // and won't work — clear them so the user re-authorizes.
      ...(trimmed
        ? {}
        : {
            spotifyAccessToken: null,
            spotifyRefreshToken: null,
            spotifyTokenExpiresAt: null,
          }),
    },
  });
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function disconnectSpotifyAction(): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  await clearSpotifyTokens(session.user.id);
  revalidatePath("/admin/settings");
  return { ok: true };
}
