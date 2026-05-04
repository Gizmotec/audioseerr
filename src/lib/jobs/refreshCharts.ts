import { getDeezerChartAlbums } from "@/lib/deezer";

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
  await Promise.all(
    HOME_TAGS.map((tag) =>
      getDeezerChartAlbums(tag, HOME_LIMIT).catch(() => {
        // A single failing tag shouldn't stop the others.
      }),
    ),
  );
}
