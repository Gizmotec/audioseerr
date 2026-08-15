"use client";

import {
  Check,
  Clock,
  Disc3,
  ListChecks,
  Loader2,
  MoreVertical,
  Play,
  Search,
  Shuffle,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { type QueueItem, usePreviewPlayer } from "@/components/PreviewPlayer";
import { RowPlayButton } from "@/components/RowPlayButton";
import { TrackLikeButton } from "@/components/TrackLikeButton";
import { useTrackMenu } from "@/components/TrackMenu";
import { Input } from "@/components/ui/input";
import {
  deleteLibraryAlbumAction,
  deleteLibraryTrackAction,
} from "@/lib/actions/library";
import { trackLikeTargetId } from "@/lib/likeKeys";
import { cn } from "@/lib/utils";
import { LibrarySelectionBar } from "./LibrarySelectionBar";

export type LibraryTrack = {
  id: string;
  title: string;
  artistName: string;
  albumTitle: string | null;
  albumMbid: string;
  albumPosition: number;
  coverUrl: string | null;
  durationMs: number | null;
  recordingMbid: string | null;
  streamUrl: string;
  caption?: string | null;
};

type SortKey = "recent" | "artist" | "title";

const SORT_TABS: { id: SortKey; label: string }[] = [
  { id: "recent", label: "Recent" },
  { id: "artist", label: "Artist" },
  { id: "title", label: "Title" },
];

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/\p{M}/gu, "");
}

