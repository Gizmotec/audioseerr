"use client";

import { Loader2, MicVocal, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getLyricsAction } from "@/lib/actions/lyrics";
import { activeLrcLineIndex, parseLrc, type LrcLine } from "@/lib/lrc";
import { usePreviewPlayer, usePreviewTime } from "@/components/PreviewPlayer";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Props = {
  artistName: string;
  trackTitle: string;
  albumTitle?: string | null;
  durationMs?: number | null;
  /**
   * The queue id the album page gives the player for this row — used to tell
   * whether THIS track is the one currently playing (drives live sync).
   */
  playerTrackId: string;
  /**
   * Synced lyrics are timestamped against the full recording, so live
   * highlighting is only meaningful for full-library streams, not 30s
   * previews (a Deezer preview is a mid-song slice with unknown offset).
   */
  liveSync: boolean;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "not_found" }
  | {
      kind: "ok";
      synced: string | null;
      plain: string | null;
      instrumental: boolean;
    };

/**
 * Per-track lyrics button. Opens a modal (same shell as the YouTube player)
 * with the track's lyrics: synced LRC rendered line-by-line with the active
 * line following playback, plain lyrics as pre-wrapped text, or an
 * "Instrumental" badge when LRClib flags the track.
 */
export function LyricsButton({
  artistName,
  trackTitle,
  albumTitle,
  durationMs,
  playerTrackId,
  liveSync,
}: Props) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<LoadState | null>(null);
  const player = usePreviewPlayer();
  const reqIdRef = useRef(0);

  const load = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setState({ kind: "loading" });
    const result = await getLyricsAction({
      artist: artistName,
      title: trackTitle,
      album: albumTitle ?? null,
      durationS: durationMs ? Math.round(durationMs / 1000) : null,
    });
    if (reqId !== reqIdRef.current) return; // stale click, modal closed mid-load
    if (result.status === "ok") {
      setState({
        kind: "ok",
        synced: result.synced,
        plain: result.plain,
        instrumental: result.instrumental,
      });
    } else {
      setState({ kind: result.status });
    }
  }, [artistName, trackTitle, albumTitle, durationMs]);

  const show = useCallback(() => {
    setOpen(true);
    // First open fetches; reopening reuses the loaded state (lyrics are
    // stable) — an explicit Retry is the way to refetch after an error.
    if (!state || state.kind === "error") void load();
  }, [state, load]);

  const close = useCallback(() => setOpen(false), []);

  const isLive =
    liveSync &&
    player.isCurrent(playerTrackId) &&
    (player.state === "playing" || player.state === "paused");

  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label={`Show lyrics for "${trackTitle}"`}
        title="Lyrics"
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <MicVocal className="h-4 w-4" />
      </button>
      {open && (
        <LyricsModal
          artistName={artistName}
          trackTitle={trackTitle}
          state={state ?? { kind: "loading" }}
          isLive={isLive}
          onRetry={load}
          onClose={close}
        />
      )}
    </>
  );
}

function LyricsModal({
  artistName,
  trackTitle,
  state,
  isLive,
  onRetry,
  onClose,
}: {
  artistName: string;
  trackTitle: string;
  state: LoadState;
  isLive: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  // ESC to close, matching the YouTube modal. No body-scroll lock: the modal
  // content scrolls internally and the album page behind it is the natural
  // context for following along.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Lyrics: ${trackTitle} by ${artistName}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[80vh] w-full max-w-2xl flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium" title={trackTitle}>
              {trackTitle}
            </p>
            <p
              className="truncate text-xs text-muted-foreground"
              title={artistName}
            >
              {artistName}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close lyrics"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto rounded-xl border border-foreground/10 bg-surface p-6">
          {state.kind === "loading" && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {state.kind === "error" && (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-muted-foreground">
                Couldn&apos;t load lyrics. Check your connection and try again.
              </p>
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex h-9 items-center justify-center rounded-full bg-pastel-pink px-4 text-sm font-bold text-ink transition-colors hover:bg-pastel-pink/80"
              >
                Retry
              </button>
            </div>
          )}

          {state.kind === "not_found" && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No lyrics found for this track yet.
            </p>
          )}

          {state.kind === "ok" && (
            <LyricsBody state={state} isLive={isLive} />
          )}
        </div>
      </div>
    </div>
  );
}

function LyricsBody({
  state,
  isLive,
}: {
  state: Extract<LoadState, { kind: "ok" }>;
  isLive: boolean;
}) {
  const lines = useMemo(
    () => (state.synced ? parseLrc(state.synced) : []),
    [state.synced],
  );

  return (
    <div className="flex flex-col gap-4">
      {state.instrumental && <Badge variant="info">Instrumental</Badge>}
      {lines.length > 0 ? (
        <SyncedLines lines={lines} isLive={isLive} />
      ) : state.plain ? (
        <p className="whitespace-pre-wrap text-sm leading-relaxed">
          {state.plain}
        </p>
      ) : !state.instrumental ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No lyrics text available for this track.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Synced (LRC) lyrics. Subscribes to the player's clock only while mounted
 * (i.e. while the modal is open) so closed rows never pay the timeupdate
 * re-render cost. Highlighting only runs when this track is the player's
 * current full-library stream — otherwise the lines render statically.
 */
function SyncedLines({ lines, isLive }: { lines: LrcLine[]; isLive: boolean }) {
  const currentTime = usePreviewTime();
  const activeIdx = isLive
    ? activeLrcLineIndex(lines, currentTime * 1000)
    : -1;

  const activeRef = useRef<HTMLParagraphElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  return (
    <div className="flex flex-col gap-1.5">
      {lines.map((line, i) => (
        <p
          key={`${line.timeMs}-${i}`}
          ref={i === activeIdx ? activeRef : undefined}
          className={cn(
            "text-sm leading-relaxed transition-colors",
            i === activeIdx
              ? "font-bold text-foreground"
              : "text-muted-foreground",
          )}
        >
          {line.text || "♪"}
        </p>
      ))}
      {!isLive && (
        <p className="mt-2 text-xs text-muted-foreground/70">
          Play the full track from your library to follow along.
        </p>
      )}
    </div>
  );
}
