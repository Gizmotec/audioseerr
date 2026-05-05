"use client";

import { Loader2, Shuffle } from "lucide-react";
import { useState, useTransition } from "react";
import { type QueueItem, usePreviewPlayer } from "@/components/PreviewPlayer";
import { listAvailablePlaylistTracksAction } from "@/lib/actions/playlists";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary";

export function ShuffleLibraryButton({
  className,
  variant = "secondary",
}: {
  className?: string;
  variant?: Variant;
}) {
  const player = usePreviewPlayer();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const shuffleLibrary = () => {
    setError(null);
    startTransition(async () => {
      const res = await listAvailablePlaylistTracksAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }

      const queue = shuffle(
        res.tracks.map<QueueItem>((track) => ({
          id: `library:${track.trackFileId}`,
          title: track.title,
          artistName: track.artistName,
          coverUrl: track.coverUrl ?? null,
          streamUrl: `/api/stream/${track.trackFileId}`,
        })),
      );

      if (queue.length === 0) {
        setError("No downloaded tracks found.");
        return;
      }

      player.playQueue(queue, 0);
    });
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={shuffleLibrary}
        disabled={pending}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-opacity disabled:opacity-50",
          variant === "primary"
            ? "bg-primary text-primary-foreground hover:opacity-90"
            : "border border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground",
          className,
        )}
        title={error ?? "Shuffle all downloaded tracks"}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Shuffle className="h-4 w-4" />
        )}
        Shuffle library
      </button>
      {error && (
        <span
          role="alert"
          className="absolute right-0 top-full z-20 mt-2 w-56 rounded-md border border-destructive/40 bg-background px-3 py-2 text-xs text-destructive shadow-lg"
        >
          {error}
        </span>
      )}
    </span>
  );
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
