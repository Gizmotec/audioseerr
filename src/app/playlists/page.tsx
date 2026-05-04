import { ArrowLeft, ListMusic } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getLikedSongsPlaylistSummary } from "@/lib/likes";
import { listPlaylists } from "@/lib/playlists";
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

  const [likedSongs, playlists] = await Promise.all([
    getLikedSongsPlaylistSummary(userId),
    listPlaylists(userId),
  ]);
  const allPlaylists = [likedSongs, ...playlists];

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
          <h1 className="text-3xl font-semibold tracking-tight">Playlists</h1>
          <p className="text-sm text-muted-foreground">
            Hand-picked tracks from albums in your Lidarr library.
          </p>
        </div>
        <CreatePlaylistInline />
      </header>

      {allPlaylists.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          <ListMusic className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" />
          <p>No playlists yet.</p>
          <p className="mt-1">
            Create one above, or add tracks from any album you have in Lidarr.
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {allPlaylists.map((p) => (
            <li key={p.id}>
              <PlaylistTile playlist={p} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
