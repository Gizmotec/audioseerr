import { ArrowLeft, Clock, Disc3 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getLikedSet, trackLikeTargetId } from "@/lib/likes";
import { isSetupComplete } from "@/lib/settings";
import {
  formatTemporaryExpiryCaption,
  parseLibraryTab,
} from "@/lib/temporaryLibrary";
import { isAdmin } from "@/lib/userLibrary";
import { cn } from "@/lib/utils";
import { LibraryView, type LibraryTrack } from "./LibraryView";

export const dynamic = "force-dynamic";

function currentDate(): Date {
  return new Date();
}

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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
  const tab = parseLibraryTab((await searchParams).tab);
  const temporary = tab === "temporary";
  const renderedAt = currentDate();

  // Track-first library: read the actual downloaded files (DownloadedTrack),
  // scoped to what the viewer owns via UserDownloadedTrack. Admins see every
  // track; regular users see only the ones they've requested or had granted.
  // (We no longer read the album rollup LibraryItem here — that's why one
  // downloaded song no longer surfaces the whole album.)
  const rows = await prisma.downloadedTrack.findMany({
    where: {
      ephemeral: temporary,
      ...(admin ? {} : { users: { some: { userId } } }),
    },
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
      expiresAt: true,
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
    caption: temporary
      ? formatTemporaryExpiryCaption(r.expiresAt, renderedAt)
      : null,
  }));

  const likeTargetIds = tracks
    .map((t) => trackLikeTargetId(t.recordingMbid, t.albumMbid, t.albumPosition))
    .filter((x): x is string => !!x);
  const likedTrackIds = [...(await getLikedSet(userId, "TRACK", likeTargetIds))];

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
        <h1 className="text-3xl font-extrabold tracking-tight">Library</h1>
        <p className="text-sm text-muted-foreground">
          {temporary
            ? "Full-length mix tracks waiting to be kept or cleaned up."
            : "Every track you’ve downloaded and kept."}
        </p>
      </header>

      <nav aria-label="Library sections" className="mb-6 flex gap-1 border-b border-border">
        <LibraryTabLink href="/library" label="Library" active={!temporary} />
        <LibraryTabLink
          href="/library?tab=temporary"
          label="Temporary"
          active={temporary}
        />
      </nav>

      {temporary && (
        <div className="mb-6 flex items-start gap-2 rounded-xl bg-pastel-yellow/10 px-4 py-3 text-sm text-muted-foreground">
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-pastel-yellow" />
          <p>
            Like a track or add it to a playlist to keep it permanently. Otherwise,
            it is removed after the expiry shown below.
          </p>
        </div>
      )}

      {isEmpty ? (
        <div className="rounded-2xl border-2 border-dashed border-foreground/15 bg-card p-8 text-center text-sm text-muted-foreground">
          {temporary ? (
            <Clock className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" />
          ) : (
            <Disc3 className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" />
          )}
          <p>{temporary ? "No temporary tracks." : "Nothing in the library yet."}</p>
          <p className="mt-1">
            {temporary
              ? "Pre-downloaded Daily Mix and Discover Weekly tracks will appear here."
              : "Tracks show up here once a request finishes downloading."}
          </p>
        </div>
      ) : (
        <LibraryView
          key={tab}
          tracks={tracks}
          canDelete={admin}
          likedTrackIds={likedTrackIds}
        />
      )}
    </main>
  );
}

function LibraryTabLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-foreground text-foreground"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </Link>
  );
}
