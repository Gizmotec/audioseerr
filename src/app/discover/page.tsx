import { Disc3, Library, Search } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MostLovedChart, TopArtistsChart } from "@/components/ChartList";
import { DiscoveryTrackList } from "@/components/DiscoveryTrackList";
import { MixCards } from "@/app/discover/MixCards";
import { enrichArtistArtwork } from "@/lib/chartArtwork";
import {
  genreCoverUrl,
  genreLabel,
  getDeezerChartTracks,
  getDeezerNewReleaseTracks,
} from "@/lib/deezer";
import { getGlobalTopArtists } from "@/lib/lastfm";
import { getMostLoved } from "@/lib/mostLoved";
import { listSystemPlaylists } from "@/lib/playlists";
import { getSettings, isSetupComplete } from "@/lib/settings";
import { PlaylistTile } from "@/app/playlists/PlaylistTile";
import { SearchBar } from "@/app/search/SearchBar";

export const dynamic = "force-dynamic";

const DISCOVER_TAGS = ["pop", "rock", "electronic"];

// Cyclic pastel fills for the "Browse by genre" feature tiles.
const GENRE_TILE_FILLS = [
  "bg-pastel-pink",
  "bg-pastel-yellow",
  "bg-pastel-mint",
  "bg-pastel-sky",
  "bg-pastel-lavender",
];

// Shown as album-art cards atop "Browse by genre"; everything else in
// GENRE_CHIPS renders as a tag chip below.
const MAIN_GENRES = ["pop", "rock", "hip-hop", "electronic", "dance", "rnb"];

// Deezer-charted genres (real track charts, no Last.fm key needed) plus a few
// popular tags that fall back to Last.fm. The /genre/[tag] page handles both.
const GENRE_CHIPS = [
  "pop",
  "rock",
  "hip-hop",
  "electronic",
  "dance",
  "rnb",
  "alternative",
  "indie",
  "jazz",
  "classical",
  "metal",
  "folk",
  "soul",
  "reggae",
  "country",
  "blues",
  "latin",
  "soundtrack",
  "ambient",
  "punk",
];

export default async function DiscoverPage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  const viewer = {
    id: session.user.id,
    role: (session.user as { role?: string }).role,
  };

  const settings = await getSettings();
  const lastFmKey = settings.lastFmApiKey;

  const [
    trendingNow,
    freshTracks,
    genreRows,
    topArtists,
    mostLoved,
    systemPlaylists,
  ] = await Promise.all([
      getDeezerChartTracks(null, 12).catch(() => []),
      getDeezerNewReleaseTracks(12).catch(() => []),
      Promise.all(
        DISCOVER_TAGS.map(async (tag) => ({
          tag,
          tracks: await getDeezerChartTracks(tag, 12).catch(() => []),
        })),
      ),
      lastFmKey
        ? getGlobalTopArtists({ apiKey: lastFmKey }, 12)
            .then(enrichArtistArtwork)
            .catch(() => [])
        : Promise.resolve([]),
      getMostLoved(10),
      listSystemPlaylists().catch(() => []),
    ]);
  const genreTrackRows = genreRows.filter((r) => r.tracks.length > 0);
  const genreCards = MAIN_GENRES.map((slug) => ({
    slug,
    coverUrl: genreCoverUrl(slug),
  }));

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-10 md:px-6">
      <header className="flex flex-col gap-5 border-b border-foreground/10 pb-8 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl space-y-2">
          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            <Search className="h-3.5 w-3.5" />
            Discover
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            Find what belongs in your library next.
          </h1>
          <p className="text-sm leading-6 text-muted-foreground md:text-base">
            Preview what&rsquo;s trending and add individual songs straight to
            your library.
          </p>
        </div>
        <Link
          href="/home"
          className="inline-flex h-9 items-center gap-2 rounded-full bg-card px-4 text-sm font-bold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
        >
          <Library className="h-4 w-4" />
          Your music
        </Link>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-extrabold tracking-tight">Search</h2>
        <SearchBar initialQuery="" />
      </section>

      <MixCards viewer={viewer} />

      {systemPlaylists.length > 0 && (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">Featured playlists</h2>
            <p className="text-sm text-muted-foreground">
              Mood and genre playlists that refresh weekly. Subscribe to one to
              auto-download its picks.
            </p>
          </div>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {systemPlaylists.map((p) => (
              <li key={p.id}>
                <PlaylistTile playlist={p} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <DiscoveryTrackList
        title="Trending now"
        tracks={trendingNow}
        href="/discover/trending"
      />

      <DiscoveryTrackList title="Fresh tracks" tracks={freshTracks} />

      {genreTrackRows.map((r) => (
        <DiscoveryTrackList
          key={r.tag}
          title={`Trending in ${r.tag}`}
          tracks={r.tracks}
          href={`/genre/${encodeURIComponent(r.tag)}`}
        />
      ))}

      <TopArtistsChart artists={topArtists} />

      <MostLovedChart items={mostLoved} />

      <section className="space-y-4">
        <h2 className="text-lg font-extrabold tracking-tight">Browse by genre</h2>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {genreCards.map(({ slug, coverUrl }, index) => (
            <li key={slug}>
              <Link
                href={`/genre/${encodeURIComponent(slug)}`}
                className={`group flex aspect-square flex-col gap-2 rounded-2xl p-3 text-ink transition-[filter] hover:brightness-95 ${GENRE_TILE_FILLS[index % GENRE_TILE_FILLS.length]}`}
              >
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="min-h-0 w-full flex-1 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl">
                    <Disc3 className="h-1/3 w-1/3 text-ink/40" />
                  </div>
                )}
                <span className="text-base font-extrabold capitalize tracking-tight">
                  {genreLabel(slug)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <ul className="flex flex-wrap gap-2">
          {GENRE_CHIPS.filter((g) => !MAIN_GENRES.includes(g)).map((g) => (
            <li key={g}>
              <Link
                href={`/genre/${encodeURIComponent(g)}`}
                className="inline-flex rounded-full border-2 border-transparent bg-surface-2 px-3 py-1.5 text-sm font-bold capitalize text-muted-foreground transition-colors hover:text-foreground"
              >
                {genreLabel(g)}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
