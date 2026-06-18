import { ArrowLeft, User } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { TopTracksList } from "@/components/TopTracksList";
import { loadArtistLanding } from "@/lib/artistLanding";
import { buildLibraryIndex } from "@/lib/library";
import { getLikedSet } from "@/lib/likes";
import {
  type MbAlbum,
  normalizeName,
  searchAlbums,
  searchArtists,
} from "@/lib/musicbrainz";
import { getRecentSearches, recordSearch } from "@/lib/recentSearches";
import { getSettings, isSetupComplete } from "@/lib/settings";
import { AlbumCard } from "./AlbumCard";
import { RecentSearches } from "./RecentSearches";
import { SearchBar } from "./SearchBar";

export const dynamic = "force-dynamic";

// Cover-band / karaoke / lullaby noise that dominates a plain title search.
// High-precision PHRASES only — bare words like "covers", "plays", "lullaby",
// "tribute", "workout" are real album titles (Cat Power's "Covers", The Cure's
// "Lullaby", "Plays Bach") and must not be swept up here.
const TRIBUTE =
  /\btribute to\b|\ba tribute\b|tribute album|in the style of|(?:as )?made famous by|performed by|\bkaraoke\b|string quartet|renditions? of|lullaby (?:renditions?|versions?)|piano (?:tribute|versions?)|instrumental versions?|8\s?-?\s?bit|kidz ?bop|the hit crew|\bmuzak\b|backing tracks?|\bringtones?\b/i;

/**
 * Album-mode fallback ranking. The query here is a title (we only reach this
 * when it didn't resolve to an artist), so: surface exact/near title matches
 * first, then bury tribute/karaoke noise — but never the album the user
 * literally typed — otherwise keep MusicBrainz's relevance order.
 */
function rerankAlbums(albums: MbAlbum[], query: string): MbAlbum[] {
  const q = normalizeName(query);
  return albums
    .map((a, i) => {
      let score = -i; // base: preserve MusicBrainz relevance order
      const title = normalizeName(a.title);
      const artist = normalizeName(a.artistName);
      const exactTitle = !!q && title === q;
      if (exactTitle) score += 10000;
      else if (q && (title.includes(q) || q.includes(title))) score += 2000;
      if (artist && (artist.includes(q) || q.includes(artist))) score += 1000;
      // Demote noise, but the exact thing they searched is never buried.
      if (!exactTitle && (TRIBUTE.test(a.title) || TRIBUTE.test(a.artistName))) {
        score -= 5000;
      }
      return { a, score };
    })
    .sort((x, y) => y.score - x.score)
    .map((x) => x.a);
}

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

  let landing: Awaited<ReturnType<typeof loadArtistLanding>> = null;
  let albums: MbAlbum[] = [];
  let error: string | null = null;

  if (query) {
    try {
      const settings = await getSettings();
      const [artists, albumResults] = await Promise.all([
        searchArtists(query, 5),
        searchAlbums(query),
      ]);
      // Treat the query as an artist when the top hit's name matches it (exact,
      // normalized) or MusicBrainz is very confident.
      const top = artists[0];
      const strongArtist =
        !!top &&
        (normalizeName(top.name) === normalizeName(query) || top.score >= 90);
      if (strongArtist && top) {
        landing = await loadArtistLanding(top.mbid, settings.lastFmApiKey);
        // A name-only match with nothing to show (no songs, no albums) isn't a
        // useful artist result — drop it and fall back to album search.
        if (
          landing &&
          landing.topTracks.length === 0 &&
          landing.albums.length === 0
        ) {
          landing = null;
        }
      }
      // Artist mode shows the artist's real discography. In album mode (or when
      // a matched artist has no albums) we show the re-ranked title search; we
      // never pin generic title results under an artist banner.
      albums =
        landing && landing.albums.length > 0
          ? landing.albums
          : landing
            ? []
            : rerankAlbums(albumResults, query);
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
      albums.map((a) => a.mbid),
    ),
  ]);

  const noResults = !error && query && !landing && albums.length === 0;

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
          Artists, albums &amp; songs — powered by MusicBrainz.
        </p>
      </header>

      <SearchBar initialQuery={query} />

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {landing && (
        <section className="flex flex-col gap-6">
          <Link
            href={`/artist/${landing.mbid}`}
            className="flex items-center gap-4 rounded-lg border border-border bg-secondary/20 p-4 transition-colors hover:bg-secondary/40"
          >
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-secondary">
              {landing.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={landing.imageUrl}
                  alt=""
                  referrerPolicy="no-referrer"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                  <User className="h-8 w-8" />
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Artist
              </p>
              <p className="truncate text-2xl font-semibold leading-tight">
                {landing.name}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {landing.meta}
              </p>
            </div>
            <span className="ml-auto hidden shrink-0 text-sm text-muted-foreground sm:inline">
              View artist →
            </span>
          </Link>

          {landing.topTracks.length > 0 && (
            <TopTracksList
              artistName={landing.name}
              artistImageUrl={landing.imageUrl}
              topTracks={landing.topTracks}
              heading="Popular songs"
            />
          )}
        </section>
      )}

      {albums.length > 0 && (
        <section>
          {landing && (
            <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Albums
            </h2>
          )}
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {albums.map((album) => (
              <li key={album.mbid}>
                <AlbumCard
                  album={album}
                  libraryHit={library.lookup(album)}
                  liked={likedAlbums.has(album.mbid)}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {noResults && (
        <p className="text-sm text-muted-foreground">
          No results for &ldquo;{query}&rdquo;.
        </p>
      )}

      {!query && recent.length > 0 && <RecentSearches items={recent} />}

      {!query && recent.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Try an artist or album above &mdash; e.g. <em>Bruno Mars</em>.
        </p>
      )}
    </main>
  );
}
