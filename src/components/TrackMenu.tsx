"use client";

import { Loader2, ListPlus, Radio, X } from "lucide-react";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePreviewPlayer, type QueueItem } from "@/components/PreviewPlayer";
import {
  autoDownloadStationAction,
  findSimilarStationAction,
  saveStationAsPlaylistAction,
} from "@/lib/actions/findSimilar";
import type { FindSimilarSeed } from "@/lib/findSimilar";
import type { PlaylistRecommendation } from "@/lib/recommendations";

type TrackMenuContextValue = {
  /** Open the track context menu at the cursor for `seed`. Call from a row's
   *  `onContextMenu`; it preventDefaults the native menu for you. */
  openTrackMenu: (event: React.MouseEvent, seed: FindSimilarSeed) => void;
};

const TrackMenuContext = createContext<TrackMenuContextValue | null>(null);

export function useTrackMenu(): TrackMenuContextValue {
  const v = useContext(TrackMenuContext);
  if (!v) throw new Error("useTrackMenu must be used within TrackMenuProvider");
  return v;
}

const MBID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MENU_WIDTH = 224;
const MENU_HEIGHT = 96;

type MenuState = { x: number; y: number; seed: FindSimilarSeed } | null;

type Station = { title: string; tracks: PlaylistRecommendation[] };

type Status =
  | { kind: "idle" }
  | { kind: "finding"; seedTitle: string }
  | {
      kind: "playing";
      station: Station;
      newCount: number;
      requested: number | null; // null while still downloading
      saveState: "idle" | "saving" | "saved";
      savedId: string | null;
    }
  | { kind: "error"; message: string };

/** Build the player queue from a station's recommendations: owned tracks stream
 *  in full (and scrobble), new tracks play their 30s preview (no scrobble). */
function toQueue(tracks: PlaylistRecommendation[]): QueueItem[] {
  return tracks.map((t, i) => {
    if (t.inLibrary && t.downloadedTrackId) {
      return {
        id: `sim-${i}`,
        title: t.title,
        artistName: t.artistName,
        coverUrl: t.coverUrl,
        streamUrl: `/api/stream/local/${t.downloadedTrackId}`,
        recordingMbid:
          t.recordingMbid && MBID_RE.test(t.recordingMbid)
            ? t.recordingMbid
            : `local:${t.downloadedTrackId}`,
        albumMbid: t.albumMbid ?? undefined,
        durationMs: t.durationMs ?? undefined,
      };
    }
    return {
      id: `sim-${i}`,
      title: t.title,
      artistName: t.artistName,
      coverUrl: t.coverUrl,
      streamUrl: t.previewUrl, // may be null → player skips it
      durationMs: t.durationMs ?? undefined,
    };
  });
}

