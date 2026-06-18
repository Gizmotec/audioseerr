"use client";

import {
  Check,
  Disc3,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { usePreviewPlayer } from "@/components/PreviewPlayer";
import { TrackLikeButton } from "@/components/TrackLikeButton";
import { useTrackMenu } from "@/components/TrackMenu";
import {
  addRecommendationToPlaylistAction,
  getPlaylistRecommendationsAction,
} from "@/lib/actions/playlists";
import type { PlaylistRecommendation } from "@/lib/recommendations";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Spotify-style "Recommended for this playlist" shelf. Lazily loads suggestions
 * after mount (recommendations are slow to compute, so the playlist page itself
 * stays fast) and renders nothing until/unless suggestions come back — so short
 * playlists and missing-Last.fm-key setups just show no shelf.
 */
export function PlaylistRecommendations({ playlistId }: { playlistId: string }) {
  const [status, setStatus] = useState<"loading" | "ready" | "empty">(
    "loading",
  );
  const [recs, setRecs] = useState<PlaylistRecommendation[]>([]);
  const offsetRef = useRef(0);
  const [, startTransition] = useTransition();
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    (offset: number) => {
      startTransition(async () => {
        const res = await getPlaylistRecommendationsAction(playlistId, offset);
        setRefreshing(false);
        if (!res.ok) {
          setStatus("empty");
          return;
        }
        if (res.recommendations.length === 0) {
          // Past the end of the pool: wrap back to the first page on refresh, or
          // collapse the shelf if there was never anything.
          if (offset > 0) {
            offsetRef.current = 0;
            const first = await getPlaylistRecommendationsAction(playlistId, 0);
            if (first.ok && first.recommendations.length > 0) {
              offsetRef.current = first.recommendations.length;
              setRecs(first.recommendations);
              setStatus("ready");
              return;
            }
          }
          setStatus("empty");
          setRecs([]);
          return;
        }
        offsetRef.current = offset + res.recommendations.length;
        setRecs(res.recommendations);
        setStatus("ready");
      });
    },
    [playlistId],
  );

  useEffect(() => {
    load(0);
  }, [load]);

  const refresh = () => {
    setRefreshing(true);
    load(offsetRef.current);
  };

  const onAdded = (rec: PlaylistRecommendation) => {
    setRecs((prev) => prev.filter((r) => r !== rec));
  };

  if (status === "empty") return null;

  return (
    <section className="mt-10 space-y-3 border-t border-border/50 pt-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-lg font-medium">Recommended for this playlist</h2>
        </div>
        {status === "ready" && (
          <button
            type="button"
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-50"
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
            />
            Refresh
          </button>
        )}
      </div>

      <p className="text-sm text-muted-foreground">
        Songs that fit alongside what you&apos;ve added. Library songs add
        instantly; others download to your library when added.
      </p>

      {status === "loading" ? (
        <RecommendationsSkeleton />
      ) : (
        <ol className="divide-y divide-border/50">
          {recs.map((rec, i) => (
            <RecommendationRow
              key={`${rec.artistName}-${rec.title}-${i}`}
              playlistId={playlistId}
              rec={rec}
              onAdded={() => onAdded(rec)}
            />
          ))}
        </ol>
      )}
    </section>
  );
}

type AddState = "idle" | "adding" | "done" | "error";

