const SHIMMER = "animate-pulse bg-surface-2";

function SectionHeader({ width = "w-32" }: { width?: string }) {
  return (
    <header className="flex items-baseline justify-between">
      <div className={`h-5 rounded ${width} ${SHIMMER}`} />
    </header>
  );
}

export function DiscoveryRowSkeleton({
  count = 6,
  titleWidth,
}: {
  count?: number;
  titleWidth?: string;
}) {
  return (
    <section className="space-y-3" aria-busy="true">
      <SectionHeader width={titleWidth} />
      <div className="-mx-4 overflow-x-auto px-4 md:-mx-6 md:px-6">
        <ul className="flex gap-4 pb-2">
          {Array.from({ length: count }).map((_, i) => (
            <li key={i} className="w-36 shrink-0 sm:w-40">
              <div className={`aspect-square rounded-xl ${SHIMMER}`} />
              <div className={`mt-2 h-3.5 w-3/4 rounded ${SHIMMER}`} />
              <div className={`mt-1.5 h-3 w-1/2 rounded ${SHIMMER}`} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ChartRowSkeleton() {
  return (
    <li className="grid min-h-16 grid-cols-[2rem_2.75rem_1fr] items-center gap-3 rounded-xl bg-surface px-3 py-2">
      <div className={`h-3 w-5 rounded ${SHIMMER}`} />
      <div className={`h-11 w-11 rounded-lg ${SHIMMER}`} />
      <div className="min-w-0 space-y-1.5">
        <div className={`h-3.5 w-3/4 rounded ${SHIMMER}`} />
        <div className={`h-3 w-1/2 rounded ${SHIMMER}`} />
      </div>
    </li>
  );
}

export function ChartListSkeleton({
  rows = 10,
  columns = 2,
  titleWidth,
}: {
  rows?: number;
  columns?: 2 | 3;
  titleWidth?: string;
}) {
  return (
    <section className="space-y-3" aria-busy="true">
      <header className="flex items-baseline justify-between gap-3">
        <div className={`h-5 rounded ${titleWidth ?? "w-28"} ${SHIMMER}`} />
        <div className={`h-3 w-14 rounded ${SHIMMER}`} />
      </header>
      <ol
        className={`grid gap-2 ${
          columns === 3
            ? "sm:grid-cols-2 lg:grid-cols-3"
            : "md:grid-cols-2"
        }`}
      >
        {Array.from({ length: rows }).map((_, i) => (
          <ChartRowSkeleton key={i} />
        ))}
      </ol>
    </section>
  );
}
