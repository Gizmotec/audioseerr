const SHIMMER = "animate-pulse bg-surface-2";

export default function HomeLoading() {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-4 py-8 md:px-6">
      <header className="flex flex-col gap-5 border-b-2 border-ink pb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl space-y-3">
          <div className={`h-4 w-24 rounded-xl ${SHIMMER}`} />
          <div className={`h-10 w-full max-w-lg rounded-xl ${SHIMMER}`} />
          <div className={`h-4 w-full max-w-xl rounded-xl ${SHIMMER}`} />
        </div>
        <div className="flex gap-2">
          <div className={`h-9 w-24 rounded-full ${SHIMMER}`} />
          <div className={`h-9 w-24 rounded-full ${SHIMMER}`} />
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="rounded-2xl border-2 border-ink bg-card p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className={`h-4 w-20 rounded-xl ${SHIMMER}`} />
              <div className={`h-4 w-4 rounded-xl ${SHIMMER}`} />
            </div>
            <div className={`mt-3 h-8 w-20 rounded-xl ${SHIMMER}`} />
            <div className={`mt-2 h-3 w-32 rounded-xl ${SHIMMER}`} />
          </div>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <div className="rounded-2xl border-2 border-ink bg-card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className={`h-5 w-36 rounded-xl ${SHIMMER}`} />
              <div className={`h-4 w-64 rounded-xl ${SHIMMER}`} />
            </div>
            <div className={`h-8 w-14 rounded-xl ${SHIMMER}`} />
          </div>
          <div className={`mt-5 h-2 rounded-full ${SHIMMER}`} />
          <div className="mt-5 grid gap-2 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={index}
                className="rounded-xl bg-surface-2 px-3 py-2"
              >
                <div className={`h-4 w-16 rounded-xl ${SHIMMER}`} />
                <div className={`mt-1 h-3 w-20 rounded-xl ${SHIMMER}`} />
              </div>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[6rem_1fr] gap-4 rounded-2xl border-2 border-ink bg-card p-4">
          <div className={`aspect-square rounded-xl ${SHIMMER}`} />
          <div className="self-center space-y-2">
            <div className={`h-3 w-28 rounded-xl ${SHIMMER}`} />
            <div className={`h-5 w-44 rounded-xl ${SHIMMER}`} />
            <div className={`h-4 w-32 rounded-xl ${SHIMMER}`} />
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <div className={`h-5 w-44 rounded-xl ${SHIMMER}`} />
          <div className={`h-3 w-20 rounded-xl ${SHIMMER}`} />
        </div>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, index) => (
            <li key={index}>
              <div className={`aspect-square rounded-xl ${SHIMMER}`} />
              <div className={`mt-2 h-3.5 w-3/4 rounded-xl ${SHIMMER}`} />
              <div className={`mt-1.5 h-3 w-1/2 rounded-xl ${SHIMMER}`} />
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
