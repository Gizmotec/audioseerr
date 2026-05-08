import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { buildLibraryIndex } from "@/lib/library";
import { getLikedSet } from "@/lib/likes";
import { searchAlbums } from "@/lib/musicbrainz";
import { getRecentSearches, recordSearch } from "@/lib/recentSearches";
import { isSetupComplete } from "@/lib/settings";
import { AlbumCard } from "./AlbumCard";
import { RecentSearches } from "./RecentSearches";
import { SearchBar } from "./SearchBar";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ q?: string }>;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const userId = session.user.id;
  const role = (session.user as { role?: string }).role;
  const viewer = { id: userId, role };

  const { q } = await searchParams;
  const query = q?.trim() ?? "";

  let results: Awaited<ReturnType<typeof searchAlbums>> = [];
  let error: string | null = null;
  if (query) {
    try {
      results = await searchAlbums(query);
      await recordSearch(userId, query);
    } catch (err) {
      error = err instanceof Error ? err.message : "Search failed";
    }
  }

  const [library, recent, likedAlbums] = await Promise.all([
    buildLibraryIndex(viewer),
    query ? Promise.resolve([]) : getRecentSearches(userId),
    getLikedSet(
      userId,
      "ALBUM",
      results.map((a) => a.mbid),
    ),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 md:px-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-sm text-muted-foreground">
          Album search, powered by MusicBrainz.
        </p>
      </header>

      <SearchBar initialQuery={query} />

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {!error && query && results.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No albums found for &ldquo;{query}&rdquo;.
        </p>
      )}

      {results.length > 0 && (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {results.map((album) => (
            <li key={album.mbid}>
              <AlbumCard
                album={album}
                libraryHit={library.lookup(album)}
                liked={likedAlbums.has(album.mbid)}
              />
            </li>
          ))}
        </ul>
      )}

      {!query && recent.length > 0 && <RecentSearches items={recent} />}

      {!query && recent.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Try an artist or album above &mdash; e.g. <em>Radiohead In Rainbows</em>.
        </p>
      )}
    </main>
  );
}
