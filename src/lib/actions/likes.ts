"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { isLiked, type LikePayload, toggleLike, trackLikeTargetId } from "@/lib/likes";
import { resolveSong } from "@/lib/songResolve";
import { ensureTrackRequested } from "@/lib/trackRequests";

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
  if (payload.targetType === "TRACK") {
    revalidatePath("/playlists");
    revalidatePath("/liked");
  }

  return { ok: true, liked };
}

/**
 * Identity for a track the user wants to like. Either a fully-known track
 * (library/playlist/recommendation rows pass recordingMbid + albumMbid +
 * albumPosition) or a loose Deezer-style preview (discover shelves / "new" mix
 * picks pass only title/artist/album), which we resolve to MusicBrainz here.
 */
export type TrackLikeInput = {
  recordingMbid?: string | null;
  albumMbid?: string | null;
  albumPosition?: number | null;
  title: string;
  artistName: string;
  albumTitle?: string | null;
  coverUrl?: string | null;
  durationMs?: number | null;
  /** Skip the auto-download on like (e.g. unit/test paths). Defaults to on. */
  download?: boolean;
};

/**
 * Toggle a "liked song" anywhere in the UI. A like means "I want this song," so
 * on like we also ensure it's on its way into the library (idempotent — a no-op
 * for songs already owned/in-flight). Preview-only rows with no MusicBrainz ids
 * are resolved on click; a resolution miss is the common, surfaced failure.
 */
export async function toggleTrackLikeAction(
  input: TrackLikeInput,
): Promise<{ ok: true; liked: boolean } | { ok: false; error: string }> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };

  let recordingMbid = input.recordingMbid ?? null;
  let albumMbid = input.albumMbid ?? null;
  let albumPosition = input.albumPosition ?? null;
  let albumTitle = input.albumTitle ?? null;
  let coverUrl = input.coverUrl ?? null;

  // No album context → loose preview. Resolve it to a concrete MB position so it
  // can be downloaded and later rendered in the Liked Songs list.
  if (!albumMbid || albumPosition == null) {
    const resolved = await resolveSong(
      {
        title: input.title,
        artistName: input.artistName,
        albumTitle,
        coverUrl,
      },
      { includeSingles: true },
    );
    if (!resolved) return { ok: false, error: "Couldn't find this track." };
    recordingMbid = resolved.recordingMbid;
    albumMbid = resolved.albumMbid;
    albumPosition = resolved.albumPosition;
    albumTitle = resolved.albumTitle;
    coverUrl = coverUrl ?? resolved.coverUrl;
  }

  const targetId = trackLikeTargetId(recordingMbid, albumMbid, albumPosition);
  if (!targetId) return { ok: false, error: "Couldn't find this track." };

  const { liked } = await toggleLike(userId, {
    targetType: "TRACK",
    targetId,
    title: input.title,
    artistName: input.artistName,
    albumMbid,
    albumTitle,
    coverUrl,
  });

  if (liked && input.download !== false && albumMbid && albumPosition != null) {
    // Best-effort and idempotent: owned/in-flight tracks are skipped inside.
    await ensureTrackRequested(userId, {
      albumMbid,
      albumTitle,
      artistName: input.artistName,
      coverUrl,
      recordingMbid,
      trackTitle: input.title,
      albumPosition,
    });
  }

  revalidatePath("/playlists");
  revalidatePath("/liked");
  revalidatePath("/library");
  if (albumMbid) revalidatePath(`/album/${albumMbid}`);

  return { ok: true, liked };
}

/**
 * Whether the user has liked the track with this recording MBID. Used by the
 * player bar to show the right heart state when a track starts. Cheap, indexed
 * lookup; preview-only tracks (no MBID) skip this and default to unliked.
 */
export async function getTrackLikedAction(
  recordingMbid: string,
): Promise<boolean> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return false;
  return isLiked(userId, "TRACK", recordingMbid);
}
