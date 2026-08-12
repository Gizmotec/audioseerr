"use client";

// One poll loop for the whole app, mounted once in the root layout.
//
// slskd is the source of truth for in-flight transfers, so every surface that
// wants to show download progress (request rows, album tracklists, playlist
// rows, discover cards) reads from this one context rather than starting its
// own timer. Items are indexed twice — by request id, which the /requests rows
// know, and by request mbid, which track rows can compute from the track alone.
//
// Polling is adaptive: the loop runs while something is actually in flight or
// while a component has registered interest (it just clicked download and the
// request hasn't reached slskd yet), and stops otherwise. That keeps an idle
// page at a single request on mount instead of a timer that never sleeps.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { syncNowAction } from "@/app/admin/requests/actions";
import {
  getDownloadProgressAction,
  type DownloadProgressItem,
} from "@/lib/actions/downloadProgress";

type Snapshot = {
  /** Keyed by request id and (for the caller's own requests) by request mbid. */
  byKey: Map<string, DownloadProgressItem>;
  /** Increments on every successful poll. A key missing from a fresh snapshot
   *  means "gone", but only if the snapshot is newer than when it was seen. */
  tick: number;
};

type DownloadsContext = {
  snapshot: Snapshot;
  /** Register interest in a key so the loop keeps polling. Returns an unwatch. */
  watch: (key: string) => () => void;
};

const EMPTY: Snapshot = { byKey: new Map(), tick: 0 };

const Context = createContext<DownloadsContext>({
  snapshot: EMPTY,
  watch: () => () => {},
});

/** Live progress for a request id or request mbid; undefined when not in flight. */
export function useDownloadProgress(
  key: string | null | undefined,
): DownloadProgressItem | undefined {
  const { snapshot } = useContext(Context);
  return key ? snapshot.byKey.get(key) : undefined;
}

/** Successful-poll counter — lets a consumer tell "gone" from "never polled". */
export function useDownloadsTick(): number {
  return useContext(Context).snapshot.tick;
}

/** Keeps the poll loop awake while `key` is set (e.g. a just-submitted request). */
export function useWatchDownload(key: string | null | undefined): void {
  const { watch } = useContext(Context);
  useEffect(() => {
    if (!key) return;
    return watch(key);
  }, [key, watch]);
}

const POLL_MS = 4000;
/** A watcher can't hold the loop open forever if its request never lands. */
const WATCH_TTL_MS = 20 * 60 * 1000;

export function DownloadsProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const router = useRouter();

  // Bumped to wake a sleeping loop when a watcher appears.
  const [wakeups, setWakeups] = useState(0);
  const awake = useRef(false);
  const watchers = useRef<Map<string, number>>(new Map());
  // Requests seen in flight during this mount. Only those are worth syncing and
  // refreshing on completion — a request that was already finished when the page
  // loaded must not trigger a refresh on every navigation.
  const seenActive = useRef<Set<string>>(new Set());
  const refreshed = useRef<Set<string>>(new Set());
  /** Non-settled items in the last snapshot — read when the tab is hidden. */
  const inFlightRef = useRef(0);

  const watch = useCallback((key: string) => {
    watchers.current.set(key, Date.now() + WATCH_TTL_MS);
    // Only nudge the effect when the loop has actually gone to sleep; otherwise
    // a screenful of rows registering at once would each force a fresh poll.
    if (!awake.current) setWakeups((n) => n + 1);
    return () => {
      watchers.current.delete(key);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    awake.current = true;

    const run = async () => {
      if (cancelled) return;
      // Don't hammer slskd while the tab is hidden — but only keep the timer
      // alive if there's actually something to come back to.
      if (typeof document !== "undefined" && document.hidden) {
        if (inFlightRef.current > 0 || hasLiveWatcher(watchers.current)) {
          timer = setTimeout(run, POLL_MS);
        } else {
          awake.current = false;
        }
        return;
      }

      let keepGoing = false;
      try {
        const res = await getDownloadProgressAction();
        if (cancelled) return;
        if (res.ok) {
          const byKey = new Map<string, DownloadProgressItem>();
          // Items arrive newest-first, and a retry reuses the mbid of the
          // request that failed — so the first claim on an mbid wins.
          const claimed = new Set<string>();
          let inFlight = 0;
          const finished: string[] = [];
          for (const item of res.items) {
            byKey.set(item.id, item);
            // Another user's request (admins see everyone's) must not claim a
            // track row on this user's page.
            if (item.mine && !claimed.has(item.mbid)) {
              claimed.add(item.mbid);
              byKey.set(item.mbid, item);
            }
            const moving =
              !item.settled && (item.state === "queued" || item.state === "active");
            if (moving) {
              inFlight++;
              seenActive.current.add(item.id);
              continue;
            }
            if (
              seenActive.current.has(item.id) &&
              !refreshed.current.has(item.id) &&
              item.state !== "failed"
            ) {
              refreshed.current.add(item.id);
              finished.push(item.id);
            }
            // A finished-but-unsettled transfer is still being registered into
            // the library, so the loop has to stay awake for the status flip.
            if (!item.settled) inFlight++;
          }
          inFlightRef.current = inFlight;
          setSnapshot((prev) => ({ byKey, tick: prev.tick + 1 }));

          if (finished.length > 0) {
            // A transfer just finished — run the sync (admin-only; a no-op for
            // regular users, who get finalized by the cron within ~2 min) so the
            // file is registered into the library, then re-render so pages pick
            // up the new local streamUrl / Available status.
            await syncNowAction().catch(() => {});
            if (!cancelled) router.refresh();
          }
          // Keep polling while anything is genuinely moving, or while a
          // component is still waiting on a request it just created.
          keepGoing = inFlight > 0 || hasLiveWatcher(watchers.current);
        } else {
          // Lookup failed — hold the last-known snapshot and try again if
          // someone is still waiting on an answer.
          keepGoing = hasLiveWatcher(watchers.current);
        }
      } catch {
        keepGoing = hasLiveWatcher(watchers.current);
      }

      if (cancelled) return;
      if (keepGoing) timer = setTimeout(run, POLL_MS);
      else awake.current = false;
    };

    void run();
    return () => {
      cancelled = true;
      awake.current = false;
      if (timer) clearTimeout(timer);
    };
    // `wakeups` restarts a loop that went to sleep when a new watcher appears.
  }, [router, wakeups]);

  const value = useMemo<DownloadsContext>(
    () => ({ snapshot, watch }),
    [snapshot, watch],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

function hasLiveWatcher(map: Map<string, number>): boolean {
  const now = Date.now();
  for (const [key, until] of map) {
    if (until > now) return true;
    map.delete(key);
  }
  return false;
}
