"use client";

import {
  Disc3,
  Heart,
  Loader2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  getTrackLikedAction,
  toggleTrackLikeAction,
  type TrackLikeInput,
} from "@/lib/actions/likes";
import { recordPlayAction } from "@/lib/actions/plays";
import { cn } from "@/lib/utils";

/**
 * Identifying metadata used to record a play in PlayHistory. Omit (or pass
 * recordingMbid as undefined) for ephemeral previews that shouldn't scrobble —
 * e.g. 30-second Deezer auditions on the artist page.
 */
type ScrobbleMeta = {
  recordingMbid: string;
  albumMbid?: string | null;
  artistName: string;
  title: string;
  durationMs?: number | null;
};

/**
 * Identity the player bar's heart uses to like the current track. `recordingMbid`
 * here is the REAL MusicBrainz recording id — distinct from PreviewTrack's
 * scrobble `recordingMbid`, which may be a `lidarr:`/`local:` pseudo-id. Preview
 * rows pass null ids and rely on `albumTitle` (with title+artist) to resolve on
 * click. Omit `likeSeed` entirely for tracks that can't be liked.
 */
export type TrackLikeSeed = {
  recordingMbid: string | null;
  albumMbid: string | null;
  albumPosition: number | null;
  albumTitle: string | null;
};

export type PreviewTrack = {
  /** Stable per-track id used to highlight the active row. previewUrl works. */
  id: string;
  title: string;
  artistName: string;
  coverUrl: string | null;
  previewUrl: string;
  /** Recording MBID (or `lidarr:<id>` pseudo-id). Required for scrobbling. */
  recordingMbid?: string;
  albumMbid?: string | null;
  durationMs?: number | null;
  likeSeed?: TrackLikeSeed | null;
};

/**
 * Item in a playback queue. `streamUrl` may be null — the player will skip
 * those entries when auto-advancing or stepping with next/prev.
 */
export type QueueItem = {
  id: string;
  title: string;
  artistName: string;
  coverUrl: string | null;
  streamUrl: string | null;
  /** Recording MBID (or `lidarr:<id>` pseudo-id). Required for scrobbling. */
  recordingMbid?: string;
  albumMbid?: string | null;
  durationMs?: number | null;
  /** Identity for the player-bar heart. See TrackLikeSeed. */
  likeSeed?: TrackLikeSeed | null;
};

// Last.fm-style threshold: a play counts after 50% of the track OR 4 minutes,
// whichever is sooner. Tracks shorter than 30s never count. Mirrored on the
// server (src/lib/playHistory.ts) for documentation; the client decides.
const SCROBBLE_MIN_DURATION_S = 30;
const SCROBBLE_MAX_THRESHOLD_S = 4 * 60;

function scrobbleMetaFor(
  source: PreviewTrack | QueueItem | null,
): ScrobbleMeta | null {
  if (!source?.recordingMbid) return null;
  return {
    recordingMbid: source.recordingMbid,
    albumMbid: source.albumMbid ?? null,
    artistName: source.artistName,
    title: source.title,
    durationMs: source.durationMs ?? null,
  };
}

type PlaybackState = "idle" | "loading" | "playing" | "paused";
type QueueControls = {
  hasQueue: boolean;
  hasNext: boolean;
  hasPrev: boolean;
};

type ContextValue = {
  current: PreviewTrack | null;
  state: PlaybackState;
  hasQueue: boolean;
  hasNext: boolean;
  hasPrev: boolean;
  /** Queue item ids that errored on load. Cleared on a structurally-new queue
   *  or when the same id later plays successfully. */
  failedIds: ReadonlySet<string>;
  play: (track: PreviewTrack) => void;
  playQueue: (items: QueueItem[], startIndex?: number) => void;
  next: () => void;
  prev: () => void;
  toggle: () => void;
  isCurrent: (id: string) => boolean;
  isFailed: (id: string) => boolean;
};

const PreviewPlayerContext = createContext<ContextValue | null>(null);
const PREVIEW_PLAYER_BOTTOM_OFFSET = "7rem";
const DEFAULT_QUEUE_CONTROLS: QueueControls = {
  hasQueue: false,
  hasNext: false,
  hasPrev: false,
};

function readStoredVolume(): number {
  if (typeof window === "undefined") return 1;
  const stored = window.localStorage.getItem("audioseerr.volume");
  if (stored === null) return 1;
  const value = Number(stored);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : 1;
}

function readStoredMuted(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("audioseerr.muted") === "true";
}

