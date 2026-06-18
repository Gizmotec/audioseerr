"use client";

import { Heart, Loader2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toggleTrackLikeAction, type TrackLikeInput } from "@/lib/actions/likes";
import { cn } from "@/lib/utils";

type Props = {
  track: TrackLikeInput;
  initialLiked: boolean;
  variant?: "icon" | "full";
  className?: string;
};

/**
 * The heart shown on every song row. Liking a song means "I want this" — the
 * server also pulls it into the library if it isn't owned yet (idempotent). For
 * library/playlist rows the toggle is instant; for Deezer-only preview rows the
 * server resolves the track to MusicBrainz first, so the spinner may linger a
 * beat and a miss flips the heart back with an error tooltip.
 */
export function TrackLikeButton({
  track,
  initialLiked,
  variant = "icon",
  className,
}: Props) {
  const [liked, setLiked] = useState(initialLiked);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.MouseEvent) => {
    // Rows often nest the heart next to other controls; never let the click
    // bubble up to a row-level play/select handler.
    e.preventDefault();
    e.stopPropagation();
    if (pending) return;
    const next = !liked;
    setLiked(next);
    setError(null);
    startTransition(async () => {
      const result = await toggleTrackLikeAction(track);
      if (!result.ok) {
        setLiked(!next);
        setError(result.error);
        return;
      }
      setLiked(result.liked);
    });
  };

  const labelBase = liked ? "Unlike" : "Like";
  const title = error ?? `${labelBase} “${track.title}”`;

  if (variant === "full") {
    return (
      <button
        type="button"
        onClick={submit}
        aria-pressed={liked}
        aria-label={`${labelBase} ${track.title}`}
        title={title}
        className={cn(
          "inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors",
          liked
            ? "border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/15"
            : "border-border bg-background text-foreground hover:bg-muted",
          error && "border-destructive/50 text-destructive",
          className,
        )}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Heart
            className="h-4 w-4"
            fill={liked ? "currentColor" : "none"}
            strokeWidth={liked ? 0 : 2}
          />
        )}
        {liked ? "Liked" : "Like"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={submit}
      aria-pressed={liked}
      aria-label={`${labelBase} ${track.title}`}
      title={title}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
        liked
          ? "text-rose-500 hover:text-rose-400"
          : "text-muted-foreground/60 hover:text-foreground",
        error && "text-destructive hover:text-destructive",
        className,
      )}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Heart
          className="h-4 w-4"
          fill={liked ? "currentColor" : "none"}
          strokeWidth={liked ? 0 : 2}
        />
      )}
    </button>
  );
}
