"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  deleteAlbum,
  deleteArtist,
  findArtistByMbid,
  type LidarrConfig,
} from "@/lib/lidarr";
import { getSettings } from "@/lib/settings";

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

async function getLidarrConfig(): Promise<
  { ok: true; config: LidarrConfig } | { ok: false; error: string }
> {
  const settings = await getSettings();
  if (!settings.lidarrUrl || !settings.lidarrApiKey) {
    return { ok: false, error: "Lidarr is not configured." };
  }
  return {
    ok: true,
    config: { url: settings.lidarrUrl, apiKey: settings.lidarrApiKey },
  };
}

export async function deleteLibraryAlbumAction(
  mbid: string,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const item = await prisma.libraryItem.findUnique({ where: { mbid } });
  if (!item) return { ok: false, error: "Album not found in library." };

  const cfg = await getLidarrConfig();
  if (!cfg.ok) return cfg;

  try {
    await deleteAlbum(cfg.config, item.lidarrId, {
      deleteFiles: true,
      addImportListExclusion: false,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to delete album.",
    };
  }

  // Drop the cache row immediately so the UI updates without waiting for the
  // 15-min syncLibrary cron.
  await prisma.libraryItem.delete({ where: { mbid } }).catch(() => {});

  revalidatePath("/library");
  revalidatePath(`/album/${mbid}`);
  return { ok: true };
}

/**
 * Delete an artist from Lidarr — wipes all albums + files and adds an import
 * list exclusion so Lidarr's auto-sync won't re-add them.
 *
 * `artistMbid` is the MusicBrainz artist MBID. We resolve to Lidarr's numeric
 * artist id via Lidarr's own index.
 */
export async function deleteLibraryArtistAction(
  artistMbid: string,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard;

  const cfg = await getLidarrConfig();
  if (!cfg.ok) return cfg;

  const artist = await findArtistByMbid(cfg.config, artistMbid);
  if (!artist) return { ok: false, error: "Artist not found in Lidarr." };

  try {
    await deleteArtist(cfg.config, artist.id, {
      deleteFiles: true,
      addImportListExclusion: true,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Failed to delete artist.",
    };
  }

  // Wipe library cache rows for this artist so the UI updates immediately.
  // Match by artistName since LibraryItem doesn't carry the artist MBID.
  await prisma.libraryItem
    .deleteMany({ where: { artistName: artist.artistName } })
    .catch(() => {});

  revalidatePath("/library");
  revalidatePath(`/artist/${artistMbid}`);
  return { ok: true };
}
