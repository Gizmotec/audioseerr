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
    // Exclude pre-downloaded temp tracks — otherwise their albums surface into
    // the LibraryItem index (Home shelves, badges), defeating "hidden until kept".
    where: { ephemeral: false },
    select: {
      albumMbid: true,
      artistName: true,
      albumTitle: true,
      users: { select: { userId: true } },
    },
  });

  // Safety: with no downloads yet (e.g. a fresh slskd-only deploy before the
  // one-time library migration has run), do nothing — never prune the existing
  // LibraryItem rows the migration is about to read.
  if (tracks.length === 0) return { albums: 0 };

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
  const kept: string[] = [];
  for (const [mbid, a] of albums) {
    // An album nobody owns (e.g. all owners deleted) shouldn't surface.
    if (a.users.size === 0) continue;
    kept.push(mbid);
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

  // Prune albums that no longer have any owned downloaded tracks (UserLibraryItem
  // rows cascade away with the LibraryItem).
  await prisma.libraryItem.deleteMany({ where: { mbid: { notIn: kept } } });

  return { albums: kept.length };
}
