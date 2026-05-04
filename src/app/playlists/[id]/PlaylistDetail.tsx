"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Disc3,
  Loader2,
  ListMusic,
  Pause,
  Pencil,
  Play,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { type QueueItem, usePreviewPlayer } from "@/components/PreviewPlayer";
import {
  deletePlaylistAction,
  moveTrackAction,
  removeTrackAction,
  updatePlaylistAction,
} from "@/lib/actions/playlists";
import type { PlaylistTrackRow } from "@/lib/playlists";
import { cn } from "@/lib/utils";

type DetailTrack = PlaylistTrackRow & {
  currentTrackFileId: number | null;
  streamUrl: string | null;
};

type Props = {
  playlistId: string;
  initialName: string;
  description: string | null;
  tracks: DetailTrack[];
};

export function PlaylistDetail({
  playlistId,
  initialName,
  description,
  tracks,
}: Props) {
  const player = usePreviewPlayer();
  const router = useRouter();
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // SSR-side resolution gives us streamUrl != null when Lidarr knew about the
  // file. Runtime playback may still 404 (file moved/deleted on disk after the
  // last library sync); the player publishes those ids via failedIds so we
  // can downgrade those rows to "unavailable" too.
  const playableCount = useMemo(
    () =>
      tracks.filter((t) => t.streamUrl && !player.failedIds.has(t.id)).length,
    [tracks, player.failedIds],
  );

  const queueItems = useMemo<QueueItem[]>(
    () =>
      tracks.map((t) => ({
        id: t.id,
        title: t.title,
        artistName: t.artistName,
        coverUrl: t.coverUrl,
        streamUrl: t.streamUrl,
      })),
    [tracks],
  );

  const playFromIndex = (idx: number) => {
    player.playQueue(queueItems, idx);
  };

  const playAll = () => {
    if (queueItems.length === 0) return;
    player.playQueue(queueItems, 0);
  };

  const removeTrack = (rowId: string) => {
    setPendingRowId(rowId);
    startTransition(async () => {
      const res = await removeTrackAction(playlistId, rowId);
      setPendingRowId(null);
      if (res.ok) router.refresh();
    });
  };

  const moveTrack = (rowId: string, newPosition: number) => {
    setPendingRowId(rowId);
    startTransition(async () => {
      const res = await moveTrackAction(playlistId, rowId, newPosition);
      setPendingRowId(null);
      if (res.ok) router.refresh();
    });
  };

  return (
    <div className="mt-6 flex flex-col gap-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="flex items-end gap-5">
          <PlaylistCover tracks={tracks} />
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Playlist
            </p>
            <PlaylistTitle
              playlistId={playlistId}
              initialName={initialName}
            />
            <p className="text-sm text-muted-foreground">
              {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
              {tracks.length > playableCount && (
                <>
                  {" · "}
                  <span className="text-amber-400/80">
                    {tracks.length - playableCount} unavailable
                  </span>
                </>
              )}
            </p>
            {description && (
              <p className="max-w-md text-sm text-muted-foreground/80">
                {description}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={playAll}
            disabled={playableCount === 0}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-sm font-semibold text-background transition-opacity disabled:opacity-40 hover:opacity-90"
          >
            <Play className="h-4 w-4" fill="currentColor" />
            Play
          </button>
          <DeletePlaylistButton playlistId={playlistId} name={initialName} />
        </div>
      </header>

      {tracks.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          <ListMusic className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" />
          <p>This playlist is empty.</p>
          <p className="mt-1">
            Find a track on any album page and use the{" "}
            <span className="rounded bg-secondary px-1 py-0.5 font-mono text-xs">
              + add to playlist
            </span>{" "}
            button to add it here.
          </p>
        </div>
      ) : (
        <ol className="divide-y divide-border/50">
          {tracks.map((t, idx) => {
            const failedAtPlay = player.failedIds.has(t.id);
            const isActive = !!t.streamUrl && !failedAtPlay && player.isCurrent(t.id);
            const playable = !!t.streamUrl && !failedAtPlay;
            // "missing" = Lidarr never knew about a file for this track (most
            // likely the album was downloaded with fewer tracks than MB lists).
            // "errored" = file existed at SSR but refused to play at runtime
            // (file was deleted or moved between sync and playback).
            const unavailableReason = !t.streamUrl
              ? "missing"
              : failedAtPlay
                ? "errored"
                : null;
            const isFirst = idx === 0;
            const isLast = idx === tracks.length - 1;
            const busy = pendingRowId === t.id;
            return (
              <li
                key={t.id}
                className={cn(
                  "group flex items-center gap-3 py-2.5",
                  isActive && "bg-secondary/40",
                  !playable && "opacity-50",
                )}
              >
                <button
                  type="button"
                  onClick={() => playFromIndex(idx)}
                  disabled={!playable}
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                    playable
                      ? "border-border hover:border-foreground hover:text-foreground"
                      : "cursor-not-allowed border-border/50 text-muted-foreground/40",
                  )}
                  aria-label={
                    playable
                      ? isActive && player.state === "playing"
                        ? "Pause"
                        : "Play"
                      : unavailableReason === "errored"
                        ? "Track failed to load"
                        : "Track unavailable"
                  }
                >
                  {isActive && player.state === "loading" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isActive && player.state === "playing" ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </button>

                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-secondary">
                  {t.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={t.coverUrl}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                      <Disc3 className="h-1/2 w-1/2" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm" title={t.title}>
                    {t.title}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t.albumTitle ? (
                      <>
                        {t.artistName} ·{" "}
                        <Link
                          href={`/album/${t.albumMbid}`}
                          className="hover:text-foreground hover:underline"
                        >
                          {t.albumTitle}
                        </Link>
                      </>
                    ) : (
                      t.artistName
                    )}
                  </p>
                </div>

                {unavailableReason && (
                  <span
                    className={cn(
                      "hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider sm:inline",
                      unavailableReason === "errored"
                        ? "bg-rose-500/10 text-rose-400"
                        : "bg-amber-500/10 text-amber-400",
                    )}
                    title={
                      unavailableReason === "errored"
                        ? "Audioseerr couldn't load this file from Lidarr — it may have been moved or deleted."
                        : "No audio file is in your Lidarr library for this track."
                    }
                  >
                    {unavailableReason === "errored"
                      ? "Failed to load"
                      : "Unavailable"}
                  </span>
                )}

                <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">
                  {formatDuration(t.durationMs)}
                </span>

                <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                  <button
                    type="button"
                    onClick={() => moveTrack(t.id, t.position - 1)}
                    disabled={isFirst || busy}
                    aria-label="Move up"
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-foreground",
                      isFirst && "cursor-not-allowed opacity-30",
                    )}
                  >
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveTrack(t.id, t.position + 1)}
                    disabled={isLast || busy}
                    aria-label="Move down"
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-foreground",
                      isLast && "cursor-not-allowed opacity-30",
                    )}
                  >
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTrack(t.id)}
                    disabled={busy}
                    aria-label="Remove from playlist"
                    className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" />
                    )}
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

function PlaylistCover({ tracks }: { tracks: DetailTrack[] }) {
  // First four covers form a 2×2 grid à la Spotify; fall back to one big cover
  // if there's only one unique cover, or the icon if there are none.
  const covers = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of tracks) {
      if (!t.coverUrl || seen.has(t.coverUrl)) continue;
      seen.add(t.coverUrl);
      out.push(t.coverUrl);
      if (out.length === 4) break;
    }
    return out;
  }, [tracks]);

  if (covers.length === 0) {
    return (
      <div className="flex h-40 w-40 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground/40 shadow-lg md:h-48 md:w-48">
        <ListMusic className="h-1/3 w-1/3" />
      </div>
    );
  }

  if (covers.length === 1) {
    return (
      <div className="relative h-40 w-40 shrink-0 overflow-hidden rounded-lg bg-secondary shadow-lg md:h-48 md:w-48">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={covers[0]}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      </div>
    );
  }

  return (
    <div className="grid h-40 w-40 shrink-0 grid-cols-2 grid-rows-2 overflow-hidden rounded-lg bg-secondary shadow-lg md:h-48 md:w-48">
      {covers.slice(0, 4).map((url, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${url}-${i}`}
          src={url}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
      ))}
    </div>
  );
}

function PlaylistTitle({
  playlistId,
  initialName,
}: {
  playlistId: string;
  initialName: string;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(initialName);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  // Sync from server props if SSR re-runs while we're not editing.
  useEffect(() => {
    if (!editing) setName(initialName);
  }, [initialName, editing]);

  const submit = () => {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed === initialName) {
      setEditing(false);
      setName(initialName);
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await updatePlaylistAction(playlistId, { name: trimmed });
      if (!res.ok) {
        setError(res.error);
        setName(initialName);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  };

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex items-center gap-2"
      >
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setEditing(false);
              setName(initialName);
              setError(null);
            }
          }}
          maxLength={100}
          disabled={pending}
          className="rounded-md border border-border bg-background px-2 py-1 text-3xl font-semibold leading-tight md:text-5xl"
        />
        {pending && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {error && <span className="text-xs text-destructive">{error}</span>}
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="group inline-flex items-center gap-2 text-left text-3xl font-semibold leading-tight md:text-5xl"
    >
      {initialName}
      <Pencil className="h-4 w-4 text-muted-foreground/0 transition-colors group-hover:text-muted-foreground" />
    </button>
  );
}

function DeletePlaylistButton({
  playlistId,
  name,
}: {
  playlistId: string;
  name: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!confirming) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setConfirming(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirming(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [confirming]);

  const confirm = () => {
    startTransition(async () => {
      const res = await deletePlaylistAction(playlistId);
      if (res.ok) router.push("/playlists");
    });
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setConfirming((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={confirming}
        className="inline-flex h-10 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted-foreground transition-colors hover:border-destructive hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
        <ChevronDown className="h-3 w-3" />
      </button>
      {confirming && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-64 rounded-md border border-border bg-popover p-3 text-sm shadow-lg"
        >
          <p className="mb-2 text-foreground">
            Delete <span className="font-medium">{name}</span>?
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            This removes the playlist and its tracks. The audio files in your
            Lidarr library are not touched.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={pending}
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
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
              Delete
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  const seconds = Math.round(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
