// Resolves an ad-free, audio-only stream URL for a track by shelling out to
// yt-dlp. This is the "full song" preview source — the googlevideo URL it
// returns is what /api/stream/youtube proxies to the browser.
//
// The URL is IP- and time-locked (expires in a few hours) and CORS-blocked, so
// it MUST be fetched server-side from the same machine that resolved it — never
// handed to the browser directly. See the route handler for the proxy.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { withCache } from "@/lib/cache";
import { normalizeTrackTitle } from "@/lib/deezer";

const execFileAsync = promisify(execFile);

// Override in dev or to pin a path; defaults to the binary baked into the image.
const YT_DLP = process.env.YT_DLP_PATH?.trim() || "yt-dlp";

export type YouTubeAudio = { url: string; mime: string };

/**
 * Resolve "{artist} {title}" to a direct audio stream URL via yt-dlp's own
 * search (ytsearch1 — no Data API quota needed). Prefers m4a/AAC so it plays
 * everywhere including Safari, falling back to whatever best audio-only format
 * exists. Returns null on no match, extraction failure, or timeout — callers
 * fall back to the 30s preview.
 *
 * Cached 45 min keyed by normalized artist+title: long enough to skip the
 * ~1-3s yt-dlp call on repeat plays, short enough that we never serve a URL
 * past its expiry.
 *
 * ponytail: negative results aren't cached (matches resolveYouTubeVideoId) —
 * add a sentinel if repeated misses on the same track become a latency problem.
 */
export async function resolveYouTubeAudio(
  artistName: string,
  trackTitle: string,
): Promise<YouTubeAudio | null> {
  const a = normalizeTrackTitle(artistName);
  const t = normalizeTrackTitle(trackTitle);
  if (!a || !t) return null;

  const cacheKey = `ytaudio:${a}::${t}`;
  return withCache<YouTubeAudio | null>(cacheKey, 45 * 60, async () => {
    try {
      // execFile (not exec) — args are passed without a shell, so the search
      // query can't inject. --print implies --simulate, so nothing downloads.
      const { stdout } = await execFileAsync(
        YT_DLP,
        [
          "-f",
          "bestaudio[ext=m4a]/bestaudio",
          "--no-playlist",
          "--no-warnings",
          "--print",
          "%(url)s",
          "--print",
          "%(ext)s",
          `ytsearch1:${artistName} ${trackTitle} audio`,
        ],
        { timeout: 15_000, maxBuffer: 4 * 1024 * 1024 },
      );
      const lines = stdout
        .trim()
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const url = lines[0];
      const ext = lines[1] ?? "m4a";
      if (!url || !/^https?:\/\//.test(url)) return null;
      const mime =
        ext === "webm"
          ? "audio/webm"
          : ext === "mp3"
            ? "audio/mpeg"
            : "audio/mp4";
      return { url, mime };
    } catch {
      // ENOENT (yt-dlp not installed), non-zero exit, or timeout — all map to
      // "no full-song stream", and the client falls back to the 30s preview.
      return null;
    }
  });
}
