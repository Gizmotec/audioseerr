"use server";

import { after } from "next/server";
import { auth } from "@/auth";
import { recordPlay, type RecordPlayInput } from "@/lib/playHistory";
import { scrobbleTrack } from "@/lib/scrobble";

export async function recordPlayAction(
  input: RecordPlayInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };

  await recordPlay(userId, input);

  // Scrobble to Last.fm/ListenBrainz after the response finishes so external
  // API latency never delays the client. scrobbleTrack swallows per-service
  // errors internally (console.warn), so nothing here can throw into the
  // play path. Deezer 30s previews never reach this action by design.
  after(() => scrobbleTrack(userId, input));

  return { ok: true };
}
