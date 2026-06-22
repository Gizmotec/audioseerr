import { Disc3, ListMusic, User } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AmbientArtworkBackground } from "@/components/AmbientArtworkBackground";
import { BackLink } from "@/components/BackLink";
import { trackMatchKey } from "@/lib/deezer";
import {
  buildOwnedTrackLookup,
  buildPlaylistStreamLookup,
} from "@/lib/downloadedTracks";
import {
  getAllLikes,
  getLikedSet,
  getLikedSongsPlaylist,
  LIKED_SONGS_PLAYLIST_ID,
  type LikedRow,
  trackLikeTargetId,
} from "@/lib/likes";
import type { MixTrack } from "@/lib/mixes";
import {
  getPlaylist,
  getSystemPlaylistDetail,
  isSubscribedToPlaylist,
  type SystemPlaylistDetail,
} from "@/lib/playlists";
import { isSetupComplete } from "@/lib/settings";
import { getActiveTrackRequestKeys } from "@/lib/trackRequests";
import { MixDetail } from "@/app/mix/[kind]/MixDetail";
import { PlaylistDetail } from "./PlaylistDetail";
import { SubscribeButton } from "./SubscribeButton";

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

  // System (editorial) playlist → render like a mix: full streams for tracks the
  // viewer owns, 30s previews + a download button for the rest, plus Subscribe.
  const systemPlaylist = await getSystemPlaylistDetail(id);
  if (systemPlaylist) {
    return (
      <SystemPlaylistPage
        playlist={systemPlaylist}
        viewer={viewer}
        userId={userId}
      />
    );
  }

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
  // Streamability is resolved entirely from our own library now, joined by
  // (albumMbid, position) so migrated tracks (no recordingMbid) resolve too.
  // Tracks still downloading are badged "fetching" rather than "unavailable".
  const recordingMbids = playlist.tracks
    .map((t) => t.recordingMbid)
    .filter((id): id is string => !!id);
  const [localByKey, fetchingKeys] = await Promise.all([
    buildPlaylistStreamLookup(
      viewer,
      playlist.tracks.map((t) => t.albumMbid),
    ),
    getActiveTrackRequestKeys(userId, recordingMbids),
  ]);

  const tracksWithStream = playlist.tracks.map((t) => {
    const localId = localByKey.get(`${t.albumMbid}:${t.albumPosition}`) ?? null;
    const streamUrl = localId ? `/api/stream/local/${localId}` : null;
    return {
      ...t,
      currentTrackFileId: null,
      streamUrl,
      fetching: !streamUrl && fetchingKeys.has(t.recordingMbid),
    };
  });
  const likeTargetIds = playlist.tracks
    .map((t) => trackLikeTargetId(t.recordingMbid, t.albumMbid, t.albumPosition))
    .filter((x): x is string => !!x);
  const likedTrackIds = [
    ...(await getLikedSet(userId, "TRACK", likeTargetIds)),
  ];

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
        likedTrackIds={likedTrackIds}
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

async function SystemPlaylistPage({
  playlist,
  viewer,
  userId,
}: {
  playlist: SystemPlaylistDetail;
  viewer: { id: string; role?: string };
  userId: string;
}) {
  const owned = await buildOwnedTrackLookup(viewer);
  const tracks: MixTrack[] = playlist.tracks.map((t) => {
    const m = owned.get(trackMatchKey(t.artistName, t.title));
    if (m) {
      return {
        kind: "library",
        title: t.title,
        artistName: t.artistName,
        albumTitle: t.albumTitle,
        coverUrl: t.coverUrl,
        durationMs: t.durationMs,
        downloadedTrackId: m.downloadedTrackId,
        recordingMbid: m.recordingMbid,
        albumMbid: m.albumMbid,
        albumPosition: m.albumPosition,
      };
    }
    return {
      kind: "new",
      title: t.title,
      artistName: t.artistName,
      albumTitle: t.albumTitle,
      coverUrl: t.coverUrl,
      durationMs: t.durationMs,
      previewUrl: t.previewUrl,
    };
  });

  // Only owned (library) tracks have stable ids to match a like against.
  const likeTargetIds = tracks
    .flatMap((t) =>
      t.kind === "library"
        ? [trackLikeTargetId(t.recordingMbid, t.albumMbid, t.albumPosition)]
        : [],
    )
    .filter((x): x is string => !!x);
  const likedTrackIds = [...(await getLikedSet(userId, "TRACK", likeTargetIds))];
  const subscribed = await isSubscribedToPlaylist(userId, playlist.id);

  const gridCovers = playlist.tracks
    .map((t) => t.coverUrl)
    .filter((x): x is string => !!x)
    .slice(0, 4);
  const ambientCover = playlist.coverUrl ?? gridCovers[0];

  return (
    <main className="relative isolate mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
      <AmbientArtworkBackground imageUrl={ambientCover} />
      <BackLink fallbackHref="/playlists" />

      <header className="mt-6 flex flex-col gap-5 border-b border-border pb-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-end gap-5">
          <div className="relative h-36 w-36 shrink-0 overflow-hidden rounded-lg bg-secondary shadow-sm">
            {playlist.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={playlist.coverUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : gridCovers.length >= 4 ? (
              <div className="grid h-full w-full grid-cols-2 grid-rows-2">
                {gridCovers.map((url, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${url}-${i}`}
                    src={url}
                    alt=""
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ))}
              </div>
            ) : gridCovers.length > 0 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={gridCovers[0]}
                alt=""
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                <ListMusic className="h-1/3 w-1/3" />
              </div>
            )}
          </div>
          <div className="min-w-0 space-y-1.5">
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Featured playlist
            </p>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              {playlist.name}
            </h1>
            {playlist.description && (
              <p className="text-sm text-muted-foreground">
                {playlist.description}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {playlist.tracks.length} tracks · Refreshes weekly
            </p>
          </div>
        </div>
        <SubscribeButton playlistId={playlist.id} initialSubscribed={subscribed} />
      </header>

      <section className="mt-8">
        {tracks.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            <ListMusic className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" />
            <p>This playlist is filling up — check back shortly.</p>
          </div>
        ) : (
          <MixDetail tracks={tracks} likedTrackIds={likedTrackIds} />
        )}
      </section>
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
