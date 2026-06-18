import cron from "node-cron";
import { pruneCache } from "./pruneCache";
import { pruneOldRequests } from "./pruneOldRequests";
import { refreshCharts } from "./refreshCharts";
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
}
