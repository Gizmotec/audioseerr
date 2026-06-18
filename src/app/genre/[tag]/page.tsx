import { ArrowLeft, Music2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DiscoveryTrackList } from "@/components/DiscoveryTrackList";
import {
  type DiscoveryTrack,
  getDeezerChartTracks,
  hasDeezerChartGenre,
} from "@/lib/deezer";
import { getGenreFallbackTracks } from "@/lib/genreFallbackTracks";
import { getSettings, isSetupComplete } from "@/lib/settings";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ tag: string }>;

export default async function GenrePage({ params }: { params: RouteParams }) {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const { tag: rawTag } = await params;
  const tag = decodeURIComponent(rawTag).trim().toLowerCase();

  const settings = await getSettings();
  const lastFmKey = settings.lastFmApiKey;

  // Deezer-mapped genres get a real play-activity track chart (album + preview +
  // downloadable). Unmapped tags (e.g. indie, ambient) fall back to Last.fm
  // tag tracks enriched through Deezer so they're still downloadable.
  let tracks: DiscoveryTrack[] = [];
  if (hasDeezerChartGenre(tag)) {
    tracks = await getDeezerChartTracks(tag, 48).catch(() => []);
  } else {
    tracks = await getGenreFallbackTracks(tag, lastFmKey, 24).catch(() => []);
  }

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/discover"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Discover
      </Link>

      <header className="mt-4 mb-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Genre
        </p>
        <h1 className="text-3xl font-semibold capitalize tracking-tight">
          {tag}
        </h1>
        <p className="text-sm text-muted-foreground">
          Trending songs — preview and add any to your library.
        </p>
      </header>

      {tracks.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Music2 className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" />
          <p>No trending tracks for &ldquo;{tag}&rdquo; right now.</p>
          {!hasDeezerChartGenre(tag) && !lastFmKey && (
            <p className="mt-1">
              Add a Last.fm key in setup to browse niche genres.
            </p>
          )}
        </div>
      ) : (
        <DiscoveryTrackList title="Trending tracks" tracks={tracks} />
      )}
    </main>
  );
}
