import { cache } from "react";
import { prisma } from "@/lib/db";
import { libraryWhereForViewer, type LibraryViewer } from "@/lib/userLibrary";

export type LibraryStatus = "downloaded" | "downloading" | "missing";

export type LibraryHit = {
  status: LibraryStatus;
  trackFileCount: number;
  totalTrackCount: number;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nameKey(artistName: string, title: string): string {
  return `${normalize(artistName)}|${normalize(title)}`;
}

function rank(s: LibraryStatus): number {
  return s === "downloaded" ? 2 : s === "downloading" ? 1 : 0;
}

function preferHit(a: LibraryHit, b: LibraryHit): LibraryHit {
  if (rank(a.status) !== rank(b.status)) {
    return rank(a.status) > rank(b.status) ? a : b;
  }
  // Same status — prefer the entry with the most track files known.
  return a.trackFileCount >= b.trackFileCount ? a : b;
}

export type LibraryIndex = {
  lookup(album: {
    mbid: string | null;
    artistName: string;
    title: string;
  }): LibraryHit | null;
};

/**
 * Build an in-memory index of the Lidarr library for badge + stats lookups.
 * Last.fm and Lidarr frequently disagree on which release-group MBID is
 * canonical (e.g. Taylor Swift's "1989" exists as several release-groups),
 * so we fall back to a normalized artist+title key whenever the MBID misses.
 *
 * Pass `viewer` to scope the index to that user's library; omit (or pass an
 * admin viewer) to get the global view. Discover/recommendations use the
 * unscoped form so new users still see informational "in library" badges
 * for things on the server.
 */
export const buildLibraryIndex = cache(
  async (viewer?: LibraryViewer): Promise<LibraryIndex> => {
    const where = viewer ? libraryWhereForViewer(viewer) : {};
    const rows = await prisma.libraryItem.findMany({
      where,
      select: {
        mbid: true,
        artistName: true,
        title: true,
        status: true,
        trackFileCount: true,
        totalTrackCount: true,
      },
    });

  const byMbid = new Map<string, LibraryHit>();
  const byName = new Map<string, LibraryHit>();

  for (const r of rows) {
    const hit: LibraryHit = {
      status: r.status as LibraryStatus,
      trackFileCount: r.trackFileCount,
      totalTrackCount: r.totalTrackCount,
    };
    byMbid.set(r.mbid, hit);
    const key = nameKey(r.artistName, r.title);
    const existing = byName.get(key);
    byName.set(key, existing ? preferHit(hit, existing) : hit);
  }

    return {
      lookup({ mbid, artistName, title }) {
        if (mbid) {
          const direct = byMbid.get(mbid);
          if (direct) return direct;
        }
        return byName.get(nameKey(artistName, title)) ?? null;
      },
    };
  },
);

export async function getLibraryHit(
  mbid: string,
  viewer?: LibraryViewer,
): Promise<LibraryHit | null> {
  const where = viewer
    ? { ...libraryWhereForViewer(viewer), mbid }
    : { mbid };
  const row = await prisma.libraryItem.findFirst({
    where,
    select: {
      status: true,
      trackFileCount: true,
      totalTrackCount: true,
    },
  });
  return row
    ? {
        status: row.status as LibraryStatus,
        trackFileCount: row.trackFileCount,
        totalTrackCount: row.totalTrackCount,
      }
    : null;
}

export async function getLibraryHitByName(
  artistName: string,
  title: string,
  viewer?: LibraryViewer,
): Promise<LibraryHit | null> {
  const where = viewer ? libraryWhereForViewer(viewer) : {};
  const rows = await prisma.libraryItem.findMany({
    where,
    select: {
      artistName: true,
      title: true,
      status: true,
      trackFileCount: true,
      totalTrackCount: true,
    },
  });
  const target = nameKey(artistName, title);
  let best: LibraryHit | null = null;
  for (const r of rows) {
    if (nameKey(r.artistName, r.title) !== target) continue;
    const hit: LibraryHit = {
      status: r.status as LibraryStatus,
      trackFileCount: r.trackFileCount,
      totalTrackCount: r.totalTrackCount,
    };
    best = best ? preferHit(hit, best) : hit;
  }
  return best;
}
