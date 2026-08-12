"use client";

// Click feedback for links whose destination isn't ready yet.
//
// loading.tsx covers the gap once a navigation commits, but there's still a
// beat between the click and the route transition — long enough on a cold,
// data-heavy page (an artist, say) to read as a dead click. useLinkStatus
// reports the pending state of the nearest parent <Link>, and only goes true
// when the navigation is actually blocked, so these stay invisible whenever a
// route was already prefetched.
//
// Both components must be rendered *inside* a <Link>.

import { Loader2 } from "lucide-react";
import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

/**
 * Scrim + spinner over a cover tile. Needs a `relative` ancestor — drop it
 * inside the artwork wrapper the card already has.
 */
export function LinkPendingOverlay({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      className={cn(
        "pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-ink/55 backdrop-blur-[1px]",
        className,
      )}
      style={{ borderRadius: "inherit" }}
      aria-hidden
    >
      <Loader2 className="h-6 w-6 animate-spin text-white" />
    </span>
  );
}

/** Inline spinner for a row or nav item that has no artwork to cover. */
export function LinkPendingSpinner({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <Loader2
      className={cn("h-3.5 w-3.5 shrink-0 animate-spin", className)}
      aria-hidden
    />
  );
}

/**
 * Dims whatever it wraps while the surrounding Link is pending — for rows where
 * a spinner would shift the layout.
 */
export function LinkPendingTint({ className }: { className?: string }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      className={cn(
        "pointer-events-none absolute inset-0 animate-pulse rounded-[inherit] bg-foreground/10",
        className,
      )}
      aria-hidden
    />
  );
}
