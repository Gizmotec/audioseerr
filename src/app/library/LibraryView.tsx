"use client";

import {
  Check,
  Disc3,
  Loader2,
  MoreVertical,
  Pause,
  Play,
  Search,
  Shuffle,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { type QueueItem, usePreviewPlayer } from "@/components/PreviewPlayer";
import { TrackLikeButton } from "@/components/TrackLikeButton";
import { Input } from "@/components/ui/input";
import {
  deleteLibraryAlbumAction,
  deleteLibraryTrackAction,
} from "@/lib/actions/library";
import { trackLikeTargetId } from "@/lib/likeKeys";
import { cn } from "@/lib/utils";

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
                  "inline-flex h-7 items-center rounded-full border px-2.5 text-xs transition-colors",
                  sort === tab.id
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
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
              className="inline-flex h-8 items-center gap-1.5 rounded-full bg-foreground px-3 text-xs font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <Play className="h-3.5 w-3.5" fill="currentColor" />
              Play all
            </button>
            <button
              type="button"
              onClick={shuffleAll}
              disabled={queueItems.length === 0}
              className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border px-3 text-xs font-semibold text-foreground transition-colors hover:border-foreground/40 hover:bg-secondary disabled:opacity-40"
            >
              <Shuffle className="h-3.5 w-3.5" />
              Shuffle
            </button>
          </div>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
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
        <ol className="divide-y divide-border/50">
          {visible.map((t, idx) => {
            const failed = player.failedIds.has(t.id);
            const isActive = !failed && player.isCurrent(t.id);
            return (
              <li
                key={t.id}
                className={cn(
                  "group flex items-center gap-3 py-2.5",
                  isActive && "bg-secondary/40",
                  failed && "opacity-50",
                )}
              >
                <button
                  type="button"
                  onClick={() => playFromIndex(idx)}
                  disabled={failed}
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
                    failed
                      ? "cursor-not-allowed border-border/50 text-muted-foreground/40"
                      : "border-border hover:border-foreground hover:text-foreground",
                  )}
                  aria-label={
                    failed
                      ? "Track failed to load"
                      : isActive && player.state === "playing"
                        ? "Pause"
                        : "Play"
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

                {failed && (
                  <span
                    className="hidden shrink-0 rounded-full bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-rose-400 sm:inline"
                    title="Audioseerr couldn't load this file — it may have been moved or deleted."
                  >
                    Failed to load
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
          className="absolute right-0 top-full z-30 mt-1 w-64 rounded-md border border-border bg-popover p-3 text-sm shadow-lg"
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
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
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
              className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-border px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive hover:text-destructive disabled:opacity-40"
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
