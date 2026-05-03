import { prisma } from "@/lib/db";

export type LibraryStatus = "downloaded" | "downloading" | "missing";

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

export type LibraryIndex = {
  lookup(album: {
    mbid: string | null;
    artistName: string;
    title: string;
  }): LibraryStatus | null;
};

/**
 * Build an in-memory index of the Lidarr library for badge lookups. Last.fm
 * and Lidarr frequently disagree on which release-group MBID is canonical
 * (e.g. Taylor Swift's "1989" exists as several release-groups), so we
 * fall back to a normalized artist+title key whenever the MBID misses.
 */
export async function buildLibraryIndex(): Promise<LibraryIndex> {
  const rows = await prisma.libraryItem.findMany({
    select: { mbid: true, artistName: true, title: true, status: true },
  });

  const byMbid = new Map<string, LibraryStatus>();
  const byName = new Map<string, LibraryStatus>();

  for (const r of rows) {
    const status = r.status as LibraryStatus;
    byMbid.set(r.mbid, status);
    const key = nameKey(r.artistName, r.title);
    // Prefer "downloaded" over "missing" when multiple releases of the same
    // album exist in the library.
    const existing = byName.get(key);
    if (!existing || rank(status) > rank(existing)) {
      byName.set(key, status);
    }
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
}

function rank(s: LibraryStatus): number {
  return s === "downloaded" ? 2 : s === "downloading" ? 1 : 0;
}

export async function getLibraryStatus(mbid: string): Promise<LibraryStatus | null> {
  const row = await prisma.libraryItem.findUnique({
    where: { mbid },
    select: { status: true },
  });
  return row ? (row.status as LibraryStatus) : null;
}

export async function getLibraryStatusByName(
  artistName: string,
  title: string,
): Promise<LibraryStatus | null> {
  const rows = await prisma.libraryItem.findMany({
    select: { artistName: true, title: true, status: true },
  });
  const target = nameKey(artistName, title);
  let best: LibraryStatus | null = null;
  for (const r of rows) {
    if (nameKey(r.artistName, r.title) === target) {
      const status = r.status as LibraryStatus;
      if (!best || rank(status) > rank(best)) best = status;
    }
  }
  return best;
}
