"use client";

import {
  Disc3,
  Loader2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  X,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

export type PreviewTrack = {
  /** Stable per-track id used to highlight the active row. previewUrl works. */
  id: string;
  title: string;
  artistName: string;
  coverUrl: string | null;
  previewUrl: string;
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
};

type PlaybackState = "idle" | "loading" | "playing" | "paused";

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

  // Queue state lives in refs so the audio element's "ended" / "error"
  // listeners (registered once when the element is created) read the latest
  // values. Mirroring into useState would make them stale.
  const queueRef = useRef<QueueItem[] | null>(null);
  const queueIndexRef = useRef<number>(-1);
  const [queueVersion, setQueueVersion] = useState(0); // bump to re-render derived flags

  // Items in the active queue whose audio failed to load (404, codec, etc).
  // Surfaced to consumers via context so playlist rows can render an
  // "unavailable" badge instead of silently skipping. Cleared on a
  // structurally-different queue, on close, and per-id on a successful play.
  const [failedIds, setFailedIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
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

  const hasQueue = queueRef.current !== null;
  const hasNext = useMemo(() => {
    if (!queueRef.current) return false;
    return findNextPlayable(queueRef.current, queueIndexRef.current) !== -1;
    // queueVersion forces recompute when queue/index change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueVersion]);
  const hasPrev = useMemo(() => {
    if (!queueRef.current) return false;
    return findPrevPlayable(queueRef.current, queueIndexRef.current) !== -1;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueVersion]);

  const playUrlInElement = useCallback(
    (el: HTMLAudioElement, url: string) => {
      el.src = url;
      el.currentTime = 0;
      setCurrentTime(0);
      setDuration(0);
      setState("loading");
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
      });
      // Caller is responsible for ensuring item.streamUrl is non-null.
      playUrlInElement(el, item.streamUrl!);
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
      setQueueVersion((v) => v + 1);
      const el = audioRef.current;
      if (el) playQueueItem(el, queue[next]!);
    },
    [playQueueItem],
  );

  // Audio element is created lazily on the first play() so SSR doesn't trip,
  // and so we don't construct one for users who never preview anything.
  const ensureAudio = useCallback(() => {
    if (audioRef.current) return audioRef.current;
    const el = new Audio();
    el.preload = "none";
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
    el.addEventListener("timeupdate", () => setCurrentTime(el.currentTime));
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
      setQueueVersion((v) => v + 1);
      setCurrent(track);
      playUrlInElement(el, track.previewUrl);
    },
    [current, state, ensureAudio, playUrlInElement],
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
      setQueueVersion((v) => v + 1);
      playQueueItem(el, items[idx]!);
    },
    [ensureAudio, playQueueItem],
  );

  const next = useCallback(() => advance(1), [advance]);
  const prev = useCallback(() => advance(-1), [advance]);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el || !current) return;
    if (state === "playing") el.pause();
    else safePlay(el);
  }, [state, current]);

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
    setQueueVersion((v) => v + 1);
    setFailedIds(new Set());
    setCurrent(null);
    setState("idle");
    setCurrentTime(0);
    setDuration(0);
  }, []);

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
        onToggle={toggle}
        onNext={next}
        onPrev={prev}
        onSeek={seek}
        onClose={close}
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
  onToggle,
  onNext,
  onPrev,
  onSeek,
  onClose,
}: {
  current: PreviewTrack | null;
  state: PlaybackState;
  currentTime: number;
  duration: number;
  hasQueue: boolean;
  hasNext: boolean;
  hasPrev: boolean;
  onToggle: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSeek: (time: number) => void;
  onClose: () => void;
}) {
  const [coverOk, setCoverOk] = useState(true);

  if (!current) return null;

  const safeDuration = duration > 0 ? duration : 0;
  const pct = safeDuration > 0 ? (currentTime / safeDuration) * 100 : 0;

  return (
    <>
      {/* Spacer keeps page content from sitting under the fixed bar. */}
      <div className="h-20 shrink-0" aria-hidden />
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:left-56">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-4 py-3 md:gap-4 md:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3 md:flex-none md:w-64">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-secondary">
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
    </>
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
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform hover:scale-105"
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
          className="h-full bg-foreground transition-[width] duration-100 ease-linear"
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
          "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground",
          "[&::-webkit-slider-thumb]:opacity-0 group-hover:[&::-webkit-slider-thumb]:opacity-100",
          "[&::-webkit-slider-thumb]:transition-opacity",
          // Firefox thumb
          "[&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3",
          "[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground",
          "[&::-moz-range-thumb]:opacity-0 group-hover:[&::-moz-range-thumb]:opacity-100",
          "[&::-moz-range-thumb]:transition-opacity",
          disabled && "cursor-not-allowed",
        )}
      />
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
