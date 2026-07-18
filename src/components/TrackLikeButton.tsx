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
  /** Fired after the server confirms the new like state. */
  onToggled?: (liked: boolean) => void;
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
  onToggled,
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
      onToggled?.(result.liked);
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
          "inline-flex h-9 items-center gap-2 rounded-full border-2 px-4 text-sm font-bold transition-colors",
          liked
            ? "border-transparent bg-pastel-pink text-ink hover:bg-pastel-pink/80"
            : "border-transparent bg-surface-2 text-foreground hover:bg-accent",
          error && "border-destructive text-destructive",
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
          ? "text-pastel-pink hover:text-pastel-pink/80"
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
