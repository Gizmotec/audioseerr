import { prisma } from "@/lib/db";
import {
  classifyAlbum,
  getQueue,
  type LidarrConfig,
  listAllAlbums,
  listArtists,
} from "@/lib/lidarr";
import { getSettings } from "@/lib/settings";

let running = false;

/**
 * Pulls the full Lidarr library into the LibraryItem table (design doc §10).
 * Two endpoints carry the whole catalogue: /artist and /album, so this stays
 * fast even for libraries with hundreds of artists.
 */
export async function syncLibrary(): Promise<{
  artists: number;
  albums: number;
  pruned: number;
}> {
  if (running) return { artists: 0, albums: 0, pruned: 0 };
  running = true;
  try {
    const settings = await getSettings();
    if (
      !settings.lidarrUrl ||
      !settings.lidarrApiKey ||
      !settings.setupComplete
    ) {
      return { artists: 0, albums: 0, pruned: 0 };
    }
    const config: LidarrConfig = {
      url: settings.lidarrUrl,
      apiKey: settings.lidarrApiKey,
    };

    const [artists, albums] = await Promise.all([
      listArtists(config),
      listAllAlbums(config),
    ]);

    let queueAlbumIds = new Set<number>();
    try {
      const queue = await getQueue(config);
      queueAlbumIds = new Set(
        queue.map((q) => q.albumId).filter((id): id is number => typeof id === "number"),
      );
    } catch {
      // Queue is decorative for status; skip it on error.
    }

    const artistById = new Map(artists.map((a) => [a.id, a]));
    const seenMbids = new Set<string>();
    const now = new Date();

    for (const album of albums) {
      if (!album.foreignAlbumId) continue;
      const artist = artistById.get(album.artistId);
      const status = classifyAlbum(album, queueAlbumIds);
      const trackFileCount = album.statistics?.trackFileCount ?? 0;
      const totalTrackCount = album.statistics?.totalTrackCount ?? 0;

      await prisma.libraryItem.upsert({
        where: { mbid: album.foreignAlbumId },
        update: {
          lidarrId: album.id,
          status,
          artistName: artist?.artistName ?? "Unknown",
          title: album.title,
          trackFileCount,
          totalTrackCount,
          lastSyncedAt: now,
        },
        create: {
          mbid: album.foreignAlbumId,
          lidarrId: album.id,
          status,
          artistName: artist?.artistName ?? "Unknown",
          title: album.title,
          trackFileCount,
          totalTrackCount,
          lastSyncedAt: now,
        },
      });
      seenMbids.add(album.foreignAlbumId);
    }

    // Prune entries Lidarr no longer knows about (artist/album removed).
    const stale = await prisma.libraryItem.findMany({
      where: { mbid: { notIn: Array.from(seenMbids) } },
      select: { mbid: true },
    });
    if (stale.length > 0) {
      await prisma.libraryItem.deleteMany({
        where: { mbid: { in: stale.map((s) => s.mbid) } },
      });
    }

    return { artists: artists.length, albums: albums.length, pruned: stale.length };
  } finally {
    running = false;
  }
}
