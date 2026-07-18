"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createPlaylistAction } from "@/lib/actions/playlists";
import { cn } from "@/lib/utils";

/**
 * Header CTA on /playlists. Click "New playlist" → reveals a name input →
 * Enter or Create → server action → routes to the new playlist's detail page
 * so the user can immediately rename, edit, or start adding more tracks.
 */
export function CreatePlaylistInline() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed.length === 0) return;
    setError(null);
    startTransition(async () => {
      const res = await createPlaylistAction({ name: trimmed });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setName("");
      setOpen(false);
      router.push(`/playlists/${res.id}`);
    });
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border-2 border-ink bg-primary px-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-pastel-pink/80"
      >
        <Plus className="h-4 w-4" /> New playlist
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex flex-col items-end gap-1"
    >
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => {
            if (!name.trim()) setOpen(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setName("");
              setOpen(false);
              setError(null);
            }
          }}
          placeholder="Playlist name"
          maxLength={100}
          disabled={pending}
          className={cn(
            "h-9 w-52 rounded-xl border-2 border-ink bg-surface-2 px-2.5 text-sm outline-none focus:border-primary",
          )}
        />
        <button
          type="submit"
          disabled={pending || name.trim().length === 0}
          className="inline-flex h-9 items-center rounded-full border-2 border-ink bg-primary px-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-pastel-pink/80 disabled:opacity-40"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            "Create"
          )}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </form>
  );
}
