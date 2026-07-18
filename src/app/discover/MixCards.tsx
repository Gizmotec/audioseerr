import { Compass, Play, Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { getOrGenerateMix, type MixKind } from "@/lib/mixes";
import type { LibraryViewer } from "@/lib/userLibrary";

/**
 * The two "made for you" mixes at the top of discover. Each card is an async
 * server component wrapped in its own <Suspense> so mix generation streams in
 * (skeleton meanwhile) without blocking the rest of the page.
 */
export function MixCards({ viewer }: { viewer: LibraryViewer }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-extrabold tracking-tight">Made for you</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Suspense fallback={<MixCardSkeleton kind="daily" />}>
          <MixCard viewer={viewer} kind="daily" />
        </Suspense>
        <Suspense fallback={<MixCardSkeleton kind="weekly" />}>
          <MixCard viewer={viewer} kind="weekly" />
        </Suspense>
      </div>
    </section>
  );
}

const META: Record<
  MixKind,
  { title: string; tagline: string; icon: typeof Sparkles; fill: string }
> = {
  daily: {
    title: "Daily Mix",
    tagline: "Your favorites with a few fresh picks",
    icon: Sparkles,
    fill: "bg-pastel-pink",
  },
  weekly: {
    title: "Discover Weekly",
    tagline: "30 new tracks, refreshed every Monday",
    icon: Compass,
    fill: "bg-pastel-yellow",
  },
};

async function MixCard({
  viewer,
  kind,
}: {
  viewer: LibraryViewer;
  kind: MixKind;
}) {
  const mix = await getOrGenerateMix(viewer, kind);
  const meta = META[kind];
  const Icon = meta.icon;

  if (mix.tracks.length === 0) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border-2 border-ink bg-card p-4 opacity-70">
        <MixCover coverUrls={[]} icon={<Icon className="h-1/3 w-1/3" />} />
        <div className="min-w-0">
          <p className="font-extrabold tracking-tight">{meta.title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Play and like some music to build this mix.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Link
      href={`/mix/${kind}`}
      className={`group flex items-center gap-4 rounded-2xl border-2 border-ink p-4 text-ink outline-none transition-[filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring ${meta.fill}`}
    >
      <MixCover
        coverUrls={mix.coverUrls}
        icon={<Icon className="h-1/3 w-1/3" />}
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-ink/70">
          <Icon className="h-3.5 w-3.5" />
          {kind === "daily" ? "Daily" : "Weekly"}
        </p>
        <p className="mt-1 truncate font-extrabold tracking-tight" title={meta.title}>
          {meta.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-ink/70">
          {meta.tagline}
        </p>
      </div>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-card text-foreground opacity-0 transition-opacity group-hover:opacity-100">
        <Play className="h-4 w-4 fill-current" />
      </span>
    </Link>
  );
}

function MixCover({
  coverUrls,
  icon,
}: {
  coverUrls: string[];
  icon: React.ReactNode;
}) {
  const grid = coverUrls.slice(0, 4);
  return (
    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md bg-secondary">
      {grid.length >= 4 ? (
        <div className="grid h-full w-full grid-cols-2 grid-rows-2">
          {grid.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${url}-${i}`}
              src={url}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="h-full w-full object-cover"
            />
          ))}
        </div>
      ) : grid.length > 0 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={grid[0]}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
          {icon}
        </div>
      )}
    </div>
  );
}

function MixCardSkeleton({ kind }: { kind: MixKind }) {
  const meta = META[kind];
  return (
    <div className="flex items-center gap-4 rounded-lg border border-border bg-secondary/30 p-4">
      <div className="h-16 w-16 shrink-0 animate-pulse rounded-md bg-secondary" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3 w-16 animate-pulse rounded bg-secondary" />
        <div className="h-4 w-28 animate-pulse rounded bg-secondary" />
        <div className="h-3 w-40 animate-pulse rounded bg-secondary" />
      </div>
      <span className="sr-only">Loading {meta.title}</span>
    </div>
  );
}
