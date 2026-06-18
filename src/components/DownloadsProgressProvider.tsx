"use client";

// Polls live slskd download progress on an interval. Two consumers share one
// poll loop (`useDownloadProgressMap`):
//   • DownloadsProgressProvider — exposes the map via context so request rows
//     render progress bars (used on /requests).
//   • DownloadWatcher — renders nothing; just runs the loop so a page re-fetches
//     when a download finishes (used on the album page, where completion needs
//     to populate each track's local streamUrl without a manual reload).
// `enabled` gates polling to pages that actually have an in-flight download
// (recomputed server-side on every revalidate/refresh).

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { syncNowAction } from "@/app/admin/requests/actions";
import {
  getDownloadProgressAction,
  type DownloadProgressItem,
} from "@/lib/actions/downloadProgress";

type ProgressMap = Map<string, DownloadProgressItem>;

const ProgressContext = createContext<ProgressMap>(new Map());

export function useDownloadProgress(
  id: string,
): DownloadProgressItem | undefined {
  return useContext(ProgressContext).get(id);
}

const POLL_MS = 4000;

function useDownloadProgressMap(enabled: boolean): ProgressMap {
  const [map, setMap] = useState<ProgressMap>(new Map());
  const router = useRouter();
  // Refresh the server-rendered page at most once per transfer that finishes,
  // so a completed download flips to Available/Finishing promptly without looping.
  const refreshedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const schedule = () => {
      timer = setTimeout(run, POLL_MS);
    };

    const run = async () => {
      if (cancelled) return;
      // Don't hammer slskd while the tab is hidden; resume on the next tick.
      if (typeof document !== "undefined" && document.hidden) {
        schedule();
        return;
      }
      try {
        const res = await getDownloadProgressAction();
        if (cancelled) return;
        const next: ProgressMap = new Map();
        let sawTerminal = false;
        for (const item of res.items) {
          next.set(item.id, item);
          if (item.state !== "active" && !refreshedRef.current.has(item.id)) {
            refreshedRef.current.add(item.id);
            sawTerminal = true;
          }
        }
        setMap(next);
        if (sawTerminal) {
          // A transfer just finished — run the sync (admin-only; a no-op for
          // regular users, who get finalized by the cron within ~2 min) so the
          // file is registered into the library, then re-render so it picks up
          // the new local streamUrl / Available status.
          await syncNowAction().catch(() => {});
          router.refresh();
        }
      } catch {
        // Keep the last-known values; try again next tick.
      }
      if (!cancelled) schedule();
    };

    void run();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, router]);

  return map;
}

export function DownloadsProgressProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const map = useDownloadProgressMap(enabled);
  return (
    <ProgressContext.Provider value={map}>{children}</ProgressContext.Provider>
  );
}

/** Headless: runs the poll/refresh loop so a page re-fetches on completion. */
export function DownloadWatcher({ enabled }: { enabled: boolean }) {
  useDownloadProgressMap(enabled);
  return null;
}
