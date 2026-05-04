// Streams a Lidarr-managed audio file to the browser.
//
// Flow: client → /api/stream/[trackFileId] → Lidarr trackfile lookup →
// path-map translation → bounds-check against root folder → fs.createReadStream
// with HTTP Range support so <audio> can seek.
//
// Files are read directly off the filesystem. Audioseerr's container must
// mount the Lidarr music library (read-only is fine). Path differences between
// Lidarr's view and Audioseerr's view are bridged via the MEDIA_PATH_MAP env
// (see src/lib/streaming.ts).

import { promises as fs, createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { getTrackFile } from "@/lib/lidarr";
import { getSettings } from "@/lib/settings";
import {
  applyPathMap,
  assertPathWithinRoot,
  mimeTypeForPath,
  parsePathMap,
  parseRange,
} from "@/lib/streaming";

export const dynamic = "force-dynamic";
// Force Node runtime — we use node:fs / node:stream which the edge runtime
// doesn't support.
export const runtime = "nodejs";

type Ctx = { params: Promise<{ trackFileId: string }> };

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
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { trackFileId: rawId } = await ctx.params;
  const trackFileId = Number.parseInt(rawId, 10);
  if (!Number.isFinite(trackFileId) || trackFileId <= 0) {
    return new Response("Bad track file id", { status: 400 });
  }

  const settings = await getSettings();
  if (!settings.lidarrUrl || !settings.lidarrApiKey || !settings.lidarrRootFolderPath) {
    return new Response("Lidarr not configured", { status: 503 });
  }

  let trackFile;
  try {
    trackFile = await getTrackFile(
      { url: settings.lidarrUrl, apiKey: settings.lidarrApiKey },
      trackFileId,
    );
  } catch {
    // Hide whether the id exists; both forged and deleted look the same.
    return new Response("Not found", { status: 404 });
  }

  let mappings;
  try {
    mappings = parsePathMap(settings.mediaPathMap);
  } catch (err) {
    console.error("[stream] invalid mediaPathMap:", err);
    return new Response("Server misconfigured", { status: 500 });
  }

  const lidarrRoot = settings.lidarrRootFolderPath;
  const mappedRoot = applyPathMap(lidarrRoot, mappings);
  const mappedPath = applyPathMap(trackFile.path, mappings);

  let absPath: string;
  try {
    absPath = assertPathWithinRoot(mappedPath, mappedRoot);
  } catch (err) {
    console.error("[stream] path bounds violation:", err);
    return new Response("Forbidden", { status: 403 });
  }

  let stat;
  try {
    stat = await fs.stat(absPath);
  } catch {
    return new Response("File not found", { status: 404 });
  }
  if (!stat.isFile()) {
    return new Response("Not a file", { status: 404 });
  }

  const size = stat.size;
  const mime = mimeTypeForPath(absPath);
  const etag = `"${stat.mtimeMs.toString(36)}-${size.toString(36)}"`;
  const baseHeaders: Record<string, string> = {
    "Content-Type": mime,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=0, must-revalidate",
    ETag: etag,
  };

  if (request.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: baseHeaders });
  }

  const rangeHeader = request.headers.get("range");
  const range = parseRange(rangeHeader, size);

  if (range === "invalid") {
    return new Response("Range Not Satisfiable", {
      status: 416,
      headers: { ...baseHeaders, "Content-Range": `bytes */${size}` },
    });
  }

  if (range) {
    const { start, end } = range;
    const length = end - start + 1;
    const headers = {
      ...baseHeaders,
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Content-Length": String(length),
    };
    if (method === "HEAD") {
      return new Response(null, { status: 206, headers });
    }
    const stream = createReadStream(absPath, { start, end });
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 206,
      headers,
    });
  }

  const headers = { ...baseHeaders, "Content-Length": String(size) };
  if (method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  const stream = createReadStream(absPath);
  return new Response(Readable.toWeb(stream) as ReadableStream, {
    status: 200,
    headers,
  });
}
