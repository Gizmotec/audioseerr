import { prisma } from "@/lib/db";

/**
 * Rebuilds the album-library index (LibraryItem + UserLibraryItem) from the
 * DownloadedTrack table. This replaces the old Lidarr-backed syncLibrary job:
 * LibraryItem is now a derived view of what we've downloaded via slskd (one row
 * per album, status always "downloaded"), so the existing library/home/badge
 * consumers keep working without each querying DownloadedTrack directly.
 */
export async function syncDownloadedLibrary(): Promise<{ albums: number }> {
  const tracks = await prisma.downloadedTrack.findMany({
    select: {
      albumMbid: true,
      artistName: true,
      albumTitle: true,
      users: { select: { userId: true } },
    },
  });

  const albums = new Map<
    string,
    { artistName: string; title: string; count: number; users: Set<string> }
  >();
  for (const t of tracks) {
    let a = albums.get(t.albumMbid);
    if (!a) {
      a = {
        artistName: t.artistName,
        title: t.albumTitle ?? t.artistName,
        count: 0,
        users: new Set(),
      };
      albums.set(t.albumMbid, a);
    }
    a.count++;
    for (const u of t.users) a.users.add(u.userId);
  }

  const now = new Date();
  for (const [mbid, a] of albums) {
    await prisma.libraryItem.upsert({
      where: { mbid },
      update: {
        status: "downloaded",
        artistName: a.artistName,
        title: a.title,
        trackFileCount: a.count,
        totalTrackCount: a.count,
        lastSyncedAt: now,
      },
      create: {
        mbid,
        lidarrId: null,
        status: "downloaded",
        artistName: a.artistName,
        title: a.title,
        trackFileCount: a.count,
        totalTrackCount: a.count,
        lastSyncedAt: now,
      },
    });
    for (const userId of a.users) {
      await prisma.userLibraryItem
        .upsert({
          where: { userId_mbid: { userId, mbid } },
          create: { userId, mbid },
          update: {},
        })
        .catch(() => {
          // user/library row race — next run reconciles
        });
    }
  }

  return { albums: albums.size };
}
