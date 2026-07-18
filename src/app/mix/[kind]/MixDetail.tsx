"use client";

import {
  CheckCircle2,
  Clock,
  Disc3,
  Download,
  Library,
  Loader2,
  Pause,
  Play,
  X,
} from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { usePreviewPlayer, type QueueItem } from "@/components/PreviewPlayer";
import { TrackLikeButton } from "@/components/TrackLikeButton";
import { useTrackMenu } from "@/components/TrackMenu";
import { requestDiscoveryTrackAction } from "@/app/discover/actions";
import { trackLikeTargetId } from "@/lib/likeKeys";
import type { MixTrack } from "@/lib/mixes";
import { cn } from "@/lib/utils";

/**
 * Per-index info for "new" mix picks that have been pre-downloaded into temp
 * storage — they play full-length (and scrobble) instead of a 30s preview.
 */
export type PreloadedMixTracks = Record<
  number,
  { downloadedTrackId: string; recordingMbid: string | null; albumMbid: string }
>;

/**
 * Full mix view. The whole mix is one playback queue: library tracks stream in
 * full (and scrobble), new tracks play their 30s preview (no scrobble) and carry
 * a Download button wired to the existing discovery request flow. A "new" track
 * that's been pre-downloaded (temp) plays full instead and shows a Temporary
 * marker. Tracks without any playable URL are skipped on auto-advance.
 */
export function MixDetail({
  tracks,
  likedTrackIds = [],
  preloaded = {},
}: {
  tracks: MixTrack[];
  likedTrackIds?: string[];
  preloaded?: PreloadedMixTracks;
}) {
  const player = usePreviewPlayer();
  const likedSet = useMemo(() => new Set(likedTrackIds), [likedTrackIds]);

  const queue = useMemo<QueueItem[]>(
    () =>
      tracks.map((t, i) => {
        // A pre-downloaded "new" pick streams full off its temp file.
        const pre = t.kind === "new" ? preloaded[i] : undefined;
        return {
          id: `mix-${i}`,
          title: t.title,
          artistName: t.artistName,
          coverUrl: t.coverUrl,
          streamUrl:
            t.kind === "library"
              ? `/api/stream/local/${t.downloadedTrackId}`
              : pre
                ? `/api/stream/local/${pre.downloadedTrackId}`
                : t.previewUrl,
          // Full streams (library or pre-downloaded) scrobble; previews don't.
          recordingMbid:
            t.kind === "library"
              ? (t.recordingMbid ?? `local:${t.downloadedTrackId}`)
              : pre
                ? (pre.recordingMbid ?? `local:${pre.downloadedTrackId}`)
                : undefined,
          albumMbid:
            t.kind === "library" ? t.albumMbid : pre ? pre.albumMbid : undefined,
          durationMs: t.durationMs ?? undefined,
          likeSeed:
            t.kind === "library"
              ? {
                  recordingMbid: t.recordingMbid,
                  albumMbid: t.albumMbid,
                  albumPosition: t.albumPosition,
                  albumTitle: t.albumTitle,
                }
              : {
                  recordingMbid: null,
                  albumMbid: null,
                  albumPosition: null,
                  albumTitle: t.albumTitle,
                },
        };
      }),
    [tracks, preloaded],
  );

  const playableCount = queue.filter((q) => q.streamUrl).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => player.playQueue(queue, 0)}
          disabled={playableCount === 0}
          className="inline-flex h-10 items-center gap-2 rounded-full border-2 border-ink bg-pastel-pink px-5 text-sm font-bold text-ink transition-colors hover:bg-pastel-pink/80 disabled:opacity-40"
        >
          <Play className="h-4 w-4 fill-current" />
          Play all
        </button>
        <span className="text-sm text-muted-foreground">
          {tracks.length} tracks
        </span>
      </div>

      <ol className="flex flex-col gap-1">
        {tracks.map((track, i) => (
          <MixRow
            key={`mix-${i}`}
            track={track}
            queueId={`mix-${i}`}
            onPlay={() => player.playQueue(queue, i)}
            playable={!!queue[i].streamUrl}
            isPreloaded={track.kind === "new" && !!preloaded[i]}
            initialLiked={
              track.kind === "library"
                ? likedSet.has(
                    trackLikeTargetId(
                      track.recordingMbid,
                      track.albumMbid,
                      track.albumPosition,
                    ) ?? "",
                  )
                : false
            }
          />
        ))}
      </ol>
    </div>
  );
}

