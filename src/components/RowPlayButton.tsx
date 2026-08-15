"use client";

import { Loader2, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The row play button — styleguide § Play buttons, "1 · Row play": a ghost disc
 * that turns pink on hover. Never bordered, and never filled pink at rest; the
 * filled disc belongs to cover overlays and the player bar, and the labelled
 * pill belongs to page heroes.
 *
 * Every track row in the app renders this. Reach for it instead of hand-rolling
 * a button — writing the classes per row is exactly how the app ended up with
 * three different row play buttons (ghost, bordered, filled) at the same time.
 */
export function RowPlayButton({
  playable = true,
  playing = false,
  loading = false,
  label,
  onClick,
  className,
}: {
  /** False greys the button out and blocks the click (no preview, dead file). */
  playable?: boolean;
  playing?: boolean;
  /** Buffering — shows the spinner instead of the play/pause glyph. */
  loading?: boolean;
  /** Full aria-label, e.g. "Play", "Pause preview", "Track failed to load". */
  label: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!playable}
      aria-label={label}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition-colors",
        playable
          ? "hover:bg-pastel-pink hover:text-ink"
          : "cursor-not-allowed text-muted-foreground/40",
        className,
      )}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : playing ? (
        <Pause className="h-4 w-4" />
      ) : (
        <Play className="h-4 w-4" />
      )}
    </button>
  );
}
