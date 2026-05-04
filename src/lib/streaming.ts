// Helpers for the local-file streaming route. Two responsibilities:
//   1. Translate Lidarr's reported file paths to a path that's reachable from
//      the Audioseerr container (Plex/Jellyfin's "path mappings" idea).
//   2. Parse HTTP Range headers so the <audio> element can seek.
//
// MEDIA_PATH_MAP env format: comma-separated `lidarrPath:localPath` pairs.
// Empty/unset → identity mapping.
//   Example: MEDIA_PATH_MAP="/music:/data/music,/downloads:/data/dl"

import path from "node:path";

export type PathMapping = { from: string; to: string };

export function parsePathMap(raw: string | null | undefined): PathMapping[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const idx = entry.indexOf(":");
      if (idx <= 0 || idx === entry.length - 1) {
        throw new Error(
          `Invalid MEDIA_PATH_MAP entry "${entry}" — expected "lidarrPath:localPath"`,
        );
      }
      return {
        from: stripTrailingSlash(entry.slice(0, idx)),
        to: stripTrailingSlash(entry.slice(idx + 1)),
      };
    });
}

function stripTrailingSlash(p: string): string {
  return p.length > 1 ? p.replace(/\/+$/, "") : p;
}

export function applyPathMap(
  lidarrPath: string,
  mappings: PathMapping[],
): string {
  // Longest-prefix wins so nested mappings (e.g. /music vs /music/lossless)
  // resolve to the most specific entry.
  const sorted = [...mappings].sort((a, b) => b.from.length - a.from.length);
  for (const m of sorted) {
    if (lidarrPath === m.from || lidarrPath.startsWith(`${m.from}/`)) {
      return `${m.to}${lidarrPath.slice(m.from.length)}`;
    }
  }
  return lidarrPath;
}

/**
 * Resolve `filePath` and confirm it sits inside `rootDir`. Defends against the
 * Lidarr trackfile API returning an unexpected path (or a forged trackFileId
 * that maps to one). Returns the absolute, normalized path on success.
 */
export function assertPathWithinRoot(filePath: string, rootDir: string): string {
  const absFile = path.resolve(filePath);
  const absRoot = path.resolve(rootDir);
  const rel = path.relative(absRoot, absFile);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path ${absFile} escapes root ${absRoot}`);
  }
  return absFile;
}

const MIME_BY_EXT: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".m4b": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".ogg": "audio/ogg",
  ".oga": "audio/ogg",
  ".opus": "audio/ogg",
  ".wav": "audio/wav",
  ".wma": "audio/x-ms-wma",
};

export function mimeTypeForPath(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

export type ParsedRange = { start: number; end: number };

/**
 * Parse a single-range "bytes=" header against `size`. Returns null if the
 * header is absent, malformed, or unsatisfiable — caller should then send
 * the full file (200) or 416 respectively.
 *
 *   "bytes=0-"        → 0..size-1
 *   "bytes=100-499"   → 100..499
 *   "bytes=-500"      → last 500 bytes
 *   "bytes=500-"      → 500..size-1
 */
export function parseRange(
  header: string | null,
  size: number,
): ParsedRange | "invalid" | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return "invalid";
  const [, startStr, endStr] = match;

  let start: number;
  let end: number;
  if (startStr === "" && endStr === "") return "invalid";
  if (startStr === "") {
    // Suffix range: last N bytes.
    const suffixLen = Number.parseInt(endStr!, 10);
    if (!Number.isFinite(suffixLen) || suffixLen <= 0) return "invalid";
    start = Math.max(0, size - suffixLen);
    end = size - 1;
  } else {
    start = Number.parseInt(startStr, 10);
    end = endStr === "" ? size - 1 : Number.parseInt(endStr, 10);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return "invalid";
  if (start > end || start < 0 || start >= size) return "invalid";
  if (end >= size) end = size - 1;
  return { start, end };
}
