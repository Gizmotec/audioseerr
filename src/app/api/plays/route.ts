// Records that a user has played a track long enough for it to "count" for
// personalized recommendations. The player decides when (30s OR halfway).
//
// Skipped silently when the user has personalized suggestions turned off —
// the client doesn't need to know, and we never accumulate data the user
// chose to disable.
//
// Dedupe: if the same (userId, trackFileId) was inserted within the last 60s,
// the new event is dropped. Browsers occasionally fire `playing` twice when
// the user seeks within a track, and the player's threshold timer can
// re-arm; without dedupe a single listen could log 2–3 events.
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  recordingMbid?: unknown;
  albumMbid?: unknown;
  artistName?: unknown;
  trackFileId?: unknown;
};

const DEDUPE_WINDOW_MS = 60 * 1000;

function asString(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function asInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v) && v > 0) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  return null;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return new Response(null, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { personalizedSuggestionsEnabled: true },
  });
  // Honor the per-user opt-out at the server boundary so a stale client
  // (pre-toggle) can't keep writing events.
  if (!user || !user.personalizedSuggestionsEnabled) {
    return new Response(null, { status: 204 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return new Response("invalid json", { status: 400 });
  }

  const recordingMbid = asString(body.recordingMbid);
  const albumMbid = asString(body.albumMbid);
  const artistName = asString(body.artistName);
  const trackFileId = asInt(body.trackFileId);

  if (!recordingMbid || !albumMbid || !artistName || trackFileId === null) {
    return new Response("missing fields", { status: 400 });
  }

  const recent = await prisma.playEvent.findFirst({
    where: {
      userId,
      trackFileId,
      playedAt: { gt: new Date(Date.now() - DEDUPE_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (recent) {
    return new Response(null, { status: 204 });
  }

  await prisma.playEvent.create({
    data: { userId, recordingMbid, albumMbid, artistName, trackFileId },
  });
  return new Response(null, { status: 204 });
}
