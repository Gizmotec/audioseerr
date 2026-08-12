"use client";

/**
 * Shared download-state UI. Every "get me this track" button in the app runs the
 * same little state machine, so they all read the same way:
 *
 *   idle → starting → queued → downloading → finishing → complete → owned
 *
 * The old behaviour flipped straight to a checkmark the instant the *request*
 * was accepted, which reads as "you have this file" when in fact nothing had
 * been transferred yet. Now the button keeps a live ring while slskd works, the
 * artwork plays a short landing animation when the file is actually on disk, and
 * only then settles to a quiet check — which also means an owned track no longer
 * sits there offering a download button.
 *
 * Progress comes from DownloadsProvider (one poll loop for the whole app),
 * looked up by the request's mbid — the key a track row can compute on its own.
 */

import { Check, Download, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  useDownloadProgress,
  useDownloadsTick,
  useWatchDownload,
} from "@/components/DownloadsProgressProvider";
import { useToast } from "@/components/Toaster";
import { cn } from "@/lib/utils";

export type DownloadPhase =
  | "idle"
  | "starting"
  | "pending"
  | "queued"
  | "downloading"
  | "finishing"
  | "complete"
  | "owned"
  | "failed";

/** What a download server action has to report back for the UI to track it. */
export type DownloadSubmitResult =
  | {
      ok: true;
      /** Request mbid to follow — null when the action can't name one. */
      trackKey?: string | null;
      /** The file was already on disk, so there's nothing to transfer. */
      owned?: boolean;
    }
  | { ok: false; error: string };

export type DownloadState = {
  phase: DownloadPhase;
  /** 0–100 while downloading; null whenever there's no usable byte count. */
  percent: number | null;
  label: string;
  error: string | null;
  /** True from the click until the download settles one way or the other. */
  busy: boolean;
  start: () => void;
  /** Drop back to idle without a completion animation (used by unrequest). */
  reset: () => void;
};

/** How long the "it landed" celebration plays before settling to a check. */
const CELEBRATION_MS = 2400;

const FAILED_MESSAGE = "Download failed — try again.";