type DownloadState = "idle" | "resolving" | "done" | "error";

function MixRow({
  track,
  queueId,
  onPlay,
  playable,
  isPreloaded,
  initialLiked,
}: {
  track: MixTrack;
  queueId: string;
  onPlay: () => void;
  playable: boolean;
  isPreloaded: boolean;
  initialLiked: boolean;
}) {
  const player = usePreviewPlayer();
  const { openTrackMenu } = useTrackMenu();
  const isActive = player.isCurrent(queueId);

  return (
    <li
      onContextMenu={(e) =>
        openTrackMenu(e, {
          title: track.title,
          artistName: track.artistName,
          recordingMbid: track.kind === "library" ? track.recordingMbid : null,
        })
      }
      className={cn(
        "flex items-center gap-3 rounded-xl border-2 px-2 py-2.5 hover:bg-surface-2",
        isActive ? "border-ink bg-surface-2" : "border-transparent",
      )}
    >
      <button
        type="button"
        onClick={onPlay}
        disabled={!playable}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2",
          playable
            ? "border-ink bg-pastel-pink text-ink hover:bg-pastel-pink/80"
            : "border-transparent text-muted-foreground/40",
        )}
        aria-label={
          playable
            ? isActive && player.state === "playing"
              ? "Pause"
              : "Play"
            : "Not playable"
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

      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border-2 border-ink bg-secondary">
        {track.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={track.coverUrl}
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
        <p className="truncate text-sm" title={track.title}>
          {track.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {track.artistName}
          {track.albumTitle ? ` · ${track.albumTitle}` : ""}
        </p>
      </div>

      <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">
        {formatDuration(track.durationMs)}
      </span>

      <TrackLikeButton
        track={
          track.kind === "library"
            ? {
                recordingMbid: track.recordingMbid,
                albumMbid: track.albumMbid,
                albumPosition: track.albumPosition,
                title: track.title,
                artistName: track.artistName,
                albumTitle: track.albumTitle,
                coverUrl: track.coverUrl,
                durationMs: track.durationMs,
              }
            : {
                title: track.title,
                artistName: track.artistName,
                albumTitle: track.albumTitle,
                coverUrl: track.coverUrl,
                durationMs: track.durationMs,
              }
        }
        initialLiked={initialLiked}
        variant="icon"
      />

      {track.kind === "library" ? (
        <span
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-pastel-mint"
          title="In your library"
          aria-label="In your library"
        >
          <Library className="h-4 w-4" />
        </span>
      ) : isPreloaded ? (
        <span
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-pastel-yellow"
          title="Temporary — kept in your library if you like it or add it to a playlist, otherwise auto-deleted"
          aria-label="Temporary download"
        >
          <Clock className="h-4 w-4" />
        </span>
      ) : (
        <NewTrackDownload track={track} />
      )}
    </li>
  );
}

function NewTrackDownload({
  track,
}: {
  track: Extract<MixTrack, { kind: "new" }>;
}) {
  const [state, setState] = useState<DownloadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const download = () => {
    if (state === "resolving" || state === "done") return;
    setState("resolving");
    setError(null);
    startTransition(async () => {
      const res = await requestDiscoveryTrackAction({
        title: track.title,
        artistName: track.artistName,
        albumTitle: track.albumTitle,
        coverUrl: track.coverUrl,
      });
      if (res.ok) {
        setState("done");
      } else {
        setState("error");
        setError(res.error);
      }
    });
  };

  if (state === "done") {
    return (
      <span
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-pastel-mint"
        title="Added to your library"
        aria-label="Added to your library"
      >
        <CheckCircle2 className="h-4 w-4" />
      </span>
    );
  }

  return (
    <span className="relative inline-flex h-8 w-8 shrink-0 items-center justify-center">
      <button
        type="button"
        onClick={download}
        disabled={state === "resolving"}
        title={state === "error" ? (error ?? "Try again") : "Download track"}
        aria-label={
          state === "error" ? (error ?? "Download failed, retry") : "Download track"
        }
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-60",
          state === "error" && "text-pastel-red hover:text-pastel-red",
        )}
      >
        {state === "resolving" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state === "error" ? (
          <X className="h-4 w-4" />
        ) : (
          <Download className="h-4 w-4" />
        )}
      </button>
    </span>
  );
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  const seconds = Math.round(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
