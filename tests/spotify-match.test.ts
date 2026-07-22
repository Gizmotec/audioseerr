import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MbAlbum } from "@/lib/musicbrainz";
import type { SpotifyTrack } from "@/lib/spotify-api";
import { matchSpotifyTracks } from "@/lib/spotify-match";
import { findAlbumByArtistTitle } from "@/lib/musicbrainz";

// The real musicbrainz module is network + prisma-cache bound; the contract
// under test here is grouping/scoring given findAlbumByArtistTitle's results.
vi.mock("@/lib/musicbrainz", () => ({
  findAlbumByArtistTitle: vi.fn(),
}));

const findAlbumMock = vi.mocked(findAlbumByArtistTitle);

function makeTrack(
  id: string,
  album: { id: string; name: string; artist: string },
): SpotifyTrack {
  return {
    id,
    name: `Track ${id}`,
    artists: [album.artist],
    primaryArtist: album.artist,
    durationMs: 200_000,
    isrc: null,
    trackNumber: 1,
    album: {
      id: album.id,
      name: album.name,
      artists: [album.artist],
      primaryArtist: album.artist,
      releaseDate: null,
      coverUrl: null,
    },
  };
}

function makeMbAlbum(title: string, artistName = "Artist"): MbAlbum {
  return {
    mbid: `mbid-${title}`,
    title,
    artistName,
    artistMbid: null,
    firstReleaseDate: null,
    primaryType: "Album",
    coverUrl: `https://coverartarchive.org/release-group/mbid-${title}/front-250`,
  };
}

describe("matchSpotifyTracks", () => {
  beforeEach(() => {
    findAlbumMock.mockReset();
  });

  it("returns empty results for an empty playlist without any lookups", async () => {
    const progress: Array<{ done: number; total: number; currentAlbum: string }> = [];
    const result = await matchSpotifyTracks([], (p) => progress.push({ ...p }));

    expect(result).toEqual({ matched: [], notFound: [], albumsLookedUp: 0 });
    expect(findAlbumMock).not.toHaveBeenCalled();
    expect(progress).toEqual([{ done: 0, total: 0, currentAlbum: "" }]);
  });

  it("looks up each unique Spotify album once, however many tracks it has", async () => {
    findAlbumMock.mockResolvedValue(makeMbAlbum("Album A"));
    const tracks = [
      makeTrack("t1", { id: "alb-a", name: "Album A", artist: "Artist" }),
      makeTrack("t2", { id: "alb-a", name: "Album A", artist: "Artist" }),
      makeTrack("t3", { id: "alb-a", name: "Album A", artist: "Artist" }),
    ];

    const result = await matchSpotifyTracks(tracks);

    expect(findAlbumMock).toHaveBeenCalledTimes(1);
    expect(findAlbumMock).toHaveBeenCalledWith("Artist", "Album A");
    expect(result.albumsLookedUp).toBe(1);
    expect(result.matched).toHaveLength(3);
    expect(result.notFound).toHaveLength(0);
  });

  it("marks exact title matches as confident", async () => {
    findAlbumMock.mockResolvedValue(makeMbAlbum("Album A"));
    const result = await matchSpotifyTracks([
      makeTrack("t1", { id: "a", name: "Album A", artist: "Artist" }),
    ]);

    expect(result.matched[0]).toMatchObject({
      confidence: "confident",
      reason: "Exact title and artist match.",
    });
  });

  it("treats case and punctuation differences as exact after normalization", async () => {
    findAlbumMock.mockResolvedValue(
      makeMbAlbum("What's the Story Morning Glory?"),
    );
    const result = await matchSpotifyTracks([
      makeTrack("t1", {
        id: "a",
        name: "(What's the Story) Morning Glory",
        artist: "Oasis",
      }),
    ]);

    expect(result.matched[0]!.confidence).toBe("confident");
  });

  it("does not fold diacritics — accented vs unaccented titles are uncertain", async () => {
    findAlbumMock.mockResolvedValue(makeMbAlbum("Mekanik Destruktiw Kommandoh"));
    const result = await matchSpotifyTracks([
      makeTrack("t1", {
        id: "a",
        name: "Mëkanïk Destruktïw Kommandöh",
        artist: "Magma",
      }),
    ]);

    expect(result.matched[0]!.confidence).toBe("uncertain");
  });

  it("marks edition-suffix mismatches (Deluxe/Remastered) as uncertain with both titles in the reason", async () => {
    findAlbumMock.mockResolvedValue(makeMbAlbum("Thriller"));
    const result = await matchSpotifyTracks([
      makeTrack("t1", {
        id: "a",
        name: "Thriller (25th Anniversary Edition)",
        artist: "Michael Jackson",
      }),
    ]);

    const match = result.matched[0]!;
    expect(match.confidence).toBe("uncertain");
    expect(match.reason).toContain("Thriller (25th Anniversary Edition)");
    expect(match.reason).toContain('"Thriller"');
  });

  it("sends every track of an unmatched album to notFound", async () => {
    findAlbumMock.mockResolvedValue(null);
    const tracks = [
      makeTrack("t1", { id: "alb-x", name: "Obscure", artist: "Nobody" }),
      makeTrack("t2", { id: "alb-x", name: "Obscure", artist: "Nobody" }),
    ];

    const result = await matchSpotifyTracks(tracks);

    expect(result.matched).toHaveLength(0);
    expect(result.notFound).toHaveLength(2);
    expect(result.notFound[0]).toMatchObject({ reason: "no_album_match" });
    expect(result.albumsLookedUp).toBe(1);
  });

  it("splits matched and notFound across albums independently", async () => {
    findAlbumMock.mockImplementation(async (_artist, title) =>
      title === "Found Album" ? makeMbAlbum("Found Album") : null,
    );
    const tracks = [
      makeTrack("t1", { id: "a", name: "Found Album", artist: "Artist" }),
      makeTrack("t2", { id: "b", name: "Missing Album", artist: "Artist" }),
      makeTrack("t3", { id: "a", name: "Found Album", artist: "Artist" }),
    ];

    const result = await matchSpotifyTracks(tracks);

    expect(result.albumsLookedUp).toBe(2);
    expect(result.matched.map((m) => m.spotifyTrack.id)).toEqual(["t1", "t3"]);
    expect(result.notFound.map((m) => m.spotifyTrack.id)).toEqual(["t2"]);
  });

  it("reports progress per album plus a final completion event", async () => {
    findAlbumMock.mockResolvedValue(makeMbAlbum("X"));
    const progress: Array<{ done: number; total: number; currentAlbum: string }> = [];
    const tracks = [
      makeTrack("t1", { id: "a", name: "First", artist: "Artist" }),
      makeTrack("t2", { id: "b", name: "Second", artist: "Artist" }),
    ];

    await matchSpotifyTracks(tracks, (p) => progress.push({ ...p }));

    expect(progress).toEqual([
      { done: 0, total: 2, currentAlbum: "First" },
      { done: 1, total: 2, currentAlbum: "Second" },
      { done: 2, total: 2, currentAlbum: "" },
    ]);
  });

  it("uses the first track's album metadata as canonical for the group", async () => {
    findAlbumMock.mockResolvedValue(makeMbAlbum("Real Name"));
    // Same album.id, but the second track carries stale/different metadata.
    const first = makeTrack("t1", { id: "a", name: "Real Name", artist: "Real Artist" });
    const second = makeTrack("t2", { id: "a", name: "Typo Name", artist: "Typo Artist" });

    await matchSpotifyTracks([first, second]);

    expect(findAlbumMock).toHaveBeenCalledWith("Real Artist", "Real Name");
  });
});
