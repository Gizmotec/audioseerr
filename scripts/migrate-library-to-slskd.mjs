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
// albumMbid + absolute position) and attaches each user. Idempotent and
// create-only — safe to re-run; it never overwrites rows a later slskd download
// populated. recordingMbid is left null (Lidarr doesn't expose it); the album
// page and playlists resolve migrated tracks by albumMbid + position.
//
// Known limitation: position is taken from Lidarr's absoluteTrackNumber, which
// matches the app for single-release albums. For release-groups where Lidarr's
// imported release differs from MusicBrainz's preferred one (some multi-disc /
// deluxe editions), a few tracks may not line up and will show as
// not-downloaded — re-request those albums to refetch them via slskd.

import "dotenv/config";
import { createDecipheriv, createHash } from "node:crypto";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";

// Mirrors src/lib/encryption.ts (AES-256-GCM, key = sha256(AUDIOSEERR_SECRET),
// format iv:ct:tag base64url) so we can read the stored Lidarr API key.
function decrypt(payload) {
  const secret = process.env.AUDIOSEERR_SECRET;
  if (!secret) throw new Error("AUDIOSEERR_SECRET is not set");
  const k = createHash("sha256").update(secret).digest();
  const [iv, ct, tag] = payload.split(":").map((p) => Buffer.from(p, "base64url"));
  const d = createDecipheriv("aes-256-gcm", k, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
}

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const settings = await prisma.settings.findUnique({ where: { id: 1 } });

// Lidarr creds: prefer env vars, otherwise read them from the app's Settings
// (so this runs inside the container with no secrets passed).
const LIDARR_URL = (process.env.LIDARR_URL || settings?.lidarrUrl || "").replace(/\/+$/, "");
let LIDARR_API_KEY = process.env.LIDARR_API_KEY || "";
if (!LIDARR_API_KEY && settings?.lidarrApiKey) {
  try {
    LIDARR_API_KEY = decrypt(settings.lidarrApiKey);
  } catch (err) {
    console.error(`Could not decrypt stored Lidarr API key: ${err.message}`);
  }
}
if (!LIDARR_URL || !LIDARR_API_KEY) {
  console.error(
    "No Lidarr credentials. Set LIDARR_URL + LIDARR_API_KEY, or run while the app's Settings still hold them.",
  );
  await prisma.$disconnect();
  process.exit(1);
}

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

const maps = parsePathMap(settings?.mediaPathMap);

const albums = await prisma.libraryItem.findMany({
  where: { status: "downloaded", trackFileCount: { gt: 0 } },
});

// Read all per-user visibility up front and group by album, so a concurrent
// syncDownloadedLibrary tick can't prune UserLibraryItem rows mid-migration.
const usersByMbid = new Map();
for (const r of await prisma.userLibraryItem.findMany({
  select: { userId: true, mbid: true },
})) {
  const list = usersByMbid.get(r.mbid) ?? [];
  list.push(r.userId);
  usersByMbid.set(r.mbid, list);
}

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

    const userIds = usersByMbid.get(album.mbid) ?? [];

    for (const t of tracks) {
      if (!t.hasFile || !t.trackFileId) continue;
      const rawPath = pathById.get(t.trackFileId);
      if (!rawPath) continue;
      const pos = t.absoluteTrackNumber ?? Number.parseInt(t.trackNumber, 10);
      if (!Number.isFinite(pos) || pos <= 0) continue;
      const filePath = applyPathMap(rawPath, maps);

      const dt = await prisma.downloadedTrack.upsert({
        where: { albumMbid_albumPosition: { albumMbid: album.mbid, albumPosition: pos } },
        // Create-only: never overwrite a row a later slskd download already
        // populated (its filePath/format/recordingMbid are authoritative).
        update: {},
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
