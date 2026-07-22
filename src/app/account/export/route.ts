// GET /account/export — downloads the signed-in user's data as a JSON file
// (GDPR-style data portability). Session-gated: users can only ever export
// themselves; the filename carries their username + date. Assembly lives in
// src/lib/export.ts (pure, unit-tested); this route only queries and streams
// the result with an attachment Content-Disposition.

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { buildExport, exportFileName } from "@/lib/export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  // The full user row is fetched (including secrets); buildExport whitelist-
  // shapes the profile so passwordHash/tokens never reach the output.
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const [likes, playlists, playHistory, requests, library] =
    await Promise.all([
      prisma.like.findMany({ where: { userId } }),
      prisma.playlist.findMany({
        where: { userId },
        include: { tracks: true },
      }),
      prisma.playHistory.findMany({ where: { userId } }),
      prisma.request.findMany({ where: { requestedById: userId } }),
      prisma.userLibraryItem.findMany({
        where: { userId },
        include: { libraryItem: true },
      }),
    ]);

  const now = new Date();
  const data = buildExport(user, { likes, playlists, playHistory, requests, library }, { now });
  const body = JSON.stringify(data, null, 2);

  return new Response(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${exportFileName(user.username, now)}"`,
      "Cache-Control": "no-store",
    },
  });
}
