// Cover-art fallback. The Cover Art Archive has nothing for a large share of
// release groups, so `coverartarchive.org/release-group/<mbid>/front-250` 404s
// and album grids fill up with placeholder discs. Cards point their <img> here
// once the Archive URL has failed; we look the album up on Deezer (one cached
// search) and 307 to whatever cover it has.
//
// Redirects use a relative-or-absolute Location header written by hand rather
// than NextResponse.redirect — see the note in api/resolve-album/route.ts about
// request.url in the standalone container.

import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getDeezerAlbumArtwork } from "@/lib/deezer";

// Long: a resolved cover is a stable third-party URL, and the underlying Deezer
// lookup is itself cached for 7 days.
const CACHE_CONTROL = "public, max-age=86400, stale-while-revalidate=604800";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse(null, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const artist = searchParams.get("artist")?.trim() ?? "";
  const title = searchParams.get("title")?.trim() ?? "";
  if (!artist || !title) {
    return new NextResponse(null, { status: 400 });
  }

  let url: string | null = null;
  try {
    url = await getDeezerAlbumArtwork(artist, title);
  } catch {
    // Treated as "no cover" — the card keeps its placeholder.
  }
  if (!url) {
    // 404 lets the <img> onError fire so the card shows its placeholder disc.
    return new NextResponse(null, { status: 404 });
  }

  return new NextResponse(null, {
    status: 307,
    headers: { Location: url, "Cache-Control": CACHE_CONTROL },
  });
}
