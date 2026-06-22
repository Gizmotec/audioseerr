import { ArrowLeft, Music2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DiscoveryTrackList } from "@/components/DiscoveryTrackList";
import { getDeezerChartTracks } from "@/lib/deezer";
import { isSetupComplete } from "@/lib/settings";

export const dynamic = "force-dynamic";

// "See more" target for the Discover "Trending now" shelf: the global Deezer
// chart (genre id 0), 48 songs instead of the shelf's 12.
export default async function TrendingPage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const tracks = await getDeezerChartTracks(null, 48).catch(() => []);

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
          Charts
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Trending now</h1>
        <p className="text-sm text-muted-foreground">
          The most-played songs right now — preview and add any to your library.
        </p>
      </header>

      {tracks.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Music2 className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" />
          <p>No trending tracks right now.</p>
        </div>
      ) : (
        <DiscoveryTrackList title="Trending tracks" tracks={tracks} layout="grid" />
      )}
    </main>
  );
}
