"use client";

import {
  CheckCircle2,
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
import { requestDiscoveryTrackAction } from "@/app/discover/actions";
import { trackLikeTargetId } from "@/lib/likeKeys";
import type { MixTrack } from "@/lib/mixes";
import { cn } from "@/lib/utils";

/**
 * Full mix view. The whole mix is one playback queue: library tracks stream in
 * full (and scrobble), new tracks play their 30s preview (no scrobble) and carry
 * a Download button wired to the existing discovery request flow. Tracks without
 * any playable URL are skipped by the player when auto-advancing.
 */
export function MixDetail({
  tracks,
  likedTrackIds = [],
}: {
  tracks: MixTrack[];
  likedTrackIds?: string[];
}) {
  const player = usePreviewPlayer();
  const likedSet = useMemo(() => new Set(likedTrackIds), [likedTrackIds]);

  const queue = useMemo<QueueItem[]>(
    () =>
      tracks.map((t, i) => ({
        id: `mix-${i}`,
        title: t.title,
        artistName: t.artistName,
        coverUrl: t.coverUrl,
        streamUrl:
          t.kind === "library"
            ? `/api/stream/local/${t.downloadedTrackId}`
            : t.previewUrl,
        // Only library streams scrobble; previews are 30s auditions.
        recordingMbid:
          t.kind === "library"
            ? (t.recordingMbid ?? `local:${t.downloadedTrackId}`)
            : undefined,
        albumMbid: t.kind === "library" ? t.albumMbid : undefined,
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
      })),
    [tracks],
  );

  const playableCount = queue.filter((q) => q.streamUrl).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => player.playQueue(queue, 0)}
          disabled={playableCount === 0}
          className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Play className="h-4 w-4 fill-current" />
          Play all
        </button>
        <span className="text-sm text-muted-foreground">
          {tracks.length} tracks
        </span>
      </div>

      <ol className="divide-y divide-border/50">
        {tracks.map((track, i) => (
          <MixRow
            key={`mix-${i}`}
            track={track}
            queueId={`mix-${i}`}
            onPlay={() => player.playQueue(queue, i)}
            playable={!!queue[i].streamUrl}
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
  initialLiked,
}: {
  track: MixTrack;
  queueId: string;
  onPlay: () => void;
  playable: boolean;
  initialLiked: boolean;
}) {
  const player = usePreviewPlayer();
  const isActive = player.isCurrent(queueId);

  return (
    <li
      className={cn(
        "flex items-center gap-3 py-2.5",
        isActive && "bg-secondary/40",
      )}
    >
      <button
        type="button"
        onClick={onPlay}
        disabled={!playable}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
          playable
            ? "border-border hover:border-foreground hover:text-foreground"
            : "border-border/50 text-muted-foreground/40",
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

      <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-secondary">
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
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground/70"
          title="In your library"
          aria-label="In your library"
        >
          <Library className="h-4 w-4" />
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
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-emerald-500"
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
          "flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60",
          state === "error" && "text-destructive hover:text-destructive",
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
