"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { validateToken } from "@/lib/scrobble/listenbrainz";

export type ScrobbleActionResult = { ok: true } | { ok: false; error: string };

export async function connectListenBrainzAction(
  token: string,
): Promise<ScrobbleActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };

  const trimmed = token.trim();
  if (!trimmed) return { ok: false, error: "Paste your ListenBrainz token first." };

  let result;
  try {
    result = await validateToken(trimmed);
  } catch (e) {
    console.warn("[scrobble] ListenBrainz validate-token request failed:", e);
    return {
      ok: false,
      error: "Couldn't reach ListenBrainz — try again in a moment.",
    };
  }
  if (!result.valid) {
    return {
      ok: false,
      error: "ListenBrainz rejected that token. Copy it from listenbrainz.org/profile/.",
    };
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      listenbrainzUsername: result.userName,
      listenbrainzToken: encrypt(trimmed),
      // Connecting is an explicit opt-in to scrobbling.
      scrobbleListenbrainz: true,
    },
  });
  revalidatePath("/account");
  return { ok: true };
}

export async function disconnectListenBrainzAction(): Promise<ScrobbleActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      listenbrainzUsername: null,
      listenbrainzToken: null,
      scrobbleListenbrainz: false,
    },
  });
  revalidatePath("/account");
  return { ok: true };
}

export async function setListenBrainzEnabledAction(
  enabled: boolean,
): Promise<ScrobbleActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { listenbrainzToken: true },
  });
  if (enabled && !user?.listenbrainzToken) {
    return { ok: false, error: "Connect ListenBrainz first." };
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { scrobbleListenbrainz: enabled },
  });
  revalidatePath("/account");
  return { ok: true };
}

export async function disconnectLastFmAction(): Promise<ScrobbleActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  await prisma.user.update({
    where: { id: session.user.id },
    data: {
      lastfmUsername: null,
      lastfmSessionKey: null,
      scrobbleLastfm: false,
    },
  });
  revalidatePath("/account");
  return { ok: true };
}

export async function setLastFmEnabledAction(
  enabled: boolean,
): Promise<ScrobbleActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not signed in." };
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { lastfmSessionKey: true },
  });
  if (enabled && !user?.lastfmSessionKey) {
    return { ok: false, error: "Connect Last.fm first." };
  }
  await prisma.user.update({
    where: { id: session.user.id },
    data: { scrobbleLastfm: enabled },
  });
  revalidatePath("/account");
  return { ok: true };
}
