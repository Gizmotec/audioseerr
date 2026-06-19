// Discovery-mix pre-download. When the "Pre-download mix tracks" setting is on,
// this job generates each user's Daily Mix / Discover Weekly (warming the same
// ApiCache the page reads) and eagerly downloads the mix's "new" picks into
// **temporary** (ephemeral) storage, so they play full-length the moment the
// user opens the page. Unkept temp tracks are swept by pruneEphemeralTracks.

import { prisma } from "@/lib/db";
import { getOrGenerateMix, type MixKind } from "@/lib/mixes";
import { getSettings } from "@/lib/settings";
import { resolveSong } from "@/lib/songResolve";
import { ensureTrackRequested } from "@/lib/trackRequests";

// How long an unkept temp track survives before the prune job is allowed to
// delete it. Daily picks turn over fast; weekly ones get a full week + grace.
const RETENTION_DAYS: Record<MixKind, number> = { daily: 2, weekly: 8 };
// Defensive ceiling on temp downloads per user per run (the mix's new portion is
// already bounded — ~9 daily / ~30 weekly — this just backstops a runaway mix).
const MAX_NEW_PER_USER = 40;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function preloadMixes(
  kind: MixKind,
): Promise<{ users: number; requested: number }> {
  const settings = await getSettings();
  // Off, or no Last.fm key (mixes can't be built) → nothing to do.
  if (!settings.preDownloadMixes || !settings.lastFmApiKey) {
    return { users: 0, requested: 0 };
  }

  const expiresAt = new Date(Date.now() + RETENTION_DAYS[kind] * DAY_MS);
  const users = await prisma.user.findMany({ select: { id: true, role: true } });

  let requested = 0;
  for (const user of users) {
    try {
      const mix = await getOrGenerateMix({ id: user.id, role: user.role }, kind);
      const newTracks = mix.tracks
        .filter((t) => t.kind === "new")
        .slice(0, MAX_NEW_PER_USER);

      for (const t of newTracks) {
        const resolved = await resolveSong(
          {
            title: t.title,
            artistName: t.artistName,
            albumTitle: t.albumTitle,
            coverUrl: t.coverUrl,
          },
          { includeSingles: true },
        );
        if (!resolved) continue;

        await ensureTrackRequested(
          user.id,
          {
            albumMbid: resolved.albumMbid,
            albumTitle: resolved.albumTitle,
            artistName: resolved.artistName,
            coverUrl: resolved.coverUrl,
            recordingMbid: resolved.recordingMbid,
            trackTitle: resolved.title,
            albumPosition: resolved.albumPosition,
          },
          { ephemeral: true, expiresAt },
        );
        requested++;
      }
    } catch (err) {
      // One user's failure never sinks the run.
      console.error(`[preloadMixes] ${kind} preload failed for ${user.id}:`, err);
    }
  }

  return { users: users.length, requested };
}