export function useDownloadState({
  trackKey = null,
  owned = false,
  active = false,
  noun = "track",
  subject = null,
  submit,
}: {
  /** Request mbid, when the caller knows it up front (album/playlist rows). */
  trackKey?: string | null;
  /** Server truth: this file is already in the user's library. */
  owned?: boolean;
  /** Server truth: a request for it is already in flight. */
  active?: boolean;
  /** Used to build labels — "track", "album", … */
  noun?: string;
  /** Track/album title, so a corner toast can say what actually failed. */
  subject?: string | null;
  /** Omit for a display-only tracker (a row that reports a download someone
   *  else's click started, e.g. auto-fetch on adding to a playlist). */
  submit?: () => Promise<DownloadSubmitResult>;
}): DownloadState {
  const [submitting, setSubmitting] = useState(false);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [awaiting, setAwaiting] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [landed, setLanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A cancelled request lingers in the poll snapshot until the next round trip,
  // so its key is ignored briefly to stop the row springing back to
  // "downloading" for one tick. The window is two polls, not forever — if the
  // cancel didn't actually take, reality wins and the row resumes.
  const [suppressed, setSuppressed] = useState<{
    key: string | null;
    fromTick: number;
  } | null>(null);

  const key = resolvedKey ?? trackKey;
  const polled = useDownloadProgress(key);
  const tick = useDownloadsTick();
  const item =
    suppressed && key === suppressed.key && tick <= suppressed.fromTick + 1
      ? undefined
      : polled;

  useEffect(() => {
    if (!suppressed) return;
    if (!polled || tick > suppressed.fromTick + 1) setSuppressed(null);
  }, [suppressed, polled, tick]);

  // A settled item is only here so a client that watched the transfer can close
  // it out; starting a progress render from one would replay old downloads.
  const live = item && !item.settled ? item : undefined;
  const moving =
    live?.state === "queued" || live?.state === "active" || live?.state === "done";

  // Hold the poll loop open while we're waiting on a request we just made — it
  // won't reach slskd for a few seconds, and the loop sleeps when idle. The
  // instance id is the fallback so two rows waiting on unknown keys don't share
  // (and cancel) one watcher.
  const instanceId = useId();
  useWatchDownload(awaiting || submitting ? (key ?? instanceId) : null);

  const sawItem = useRef(false);
  useEffect(() => {
    if (moving) sawItem.current = true;
  }, [moving]);

  const celebrate = useCallback(() => {
    setAwaiting(false);
    setLanded(true);
    setCelebrating(true);
  }, []);

  // Cancelling has to clear `sawItem` too, or the request disappearing from the
  // next poll would read as "it landed" and play the completion animation.
  const reset = useCallback(() => {
    sawItem.current = false;
    setAwaiting(false);
    setCelebrating(false);
    setLanded(false);
    setResolvedKey(null);
    setError(null);
    setSuppressed({ key, fromTick: tick });
  }, [key, tick]);

  useEffect(() => {
    if (!celebrating) return;
    const t = setTimeout(() => setCelebrating(false), CELEBRATION_MS);
    return () => clearTimeout(t);
  }, [celebrating]);

  // Decide what happened once we stop seeing movement. `tick` is in the deps so
  // a key vanishing from a *fresh* snapshot counts, while "we haven't polled
  // since the click" does not.
  useEffect(() => {
    if (!awaiting || submitting || moving) return;
    if (item?.state === "failed") {
      setAwaiting(false);
      setError(FAILED_MESSAGE);
      return;
    }
    const finished =
      (item?.settled && item.state === "done") ||
      owned ||
      (sawItem.current && !item);
    if (finished) celebrate();
  }, [awaiting, submitting, moving, item, owned, tick, celebrate]);

  // A download that started before this page loaded still deserves its finish.
  useEffect(() => {
    if (active && !owned) setAwaiting(true);
  }, [active, owned]);

  const start = useCallback(() => {
    if (!submit || submitting || awaiting || owned || landed) return;
    setError(null);
    setSuppressed(null);
    setSubmitting(true);
    void (async () => {
      try {
        const res = await submit();
        if (!res.ok) {
          setError(res.error);
          return;
        }
        if (res.trackKey) setResolvedKey(res.trackKey);
        if (res.owned) celebrate();
        else setAwaiting(true);
      } catch {
        setError("Something went wrong — try again.");
      } finally {
        setSubmitting(false);
      }
    })();
  }, [submitting, awaiting, owned, landed, submit, celebrate]);

  // Errors surface as a corner toast, not a bubble pinned to the button —
  // anchored to a cover tile the text just ran off the edge of the card.
  const toast = useToast();
  useEffect(() => {
    if (error) toast.error(error, subject);
  }, [error, subject, toast]);

  const failedItem =
    item?.state === "failed" ? item : undefined;

  let phase: DownloadPhase;
  let percent: number | null = null;
  if (celebrating) phase = "complete";
  else if (error || failedItem) phase = "failed";
  else if (submitting) phase = "starting";
  else if (live?.state === "done") phase = "finishing";
  else if (live?.state === "active") {
    phase = "downloading";
    percent = live.percent;
  } else if (live?.state === "queued")
    // Nothing is searching yet when the request still needs an admin's nod.
    phase = live.awaitingApproval ? "pending" : "queued";
  else if (awaiting) phase = "queued";
  else if (owned || landed) phase = "owned";
  else phase = "idle";

  return {
    phase,
    percent,
    label: labelFor(phase, percent, noun, error),
    error: error ?? (failedItem ? FAILED_MESSAGE : null),
    busy:
      phase === "starting" ||
      phase === "pending" ||
      phase === "queued" ||
      phase === "downloading" ||
      phase === "finishing",
    start,
    reset,
  };
}

function labelFor(
  phase: DownloadPhase,
  percent: number | null,
  noun: string,
  error: string | null,
): string {
  switch (phase) {
    case "starting":
      return "Starting download…";
    case "pending":
      return "Waiting for approval";
    case "queued":
      return "Queued — looking for a source…";
    case "downloading":
      return percent == null ? "Downloading…" : `Downloading — ${percent}%`;
    case "finishing":
      return "Finishing up…";
    case "complete":
      return "Download complete";
    case "owned":
      return `${noun[0].toUpperCase()}${noun.slice(1)} in your library`;
    case "failed":
      return error ?? "Download failed — tap to retry";
    default:
      return `Download ${noun}`;
  }
}

/* -------------------------------------------------------------------------- */
/* Ring                                                                        */
/* -------------------------------------------------------------------------- */

const TONE: Record<"pink" | "mint" | "red", string> = {
  pink: "text-pastel-pink",
  mint: "text-pastel-mint",
  red: "text-pastel-red",
};

/**
 * Circular progress drawn around a 32px-ish icon button. `pathLength` normalises
 * the circumference to 100 so the dash maths is just the percentage.
 */
export function DownloadRing({
  percent,
  tone = "pink",
  strokeWidth = 2.5,
  className,
}: {
  percent: number | null;
  tone?: keyof typeof TONE;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 36 36"
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 h-full w-full -rotate-90",
        TONE[tone],
        className,
      )}
    >
      <circle
        cx="18"
        cy="18"
        r="16"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="opacity-20"
      />
      {percent == null ? (
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="22 78"
          data-dl-anim="loop"
          style={{
            transformBox: "view-box",
            transformOrigin: "18px 18px",
            animation: "dl-spin 1.1s linear infinite",
          }}
        />
      ) : (
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset={100 - Math.max(2, percent)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      )}
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Row button                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The download control for list rows. While a transfer is live the ring tracks
 * it and the glyph swaps to an ✕ on hover, so cancelling stays one click away
 * without a second button competing for space.
 */
export function DownloadButton({
  state,
  onCancel,
  className,
  size = "md",
  variant = "ghost",
}: {
  state: DownloadState;
  /** Offered on hover while the download is in flight. */
  onCancel?: () => void;
  className?: string;
  size?: "sm" | "md";
  /** "solid" is the filled pill used over artwork; "ghost" suits list rows. */
  variant?: "ghost" | "solid";
}) {
  const { phase, percent, label } = state;
  const cancellable = state.busy && !!onCancel;
  const box = size === "sm" ? "h-7 w-7" : "h-8 w-8";
  const icon = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const smallIcon = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  if (phase === "owned") {
    // Nothing to draw: the absence of a download button is itself the signal
    // that the track is yours and ready to play. Keep the footprint so rows
    // don't reflow. A caller only passes onCancel for the recovery case (the
    // request says AVAILABLE but no file is on disk), where clearing it is the
    // way to retry — that keeps a control.
    if (!onCancel) {
      return <span className={cn("inline-block shrink-0", box, className)} aria-hidden />;
    }
    return (
      <span
        className={cn(
          "relative inline-flex shrink-0 items-center justify-center",
          box,
          className,
        )}
      >
        <button
          type="button"
          onClick={onCancel}
          title={`${label} — click to clear this request`}
          aria-label={`Clear request: ${label}`}
          className={cn(
            "group flex items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-surface-2 hover:text-foreground",
            box,
          )}
        >
          <Check
            className={cn(icon, "group-hover:hidden group-focus-visible:hidden")}
            strokeWidth={2.5}
          />
          <X
            className={cn(icon, "hidden group-hover:block group-focus-visible:block")}
          />
        </button>
      </span>
    );
  }

  // Ringed and lifted: a pastel pill sitting on a cover that happens to be the
  // same pastel (a yellow button on a yellow sleeve) is otherwise invisible.
  // Dark ring on the light fills, light ring on the dark one.
  const solid = cn(
    "shadow-sm ring-2",
    phase === "failed"
      ? "bg-pastel-red text-ink ring-ink/40 hover:bg-pastel-red/80"
      : phase === "complete"
        ? "bg-pastel-mint text-ink ring-ink/40"
        : state.busy
          ? "bg-ink/75 text-pastel-pink ring-white/25"
          : "bg-pastel-yellow text-ink ring-ink/40 hover:bg-pastel-yellow/80",
  );
  const ghost =
    phase === "failed"
      ? "text-pastel-red hover:bg-surface-2"
      : phase === "complete"
        ? "text-pastel-mint"
        : state.busy
          ? "text-pastel-pink"
          : "text-muted-foreground hover:bg-surface-2 hover:text-foreground";

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        box,
        className,
      )}
    >
      <button
        type="button"
        onClick={() => {
          if (cancellable) onCancel?.();
          else if (phase === "idle" || phase === "failed") state.start();
        }}
        disabled={state.busy && !cancellable}
        title={cancellable ? `${label} — click to cancel` : label}
        aria-label={cancellable ? `Cancel download: ${label}` : label}
        className={cn(
          "group relative flex items-center justify-center rounded-full transition-colors disabled:cursor-default",
          box,
          variant === "solid" ? solid : ghost,
        )}
      >
        {state.busy && (
          <DownloadRing
            percent={phase === "downloading" ? percent : null}
            tone="pink"
          />
        )}
        {phase === "complete" && (
          <>
            <DownloadRing percent={100} tone="mint" />
            <span
              className="pointer-events-none absolute inset-0 rounded-full border-2 border-pastel-mint"
              data-dl-anim=""
              style={{ animation: "dl-burst 700ms ease-out forwards" }}
            />
          </>
        )}

        {phase === "complete" ? (
          <Check
            className={icon}
            strokeWidth={3}
            data-dl-anim=""
            style={{ animation: "dl-pop 420ms cubic-bezier(.2,.9,.3,1.2) both" }}
          />
        ) : phase === "failed" ? (
          <X className={icon} />
        ) : phase === "starting" ? (
          <Loader2 className={cn(icon, "animate-spin")} />
        ) : cancellable ? (
          <>
            <Download
              className={cn(
                smallIcon,
                "group-hover:hidden group-focus-visible:hidden",
              )}
              data-dl-anim="loop"
              style={{ animation: "dl-breathe 1.8s ease-in-out infinite" }}
            />
            <X
              className={cn(
                smallIcon,
                "hidden group-hover:block group-focus-visible:block",
              )}
            />
          </>
        ) : state.busy ? (
          <Download
            className={smallIcon}
            data-dl-anim="loop"
            style={{ animation: "dl-breathe 1.8s ease-in-out infinite" }}
          />
        ) : (
          <Download className={icon} />
        )}
      </button>
    </span>
  );
}

