import { ArrowLeft, Disc3 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { isSetupComplete } from "@/lib/settings";
import { isAdmin } from "@/lib/userLibrary";
import { LibraryView, type LibraryTrack } from "./LibraryView";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
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
  const admin = isAdmin(viewer);

  // Track-first library: read the actual downloaded files (DownloadedTrack),
  // scoped to what the viewer owns via UserDownloadedTrack. Admins see every
  // track; regular users see only the ones they've requested or had granted.
  // (We no longer read the album rollup LibraryItem here — that's why one
  // downloaded song no longer surfaces the whole album.)
  const rows = await prisma.downloadedTrack.findMany({
    where: admin ? {} : { users: { some: { userId } } },
    select: {
      id: true,
      title: true,
      artistName: true,
      albumTitle: true,
      albumMbid: true,
      albumPosition: true,
      coverUrl: true,
      durationMs: true,
      recordingMbid: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const tracks: LibraryTrack[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    artistName: r.artistName,
    albumTitle: r.albumTitle,
    albumMbid: r.albumMbid,
    albumPosition: r.albumPosition,
    coverUrl: r.coverUrl,
    durationMs: r.durationMs,
    recordingMbid: r.recordingMbid,
    streamUrl: `/api/stream/local/${r.id}`,
  }));

  const isEmpty = tracks.length === 0;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header className="mt-4 mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
        <p className="text-sm text-muted-foreground">
          Every track you&rsquo;ve downloaded.
        </p>
      </header>

      {isEmpty ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Disc3 className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" />
          <p>Nothing in the library yet.</p>
          <p className="mt-1">
            Tracks show up here once a request finishes downloading.
          </p>
        </div>
      ) : (
        <LibraryView tracks={tracks} canDelete={admin} />
      )}
    </main>
  );
}
