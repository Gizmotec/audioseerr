// Proxies an ad-free, audio-only YouTube stream for in-app full-song previews.
// Mirrors the local-file stream route, but the source is a googlevideo URL
// resolved by yt-dlp (src/lib/youtubeAudio.ts) rather than a file on disk.
//
// We MUST fetch the upstream URL here, server-side: it's IP-locked to this
// machine, time-limited, and CORS-blocked, so it can't be played directly by
// the browser. The browser's Range header is forwarded so seeking works.

import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { resolveYouTubeAudio } from "@/lib/youtubeAudio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const artist = searchParams.get("artist")?.trim();
  const title = searchParams.get("title")?.trim();
  if (!artist || !title) {
    return new Response("Missing artist/title", { status: 400 });
  }

  const audio = await resolveYouTubeAudio(artist, title);
  if (!audio) {
    // No full-song match — client falls back to the 30s preview on this 404.
    return new Response("Not found", { status: 404 });
  }

  const range = request.headers.get("range");
  let upstream: Response;
  try {
    upstream = await fetch(audio.url, {
      headers: {
        // googlevideo expects a browser-ish UA and honors byte ranges.
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        ...(range ? { Range: range } : {}),
      },
    });
  } catch {
    return new Response("Upstream error", { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response("Upstream error", { status: 502 });
  }

  // Pass through only the headers the audio element needs for streaming/seeking.
  const headers = new Headers();
  for (const h of [
    "content-type",
    "content-length",
    "content-range",
    "accept-ranges",
  ]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  if (!headers.has("content-type")) headers.set("content-type", audio.mime);
  if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes");

  return new Response(upstream.body, { status: upstream.status, headers });
}
