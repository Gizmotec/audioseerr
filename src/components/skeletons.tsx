// Shared loading placeholders, used by the per-route loading.tsx files.
//
// Next renders loading.tsx the moment a navigation starts, so these are what
// stands in for a page while its server data resolves — the difference between
// "the app is thinking" and "the app is frozen". Each one mirrors the shape of
// the real screen so nothing jumps when content swaps in.
//
// Shimmer/rounding match the hand-written skeletons that came first
// (app/home/skeletons.tsx, app/album/[mbid]/loading.tsx).

import { cn } from "@/lib/utils";

export const SHIMMER = "animate-pulse bg-surface-2";

export function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("rounded-xl", SHIMMER, className)} aria-hidden />;
}

/** Page title + subtitle, with optional action buttons on the right. */
export function SkeletonPageHeader({ actions = 0 }: { actions?: number }) {
  return (
    <header className="mt-4 mb-8 flex items-end justify-between gap-4">
      <div className="space-y-2">
        <SkeletonBlock className="h-8 w-56" />
        <SkeletonBlock className="h-4 w-72" />
      </div>
      {actions > 0 && (
        <div className="flex items-center gap-2">
          {Array.from({ length: actions }).map((_, i) => (
            <SkeletonBlock key={i} className="h-9 w-32 rounded-full" />
          ))}
        </div>
      )}
    </header>
  );
}

/** The big pastel hero block used by album/artist/playlist pages. */
export function SkeletonHero({ round = false }: { round?: boolean }) {
  return (
    <div
      className="relative mt-6 overflow-hidden rounded-3xl bg-surface-2 p-5 md:p-6"
      aria-hidden
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-end">
        <div
          className={cn(
            "h-40 w-40 shrink-0 md:h-52 md:w-52",
            round ? "rounded-full" : "rounded-xl",
            "animate-pulse bg-foreground/10",
          )}
        />
        <div className="flex flex-col gap-3">
          <div className="h-3 w-24 animate-pulse rounded-xl bg-foreground/10" />
          <div className="h-9 w-64 animate-pulse rounded-xl bg-foreground/10 md:h-12 md:w-96" />
          <div className="h-4 w-44 animate-pulse rounded-xl bg-foreground/10" />
          <div className="mt-2 flex flex-wrap gap-3">
            <div className="h-10 w-32 animate-pulse rounded-full bg-foreground/10" />
            <div className="h-10 w-10 animate-pulse rounded-full bg-foreground/10" />
            <div className="h-10 w-10 animate-pulse rounded-full bg-foreground/10" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** A wrapping grid of cover tiles — playlists, library albums, search results. */
export function SkeletonCardGrid({
  count = 10,
  round = false,
  className,
}: {
  count?: number;
  round?: boolean;
  className?: string;
}) {
  return (
    <ul
      className={cn(
        "grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
        className,
      )}
      aria-busy="true"
    >
      {Array.from({ length: count }).map((_, i) => (
        <li key={i}>
          <div
            className={cn(
              "aspect-square",
              round ? "rounded-full" : "rounded-xl",
              SHIMMER,
            )}
          />
          <SkeletonBlock className="mt-2 h-3.5 w-3/4" />
          <SkeletonBlock className="mt-1.5 h-3 w-1/2" />
        </li>
      ))}
    </ul>
  );
}

/** Track/request rows: play button, artwork, two lines of text, trailing meta. */
export function SkeletonRows({
  rows = 10,
  artwork = true,
}: {
  rows?: number;
  artwork?: boolean;
}) {
  return (
    <ol className="flex flex-col gap-1" aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-xl px-2 py-2.5">
          <SkeletonBlock className="h-9 w-9 shrink-0 rounded-full" />
          {artwork && <SkeletonBlock className="h-10 w-10 shrink-0" />}
          <div className="min-w-0 flex-1 space-y-1.5">
            <SkeletonBlock className="h-3.5 w-1/3" />
            <SkeletonBlock className="h-3 w-1/4" />
          </div>
          <SkeletonBlock className="hidden h-3 w-10 sm:block" />
          <SkeletonBlock className="h-8 w-8 shrink-0 rounded-full" />
        </li>
      ))}
    </ol>
  );
}

/** A labelled section: small heading then a grid or rows. */
export function SkeletonSection({
  titleWidth = "w-32",
  children,
}: {
  titleWidth?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <SkeletonBlock className={cn("h-4", titleWidth)} />
      {children}
    </section>
  );
}

/** Standard page shell so every loading screen lines up with its real page. */
export function SkeletonPage({
  children,
  width = "max-w-5xl",
}: {
  children: React.ReactNode;
  width?: string;
}) {
  return (
    <main
      className={cn("mx-auto w-full flex-1 px-4 py-8 md:px-6", width)}
      aria-busy="true"
    >
      <SkeletonBlock className="h-4 w-20" />
      {children}
    </main>
  );
}
