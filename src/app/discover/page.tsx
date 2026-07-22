import { ArrowUpRight, Disc3, Library, ListMusic, Music2, Sparkles } from "lucide-react";
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

const GENRE_TILE_TILTS = ["-rotate-2", "rotate-1", "rotate-2", "-rotate-1"];

const CHIP_FILLS = [
  "bg-pastel-mint",
  "bg-pastel-sky",
  "bg-pastel-lavender",
  "bg-pastel-pink",
  "bg-pastel-yellow",
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

function Vinyl({ className }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute ${className ?? ""}`}>
      <div className="relative h-full w-full animate-spin-slow rounded-full border-2 border-ink bg-ink">
        <div className="absolute inset-4 rounded-full border border-white/20" />
        <div className="absolute inset-8 rounded-full border border-white/20" />
        <div className="absolute inset-12 rounded-full border border-white/20" />
        <div className="absolute inset-16 rounded-full border border-white/20" />
        <div className="absolute left-1/2 top-5 h-2 w-2 -translate-x-1/2 rounded-full bg-white/40" />
        <div className="absolute inset-0 m-auto h-16 w-16 rounded-full border-2 border-ink bg-pastel-yellow" />
        <div className="absolute inset-0 m-auto h-2.5 w-2.5 rounded-full bg-ink" />
      </div>
    </div>
  );
}

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
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 overflow-x-clip px-4 py-10 md:px-6">
      <section className="relative overflow-hidden rounded-3xl border-2 border-ink bg-gradient-to-br from-pastel-pink via-pastel-lavender to-pastel-sky p-6 text-ink shadow-[8px_8px_0_0_var(--color-ink)] md:p-10">
        <Vinyl className="-right-20 -top-20 hidden h-64 w-64 md:block lg:h-72 lg:w-72" />
        <Sparkles
          aria-hidden
          className="pointer-events-none absolute bottom-6 right-8 hidden h-8 w-8 animate-wiggle text-ink/50 md:block"
        />
        <Music2
          aria-hidden
          className="pointer-events-none absolute bottom-16 right-24 hidden h-6 w-6 -rotate-12 text-ink/40 md:block"
        />
        <div className="relative z-10 flex flex-col gap-6">
          <div className="flex items-start justify-between gap-4">
            <p className="inline-flex -rotate-2 items-center gap-1.5 rounded-full border-2 border-ink bg-pastel-yellow px-3 py-1 text-xs font-extrabold uppercase tracking-[0.18em] text-ink shadow-[3px_3px_0_0_var(--color-ink)]">
              <Sparkles className="h-3.5 w-3.5" />
              Discover
            </p>
            <Link
              href="/home"
              className="inline-flex h-9 shrink-0 rotate-1 items-center gap-2 rounded-full border-2 border-ink bg-card px-4 text-sm font-bold text-foreground shadow-[3px_3px_0_0_var(--color-ink)] transition-transform hover:rotate-0 hover:-translate-y-0.5"
            >
              <Library className="h-4 w-4" />
              Your music
            </Link>
          </div>
          <div className="max-w-xl space-y-4">
            <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
              Find your next{" "}
              <span className="inline-block -rotate-1 rounded-lg border-2 border-ink bg-ink px-2 text-pastel-yellow">
                obsession
              </span>
              .
            </h1>
            <p className="max-w-md text-sm font-medium leading-6 text-ink/70 md:text-base">
              Preview what&rsquo;s trending, grab a mix made for you, and add
              individual songs straight to your library.
            </p>
          </div>
          <div className="max-w-lg">
            <SearchBar initialQuery="" />
          </div>
        </div>
      </section>

      <div aria-hidden className="relative -mx-4 -rotate-1 md:-mx-6">
        <div className="overflow-hidden border-y-2 border-ink bg-pastel-yellow py-2.5">
          <div className="flex w-max animate-marquee gap-8 pr-8">
            {[...GENRE_CHIPS, ...GENRE_CHIPS].map((g, i) => (
              <span
                key={`${g}-${i}`}
                className="flex items-center gap-8 text-sm font-extrabold uppercase tracking-[0.22em] text-ink"
              >
                {genreLabel(g)}
                <Sparkles className="h-3.5 w-3.5" />
              </span>
            ))}
          </div>
        </div>
      </div>

      <MixCards viewer={viewer} />

      {systemPlaylists.length > 0 && (
        <section className="space-y-4">
          <div className="space-y-1">
            <h2 className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
              <span className="flex h-8 w-8 -rotate-6 items-center justify-center rounded-lg border-2 border-ink bg-pastel-mint text-ink shadow-[2px_2px_0_0_var(--color-ink)]">
                <ListMusic className="h-4 w-4" />
              </span>
              Featured playlists
            </h2>
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

      <section className="space-y-5">
        <h2 className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
          <span className="flex h-8 w-8 rotate-6 items-center justify-center rounded-lg border-2 border-ink bg-pastel-sky text-ink shadow-[2px_2px_0_0_var(--color-ink)]">
            <Disc3 className="h-4 w-4" />
          </span>
          Browse by genre
        </h2>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {genreCards.map(({ slug, coverUrl }, index) => (
            <li key={slug}>
              <Link
                href={`/genre/${encodeURIComponent(slug)}`}
                className={`group flex aspect-square flex-col gap-2 rounded-2xl border-2 border-ink p-3 text-ink shadow-[5px_5px_0_0_var(--color-ink)] transition-all hover:-translate-y-1 hover:rotate-0 hover:shadow-[7px_7px_0_0_var(--color-ink)] ${GENRE_TILE_TILTS[index % GENRE_TILE_TILTS.length]} ${GENRE_TILE_FILLS[index % GENRE_TILE_FILLS.length]}`}
              >
                {coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={coverUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="min-h-0 w-full flex-1 rounded-xl border-2 border-ink object-cover"
                  />
                ) : (
                  <div className="flex min-h-0 flex-1 items-center justify-center rounded-xl border-2 border-ink">
                    <Disc3 className="h-1/3 w-1/3 text-ink/40" />
                  </div>
                )}
                <span className="flex items-center justify-between gap-1 text-base font-extrabold capitalize tracking-tight">
                  {genreLabel(slug)}
                  <ArrowUpRight className="h-4 w-4 shrink-0 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <ul className="flex flex-wrap gap-2.5">
          {GENRE_CHIPS.filter((g) => !MAIN_GENRES.includes(g)).map((g, i) => (
            <li key={g}>
              <Link
                href={`/genre/${encodeURIComponent(g)}`}
                className={`inline-flex rounded-full border-2 border-ink px-3 py-1.5 text-sm font-extrabold capitalize text-ink shadow-[2px_2px_0_0_var(--color-ink)] transition-transform hover:-translate-y-0.5 hover:rotate-0 ${i % 2 === 0 ? "-rotate-1" : "rotate-1"} ${CHIP_FILLS[i % CHIP_FILLS.length]}`}
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
