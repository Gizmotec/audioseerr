// Discovery-mix pre-download. When the "Pre-download mix tracks" setting is on,
// this job generates each user's Daily Mixes / Discover Weekly (warming the same
// ApiCache the page reads) and eagerly downloads the mixes' "new" picks into
// **temporary** (ephemeral) storage, so they play full-length the moment the
// user opens the page. Unkept temp tracks are swept by pruneEphemeralTracks.

import { prisma } from "@/lib/db";
import { trackMatchKey } from "@/lib/deezer";
import {
  getOrGenerateDailyMixes,
  getOrGenerateMix,
  type GeneratedMix,
  type MixTrack,
} from "@/lib/mixes";
import { getSettings } from "@/lib/settings";
import { resolveSong } from "@/lib/songResolve";
import { ensureTrackRequested } from "@/lib/trackRequests";

/** Which family of mixes a run warms — "daily" covers all of the day's slots. */
export type PreloadGroup = "daily" | "weekly";

type NewMixTrack = Extract<MixTrack, { kind: "new" }>;

// How long an unkept temp track survives before the prune job is allowed to
// delete it. Daily picks turn over fast; weekly ones get a full week + grace.
const RETENTION_DAYS: Record<PreloadGroup, number> = { daily: 2, weekly: 8 };
// Defensive ceiling on temp downloads per user per run. The new portion of each
// mix is bounded (~9 per daily slot, ~30 weekly), but a viewer now has up to
// five daily mixes, so this cap is what actually holds the run down.
const MAX_NEW_PER_USER = 40;

const DAY_MS = 24 * 60 * 60 * 1000;

export async function preloadMixes(
  kind: PreloadGroup,
): Promise<{ users: number; requested: number }> {
  const settings = await getSettings();
  // Off → nothing to do. (Mixes are built from Deezer + local listening data;
  // no Last.fm key is needed here.)
  if (!settings.preDownloadMixes) {
    return { users: 0, requested: 0 };
  }

  const expiresAt = new Date(Date.now() + RETENTION_DAYS[kind] * DAY_MS);
  const users = await prisma.user.findMany({ select: { id: true, role: true } });

  let requested = 0;
  for (const user of users) {
    try {
      const viewer = { id: user.id, role: user.role };
      const mixes: GeneratedMix[] =
        kind === "daily"
          ? await getOrGenerateDailyMixes(viewer)
          : [await getOrGenerateMix(viewer, "weekly")];
      // Round-robin across the slots so the cap doesn't spend itself entirely
      // on Daily Mix 1 and leave the rest as 30s previews.
      const newTracks = interleaveNew(mixes).slice(0, MAX_NEW_PER_USER);

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
          { ephemeral: true, expiresAt, forceApproval: true },
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

/**
 * The "new" picks of every mix, taken one per mix per round, so truncating to
 * MAX_NEW_PER_USER spreads the budget evenly across the slots. Deduped on
 * artist+title — sibling daily mixes can land on the same track.
 */
function interleaveNew(mixes: GeneratedMix[]): NewMixTrack[] {
  const queues = mixes.map(
    (m) => m.tracks.filter((t) => t.kind === "new") as NewMixTrack[],
  );
  const out: NewMixTrack[] = [];
  const seen = new Set<string>();
  const depth = Math.max(0, ...queues.map((q) => q.length));
  for (let i = 0; i < depth; i++) {
    for (const queue of queues) {
      const track = queue[i];
      if (!track) continue;
      const key = trackMatchKey(track.artistName, track.title);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(track);
    }
  }
  return out;
}
