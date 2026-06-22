"use client";

import { Check, ChevronRight, Disc3, Download, Heart, Loader2, Pause, Play, X } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { usePreviewPlayer } from "@/components/PreviewPlayer";
import { useTrackMenu } from "@/components/TrackMenu";
import { requestDiscoveryTrackAction } from "@/app/discover/actions";
import { toggleTrackLikeAction } from "@/lib/actions/likes";
import type { DiscoveryTrack } from "@/lib/deezer";
import { cn } from "@/lib/utils";

/**
 * A discover shelf of individual songs as large album-cover cards in a
 * horizontal scroller (mirrors DiscoveryRow). Each card hover-reveals a play
 * button for the 30s preview and a download button that resolves the song to
 * MusicBrainz on click (server action), so the card owns its idle → resolving →
 * done/error state. Renders nothing when empty.
 */
export function DiscoveryTrackList({
  title,
  tracks,
  href,
  layout = "shelf",
}: {
  title: string;
  tracks: DiscoveryTrack[];
  /** When set, renders a "See more" link to a full page of this shelf. */
  href?: string;
  /** "shelf" = horizontal scroller (homepage); "grid" = full-page wrapping rows. */
  layout?: "shelf" | "grid";
}) {
  if (tracks.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-medium">{title}</h2>
        {href && (
          <Link
            href={href}
            className="inline-flex shrink-0 items-center gap-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            See more
            <ChevronRight className="h-4 w-4" />
          </Link>
        )}
      </div>
      {layout === "grid" ? (
        <ul className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
          {tracks.map((track, i) => (
            <li key={`${i}-${track.title}-${track.artistName}`}>
              <DiscoveryTrackCard track={track} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 md:-mx-6 md:px-6">
          <ul className="flex gap-4 pb-2">
            {tracks.map((track, i) => (
              <li
                key={`${i}-${track.title}-${track.artistName}`}
                className="w-36 shrink-0 sm:w-40"
              >
                <DiscoveryTrackCard track={track} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

type DownloadState = "idle" | "resolving" | "done" | "error";

function DiscoveryTrackCard({ track }: { track: DiscoveryTrack }) {
  const player = usePreviewPlayer();
  const { openTrackMenu } = useTrackMenu();
  const [state, setState] = useState<DownloadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const playable = !!track.previewUrl;
  const isActive = playable && player.isCurrent(track.previewUrl!);
  const isPlaying = isActive && player.state === "playing";
  const isLoading = isActive && player.state === "loading";

  const togglePreview = () => {
    if (!track.previewUrl) return;
    player.play({
      id: track.previewUrl,
      title: track.title,
      artistName: track.artistName,
      coverUrl: track.coverUrl,
      previewUrl: track.previewUrl,
      // No MB ids for a Deezer preview; the bar resolves it on like via the
      // album title (with title + artist).
      likeSeed: {
        recordingMbid: null,
        albumMbid: null,
        albumPosition: null,
        albumTitle: track.albumTitle,
      },
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
    <div
      className="flex flex-col gap-2"
      onContextMenu={(e) =>
        openTrackMenu(e, {
          title: track.title,
          artistName: track.artistName,
        })
      }
    >
      <div
        className={cn(
          "group relative aspect-square overflow-hidden rounded-md bg-secondary",
          isActive && "ring-2 ring-foreground",
        )}
      >
        {track.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={track.coverUrl}
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

        {/* Preview play / pause — fills the cover; surfaces on hover or when active. */}
        <button
          type="button"
          onClick={togglePreview}
          disabled={!playable}
          aria-label={
            playable
              ? isPlaying
                ? "Pause preview"
                : "Play preview"
              : "No preview available"
          }
          className={cn(
            "absolute inset-0 flex items-center justify-center bg-black/30 text-white transition-opacity",
            playable
              ? isActive
                ? "opacity-100"
                : "opacity-0 group-hover:opacity-100"
              : "pointer-events-none opacity-0",
          )}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-foreground text-background shadow-lg">
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-5 w-5 fill-current" />
            ) : (
              <Play className="h-5 w-5 fill-current" />
            )}
          </span>
        </button>

        {/* Like (top-left) — resolves the preview to MusicBrainz and pulls it
            into the library on like. */}
        <CardLikeButton track={track} />

        {/* Added badge (bottom-left), mirrors InLibraryBadge. */}
        {state === "done" && (
          <span
            className="absolute bottom-1.5 left-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/90 text-white shadow-sm"
            title="Added to your library"
            aria-label="Added to your library"
          >
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}

        {/* Download (not-yet-added) — top-right. */}
        {state !== "done" && (
          <button
            type="button"
            onClick={download}
            disabled={state === "resolving"}
            title={state === "error" ? (error ?? "Try again") : "Download track"}
            aria-label={
              state === "error" ? (error ?? "Download failed, retry") : "Download track"
            }
            className={cn(
              "absolute top-1.5 right-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900/80 text-white shadow-sm transition-colors hover:bg-zinc-900 disabled:opacity-70",
              state === "error" && "bg-destructive/90 hover:bg-destructive",
            )}
          >
            {state === "resolving" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : state === "error" ? (
              <X className="h-3.5 w-3.5" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
          </button>
        )}
      </div>

      <div className="space-y-0.5">
        <p className="truncate text-sm font-medium leading-snug" title={track.title}>
          {track.title}
        </p>
        <p className="truncate text-xs text-muted-foreground" title={track.artistName}>
          {track.artistName}
        </p>
      </div>
    </div>
  );
}

/**
 * Heart overlay for a discover card. The song has no MusicBrainz ids yet, so a
 * like resolves it on the server and (because a like means "I want this") pulls
 * it into the library. Starts unliked — a previously-liked preview re-syncs to
 * its true state from the server's reply on the first click.
 */
function CardLikeButton({ track }: { track: DiscoveryTrack }) {
  const [liked, setLiked] = useState(false);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    const next = !liked;
    setLiked(next);
    startTransition(async () => {
      const res = await toggleTrackLikeAction({
        title: track.title,
        artistName: track.artistName,
        albumTitle: track.albumTitle,
        coverUrl: track.coverUrl,
        durationMs: track.durationMs,
      });
      if (!res.ok) {
        setLiked(!next);
        return;
      }
      setLiked(res.liked);
    });
  };

  return (
    <button
      type="button"
      onClick={submit}
      aria-pressed={liked}
      aria-label={liked ? `Unlike ${track.title}` : `Like ${track.title}`}
      className={cn(
        "absolute top-1.5 left-1.5 inline-flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900/80 shadow-sm transition-colors hover:bg-zinc-900 disabled:opacity-70",
        liked ? "text-rose-400" : "text-white",
      )}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Heart
          className="h-3.5 w-3.5"
          fill={liked ? "currentColor" : "none"}
          strokeWidth={liked ? 0 : 2}
        />
      )}
    </button>
  );
}
