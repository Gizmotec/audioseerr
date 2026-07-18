"use client";

import {
  Disc3,
  Heart,
  ListMusic,
  Loader2,
  Pause,
  Play,
  Shuffle,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AddToPlaylistButton,
  type PlaylistOption,
} from "@/components/AddToPlaylistButton";
import { type QueueItem, usePreviewPlayer } from "@/components/PreviewPlayer";
import { TrackLikeButton } from "@/components/TrackLikeButton";
import { useTrackMenu } from "@/components/TrackMenu";
import { cn } from "@/lib/utils";

export type InboxTrack = {
  id: string;
  /** The like key (recording MBID or synthetic `albumMbid:position`). */
  targetId: string;
  albumMbid: string;
  albumPosition: number;
  title: string;
  artistName: string;
  albumTitle: string | null;
  coverUrl: string | null;
  durationMs: number | null;
  streamUrl: string | null;
  fetching: boolean;
};

type Props = {
  tracks: InboxTrack[];
  /** Total TRACK likes, sorted or not — distinguishes "no likes" from "all sorted". */
  totalLiked: number;
  playlists: PlaylistOption[];
};

/**
 * The liked-songs inbox. Rows clear themselves the moment they're sorted into
 * a playlist (or unhearted); the next render confirms it server-side, since
 * "sorted" is derived from playlist membership rather than stored.
 */
