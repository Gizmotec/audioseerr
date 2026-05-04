import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPlaylist, resolvePlaylistTrackFiles } from "@/lib/playlists";
import { isSetupComplete } from "@/lib/settings";
import { PlaylistDetail } from "./PlaylistDetail";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ id: string }>;

export default async function PlaylistPage({ params }: { params: RouteParams }) {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }

  const { id } = await params;
  const playlist = await getPlaylist(userId, id);
  if (!playlist) notFound();

  // Resolve every row to a current Lidarr trackFileId once at SSR. The client
  // uses this to render unavailable rows greyed out and to feed the player a
  // queue of correct stream URLs without per-click round-trips.
  const resolved = await resolvePlaylistTrackFiles(playlist.tracks);
  const tracksWithStream = playlist.tracks.map((t) => {
    const fileId = resolved.get(t.id) ?? null;
    return {
      ...t,
      currentTrackFileId: fileId,
      streamUrl: fileId ? `/api/stream/${fileId}` : null,
    };
  });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/playlists"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> All playlists
      </Link>

      <PlaylistDetail
        playlistId={playlist.id}
        initialName={playlist.name}
        description={playlist.description}
        tracks={tracksWithStream}
      />
    </main>
  );
}
