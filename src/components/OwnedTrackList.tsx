"use client";

import { ArrowRight, Disc3, Loader2, Pause, Play } from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { type QueueItem, usePreviewPlayer } from "@/components/PreviewPlayer";
import { cn } from "@/lib/utils";

export type OwnedTrack = {
  id: string;
  title: string;
  artistName: string;
  albumTitle: string | null;
  albumMbid: string;
  coverUrl: string | null;
  durationMs: number | null;
  recordingMbid: string | null;
  streamUrl: string;
  /** Optional right-aligned note, e.g. "3 plays" or "2d ago". */
  caption?: string | null;
};

/**
 * A compact shelf of owned, playable tracks (Home). Clicking a row plays the
 * whole shelf as a queue via the shared PreviewPlayer. Read-only — no download
 * or delete; those live on the Library/Discover pages. Renders nothing if empty.
 */
export function OwnedTrackList({
  title,
  tracks,
  icon: Icon,
  seeAllHref,
}: {
  title: string;
  tracks: OwnedTrack[];
  icon?: React.ComponentType<{ className?: string }>;
  seeAllHref?: string;
}) {
  const player = usePreviewPlayer();

  const queue = useMemo<QueueItem[]>(
    () =>
      tracks.map((t) => ({
        id: t.id,
        title: t.title,
        artistName: t.artistName,
        coverUrl: t.coverUrl,
        streamUrl: t.streamUrl,
        recordingMbid: t.recordingMbid ?? undefined,
        albumMbid: t.albumMbid,
        durationMs: t.durationMs ?? undefined,
      })),
    [tracks],
  );

  if (tracks.length === 0) return null;

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
          {title}
        </h2>
        {seeAllHref && (
          <Link
            href={seeAllHref}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Open library
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </header>
      <ol className="divide-y divide-border/50">
        {tracks.map((t, idx) => {
          const failed = player.failedIds.has(t.id);
          const isActive = !failed && player.isCurrent(t.id);
          return (
            <li
              key={t.id}
              className={cn(
                "group flex items-center gap-3 py-2.5",
                isActive && "bg-secondary/40",
                failed && "opacity-50",
              )}
            >
              <button
                type="button"
                onClick={() => player.playQueue(queue, idx)}
                disabled={failed}
                aria-label={
                  failed
                    ? "Track failed to load"
                    : isActive && player.state === "playing"
                      ? "Pause"
                      : "Play"
                }
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                  failed
                    ? "cursor-not-allowed border-border/50 text-muted-foreground/40"
                    : "border-border hover:border-foreground hover:text-foreground",
                )}
              >
                {isActive && player.state === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : isActive && player.state === "playing" ? (
                  <Pause className="h-4 w-4" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
              </button>

              <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-secondary">
                {t.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.coverUrl}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                    <Disc3 className="h-1/2 w-1/2" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm" title={t.title}>
                  {t.title}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {t.albumTitle ? (
                    <>
                      {t.artistName} ·{" "}
                      <Link
                        href={`/album/${t.albumMbid}`}
                        className="hover:text-foreground hover:underline"
                      >
                        {t.albumTitle}
                      </Link>
                    </>
                  ) : (
                    t.artistName
                  )}
                </p>
              </div>

              {t.caption && (
                <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">
                  {t.caption}
                </span>
              )}
              <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">
                {formatDuration(t.durationMs)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  const seconds = Math.round(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
