// Unit tests for the pure export builder in src/lib/export.ts. Hermetic: the
// module only imports src/lib/version.ts (package.json read), no prisma/db.
import { describe, expect, it } from "vitest";
import {
  buildExport,
  exportFileName,
  type ExportCollections,
} from "@/lib/export";
import { currentAppVersion } from "@/lib/version";

const NOW = new Date("2026-07-22T12:00:00Z");

function emptyCollections(): ExportCollections {
  return { likes: [], playlists: [], playHistory: [], requests: [], library: [] };
}

const profile = {
  username: "alex",
  email: "alex@example.com",
  role: "USER",
  createdAt: new Date("2026-01-05T09:30:00Z"),
};

describe("buildExport", () => {
  it("shapes the envelope: exportedAt, app, version, profile", () => {
    const out = buildExport(profile, emptyCollections(), { now: NOW });
    expect(out.exportedAt).toBe("2026-07-22T12:00:00.000Z");
    expect(out.app).toBe("audioseerr");
    expect(out.version).toBe(currentAppVersion());
    expect(out.profile).toEqual({
      username: "alex",
      email: "alex@example.com",
      role: "USER",
      createdAt: "2026-01-05T09:30:00.000Z",
    });
  });

  it("never leaks secrets present on the input profile object", () => {
    const leakyProfile = {
      ...profile,
      passwordHash: "$2b$10$supersecrethash",
      spotifyClientId: "spotify-client-id",
      spotifyAccessToken: "spotify-access-token-value",
      spotifyRefreshToken: "spotify-refresh-token-value",
      spotifyTokenExpiresAt: new Date("2027-01-01T00:00:00Z"),
      lastfmUsername: "alex.fm",
      lastfmSessionKey: "lastfm-session-key-value",
      listenbrainzUsername: "alexlb",
      listenbrainzToken: "listenbrainz-token-value",
      apiKeys: [{ keyHash: "api-key-hash" }],
      invitesCreated: [{ token: "invite-token" }],
    };

    const out = buildExport(leakyProfile, emptyCollections(), { now: NOW });

    // Profile carries exactly the four public fields.
    expect(Object.keys(out.profile).sort()).toEqual([
      "createdAt",
      "email",
      "role",
      "username",
    ]);

    // No secret-shaped key anywhere in the serialized output…
    const json = JSON.stringify(out);
    for (const key of [
      "passwordHash",
      "spotifyClientId",
      "spotifyAccessToken",
      "spotifyRefreshToken",
      "spotifyTokenExpiresAt",
      "lastfmSessionKey",
      "listenbrainzToken",
      "apiKeys",
      "keyHash",
      "invite",
      "token",
      "Token",
    ]) {
      expect(json).not.toContain(`"${key}"`);
    }
    // …and no secret value either.
    for (const value of [
      "supersecrethash",
      "spotify-access-token-value",
      "spotify-refresh-token-value",
      "lastfm-session-key-value",
      "listenbrainz-token-value",
      "api-key-hash",
      "invite-token",
    ]) {
      expect(json).not.toContain(value);
    }
  });

  it("shapes every collection with whitelisted fields and ISO dates", () => {
    const out = buildExport(
      profile,
      {
        likes: [
          {
            id: "like1",
            targetType: "TRACK",
            targetId: "rec-mbid-1",
            title: "Creep",
            artistName: "Radiohead",
            albumMbid: "album-mbid-1",
            albumTitle: "Pablo Honey",
            coverUrl: "https://img/cover.jpg",
            createdAt: new Date("2026-02-01T10:00:00Z"),
          },
        ],
        playlists: [],
        playHistory: [
          {
            id: "play1",
            recordingMbid: "rec-mbid-1",
            albumMbid: "album-mbid-1",
            artistName: "Radiohead",
            title: "Creep",
            durationMs: 238000,
            playedMs: 120000,
            playedAt: new Date("2026-03-01T20:00:00Z"),
          },
        ],
        requests: [
          {
            id: "req1",
            type: "ALBUM",
            mbid: "rg-mbid-1",
            title: "OK Computer",
            artistName: "Radiohead",
            coverUrl: null,
            albumMbid: null,
            albumTitle: null,
            recordingMbid: null,
            albumPosition: null,
            status: "AVAILABLE",
            requestedAt: new Date("2026-04-01T08:00:00Z"),
            approvedAt: new Date("2026-04-01T09:00:00Z"),
            declineReason: null,
          },
        ],
        library: [
          {
            id: "lib1",
            mbid: "rg-mbid-1",
            addedAt: new Date("2026-04-02T08:00:00Z"),
            libraryItem: {
              artistName: "Radiohead",
              title: "OK Computer",
              status: "AVAILABLE",
            },
          },
        ],
      },
      { now: NOW },
    );

    expect(out.likes).toEqual([
      {
        id: "like1",
        targetType: "TRACK",
        targetId: "rec-mbid-1",
        title: "Creep",
        artistName: "Radiohead",
        albumMbid: "album-mbid-1",
        albumTitle: "Pablo Honey",
        coverUrl: "https://img/cover.jpg",
        createdAt: "2026-02-01T10:00:00.000Z",
      },
    ]);
    expect(out.playHistory).toEqual([
      {
        id: "play1",
        recordingMbid: "rec-mbid-1",
        albumMbid: "album-mbid-1",
        artistName: "Radiohead",
        title: "Creep",
        durationMs: 238000,
        playedMs: 120000,
        playedAt: "2026-03-01T20:00:00.000Z",
      },
    ]);
    expect(out.requests).toEqual([
      {
        id: "req1",
        type: "ALBUM",
        mbid: "rg-mbid-1",
        title: "OK Computer",
        artistName: "Radiohead",
        coverUrl: null,
        albumMbid: null,
        albumTitle: null,
        recordingMbid: null,
        albumPosition: null,
        status: "AVAILABLE",
        requestedAt: "2026-04-01T08:00:00.000Z",
        approvedAt: "2026-04-01T09:00:00.000Z",
        declineReason: null,
      },
    ]);
    expect(out.library).toEqual([
      {
        id: "lib1",
        mbid: "rg-mbid-1",
        artistName: "Radiohead",
        title: "OK Computer",
        status: "AVAILABLE",
        addedAt: "2026-04-02T08:00:00.000Z",
      },
    ]);
  });

  it("sorts collections deterministically by date asc (id tie-break)", () => {
    const like = (
      id: string,
      createdAt: string,
    ): ExportCollections["likes"][number] => ({
      id,
      targetType: "ALBUM",
      targetId: `target-${id}`,
      title: `Album ${id}`,
      artistName: null,
      albumMbid: null,
      albumTitle: null,
      coverUrl: null,
      createdAt: new Date(createdAt),
    });

    // Given out of order: expect createdAt asc; equal timestamps ordered by id.
    const out = buildExport(
      profile,
      {
        likes: [
          like("c", "2026-05-01T00:00:00Z"),
          like("b", "2026-01-01T00:00:00Z"),
          like("a", "2026-01-01T00:00:00Z"),
        ],
        playlists: [],
        playHistory: [],
        requests: [],
        library: [],
      },
      { now: NOW },
    );

    expect(out.likes.map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("nests playlist items ordered by position", () => {
    const track = (
      id: string,
      position: number,
    ): ExportCollections["playlists"][number]["tracks"][number] => ({
      id,
      position,
      recordingMbid: `rec-${id}`,
      albumMbid: "album-mbid",
      albumPosition: position,
      title: `Track ${id}`,
      artistName: "Artist",
      albumTitle: "Album",
      coverUrl: null,
      durationMs: null,
      addedAt: new Date("2026-06-01T00:00:00Z"),
    });

    const out = buildExport(
      profile,
      {
        likes: [],
        playlists: [
          {
            id: "pl1",
            name: "Favourites",
            description: null,
            coverUrl: null,
            isShared: false,
            createdAt: new Date("2026-06-01T00:00:00Z"),
            updatedAt: new Date("2026-06-02T00:00:00Z"),
            tracks: [track("t3", 3), track("t1", 1), track("t2", 2)],
          },
        ],
        playHistory: [],
        requests: [],
        library: [],
      },
      { now: NOW },
    );

    expect(out.playlists).toHaveLength(1);
    const playlist = out.playlists[0];
    expect(playlist.name).toBe("Favourites");
    expect(playlist.createdAt).toBe("2026-06-01T00:00:00.000Z");
    expect(playlist.updatedAt).toBe("2026-06-02T00:00:00.000Z");
    // Items nested (not flat) and sorted by position asc.
    expect(playlist.items.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    expect(playlist.items[0]).toMatchObject({
      position: 1,
      recordingMbid: "rec-t1",
      title: "Track t1",
      addedAt: "2026-06-01T00:00:00.000Z",
    });
    // Playlist rows themselves must not carry the raw relation key.
    expect(playlist).not.toHaveProperty("tracks");
  });

  it("does not mutate its inputs", () => {
    const likes = [
      {
        id: "z",
        targetType: "ARTIST",
        targetId: "artist-mbid",
        title: "Radiohead",
        artistName: null,
        albumMbid: null,
        albumTitle: null,
        coverUrl: null,
        createdAt: new Date("2026-05-01T00:00:00Z"),
      },
      {
        id: "y",
        targetType: "ARTIST",
        targetId: "artist-mbid-2",
        title: "Portishead",
        artistName: null,
        albumMbid: null,
        albumTitle: null,
        coverUrl: null,
        createdAt: new Date("2026-01-01T00:00:00Z"),
      },
    ];
    buildExport(
      profile,
      { likes, playlists: [], playHistory: [], requests: [], library: [] },
      { now: NOW },
    );
    expect(likes.map((l) => l.id)).toEqual(["z", "y"]);
  });
});

describe("exportFileName", () => {
  it("formats audioseerr-export-<username>-<YYYYMMDD>.json in UTC", () => {
    expect(exportFileName("alex", new Date("2026-07-22T23:59:59Z"))).toBe(
      "audioseerr-export-alex-20260722.json",
    );
  });

  it("sanitizes characters unsafe for a filename", () => {
    expect(exportFileName('al/ex:"quoted"', NOW)).toBe(
      "audioseerr-export-al_ex__quoted_-20260722.json",
    );
  });
});
