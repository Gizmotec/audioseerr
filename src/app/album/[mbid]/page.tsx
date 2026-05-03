import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { findAlbumPreviews, normalizeTrackTitle } from "@/lib/deezer";
import { getLibraryStatus, getLibraryStatusByName } from "@/lib/library";
import { getAlbum, type MbTrack } from "@/lib/musicbrainz";
import { isSetupComplete } from "@/lib/settings";
import { AlbumDetail } from "./AlbumDetail";
import type { ExistingRequestStatus } from "./RequestButton";

export const dynamic = "force-dynamic";

type RouteParams = Promise<{ mbid: string }>;

export type TrackWithPreview = MbTrack & { previewUrl: string | null };

export default async function AlbumPage({ params }: { params: RouteParams }) {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { mbid } = await params;
  const album = await getAlbum(mbid);
  if (!album) notFound();

  // Most-recent request by this user for this album, if any. Drives the
  // request button's disabled state.
  const existingRequest = await prisma.request.findFirst({
    where: { requestedById: session.user.id, mbid },
    orderBy: { requestedAt: "desc" },
    select: { status: true },
  });
  const existingStatus = (existingRequest?.status as ExistingRequestStatus) ?? null;

  // Whether Lidarr already knows about this album for any reason (added
  // manually, or via a previous Audioseerr request from another user).
  // MBID first, then artist+title fallback because release-group MBIDs
  // diverge across MB / Last.fm / Lidarr for the same nominal album.
  const libraryStatus =
    (await getLibraryStatus(mbid)) ??
    (await getLibraryStatusByName(album.artistName, album.title));

  // Deezer match runs in parallel-ish (MB call already happened), best-effort.
  let previews: Awaited<ReturnType<typeof findAlbumPreviews>> = null;
  try {
    previews = await findAlbumPreviews(album.artistName, album.title);
  } catch {
    // Previews are nice-to-have; swallow and render the page without them.
  }

  const tracks: TrackWithPreview[] = album.tracks.map((t) => {
    const dz = previews?.trackByTitle[normalizeTrackTitle(t.title)];
    return {
      ...t,
      previewUrl: dz?.previewUrl ?? null,
      // MusicBrainz often omits track lengths for newer releases; Deezer's
      // duration is a reasonable fallback when it's available.
      lengthMs: t.lengthMs ?? dz?.durationMs ?? null,
    };
  });

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-6">
      <Link
        href="/search"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to search
      </Link>

      <AlbumDetail
        album={{
          mbid: album.mbid,
          title: album.title,
          artistName: album.artistName,
          firstReleaseDate: album.firstReleaseDate,
          primaryType: album.primaryType,
          coverUrl: previews?.cover ?? album.coverUrl,
        }}
        tracks={tracks}
        existingStatus={existingStatus}
        libraryStatus={libraryStatus}
      />
    </main>
  );
}

