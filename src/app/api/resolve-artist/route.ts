// Lazy MBID resolution for artist chart rows when Last.fm omits MusicBrainz
// IDs. Redirects to the canonical artist page when MB can resolve the name,
// otherwise falls back to app search.

import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/auth";
import { searchArtists } from "@/lib/musicbrainz";

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const artist = request.nextUrl.searchParams.get("artist")?.trim() ?? "";
  if (!artist) {
    return NextResponse.redirect(new URL("/search", request.url));
  }

  const fallback = new URL(
    `/search?q=${encodeURIComponent(artist)}`,
    request.url,
  );

  try {
    const results = await searchArtists(artist, 5);
    const hit = results[0];
    if (hit) {
      return NextResponse.redirect(new URL(`/artist/${hit.mbid}`, request.url));
    }
  } catch {
    // fall through to search
  }
  return NextResponse.redirect(fallback);
}
