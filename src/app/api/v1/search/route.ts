// GET /api/v1/search?q= — MusicBrainz search, reusing the app's own search
// lib (src/lib/musicbrainz.ts, rate-limited + ApiCache-cached). Unlike the
// /search page this does NOT record the query in the user's recent searches —
// API calls shouldn't pollute UI state.

import { getApiUser, jsonError } from "@/lib/apiAuth";
import { searchAlbums, searchArtists } from "@/lib/musicbrainz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await getApiUser(request);
  if (!user) return jsonError(401, "Invalid or missing API key.");

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (!q) return jsonError(400, "Missing required query parameter: q");

  try {
    // Same pairing as the search page: a small artist list plus the album
    // (release-group) results.
    const [artists, albums] = await Promise.all([
      searchArtists(q, 5),
      searchAlbums(q),
    ]);
    return Response.json({ query: q, artists, albums });
  } catch (err) {
    console.error("[api/v1/search] upstream search failed:", err);
    return jsonError(502, "Search failed upstream (MusicBrainz).");
  }
}
