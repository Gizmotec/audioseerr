"use client";

import { Check, ListPlus, Loader2, Plus } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import {
  addTrackToPlaylistAction,
  createPlaylistAction,
} from "@/lib/actions/playlists";
import type { AddTrackPayload } from "@/lib/playlists";
import { cn } from "@/lib/utils";

export type PlaylistOption = {
  id: string;
  name: string;
  trackCount: number;
};

type Props = {
  payload: AddTrackPayload;
  initialPlaylists: PlaylistOption[];
};

/**
 * Per-track "+" button that opens a dropdown of the user's playlists.
 * Clicking a playlist appends the track; "New playlist…" reveals an inline
 * input that creates the playlist and adds the track in two server calls.
 */
export function AddToPlaylistButton({ payload, initialPlaylists }: Props) {
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState(initialPlaylists);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null); // playlist id mid-add
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close on outside click / Escape so the dropdown doesn't trap focus.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setError(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setCreating(false);
        setError(null);
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const flashAdded = (id: string) => {
    setJustAddedId(id);
    window.setTimeout(() => {
      setJustAddedId((curr) => (curr === id ? null : curr));
    }, 1200);
  };

  const addToExisting = (playlistId: string) => {
    setBusyId(playlistId);
    setError(null);
    startTransition(async () => {
      const res = await addTrackToPlaylistAction(playlistId, payload);
      setBusyId(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === playlistId ? { ...p, trackCount: p.trackCount + 1 } : p,
        ),
      );
      flashAdded(playlistId);
    });
  };

  const submitNew = () => {
    const name = newName.trim();
    if (name.length === 0) return;
    setBusyId("__new");
    setError(null);
    startTransition(async () => {
      const created = await createPlaylistAction({ name });
      if (!created.ok) {
        setBusyId(null);
        setError(created.error);
        return;
      }
      const added = await addTrackToPlaylistAction(created.id, payload);
      setBusyId(null);
      if (!added.ok) {
        setError(added.error);
        return;
      }
      setPlaylists((prev) => [
        { id: created.id, name, trackCount: 1 },
        ...prev,
      ]);
      setNewName("");
      setCreating(false);
      flashAdded(created.id);
    });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Add to playlist"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-foreground"
      >
        <ListPlus className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-64 overflow-hidden rounded-md border border-border bg-popover shadow-lg"
        >
          <div className="max-h-72 overflow-y-auto py-1">
            {playlists.length === 0 && !creating && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                No playlists yet.
              </p>
            )}
            {playlists.map((p) => {
              const busy = busyId === p.id;
              const added = justAddedId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="menuitem"
                  onClick={() => addToExisting(p.id)}
                  disabled={busyId !== null}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
                    busyId !== null
                      ? "cursor-not-allowed opacity-60"
                      : "hover:bg-secondary",
                  )}
                >
                  <span className="truncate" title={p.name}>
                    {p.name}
                  </span>
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                  ) : added ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground/70 tabular-nums">
                      {p.trackCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="border-t border-border">
            {creating ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submitNew();
                }}
                className="flex items-center gap-2 px-2 py-2"
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Playlist name"
                  maxLength={100}
                  disabled={busyId !== null}
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-foreground"
                />
                <button
                  type="submit"
                  disabled={busyId !== null || newName.trim().length === 0}
                  className="inline-flex h-7 items-center rounded-md bg-foreground px-2 text-xs font-medium text-background transition-opacity disabled:opacity-40"
                >
                  {busyId === "__new" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Add"
                  )}
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                New playlist…
              </button>
            )}
          </div>

          {error && (
            <p className="border-t border-border bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
