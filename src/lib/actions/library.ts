"use server";

import { unlink } from "node:fs/promises";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getArtist } from "@/lib/musicbrainz";

type ActionResult = { ok: true } | { ok: false; error: string };

async function requireAdmin(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user) return { ok: false, error: "Not signed in." };
  const role = (session.user as { role?: string }).role;
  if (role !== "ADMIN") return { ok: false, error: "Admin only." };
  return { ok: true };
}

async function deleteFiles(tracks: { filePath: string }[]): Promise<void> {
  for (const t of tracks) {
    await unlink(t.filePath).catch(() => {
      // Best-effort — the DB row is removed regardless.
    });
  }
}

export async function deleteLibraryAlbumAction(
  mbid: string,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const tracks = await prisma.downloadedTrack.findMany({
    where: { albumMbid: mbid },
    select: { filePath: true },
  });
  await deleteFiles(tracks);
  // DownloadedTrack/LibraryItem deletes cascade to their per-user rows.
  await prisma.downloadedTrack.deleteMany({ where: { albumMbid: mbid } });
  await prisma.libraryItem.delete({ where: { mbid } }).catch(() => {});

  revalidatePath("/library");
  revalidatePath(`/album/${mbid}`);
  return { ok: true };
}

export async function deleteLibraryArtistAction(
  artistMbid: string,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const artist = await getArtist(artistMbid);
  if (!artist) return { ok: false, error: "Artist not found." };

  // Scope by the artist's release-group MBIDs (the album identity), never by
  // display name — name matching would miss collaborations and could destroy a
  // different same-named artist's shared files.
  const albumMbids = artist.releaseGroups.map((rg) => rg.mbid);
  if (albumMbids.length === 0) {
    return { ok: false, error: "No releases found for this artist." };
  }

  const tracks = await prisma.downloadedTrack.findMany({
    where: { albumMbid: { in: albumMbids } },
    select: { filePath: true },
  });
  await deleteFiles(tracks);
  await prisma.downloadedTrack.deleteMany({
    where: { albumMbid: { in: albumMbids } },
  });
  await prisma.libraryItem.deleteMany({ where: { mbid: { in: albumMbids } } });

  revalidatePath("/library");
  revalidatePath(`/artist/${artistMbid}`);
  return { ok: true };
}
