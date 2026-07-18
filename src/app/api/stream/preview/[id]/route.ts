// 307-redirects to a freshly-signed Deezer 30s preview URL for a track.
// Deezer's preview URLs are Akamai-signed and expire ~15 minutes after issue,
// so discovery surfaces store this stable endpoint as their `previewUrl` and
// we resolve a fresh CDN URL (briefly cached) at play time. A track with no
// preview gets 404, which the player treats like any other load failure.

import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDeezerTrackPreviewUrl } from "@/lib/deezer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, ctx: Ctx) {
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) {
    return new Response("Bad track id", { status: 400 });
  }

  const url = await getDeezerTrackPreviewUrl(id);
  if (!url) {
    return new Response("No preview", { status: 404 });
  }

  // The Location is Deezer's CDN (absolute, external), so the relative-header
  // workaround in /api/resolve-album doesn't apply here.
  return new NextResponse(null, {
    status: 307,
    headers: { Location: url },
  });
}