export function usePreviewPlayer(): ContextValue {
  const v = useContext(PreviewPlayerContext);
  if (!v) {
    throw new Error("usePreviewPlayer must be used within PreviewPlayerProvider");
  }
  return v;
}

export function PreviewPlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<PreviewTrack | null>(null);
  const [state, setState] = useState<PlaybackState>("idle");
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(readStoredVolume);
  const [muted, setMutedState] = useState(readStoredMuted);

  // Queue state lives in refs so the audio element's "ended" / "error"
  // listeners (registered once when the element is created) read the latest
  // values. Mirroring into useState would make them stale.
  const queueRef = useRef<QueueItem[] | null>(null);
  const queueIndexRef = useRef<number>(-1);
  const [queueControls, setQueueControls] = useState<QueueControls>(
    DEFAULT_QUEUE_CONTROLS,
  );

  // Items in the active queue whose audio failed to load (404, codec, etc).
  // Surfaced to consumers via context so playlist rows can render an
  // "unavailable" badge instead of silently skipping. Cleared on a
  // structurally-different queue, on close, and per-id on a successful play.
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  // Volume + mute, persisted to localStorage. Refs mirror the state so the
  // audio element (created lazily in ensureAudio) can read the latest value
  // at construction time without us having to re-create the listeners.
  const volumeRef = useRef(volume);
  const mutedRef = useRef(muted);

  // Per-track scrobble state. Reset whenever a new track starts; cleared on
  // close. The "scrobbled" flag prevents double-recording when the user
  // scrubs back and re-crosses the threshold within the same playthrough.
  const scrobbleRef = useRef<{
    meta: ScrobbleMeta;
    scrobbled: boolean;
  } | null>(null);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (current) {
      root.style.setProperty(
        "--preview-player-bottom-offset",
        PREVIEW_PLAYER_BOTTOM_OFFSET,
      );
    } else {
      root.style.removeProperty("--preview-player-bottom-offset");
    }
    return () => {
      root.style.removeProperty("--preview-player-bottom-offset");
    };
  }, [current]);

  const setVolume = useCallback((v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    volumeRef.current = clamped;
    setVolumeState(clamped);
    if (audioRef.current) audioRef.current.volume = clamped;
    if (typeof window !== "undefined") {
      window.localStorage.setItem("audioseerr.volume", String(clamped));
    }
    // Dragging the slider above zero while muted is implicitly an unmute —
    // matches what Spotify/YouTube do and avoids the "why no sound?" trap.
    if (mutedRef.current && clamped > 0) {
      mutedRef.current = false;
      setMutedState(false);
      if (audioRef.current) audioRef.current.muted = false;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("audioseerr.muted", "false");
      }
    }
  }, []);

  const toggleMute = useCallback(() => {
    const next = !mutedRef.current;
    mutedRef.current = next;
    setMutedState(next);
    if (audioRef.current) audioRef.current.muted = next;
    if (typeof window !== "undefined") {
      window.localStorage.setItem("audioseerr.muted", String(next));
    }
  }, []);
  const markFailed = useCallback((id: string) => {
    setFailedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);
  const clearFailed = useCallback((id: string) => {
    setFailedIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const refreshQueueControls = useCallback(() => {
    const queue = queueRef.current;
    const index = queueIndexRef.current;
    setQueueControls(
      queue
        ? {
            hasQueue: true,
            hasNext: findNextPlayable(queue, index) !== -1,
            hasPrev: findPrevPlayable(queue, index) !== -1,
          }
        : DEFAULT_QUEUE_CONTROLS,
    );
  }, []);

  const { hasQueue, hasNext, hasPrev } = queueControls;

  const playUrlInElement = useCallback(
    (el: HTMLAudioElement, url: string, meta: ScrobbleMeta | null) => {
      el.src = url;
      el.currentTime = 0;
      setCurrentTime(0);
      setDuration(0);
      setState("loading");
      scrobbleRef.current = meta ? { meta, scrobbled: false } : null;
      el.play().catch(() => {
        // Errors here trip the "error" event below, which handles auto-advance
        // in queue mode. Swallow so React doesn't show an unhandled rejection.
      });
    },
    [],
  );

  const playQueueItem = useCallback(
    (el: HTMLAudioElement, item: QueueItem) => {
      setCurrent({
        id: item.id,
        title: item.title,
        artistName: item.artistName,
        coverUrl: item.coverUrl,
        previewUrl: item.streamUrl ?? "",
        recordingMbid: item.recordingMbid,
        albumMbid: item.albumMbid ?? null,
        durationMs: item.durationMs ?? null,
        likeSeed: item.likeSeed ?? null,
      });
      // Caller is responsible for ensuring item.streamUrl is non-null.
      playUrlInElement(el, item.streamUrl!, scrobbleMetaFor(item));
    },
    [playUrlInElement],
  );

  const advance = useCallback(
    (direction: 1 | -1) => {
      const queue = queueRef.current;
      if (!queue) return;
      const next =
        direction === 1
          ? findNextPlayable(queue, queueIndexRef.current)
          : findPrevPlayable(queue, queueIndexRef.current);
      if (next === -1) {
        // End of queue reached. Tear down playback but leave the queue in
        // place so the user can hit Prev to go back.
        const el = audioRef.current;
        if (el) {
          el.pause();
          el.removeAttribute("src");
          el.load();
        }
        setState("idle");
        setCurrentTime(0);
        setDuration(0);
        return;
      }
      queueIndexRef.current = next;
      refreshQueueControls();
      const el = audioRef.current;
      if (el) playQueueItem(el, queue[next]!);
    },
    [playQueueItem, refreshQueueControls],
  );

  // Audio element is created lazily on the first play() so SSR doesn't trip,
  // and so we don't construct one for users who never preview anything.
  const ensureAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const el = new Audio();
    el.preload = "none";
    el.volume = volumeRef.current;
    el.muted = mutedRef.current;
    el.addEventListener("waiting", () => setState("loading"));
    el.addEventListener("playing", () => {
      setState("playing");
      // Track is actually playing — if it had been marked failed in a previous
      // attempt this session, clear that so the row stops showing "Unavailable".
      const queue = queueRef.current;
      const idx = queueIndexRef.current;
      if (queue && idx >= 0) {
        const item = queue[idx];
        if (item) clearFailed(item.id);
      }
    });
    el.addEventListener("pause", () =>
      setState((s) => (s === "playing" ? "paused" : s)),
    );
    el.addEventListener("ended", () => {
      if (queueRef.current) {
        advance(1);
      } else {
        setState("idle");
        setCurrentTime(0);
      }
    });
    el.addEventListener("timeupdate", () => {
      setCurrentTime(el.currentTime);
      const entry = scrobbleRef.current;
      if (!entry || entry.scrobbled) return;
      const dur = el.duration;
      if (!Number.isFinite(dur) || dur < SCROBBLE_MIN_DURATION_S) return;
      const played = el.currentTime;
      if (played < dur * 0.5 && played < SCROBBLE_MAX_THRESHOLD_S) return;
      entry.scrobbled = true;
      void recordPlayAction({
        ...entry.meta,
        playedMs: Math.round(played * 1000),
      }).catch(() => {
        // Don't break playback if the server hiccups — the play just isn't
        // recorded for this session.
      });
    });
    el.addEventListener("loadedmetadata", () =>
      setDuration(Number.isFinite(el.duration) ? el.duration : 0),
    );
    el.addEventListener("error", () => {
      // In queue mode, a load failure (404, codec issue, network blip) means
      // we transparently skip to the next playable track and remember that
      // this id failed so the playlist UI can show it as unavailable. We
      // won't loop forever — the queue is finite.
      const queue = queueRef.current;
      const idx = queueIndexRef.current;
      if (queue && idx >= 0) {
        const item = queue[idx];
        if (item) markFailed(item.id);
        advance(1);
      } else {
        setState("idle");
        setCurrentTime(0);
      }
    });
    audioRef.current = el;
    return el;
  }, [advance, markFailed, clearFailed]);

  const safePlay = (el: HTMLAudioElement) => {
    el.play().catch(() => {});
  };

  const play = useCallback(
    (track: PreviewTrack) => {
      const el = ensureAudio();
      // Single-track play clears any active queue. Same track → toggle.
      if (queueRef.current === null && current?.id === track.id) {
        if (state === "playing") el.pause();
        else safePlay(el);
        return;
      }
      queueRef.current = null;
      queueIndexRef.current = -1;
      refreshQueueControls();
      setCurrent(track);
      playUrlInElement(el, track.previewUrl, scrobbleMetaFor(track));
    },
    [current, state, ensureAudio, playUrlInElement, refreshQueueControls],
  );

  const playQueue = useCallback(
    (items: QueueItem[], startIndex = 0) => {
      if (items.length === 0) return;
      const el = ensureAudio();
      // Find the first playable item at or after startIndex; if none, look
      // before. Prevents a silent no-op when the user hits Play on a
      // playlist whose first row happens to be unavailable.
      const startSearch = Math.max(0, Math.min(startIndex, items.length - 1));
      let idx = items[startSearch]?.streamUrl
        ? startSearch
        : findNextPlayable(items, startSearch - 1);
      if (idx === -1) idx = findPrevPlayable(items, startSearch + 1);
      if (idx === -1) return; // nothing playable in this queue at all
      // A new queue (different items reference) means a fresh session — drop
      // any "failed" markers from the previous one so they don't leak across
      // playlists. Same reference (e.g. user retrying within the same view)
      // keeps the markers so the unavailable badges stay visible.
      if (queueRef.current !== items) {
        setFailedIds(new Set());
      }
      queueRef.current = items;
      queueIndexRef.current = idx;
      refreshQueueControls();
      playQueueItem(el, items[idx]!);
    },
    [ensureAudio, playQueueItem, refreshQueueControls],
  );

  const next = useCallback(() => advance(1), [advance]);
  const prev = useCallback(() => advance(-1), [advance]);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el || !current) return;
    if (state === "playing") el.pause();
    else safePlay(el);
  }, [state, current]);

  // Global Space → play/pause, matching what users expect from Spotify, YouTube
  // Music, etc. Skipped when focus is inside an editable element, when a
  // modifier key is held (so Cmd-Space / Ctrl-Space still hit the OS), and
  // when there's no track loaded.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" && e.key !== " ") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!current) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      e.preventDefault();
      toggle();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [current, toggle]);

  const seek = useCallback((time: number) => {
    const el = audioRef.current;
    if (!el || !Number.isFinite(time)) return;
    const max = el.duration || 0;
    el.currentTime = Math.max(0, Math.min(time, max));
    setCurrentTime(el.currentTime);
  }, []);

  const close = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.removeAttribute("src");
      el.load();
    }
    queueRef.current = null;
    queueIndexRef.current = -1;
    scrobbleRef.current = null;
    refreshQueueControls();
    setFailedIds(new Set());
    setCurrent(null);
    setState("idle");
    setCurrentTime(0);
    setDuration(0);
  }, [refreshQueueControls]);

  const isCurrent = useCallback(
    (id: string) => current?.id === id,
    [current],
  );

  const isFailed = useCallback(
    (id: string) => failedIds.has(id),
    [failedIds],
  );

  const value = useMemo<ContextValue>(
    () => ({
      current,
      state,
      hasQueue,
      hasNext,
      hasPrev,
      failedIds,
      play,
      playQueue,
      next,
      prev,
      toggle,
      isCurrent,
      isFailed,
    }),
    [current, state, hasQueue, hasNext, hasPrev, failedIds, play, playQueue, next, prev, toggle, isCurrent, isFailed],
  );

  return (
    <PreviewPlayerContext.Provider value={value}>
      {children}
      <PreviewPlayerBar
        current={current}
        state={state}
        currentTime={currentTime}
        duration={duration}
        hasQueue={hasQueue}
        hasNext={hasNext}
        hasPrev={hasPrev}
        volume={volume}
        muted={muted}
        onToggle={toggle}
        onNext={next}
        onPrev={prev}
        onSeek={seek}
        onClose={close}
        onVolumeChange={setVolume}
        onToggleMute={toggleMute}
      />
    </PreviewPlayerContext.Provider>
  );
}

