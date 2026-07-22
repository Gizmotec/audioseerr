"use server";

import { auth } from "@/auth";
import { getLyrics } from "@/lib/lyrics";

export type LyricsActionResult =
  | {
      status: "ok";
      synced: string | null;
      plain: string | null;
      instrumental: boolean;
    }
  | { status: "not_found" }
  | { status: "error" };

/**
 * Fetch synced/plain lyrics for a track. Auth-gated like the other media
 * lookups. LRClib misses come back as "not_found" (a normal result); upstream
 * failures come back as "error" so the client can offer a retry — internals
 * are logged server-side, never sent to the browser.
 */
export async function getLyricsAction(input: {
  artist: string;
  title: string;
  album?: string | null;
  durationS?: number | null;
}): Promise<LyricsActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { status: "error" };

  const artist = input.artist.trim();
  const title = input.title.trim();
  if (!artist || !title) return { status: "not_found" };

  try {
    const result = await getLyrics({
      artist,
      title,
      album: input.album ?? undefined,
      durationS: input.durationS ?? undefined,
    });
    if (
      !result ||
      (!result.syncedLyrics && !result.plainLyrics && !result.instrumental)
    ) {
      return { status: "not_found" };
    }
    return {
      status: "ok",
      synced: result.syncedLyrics,
      plain: result.plainLyrics,
      instrumental: result.instrumental,
    };
  } catch (err) {
    console.warn("[lyrics] LRClib lookup failed:", err);
    return { status: "error" };
  }
}
