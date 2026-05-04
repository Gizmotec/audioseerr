// Lazy MBID resolution for cards that originate from sources without
// MusicBrainz IDs (e.g. Deezer charts). The card links here with artist+title;
// we hit MB once per click (cached), then 307 to /album/[mbid]. Failed lookups
// fall back to the search page so the user still has a way forward.
//
// Redirects use a relative Location header (not NextResponse.redirect, which
// builds an absolute URL). In the production standalone container, Next
// builds request.url from the internal HOSTNAME/PORT env (0.0.0.0:3000)
// rather than the incoming Host header, so an absolute redirect would send
// the browser to localhost:3000 even when the user is on a different host.

import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { searchAlbums } from "@/lib/musicbrainz";

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

  const { searchParams } = request.nextUrl;
  const artist = searchParams.get("artist")?.trim() ?? "";
  const title = searchParams.get("title")?.trim() ?? "";
  if (!artist || !title) {
    return redirectTo("/search");
  }

  const fallback = `/search?q=${encodeURIComponent(`${artist} ${title}`)}`;

  try {
    const results = await searchAlbums(`${artist} ${title}`, 5);
    const hit = results[0];
    if (hit) {
      return redirectTo(`/album/${hit.mbid}`);
    }
  } catch {
    // fall through to search
  }
  return redirectTo(fallback);
}
