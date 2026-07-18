"use client";

import { Bell, BellRing, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setPlaylistSubscriptionAction } from "@/lib/actions/playlists";
import { cn } from "@/lib/utils";

/** Subscribe toggle for a system (editorial) playlist. Subscribing downloads
 * the current picks into the user's library; future weekly refreshes
 * auto-download the new ones too. */
export function SubscribeButton({
  playlistId,
  initialSubscribed,
}: {
  playlistId: string;
  initialSubscribed: boolean;
}) {
  const router = useRouter();
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !subscribed;
    setSubscribed(next);
    startTransition(async () => {
      const res = await setPlaylistSubscriptionAction(playlistId, next);
      if (!res.ok) {
        setSubscribed(!next);
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
      aria-pressed={subscribed}
      title={
        subscribed
          ? "Subscribed — all picks download to your library; new picks auto-download each week. Click to unsubscribe."
          : "Subscribe to download this whole playlist, and auto-download new picks every week."
      }
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition-colors",
        subscribed
          ? "bg-pastel-pink text-ink hover:bg-pastel-pink/80"
          : "border-transparent bg-surface-2 text-muted-foreground hover:text-foreground",
      )}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : subscribed ? (
        <BellRing className="h-4 w-4" />
      ) : (
        <Bell className="h-4 w-4" />
      )}
      {subscribed ? "Subscribed" : "Subscribe"}
    </button>
  );
}
