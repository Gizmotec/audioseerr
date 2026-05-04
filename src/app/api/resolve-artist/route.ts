// Lazy MBID resolution for artist chart rows when Last.fm omits MusicBrainz
// IDs. Redirects to the canonical artist page when MB can resolve the name,
// otherwise falls back to app search.
//
// Uses a relative Location header — see resolve-album/route.ts for the full
// reasoning around standalone Next + reverse-proxy hosts.

import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { searchArtists } from "@/lib/musicbrainz";

function redirectTo(path: string): NextResponse {
  return new NextResponse(null, {
    status: 307,
    headers: { Location: path },
  });
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return redirectTo("/login");
  }

  const artist = request.nextUrl.searchParams.get("artist")?.trim() ?? "";
  if (!artist) {
    return redirectTo("/search");
  }

  const fallback = `/search?q=${encodeURIComponent(artist)}`;

  try {
    const results = await searchArtists(artist, 5);
    const hit = results[0];
    if (hit) {
      return redirectTo(`/artist/${hit.mbid}`);
    }
  } catch {
    // fall through to search
  }
  return redirectTo(fallback);
}
