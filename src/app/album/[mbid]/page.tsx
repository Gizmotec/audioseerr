import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AmbientArtworkBackground } from "@/components/AmbientArtworkBackground";
import { BackLink } from "@/components/BackLink";
import { resolveAppleMusicUrl } from "@/lib/appleMusic";
import { prisma } from "@/lib/db";
import { findAlbumPreviews, normalizeTrackTitle } from "@/lib/deezer";
import { getLibraryHit, getLibraryHitByName } from "@/lib/library";
import { getLikedSet, isLiked } from "@/lib/likes";
import { getAlbum, type MbTrack } from "@/lib/musicbrainz";
import { buildTrackFileLookup, type TrackFileLookup } from "@/lib/playback";
import { listPlaylists } from "@/lib/playlists";
import { getSettings, isSetupComplete } from "@/lib/settings";
import { AlbumDetail } from "./AlbumDetail";
import type { ExistingRequestStatus } from "./RequestButton";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ mbid: string }>;

export type TrackWithPreview = MbTrack & {
  previewUrl: string | null;
  /** Set when Lidarr has the file on disk; takes precedence over previewUrl for playback. */
  streamUrl: string | null;
  /** Lidarr's track file id when the file is on disk; needed to add the track to a playlist. */
  trackFileId: number | null;
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

  // Most-recent request by this user for this album, if any. Drives the
  // request button's disabled state.
  const existingRequest = await prisma.request.findFirst({
    where: { requestedById: userId, type: "ALBUM", mbid: album.mbid },
    orderBy: { requestedAt: "desc" },
    select: { status: true },
  });
  const existingStatus = (existingRequest?.status as ExistingRequestStatus) ?? null;

  const trackRequestIds = album.tracks.map(
    (t) => t.recordingMbid ?? `${album.mbid}:${t.absolutePosition}`,
  );
  const existingTrackRequests = await prisma.request.findMany({
    where: {
      requestedById: userId,
      type: "TRACK",
      mbid: { in: trackRequestIds },
    },
    orderBy: { requestedAt: "desc" },
    select: { mbid: true, status: true },
  });
  const existingTrackStatuses: Record<string, ExistingRequestStatus> = {};
  for (const request of existingTrackRequests) {
    existingTrackStatuses[request.mbid] ??= request.status as ExistingRequestStatus;
  }

  // Whether the viewer's slice of the library covers this album. Admin sees
  // everything; regular users only see albums in their UserLibraryItem rows.
  // MBID first, then artist+title fallback because release-group MBIDs
  // diverge across MB / Last.fm / Lidarr for the same nominal album.
  const libraryHit =
    (await getLibraryHit(album.mbid, viewer)) ??
    (await getLibraryHitByName(album.artistName, album.title, viewer));
  const libraryStatus = libraryHit?.status ?? null;

  // Deezer match runs in parallel-ish (MB call already happened), best-effort.
  let previews: Awaited<ReturnType<typeof findAlbumPreviews>> = null;
  try {
    previews = await findAlbumPreviews(album.artistName, album.title);
  } catch {
    // Previews are nice-to-have; swallow and render the page without them.
  }

  // If the album is in our Lidarr library and downloaded, fetch the
  // position→trackFileId map so the UI can stream full audio. Best-effort —
  // Lidarr may be temporarily unreachable; the page still renders.
  let trackFileLookup: TrackFileLookup | null = null;
  if (libraryHit?.status === "downloaded") {
    try {
      const settings = await getSettings();
      if (settings.lidarrUrl && settings.lidarrApiKey) {
        trackFileLookup = await buildTrackFileLookup(
          { url: settings.lidarrUrl, apiKey: settings.lidarrApiKey },
          libraryHit.lidarrId,
        );
      }
    } catch {
      // Fall through with null — UI will use Deezer previews instead.
    }
  }

  const tracks: TrackWithPreview[] = album.tracks.map((t) => {
    const dz = previews?.trackByTitle[normalizeTrackTitle(t.title)];
    const trackFileId = trackFileLookup?.get(t.absolutePosition);
    return {
      ...t,
      previewUrl: dz?.previewUrl ?? null,
      streamUrl: trackFileId ? `/api/stream/${trackFileId}` : null,
      trackFileId: trackFileId ?? null,
      // MusicBrainz often omits track lengths for newer releases; Deezer's
      // duration is a reasonable fallback when it's available.
      lengthMs: t.lengthMs ?? dz?.durationMs ?? null,
    };
  });

  const appleMusicUrl = await resolveAppleMusicUrl({
    artistName: album.artistName,
    albumTitle: album.title,
  });

  const albumLiked = await isLiked(userId, "ALBUM", album.mbid);
  const recordingMbids = tracks
    .map((t) => t.recordingMbid)
    .filter((id): id is string => id !== null);
  const likedTrackSet = await getLikedSet(userId, "TRACK", recordingMbids);
  const coverUrl = previews?.cover ?? album.coverUrl;

  // Fetched here so the AddToPlaylistButton dropdown opens instantly with
  // the user's current set; new playlists created inline are appended in
  // local state, so a stale list across browser tabs is the only edge case.
  const playlists = await listPlaylists(userId);
  const playlistOptions = playlists.map((p) => ({
    id: p.id,
    name: p.name,
    trackCount: p.trackCount,
  }));

  return (
    <main className="relative isolate mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-6">
      <AmbientArtworkBackground imageUrl={coverUrl} />

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
        appleMusicUrl={appleMusicUrl}
        canRemoveFromLibrary={isAdmin}
      />
    </main>
  );
}
