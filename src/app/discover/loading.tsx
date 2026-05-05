import { ChartListSkeleton, DiscoveryRowSkeleton } from "./skeletons";

const SHIMMER = "animate-pulse bg-secondary/60";

const GENRE_CHIPS = [
  "rock",
  "pop",
  "indie",
  "electronic",
  "hip-hop",
  "alternative",
  "jazz",
  "classical",
  "metal",
  "folk",
  "ambient",
  "soul",
];

export default function DiscoverLoading() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-4 py-10 md:px-6">
      <header className="flex flex-col gap-5 border-b border-border pb-8 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl space-y-3">
          <div className={`h-4 w-28 rounded ${SHIMMER}`} />
          <div className={`h-10 w-full max-w-xl rounded ${SHIMMER}`} />
          <div className={`h-4 w-full max-w-lg rounded ${SHIMMER}`} />
        </div>
        <div className={`h-9 w-28 rounded-md ${SHIMMER}`} />
      </header>

      <section className="space-y-3">
        <div className={`h-5 w-28 rounded ${SHIMMER}`} />
        <div className={`h-9 w-full rounded-md ${SHIMMER}`} />
      </section>

      <DiscoveryRowSkeleton titleWidth="w-44" count={6} />
      <ChartListSkeleton titleWidth="w-28" rows={10} columns={2} />
      <ChartListSkeleton titleWidth="w-28" rows={9} columns={3} />
      <ChartListSkeleton titleWidth="w-28" rows={10} columns={2} />
      <DiscoveryRowSkeleton titleWidth="w-40" count={6} />
      <DiscoveryRowSkeleton titleWidth="w-40" count={6} />
      <DiscoveryRowSkeleton titleWidth="w-40" count={6} />

      <section className="space-y-3">
        <div className={`h-5 w-32 rounded ${SHIMMER}`} />
        <ul className="flex flex-wrap gap-2">
          {GENRE_CHIPS.map((g) => (
            <li
              key={g}
              className={`h-7 w-20 rounded-full ${SHIMMER}`}
              aria-hidden
            />
          ))}
        </ul>
      </section>
    </main>
  );
}
