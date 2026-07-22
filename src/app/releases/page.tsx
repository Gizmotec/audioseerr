import { CalendarClock, Disc3, Sparkles } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getNewReleasesForUser } from "@/lib/releases";
import { RELEASE_WINDOW_DAYS } from "@/lib/releaseFeed";
import { isSetupComplete } from "@/lib/settings";
import { ReleaseCard } from "./ReleaseCard";

export const dynamic = "force-dynamic";

export default async function ReleasesPage() {
  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }

  const { artistCount, releases } = await getNewReleasesForUser(userId);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 md:px-6">
      <header className="flex flex-col gap-5 border-b border-foreground/10 pb-8">
        <div className="max-w-2xl space-y-2">
          <p className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.18em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            New releases
          </p>
          <h1 className="text-3xl font-extrabold tracking-tight md:text-4xl">
            New from your artists
          </h1>
          <p className="text-sm leading-6 text-muted-foreground md:text-base">
            Albums from the last {RELEASE_WINDOW_DAYS} days by artists in your
            library — from your likes and play history.
          </p>
        </div>
      </header>

      {artistCount === 0 ? (
        <EmptyReleases
          title="No artists in your library yet"
          body="Once you like artists or play some music, their new releases will show up here."
          cta
        />
      ) : releases.length === 0 ? (
        <EmptyReleases
          title="Nothing new lately"
          body={`None of the ${artistCount} artists we track for you have released an album in the last ${RELEASE_WINDOW_DAYS} days. Check back soon — the feed refreshes daily.`}
          cta={false}
        />
      ) : (
        <section>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {releases.map((release) => (
              <li key={release.mbid}>
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
        </section>
      )}
    </main>
  );
}

function EmptyReleases({
  title,
  body,
  cta,
}: {
  title: string;
  body: string;
  cta: boolean;
}) {
  return (
    <section className="rounded-2xl border-2 border-dashed border-foreground/15 bg-card p-10 text-center">
      <CalendarClock className="mx-auto mb-4 h-8 w-8 text-muted-foreground/60" />
      <h2 className="text-lg font-extrabold tracking-tight">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
        {body}
      </p>
      {cta && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Link
            href="/home"
            className="inline-flex h-9 items-center gap-2 rounded-full bg-primary px-4 text-sm font-bold text-primary-foreground transition-colors hover:bg-pastel-pink/80"
          >
            <Disc3 className="h-4 w-4" />
            Play some music
          </Link>
        </div>
      )}
    </section>
  );
}
