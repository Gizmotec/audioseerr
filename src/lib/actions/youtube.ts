"use server";

import { auth } from "@/auth";
import { resolveYouTubeVideoId } from "@/lib/youtube";

export type ResolveYouTubeResult =
  | { ok: true; videoId: string }
  | { ok: false; reason: "unauthorized" | "no-key" | "not-found" };

/**
 * Look up a YouTube videoId for a track. Auth-gated — playable previews are
 * a logged-in feature. Returns a discriminated reason on miss so the client
 * can pick the right fallback (open search in new tab vs. inline error).
 */
export async function resolveYouTubeVideoAction(input: {
  artistName: string;
  trackTitle: string;
}): Promise<ResolveYouTubeResult> {
  const session = await auth();
  if (!session?.user) return { ok: false, reason: "unauthorized" };

  const artistName = input.artistName.trim();
  const trackTitle = input.trackTitle.trim();
  if (!artistName || !trackTitle) return { ok: false, reason: "not-found" };

  if (!process.env.YOUTUBE_API_KEY?.trim()) {
    return { ok: false, reason: "no-key" };
  }

  const videoId = await resolveYouTubeVideoId(artistName, trackTitle);
  if (!videoId) return { ok: false, reason: "not-found" };
  return { ok: true, videoId };
}
