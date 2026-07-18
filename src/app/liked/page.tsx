import { redirect } from "next/navigation";
import { auth } from "@/auth";
import type { PlaylistOption } from "@/components/AddToPlaylistButton";
import { BackLink } from "@/components/BackLink";
import { prisma } from "@/lib/db";
import { buildPlaylistStreamLookup } from "@/lib/downloadedTracks";
import { getUnsortedLikedTracks } from "@/lib/likes";
import { listPlaylists } from "@/lib/playlists";
import { isSetupComplete } from "@/lib/settings";
import { getActiveTrackRequestKeys } from "@/lib/trackRequests";
import { LikedInbox } from "./LikedInbox";

export const dynamic = "force-dynamic";

export default async function LikedPage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }
  const role = (session.user as { role?: string }).role;
  const viewer = { id: userId, role };

  const [tracks, totalLiked, playlists] = await Promise.all([
    getUnsortedLikedTracks(userId),
    prisma.like.count({ where: { userId, targetType: "TRACK" } }),
    listPlaylists(userId),
  ]);

  // Same streamability resolution as the playlist page: our own library,
  // joined on (albumMbid, position); in-flight downloads badge as "fetching".
  const [localByKey, fetchingKeys] = await Promise.all([
    buildPlaylistStreamLookup(
      viewer,
      tracks.map((t) => t.albumMbid),
    ),
    getActiveTrackRequestKeys(
      userId,
      tracks.map((t) => t.targetId),
    ),
  ]);

  const rows = tracks.map((t) => {
    const localId = localByKey.get(`${t.albumMbid}:${t.albumPosition}`) ?? null;
    const streamUrl = localId ? `/api/stream/local/${localId}` : null;
    return {
      ...t,
      streamUrl,
      fetching: !streamUrl && fetchingKeys.has(t.targetId),
    };
  });

  const playlistOptions: PlaylistOption[] = playlists.map((p) => ({
    id: p.id,
    name: p.name,
    trackCount: p.trackCount,
  }));

  return (
    <main className="relative isolate mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
      <BackLink fallbackHref="/home" />
      <LikedInbox
        tracks={rows}
        totalLiked={totalLiked}
        playlists={playlistOptions}
      />
    </main>
  );
}
