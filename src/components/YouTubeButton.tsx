"use client";

import { Loader2, MonitorPlay, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { resolveYouTubeVideoAction } from "@/lib/actions/youtube";
import { usePreviewPlayer } from "@/components/PreviewPlayer";
import { cn } from "@/lib/utils";

type Props = {
  artistName: string;
  trackTitle: string;
  /** Compact icon-only button used inside dense track rows. */
  variant?: "icon" | "default";
};

export function YouTubeButton({ artistName, trackTitle, variant = "icon" }: Props) {
  const [loading, setLoading] = useState(false);
  const [videoId, setVideoId] = useState<string | null>(null);
  const player = usePreviewPlayer();

  // Avoid stomping a successful resolve with a stale subsequent click.
  const reqIdRef = useRef(0);

  const open = useCallback(async () => {
    if (loading) return;
    // Pause any Deezer 30s preview so the user isn't hearing two things at once
    // when the YouTube embed starts.
    if (player.state === "playing") player.toggle();

    const reqId = ++reqIdRef.current;
    setLoading(true);
    try {
      const result = await resolveYouTubeVideoAction({ artistName, trackTitle });
      if (reqId !== reqIdRef.current) return;
      if (result.ok) {
        setVideoId(result.videoId);
      } else {
        // Fallback path covers no-key and not-found alike — drop the user on
        // a YouTube search so they still have somewhere to go.
        const q = encodeURIComponent(`${artistName} ${trackTitle}`);
        window.open(
          `https://www.youtube.com/results?search_query=${q}`,
          "_blank",
          "noopener,noreferrer",
        );
      }
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [artistName, trackTitle, loading, player]);

  const close = useCallback(() => setVideoId(null), []);

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={loading}
        aria-label={`Watch "${trackTitle}" on YouTube`}
        title="Watch on YouTube"
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50",
          variant === "icon" ? "h-8 w-8" : "h-9 gap-1.5 px-3 text-sm",
        )}
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <MonitorPlay className="h-4 w-4" />
        )}
        {variant === "default" && !loading && <span>YouTube</span>}
      </button>
      {videoId && (
        <YouTubeModal
          videoId={videoId}
          artistName={artistName}
          trackTitle={trackTitle}
          onClose={close}
        />
      )}
    </>
  );
}

function YouTubeModal({
  videoId,
  artistName,
  trackTitle,
  onClose,
}: {
  videoId: string;
  artistName: string;
  trackTitle: string;
  onClose: () => void;
}) {
  // ESC to close, plus body-scroll lock so the page underneath doesn't drift
  // while the iframe is mounted.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // youtube-nocookie spares us tracking cookies on first frame; autoplay=1
  // matches the user's intent (they explicitly clicked "watch"), and rel=0
  // keeps the end-card recommendations to the same channel.
  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(
    videoId,
  )}?autoplay=1&rel=0&modestbranding=1&playsinline=1`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`YouTube player: ${trackTitle} by ${artistName}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={trackTitle}>
              {trackTitle}
            </p>
            <p
              className="truncate text-xs text-muted-foreground"
              title={artistName}
            >
              {artistName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close YouTube player"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="relative w-full overflow-hidden rounded-xl border-2 border-ink bg-black">
          <div className="relative pb-[56.25%]">
            <iframe
              src={src}
              title={`${trackTitle} by ${artistName}`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              className="absolute inset-0 h-full w-full"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
