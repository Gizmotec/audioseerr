import { ChartListSkeleton, DiscoveryRowSkeleton } from "./skeletons";

const SHIMMER = "animate-pulse bg-surface-2";

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
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 overflow-x-clip px-4 py-10 md:px-6">
      <section className="rounded-3xl border-2 border-ink bg-surface p-6 shadow-[8px_8px_0_0_var(--color-ink)] md:p-10">
        <div className="flex items-start justify-between gap-4">
          <div className={`h-6 w-24 -rotate-2 rounded-full ${SHIMMER}`} />
          <div className={`h-9 w-28 rotate-1 rounded-full ${SHIMMER}`} />
        </div>
        <div className="mt-6 max-w-xl space-y-3">
          <div className={`h-12 w-full max-w-md rounded ${SHIMMER}`} />
          <div className={`h-4 w-full max-w-sm rounded ${SHIMMER}`} />
        </div>
        <div className={`mt-6 h-11 w-full max-w-lg rounded-full border-2 border-ink ${SHIMMER}`} />
      </section>

      <div className={`-mx-4 h-10 -rotate-1 border-y-2 border-ink md:-mx-6 ${SHIMMER}`} />

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