function findNextPlayable(items: QueueItem[], from: number): number {
  for (let i = from + 1; i < items.length; i++) {
    if (items[i]!.streamUrl) return i;
  }
  return -1;
}

function findPrevPlayable(items: QueueItem[], from: number): number {
  for (let i = from - 1; i >= 0; i--) {
    if (items[i]!.streamUrl) return i;
  }
  return -1;
}

function PreviewPlayerBar({
  current,
  state,
  currentTime,
  duration,
  hasQueue,
  hasNext,
  hasPrev,
  volume,
  muted,
  onToggle,
  onNext,
  onPrev,
  onSeek,
  onClose,
  onVolumeChange,
  onToggleMute,
}: {
  current: PreviewTrack | null;
  state: PlaybackState;
  currentTime: number;
  duration: number;
  hasQueue: boolean;
  hasNext: boolean;
  hasPrev: boolean;
  volume: number;
  muted: boolean;
  onToggle: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (time: number) => void;
  onClose: () => void;
  onVolumeChange: (v: number) => void;
  onToggleMute: () => void;
}) {
  const [coverOk, setCoverOk] = useState(true);

  if (!current) return null;

  const safeDuration = duration > 0 ? duration : 0;
  const pct = safeDuration > 0 ? (currentTime / safeDuration) * 100 : 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-foreground/10 bg-surface transition-[left] duration-200 md:left-[var(--sidebar-width)]">
      <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 md:gap-4 md:px-6">
        <div className="flex min-w-0 flex-1 items-center gap-3 md:flex-none md:w-64">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-secondary">
            {coverOk && current.coverUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={current.coverUrl}
                src={current.coverUrl}
                alt=""
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
                onError={() => setCoverOk(false)}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground/40">
                <Disc3 className="h-1/2 w-1/2" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={current.title}>
              {current.title}
            </p>
            <p
              className="truncate text-xs text-muted-foreground"
              title={current.artistName}
            >
              {current.artistName}
            </p>
          </div>
          <BarLikeButton current={current} />
        </div>

        <div className="hidden flex-1 items-center gap-3 md:flex">
          {hasQueue && (
            <SkipButton
              direction="prev"
              disabled={!hasPrev}
              onClick={onPrev}
            />
          )}
          <PlayPauseButton state={state} onClick={onToggle} />
          {hasQueue && (
            <SkipButton
              direction="next"
              disabled={!hasNext}
              onClick={onNext}
            />
          )}
          <TimeText value={currentTime} />
          <Scrubber
            currentTime={currentTime}
            duration={safeDuration}
            pct={pct}
            onSeek={onSeek}
          />
          <TimeText value={safeDuration} muted />
          <VolumeControl
            volume={volume}
            muted={muted}
            onVolumeChange={onVolumeChange}
            onToggleMute={onToggleMute}
          />
        </div>

        <div className="flex items-center gap-1 md:hidden">
          {hasQueue && (
            <SkipButton
              direction="prev"
              disabled={!hasPrev}
              onClick={onPrev}
            />
          )}
          <PlayPauseButton state={state} onClick={onToggle} />
          {hasQueue && (
            <SkipButton
              direction="next"
              disabled={!hasNext}
              onClick={onNext}
            />
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close preview"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="md:hidden">
        <Scrubber
          currentTime={currentTime}
          duration={safeDuration}
          pct={pct}
          onSeek={onSeek}
          compact
        />
      </div>
    </div>
  );
}

function BarLikeButton({ current }: { current: PreviewTrack }) {
  const seed = current.likeSeed ?? null;
  // Likeable when we have a real recording id, or enough to resolve a preview
  // on click (an album title to search MusicBrainz with).
  const likeable = !!seed && (!!seed.recordingMbid || !!seed.albumTitle);
  const recordingMbid = seed?.recordingMbid ?? null;

  // Liked state is scoped to a track id, so when the track changes it derives
  // back to "unliked" during render (no synchronous setState in the effect).
  const [likeFor, setLikeFor] = useState<{ id: string; liked: boolean } | null>(
    null,
  );
  const [pending, startTransition] = useTransition();
  const liked = likeFor?.id === current.id ? likeFor.liked : false;

  // When a track with a real recording MBID starts, reflect its true liked
  // state (one cheap indexed lookup). Preview-only tracks stay unliked — the
  // toggle self-corrects from the server reply on the first click.
  useEffect(() => {
    if (!recordingMbid) return;
    let active = true;
    const id = current.id;
    getTrackLikedAction(recordingMbid)
      .then((v) => {
        if (active) setLikeFor({ id, liked: v });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [current.id, recordingMbid]);

  if (!likeable || !seed) return null;

  const submit = () => {
    if (pending) return;
    const id = current.id;
    const next = !liked;
    setLikeFor({ id, liked: next });
    startTransition(async () => {
      const input: TrackLikeInput = {
        recordingMbid: seed.recordingMbid,
        albumMbid: seed.albumMbid,
        albumPosition: seed.albumPosition,
        albumTitle: seed.albumTitle,
        title: current.title,
        artistName: current.artistName,
        coverUrl: current.coverUrl,
        durationMs: current.durationMs ?? null,
      };
      const res = await toggleTrackLikeAction(input);
      setLikeFor({ id, liked: res.ok ? res.liked : !next });
    });
  };

  return (
    <button
      type="button"
      onClick={submit}
      aria-pressed={liked}
      aria-label={liked ? `Unlike ${current.title}` : `Like ${current.title}`}
      title={liked ? "Unlike" : "Like"}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
        liked
          ? "text-pastel-pink hover:text-pastel-pink/80"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      {pending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Heart
          className="h-4 w-4"
          fill={liked ? "currentColor" : "none"}
          strokeWidth={liked ? 0 : 2}
        />
      )}
    </button>
  );
}

function PlayPauseButton({
  state,
  onClick,
}: {
  state: PlaybackState;
  onClick: () => void;
}) {
  const playing = state === "playing";
  const loading = state === "loading";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={playing ? "Pause" : "Play"}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-pastel-pink text-ink transition-transform hover:scale-105"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : playing ? (
        <Pause className="h-4 w-4" fill="currentColor" />
      ) : (
        <Play className="h-4 w-4 translate-x-px" fill="currentColor" />
      )}
    </button>
  );
}

function SkipButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "next" | "prev";
  disabled: boolean;
  onClick: () => void;
}) {
  const Icon = direction === "next" ? SkipForward : SkipBack;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "next" ? "Next track" : "Previous track"}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
        disabled
          ? "text-muted-foreground/30"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

