import { Suspense } from "react";
import { RELEASE_WINDOW_DAYS } from "@/lib/releaseFeed";
import { getNewReleasesForUser } from "@/lib/releases";
import { ReleaseCard } from "./ReleaseCard";
import { DiscoveryRowSkeleton } from "./skeletons";

/**
 * The "new albums from artists in your library" shelf on discover (formerly the
 * standalone /releases page). The feed fans out to MusicBrainz per artist, so a
 * cold cache is slow — its own <Suspense> boundary keeps it off the critical
 * path and lets the rest of discover paint immediately.
 */
export function NewReleasesSection({ userId }: { userId: string }) {
  return (
    <Suspense fallback={<DiscoveryRowSkeleton titleWidth="w-48" count={6} />}>
      <NewReleasesShelf userId={userId} />
    </Suspense>
  );
}

async function NewReleasesShelf({ userId }: { userId: string }) {
  // As one shelf among many, a failure (or an empty library) should drop the
  // section rather than surface an error or a dead placeholder — same posture
  // as the other discover rows.
  const feed = await getNewReleasesForUser(userId).catch((e: unknown) => {
    console.warn("[discover] new releases shelf failed:", e);
    return null;
  });
  const releases = feed?.releases ?? [];
  if (releases.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-extrabold tracking-tight">
          New from your artists
        </h2>
        <p className="text-sm text-muted-foreground">
          Albums from the last {RELEASE_WINDOW_DAYS} days by artists in your
          library — from your likes and play history.
        </p>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 md:-mx-6 md:px-6">
        <ul className="flex gap-4 pb-2">
          {releases.map((release) => (
            <li key={release.mbid} className="w-36 shrink-0 sm:w-40">
              <ReleaseCard
                mbid={release.mbid}
                title={release.title}
                artistName={release.artistName}
                coverUrl={release.coverUrl}
                firstReleaseDate={release.firstReleaseDate}
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
