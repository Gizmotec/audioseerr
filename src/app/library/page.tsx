import { ArrowLeft, Disc3 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ShuffleLibraryButton } from "@/components/ShuffleLibraryButton";
import { prisma } from "@/lib/db";
import type { LibraryStatus } from "@/lib/library";
import { isSetupComplete } from "@/lib/settings";
import { LibraryView, type StatusFilter } from "./LibraryView";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ status?: string }>;

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }
  const isAdmin = (session.user as { role?: string }).role === "ADMIN";
  const { status } = await searchParams;
  const initialStatus = parseStatusFilter(status);

  // Reads straight from LibraryItem — kept up to date every 15 min by the
  // syncLibrary cron (see src/lib/jobs/syncLibrary.ts).
  const rows = await prisma.libraryItem.findMany({
    select: {
      mbid: true,
      status: true,
      artistName: true,
      title: true,
      trackFileCount: true,
      totalTrackCount: true,
    },
    orderBy: [{ artistName: "asc" }, { title: "asc" }],
  });

  const items = rows.map((r) => ({
    mbid: r.mbid,
    title: r.title,
    artistName: r.artistName,
    status: r.status as LibraryStatus,
    trackFileCount: r.trackFileCount,
    totalTrackCount: r.totalTrackCount,
  }));

  const isEmpty = items.length === 0;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/home"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Home
      </Link>

      <header className="mt-4 mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
          <p className="text-sm text-muted-foreground">
            Albums in your Lidarr library.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          {!isEmpty && <ShuffleLibraryButton variant="secondary" />}
          {!isEmpty && (
            <p className="text-sm text-muted-foreground">
              {items.length.toLocaleString()}{" "}
              {items.length === 1 ? "album" : "albums"}
            </p>
          )}
        </div>
      </header>

      {isEmpty ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Disc3 className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" />
          <p>Nothing in the library yet.</p>
          <p className="mt-1">
            Approved requests show up here once Lidarr finishes downloading
            them.
          </p>
        </div>
      ) : (
        <LibraryView
          items={items}
          canDelete={isAdmin}
          initialStatus={initialStatus}
        />
      )}
    </main>
  );
}

function parseStatusFilter(status: string | undefined): StatusFilter {
  if (
    status === "downloaded" ||
    status === "downloading" ||
    status === "missing"
  ) {
    return status;
  }
  return "all";
}
