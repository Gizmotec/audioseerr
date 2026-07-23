// Last.fm history import flow, parameterized by userId so non-session callers
// (and e2e drivers) can run it directly. The session-gated wrapper is
// src/lib/actions/importHistory.ts.

import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { getRecentTracks } from "@/lib/lastfm";
import {
  filterExistingRows,
  mapRecentTracksToRows,
  rowKey,
} from "@/lib/lastfmImport";
import { mapListensToRows } from "@/lib/listenbrainzImport";
import { makeRateLimiter } from "@/lib/rate-limit";
import { getLastFmAppCredentials } from "@/lib/scrobble";
import {
  getListens,
  type ListenBrainzListen,
} from "@/lib/scrobble/listenbrainz";

// user.getRecentTracks caps at 200/page; 10 pages = the 2,000 most recent
// scrobbles inside the window per import run.
const PAGE_LIMIT = 200;
const MAX_PAGES = 10;
// Safety cap for the dedupe existence-set read (candidates are ≤ 2,000).
const EXISTING_TAKE = 10_000;

export type ImportHistoryOutcome =
  | { status: "ok"; imported: number; skipped: number }
  | { status: "not_connected" }
  | { status: "unconfigured" };

/**
 * Import the user's Last.fm scrobble history into PlayHistory.
 *
 * Window: scrobbles OLDER than the user's oldest known PlayHistory row
 * (Last.fm's `to` parameter). The in-app history is already recorded, so this
 * backfills the era Audioseerr doesn't cover with zero overlap — and re-runs
 * keep paging further back through Last.fm history until it returns nothing
 * ("up to date"). Dedupe by (userId, trackKey, playedAt) is still enforced
 * per-row below, so boundary scrobbles and repeated runs are idempotent.
 * (The brief's "from=oldest known … to avoid overlap" reads as the walk-back
 * window implemented here — Last.fm's `from` would fetch exactly the era we
 * already have.)
 */
export async function importLastFmHistoryForUser(
  userId: string,
): Promise<ImportHistoryOutcome> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { lastfmUsername: true, lastfmSessionKey: true },
  });
  if (!user?.lastfmSessionKey || !user.lastfmUsername) {
    return { status: "not_connected" };
  }
  const creds = await getLastFmAppCredentials();
  if (!creds) return { status: "unconfigured" };

  const oldest = await prisma.playHistory.findFirst({
    where: { userId },
    orderBy: { playedAt: "asc" },
    select: { playedAt: true },
  });
  const to = oldest ? Math.floor(oldest.playedAt.getTime() / 1000) : undefined;

  const all = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const res = await getRecentTracks({ apiKey: creds.apiKey }, user.lastfmUsername, {
      limit: PAGE_LIMIT,
      page,
      to,
    });
    all.push(...res.tracks);
    if (page >= res.totalPages) break;
  }

  const rows = mapRecentTracksToRows(all);
  if (rows.length === 0) return { status: "ok", imported: 0, skipped: 0 };

  // Duplicates can only exist at exact candidate timestamps, so the existence
  // set only needs the candidate time range, not full history.
  const minMs = Math.min(...rows.map((r) => r.playedAt.getTime()));
  const maxMs = Math.max(...rows.map((r) => r.playedAt.getTime()));
  const existing = await prisma.playHistory.findMany({
    where: {
      userId,
      playedAt: { gte: new Date(minMs), lte: new Date(maxMs) },
    },
    select: { recordingMbid: true, playedAt: true },
    take: EXISTING_TAKE,
  });
  const existingKeys = new Set(
    existing.map((r) => rowKey(r.recordingMbid, r.playedAt)),
  );
  const { fresh, skipped } = filterExistingRows(rows, existingKeys);

  if (fresh.length > 0) {
    // sqlite's Prisma adapter doesn't support createMany skipDuplicates —
    // the filter above is the dedupe (see lastfmImport.ts).
    await prisma.playHistory.createMany({
      data: fresh.map((row) => ({ userId, ...row })),
    });
  }
  return { status: "ok", imported: fresh.length, skipped };
}

// --- ListenBrainz history import -----------------------------------------------

// /listens caps at 100/page (docs max); 10 pages per direction = up to 1,000
// listens older + 1,000 newer per import run.
const LB_PAGE_COUNT = 100;
const LB_MAX_PAGES = 10;