function TimeText({ value, muted = false }: { value: number; muted?: boolean }) {
  return (
    <span
      className={cn(
        "w-10 shrink-0 text-xs tabular-nums",
        muted ? "text-muted-foreground/70" : "text-muted-foreground",
      )}
    >
      {formatTime(value)}
    </span>
  );
}

function Scrubber({
  currentTime,
  duration,
  pct,
  onSeek,
  compact = false,
}: {
  currentTime: number;
  duration: number;
  pct: number;
  onSeek: (time: number) => void;
  compact?: boolean;
}) {
  const max = duration > 0 ? duration : 0;
  const disabled = max === 0;

  return (
    <div
      className={cn(
        "group relative flex flex-1 items-center",
        compact ? "h-1" : "h-4",
      )}
    >
      <div
        className={cn(
          "absolute inset-x-0 overflow-hidden rounded-full bg-secondary",
          compact ? "h-1" : "top-1/2 h-1 -translate-y-1/2",
        )}
      >
        <div
          className="h-full bg-pastel-pink transition-[width] duration-100 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
      <input
        type="range"
        min={0}
        max={max || 1}
        step={0.1}
        value={Math.min(currentTime, max)}
        onChange={(e) => onSeek(Number(e.target.value))}
        disabled={disabled}
        aria-label="Seek"
        className={cn(
          "relative w-full cursor-pointer appearance-none bg-transparent",
          compact ? "h-1" : "h-4",
          // WebKit thumb
          "[&::-webkit-slider-thumb]:appearance-none",
          "[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3",
            "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pastel-pink",
          "[&::-webkit-slider-thumb]:opacity-0 group-hover:[&::-webkit-slider-thumb]:opacity-100",
          "[&::-webkit-slider-thumb]:transition-opacity",
          // Firefox thumb
          "[&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3",
            "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-pastel-pink",
          "[&::-moz-range-thumb]:opacity-0 group-hover:[&::-moz-range-thumb]:opacity-100",
          "[&::-moz-range-thumb]:transition-opacity",
          disabled && "cursor-not-allowed",
        )}
      />
    </div>
  );
}

