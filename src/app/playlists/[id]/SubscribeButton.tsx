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
        "inline-flex h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors",
        subscribed
          ? "border-primary/40 bg-primary/10 text-foreground hover:bg-primary/15"
          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
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
