import type { Prisma } from "@prisma/client";

/**
 * Per-user library scoping.
 *
 * `LibraryItem` is the derived album-library index (rebuilt from DownloadedTrack
 * by syncDownloadedLibrary). Users see a slice of it via `UserLibraryItem` rows;
 * admins bypass the filter and see everything.
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