function VolumeControl({
  volume,
  muted,
  onVolumeChange,
  onToggleMute,
}: {
  volume: number;
  muted: boolean;
  onVolumeChange: (v: number) => void;
  onToggleMute: () => void;
}) {
  const effective = muted ? 0 : volume;
  const Icon =
    muted || volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={onToggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <Icon className="h-4 w-4" />
      </button>
      <div className="group relative flex h-4 w-20 items-center">
        <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-pastel-pink transition-[width] duration-100 ease-linear"
            style={{ width: `${effective * 100}%` }}
          />
        </div>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={effective}
          onChange={(e) => onVolumeChange(Number(e.target.value))}
          aria-label="Volume"
          className={cn(
            "relative h-4 w-full cursor-pointer appearance-none bg-transparent",
            "[&::-webkit-slider-thumb]:appearance-none",
            "[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3",
          "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pastel-pink",
            "[&::-webkit-slider-thumb]:opacity-0 group-hover:[&::-webkit-slider-thumb]:opacity-100",
            "[&::-webkit-slider-thumb]:transition-opacity",
            "[&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3",
          "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-pastel-pink",
            "[&::-moz-range-thumb]:opacity-0 group-hover:[&::-moz-range-thumb]:opacity-100",
            "[&::-moz-range-thumb]:transition-opacity",
          )}
        />
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