// Politeness pacing — ListenBrainz 429s under rapid bursts (observed live).
// Distinct from the scrobbler: submit-listens stays fire-and-forget.
const lbImportLimiter = makeRateLimiter(1);

export type ImportListenBrainzOutcome =
  | { status: "ok"; imported: number; skipped: number }
  | { status: "not_connected" };

// The /listens endpoint has no page parameter: pages are walked by moving
// max_ts below the oldest ts of the previous page (newest-first order).
// Stops on a short page (end of the window) or the page cap.
async function fetchListenWindow(
  token: string,
  userName: string,
  window: { minTs?: number; maxTs?: number },
): Promise<ListenBrainzListen[]> {
  const out: ListenBrainzListen[] = [];
  let maxTs = window.maxTs;
  for (let page = 0; page < LB_MAX_PAGES; page += 1) {
    await lbImportLimiter.wait();
    const res = await getListens(token, userName, {
      count: LB_PAGE_COUNT,
      minTs: window.minTs,
      maxTs,
    });
    out.push(...res.listens);
    if (res.listens.length < LB_PAGE_COUNT) break;
    const oldest = Math.min(...res.listens.map((l) => l.listened_at));
    if (!Number.isFinite(oldest)) break;
    maxTs = oldest - 1;
    if (window.minTs !== undefined && maxTs < window.minTs) break;
  }
  return out;
}

/**
 * Import the user's ListenBrainz listen history into PlayHistory.
 *
 * Unlike the Last.fm import (pure backfill), ListenBrainz is usually an
 * ONGOING sink — other apps (Spotify, Navidrome, …) keep scrobbling there
 * while Audioseerr runs — so each run works both directions:
 *
 *   - catch-up: listens NEWER than the user's newest PlayHistory row
 *     (min_ts), so other-app listens since the last run arrive;
 *   - backfill: listens OLDER than the user's oldest row (max_ts), so
 *     re-runs keep paging further back through ListenBrainz history.
 *
 * Plays Audioseerr scrobbled to ListenBrainz itself are skipped in the
 * mapper (media_player "Audioseerr") — they were already recorded by the
 * play path. Dedupe by (userId, trackKey, playedAt) is still enforced
 * per-row below, so window-boundary listens and repeated runs are
 * idempotent.
 */
export async function importListenBrainzHistoryForUser(
  userId: string,
): Promise<ImportListenBrainzOutcome> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { listenbrainzUsername: true, listenbrainzToken: true },
  });
  if (!user?.listenbrainzToken || !user.listenbrainzUsername) {
    return { status: "not_connected" };
  }
  const token = decrypt(user.listenbrainzToken);

  const bounds = await prisma.playHistory.aggregate({
    where: { userId },
    _min: { playedAt: true },
    _max: { playedAt: true },
  });
  const newestTs = bounds._max.playedAt
    ? Math.floor(bounds._max.playedAt.getTime() / 1000)
    : undefined;
  const oldestTs = bounds._min.playedAt
    ? Math.floor(bounds._min.playedAt.getTime() / 1000)
    : undefined;

  const all = [
    ...(newestTs !== undefined
      ? await fetchListenWindow(token, user.listenbrainzUsername, {
          minTs: newestTs,
        })
      : []),
    ...(await fetchListenWindow(token, user.listenbrainzUsername, {
      maxTs: oldestTs,
    })),
  ];

  const rows = mapListensToRows(all);
  if (rows.length === 0) return { status: "ok", imported: 0, skipped: 0 };

  // Duplicates can only exist at exact candidate timestamps, so the existence
  // set only needs the candidate time range, not full history.
  const minMs = Math.min(...rows.map((r) => r.playedAt.getTime()));
  const maxMs = Math.max(...rows.map((r) => r.playedAt.getTime()));
  const existing = await prisma.playHistory.findMany({
    where: {
      userId,
      playedAt: { gte: new Date(minMs), lte: new Date(maxMs) },
    },
    select: { recordingMbid: true, playedAt: true },
    take: EXISTING_TAKE,
  });
  const existingKeys = new Set(
    existing.map((r) => rowKey(r.recordingMbid, r.playedAt)),
  );
  const { fresh, skipped } = filterExistingRows(rows, existingKeys);

  if (fresh.length > 0) {
    await prisma.playHistory.createMany({
      data: fresh.map((row) => ({ userId, ...row })),
    });
  }
  return { status: "ok", imported: fresh.length, skipped };
}
