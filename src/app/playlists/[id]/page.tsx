import { Disc3, User } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AmbientArtworkBackground } from "@/components/AmbientArtworkBackground";
import { BackLink } from "@/components/BackLink";
import { getDownloadedTracksByRecording } from "@/lib/downloadedTracks";
import {
  getAllLikes,
  getLikedSongsPlaylist,
  LIKED_SONGS_PLAYLIST_ID,
  type LikedRow,
} from "@/lib/likes";
import {
  getPlaylist,
  resolvePlaylistTrackFiles,
} from "@/lib/playlists";
import { isSetupComplete } from "@/lib/settings";
import { getActiveTrackRequestKeys } from "@/lib/trackRequests";
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
  const role = (session.user as { role?: string }).role;
  const viewer = { id: userId, role };

  const { id } = await params;
  const allLikes =
    id === LIKED_SONGS_PLAYLIST_ID ? await getAllLikes(userId) : null;
  const likedAlbums =
    allLikes?.filter((like) => like.targetType === "ALBUM") ?? [];
  const likedArtists =
    allLikes?.filter((like) => like.targetType === "ARTIST") ?? [];
  const hasLikedCollections = likedAlbums.length > 0 || likedArtists.length > 0;
  const playlist =
    id === LIKED_SONGS_PLAYLIST_ID
      ? await getLikedSongsPlaylist(userId)
      : await getPlaylist(userId, id);
  if (!playlist) notFound();

  // Resolve every row to a current Lidarr trackFileId once at SSR. Pass the
  // viewer so a shared playlist played by a non-owner only resolves rows
  // covered by their UserLibraryItem; other rows get null and render
  // unplayable. The client also renders that as "unavailable."
  const resolved = await resolvePlaylistTrackFiles(playlist.tracks, viewer);

  // Beyond Lidarr: tracks we fetched via slskd are streamable from our own
  // library, and tracks still downloading are badged "fetching" rather than
  // "unavailable".
  const recordingMbids = playlist.tracks
    .map((t) => t.recordingMbid)
    .filter((id): id is string => !!id);
  const [localByRecording, fetchingKeys] = await Promise.all([
    getDownloadedTracksByRecording(viewer, recordingMbids),
    getActiveTrackRequestKeys(userId, recordingMbids),
  ]);

  const tracksWithStream = playlist.tracks.map((t) => {
    const fileId = resolved.get(t.id) ?? null;
    const localId = t.recordingMbid
      ? (localByRecording.get(t.recordingMbid) ?? null)
      : null;
    const streamUrl = fileId
      ? `/api/stream/${fileId}`
      : localId
        ? `/api/stream/local/${localId}`
        : null;
    return {
      ...t,
      currentTrackFileId: fileId,
      streamUrl,
      fetching: !streamUrl && fetchingKeys.has(t.recordingMbid),
    };
  });
  const ambientCoverUrl =
    playlist.coverUrl ?? playlist.tracks.find((t) => t.coverUrl)?.coverUrl;

  return (
    <main className="relative isolate mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
      <AmbientArtworkBackground imageUrl={ambientCoverUrl} />

      <BackLink fallbackHref="/playlists" />

      <PlaylistDetail
        playlistId={playlist.id}
        initialName={playlist.name}
        description={playlist.description}
        coverUrl={playlist.coverUrl}
        tracks={tracksWithStream}
        readOnly={playlist.system === "liked-songs" || !playlist.isOwner}
        showEmptyState={!hasLikedCollections}
        ownerUsername={playlist.ownerUsername}
        canManageSharing={playlist.isOwner && playlist.system !== "liked-songs"}
        initialShared={playlist.isShared}
      />

      {likedAlbums.length > 0 && (
        <section className="mt-12 space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Liked albums{" "}
            <span className="text-muted-foreground/60">({likedAlbums.length})</span>
          </h2>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {likedAlbums.map((row) => (
              <li key={row.id}>
                <LikedAlbumTile row={row} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {likedArtists.length > 0 && (
        <section className="mt-12 space-y-3">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
            Liked artists{" "}
            <span className="text-muted-foreground/60">({likedArtists.length})</span>
          </h2>
          <ul className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
            {likedArtists.map((row) => (
              <li key={row.id}>
                <LikedArtistTile row={row} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function LikedAlbumTile({ row }: { row: LikedRow }) {
  return (
    <Link
      href={`/album/${row.targetId}`}
      className="group flex flex-col gap-2 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-square overflow-hidden rounded-md bg-secondary">
        {row.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.coverUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <Disc3 className="h-1/3 w-1/3" />
          </div>
        )}
      </div>
      <div className="space-y-0.5">
        <p className="truncate text-sm font-medium leading-snug" title={row.title}>
          {row.title}
        </p>
        {row.artistName && (
          <p
            className="truncate text-xs text-muted-foreground"
            title={row.artistName}
          >
            {row.artistName}
          </p>
        )}
      </div>
    </Link>
  );
}

function LikedArtistTile({ row }: { row: LikedRow }) {
  return (
    <Link
      href={`/artist/${row.targetId}`}
      className="group flex flex-col items-center gap-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-square w-full overflow-hidden rounded-full bg-secondary">
        {row.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.coverUrl}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
            <User className="h-1/3 w-1/3" />
          </div>
        )}
      </div>
      <p className="w-full truncate text-center text-xs" title={row.title}>
        {row.title}
      </p>
    </Link>
  );
}
