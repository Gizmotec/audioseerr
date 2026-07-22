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
    <section className="space-y-4">
      <h2 className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
        <span className="flex h-8 w-8 -rotate-6 items-center justify-center rounded-lg border-2 border-ink bg-pastel-pink text-ink shadow-[2px_2px_0_0_var(--color-ink)]">
          <Sparkles className="h-4 w-4" />
        </span>
        Made for you
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Suspense fallback={<MixCardSkeleton kind="daily" />}>
          <MixCard viewer={viewer} kind="daily" tilt="-rotate-1" />
        </Suspense>
        <Suspense fallback={<MixCardSkeleton kind="weekly" />}>
          <MixCard viewer={viewer} kind="weekly" tilt="rotate-1" />
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
  tilt,
}: {
  viewer: LibraryViewer;
  kind: MixKind;
  tilt: string;
}) {
  const mix = await getOrGenerateMix(viewer, kind);
  const meta = META[kind];
  const Icon = meta.icon;

  if (mix.tracks.length === 0) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border-2 border-ink bg-card p-5 opacity-70">
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
      className={`group flex items-center gap-5 rounded-2xl border-2 border-ink p-5 text-ink shadow-[6px_6px_0_0_var(--color-ink)] outline-none transition-all hover:-translate-y-1 hover:rotate-0 hover:shadow-[8px_8px_0_0_var(--color-ink)] focus-visible:ring-2 focus-visible:ring-ring ${tilt} ${meta.fill}`}
    >
      <div className="-rotate-3 transition-transform duration-200 group-hover:rotate-0 group-hover:scale-105">
        <MixCover
          coverUrls={mix.coverUrls}
          icon={<Icon className="h-1/3 w-1/3" />}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-[0.14em] text-ink/70">
          <Icon className="h-3.5 w-3.5" />
          {kind === "daily" ? "Daily" : "Weekly"}
        </p>
        <p className="mt-1 truncate text-lg font-extrabold tracking-tight" title={meta.title}>
          {meta.title}
        </p>
        <p className="mt-0.5 truncate text-xs font-medium text-ink/70">
          {meta.tagline}
        </p>
      </div>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-ink text-pastel-yellow shadow-[2px_2px_0_0_var(--color-ink)] transition-transform group-hover:scale-110">
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
    <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 border-ink bg-secondary shadow-[3px_3px_0_0_var(--color-ink)]">
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
    <div className="flex items-center gap-5 rounded-2xl border-2 border-ink bg-surface p-5">
      <div className="h-20 w-20 shrink-0 animate-pulse rounded-xl bg-surface-2" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3 w-16 animate-pulse rounded bg-surface-2" />
        <div className="h-4 w-28 animate-pulse rounded bg-surface-2" />
        <div className="h-3 w-40 animate-pulse rounded bg-surface-2" />
      </div>
      <span className="sr-only">Loading {meta.title}</span>
    </div>
  );
}
