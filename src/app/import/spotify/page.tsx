import { ArrowLeft, ListMusic } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isSetupComplete } from "@/lib/settings";
import { getSpotifyConnection } from "@/lib/spotify";
import { listMyPlaylists } from "@/lib/spotify-api";

export const dynamic = "force-dynamic";

export default async function SpotifyImportPage() {
  if (!(await isSetupComplete())) redirect("/setup");
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const conn = await getSpotifyConnection(session.user.id);
  if (!conn) redirect("/account?reason=connect_spotify");

  let playlists: Awaited<ReturnType<typeof listMyPlaylists>> = [];
  let error: string | null = null;
  try {
    playlists = await listMyPlaylists(session.user.id);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to fetch playlists.";
  }

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header className="mt-4 mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Import from Spotify
          </h1>
          <p className="text-sm text-muted-foreground">
            Pick a playlist to preview matches against your library before
            requesting.
          </p>
        </div>
        <Link
          href="/account"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          Manage connection
        </Link>
      </header>

      {error && (
        <Card className="mb-6 border-destructive/40">
          <CardHeader>
            <CardTitle className="text-destructive">
              Couldn't load playlists
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Link
              href="/account"
              className={buttonVariants({ variant: "outline" })}
            >
              Reconnect Spotify
            </Link>
          </CardContent>
        </Card>
      )}

      {!error && playlists.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No playlists found on your Spotify account.
        </p>
      )}

      {playlists.length > 0 && (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {playlists.map((p) => (
            <li key={p.id}>
              <Link
                href={`/import/spotify/${p.id}`}
                className="group flex items-center gap-3 rounded-lg border border-border bg-card/50 p-3 transition-colors hover:border-input hover:bg-card"
              >
                <PlaylistCover url={p.coverUrl} />
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-sm font-medium leading-snug"
                    title={p.name}
                  >
                    {p.name}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.trackCount} {p.trackCount === 1 ? "track" : "tracks"}
                    {!p.ownedByUser && ` · by ${p.ownerName}`}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function PlaylistCover({ url }: { url: string | null }) {
  return (
    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md bg-secondary">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
          <ListMusic className="h-5 w-5" />
        </div>
      )}
    </div>
  );
}
