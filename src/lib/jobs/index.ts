import cron from "node-cron";
import { preloadMixes } from "./preloadMixes";
import { pruneCache } from "./pruneCache";
import { pruneEphemeralTracks } from "./pruneEphemeralTracks";
import { pruneOldRequests } from "./pruneOldRequests";
import { refreshCharts } from "./refreshCharts";
import { refreshSystemPlaylists } from "./refreshSystemPlaylists";
import { syncActiveRequests } from "./syncActiveRequests";
import { syncDownloadedLibrary } from "./syncDownloadedLibrary";

let registered = false;

export function registerJobs() {
  if (registered) return;
  registered = true;

  // Schedules are sourced from docs/plans/2026-05-03-audioseerr-design.md §10.

  // Rebuild the album-library index from what we've downloaded via slskd.
  cron.schedule("*/5 * * * *", () => {
    void syncDownloadedLibrary().catch(() => {
      // Errors are tolerated; the next run picks up where this left off.
    });
  });

  cron.schedule("*/2 * * * *", () => {
    void syncActiveRequests().catch(() => {
      // Per-cycle errors are tolerated; the next run picks up where this left off.
    });
  });

  cron.schedule("0 * * * *", () => {
    void refreshCharts().catch(() => {});
  });

  cron.schedule("0 4 * * *", () => {
    void pruneCache().catch(() => {});
  });

  cron.schedule("0 5 * * 0", () => {
    void pruneOldRequests().catch(() => {});
  });

  // Discovery-mix pre-download (gated on the preDownloadMixes setting): fetch
  // each user's Daily Mix new picks every morning and Discover Weekly every
  // Monday into temp storage, and sweep unkept temp tracks daily. The prune runs
  // regardless of the setting so turning it off still cleans up.
  cron.schedule("0 5 * * *", () => {
    void preloadMixes("daily").catch(() => {});
    void pruneEphemeralTracks().catch(() => {});
  });

  cron.schedule("0 5 * * 1", () => {
    void preloadMixes("weekly").catch(() => {});
  });

  // System (editorial) playlists: hourly tick refreshes any whose weekly
  // schedule is due (a few per tick — see MAX_PER_TICK). Offset to :30 so it
  // doesn't pile on top of the on-the-hour chart refresh.
  cron.schedule("30 * * * *", () => {
    void refreshSystemPlaylists().catch(() => {});
  });

  // Seed the editorial playlists and start the first fill at boot so they show
  // up without waiting for the next hour; the per-tick cap keeps it staggered.
  void refreshSystemPlaylists().catch(() => {});
}
