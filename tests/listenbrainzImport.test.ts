import { describe, expect, it } from "vitest";
import { filterExistingRows, rowKey } from "@/lib/lastfmImport";
import {
  isOwnScrobble,
  listenBrainzTrackKey,
  mapListensToRows,
  type ListenLike,
} from "@/lib/listenbrainzImport";

const REAL_MBID = "b4c6a5f0-1234-4abc-9def-0123456789ab";
const REAL_RG_MBID = "c5d7b6a1-2345-4bcd-9efa-0123456789cd";

function listen(overrides: {
  listened_at?: number;
  artist_name?: string;
  track_name?: string;
  info?: {
    recording_mbid?: string;
    release_group_mbid?: string;
    duration_ms?: number;
    media_player?: string;
    submission_client?: string;
  };
}): ListenLike {
  const { info, listened_at, artist_name, track_name } = overrides;
  return {
    listened_at: listened_at ?? 1_784_000_000,
    track_metadata: {
      artist_name: artist_name ?? "The Artist",
      track_name: track_name ?? "Track Title",
      ...(info ? { additional_info: info } : {}),
    },
  };
}

describe("listenBrainzTrackKey", () => {
  it("uses the real recording MBID when present", () => {
    expect(listenBrainzTrackKey("A", "T", REAL_MBID)).toBe(REAL_MBID);
  });

  it("builds a deterministic normalized pseudo-id without an MBID", () => {
    expect(listenBrainzTrackKey("The  Artist", "Track Title", null)).toBe(
      "listenbrainz:the artist:track title",
    );
    expect(listenBrainzTrackKey("  THE ARTIST ", "TRACK TITLE", null)).toBe(
      "listenbrainz:the artist:track title",
    );
  });

  it("rejects malformed mbids into the pseudo-id path", () => {
    expect(listenBrainzTrackKey("A", "T", "not-an-mbid")).toBe(
      "listenbrainz:a:t",
    );
  });

  it("never collides with the Last.fm pseudo-id family", () => {
    expect(listenBrainzTrackKey("A", "T", null)).not.toMatch(/^lastfm:/);
  });
});

describe("isOwnScrobble", () => {
  it("matches media_player Audioseerr case-insensitively", () => {
    expect(isOwnScrobble({ media_player: "Audioseerr" })).toBe(true);
    expect(isOwnScrobble({ media_player: " audioseerr " })).toBe(true);
  });

  it("matches submission_client Audioseerr", () => {
    expect(isOwnScrobble({ submission_client: "Audioseerr" })).toBe(true);
  });

  it("does not match other submitters or missing info", () => {
    expect(isOwnScrobble({ media_player: "navidrome" })).toBe(false);
    expect(isOwnScrobble({ submission_client: "spotify" })).toBe(false);
    expect(isOwnScrobble({})).toBe(false);
    expect(isOwnScrobble(undefined)).toBe(false);
  });
});

describe("mapListensToRows", () => {
  it("maps a matched listen to a full PlayHistory row", () => {
    const rows = mapListensToRows([
      listen({
        listened_at: 1_784_000_000,
        info: {
          recording_mbid: REAL_MBID,
          release_group_mbid: REAL_RG_MBID,
          duration_ms: 245_000,
          media_player: "navidrome",
        },
      }),
    ]);
    expect(rows).toEqual([
      {
        recordingMbid: REAL_MBID,
        artistName: "The Artist",
        title: "Track Title",
        playedMs: 245_000,
        durationMs: 245_000,
        playedAt: new Date(1_784_000_000_000),
        albumMbid: REAL_RG_MBID,
      },
    ]);
  });

  it("albumMbid is null when the listen is unmatched or the RG id is malformed", () => {
    const unmatched = mapListensToRows([listen({})]);
    expect(unmatched[0]!.albumMbid).toBeNull();
    expect(unmatched[0]!.recordingMbid).toBe(
      "listenbrainz:the artist:track title",
    );
    const malformed = mapListensToRows([
      listen({ info: { release_group_mbid: "nope" } }),
    ]);
    expect(malformed[0]!.albumMbid).toBeNull();
  });

  it("playedMs falls back to 0 when duration is absent or bogus", () => {
    const [noDuration] = mapListensToRows([listen({})]);
    expect(noDuration!.playedMs).toBe(0);
    expect(noDuration!.durationMs).toBeNull();
    const [negative] = mapListensToRows([
      listen({ info: { duration_ms: -5 } }),
    ]);
    expect(negative!.playedMs).toBe(0);
    expect(negative!.durationMs).toBeNull();
  });

  it("skips Audioseerr's own scrobbles (already recorded by the play path)", () => {
    expect(
      mapListensToRows([
        listen({ info: { media_player: "Audioseerr" } }),
        listen({ info: { submission_client: "Audioseerr" } }),
      ]),
    ).toEqual([]);
  });

  it("drops rows without a valid timestamp, artist, or title", () => {
    expect(
      mapListensToRows([
        { listened_at: 0, track_metadata: { artist_name: "A", track_name: "T" } },
        { track_metadata: { artist_name: "A", track_name: "T" } },
        listen({ artist_name: "  " }),
        listen({ track_name: "" }),
        { listened_at: 1_784_000_000 },
      ]),
    ).toEqual([]);
  });

  it("trims artist/title before storing", () => {
    const rows = mapListensToRows([
      listen({ artist_name: "  The Artist  ", track_name: " Track Title " }),
    ]);
    expect(rows[0]!.artistName).toBe("The Artist");
    expect(rows[0]!.title).toBe("Track Title");
  });

  it("collapses in-batch duplicates (catch-up/backfill window overlap)", () => {
    const dupe = listen({ info: { recording_mbid: REAL_MBID } });
    const rows = mapListensToRows([dupe, dupe, listen({})]);
    expect(rows).toHaveLength(2);
  });

  it("keeps distinct plays of the same track at different times", () => {
    const rows = mapListensToRows([
      listen({ listened_at: 1_784_000_000 }),
      listen({ listened_at: 1_784_003_600 }),
    ]);
    expect(rows).toHaveLength(2);
  });

  it("survives the shared dedupe split with albumMbid intact", () => {
    const rows = mapListensToRows([
      listen({
        listened_at: 1_784_000_000,
        info: { release_group_mbid: REAL_RG_MBID },
      }),
      listen({ listened_at: 1_784_003_600 }),
    ]);
    const existing = new Set([rowKey(rows[1]!.recordingMbid, rows[1]!.playedAt)]);
    const { fresh, skipped } = filterExistingRows(rows, existing);
    expect(skipped).toBe(1);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]!.albumMbid).toBe(REAL_RG_MBID);
  });
});
