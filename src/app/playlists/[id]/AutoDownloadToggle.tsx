"use client";

import { HardDriveDownload, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/Toaster";
import { setPlaylistSubscriptionAction } from "@/lib/actions/playlists";
import { cn } from "@/lib/utils";

/**
 * Auto-download toggle for a featured playlist. On means "hold this playlist on
 * disk": every current pick downloads now, and each weekly refresh downloads the
 * new picks and releases the ones that dropped off — unless you liked them or
 * put them in a playlist of your own.
 */
export function AutoDownloadToggle({
  playlistId,
  initialEnabled,
}: {
  playlistId: string;
  initialEnabled: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      const res = await setPlaylistSubscriptionAction(playlistId, next);
      if (!res.ok) {
        setEnabled(!next);
        toast.error(res.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      role="switch"
      aria-checked={enabled}
      aria-label="Auto-download this playlist"
      title={
        enabled
          ? "On — every pick is kept downloaded, and each weekly refresh swaps them over. Picks that drop off are removed unless you've liked them."
          : "Off — turn on to download every pick and keep the playlist in sync each week."
      }
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full pl-4 pr-2 text-sm font-bold transition-colors",
        enabled
          ? "bg-pastel-pink text-ink hover:bg-pastel-pink/80"
          : "bg-surface-2 text-muted-foreground hover:text-foreground",
      )}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <HardDriveDownload className="h-4 w-4" />
      )}
      Auto download
      {/* Reads as a switch, not just a highlighted button. */}
      <span
        aria-hidden
        className={cn(
          "ml-1 flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors",
          enabled ? "bg-ink/25" : "bg-foreground/15",
        )}
      >
        <span
          className={cn(
            "h-4 w-4 rounded-full bg-current transition-transform",
            enabled ? "translate-x-4" : "translate-x-0",
          )}
        />
      </span>
    </button>
  );
}