export function LibraryView({
  tracks,
  canDelete,
  likedTrackIds = [],
}: {
  tracks: LibraryTrack[];
  canDelete: boolean;
  likedTrackIds?: string[];
}) {
  const player = usePreviewPlayer();
  const { openTrackMenu } = useTrackMenu();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const likedSet = useMemo(() => new Set(likedTrackIds), [likedTrackIds]);

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    const filtered = tracks.filter((t) => {
      if (!q) return true;
      return (
        normalize(t.title).includes(q) ||
        normalize(t.artistName).includes(q) ||
        normalize(t.albumTitle ?? "").includes(q)
      );
    });
    // `recent` keeps the server order (createdAt desc); the others re-sort.
    if (sort === "title") {
      return [...filtered].sort((a, b) =>
        normalize(a.title).localeCompare(normalize(b.title)),
      );
    }
    if (sort === "artist") {
      return [...filtered].sort(
        (a, b) =>
          normalize(a.artistName).localeCompare(normalize(b.artistName)) ||
          normalize(a.albumTitle ?? "").localeCompare(
            normalize(b.albumTitle ?? ""),
          ) ||
          a.albumPosition - b.albumPosition,
      );
    }
    return filtered;
  }, [tracks, query, sort]);

  const queueItems = useMemo<QueueItem[]>(
    () =>
      visible.map((t) => ({
        id: t.id,
        title: t.title,
        artistName: t.artistName,
        coverUrl: t.coverUrl,
        streamUrl: t.streamUrl,
        recordingMbid: t.recordingMbid ?? undefined,
        albumMbid: t.albumMbid,
        durationMs: t.durationMs ?? undefined,
        likeSeed: {
          recordingMbid: t.recordingMbid,
          albumMbid: t.albumMbid,
          albumPosition: t.albumPosition,
          albumTitle: t.albumTitle,
        },
      })),
    [visible],
  );

  const playFromIndex = (idx: number) => player.playQueue(queueItems, idx);
  const playAll = () => {
    if (queueItems.length > 0) player.playQueue(queueItems, 0);
  };
  const shuffleAll = () => {
    if (queueItems.length > 0) player.playQueue(shuffle(queueItems), 0);
  };

  // Multi-select. Every action reads `selected`, which is derived from the rows
  // currently on screen — so a track hidden by the search filter is never acted
  // on, and no effect has to prune the stored id set.
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // Anchor for shift-click ranges, held by track id rather than index so a
  // re-sort or a narrowed search can't point it at the wrong row.
  const anchorIdRef = useRef<string | null>(null);

  const selected = useMemo(
    () => visible.filter((t) => selectedIds.has(t.id)),
    [visible, selectedIds],
  );

  const toggleAt = (idx: number, extendRange: boolean) => {
    const track = visible[idx];
    if (!track) return;
    const anchorId = anchorIdRef.current;
    const anchor = anchorId
      ? visible.findIndex((t) => t.id === anchorId)
      : -1;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (extendRange && anchor >= 0) {
        // Shift-click paints the whole span the same way the clicked row went.
        const [lo, hi] = anchor < idx ? [anchor, idx] : [idx, anchor];
        const turningOn = !prev.has(track.id);
        for (let i = lo; i <= hi; i++) {
          const id = visible[i]?.id;
          if (!id) continue;
          if (turningOn) next.add(id);
          else next.delete(id);
        }
        return next;
      }
      if (next.has(track.id)) next.delete(track.id);
      else next.add(track.id);
      return next;
    });
    anchorIdRef.current = track.id;
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
    anchorIdRef.current = null;
  };

  const exitSelectMode = () => {
    clearSelection();
    setSelectMode(false);
  };

  const playSelected = () => {
    const ids = new Set(selected.map((t) => t.id));
    const queue = queueItems.filter((q) => ids.has(q.id));
    if (queue.length > 0) player.playQueue(queue, 0);
  };

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search title, artist, or album"
            className="pl-8 pr-7"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1.5">
            {SORT_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSort(tab.id)}
                className={cn(
                  "inline-flex items-center rounded-full px-3 py-1.5 text-sm font-bold transition-colors",
                  sort === tab.id
                    ? "bg-pastel-yellow text-ink"
                    : "border-transparent bg-surface-2 text-muted-foreground hover:text-foreground",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={playAll}
              disabled={queueItems.length === 0}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-xs font-bold text-primary-foreground transition-colors hover:bg-pastel-pink/80 disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5" fill="currentColor" />
              Play all
            </button>
            <button
              type="button"
              onClick={shuffleAll}
              disabled={queueItems.length === 0}
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-card px-3 text-xs font-bold text-foreground transition-colors hover:bg-surface-2 disabled:opacity-40"
            >
              <Shuffle className="h-3.5 w-3.5" />
              Shuffle
            </button>
            <button
              type="button"
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              disabled={visible.length === 0}
              aria-pressed={selectMode}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-xs font-bold transition-colors disabled:opacity-40",
                selectMode
                  ? "bg-pastel-yellow text-ink"
                  : "bg-card text-foreground hover:bg-surface-2",
              )}
            >
              <ListChecks className="h-3.5 w-3.5" />
              {selectMode ? "Done" : "Select"}
            </button>
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-foreground/15 bg-card p-8 text-center text-sm text-muted-foreground">
          <Disc3 className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" />
          <p>No matches.</p>
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-2 text-foreground underline-offset-4 hover:underline"
            >
              Clear search
            </button>
          )}
        </div>
      ) : (
        <ol className={cn("flex flex-col gap-1", selectMode && "pb-24")}>
          {visible.map((t, idx) => {
            const failed = player.failedIds.has(t.id);
            const isActive = !failed && player.isCurrent(t.id);
            const checked = selectedIds.has(t.id);
            return (
              <li
                key={t.id}
                onContextMenu={(e) =>
                  openTrackMenu(e, {
                    title: t.title,
                    artistName: t.artistName,
                    recordingMbid: t.recordingMbid,
                  })
                }
                // In select mode the whole row is a target, but nested buttons
                // and links keep their own jobs.
                onClick={
                  selectMode
                    ? (e) => {
                        if ((e.target as HTMLElement).closest("a,button")) return;
                        toggleAt(idx, e.shiftKey);
                      }
                    : undefined
                }
                className={cn(
                  "group flex items-center gap-4 rounded-lg border-2 border-transparent px-2.5 py-3 hover:bg-surface-2",
                  isActive && "bg-surface-2",
                  failed && "opacity-50",
                  selectMode && "cursor-pointer",
                  checked && "border-pastel-yellow bg-surface-2",
                )}
              >
                {selectMode && (
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    aria-label={`Select ${t.title}`}
                    onClick={(e) => toggleAt(idx, e.shiftKey)}
                    className={cn(
                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors",
                      checked
                        ? "border-pastel-yellow bg-pastel-yellow text-ink"
                        : "border-foreground/25 text-transparent hover:border-foreground/50",
                    )}
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </button>
                )}

                <RowPlayButton
                  onClick={() => playFromIndex(idx)}
                  playable={!failed}
                  playing={isActive && player.state === "playing"}
                  loading={isActive && player.state === "loading"}
                  label={
                    failed
                      ? "Track failed to load"
                      : isActive && player.state === "playing"
                        ? "Pause"
                        : "Play"
                  }
                />

                <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-cover bg-surface-2">
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
                  {t.caption && (
                    <p className="truncate text-xs text-pastel-yellow md:hidden">
                      {t.caption}
                    </p>
                  )}
                </div>

                {failed && (
                  <span
                    className="hidden shrink-0 rounded-full bg-pastel-red px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink sm:inline"
                    title="Audioseerr couldn't load this file — it may have been moved or deleted."
                  >
                    Failed to load
                  </span>
                )}

                {t.caption && (
                  <span className="hidden shrink-0 items-center gap-1 text-xs text-pastel-yellow tabular-nums md:inline-flex">
                    <Clock className="h-3.5 w-3.5" />
                    {t.caption}
                  </span>
                )}

                <TrackLikeButton
                  track={{
                    recordingMbid: t.recordingMbid,
                    albumMbid: t.albumMbid,
                    albumPosition: t.albumPosition,
                    title: t.title,
                    artistName: t.artistName,
                    albumTitle: t.albumTitle,
                    coverUrl: t.coverUrl,
                    durationMs: t.durationMs,
                  }}
                  initialLiked={likedSet.has(
                    trackLikeTargetId(
                      t.recordingMbid,
                      t.albumMbid,
                      t.albumPosition,
                    ) ?? "",
                  )}
                  variant="icon"
                />

                <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">
                  {formatDuration(t.durationMs)}
                </span>

                {canDelete && (
                  <TrackActionsMenu
                    trackId={t.id}
                    albumMbid={t.albumMbid}
                    title={t.title}
                    artistName={t.artistName}
                    albumTitle={t.albumTitle}
                  />
                )}
              </li>
            );
          })}
        </ol>
      )}

      {selectMode && visible.length > 0 && (
        <LibrarySelectionBar
          selected={selected}
          visibleCount={visible.length}
          allVisibleSelected={selected.length === visible.length}
          canDelete={canDelete}
          onPlay={playSelected}
          onSelectAll={() => setSelectedIds(new Set(visible.map((t) => t.id)))}
          onClear={clearSelection}
          onExit={exitSelectMode}
        />
      )}
    </>
  );
}

