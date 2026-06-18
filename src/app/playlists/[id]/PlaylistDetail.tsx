"use client";

import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronDown,
  Disc3,
  ImagePlus,
  Loader2,
  ListMusic,
  Lock,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Share2,
  Shuffle,
  Square,
  SquareCheck,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { PlaylistRecommendations } from "@/components/PlaylistRecommendations";
import { type QueueItem, usePreviewPlayer } from "@/components/PreviewPlayer";
import { TrackLikeButton } from "@/components/TrackLikeButton";
import { trackLikeTargetId } from "@/lib/likeKeys";
import {
  addTracksToPlaylistAction,
  deletePlaylistAction,
  listAvailablePlaylistTracksAction,
  moveTrackAction,
  removeTrackAction,
  setPlaylistSharedAction,
  uploadPlaylistCoverAction,
  updatePlaylistAction,
} from "@/lib/actions/playlists";
import type {
  AddTrackPayload,
  AvailablePlaylistTrack,
  PlaylistTrackRow,
} from "@/lib/playlists";
import { cn } from "@/lib/utils";

type DetailTrack = PlaylistTrackRow & {
  currentTrackFileId: number | null;
  streamUrl: string | null;
  /** True while a Soulseek download for this track is in flight. */
  fetching?: boolean;
};

type Props = {
  playlistId: string;
  initialName: string;
  description: string | null;
  coverUrl: string | null;
  tracks: DetailTrack[];
  readOnly?: boolean;
  showEmptyState?: boolean;
  /** Owner's username when the viewer isn't the owner — drives attribution line. */
  ownerUsername?: string | null;
  /** Show the Share toggle (true only for the real owner of a non-system playlist). */
  canManageSharing?: boolean;
  /** Initial shared flag for the toggle. */
  initialShared?: boolean;
  /** Track like target-ids (see trackLikeTargetId) the viewer has already liked. */
  likedTrackIds?: string[];
};

