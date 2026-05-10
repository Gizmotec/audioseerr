import { getValidSpotifyToken } from "@/lib/spotify";

// Spotify Web API client. The user's connection is per-user (PKCE-issued
// tokens stored on the User row); this module wraps the auth + pagination so
// callers can think in terms of "list playlists" and "get tracks".

const API_BASE = "https://api.spotify.com/v1";

export type SpotifyPlaylistSummary = {
  id: string;
  name: string;
  description: string | null;
  trackCount: number;
  coverUrl: string | null;
  ownerName: string;
  ownedByUser: boolean;
};

export type SpotifyTrack = {
  id: string;
  name: string;
  artists: string[];
  /** First/primary artist — what we feed into MB lookups. */
  primaryArtist: string;
  durationMs: number;
  isrc: string | null;
  trackNumber: number;
  album: SpotifyAlbumRef;
};

export type SpotifyAlbumRef = {
  id: string;
  name: string;
  artists: string[];
  primaryArtist: string;
  releaseDate: string | null;
  coverUrl: string | null;
};

class SpotifyApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function spotifyFetch<T>(userId: string, path: string): Promise<T> {
  const token = await getValidSpotifyToken(userId);
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new SpotifyApiError(
      res.status,
      `Spotify API ${path} → HTTP ${res.status}: ${text}`,
    );
  }
  return (await res.json()) as T;
}

type PlaylistsPage = {
  items: Array<{
    id: string;
    name: string;
    description: string | null;
    images: Array<{ url: string }>;
    owner: { id: string; display_name: string | null };
    tracks: { total: number };
  }>;
  next: string | null;
  total: number;
};

export async function getPlaylist(
  userId: string,
  playlistId: string,
): Promise<SpotifyPlaylistSummary> {
  // /playlists/{id} doesn't tell us whether the current user owns it, so we
  // fetch /me alongside to set ownedByUser correctly.
  const fields =
    "id,name,description,images,owner(id,display_name),tracks(total)";
  const [playlist, me] = await Promise.all([
    spotifyFetch<{
      id: string;
      name: string;
      description: string | null;
      images: Array<{ url: string }>;
      owner: { id: string; display_name: string | null };
      tracks: { total: number };
    }>(
      userId,
      `/playlists/${encodeURIComponent(playlistId)}?fields=${encodeURIComponent(fields)}`,
    ),
    spotifyFetch<{ id: string }>(userId, "/me"),
  ]);
  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    trackCount: playlist.tracks.total,
    coverUrl: playlist.images?.[0]?.url ?? null,
    ownerName: playlist.owner.display_name ?? playlist.owner.id,
    ownedByUser: playlist.owner.id === me.id,
  };
}

export async function listMyPlaylists(
  userId: string,
): Promise<SpotifyPlaylistSummary[]> {
  // Spotify caps page size at 50 for /me/playlists.
  const profile = await spotifyFetch<{ id: string }>(userId, "/me");
  const out: SpotifyPlaylistSummary[] = [];
  let path: string | null = "/me/playlists?limit=50";
  while (path) {
    const page = await spotifyFetch<PlaylistsPage>(userId, path);
    for (const p of page.items) {
      out.push({
        id: p.id,
        name: p.name,
        description: p.description,
        trackCount: p.tracks.total,
        coverUrl: p.images?.[0]?.url ?? null,
        ownerName: p.owner.display_name ?? p.owner.id,
        ownedByUser: p.owner.id === profile.id,
      });
    }
    path = page.next ? page.next.replace(API_BASE, "") : null;
  }
  return out;
}

type PlaylistItem = {
  track: {
    id: string | null;
    type?: string;
    is_local?: boolean;
    name: string;
    duration_ms: number;
    track_number: number;
    external_ids?: { isrc?: string };
    artists: Array<{ name: string }>;
    album: {
      id: string;
      name: string;
      artists: Array<{ name: string }>;
      release_date?: string;
      images?: Array<{ url: string }>;
    };
  } | null;
};

type TracksPage = {
  items: PlaylistItem[];
  next: string | null;
  total: number;
};

export async function getPlaylistTracks(
  userId: string,
  playlistId: string,
): Promise<SpotifyTrack[]> {
  // The fields filter trims the response to just what we need; full track
  // objects on a 100-track playlist add ~50KB per page otherwise.
  const fields =
    "items(track(id,type,is_local,name,duration_ms,track_number,external_ids(isrc),artists(name),album(id,name,artists(name),release_date,images))),next,total";
  const out: SpotifyTrack[] = [];
  let path: string | null = `/playlists/${encodeURIComponent(playlistId)}/tracks?limit=100&fields=${encodeURIComponent(fields)}`;
  while (path) {
    const page = await spotifyFetch<TracksPage>(userId, path);
    for (const item of page.items) {
      const t = item.track;
      // Skip null (track was removed from Spotify), local files (no metadata
      // we can map), and podcast episodes (type="episode").
      if (!t || !t.id || t.is_local || t.type === "episode") continue;
      const artists = t.artists.map((a) => a.name).filter(Boolean);
      const albumArtists = t.album.artists.map((a) => a.name).filter(Boolean);
      out.push({
        id: t.id,
        name: t.name,
        artists,
        primaryArtist: artists[0] ?? "Unknown artist",
        durationMs: t.duration_ms,
        isrc: t.external_ids?.isrc ?? null,
        trackNumber: t.track_number,
        album: {
          id: t.album.id,
          name: t.album.name,
          artists: albumArtists,
          primaryArtist: albumArtists[0] ?? artists[0] ?? "Unknown artist",
          releaseDate: t.album.release_date ?? null,
          coverUrl: t.album.images?.[0]?.url ?? null,
        },
      });
    }
    path = page.next ? page.next.replace(API_BASE, "") : null;
  }
  return out;
}