function TrackActionsMenu({
  trackId,
  albumMbid,
  title,
  artistName,
  albumTitle,
}: {
  trackId: string;
  albumMbid: string;
  title: string;
  artistName: string;
  albumTitle: string | null;
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

  const run = (action: () => Promise<{ ok: true } | { ok: false; error: string }>) => {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Track actions"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground/70 opacity-0 transition-opacity hover:bg-secondary hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100",
          open && "opacity-100",
        )}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-64 rounded-xl border border-foreground/10 bg-popover p-3 text-sm"
        >
          <p className="mb-0.5 truncate text-foreground" title={title}>
            {title}
          </p>
          <p className="mb-2 truncate text-xs text-muted-foreground">
            {artistName}
            {albumTitle ? ` · ${albumTitle}` : ""}
          </p>
          <p className="mb-3 text-xs text-muted-foreground">
            Deletes the file(s) from disk. This cannot be undone.
          </p>
          {error && (
            <p className="mb-2 text-xs text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={() => run(() => deleteLibraryTrackAction(trackId))}
              disabled={pending}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full bg-destructive px-3 text-xs font-bold text-ink transition-colors hover:bg-destructive/80 disabled:opacity-40"
            >
              {pending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Remove this track
            </button>
            <button
              type="button"
              onClick={() => run(() => deleteLibraryAlbumAction(albumMbid))}
              disabled={pending}
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full bg-card px-3 text-xs font-bold text-foreground transition-colors hover:bg-pastel-red hover:text-ink disabled:opacity-40"
            >
              Remove whole album
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  const seconds = Math.round(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
