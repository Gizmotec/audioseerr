import {
  getDeezerArtistArtwork,
  getDeezerTrackArtwork,
} from "@/lib/deezer";
import type { LastFmChartArtist, LastFmChartTrack } from "@/lib/lastfm";

export async function enrichTrackArtwork(
  tracks: LastFmChartTrack[],
): Promise<LastFmChartTrack[]> {
  return Promise.all(
    tracks.map(async (track) => {
      if (track.imageUrl && track.albumTitle) return track;
      const match = await getDeezerTrackArtwork({
        artistName: track.artistName,
        trackName: track.name,
      }).catch(() => ({ imageUrl: null, albumTitle: null }));
      return {
        ...track,
        imageUrl: track.imageUrl ?? match.imageUrl,
        albumTitle: track.albumTitle ?? match.albumTitle,
      };
    }),
  );
}

export async function enrichArtistArtwork(
  artists: LastFmChartArtist[],
): Promise<LastFmChartArtist[]> {
  return Promise.all(
    artists.map(async (artist) => {
      if (artist.imageUrl) return artist;
      const imageUrl = await getDeezerArtistArtwork(artist.name).catch(() => null);
      return imageUrl ? { ...artist, imageUrl } : artist;
    }),
  );
}
