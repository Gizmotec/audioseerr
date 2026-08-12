"use client";

import { Heart, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/Toaster";
import { toggleLikeAction } from "@/lib/actions/likes";
import { cn } from "@/lib/utils";

/**
 * Save (like) a featured playlist. Featured playlists otherwise live only on
 * Discover; saving one files it alongside the user's own on /playlists. Purely
 * about where it shows up — downloading is the separate auto-download toggle.
 */
export function SavePlaylistButton({
  playlistId,
  name,
  coverUrl,
  initialSaved,
}: {
  playlistId: string;
  name: string;
  coverUrl: string | null;
  initialSaved: boolean;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(initialSaved);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const toggle = () => {
    const next = !saved;
    setSaved(next);
    startTransition(async () => {
      const res = await toggleLikeAction({
        targetType: "PLAYLIST",
        targetId: playlistId,
        title: name,
        coverUrl,
      });
      if (!res.ok) {
        setSaved(!next);
        toast.error(res.error, name);
        return;
      }
      setSaved(res.liked);
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={saved}
      title={
        saved
          ? "Saved to your playlists — click to remove"
          : "Save to your playlists"
      }
      aria-label={saved ? `Remove ${name} from your playlists` : `Save ${name} to your playlists`}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold transition-colors",
        saved
          ? "bg-pastel-pink text-ink hover:bg-pastel-pink/80"
          : "bg-surface-2 text-muted-foreground hover:text-foreground",
      )}
    >
      {pending ? (
        <Loader2 className="h-4 w-4" />
      ) : (
        <Heart
          className="h-4 w-4"
          fill={saved ? "currentColor" : "none"}
          strokeWidth={saved ? 0 : 2}
        />
      )}
      {saved ? "Saved" : "Save"}
    </button>
  );
}
