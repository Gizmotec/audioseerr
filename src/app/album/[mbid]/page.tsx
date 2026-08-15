import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { BackLink } from "@/components/BackLink";
import { buildSevenDigitalUrl } from "@/lib/sevenDigital";
import { prisma } from "@/lib/db";
import { findAlbumPreviews, normalizeTrackTitle } from "@/lib/deezer";
import { buildDownloadedTrackLookup } from "@/lib/downloadedTracks";
import type { LibraryStatus } from "@/lib/library";
import { getLikedSet, isLiked } from "@/lib/likes";
import { getAlbum, type MbTrack } from "@/lib/musicbrainz";
import { listPlaylists } from "@/lib/playlists";
import { isSetupComplete } from "@/lib/settings";
import { AlbumDetail } from "./AlbumDetail";
import type { ExistingRequestStatus } from "./RequestButton";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ mbid: string }>;

export type TrackWithPreview = MbTrack & {
  previewUrl: string | null;
  /** Set when the file is on disk (Lidarr or our own slskd library); takes precedence over previewUrl. */
  streamUrl: string | null;
  /** Lidarr's track file id when the file is in the Lidarr library. */
  trackFileId: number | null;
  /** Our DownloadedTrack id when the single was fetched via slskd. */
  downloadedTrackId: string | null;
};

export default async function AlbumPage({
  params,
}: {
  params: RouteParams;
}) {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }
  const role = (session?.user as { role?: string } | undefined)?.role;
  const isAdmin = role === "ADMIN";
  const viewer = { id: userId, role };

  const { mbid } = await params;
  const album = await getAlbum(mbid);
  if (!album) notFound();

  // If the URL was a release MBID (e.g. from Last.fm tag charts), getAlbum
  // resolves it to the owning release-group. Send the user to the canonical
  // URL so requests/library lookups all key off the same id.
  if (album.mbid !== mbid) {
    redirect(`/album/${album.mbid}`);
  }

  const trackRequestIds = album.tracks.map(
    (t) => t.recordingMbid ?? `${album.mbid}:${t.absolutePosition}`,
  );
  // Recording ids survive the map into `tracks` untouched, so the liked-set
  // lookup can start now rather than waiting for that map.
  const recordingMbids = album.tracks
    .map((t) => t.recordingMbid)
    .filter((id): id is string => id !== null);

  // Everything below depends only on `album`, never on each other. Run them
  // together — served serially this was seven round trips deep, one of them a
  // Deezer call, and it dominated the page's time to first byte.
  const [
    existingRequest,
    existingTrackRequests,
    previews,
    downloadedLookup,
    albumLiked,
    likedTrackSet,
    playlists,
  ] = await Promise.all([
    // Most-recent request by this user for this album, if any. Drives the
    // request button's disabled state.
    prisma.request.findFirst({
      where: { requestedById: userId, type: "ALBUM", mbid: album.mbid },
      orderBy: { requestedAt: "desc" },
      select: { status: true },
    }),
    prisma.request.findMany({
      where: {
        requestedById: userId,
        type: "TRACK",
        mbid: { in: trackRequestIds },
      },
      orderBy: { requestedAt: "desc" },
      select: { mbid: true, status: true },
    }),
    // Previews are nice-to-have; a Deezer miss renders the page without them.
    findAlbumPreviews(album.artistName, album.title).catch(() => null),
    // Which tracks of this album we have on disk, scoped to what the viewer is
    // allowed to stream. This is the single source of playability now that
    // everything is served from our own library.
    buildDownloadedTrackLookup(viewer, album.mbid),
    isLiked(userId, "ALBUM", album.mbid),
    getLikedSet(userId, "TRACK", recordingMbids),
    // Fetched here so the AddToPlaylistButton dropdown opens instantly with
    // the user's current set; new playlists created inline are appended in
    // local state, so a stale list across browser tabs is the only edge case.
    listPlaylists(userId),
  ]);

  const existingStatus = (existingRequest?.status as ExistingRequestStatus) ?? null;
  const existingTrackStatuses: Record<string, ExistingRequestStatus> = {};
  for (const request of existingTrackRequests) {
    existingTrackStatuses[request.mbid] ??= request.status as ExistingRequestStatus;
  }

  // Only treat the album as "in your library" when every track is present —
  // otherwise the album-level Request button stays available so the user can
  // fetch the rest (a single downloaded track shouldn't lock the album).
  const libraryStatus: LibraryStatus | null =
    album.tracks.length > 0 && downloadedLookup.size >= album.tracks.length
      ? "downloaded"
      : null;

  const tracks: TrackWithPreview[] = album.tracks.map((t) => {
    const dz = previews?.trackByTitle[normalizeTrackTitle(t.title)];
    const local = downloadedLookup.get(t.absolutePosition);
    const streamUrl = local ? `/api/stream/local/${local.id}` : null;
    return {
      ...t,
      previewUrl: dz?.previewUrl ?? null,
      streamUrl,
      trackFileId: null,
      downloadedTrackId: local?.id ?? null,
      // MusicBrainz often omits track lengths for newer releases; Deezer's
      // duration is a reasonable fallback when it's available.
      lengthMs: t.lengthMs ?? dz?.durationMs ?? null,
    };
  });

  const sevenDigitalUrl = buildSevenDigitalUrl({
    artistName: album.artistName,
    albumTitle: album.title,
  });

  const coverUrl = previews?.cover ?? album.coverUrl;

  const playlistOptions = playlists.map((p) => ({
    id: p.id,
    name: p.name,
    trackCount: p.trackCount,
  }));

  // In-flight requests are picked up by the app-wide DownloadsProvider, which
  // polls slskd and refreshes this page on completion so each track's local
  // streamUrl (full file) appears without a manual reload.

  return (
    <main className="relative isolate mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-6">
      <BackLink fallbackHref="/home" />

      <AlbumDetail
        album={{
          mbid: album.mbid,
          title: album.title,
          artistName: album.artistName,
          artistMbid: album.artistMbid,
          firstReleaseDate: album.firstReleaseDate,
          primaryType: album.primaryType,
          coverUrl,
        }}
        tracks={tracks}
        existingStatus={existingStatus}
        libraryStatus={libraryStatus}
        albumLiked={albumLiked}
        likedRecordingMbids={Array.from(likedTrackSet)}
        existingTrackStatuses={existingTrackStatuses}
        playlists={playlistOptions}
        sevenDigitalUrl={sevenDigitalUrl}
        canRemoveFromLibrary={isAdmin}
      />
    </main>
  );
}
