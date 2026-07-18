// Skeleton shown while the album page fetches MusicBrainz, Deezer previews,
// and the per-track Lidarr file map. Layout mirrors AlbumDetail.tsx so the
// page doesn't shift when content swaps in.

import { BackLink } from "@/components/BackLink";

const SHIMMER = "animate-pulse bg-surface-2";
const TRACK_ROWS = 12;

export default function AlbumLoading() {
  return (
    <main className="relative isolate mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-6">
      <BackLink fallbackHref="/home" />

      <div className="mt-6 flex flex-col gap-8" aria-busy="true">
        <header className="flex flex-col gap-6 md:flex-row md:items-end">
          <div
            className={`relative h-56 w-56 shrink-0 rounded-xl md:h-64 md:w-64 ${SHIMMER}`}
          />
          <div className="flex flex-col gap-3">
            <div className={`h-3 w-16 rounded-xl ${SHIMMER}`} />
            <div className={`h-9 w-72 rounded-xl ${SHIMMER} md:h-12 md:w-96`} />
            <div className={`h-5 w-48 rounded-xl ${SHIMMER}`} />
            <div className="mt-2 flex flex-wrap gap-3">
              <div className={`h-10 w-32 rounded-full ${SHIMMER}`} />
              <div className={`h-10 w-24 rounded-full ${SHIMMER}`} />
              <div className={`h-10 w-40 rounded-full ${SHIMMER}`} />
            </div>
          </div>
        </header>

        <section>
          <div className={`mb-3 h-3.5 w-16 rounded-xl ${SHIMMER}`} />
          <ol className="flex flex-col gap-1">
            {Array.from({ length: TRACK_ROWS }).map((_, i) => (
              <li key={i} className="flex items-center gap-4 px-2 py-2.5">
                <div className={`h-9 w-9 shrink-0 rounded-full ${SHIMMER}`} />
                <div className={`h-3 w-5 rounded-xl ${SHIMMER}`} />
                <div className={`h-4 flex-1 rounded-xl ${SHIMMER}`} />
                <div className={`h-8 w-8 shrink-0 rounded-xl ${SHIMMER}`} />
                <div className={`h-8 w-8 shrink-0 rounded-xl ${SHIMMER}`} />
                <div className={`h-8 w-8 shrink-0 rounded-xl ${SHIMMER}`} />
                <div className={`h-3 w-10 shrink-0 rounded-xl ${SHIMMER}`} />
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