/**
 * The "still looking" glyph: a reload ring sweeping round a magnifier that
 * flips on its axis. A hand-built SVG recreation of the supplied Lottie —
 * same motion, no animation runtime pulled into the bundle.
 */
function SearchingGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      stroke="currentColor"
      strokeWidth={31}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* Reload arc + its arrowhead, rotating as one. */}
      <g
        data-dl-anim="loop"
        style={{
          transformBox: "view-box",
          transformOrigin: "256px 256px",
          animation: "dl-spin 1.6s cubic-bezier(.7,0,.3,1) infinite",
        }}
      >
        <circle cx="256" cy="256" r="150" pathLength={100} strokeDasharray="70 30" />
        {/* Caret parked at the 70% mark, tangent to the arc. */}
        <path d="M -46 46 L 0 0 L 46 46" transform="translate(210 113) rotate(72)" />
      </g>
      {/* Magnifier, flipping the way the source animation does. */}
      <g
        data-dl-anim="loop"
        style={{
          transformBox: "view-box",
          transformOrigin: "250px 249px",
          animation: "dl-flip 1.6s cubic-bezier(.7,0,.3,1) infinite",
        }}
      >
        <circle cx="250" cy="249" r="58" />
        <path d="M292 293 L322 324" />
      </g>
    </svg>
  );
}

