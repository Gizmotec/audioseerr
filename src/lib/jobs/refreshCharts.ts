import { enrichArtistArtwork, enrichTrackArtwork } from "@/lib/chartArtwork";
import { getDeezerChartAlbums, getDeezerNewReleaseAlbums } from "@/lib/deezer";
import { getGlobalTopArtists, getGlobalTopTracks } from "@/lib/lastfm";
import { getSettings } from "@/lib/settings";

// Mirrors the seed genres rendered on the home page. Keep in sync with
// HOME_TAGS in src/app/home/page.tsx.
const HOME_TAGS = ["pop", "rock", "electronic"];
const HOME_LIMIT = 12;

/**
 * Hourly cache pre-warm for the home-page chart rows (design doc §10). The
 * first request after a TTL expiry would otherwise pay the full Deezer round
 * trip on the user's behalf — running a tick before the hour boundary keeps
 * the home page hot. `getDeezerChartAlbums` already wraps `withCache`, so this
 * is a fire-and-forget loop that just triggers the underlying fetch.
 */
export async function refreshCharts(): Promise<void> {
  const settings = await getSettings();
  const lastFmKey = settings.lastFmApiKey;

  await Promise.all([
    getDeezerNewReleaseAlbums(HOME_LIMIT).catch(() => {
      // Keep warming the remaining shelves if one upstream source is down.
    }),
    ...HOME_TAGS.map((tag) =>
      getDeezerChartAlbums(tag, HOME_LIMIT).catch(() => {
        // A single failing tag shouldn't stop the others.
      }),
    ),
    ...(lastFmKey
      ? [
          getGlobalTopTracks({ apiKey: lastFmKey }, 10)
            .then(enrichTrackArtwork)
            .catch(() => {
              // Last.fm charts are optional on the home page.
            }),
          getGlobalTopArtists({ apiKey: lastFmKey }, HOME_LIMIT)
            .then(enrichArtistArtwork)
            .catch(() => {
              // Last.fm charts are optional on the home page.
            }),
        ]
      : []),
  ]);
}
