"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { executeRequestApproval } from "@/app/admin/requests/actions";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getSpotifyConnection } from "@/lib/spotify";
import { getPlaylistTracks } from "@/lib/spotify-api";
import { matchSpotifyTracks } from "@/lib/spotify-match";

export type ImportResult =
  | {
      ok: true;
      created: number;
      duplicates: number;
      unmatched: number;
      autoApproved: number;
      autoApproveFailures: number;
    }
  | { ok: false; error: string };

export async function importPlaylistAction(
  playlistId: string,
): Promise<ImportResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, error: "Not signed in." };

  const conn = await getSpotifyConnection(userId);
  if (!conn) return { ok: false, error: "Spotify is not connected." };

  const requester = await prisma.user.findUnique({
    where: { id: userId },
    select: { autoApproveTrack: true },
  });
  if (!requester) return { ok: false, error: "User record missing." };

  let tracks: Awaited<ReturnType<typeof getPlaylistTracks>>;
  try {
    tracks = await getPlaylistTracks(userId, playlistId);
  } catch (e) {
    return {
      ok: false,
      error: `Couldn't fetch playlist from Spotify: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // MB matching — second run hits cache, so this is fast even for big lists.
  const { matched, notFound } = await matchSpotifyTracks(tracks);

  // Pre-load existing requests for this user so we can dedupe in-memory rather
  // than firing one findFirst per track (would balloon to N queries).
  const trackKeys = matched.map(
    (m) => `${m.album.mbid}:${m.spotifyTrack.trackNumber}`,
  );
  const existing = await prisma.request.findMany({
    where: {
      requestedById: userId,
      type: "TRACK",
      mbid: { in: trackKeys },
      status: { in: ["PENDING", "APPROVED", "DOWNLOADING", "AVAILABLE"] },
    },
    select: { mbid: true },
  });
  const existingKeys = new Set(existing.map((e) => e.mbid));

  let created = 0;
  let duplicates = 0;
  let autoApproved = 0;
  let autoApproveFailures = 0;
  const settings = requester.autoApproveTrack ? await getSettings() : null;
  const albumPathsToRevalidate = new Set<string>();

  for (const m of matched) {
    const mbid = `${m.album.mbid}:${m.spotifyTrack.trackNumber}`;
    if (existingKeys.has(mbid)) {
      duplicates += 1;
      continue;
    }

    const request = await prisma.request.create({
      data: {
        type: "TRACK",
        mbid,
        title: m.spotifyTrack.name,
        artistName: m.spotifyTrack.primaryArtist,
        coverUrl: m.album.coverUrl,
        albumMbid: m.album.mbid,
        albumTitle: m.album.title,
        recordingMbid: null,
        albumPosition: m.spotifyTrack.trackNumber,
        requestedById: userId,
        status: "PENDING",
      },
    });
    created += 1;
    albumPathsToRevalidate.add(m.album.mbid);

    if (requester.autoApproveTrack && settings) {
      const result = await executeRequestApproval(request, settings);
      if (result.ok) autoApproved += 1;
      else autoApproveFailures += 1;
    }
  }

  // Snapshot the playlist's current track IDs so the next preview can show a
  // "X new since last import" diff. Snapshot the full playlist (not just
  // matched), so a track that fails to match today but works after a MB
  // metadata update still counts as "previously seen".
  await prisma.spotifyPlaylistImport.upsert({
    where: { userId_playlistId: { userId, playlistId } },
    create: {
      userId,
      playlistId,
      trackIdsJson: JSON.stringify(tracks.map((t) => t.id)),
    },
    update: {
      trackIdsJson: JSON.stringify(tracks.map((t) => t.id)),
      lastImportedAt: new Date(),
    },
  });

  for (const mbid of albumPathsToRevalidate) {
    revalidatePath(`/album/${mbid}`);
  }
  revalidatePath("/requests");
  revalidatePath("/admin/requests");
  revalidatePath(`/import/spotify/${playlistId}`);

  return {
    ok: true,
    created,
    duplicates,
    unmatched: notFound.length,
    autoApproved,
    autoApproveFailures,
  };
}
