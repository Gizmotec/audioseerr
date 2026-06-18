// Find Similar — "song radio". Given one seed song (right-clicked anywhere a
// track row appears), build an instant station of similar songs: the ones you
// already own (stream in full, scrobble) interleaved with new ones (30s preview
// now, auto-downloaded in the background). A thin wrapper over the shared
// recommendFromSeeds engine — the same Last.fm → score → Deezer pipeline that
// powers the playlist "Recommended" shelf, seeded from a single song.

import { normalizeTrackTitle } from "@/lib/deezer";
import {
  type PlaylistRecommendation,
  recommendFromSeeds,
} from "@/lib/recommendations";
import type { LibraryViewer } from "@/lib/userLibrary";

export type FindSimilarSeed = {
  title: string;
  artistName: string;
  /** Recording MBID when the surface has one — disambiguates covers/remakes. */
  recordingMbid?: string | null;
};

export type SimilarStation = {
  /** e.g. "Similar to Midnight City". */
  title: string;
  /** Interleaved owned + new, in play order. The client builds its queue from
   *  these and auto-downloads the ones with `inLibrary === false`. */
  tracks: PlaylistRecommendation[];
};

const STATION_SIZE = 24;
// Cap the new (not-yet-owned) portion so one right-click can't kick off an
// unbounded number of slskd downloads. If you own lots of similar music the
// station is mostly owned (few downloads); if you own little it tops out here.
const NEW_CAP = 12;

const MBID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Spread the smaller list evenly through the larger so the station reads as one
 * list, not an owned block followed by a new block.
 */
function interleave(
  a: PlaylistRecommendation[],
  b: PlaylistRecommendation[],
): PlaylistRecommendation[] {
  const [big, small] = a.length >= b.length ? [a, b] : [b, a];
  if (small.length === 0) return big.slice();
  const total = big.length + small.length;
  const step = total / small.length;
  const out: PlaylistRecommendation[] = [];
  let si = 0;
  let bi = 0;
  let nextSmall = step / 2;
  for (let i = 0; i < total; i++) {
    if (si < small.length && i >= nextSmall - 0.5) {
      out.push(small[si++]!);
      nextSmall += step;
    } else if (bi < big.length) {
      out.push(big[bi++]!);
    } else if (si < small.length) {
      out.push(small[si++]!);
    }
  }
  return out;
}

export async function findSimilarStation(
  viewer: LibraryViewer,
  seed: FindSimilarSeed,
): Promise<SimilarStation> {
  const mbid =
    seed.recordingMbid && MBID_RE.test(seed.recordingMbid)
      ? seed.recordingMbid
      : null;

  // Don't recommend the seed back to itself.
  const excludeKeys = new Set([
    `${normalizeTrackTitle(seed.artistName)}|${normalizeTrackTitle(seed.title)}`,
  ]);

  const recs = await recommendFromSeeds(
    viewer,
    [{ artist: seed.artistName, track: seed.title, mbid }],
    { excludeKeys, poolSize: STATION_SIZE + NEW_CAP },
  );

  const owned = recs.filter((r) => r.inLibrary);
  const fresh = recs.filter((r) => !r.inLibrary).slice(0, NEW_CAP);
  const tracks = interleave(owned, fresh).slice(0, STATION_SIZE);

  return { title: `Similar to ${seed.title}`, tracks };
}
