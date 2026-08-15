"use client";

import {
  Check,
  ListPlus,
  Loader2,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { deleteLibraryTracksAction } from "@/lib/actions/library";
import {
  addTracksToPlaylistAction,
  createPlaylistAction,
  listMyPlaylistsAction,
} from "@/lib/actions/playlists";
import { MAX_BULK_TRACKS } from "@/lib/bulkSelection";
import type { AddTrackPayload } from "@/lib/playlists";
import { cn } from "@/lib/utils";
import type { LibraryTrack } from "./LibraryView";

type PlaylistOption = { id: string; name: string; trackCount: number };

/**
 * Floating bar for the library's multi-select mode. Sits above the preview
 * player the same way the toaster does, and clears the whole selection after
 * any action that changed the tracks.
 */
export function LibrarySelectionBar({
  selected,
  visibleCount,
  allVisibleSelected,
  canDelete,
  onPlay,
  onSelectAll,
  onClear,
  onExit,
}: {
  selected: LibraryTrack[];
  visibleCount: number;
  allVisibleSelected: boolean;
  canDelete: boolean;
  onPlay: () => void;
  onSelectAll: () => void;
  onClear: () => void;
  onExit: () => void;
}) {
  const count = selected.length;
  const overCap = count > MAX_BULK_TRACKS;

  return (
    <div
      className="fixed inset-x-0 z-40 px-4 transition-[left] duration-200 md:left-[var(--sidebar-width)]"
      style={{ bottom: "calc(1rem + var(--preview-player-bottom-offset, 0px))" }}
    >
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-2 rounded-2xl border border-foreground/10 bg-popover p-2 shadow-lg">
        <span className="px-2 text-sm font-bold tabular-nums">
          {count} selected
        </span>

        <button
          type="button"
          onClick={allVisibleSelected ? onClear : onSelectAll}
          className="inline-flex h-8 items-center rounded-full bg-surface-2 px-3 text-xs font-bold text-foreground transition-colors hover:bg-accent"
        >
          {allVisibleSelected ? "Clear" : `Select all ${visibleCount}`}
        </button>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onPlay}
            disabled={count === 0}
            className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground transition-colors hover:bg-pastel-pink/80 disabled:opacity-40"
          >
            <Play className="h-3.5 w-3.5" fill="currentColor" />
            Play
          </button>

          <AddSelectedToPlaylist
            selected={selected}
            disabled={count === 0 || overCap}
            onDone={onClear}
          />

          {canDelete && (
            <DeleteSelected
              selected={selected}
              disabled={count === 0 || overCap}
              onDone={onClear}
            />
          )}

          <button
            type="button"
            onClick={onExit}
            aria-label="Leave selection mode"
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {overCap && (
          <p className="w-full px-2 text-xs text-destructive" role="alert">
            Select {MAX_BULK_TRACKS} tracks or fewer to add or delete in one go.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Tracks with no recordingMbid can't be written to a playlist — PlaylistTrack
 * is keyed by it. We add the rest and say how many were left behind rather
 * than failing the whole batch.
 */
function toPayloads(selected: LibraryTrack[]): {
  payloads: AddTrackPayload[];
  skipped: number;
} {
  const payloads: AddTrackPayload[] = [];
  let skipped = 0;
  for (const t of selected) {
    if (!t.recordingMbid) {
      skipped += 1;
      continue;
    }
    payloads.push({
      recordingMbid: t.recordingMbid,
      trackFileId: null,
      albumMbid: t.albumMbid,
      albumPosition: t.albumPosition,
      title: t.title,
      artistName: t.artistName,
      albumTitle: t.albumTitle,
      coverUrl: t.coverUrl,
      durationMs: t.durationMs,
    });
  }
  return { payloads, skipped };
}

function AddSelectedToPlaylist({
  selected,
  disabled,
  onDone,
}: {
  selected: LibraryTrack[];
  disabled: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistOption[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    setCreating(false);
    setNewName("");
    setError(null);
  };

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
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

  // Fetched on first open rather than passed down, so the library page doesn't
  // pay for a playlist query nobody may use.
  const openMenu = () => {
    setOpen(true);
    if (playlists !== null) return;
    startTransition(async () => {
      const res = await listMyPlaylistsAction();
      if (!res.ok) {
        setError(res.error);
        setPlaylists([]);
        return;
      }
      setPlaylists(res.playlists);
    });
  };

  const finish = () => {
    close();
    onDone();
    router.refresh();
  };

  const addTo = (playlistId: string) => {
    const { payloads } = toPayloads(selected);
    if (payloads.length === 0) {
      setError("These tracks have no MusicBrainz id, so they can't be added.");
      return;
    }
    setBusy(true);
    setError(null);
    startTransition(async () => {
      const res = await addTracksToPlaylistAction(playlistId, payloads);
      setBusy(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      finish();
    });
  };

  const submitNew = () => {
    const name = newName.trim();
    if (name.length === 0) return;
    const { payloads } = toPayloads(selected);
    if (payloads.length === 0) {
      setError("These tracks have no MusicBrainz id, so they can't be added.");
      return;
    }
    setBusy(true);
    setError(null);
    startTransition(async () => {
      const created = await createPlaylistAction({ name });
      if (!created.ok) {
        setBusy(false);
        setError(created.error);
        return;
      }
      const added = await addTracksToPlaylistAction(created.id, payloads);
      setBusy(false);
      if (!added.ok) {
        setError(added.error);
        return;
      }
      finish();
    });
  };

  const skipped = selected.filter((t) => !t.recordingMbid).length;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? close() : openMenu())}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-card px-3 text-xs font-bold text-foreground transition-colors hover:bg-surface-2 disabled:opacity-40"
      >
        <ListPlus className="h-3.5 w-3.5" />
        Add to playlist
      </button>

      {open && (
        <div
          role="menu"
          className="absolute bottom-full right-0 z-30 mb-1 w-64 overflow-hidden rounded-xl border border-foreground/10 bg-popover"
        >
          <div className="max-h-72 overflow-y-auto py-1">
            {playlists === null && (
              <p className="flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Loading playlists…
              </p>
            )}
            {playlists?.length === 0 && !creating && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                No playlists yet.
              </p>
            )}
            {playlists?.map((p) => (
              <button
                key={p.id}
                type="button"
                role="menuitem"
                onClick={() => addTo(p.id)}
                disabled={busy}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors",
                  busy ? "cursor-not-allowed opacity-60" : "hover:bg-secondary",
                )}
              >
                <span className="truncate" title={p.name}>
                  {p.name}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground/70 tabular-nums">
                  {p.trackCount}
                </span>
              </button>
            ))}
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
                  disabled={busy}
                  className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-foreground"
                />
                <button
                  type="submit"
                  disabled={busy || newName.trim().length === 0}
                  className="inline-flex h-7 items-center rounded-md bg-foreground px-2 text-xs font-medium text-background transition-opacity disabled:opacity-40"
                >
                  {busy ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    "Create"
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

          {skipped > 0 && (
            <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
              {skipped} of {selected.length} can’t be added — no MusicBrainz id.
            </p>
          )}

          {error && (
            <p
              className="border-t border-border bg-destructive/10 px-3 py-2 text-xs text-destructive"
              role="alert"
            >
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function DeleteSelected({
  selected,
  disabled,
  onDone,
}: {
  selected: LibraryTrack[];
  disabled: boolean;
  onDone: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

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
      const res = await deleteLibraryTracksAction(selected.map((t) => t.id));
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      onDone();
      router.refresh();
    });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-card px-3 text-xs font-bold text-foreground transition-colors hover:bg-pastel-red hover:text-ink disabled:opacity-40"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Confirm delete"
          className="absolute bottom-full right-0 z-30 mb-1 w-64 rounded-xl border border-foreground/10 bg-popover p-3 text-sm"
        >
          <p className="mb-3 text-xs text-muted-foreground">
            Deletes {selected.length} file
            {selected.length === 1 ? "" : "s"} from disk. This cannot be undone.
          </p>
          {error && (
            <p className="mb-2 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={confirm}
              disabled={pending}
              className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-full bg-destructive px-3 text-xs font-bold text-ink transition-colors hover:bg-destructive/80 disabled:opacity-40"
            >
              {pending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Delete
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={pending}
              className="inline-flex h-8 items-center justify-center rounded-full bg-card px-3 text-xs font-bold text-foreground transition-colors hover:bg-surface-2 disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
