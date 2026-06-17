// Audioseerr-owned single-track library helpers (the DownloadedTrack table).
// This is the slskd equivalent of src/lib/userLibrary.ts: it resolves a
// finished Soulseek download to a file on disk, registers it as a playable
// track, scopes visibility per-user, and answers the album page / playlists
// "do we have this track, and can this viewer stream it?".

import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/db";
import { baseName } from "@/lib/slskd";
import { applyPathMap, parsePathMap } from "@/lib/streaming";
import { isAdmin, type LibraryViewer } from "@/lib/userLibrary";
import type { Request } from "@prisma/client";

/**
 * Locate the file slskd downloaded. slskd writes completed downloads under its
 * configured downloads directory; we don't trust its exact subfolder layout, so
 * we translate that root to a path Audioseerr can read (shared mediaPathMap)
 * and search it for the remote file's basename. Returns an absolute, readable
 * path or null if it hasn't landed yet.
 */
export async function resolveDownloadedFilePath(opts: {
  slskdDownloadPath: string;
  mediaPathMap: string | null;
  remoteFilename: string;
}): Promise<string | null> {
  const mappings = parsePathMap(opts.mediaPathMap);
  const mappedRoot = applyPathMap(opts.slskdDownloadPath, mappings);
  const target = baseName(opts.remoteFilename);
  if (!target) return null;
  return findFileByName(mappedRoot, target, 6);
}

async function findFileByName(
  root: string,
  name: string,
  maxDepth: number,
): Promise<string | null> {
  // Exact basename match wins; otherwise fall back to a normalized match, since
  // slskd sanitizes filesystem-illegal characters (e.g. `?`, `:`) when writing
  // the local file, so its on-disk name can differ from the remote basename.
  const normName = normalizeFileName(name);
  let fallback: string | null = null;
  // Bounded breadth-first walk so a large downloads dir can't hang the sync.
  const queue: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }];
  let scanned = 0;
  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (++scanned > 20000) return fallback; // safety ceiling
      const full = path.join(dir, entry.name);
      if (entry.isFile()) {
        if (entry.name === name) return full;
        if (!fallback && normalizeFileName(entry.name) === normName) {
          fallback = full;
        }
      } else if (entry.isDirectory() && depth < maxDepth) {
        queue.push({ dir: full, depth: depth + 1 });
      }
    }
  }
  return fallback;
}

function normalizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Register a finished download as a playable track and attach the requester.
 * Upserts on (albumMbid, albumPosition) so a second requester for the same
 * track reuses the one file. Returns the DownloadedTrack id, or null if the
 * request lacks the album context the table keys on.
 */
export async function registerDownloadedTrack(
  request: Request,
  absFilePath: string,
): Promise<string | null> {
  if (!request.albumMbid || request.albumPosition == null) return null;

  let sizeBytes: number | null = null;
  try {
    sizeBytes = (await fs.stat(absFilePath)).size;
  } catch {
    // Path resolved but vanished between resolve and stat — treat as not-ready.
    return null;
  }
  const format =
    path.extname(absFilePath).replace(/^\./, "").toLowerCase() || null;

  const track = await prisma.downloadedTrack.upsert({
    where: {
      albumMbid_albumPosition: {
        albumMbid: request.albumMbid,
        albumPosition: request.albumPosition,
      },
    },
    update: {
      filePath: absFilePath,
      format,
      sizeBytes,
      recordingMbid: request.recordingMbid,
    },
    create: {
      recordingMbid: request.recordingMbid,
      albumMbid: request.albumMbid,
      albumPosition: request.albumPosition,
      title: request.title,
      artistName: request.artistName,
      albumTitle: request.albumTitle,
      coverUrl: request.coverUrl,
      filePath: absFilePath,
      format,
      sizeBytes,
    },
  });

  await attachDownloadedTrackToUser(request.requestedById, track.id);
  return track.id;
}

/** Idempotent per-user visibility attach (mirrors attachLibraryItemToUser). */
export async function attachDownloadedTrackToUser(
  userId: string,
  downloadedTrackId: string,
): Promise<void> {
  await prisma.userDownloadedTrack.upsert({
    where: { userId_downloadedTrackId: { userId, downloadedTrackId } },
    create: { userId, downloadedTrackId },
    update: {},
  });
}

/** Stream-time authorization for a single track. Admins always pass. */
export async function viewerCanStreamTrack(
  viewer: LibraryViewer,
  downloadedTrackId: string,
): Promise<boolean> {
  if (!viewer) return false;
  if (isAdmin(viewer)) return true;
  const row = await prisma.userDownloadedTrack.findUnique({
    where: {
      userId_downloadedTrackId: { userId: viewer.id, downloadedTrackId },
    },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Viewer-scoped map of albumPosition → DownloadedTrack for one album, used by
 * the album page to render locally-downloaded singles as playable. Admins see
 * all; regular users only see tracks they have a UserDownloadedTrack row for.
 */
export async function buildDownloadedTrackLookup(
  viewer: LibraryViewer,
  albumMbid: string,
): Promise<Map<number, { id: string; recordingMbid: string | null }>> {
  const out = new Map<number, { id: string; recordingMbid: string | null }>();
  if (!viewer) return out;
  const rows = await prisma.downloadedTrack.findMany({
    where: {
      albumMbid,
      ...(isAdmin(viewer)
        ? {}
        : { users: { some: { userId: viewer.id } } }),
    },
    select: { id: true, albumPosition: true, recordingMbid: true },
  });
  for (const row of rows) {
    out.set(row.albumPosition, { id: row.id, recordingMbid: row.recordingMbid });
  }
  return out;
}

/**
 * Viewer-scoped map of recordingMbid → DownloadedTrack id, used by the playlist
 * page to resolve which playlist tracks are locally streamable.
 */
export async function getDownloadedTracksByRecording(
  viewer: LibraryViewer,
  recordingMbids: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!viewer || recordingMbids.length === 0) return out;
  const rows = await prisma.downloadedTrack.findMany({
    where: {
      recordingMbid: { in: recordingMbids },
      ...(isAdmin(viewer)
        ? {}
        : { users: { some: { userId: viewer.id } } }),
    },
    select: { id: true, recordingMbid: true },
  });
  for (const row of rows) {
    if (row.recordingMbid) out.set(row.recordingMbid, row.id);
  }
  return out;
}

/** Fetch a track's file path for the stream route (no auth — caller checks). */
export async function getDownloadedTrackFile(
  downloadedTrackId: string,
): Promise<{ filePath: string } | null> {
  return prisma.downloadedTrack.findUnique({
    where: { id: downloadedTrackId },
    select: { filePath: true },
  });
}