/**
 * The "bytes are moving" glyph: an eighth note squashing on the beat, little
 * notes drifting off it, and a download arrow dropping in and settling. Same
 * approach as SearchingGlyph — the supplied Lottie rebuilt as inline SVG, so
 * the mark inherits currentColor and no animation runtime ships with it.
 *
 * The composition sits off-centre in the source artboard; the outer translate
 * recentres it so the glyph is balanced at icon sizes.
 */
function DownloadingGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      fill="none"
      stroke="currentColor"
      strokeWidth={31}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <g transform="translate(-51 -59)">
        {/* Notes shaking loose, staggered so there's always one in flight. */}
        {[
          { cx: 300, cy: 208, delay: "0s" },
          { cx: 344, cy: 236, delay: "0.6s" },
          { cx: 268, cy: 246, delay: "1.2s" },
        ].map((n) => (
          <circle
            key={n.delay}
            cx={n.cx}
            cy={n.cy}
            r={15}
            fill="currentColor"
            stroke="none"
            data-dl-anim="loop"
            style={{
              transformBox: "view-box",
              transformOrigin: `${n.cx}px ${n.cy}px`,
              animation: `dl-note-rise 1.8s ${n.delay} ease-out infinite`,
            }}
          />
        ))}

        {/* The note itself — head plus stem and flag. */}
        <g
          data-dl-anim="loop"
          style={{
            transformBox: "view-box",
            transformOrigin: "256px 300px",
            animation: "dl-note-pulse 1.2s ease-in-out infinite",
          }}
        >
          <circle cx="229" cy="298" r="45" />
          <path d="M273 303 L290 169 L328 211" />
        </g>

        {/* Arrow dropping in below it. */}
        <g
          data-dl-anim="loop"
          style={{
            transformBox: "view-box",
            transformOrigin: "385px 390px",
            animation: "dl-arrow-drop 1.8s ease-in-out infinite",
          }}
        >
          <path d="M385 322 L385 437" />
          <path d="M339 414 L385 460 L431 414" />
        </g>
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* Artwork overlay                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Progress drawn *around* a cover: an outline that fills as bytes arrive, then a
 * sheen + burst when the file lands, then it clears itself away. Drop it inside
 * the artwork's `relative` wrapper.
 *
 * `rx` is the corner radius in viewBox units (the box is normalised to 100×100),
 * so it should mirror the cover's own rounding — 50 for a fully-round thumbnail,
 * ~9 for a `rounded-md` card.
 */
