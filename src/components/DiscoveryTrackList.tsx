"use client";

import {
  CheckCircle2,
  Disc3,
  Download,
  Loader2,
  Pause,
  Play,
  X,
} from "lucide-react";
import { useState, useTransition } from "react";
import { usePreviewPlayer } from "@/components/PreviewPlayer";
import { requestDiscoveryTrackAction } from "@/app/discover/actions";
import type { DiscoveryTrack } from "@/lib/deezer";
import { cn } from "@/lib/utils";

/**
 * A discover shelf of individual songs: 30s preview + inline download. Each
 * track is resolved to MusicBrainz on download (server action), so the row owns
 * its own idle → resolving → done/error state. Renders nothing when empty.
 */
export function DiscoveryTrackList({
  title,
  tracks,
}: {
  title: string;
  tracks: DiscoveryTrack[];
}) {
  if (tracks.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-medium">{title}</h2>
      <ol className="divide-y divide-border/50">
        {tracks.map((track, i) => (
          <DiscoveryTrackRow key={`${i}-${track.title}-${track.artistName}`} track={track} />
        ))}
      </ol>
    </section>
  );
}

type DownloadState = "idle" | "resolving" | "done" | "error";

function DiscoveryTrackRow({ track }: { track: DiscoveryTrack }) {
  const player = usePreviewPlayer();
  const [state, setState] = useState<DownloadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const playable = !!track.previewUrl;
  const isActive = playable && player.isCurrent(track.previewUrl!);

  const togglePreview = () => {
    if (!track.previewUrl) return;
    player.play({
      id: track.previewUrl,
      title: track.title,
      artistName: track.artistName,
      coverUrl: track.coverUrl,
      previewUrl: track.previewUrl,
    });
  };

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

  return (
    <li
      className={cn(
        "flex items-center gap-3 py-2.5",
        isActive && "bg-secondary/40",
      )}
    >
      <button
        type="button"
        onClick={togglePreview}
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
              ? "Pause preview"
              : "Play preview"
            : "No preview available"
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

      <DownloadControl state={state} error={error} onClick={download} />
    </li>
  );
}

function DownloadControl({
  state,
  error,
  onClick,
}: {
  state: DownloadState;
  error: string | null;
  onClick: () => void;
}) {
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
        onClick={onClick}
        disabled={state === "resolving"}
        title={state === "error" ? (error ?? "Try again") : "Download track"}
        aria-label={state === "error" ? (error ?? "Download failed, retry") : "Download track"}
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