export function LikedInbox({ tracks, totalLiked, playlists }: Props) {
  const player = usePreviewPlayer();
  const { openTrackMenu } = useTrackMenu();
  const [clearedIds, setClearedIds] = useState<Set<string>>(new Set());

  const clear = (id: string) =>
    setClearedIds((prev) =>
      prev.has(id) ? prev : new Set(prev).add(id),
    );

  const visible = useMemo(
    () => tracks.filter((t) => !clearedIds.has(t.id)),
    [tracks, clearedIds],
  );

  const playableCount = useMemo(
    () =>
      visible.filter((t) => t.streamUrl && !player.failedIds.has(t.id)).length,
    [visible, player.failedIds],
  );
  const fetchingCount = useMemo(
    () => visible.filter((t) => t.fetching && !t.streamUrl).length,
    [visible],
  );

  const queueItems = useMemo<QueueItem[]>(
    () =>
      visible.map((t) => ({
        id: t.id,
        title: t.title,
        artistName: t.artistName,
        coverUrl: t.coverUrl,
        streamUrl: t.streamUrl,
        recordingMbid: t.targetId,
        albumMbid: t.albumMbid,
        durationMs: t.durationMs ?? undefined,
        likeSeed: {
          recordingMbid: t.targetId,
          albumMbid: t.albumMbid,
          albumPosition: t.albumPosition,
          albumTitle: t.albumTitle,
        },
      })),
    [visible],
  );

  const playAll = () => {
    if (queueItems.length === 0) return;
    player.playQueue(queueItems, 0);
  };

  const shuffleAll = () => {
    const playable = queueItems.filter(
      (item) => item.streamUrl && !player.failedIds.has(item.id),
    );
    if (playable.length === 0) return;
    player.playQueue(shuffle(playable), 0);
  };

  return (
    <div className="mt-6 flex flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex items-end gap-5">
          <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-rose-400 via-rose-500 to-rose-700 text-white shadow-sm">
            <Heart className="h-14 w-14" fill="currentColor" strokeWidth={0} />
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Inbox
            </p>
            <h1 className="text-3xl font-semibold leading-tight md:text-5xl">
              Liked Songs
            </h1>
            <p className="text-sm text-muted-foreground">
              {visible.length} to sort
              {fetchingCount > 0 && (
                <>
                  {" · "}
                  <span className="text-sky-400/80">
                    {fetchingCount} downloading
                  </span>
                </>
              )}
            </p>
            <p className="max-w-md text-sm text-muted-foreground/80">
              Hearted tracks park here until you sort them into a playlist.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={playAll}
            disabled={playableCount === 0}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-sm font-semibold text-background transition-opacity disabled:opacity-40 hover:opacity-90"
          >
            <Play className="h-4 w-4" fill="currentColor" />
            Play
          </button>
          <button
            type="button"
            onClick={shuffleAll}
            disabled={playableCount === 0}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-foreground transition-colors disabled:opacity-40 hover:border-foreground/40 hover:bg-secondary"
          >
            <Shuffle className="h-4 w-4" />
            Shuffle
          </button>
        </div>
      </header>

      {visible.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          <ListMusic className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" />
          {totalLiked === 0 ? (
            <>
              <p>No liked songs yet.</p>
              <p className="mt-1">
                Heart tracks anywhere and they&apos;ll park here until you sort
                them into a playlist.
              </p>
            </>
          ) : (
            <>
              <p>All sorted.</p>
              <p className="mt-1">
                Everything you&apos;ve hearted is in a playlist. New likes will
                land here.
              </p>
            </>
          )}
        </div>
      ) : (
        <ol className="divide-y divide-border/50">
          {visible.map((t, idx) => {
            const failedAtPlay = player.failedIds.has(t.id);
            const isActive =
              !!t.streamUrl && !failedAtPlay && player.isCurrent(t.id);
            const playable = !!t.streamUrl && !failedAtPlay;
            const fetching = !!t.fetching && !t.streamUrl && !failedAtPlay;
            const unavailableReason = fetching
              ? null
              : !t.streamUrl
                ? "missing"
                : failedAtPlay
                  ? "errored"
                  : null;
            return (
              <li
                key={t.id}
                onContextMenu={(e) =>
                  openTrackMenu(e, {
                    title: t.title,
                    artistName: t.artistName,
                    recordingMbid: t.targetId,
                  })
                }
                className={cn(
                  "group flex items-center gap-3 py-2.5",
                  isActive && "bg-secondary/40",
                )}
              >
                <button
                  type="button"
                  onClick={() => player.playQueue(queueItems, idx)}
                  disabled={!playable}
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                    playable
                      ? "border-border hover:border-foreground hover:text-foreground"
                      : "cursor-not-allowed border-border/50 text-muted-foreground/40",
                  )}
                  aria-label={
                    playable
                      ? isActive && player.state === "playing"
                        ? "Pause"
                        : "Play"
                      : unavailableReason === "errored"
                        ? "Track failed to load"
                        : "Track unavailable"
                  }
                >
                  {isActive && player.state === "loading" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isActive && player.state === "playing" ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </button>

                <div
                  className={cn(
                    "relative h-10 w-10 shrink-0 overflow-hidden rounded bg-secondary",
                    !playable && "opacity-50",
                  )}
                >
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

                <div className={cn("min-w-0 flex-1", !playable && "opacity-50")}>
                  <p className="truncate text-sm" title={t.title}>
                    {t.title}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.albumTitle ? (
                      <>
                        {t.artistName} ·{" "}
                        <Link
                          href={{
                            pathname: `/album/${t.albumMbid}`,
                            query: { from: "liked" },
                          }}
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

                {fetching && (
                  <span
                    className="hidden shrink-0 items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-sky-400 sm:inline-flex"
                    title="Downloading from Soulseek…"
                  >
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Downloading
                  </span>
                )}

                {unavailableReason && (
                  <span
                    className={cn(
                      "hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider sm:inline",
                      unavailableReason === "errored"
                        ? "bg-rose-500/10 text-rose-400"
                        : "bg-amber-500/10 text-amber-400",
                    )}
                    title={
                      unavailableReason === "errored"
                        ? "Audioseerr couldn't load this file — it may have been moved or deleted."
                        : "No audio file is in your library for this track yet."
                    }
                  >
                    {unavailableReason === "errored"
                      ? "Failed to load"
                      : "Unavailable"}
                  </span>
                )}

                <TrackLikeButton
                  track={{
                    recordingMbid: t.targetId,
                    albumMbid: t.albumMbid,
                    albumPosition: t.albumPosition,
                    title: t.title,
                    artistName: t.artistName,
                    albumTitle: t.albumTitle,
                    coverUrl: t.coverUrl,
                    durationMs: t.durationMs,
                  }}
                  initialLiked
                  variant="icon"
                  onToggled={(liked) => {
                    if (!liked) clear(t.id);
                  }}
                />

                <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">
                  {formatDuration(t.durationMs)}
                </span>

                <AddToPlaylistButton
                  payload={{
                    recordingMbid: t.targetId,
                    trackFileId: null,
                    albumMbid: t.albumMbid,
                    albumPosition: t.albumPosition,
                    title: t.title,
                    artistName: t.artistName,
                    albumTitle: t.albumTitle,
                    coverUrl: t.coverUrl,
                    durationMs: t.durationMs,
                  }}
                  initialPlaylists={playlists}
                  onAdded={() => clear(t.id)}
                />
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  const seconds = Math.round(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
