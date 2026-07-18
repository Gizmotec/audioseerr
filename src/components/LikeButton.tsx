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
            ? "text-pastel-pink hover:text-pastel-pink/80"
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
        "inline-flex h-9 items-center gap-2 rounded-full border-2 border-transparent px-4 text-sm font-bold transition-colors",
        liked
          ? "bg-pastel-pink text-ink hover:bg-pastel-pink/80"
          : "bg-surface-2 text-foreground hover:bg-accent",
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
