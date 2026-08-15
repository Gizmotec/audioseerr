import { Compass, Play, Sparkles } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import {
  DAILY_MIX_SLOTS,
  getOrGenerateDailyMixes,
  getOrGenerateMix,
  type GeneratedMix,
} from "@/lib/mixes";
import type { LibraryViewer } from "@/lib/userLibrary";

/**
 * The "made for you" block at the top of discover: a row of Daily Mix tiles
 * (same shape as a playlist tile) over a full-width Discover Weekly card. Each
 * half is an async server component in its own <Suspense> so mix generation
 * streams in behind a skeleton without blocking the rest of the page.
 */
export function MixCards({ viewer }: { viewer: LibraryViewer }) {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-extrabold tracking-tight">Made for you</h2>
      <Suspense fallback={<DailyMixRowSkeleton />}>
        <DailyMixRow viewer={viewer} />
      </Suspense>
      <Suspense fallback={<WeeklyCardSkeleton />}>
        <WeeklyCard viewer={viewer} />
      </Suspense>
    </section>
  );
}

// --- Daily Mixes -----------------------------------------------------------

async function DailyMixRow({ viewer }: { viewer: LibraryViewer }) {
  const mixes = (await getOrGenerateDailyMixes(viewer)).filter(
    (m) => m.tracks.length > 0,
  );
  if (mixes.length === 0) {
    return (
      <div className="rounded-2xl bg-card p-4 text-sm text-muted-foreground">
        <p className="font-extrabold tracking-tight text-foreground">Daily Mix</p>
        <p className="mt-0.5 text-xs">
          Play and like some music to build your daily mixes.
        </p>
      </div>
    );
  }
  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
      {mixes.map((mix) => (
        <li key={mix.kind}>
          <DailyMixTile mix={mix} />
        </li>
      ))}
    </ul>
  );
}

function DailyMixTile({ mix }: { mix: GeneratedMix }) {
  return (
    <Link
      href={`/mix/${mix.kind}`}
      className="group flex flex-col gap-2 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="relative aspect-square overflow-hidden rounded-cover bg-surface-2">
        <MixMosaic
          coverUrls={mix.coverUrls}
          icon={<Sparkles className="h-1/3 w-1/3" />}
          className="transition-transform duration-200 group-hover:scale-[1.02]"
        />
      </div>
      <div className="space-y-0.5">
        <p className="truncate text-sm font-medium leading-snug" title={mix.title}>
          {mix.title}
        </p>
        <p className="truncate text-xs text-muted-foreground" title={mix.subtitle}>
          {mix.subtitle}
        </p>
      </div>
    </Link>
  );
}

// --- Discover Weekly -------------------------------------------------------

async function WeeklyCard({ viewer }: { viewer: LibraryViewer }) {
  const mix = await getOrGenerateMix(viewer, "weekly");

  if (mix.tracks.length === 0) {
    return (
      <div className="flex w-full items-center gap-4 rounded-2xl bg-card p-4 opacity-70">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-cover bg-secondary">
          <MixMosaic coverUrls={[]} icon={<Compass className="h-1/3 w-1/3" />} />
        </div>
        <div className="min-w-0">
          <p className="font-extrabold tracking-tight">Discover Weekly</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Play and like some music to build this mix.
          </p>
        </div>
      </div>
    );
  }

  return (
    <Link
      href="/mix/weekly"
      className="group flex w-full items-center gap-4 rounded-2xl bg-pastel-yellow p-4 text-ink outline-none transition-[filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-cover bg-secondary">
        <MixMosaic
          coverUrls={mix.coverUrls}
          icon={<Compass className="h-1/3 w-1/3" />}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-ink/70">
          <Compass className="h-3.5 w-3.5" />
          Weekly
        </p>
        <p className="mt-1 truncate font-extrabold tracking-tight">
          Discover Weekly
        </p>
        <p className="mt-0.5 truncate text-xs text-ink/70">
          30 new tracks, refreshed every Monday
        </p>
      </div>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card text-foreground opacity-0 transition-opacity group-hover:opacity-100">
        <Play className="h-4 w-4 fill-current" />
      </span>
    </Link>
  );
}

// --- Shared ----------------------------------------------------------------

/** 2x2 of the mix's covers, one cover, or the kind's icon — fills its parent. */
function MixMosaic({
  coverUrls,
  icon,
  className = "",
}: {
  coverUrls: string[];
  icon: React.ReactNode;
  className?: string;
}) {
  const grid = coverUrls.slice(0, 4);
  if (grid.length >= 4) {
    return (
      <div className={`grid h-full w-full grid-cols-2 grid-rows-2 ${className}`}>
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
    );
  }
  if (grid.length > 0) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={grid[0]}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        className={`h-full w-full object-cover ${className}`}
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
      {icon}
    </div>
  );
}

function DailyMixRowSkeleton() {
  return (
    <ul
      className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5"
      aria-label="Loading daily mixes"
    >
      {DAILY_MIX_SLOTS.map((slot) => (
        <li key={slot} className="flex flex-col gap-2">
          <div className="aspect-square animate-pulse rounded-cover bg-secondary" />
          <div className="h-3.5 w-3/4 animate-pulse rounded bg-secondary" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-secondary" />
        </li>
      ))}
    </ul>
  );
}

function WeeklyCardSkeleton() {
  return (
    <div className="flex w-full items-center gap-4 rounded-2xl border border-border bg-secondary/30 p-4">
      <div className="h-16 w-16 shrink-0 animate-pulse rounded-cover bg-secondary" />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-3 w-16 animate-pulse rounded bg-secondary" />
        <div className="h-4 w-28 animate-pulse rounded bg-secondary" />
        <div className="h-3 w-40 animate-pulse rounded bg-secondary" />
      </div>
      <span className="sr-only">Loading Discover Weekly</span>
    </div>
  );
}
