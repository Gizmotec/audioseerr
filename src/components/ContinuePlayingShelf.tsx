"use client";

import { Disc3, History, Loader2, Pause, Play } from "lucide-react";
import { useMemo } from "react";
import { type QueueItem, usePreviewPlayer } from "@/components/PreviewPlayer";
import { progressPercent } from "@/lib/resumePlayback";

/**
 * Serializable shape the Home server component hands over. Defined locally
 * (not imported from the prisma-backed lib) so this client bundle stays free
 * of server-only modules.
 */
export type ContinuePlayingItem = {
  id: string;
  trackKey: string;
  title: string;
  artistName: string;
  coverUrl: string | null;
  streamUrl: string;
  recordingMbid: string | null;
  albumMbid: string;
  durationMs: number | null;
  positionMs: number;
  positionDurationMs: number;
};

/**
 * "Continue playing" shelf (Home): a horizontal row of in-progress tracks,
 * each with a thin progress bar over the cover. Clicking a card plays the
 * shelf as a queue starting at that track — the player's resume wiring seeks
 * to the stored position once metadata loads. Clicking the active card
 * toggles play/pause instead of restarting.
 */
export function ContinuePlayingShelf({
  items,
}: {
  items: ContinuePlayingItem[];
}) {
  const player = usePreviewPlayer();
  const queue = useMemo<QueueItem[]>(
    () =>
      items.map((t) => ({
        id: t.id,
        title: t.title,
        artistName: t.artistName,
        coverUrl: t.coverUrl,
        streamUrl: t.streamUrl,
        recordingMbid: t.recordingMbid ?? undefined,
        albumMbid: t.albumMbid,
        durationMs: t.durationMs ?? undefined,
      })),
    [items],
  );

  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <History className="h-4 w-4 text-muted-foreground" />
          Continue playing
        </h2>
      </header>
      <ol className="flex gap-4 overflow-x-auto pb-2">
        {items.map((t, idx) => {
          const isActive = player.isCurrent(t.id);
          const pct = progressPercent(t.positionMs, t.positionDurationMs);
          return (
            <li key={t.trackKey} className="w-36 shrink-0 sm:w-40">
              <button
                type="button"
                onClick={() =>
                  isActive ? player.toggle() : player.playQueue(queue, idx)
                }
                aria-label={
                  isActive && player.state === "playing"
                    ? `Pause ${t.title}`
                    : `Resume ${t.title} by ${t.artistName}`
                }
                className="group flex w-full flex-col gap-2 rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="relative aspect-square overflow-hidden rounded-xl bg-surface-2">
                  {t.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.coverUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                      <Disc3 className="h-1/3 w-1/3" />
                    </div>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center transition-colors group-hover:bg-black/30">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-pastel-pink text-ink opacity-0 transition-opacity group-hover:opacity-100">
                      {isActive && player.state === "loading" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : isActive && player.state === "playing" ? (
                        <Pause className="h-4 w-4" fill="currentColor" />
                      ) : (
                        <Play
                          className="h-4 w-4 translate-x-px"
                          fill="currentColor"
                        />
                      )}
                    </span>
                  </div>
                  {/* Thin progress bar pinned to the bottom of the cover. */}
                  <div className="absolute inset-x-0 bottom-0 h-1 bg-black/25">
                    <div
                      className="h-full bg-pastel-pink"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <div className="space-y-0.5">
                  <p
                    className="truncate text-sm font-medium leading-snug"
                    title={t.title}
                  >
                    {t.title}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.artistName} ·{" "}
                    {formatTimeLeft(t.positionMs, t.positionDurationMs)} left
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function formatTimeLeft(positionMs: number, durationMs: number): string {
  const leftMs = Math.max(0, durationMs - positionMs);
  const total = Math.round(leftMs / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
