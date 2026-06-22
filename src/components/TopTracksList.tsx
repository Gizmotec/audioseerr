"use client";

import { Check, Download, Loader2, Pause, Play, X } from "lucide-react";
import { useState, useTransition } from "react";
import { usePreviewPlayer } from "@/components/PreviewPlayer";
import { useTrackMenu } from "@/components/TrackMenu";
import { YouTubeButton } from "@/components/YouTubeButton";
import { requestDiscoveryTrackAction } from "@/app/discover/actions";
import type { DeezerArtistTopTrack } from "@/lib/deezer";

export type ArtistTopTrack = DeezerArtistTopTrack & {
  listeners: number | null;
  playcount: number | null;
};

/**
 * An artist's popular tracks with inline 30s preview playback. Shared by the
 * artist page and the artist-aware search results so both stay identical.
 */
export function TopTracksList({
  artistName,
  artistImageUrl,
  topTracks,
  heading = "Top tracks",
}: {
  artistName: string;
  artistImageUrl: string | null;
  topTracks: ArtistTopTrack[];
  heading?: string;
}) {
  const player = usePreviewPlayer();
  const { openTrackMenu } = useTrackMenu();

  const togglePreview = (track: DeezerArtistTopTrack) => {
    if (!track.previewUrl) return;
    player.play({
      id: track.previewUrl,
      title: track.title,
      artistName,
      coverUrl: track.albumCover ?? artistImageUrl,
      previewUrl: track.previewUrl,
    });
  };

  if (topTracks.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
        {heading}
      </h2>
      <ol className="divide-y divide-border/50">
        {topTracks.map((t, i) => {
          const playable = !!t.previewUrl;
          const isActive = playable && player.isCurrent(t.previewUrl!);
          return (
            <li
              key={`${i}-${t.title}`}
              onContextMenu={(e) =>
                openTrackMenu(e, { title: t.title, artistName })
              }
              className={`flex items-center gap-4 py-2.5 ${
                isActive ? "bg-secondary/40" : ""
              }`}
            >
              <button
                type="button"
                onClick={() => togglePreview(t)}
                disabled={!playable}
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                  playable
                    ? "border-border hover:border-foreground hover:text-foreground"
                    : "border-border/50 text-muted-foreground/40"
                }`}
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
              <span className="w-6 text-right text-xs text-muted-foreground">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate" title={t.title}>
                  {t.title}
                </p>
                {t.albumTitle && (
                  <p
                    className="truncate text-xs text-muted-foreground"
                    title={t.albumTitle}
                  >
                    {t.albumTitle}
                  </p>
                )}
              </div>
              {t.listeners !== null && t.listeners > 0 && (
                <span
                  className="hidden text-xs text-muted-foreground tabular-nums sm:inline"
                  title={`${t.listeners.toLocaleString()} Last.fm listeners`}
                >
                  {formatListenerCount(t.listeners)}
                </span>
              )}
              <YouTubeButton artistName={artistName} trackTitle={t.title} />
              <DownloadTrackButton
                title={t.title}
                artistName={artistName}
                albumTitle={t.albumTitle}
                coverUrl={t.albumCover ?? artistImageUrl}
              />
              <span className="text-xs text-muted-foreground tabular-nums">
                {formatDuration(t.durationMs)}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

type DownloadState = "idle" | "resolving" | "done" | "error";

/** Request a single Deezer top track — resolves title+artist to MusicBrainz on
 *  the server (same path as discover cards), owning its own idle→done state. */
function DownloadTrackButton({
  title,
  artistName,
  albumTitle,
  coverUrl,
}: {
  title: string;
  artistName: string;
  albumTitle: string | null;
  coverUrl: string | null;
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
        title,
        artistName,
        albumTitle,
        coverUrl,
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
    <button
      type="button"
      onClick={download}
      disabled={state === "resolving" || state === "done"}
      title={
        state === "done"
          ? "Added to your library"
          : state === "error"
            ? (error ?? "Try again")
            : "Download track"
      }
      aria-label={
        state === "done"
          ? "Added to your library"
          : state === "error"
            ? (error ?? "Download failed, retry")
            : "Download track"
      }
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground disabled:cursor-default ${
        state === "done"
          ? "text-emerald-400"
          : state === "error"
            ? "text-destructive"
            : ""
      }`}
    >
      {state === "resolving" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : state === "done" ? (
        <Check className="h-4 w-4" />
      ) : state === "error" ? (
        <X className="h-4 w-4" />
      ) : (
        <Download className="h-4 w-4" />
      )}
    </button>
  );
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  const seconds = Math.round(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatListenerCount(n: number): string {
  if (n >= 1_000_000) {
    const v = n / 1_000_000;
    return v >= 10 ? `${Math.round(v)}M` : `${v.toFixed(1)}M`;
  }
  if (n >= 1_000) {
    const v = n / 1_000;
    return v >= 10 ? `${Math.round(v)}K` : `${v.toFixed(1)}K`;
  }
  return n.toLocaleString();
}
