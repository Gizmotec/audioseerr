import cron from "node-cron";
import { syncActiveRequests } from "./syncActiveRequests";
import { syncLibrary } from "./syncLibrary";

let registered = false;

export function registerJobs() {
  if (registered) return;
  registered = true;

  // Schedules are sourced from docs/plans/2026-05-03-audioseerr-design.md §10.
  // Handlers that aren't filled in yet stay as stubs and land in later milestones.

  cron.schedule("*/15 * * * *", () => {
    void syncLibrary().catch(() => {
      // Errors are tolerated; the next run picks up where this left off.
    });
  });

  cron.schedule("*/2 * * * *", () => {
    void syncActiveRequests().catch(() => {
      // Per-cycle errors are tolerated; the next run picks up where this left off.
    });
  });

  cron.schedule("0 * * * *", () => {
    // refreshCharts — pre-warm cache for home-page rows
  });

  cron.schedule("0 4 * * *", () => {
    // pruneCache — delete expired ApiCache rows
  });

  cron.schedule("0 5 * * 0", () => {
    // pruneOldRequests — archive declined/failed requests >90 days old
  });
}