export function PlaylistDetail({
  playlistId,
  initialName,
  description,
  coverUrl,
  tracks,
  readOnly = false,
  showEmptyState = true,
  ownerUsername = null,
  canManageSharing = false,
  initialShared = false,
  likedTrackIds = [],
}: Props) {
  const player = usePreviewPlayer();
  const router = useRouter();
  const likedSet = useMemo(() => new Set(likedTrackIds), [likedTrackIds]);
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
  const fetchingCount = useMemo(
    () => tracks.filter((t) => t.fetching && !t.streamUrl).length,
    [tracks],
  );
  const unavailableCount = tracks.length - playableCount - fetchingCount;

  const queueItems = useMemo<QueueItem[]>(
    () =>
      tracks.map((t) => ({
        id: t.id,
        title: t.title,
        artistName: t.artistName,
        coverUrl: t.coverUrl,
        streamUrl: t.streamUrl,
        recordingMbid: t.recordingMbid,
        albumMbid: t.albumMbid,
        durationMs: t.durationMs ?? undefined,
        likeSeed: {
          recordingMbid: t.recordingMbid ?? null,
          albumMbid: t.albumMbid,
          albumPosition: t.albumPosition,
          albumTitle: t.albumTitle,
        },
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

  const shuffleAll = () => {
    const playable = queueItems.filter(
      (item) => item.streamUrl && !player.failedIds.has(item.id),
    );
    if (playable.length === 0) return;
    player.playQueue(shuffle(playable), 0);
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
          <PlaylistCover
            playlistId={playlistId}
            coverUrl={coverUrl}
            tracks={tracks}
            readOnly={readOnly}
          />
          <div className="flex flex-col gap-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              Playlist
            </p>
            {readOnly ? (
              <h1 className="text-3xl font-semibold leading-tight md:text-5xl">
                {initialName}
              </h1>
            ) : (
              <PlaylistTitle
                key={initialName}
                playlistId={playlistId}
                initialName={initialName}
              />
            )}
            <p className="text-sm text-muted-foreground">
              {ownerUsername && (
                <>
                  by <span className="font-mono">{ownerUsername}</span>
                  {" · "}
                </>
              )}
              {tracks.length} {tracks.length === 1 ? "track" : "tracks"}
              {fetchingCount > 0 && (
                <>
                  {" · "}
                  <span className="text-sky-400/80">
                    {fetchingCount} downloading
                  </span>
                </>
              )}
              {unavailableCount > 0 && (
                <>
                  {" · "}
                  <span className="text-amber-400/80">
                    {unavailableCount} unavailable
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
          {!readOnly && (
            <AddSongsButton
              playlistId={playlistId}
              currentTracks={tracks}
            />
          )}
          <button
            type="button"
            onClick={playAll}
            disabled={playableCount === 0}
            className="inline-flex h-10 items-center gap-2 rounded-full bg-foreground px-4 text-sm font-semibold text-background transition-opacity disabled:opacity-40 hover:opacity-90"
          >
            <Play className="h-4 w-4" fill="currentColor" />
            Play
          </button>
          <button
            type="button"
            onClick={shuffleAll}
            disabled={playableCount === 0}
            className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm font-semibold text-foreground transition-colors disabled:opacity-40 hover:border-foreground/40 hover:bg-secondary"
          >
            <Shuffle className="h-4 w-4" />
            Shuffle
          </button>
          {canManageSharing && (
            <ShareToggleButton
              playlistId={playlistId}
              initialShared={initialShared}
            />
          )}
          {!readOnly && (
            <DeletePlaylistButton playlistId={playlistId} name={initialName} />
          )}
        </div>
      </header>

      {tracks.length === 0 && showEmptyState ? (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          <ListMusic className="mx-auto mb-3 h-6 w-6 text-muted-foreground/60" />
          <p>{readOnly ? "No liked songs yet." : "This playlist is empty."}</p>
          <p className="mt-1">
            {readOnly
              ? "Heart tracks on album pages to collect them here."
              : "Use Add songs to search your downloaded library."}
          </p>
        </div>
      ) : tracks.length > 0 ? (
        <ol className="divide-y divide-border/50">
          {tracks.map((t, idx) => {
            const failedAtPlay = player.failedIds.has(t.id);
            const isActive = !!t.streamUrl && !failedAtPlay && player.isCurrent(t.id);
            const playable = !!t.streamUrl && !failedAtPlay;
            // "missing" = Lidarr never knew about a file for this track (most
            // likely the album was downloaded with fewer tracks than MB lists).
            // "errored" = file existed at SSR but refused to play at runtime
            // (file was deleted or moved between sync and playback).
            const fetching = !!t.fetching && !t.streamUrl && !failedAtPlay;
            const unavailableReason = fetching
              ? null
              : !t.streamUrl
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
                          href={{
                            pathname: `/album/${t.albumMbid}`,
                            query: { from: "playlists" },
                          }}
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

                {fetching && (
                  <span
                    className="hidden shrink-0 items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-sky-400 sm:inline-flex"
                    title="Downloading from Soulseek…"
                  >
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Downloading
                  </span>
                )}

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

                {!readOnly && (
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
                )}
              </li>
            );
          })}
        </ol>
      ) : null}

      {/* Spotify-style suggestions, shown on editable playlists once there are a
          few tracks to learn from (server enforces the same minimum). */}
      {!readOnly && tracks.length >= 3 && (
        <PlaylistRecommendations playlistId={playlistId} />
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

function AddSongsButton({
  playlistId,
  currentTracks,
}: {
  playlistId: string;
  currentTracks: DetailTrack[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [availableTracks, setAvailableTracks] = useState<
    AvailablePlaylistTrack[]
  >([]);
  const [loadedTracks, setLoadedTracks] = useState(false);
  const [loadingTracks, setLoadingTracks] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const existingKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const track of currentTracks) {
      keys.add(
        `${track.albumMbid}:${track.albumPosition}:${
          track.currentTrackFileId ?? track.trackFileId
        }`,
      );
    }
    return keys;
  }, [currentTracks]);

  const byKey = useMemo(
    () => new Map(availableTracks.map((track) => [track.key, track])),
    [availableTracks],
  );

  const filteredTracks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return availableTracks.slice(0, 100);
    return availableTracks
      .filter((track) =>
        `${track.title} ${track.artistName} ${track.albumTitle ?? ""}`
          .toLowerCase()
          .includes(needle),
      )
      .slice(0, 100);
  }, [availableTracks, query]);

  const close = useCallback(() => {
    setOpen(false);
    setError(null);
    setQuery("");
  }, []);

  const openPicker = () => {
    setOpen(true);
    if (loadedTracks || loadingTracks) return;
    setLoadingTracks(true);
    setError(null);
    startTransition(async () => {
      const res = await listAvailablePlaylistTracksAction();
      setLoadingTracks(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAvailableTracks(res.tracks);
      setLoadedTracks(true);
    });
  };

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [close, open]);

  const toggle = (key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectFiltered = () => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const track of filteredTracks) next.add(track.key);
      return next;
    });
  };

  const clearSelected = () => setSelectedKeys(new Set());

  const addSelected = () => {
    const payloads: AddTrackPayload[] = Array.from(selectedKeys)
      .map((key) => byKey.get(key))
      .filter((track): track is AvailablePlaylistTrack => !!track)
      .map((track) => ({
        recordingMbid: track.recordingMbid,
        trackFileId: track.trackFileId,
        albumMbid: track.albumMbid,
        albumPosition: track.albumPosition,
        title: track.title,
        artistName: track.artistName,
        albumTitle: track.albumTitle,
        coverUrl: track.coverUrl,
        durationMs: track.durationMs,
      }));
    if (payloads.length === 0) return;

    setError(null);
    startTransition(async () => {
      const res = await addTracksToPlaylistAction(playlistId, payloads);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSelectedKeys(new Set());
      close();
      router.refresh();
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-foreground transition-colors hover:bg-secondary"
      >
        <Plus className="h-4 w-4" />
        Add songs
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-background/80 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-6"
          role="dialog"
          aria-modal="true"
          aria-label="Add songs"
          onMouseDown={(e) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
              close();
            }
          }}
        >
          <div
            ref={panelRef}
            className="flex max-h-[88vh] w-full flex-col overflow-hidden rounded-t-lg border border-border bg-background shadow-2xl sm:max-w-3xl sm:rounded-lg"
          >
            <div className="flex items-start justify-between gap-4 border-b border-border p-4">
              <div>
                <h2 className="text-lg font-semibold">Add songs</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {loadingTracks
                    ? "Loading downloaded songs..."
                    : `${availableTracks.length} downloaded ${
                        availableTracks.length === 1 ? "song" : "songs"
                      } available`}
                </p>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-border p-4">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={inputRef}
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search songs, artists, or albums"
                  className="h-10 w-full rounded-md border border-input bg-transparent pl-9 pr-3 text-sm outline-none transition-colors focus:border-ring focus:ring-3 focus:ring-ring/30"
                />
              </label>

              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={selectFiltered}
                  disabled={filteredTracks.length === 0}
                  className="rounded-md border border-border px-2 py-1 transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Select shown
                </button>
                <button
                  type="button"
                  onClick={clearSelected}
                  disabled={selectedKeys.size === 0}
                  className="rounded-md border border-border px-2 py-1 transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Clear
                </button>
                <span className="ml-auto tabular-nums">
                  Showing {filteredTracks.length}
                  {availableTracks.length > filteredTracks.length ? " of 100+" : ""}
                </span>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              {availableTracks.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                  {loadingTracks ? (
                    <Loader2 className="mx-auto h-6 w-6 animate-spin" />
                  ) : (
                    "No downloaded songs were found in your Lidarr library."
                  )}
                </div>
              ) : filteredTracks.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                  No songs match your search.
                </div>
              ) : (
                <ol className="divide-y divide-border/50">
                  {filteredTracks.map((track) => {
                    const selected = selectedKeys.has(track.key);
                    const alreadyInPlaylist = existingKeys.has(
                      `${track.albumMbid}:${track.albumPosition}:${track.trackFileId}`,
                    );
                    return (
                      <li key={track.key}>
                        <button
                          type="button"
                          onClick={() => toggle(track.key)}
                          className={cn(
                            "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-secondary/70",
                            selected && "bg-secondary",
                          )}
                        >
                          {selected ? (
                            <SquareCheck className="h-5 w-5 shrink-0 text-foreground" />
                          ) : (
                            <Square className="h-5 w-5 shrink-0 text-muted-foreground" />
                          )}
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded bg-secondary text-muted-foreground/40">
                            {track.coverUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={track.coverUrl}
                                alt=""
                                loading="lazy"
                                referrerPolicy="no-referrer"
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Disc3 className="h-5 w-5" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium" title={track.title}>
                              {track.title}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {track.artistName}
                              {track.albumTitle ? ` · ${track.albumTitle}` : ""}
                            </p>
                          </div>
                          {alreadyInPlaylist && (
                            <span className="hidden shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:inline">
                              In playlist
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-border p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {selectedKeys.size} selected
                {error ? <span className="text-destructive"> · {error}</span> : null}
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={close}
                  disabled={pending}
                  className="inline-flex h-9 items-center rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={addSelected}
                  disabled={pending || selectedKeys.size === 0}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-foreground px-3 text-sm font-semibold text-background transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {pending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Add selected
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PlaylistCover({
  playlistId,
  coverUrl,
  tracks,
  readOnly,
}: {
  playlistId: string;
  coverUrl: string | null;
  tracks: DetailTrack[];
  readOnly: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // First four covers form a 2×2 grid à la Spotify; fall back to one big cover
  // if there's only one unique cover, or the icon if there are none.
  const covers = useMemo(() => {
    if (coverUrl) return [coverUrl];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of tracks) {
      if (!t.coverUrl || seen.has(t.coverUrl)) continue;
      seen.add(t.coverUrl);
      out.push(t.coverUrl);
      if (out.length === 4) break;
    }
    return out;
  }, [coverUrl, tracks]);

  const upload = (file: File | undefined) => {
    if (!file) return;
    const formData = new FormData();
    formData.set("cover", file);
    setError(null);
    startTransition(async () => {
      const res = await uploadPlaylistCoverAction(playlistId, formData);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  const uploadControl = (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        onChange={(e) => {
          upload(e.target.files?.[0]);
          e.currentTarget.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="absolute inset-x-3 bottom-3 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-background/85 px-3 text-sm font-medium text-foreground opacity-0 shadow-lg backdrop-blur transition-opacity hover:bg-background group-hover/cover:opacity-100 group-focus-within/cover:opacity-100 disabled:opacity-70"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ImagePlus className="h-4 w-4" />
        )}
        {coverUrl ? "Change cover" : "Upload cover"}
      </button>
      {error && (
        <p className="absolute inset-x-3 top-3 rounded-md bg-destructive/90 px-2 py-1 text-xs text-destructive-foreground shadow">
          {error}
        </p>
      )}
    </>
  );

  if (covers.length === 0) {
    return (
      <div className="group/cover relative flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary text-muted-foreground/40 shadow-lg md:h-48 md:w-48">
        <ListMusic className="h-1/3 w-1/3" />
        {!readOnly && uploadControl}
      </div>
    );
  }

  if (covers.length === 1) {
    return (
      <div className="group/cover relative h-40 w-40 shrink-0 overflow-hidden rounded-lg bg-secondary shadow-lg md:h-48 md:w-48">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={covers[0]}
          alt=""
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover"
        />
        {!readOnly && (
          <>
            <div className="absolute inset-0 bg-background/0 transition-colors group-hover/cover:bg-background/20 group-focus-within/cover:bg-background/20" />
            {uploadControl}
          </>
        )}
      </div>
    );
  }

  return (
    <div className="group/cover relative grid h-40 w-40 shrink-0 grid-cols-2 grid-rows-2 overflow-hidden rounded-lg bg-secondary shadow-lg md:h-48 md:w-48">
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
      {!readOnly && (
        <>
          <div className="absolute inset-0 bg-background/0 transition-colors group-hover/cover:bg-background/20 group-focus-within/cover:bg-background/20" />
          {uploadControl}
        </>
      )}
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

function ShareToggleButton({
  playlistId,
  initialShared,
}: {
  playlistId: string;
  initialShared: boolean;
}) {
  const router = useRouter();
  const [shared, setShared] = useState(initialShared);
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    const next = !shared;
    setShared(next);
    startTransition(async () => {
      const res = await setPlaylistSharedAction(playlistId, next);
      if (!res.ok) {
        setShared(!next);
        return;
      }
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={shared}
      title={
        shared
          ? "Shared — anyone signed in can view this playlist."
          : "Private — only you can view this playlist."
      }
      className={cn(
        "inline-flex h-10 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors",
        shared
          ? "border-primary/40 bg-primary/10 text-foreground hover:bg-primary/15"
          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      )}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : shared ? (
        <Share2 className="h-4 w-4" />
      ) : (
        <Lock className="h-4 w-4" />
      )}
      {shared ? "Shared" : "Private"}
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
