import { Library, Search } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  MostLovedChart,
  TopArtistsChart,
  TopTracksChart,
} from "@/components/ChartList";
import { DiscoveryRow } from "@/components/DiscoveryRow";
import { enrichArtistArtwork, enrichTrackArtwork } from "@/lib/chartArtwork";
import { buildLibraryIndex } from "@/lib/library";
import { getMostLoved } from "@/lib/mostLoved";
import { getSettings, isSetupComplete } from "@/lib/settings";
import { getDeezerChartAlbums, getDeezerNewReleaseAlbums } from "@/lib/deezer";
import { getGlobalTopArtists, getGlobalTopTracks } from "@/lib/lastfm";
import { SearchBar } from "@/app/search/SearchBar";

export const dynamic = "force-dynamic";

const DISCOVER_TAGS = ["pop", "rock", "electronic"];
const GENRE_CHIPS = [
  "rock",
  "pop",
  "indie",
  "electronic",
  "hip-hop",
  "alternative",
  "jazz",
  "classical",
  "metal",
  "folk",
  "ambient",
  "soul",
];

export default async function DiscoverPage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const settings = await getSettings();
  const lastFmKey = settings.lastFmApiKey;

  const [settled, newReleases, topTracks, topArtists, mostLoved, library] =
    await Promise.all([
      Promise.all(
        DISCOVER_TAGS.map(async (tag) => {
          try {
            return { tag, albums: await getDeezerChartAlbums(tag, 12) };
          } catch {
            return { tag, albums: [] };
          }
        }),
      ),
      getDeezerNewReleaseAlbums(12).catch(() => []),
      lastFmKey
        ? getGlobalTopTracks({ apiKey: lastFmKey }, 10)
            .then(enrichTrackArtwork)
            .catch(() => [])
        : Promise.resolve([]),
      lastFmKey
        ? getGlobalTopArtists({ apiKey: lastFmKey }, 12)
            .then(enrichArtistArtwork)
            .catch(() => [])
        : Promise.resolve([]),
      getMostLoved(10),
      buildLibraryIndex(),
    ]);
  const rows = settled.filter((r) => r.albums.length > 0);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-10 md:px-6">
      <header className="flex flex-col gap-5 border-b border-border pb-8 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl space-y-2">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <Search className="h-3.5 w-3.5" />
            Discover
          </p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            Find what belongs in your library next.
          </h1>
          <p className="text-sm leading-6 text-muted-foreground md:text-base">
            Search albums, scan new releases, and follow what other listeners
            are playing before sending it to Lidarr.
          </p>
        </div>
        <Link
          href="/home"
          className="inline-flex h-9 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
        >
          <Library className="h-4 w-4" />
          Your music
        </Link>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Find an album</h2>
        <SearchBar initialQuery="" />
      </section>

      <DiscoveryRow
        title="Top new releases"
        albums={newReleases}
        library={library}
      />

      <TopTracksChart tracks={topTracks} />

      <TopArtistsChart artists={topArtists} />

      <MostLovedChart items={mostLoved} />

      {rows.map((r) => (
        <DiscoveryRow
          key={r.tag}
          title={`Trending in ${r.tag}`}
          href={`/genre/${encodeURIComponent(r.tag)}`}
          albums={r.albums}
          library={library}
        />
      ))}

      <section className="space-y-3">
        <h2 className="text-lg font-medium">Browse by genre</h2>
        <ul className="flex flex-wrap gap-2">
          {GENRE_CHIPS.map((g) => (
            <li key={g}>
              <Link
                href={`/genre/${encodeURIComponent(g)}`}
                className="inline-flex rounded-full border border-border bg-secondary/40 px-3 py-1 text-sm capitalize hover:border-foreground hover:bg-secondary"
              >
                {g}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
