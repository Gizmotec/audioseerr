import { ArrowLeft, Disc3 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { LibraryStatus } from "@/lib/library";
import { isSetupComplete } from "@/lib/settings";
import { LibraryAlbumTile } from "./LibraryAlbumTile";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  // Reads straight from LibraryItem — kept up to date every 15 min by the
  // syncLibrary cron (see src/lib/jobs/syncLibrary.ts).
  const items = await prisma.libraryItem.findMany({
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

  const isEmpty = items.length === 0;

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
          <h1 className="text-3xl font-semibold tracking-tight">Library</h1>
          <p className="text-sm text-muted-foreground">
            Albums in your Lidarr library.
          </p>
        </div>
        {!isEmpty && (
          <p className="text-sm text-muted-foreground">
            {items.length.toLocaleString()}{" "}
            {items.length === 1 ? "album" : "albums"}
          </p>
        )}
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
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {items.map((item) => (
            <li key={item.mbid}>
              <LibraryAlbumTile
                item={{
                  mbid: item.mbid,
                  title: item.title,
                  artistName: item.artistName,
                  status: item.status as LibraryStatus,
                  trackFileCount: item.trackFileCount,
                  totalTrackCount: item.totalTrackCount,
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
