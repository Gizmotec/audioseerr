"use client";

import { Check, Loader2, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteLibraryAlbumAction,
  deleteLibraryArtistAction,
} from "@/lib/actions/library";

type Target =
  | { type: "album"; mbid: string; title: string; artistName: string }
  | { type: "artist"; mbid: string; name: string };

/**
 * Small destructive action button for the album/artist hero. Opens a confirm
 * popover and routes back to /library on success — tile-level deletion lives
 * inside LibraryAlbumTile and updates in place via revalidatePath.
 */
export function RemoveFromLibraryButton({ target }: { target: Target }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const res =
        target.type === "album"
          ? await deleteLibraryAlbumAction(target.mbid)
          : await deleteLibraryArtistAction(target.mbid);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.push("/library");
      router.refresh();
    });
  };

  const label = target.type === "album" ? "Remove album" : "Remove artist";
  const subjectName =
    target.type === "album"
      ? `${target.title} · ${target.artistName}`
      : target.name;
  const description =
    target.type === "album"
      ? "Lidarr will unmonitor the album and delete its files from disk."
      : "Lidarr will delete this artist, all their albums, and the audio files. An import-list exclusion is added so they won't be re-added automatically.";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-10 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-sm font-bold text-muted-foreground transition-colors hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
        {label}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-72 rounded-xl border border-foreground/10 bg-popover p-3 text-sm"
        >
          <p className="mb-1 text-foreground">{label}?</p>
          <p className="mb-1 truncate text-xs text-muted-foreground" title={subjectName}>
            {subjectName}
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            {description} This cannot be undone.
          </p>
          {error && (
            <p className="mb-2 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <X className="h-3 w-3" />
              Cancel
            </button>
            <button
              type="button"
              onClick={confirm}
              disabled={pending}
              className="inline-flex h-8 items-center gap-1.5 rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {pending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Remove
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
