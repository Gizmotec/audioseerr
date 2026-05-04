// Skeleton shown while the album page fetches MusicBrainz, Deezer previews,
// and the per-track Lidarr file map. Layout mirrors AlbumDetail.tsx so the
// page doesn't shift when content swaps in.

import { ArrowLeft } from "lucide-react";

const SHIMMER = "animate-pulse bg-secondary/60";
const TRACK_ROWS = 12;

export default function AlbumLoading() {
  return (
    <main className="relative isolate mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-6">
      <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
        <ArrowLeft className="h-4 w-4" /> Back to search
      </span>

      <div className="mt-6 flex flex-col gap-8" aria-busy="true">
        <header className="flex flex-col gap-6 md:flex-row md:items-end">
          <div
            className={`relative h-56 w-56 shrink-0 rounded-lg shadow-lg md:h-64 md:w-64 ${SHIMMER}`}
          />
          <div className="flex flex-col gap-3">
            <div className={`h-3 w-16 rounded ${SHIMMER}`} />
            <div className={`h-9 w-72 rounded ${SHIMMER} md:h-12 md:w-96`} />
            <div className={`h-5 w-48 rounded ${SHIMMER}`} />
            <div className="mt-2 flex flex-wrap gap-3">
              <div className={`h-10 w-32 rounded-md ${SHIMMER}`} />
              <div className={`h-10 w-24 rounded-md ${SHIMMER}`} />
              <div className={`h-10 w-40 rounded-md ${SHIMMER}`} />
            </div>
          </div>
        </header>

        <section>
          <div className={`mb-3 h-3.5 w-16 rounded ${SHIMMER}`} />
          <ol className="divide-y divide-border/50">
            {Array.from({ length: TRACK_ROWS }).map((_, i) => (
              <li key={i} className="flex items-center gap-4 py-2.5">
                <div className={`h-9 w-9 shrink-0 rounded-full ${SHIMMER}`} />
                <div className={`h-3 w-5 rounded ${SHIMMER}`} />
                <div className={`h-4 flex-1 rounded ${SHIMMER}`} />
                <div className={`h-8 w-8 shrink-0 rounded ${SHIMMER}`} />
                <div className={`h-8 w-8 shrink-0 rounded ${SHIMMER}`} />
                <div className={`h-8 w-8 shrink-0 rounded ${SHIMMER}`} />
                <div className={`h-3 w-10 shrink-0 rounded ${SHIMMER}`} />
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
