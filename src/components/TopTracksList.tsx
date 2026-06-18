"use client";

import { Loader2, Pause, Play } from "lucide-react";
import { usePreviewPlayer } from "@/components/PreviewPlayer";
import { YouTubeButton } from "@/components/YouTubeButton";
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
