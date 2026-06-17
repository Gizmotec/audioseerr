// Streams an Audioseerr-owned single track (DownloadedTrack) off disk. Mirrors
// the Lidarr stream route but keyed by a DownloadedTrack id and authorized via
// per-user UserDownloadedTrack rows. The file was located + path-mapped at
// registration time, so we only re-confirm it sits within the slskd download
// root before serving.

import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import {
  getDownloadedTrackFile,
  viewerCanStreamTrack,
} from "@/lib/downloadedTracks";
import { serveFileRange } from "@/lib/fileStream";
import { getSettings } from "@/lib/settings";
import { applyPathMap, assertPathWithinRoot, parsePathMap } from "@/lib/streaming";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  return handle(request, ctx, "GET");
}

export async function HEAD(request: NextRequest, ctx: Ctx) {
  return handle(request, ctx, "HEAD");
}

async function handle(
  request: NextRequest,
  ctx: Ctx,
  method: "GET" | "HEAD",
): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }
  const viewer = {
    id: userId,
    role: (session.user as { role?: string }).role ?? null,
  };

  const { id } = await ctx.params;
  if (!id) {
    return new Response("Bad track id", { status: 400 });
  }

  // Per-user gate first (hides existence from users without access).
  if (!(await viewerCanStreamTrack(viewer, id))) {
    return new Response("Forbidden", { status: 403 });
  }

  const track = await getDownloadedTrackFile(id);
  if (!track) {
    return new Response("Not found", { status: 404 });
  }

  const settings = await getSettings();
  if (!settings.slskdDownloadPath) {
    return new Response("Soulseek download path not configured", { status: 503 });
  }

  let mappings;
  try {
    mappings = parsePathMap(settings.mediaPathMap);
  } catch (err) {
    console.error("[stream/local] invalid mediaPathMap:", err);
    return new Response("Server misconfigured", { status: 500 });
  }

  const mappedRoot = applyPathMap(settings.slskdDownloadPath, mappings);
  let absPath: string;
  try {
    absPath = assertPathWithinRoot(track.filePath, mappedRoot);
  } catch (err) {
    console.error("[stream/local] path bounds violation:", err);
    return new Response("Forbidden", { status: 403 });
  }

  return serveFileRange(request, method, absPath);
}
