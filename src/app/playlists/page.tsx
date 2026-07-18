import { ArrowLeft, Download, ListMusic } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  listPlaylists,
  listSharedPlaylists,
  listSystemPlaylists,
} from "@/lib/playlists";
import { isSetupComplete } from "@/lib/settings";
import { CreatePlaylistInline } from "./CreatePlaylistInline";
import { PlaylistTile } from "./PlaylistTile";

export const dynamic = "force-dynamic";

export default async function PlaylistsPage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }

  const [playlists, sharedPlaylists, systemPlaylists] = await Promise.all([
    listPlaylists(userId),
    listSharedPlaylists(userId),
    listSystemPlaylists(),
  ]);

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header className="mt-4 mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Playlists</h1>
          <p className="text-sm text-muted-foreground">
            Hand-picked tracks from albums in your Lidarr library.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/import/spotify"
            className="inline-flex h-9 items-center gap-1.5 rounded-full bg-card px-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
          >
            <Download className="h-4 w-4" /> Import from Spotify
          </Link>
          <CreatePlaylistInline />
        </div>
      </header>

      {systemPlaylists.length > 0 && (
        <section className="mb-12 space-y-3">
          <header>
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Featured
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Editorial playlists that refresh weekly. Subscribe to one to have
              its picks auto-downloaded each week.
            </p>
          </header>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {systemPlaylists.map((p) => (
              <li key={p.id}>
                <PlaylistTile playlist={p} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {playlists.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-foreground/15 bg-card p-8 text-center text-sm text-muted-foreground">
          <ListMusic className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" />
          <p>No playlists yet.</p>
          <p className="mt-1">
            Create one above, or add tracks from any album you have in Lidarr.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {playlists.map((p) => (
            <li key={p.id}>
              <PlaylistTile playlist={p} />
            </li>
          ))}
        </ul>
      )}

      {sharedPlaylists.length > 0 && (
        <section className="mt-12 space-y-3">
          <header>
            <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              Shared with you
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Read-only — tracks you don&apos;t have in your library are listed
              but won&apos;t play.
            </p>
          </header>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {sharedPlaylists.map((p) => (
              <li key={p.id}>
                <PlaylistTile playlist={p} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
