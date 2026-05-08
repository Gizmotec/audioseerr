import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Per-user library scoping.
 *
 * `LibraryItem` is the global Lidarr cache (shared physical storage). Users
 * see a slice of it via `UserLibraryItem` rows. Admins bypass the filter and
 * see everything — they manage Lidarr directly, so the global library IS
 * their library.
 */

export type LibraryViewer = { id: string; role?: string | null } | null;

export function isAdmin(viewer: LibraryViewer): boolean {
  return viewer?.role === "ADMIN";
}

/**
 * Compose a `LibraryItemWhereInput` that scopes a query to what the viewer is
 * allowed to see. Admins get an empty filter (all rows); regular users get
 * `{ users: { some: { userId } } }`.
 */
export function libraryWhereForViewer(
  viewer: LibraryViewer,
): Prisma.LibraryItemWhereInput {
  if (!viewer) return { mbid: "__none__" };
  if (isAdmin(viewer)) return {};
  return { users: { some: { userId: viewer.id } } };
}

/**
 * Idempotent attach. Used both by the request flow (instant dedup) and by the
 * sync job (when an album becomes AVAILABLE). The unique (userId, mbid)
 * constraint prevents duplicate rows; createMany with `skipDuplicates` would
 * also work but `upsert` keeps the addedAt fresh on first add.
 */
export async function attachLibraryItemToUser(
  userId: string,
  mbid: string,
): Promise<void> {
  await prisma.userLibraryItem.upsert({
    where: { userId_mbid: { userId, mbid } },
    create: { userId, mbid },
    update: {},
  });
}

/**
 * Called by the sync job when a request transitions to AVAILABLE. Attaches
 * the library item to every requester who has an active (non-DECLINED) row
 * for this mbid. A user may have multiple historical requests for the same
 * album; we de-duplicate by userId via the upsert in attachLibraryItemToUser.
 */
export async function attachLibraryItemToAllRequesters(
  mbid: string,
): Promise<number> {
  const requests = await prisma.request.findMany({
    where: {
      mbid,
      status: { in: ["APPROVED", "DOWNLOADING", "AVAILABLE"] },
    },
    select: { requestedById: true },
  });
  const userIds = Array.from(new Set(requests.map((r) => r.requestedById)));
  for (const userId of userIds) {
    await attachLibraryItemToUser(userId, mbid);
  }
  return userIds.length;
}

/**
 * Stream-time authorization. Resolves a Lidarr trackFileId to the album mbid
 * (via LibraryItem.lidarrId) and verifies the viewer has UserLibraryItem
 * coverage. Admins always pass.
 *
 * Note: a track's parent album is resolved via Lidarr's track API at the
 * route level (we already have to call it for the file path). The route
 * passes the resolved albumMbid in here.
 */
export async function viewerCanStreamAlbum(
  viewer: LibraryViewer,
  albumMbid: string,
): Promise<boolean> {
  if (!viewer) return false;
  if (isAdmin(viewer)) return true;
  const row = await prisma.userLibraryItem.findUnique({
    where: { userId_mbid: { userId: viewer.id, mbid: albumMbid } },
    select: { id: true },
  });
  return row !== null;
}
