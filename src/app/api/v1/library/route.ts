// GET /api/v1/library — the caller's track library, newest first. Mirrors
// src/app/library/page.tsx exactly: the DownloadedTrack set (ephemeral temps
// excluded), scoped through UserDownloadedTrack rows for regular users and
// unfiltered for admins.

import { getApiUser, jsonError, parsePagination } from "@/lib/apiAuth";
import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/userLibrary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getApiUser(request);
  if (!user) return jsonError(401, "Invalid or missing API key.");

  const searchParams = new URL(request.url).searchParams;
  const pagination = parsePagination(searchParams);
  if ("error" in pagination) return jsonError(400, pagination.error);

  const rows = await prisma.downloadedTrack.findMany({
    where: {
      ephemeral: false,
      ...(isAdmin(user) ? {} : { users: { some: { userId: user.id } } }),
    },
    orderBy: { createdAt: "desc" },
    take: pagination.take,
    skip: pagination.skip,
    select: {
      id: true,
      title: true,
      artistName: true,
      albumTitle: true,
      albumMbid: true,
      albumPosition: true,
      coverUrl: true,
      durationMs: true,
      recordingMbid: true,
    },
  });

  return Response.json(rows);
}