export function ArtworkDownloadOverlay({
  phase,
  percent,
  rx = 14,
  strokeWidth = 4,
  size = "sm",
  className,
}: {
  phase: DownloadPhase;
  percent: number | null;
  rx?: number;
  strokeWidth?: number;
  /** Scales the centred glyph. "sm" (a 40px row thumbnail) drops the percentage
   *  entirely — there's no room to read it. */
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const busy =
    phase === "starting" ||
    phase === "pending" ||
    phase === "queued" ||
    phase === "downloading" ||
    phase === "finishing";

  if (!busy && phase !== "complete") return null;

  const inset = strokeWidth / 2;
  // Rect side in viewBox units, inset by half the stroke so it isn't clipped.
  const side = 100 - strokeWidth;

  if (phase === "complete") {
    return (
      <span
        className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
        aria-hidden
        data-dl-anim=""
        style={{
          borderRadius: "inherit",
          animation: `dl-settle ${CELEBRATION_MS}ms ease-out forwards`,
        }}
      >
        <span
          className="absolute inset-0 bg-pastel-mint/25"
          data-dl-anim=""
          style={{ animation: "dl-glow 900ms ease-out forwards" }}
        />
        {/* Light sweeping across the cover. */}
        <span
          className="absolute inset-y-0 -left-1/3 w-1/3 bg-gradient-to-r from-transparent via-white/70 to-transparent"
          data-dl-anim=""
          style={{ animation: "dl-sheen 900ms ease-out forwards" }}
        />
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="absolute inset-0 h-full w-full text-pastel-mint"
          data-dl-anim=""
          style={{ animation: "dl-burst 900ms 200ms ease-out forwards" }}
        >
          <rect
            x={inset}
            y={inset}
            width={side}
            height={side}
            rx={rx}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center">
          <span
            className={cn(
              "inline-flex items-center justify-center rounded-full bg-pastel-mint text-ink shadow-lg ring-2 ring-ink/30",
              size === "lg" ? "h-14 w-14" : size === "md" ? "h-9 w-9" : "h-6 w-6",
            )}
            data-dl-anim=""
            style={{ animation: "dl-pop 480ms cubic-bezier(.2,.9,.3,1.2) both" }}
          >
            <Check
              className={
                size === "lg" ? "h-8 w-8" : size === "md" ? "h-5 w-5" : "h-3.5 w-3.5"
              }
              strokeWidth={3}
            />
          </span>
        </span>
      </span>
    );
  }

  const determinate = phase === "downloading" && percent != null;
  // No byte count yet — we're still finding a source rather than transferring.
  const searching = !determinate && phase !== "finishing";
  const glyph =
    size === "lg" ? "h-9 w-9" : size === "md" ? "h-7 w-7" : "h-4 w-4";

  return (
    <span
      className={cn(
        "pointer-events-none absolute inset-0 bg-ink/45 backdrop-blur-[1px]",
        className,
      )}
      style={{ borderRadius: "inherit" }}
      aria-hidden
    >
      {/* No background track ring — an unfilled outline just reads as an ugly
          hairline border around the cover. Only the live line is drawn. */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full text-pastel-pink"
      >
        {determinate ? (
          <rect
            x={inset}
            y={inset}
            width={side}
            height={side}
            rx={rx}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="100"
            strokeDashoffset={100 - Math.max(2, percent!)}
            className="transition-[stroke-dashoffset] duration-700 ease-out"
          />
        ) : (
          /* One continuous segment lapping the cover while we search. */
          <rect
            x={inset}
            y={inset}
            width={side}
            height={side}
            rx={rx}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray="24 76"
            data-dl-anim="loop"
            style={{ animation: "dl-orbit 2.6s linear infinite" }}
          />
        )}
      </svg>

      <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-white">
        {searching ? (
          <SearchingGlyph className={glyph} />
        ) : (
          <DownloadingGlyph className={glyph} />
        )}
        {size !== "sm" && (
          <span
            className={cn(
              "font-bold tabular-nums",
              size === "lg" ? "text-sm" : "text-[11px]",
            )}
          >
            {determinate
              ? `${percent}%`
              : phase === "finishing"
                ? "Finishing up"
                : phase === "pending"
                  ? "Awaiting approval"
                  : "Searching…"}
          </span>
        )}
      </span>
    </span>
  );
}