function RecommendationRow({
  playlistId,
  rec,
  onAdded,
}: {
  playlistId: string;
  rec: PlaylistRecommendation;
  onAdded: () => void;
}) {
  const player = usePreviewPlayer();
  const { openTrackMenu } = useTrackMenu();
  const router = useRouter();
  const [state, setState] = useState<AddState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const playable = !!rec.previewUrl;
  const isActive = playable && player.isCurrent(rec.previewUrl!);

  const togglePreview = () => {
    if (!rec.previewUrl) return;
    player.play({
      id: rec.previewUrl,
      title: rec.title,
      artistName: rec.artistName,
      coverUrl: rec.coverUrl,
      previewUrl: rec.previewUrl,
      likeSeed: {
        recordingMbid: rec.recordingMbid,
        albumMbid: rec.albumMbid,
        albumPosition: rec.albumPosition,
        albumTitle: rec.albumTitle,
      },
    });
  };

  const add = () => {
    if (state === "adding" || state === "done") return;
    setState("adding");
    setError(null);
    startTransition(async () => {
      const res = await addRecommendationToPlaylistAction(playlistId, {
        title: rec.title,
        artistName: rec.artistName,
        albumTitle: rec.albumTitle,
        coverUrl: rec.coverUrl,
        albumMbid: rec.albumMbid,
        albumPosition: rec.albumPosition,
        recordingMbid: rec.recordingMbid,
      });
      if (!res.ok) {
        setState("error");
        setError(res.error);
        return;
      }
      setState("done");
      // Reflect the new track (and its downloading badge) in the list above.
      router.refresh();
      // Drop the row from the shelf shortly after, so the checkmark is seen.
      setTimeout(onAdded, 600);
    });
  };

  return (
    <li
      onContextMenu={(e) =>
        openTrackMenu(e, {
          title: rec.title,
          artistName: rec.artistName,
          recordingMbid: rec.recordingMbid,
        })
      }
      className={cn(
        "flex items-center gap-3 py-2.5",
        isActive && "bg-secondary/40",
      )}
    >
      <button
        type="button"
        onClick={togglePreview}
        disabled={!playable}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border",
          playable
            ? "border-border hover:border-foreground hover:text-foreground"
            : "border-border/50 text-muted-foreground/40",
        )}
        aria-label={
          playable
            ? isActive && player.state === "playing"
              ? "Pause preview"
              : "Play preview"
            : "No preview available"
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
        {rec.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={rec.coverUrl}
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
        <p className="truncate text-sm" title={rec.title}>
          {rec.title}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {rec.artistName}
          {rec.albumTitle ? ` · ${rec.albumTitle}` : ""}
        </p>
      </div>

      {rec.inLibrary && (
        <span
          className="hidden shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:inline"
          title="Already in your library — adds instantly"
        >
          In library
        </span>
      )}

      <span className="hidden shrink-0 text-xs text-muted-foreground tabular-nums sm:inline">
        {formatDuration(rec.durationMs)}
      </span>

      <TrackLikeButton
        track={{
          recordingMbid: rec.recordingMbid,
          albumMbid: rec.albumMbid,
          albumPosition: rec.albumPosition,
          title: rec.title,
          artistName: rec.artistName,
          albumTitle: rec.albumTitle,
          coverUrl: rec.coverUrl,
          durationMs: rec.durationMs,
        }}
        initialLiked={false}
        variant="icon"
      />

      <AddControl
        state={state}
        error={error}
        inLibrary={rec.inLibrary}
        onClick={add}
      />
    </li>
  );
}

function AddControl({
  state,
  error,
  inLibrary,
  onClick,
}: {
  state: AddState;
  error: string | null;
  inLibrary: boolean;
  onClick: () => void;
}) {
  if (state === "done") {
    return (
      <span
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-emerald-500"
        title="Added to playlist"
        aria-label="Added to playlist"
      >
        <Check className="h-4 w-4" />
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={state === "adding"}
      title={
        state === "error"
          ? (error ?? "Try again")
          : inLibrary
            ? "Add to playlist"
            : "Download and add to playlist"
      }
      aria-label={
        state === "error" ? (error ?? "Add failed, retry") : "Add to playlist"
      }
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-60",
        state === "error" && "text-destructive hover:text-destructive",
      )}
    >
      {state === "adding" ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Plus className="h-4 w-4" />
      )}
    </button>
  );
}

function RecommendationsSkeleton() {
  return (
    <ol className="animate-pulse divide-y divide-border/50">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 py-2.5">
          <div className="h-9 w-9 shrink-0 rounded-full bg-secondary" />
          <div className="h-10 w-10 shrink-0 rounded bg-secondary" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3.5 w-2/5 rounded bg-secondary" />
            <div className="h-3 w-1/4 rounded bg-secondary/70" />
          </div>
          <div className="h-8 w-8 shrink-0 rounded-full bg-secondary" />
        </li>
      ))}
    </ol>
  );
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "—";
  const seconds = Math.round(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}
