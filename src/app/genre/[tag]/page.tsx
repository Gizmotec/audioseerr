import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  type DiscoveryAlbum,
  DiscoveryAlbumCard,
} from "@/components/DiscoveryAlbumCard";
import { getDeezerChartAlbums, hasDeezerChartGenre } from "@/lib/deezer";
import { getTopAlbumsByTag } from "@/lib/lastfm";
import { buildLibraryIndex } from "@/lib/library";
import { getLikedSet } from "@/lib/likes";
import { getSettings, isSetupComplete } from "@/lib/settings";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ tag: string }>;

export default async function GenrePage({ params }: { params: RouteParams }) {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }

  const { tag: rawTag } = await params;
  const tag = decodeURIComponent(rawTag).trim().toLowerCase();

  const settings = await getSettings();
  const lastFmKey = settings.lastFmApiKey;

  let albums: DiscoveryAlbum[] = [];
  let source: "deezer" | "lastfm" | null = null;
  let error: string | null = null;
  if (hasDeezerChartGenre(tag)) {
    try {
      albums = await getDeezerChartAlbums(tag, 48);
      source = "deezer";
    } catch (err) {
      error = err instanceof Error ? err.message : "Deezer request failed.";
    }
  } else if (lastFmKey) {
    try {
      albums = await getTopAlbumsByTag({ apiKey: lastFmKey }, tag, 48);
      source = "lastfm";
    } catch (err) {
      error = err instanceof Error ? err.message : "Last.fm request failed.";
    }
  } else {
    error = "Last.fm isn't configured — add a key in setup to browse this genre.";
  }

  const subtitle =
    source === "deezer"
      ? "Trending now on Deezer."
      : source === "lastfm"
        ? "Top albums on Last.fm."
        : null;

  const library = await buildLibraryIndex();
  const likedAlbums = await getLikedSet(
    userId,
    "ALBUM",
    albums.map((a) => a.mbid).filter((id): id is string => !!id),
  );

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header className="mt-4 mb-6">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Genre</p>
        <h1 className="text-3xl font-semibold capitalize tracking-tight">{tag}</h1>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </header>

      {error && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {!error && albums.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No albums tagged &ldquo;{tag}&rdquo; right now.
        </p>
      )}

      {albums.length > 0 && (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {albums.map((a, i) => (
            <li key={`${a.mbid ?? i}-${a.title}`}>
              <DiscoveryAlbumCard
                album={a}
                libraryHit={library.lookup(a)}
                liked={a.mbid ? likedAlbums.has(a.mbid) : false}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
