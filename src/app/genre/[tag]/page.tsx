import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DiscoveryAlbumCard } from "@/components/DiscoveryAlbumCard";
import { getTopAlbumsByTag } from "@/lib/lastfm";
import { buildLibraryIndex } from "@/lib/library";
import { getSettings, isSetupComplete } from "@/lib/settings";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ tag: string }>;

export default async function GenrePage({ params }: { params: RouteParams }) {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { tag: rawTag } = await params;
  const tag = decodeURIComponent(rawTag).trim().toLowerCase();

  const settings = await getSettings();
  const lastFmKey = settings.lastFmApiKey;

  let albums: Awaited<ReturnType<typeof getTopAlbumsByTag>> = [];
  let error: string | null = null;
  if (!lastFmKey) {
    error = "Last.fm isn't configured — add a key in setup to browse genres.";
  } else {
    try {
      albums = await getTopAlbumsByTag({ apiKey: lastFmKey }, tag, 48);
    } catch (err) {
      error = err instanceof Error ? err.message : "Last.fm request failed.";
    }
  }

  const library = await buildLibraryIndex();

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
        <p className="text-sm text-muted-foreground">Top albums on Last.fm.</p>
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
              <DiscoveryAlbumCard album={a} libraryStatus={library.lookup(a)} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
