"use client";

import { Loader2, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteSmartPlaylistAction,
  updateSmartPlaylistAction,
} from "@/lib/actions/smartPlaylists";
import type { SmartRule } from "@/lib/smartPlaylist";
import { SmartPlaylistBuilder } from "@/app/playlists/SmartPlaylistBuilder";

/**
 * Header actions on a smart playlist's detail page: "Edit rules" opens the
 * rule-builder modal inline (save revalidates and the page re-evaluates
 * live); delete is owner-only with a confirm().
 */
export function SmartPlaylistActions({
  playlistId,
  initialName,
  initialRules,
  initialLimit,
}: {
  playlistId: string;
  initialName: string;
  initialRules: SmartRule[];
  initialLimit: number;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const submit = (input: { name: string; rules: SmartRule[]; limit: number }) => {
    setError(null);
    startTransition(async () => {
      const res = await updateSmartPlaylistAction(playlistId, input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  const remove = () => {
    if (!confirm(`Delete smart playlist “${initialName}”?`)) return;
    startTransition(async () => {
      const res = await deleteSmartPlaylistAction(playlistId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/playlists");
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={pending}
        className="inline-flex h-9 items-center gap-1.5 rounded-full bg-card px-3 text-sm font-bold text-muted-foreground transition-colors hover:bg-surface-2 hover:text-foreground disabled:opacity-40"
      >
        <Pencil className="h-4 w-4" /> Edit rules
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        aria-label="Delete smart playlist"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-card text-muted-foreground transition-colors hover:bg-surface-2 hover:text-destructive disabled:opacity-40"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Trash2 className="h-4 w-4" />
        )}
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {open && (
        <SmartPlaylistBuilder
          mode="edit"
          initial={{
            name: initialName,
            rules: initialRules,
            limit: initialLimit,
          }}
          pending={pending}
          error={error}
          onSubmit={submit}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
