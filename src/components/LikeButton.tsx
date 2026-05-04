"use client";

import { Heart } from "lucide-react";
import { useState, useTransition } from "react";
import { toggleLikeAction } from "@/lib/actions/likes";
import type { LikePayload } from "@/lib/likes";
import { cn } from "@/lib/utils";

type Props = {
  payload: LikePayload;
  initialLiked: boolean;
  variant?: "full" | "icon";
  /** Only used by the "full" variant to override the default label. */
  label?: { liked: string; unliked: string };
};

const DEFAULT_LABELS: Record<
  "TRACK" | "ALBUM" | "ARTIST",
  { liked: string; unliked: string }
> = {
  TRACK: { liked: "Liked", unliked: "Like" },
  ALBUM: { liked: "Liked", unliked: "Like album" },
  ARTIST: { liked: "Liked", unliked: "Like artist" },
};

export function LikeButton({ payload, initialLiked, variant = "full", label }: Props) {
  const [liked, setLiked] = useState(initialLiked);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (pending) return;
    // Optimistic flip; revert on failure.
    const next = !liked;
    setLiked(next);
    startTransition(async () => {
      const result = await toggleLikeAction(payload);
      if (!result.ok) {
        setLiked(!next);
        return;
      }
      setLiked(result.liked);
    });
  };

  if (variant === "icon") {
    const aria = liked ? "Unlike" : "Like";
    return (
      <button
        type="button"
        onClick={submit}
        aria-pressed={liked}
        aria-label={`${aria} ${payload.title}`}
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors",
          liked
            ? "text-rose-500 hover:text-rose-400"
            : "text-muted-foreground/60 hover:text-foreground",
        )}
      >
        <Heart
          className="h-4 w-4"
          fill={liked ? "currentColor" : "none"}
          strokeWidth={liked ? 0 : 2}
        />
      </button>
    );
  }

  const labels = label ?? DEFAULT_LABELS[payload.targetType];
  return (
    <button
      type="button"
      onClick={submit}
      aria-pressed={liked}
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition-colors",
        liked
          ? "border-rose-500/40 bg-rose-500/10 text-rose-400 hover:bg-rose-500/15"
          : "border-border bg-background text-foreground hover:bg-muted",
      )}
    >
      <Heart
        className="h-4 w-4"
        fill={liked ? "currentColor" : "none"}
        strokeWidth={liked ? 0 : 2}
      />
      {liked ? labels.liked : labels.unliked}
    </button>
  );
}
