"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createSmartPlaylistAction } from "@/lib/actions/smartPlaylists";
import {
  SMART_PLAYLIST_DEFAULT_LIMIT,
  type SmartRule,
} from "@/lib/smartPlaylist";
import { SmartPlaylistBuilder } from "./SmartPlaylistBuilder";

/**
 * Header CTA on /playlists, next to "New playlist". Opens the rule-builder
 * modal; on create, routes to the new smart playlist's detail page so the
 * user immediately sees the live-evaluated result.
 */
export function NewSmartPlaylistButton() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = (input: { name: string; rules: SmartRule[]; limit: number }) => {
    setError(null);
    startTransition(async () => {
      const res = await createSmartPlaylistAction(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.push(`/playlists/smart/${res.id}`);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-card px-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground"
      >
        <Sparkles className="h-4 w-4" /> New smart playlist
      </button>
      {open && (
        <SmartPlaylistBuilder
          mode="create"
          initial={{ name: "", rules: [], limit: SMART_PLAYLIST_DEFAULT_LIMIT }}
          pending={pending}
          error={error}
          onSubmit={submit}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
