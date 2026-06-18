// One-time migration: convert the existing Lidarr-synced library into
// Audioseerr-owned DownloadedTrack rows, so playback keeps working after Lidarr
// is removed (Phase 3 of the slskd migration).
//
// Run this ONCE, while Lidarr is still reachable, BEFORE dropping the
// LibraryItem/UserLibraryItem tables:
//
//   LIDARR_URL=http://lidarr:8686 LIDARR_API_KEY=xxxxx \
//     node scripts/migrate-library-to-slskd.mjs
//
// It reads the existing LibraryItem (downloaded albums) + UserLibraryItem
// (per-user visibility) from the DB and Lidarr's track/trackfile API for the
// on-disk paths, then upserts one DownloadedTrack per track (keyed on
// albumMbid + absolute position) and attaches each user. Idempotent — safe to
// re-run. recordingMbid is left null (Lidarr doesn't expose it); the album page
// and playlists resolve migrated tracks by albumMbid + position.

import "dotenv/config";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

const LIDARR_URL = process.env.LIDARR_URL?.replace(/\/+$/, "");
const LIDARR_API_KEY = process.env.LIDARR_API_KEY;
if (!LIDARR_URL || !LIDARR_API_KEY) {
  console.error("Set LIDARR_URL and LIDARR_API_KEY env vars.");
  process.exit(1);
}

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function parsePathMap(raw) {
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .map((e) => {
      const i = e.indexOf(":");
      return {
        from: e.slice(0, i).replace(/\/+$/, ""),
        to: e.slice(i + 1).replace(/\/+$/, ""),
      };
    })
    .filter((m) => m.from && m.to);
}
function applyPathMap(p, maps) {
  const sorted = [...maps].sort((a, b) => b.from.length - a.from.length);
  for (const m of sorted) {
    if (p === m.from || p.startsWith(`${m.from}/`)) return `${m.to}${p.slice(m.from.length)}`;
  }
  return p;
}
async function lidarr(path) {
  const res = await fetch(`${LIDARR_URL}${path}`, {
    headers: { "X-Api-Key": LIDARR_API_KEY, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Lidarr ${path} -> HTTP ${res.status}`);
  return res.json();
}
const coverUrl = (mbid) => `https://coverartarchive.org/release-group/${mbid}/front-250`;

const settings = await prisma.settings.findUnique({ where: { id: 1 } });
const maps = parsePathMap(settings?.mediaPathMap);

const albums = await prisma.libraryItem.findMany({
  where: { status: "downloaded", trackFileCount: { gt: 0 } },
});
console.log(`Migrating ${albums.length} downloaded album(s)…`);

let tracksCreated = 0;
let usersAttached = 0;
let albumsFailed = 0;

for (const album of albums) {
  try {
    const [tracks, files] = await Promise.all([
      lidarr(`/api/v1/track?albumId=${album.lidarrId}`),
      lidarr(`/api/v1/trackFile?albumId=${album.lidarrId}`),
    ]);
    const pathById = new Map(files.map((f) => [f.id, f.path]));

    const userRows = await prisma.userLibraryItem.findMany({
      where: { mbid: album.mbid },
      select: { userId: true },
    });
    const userIds = userRows.map((r) => r.userId);

    for (const t of tracks) {
      if (!t.hasFile || !t.trackFileId) continue;
      const rawPath = pathById.get(t.trackFileId);
      if (!rawPath) continue;
      const pos = t.absoluteTrackNumber ?? Number.parseInt(t.trackNumber, 10);
      if (!Number.isFinite(pos) || pos <= 0) continue;
      const filePath = applyPathMap(rawPath, maps);

      const dt = await prisma.downloadedTrack.upsert({
        where: { albumMbid_albumPosition: { albumMbid: album.mbid, albumPosition: pos } },
        update: { filePath, title: t.title ?? `Track ${pos}` },
        create: {
          recordingMbid: null,
          albumMbid: album.mbid,
          albumPosition: pos,
          title: t.title ?? `Track ${pos}`,
          artistName: album.artistName,
          albumTitle: album.title,
          coverUrl: coverUrl(album.mbid),
          filePath,
        },
      });
      tracksCreated++;

      for (const userId of userIds) {
        await prisma.userDownloadedTrack.upsert({
          where: { userId_downloadedTrackId: { userId, downloadedTrackId: dt.id } },
          create: { userId, downloadedTrackId: dt.id },
          update: {},
        });
        usersAttached++;
      }
    }
    console.log(`  ✓ ${album.artistName} — ${album.title}`);
  } catch (err) {
    albumsFailed++;
    console.error(`  ✗ ${album.artistName} — ${album.title}: ${err.message}`);
  }
}

console.log(
  `\nDone. ${tracksCreated} track row(s) upserted, ${usersAttached} user attachment(s), ${albumsFailed} album(s) failed.`,
);
await prisma.$disconnect();