export function TrackMenuProvider({ children }: { children: React.ReactNode }) {
  const player = usePreviewPlayer();
  const [menu, setMenu] = useState<MenuState>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const dismissTimer = useRef<number | null>(null);
  // The station currently shown in the snackbar — read by Save (state set in the
  // same tick isn't yet readable).
  const stationRef = useRef<Station | null>(null);

  const openTrackMenu = useCallback(
    (event: React.MouseEvent, seed: FindSimilarSeed) => {
      event.preventDefault();
      const x = Math.min(event.clientX, window.innerWidth - MENU_WIDTH - 8);
      const y = Math.min(event.clientY, window.innerHeight - MENU_HEIGHT - 8);
      setMenu({ x: Math.max(8, x), y: Math.max(8, y), seed });
    },
    [],
  );

  // Close the menu on any outside interaction.
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    // `click` (not mousedown) so the in-menu button's own click runs first.
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  const clearDismiss = useCallback(() => {
    if (dismissTimer.current !== null) {
      window.clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
  }, []);
  const scheduleDismiss = useCallback(
    (ms: number) => {
      clearDismiss();
      dismissTimer.current = window.setTimeout(
        () => setStatus({ kind: "idle" }),
        ms,
      );
    },
    [clearDismiss],
  );
  useEffect(() => clearDismiss, [clearDismiss]);

  const startStation = useCallback(
    async (seed: FindSimilarSeed) => {
      setMenu(null);
      clearDismiss();
      setStatus({ kind: "finding", seedTitle: seed.title });

      const res = await findSimilarStationAction(seed);
      if (!res.ok) {
        setStatus({ kind: "error", message: res.error });
        scheduleDismiss(7000);
        return;
      }

      const station: Station = { title: res.title, tracks: res.tracks };
      stationRef.current = station;
      player.playQueue(toQueue(station.tracks), 0);

      const newTracks = station.tracks.filter((t) => !t.inLibrary);
      setStatus({
        kind: "playing",
        station,
        newCount: newTracks.length,
        requested: newTracks.length === 0 ? 0 : null,
        saveState: "idle",
        savedId: null,
      });

      // Auto-download the new songs in the background — playback already started.
      if (newTracks.length > 0) {
        autoDownloadStationAction(
          newTracks.map((t) => ({
            title: t.title,
            artistName: t.artistName,
            albumTitle: t.albumTitle,
            coverUrl: t.coverUrl,
          })),
        )
          .then((dl) => {
            setStatus((s) =>
              s.kind === "playing" && s.station === station
                ? { ...s, requested: dl.ok ? dl.requested : 0 }
                : s,
            );
          })
          .catch(() => {
            setStatus((s) =>
              s.kind === "playing" && s.station === station
                ? { ...s, requested: 0 }
                : s,
            );
          });
      }
    },
    [player, clearDismiss, scheduleDismiss],
  );

  const saveStation = useCallback(async () => {
    const station = stationRef.current;
    if (!station) return;
    setStatus((s) =>
      s.kind === "playing" ? { ...s, saveState: "saving" } : s,
    );
    const res = await saveStationAsPlaylistAction(station.title, station.tracks);
    setStatus((s) => {
      if (s.kind !== "playing") return s;
      if (!res.ok) return { ...s, saveState: "idle" };
      return { ...s, saveState: "saved", savedId: res.id };
    });
  }, []);

  const value = useMemo<TrackMenuContextValue>(
    () => ({ openTrackMenu }),
    [openTrackMenu],
  );

  return (
    <TrackMenuContext.Provider value={value}>
      {children}

      {menu && (
        <div
          role="menu"
          style={{ left: menu.x, top: menu.y, width: MENU_WIDTH }}
          className="fixed z-50 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-lg"
          // Stop the window `click` closer from firing before the item's onClick.
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => void startStation(menu.seed)}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors hover:bg-secondary"
          >
            <Radio className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0">
              <span className="block">Find Similar</span>
              <span className="block truncate text-xs text-muted-foreground">
                Radio from “{menu.seed.title}”
              </span>
            </span>
          </button>
        </div>
      )}

      <StationSnackbar
        status={status}
        onSave={() => void saveStation()}
        onDismiss={() => {
          clearDismiss();
          setStatus({ kind: "idle" });
        }}
      />
    </TrackMenuContext.Provider>
  );
}

function StationSnackbar({
  status,
  onSave,
  onDismiss,
}: {
  status: Status;
  onSave: () => void;
  onDismiss: () => void;
}) {
  if (status.kind === "idle") return null;

  return (
    <div className="fixed right-4 top-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-popover p-3 text-sm shadow-xl">
      {status.kind === "finding" && (
        <div className="flex items-center gap-2.5 text-muted-foreground">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          <span className="truncate">
            Finding songs like “{status.seedTitle}”…
          </span>
        </div>
      )}

      {status.kind === "error" && (
        <div className="flex items-start gap-2.5">
          <p className="flex-1 text-foreground">{status.message}</p>
          <DismissButton onClick={onDismiss} />
        </div>
      )}

      {status.kind === "playing" && (
        <div className="flex items-start gap-2.5">
          <Radio className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium text-foreground">
              {status.station.title}
            </p>
            <p className="text-xs text-muted-foreground">
              {status.station.tracks.length} songs
              {status.newCount > 0 &&
                (status.requested === null
                  ? ` · downloading ${status.newCount} new…`
                  : ` · ${status.requested} new added`)}
            </p>

            <div className="mt-2">
              {status.saveState === "saved" && status.savedId ? (
                <Link
                  href={`/playlists/${status.savedId}`}
                  onClick={onDismiss}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:underline"
                >
                  Saved — open playlist
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={onSave}
                  disabled={status.saveState === "saving"}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-60"
                >
                  {status.saveState === "saving" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <ListPlus className="h-3.5 w-3.5" />
                  )}
                  Save as playlist
                </button>
              )}
            </div>
          </div>
          <DismissButton onClick={onDismiss} />
        </div>
      )}
    </div>
  );
}

function DismissButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Dismiss"
      className="-mr-1 -mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}
