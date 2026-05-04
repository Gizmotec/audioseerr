// Lazy MBID resolution for cards that originate from sources without
// MusicBrainz IDs (e.g. Deezer charts). The card links here with artist+title;
// we hit MB once per click (cached), then 307 to /album/[mbid]. Failed lookups
// fall back to the search page so the user still has a way forward.

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { searchAlbums } from "@/lib/musicbrainz";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { searchParams } = request.nextUrl;
  const artist = searchParams.get("artist")?.trim() ?? "";
  const title = searchParams.get("title")?.trim() ?? "";
  if (!artist || !title) {
    return NextResponse.redirect(new URL("/search", request.url));
  }

  const fallback = new URL(
    `/search?q=${encodeURIComponent(`${artist} ${title}`)}`,
    request.url,
  );

  try {
    const results = await searchAlbums(`${artist} ${title}`, 5);
    const hit = results[0];
    if (hit) {
      return NextResponse.redirect(new URL(`/album/${hit.mbid}`, request.url));
    }
  } catch {
    // fall through to search
  }
  return NextResponse.redirect(fallback);
}
