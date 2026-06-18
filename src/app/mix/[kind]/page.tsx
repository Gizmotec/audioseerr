import { ArrowLeft, Compass, Sparkles } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { getLikedSet, trackLikeTargetId } from "@/lib/likes";
import { getOrGenerateMix, type MixKind } from "@/lib/mixes";
import { isSetupComplete } from "@/lib/settings";
import { MixDetail } from "./MixDetail";

export const dynamic = "force-dynamic";

function isMixKind(value: string): value is MixKind {
  return value === "daily" || value === "weekly";
}

export default async function MixPage({
  params,
}: {
  params: Promise<{ kind: string }>;
}) {
  const { kind } = await params;
  if (!isMixKind(kind)) notFound();

  if (!(await isSetupComplete())) {
    redirect("/setup");
  }
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    redirect("/login");
  }
  const role = (session.user as { role?: string }).role;
  const mix = await getOrGenerateMix({ id: userId, role }, kind);

  // Only library tracks carry stable ids; "new" preview picks resolve on like.
  const likeTargetIds = mix.tracks.flatMap((t) =>
    t.kind === "library"
      ? [trackLikeTargetId(t.recordingMbid, t.albumMbid, t.albumPosition)]
      : [],
  ).filter((x): x is string => !!x);
  const likedTrackIds = [...(await getLikedSet(userId, "TRACK", likeTargetIds))];

  const Icon = kind === "daily" ? Sparkles : Compass;
  const gridCovers = mix.coverUrls.slice(0, 4);

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 md:px-6">
      <Link
        href="/discover"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Discover
      </Link>

      <header className="mt-6 flex flex-col gap-5 border-b border-border pb-8 sm:flex-row sm:items-end">
        <div className="relative h-36 w-36 shrink-0 overflow-hidden rounded-lg bg-secondary shadow-sm">
          {gridCovers.length >= 4 ? (
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
              <Icon className="h-1/3 w-1/3" />
            </div>
          )}
        </div>

        <div className="min-w-0 space-y-1.5">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
            {kind === "daily" ? "Daily Mix" : "Discover Weekly"}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
            {mix.title}
          </h1>
          <p className="text-sm text-muted-foreground">{mix.subtitle}</p>
        </div>
      </header>

      <section className="mt-8">
        {mix.tracks.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            <Icon className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" />
            <p>This mix is empty for now.</p>
            <p className="mt-1">
              Play and like some music, then check back tomorrow.
            </p>
          </div>
        ) : (
          <MixDetail tracks={mix.tracks} likedTrackIds={likedTrackIds} />
        )}
      </section>
    </main>
  );
}
