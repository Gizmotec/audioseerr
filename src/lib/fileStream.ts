// Shared HTTP Range file streamer used by the audio stream routes. Given an
// absolute path the caller has already authorized and bounds-checked, serve it
// to <audio> with seek (206 partial content) support and ETag revalidation.

import { promises as fs, createReadStream } from "node:fs";
import { Readable } from "node:stream";
import type { NextRequest } from "next/server";
import { mimeTypeForPath, parseRange } from "@/lib/streaming";

export async function serveFileRange(
  request: NextRequest,
  method: "GET" | "HEAD",
  absPath: string,
): Promise<Response> {
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

  const range = parseRange(request.headers.get("range"), size);
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
