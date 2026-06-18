"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { resolveSong } from "@/lib/songResolve";
import { ensureTrackRequested } from "@/lib/trackRequests";

type Result = { ok: true } | { ok: false; error: string };

// Discovery tracks come from Deezer/Last.fm with only title/artist/album — no
// MusicBrainz ids — so we resolve them here, on click, rather than for every
// chart row at page load. A resolution miss is the common failure and surfaces
// as a plain "couldn't find" on the row.
const NOT_FOUND = "Couldn't find this track to download.";

/**
 * Resolve a discovered song to a MusicBrainz album + position, then hand it to
 * the existing slskd request path (auto-approve + dedup live in
 * ensureTrackRequested). Idempotent: re-requesting an owned/in-flight track is a
 * no-op there, so the caller can safely flip the row to "added".
 */
export async function requestDiscoveryTrackAction(input: {
  title: string;
  artistName: string;
  albumTitle: string | null;
  coverUrl: string | null;
}): Promise<Result> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };

  // Discovery is single-heavy, so resolve against singles too (not just
  // albums/EPs) — otherwise a charting single never finds its release group.
  const resolved = await resolveSong(input, { includeSingles: true });
  if (!resolved) return { ok: false, error: NOT_FOUND };

  await ensureTrackRequested(userId, {
    albumMbid: resolved.albumMbid,
    albumTitle: resolved.albumTitle,
    artistName: resolved.artistName,
    coverUrl: resolved.coverUrl,
    recordingMbid: resolved.recordingMbid,
    trackTitle: resolved.title,
    albumPosition: resolved.albumPosition,
  });

  revalidatePath("/requests");
  return { ok: true };
}
