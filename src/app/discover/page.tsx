import { Library, Search, Sparkles } from "lucide-react";
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
import { prisma } from "@/lib/db";
import { buildLibraryIndex } from "@/lib/library";
import { getMostLoved } from "@/lib/mostLoved";
import {
  blendRecommendedForYou,
  getMoreFromLibraryArtists,
  getNewReleasesFromLibraryArtists,
  getSimilarAlbumsForLikedArtists,
  type PersonalizedAlbum,
} from "@/lib/personalized";
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
  const lastFmConfig = lastFmKey ? { apiKey: lastFmKey } : null;
  const lidarrConfig =
    settings.lidarrUrl && settings.lidarrApiKey
      ? { url: settings.lidarrUrl, apiKey: settings.lidarrApiKey }
      : null;

  const userId = session.user.id;
  const userPrefs = await prisma.user.findUnique({
    where: { id: userId },
    select: { personalizedSuggestionsEnabled: true },
  });
  const personalizationOn = userPrefs?.personalizedSuggestionsEnabled ?? true;

  // Library index is needed by both global rows (to badge "in library") and
  // by the personalized generators (to filter out albums the user has).
  const library = await buildLibraryIndex();

  const [settled, newReleases, topTracks, topArtists, mostLoved, personalized] =
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
      personalizationOn
        ? loadPersonalizedSections(userId, lastFmConfig, lidarrConfig, library)
        : Promise.resolve(null),
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

      {personalized && hasAnyPersonalizedRow(personalized) && (
        <section className="space-y-6">
          <header className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
              For you
            </p>
          </header>
          {personalized.recommended.length > 0 && (
            <DiscoveryRow
              title="Recommended for you"
              albums={personalized.recommended}
              library={library}
            />
          )}
          {personalized.similar.albums.length > 0 && (
            <DiscoveryRow
              title={`Because you liked ${personalized.similar.seedArtistName}`}
              albums={personalized.similar.albums}
              library={library}
            />
          )}
          {personalized.more.length > 0 && (
            <DiscoveryRow
              title="More from artists in your library"
              albums={personalized.more}
              library={library}
            />
          )}
          {personalized.newReleases.length > 0 && (
            <DiscoveryRow
              title="New releases from your library artists"
              albums={personalized.newReleases}
              library={library}
            />
          )}
        </section>
      )}

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

type PersonalizedSections = {
  similar: { seedArtistName: string | null; albums: PersonalizedAlbum[] };
  more: PersonalizedAlbum[];
  newReleases: PersonalizedAlbum[];
  recommended: PersonalizedAlbum[];
};

async function loadPersonalizedSections(
  userId: string,
  lastFm: { apiKey: string } | null,
  lidarr: { url: string; apiKey: string } | null,
  library: Awaited<ReturnType<typeof buildLibraryIndex>>,
): Promise<PersonalizedSections> {
  const [similar, more, newReleases] = await Promise.all([
    getSimilarAlbumsForLikedArtists(userId, lastFm, library),
    getMoreFromLibraryArtists(userId, lidarr, library),
    getNewReleasesFromLibraryArtists(userId, lidarr, library),
  ]);
  const recommended = blendRecommendedForYou({
    similar: similar.albums,
    more,
    newReleases,
  });
  return { similar, more, newReleases, recommended };
}

function hasAnyPersonalizedRow(p: PersonalizedSections): boolean {
  return (
    p.recommended.length > 0 ||
    p.similar.albums.length > 0 ||
    p.more.length > 0 ||
    p.newReleases.length > 0
  );
}
