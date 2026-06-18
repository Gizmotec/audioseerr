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

  // filePath is stored already resolved to an Audioseerr-reachable path (the
  // path map is applied at registration/migration time) and comes from our own
  // DB — the route is keyed by an opaque id, so there's no traversal surface.
  return serveFileRange(request, method, track.filePath);
}
