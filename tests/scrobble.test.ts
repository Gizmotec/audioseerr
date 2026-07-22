import { describe, expect, it } from "vitest";
import { buildApiSig } from "@/lib/scrobble/lastfm";
import { buildSubmitPayload } from "@/lib/scrobble/listenbrainz";
import { isRealMbid } from "@/lib/scrobble/types";

describe("lastfm buildApiSig", () => {
  it("matches the known md5 vector for auth.getSession params", () => {
    // Expected digest computed independently (Python hashlib) from
    // "api_keytestkeymethodauth.getSessiontokentok123" + "secret123".
    const sig = buildApiSig(
      { api_key: "testkey", method: "auth.getSession", token: "tok123" },
      "secret123",
    );
    expect(sig).toBe("9db142493357cfd4786084947783aa56");
  });

  it("matches the known md5 vector for track.scrobble params", () => {
    // Expected digest computed independently (Python hashlib) from
    // "api_keykeyartistArtist Namemethodtrack.scrobblesksessionkeytimestamp1700000000trackTrack Title" + "s3cr3t".
    const sig = buildApiSig(
      {
        sk: "sessionkey",
        artist: "Artist Name",
        track: "Track Title",
        timestamp: "1700000000",
        api_key: "key",
        method: "track.scrobble",
      },
      "s3cr3t",
    );
    expect(sig).toBe("627bb2c0c3d57053e72a2cb1cd45c3f5");
  });

  it("sorts params alphabetically regardless of insertion order", () => {
    const a = buildApiSig({ b: "2", a: "1", c: "3" }, "sec");
    const b = buildApiSig({ c: "3", a: "1", b: "2" }, "sec");
    expect(a).toBe(b);
  });

  it("changes when the secret changes", () => {
    const params = { method: "auth.getToken", api_key: "k" };
    expect(buildApiSig(params, "one")).not.toBe(buildApiSig(params, "two"));
  });
});

describe("isRealMbid", () => {
  it("accepts UUID-shaped MBIDs", () => {
    expect(isRealMbid("b4c6a5f0-1234-4abc-9def-0123456789ab")).toBe(true);
    expect(isRealMbid("B4C6A5F0-1234-4ABC-9DEF-0123456789AB")).toBe(true);
  });

  it("rejects lidarr:/local: pseudo-ids and junk", () => {
    expect(isRealMbid("lidarr:12345")).toBe(false);
    expect(isRealMbid("local:abc-def")).toBe(false);
    expect(isRealMbid("b4c6a5f012344abc9def0123456789ab")).toBe(false);
    expect(isRealMbid("")).toBe(false);
    expect(isRealMbid(null)).toBe(false);
    expect(isRealMbid(undefined)).toBe(false);
  });
});

describe("listenbrainz buildSubmitPayload", () => {
  const REAL_MBID = "b4c6a5f0-1234-4abc-9def-0123456789ab";

  it("maps a full track into a single listen with all metadata", () => {
    const body = buildSubmitPayload(
      [
        {
          artistName: "Boards of Canada",
          title: "Dayvan Cowboy",
          albumTitle: "The Campfire Headphase",
          durationMs: 300_000,
          recordingMbid: REAL_MBID,
          listenedAt: 1_700_000_000,
        },
      ],
      "single",
    );

    expect(body.listen_type).toBe("single");
    expect(body.payload).toHaveLength(1);
    const item = body.payload[0]!;
    expect(item.listened_at).toBe(1_700_000_000);
    expect(item.track_metadata).toEqual({
      artist_name: "Boards of Canada",
      track_name: "Dayvan Cowboy",
      release_name: "The Campfire Headphase",
      additional_info: {
        media_player: "Audioseerr",
        duration_ms: 300_000,
        recording_mbid: REAL_MBID,
      },
    });
  });

  it("omits optional fields when absent", () => {
    const body = buildSubmitPayload(
      [{ artistName: "A", title: "T", listenedAt: 42 }],
      "single",
    );
    const meta = body.payload[0]!.track_metadata;
    expect(meta).toEqual({
      artist_name: "A",
      track_name: "T",
      additional_info: { media_player: "Audioseerr" },
    });
    expect("release_name" in meta).toBe(false);
    expect("duration_ms" in meta.additional_info).toBe(false);
    expect("recording_mbid" in meta.additional_info).toBe(false);
  });

  it("never sends lidarr:/local: pseudo-ids as recording_mbid", () => {
    for (const pseudo of ["lidarr:12345", "local:xyz"]) {
      const body = buildSubmitPayload(
        [
          {
            artistName: "A",
            title: "T",
            recordingMbid: pseudo,
            listenedAt: 1,
          },
        ],
        "single",
      );
      expect(
        body.payload[0]!.track_metadata.additional_info.recording_mbid,
      ).toBeUndefined();
    }
  });

  it("omits listened_at for playing_now listens", () => {
    const body = buildSubmitPayload(
      [{ artistName: "A", title: "T", listenedAt: 1_700_000_000 }],
      "playing_now",
    );
    expect(body.listen_type).toBe("playing_now");
    expect(body.payload[0]!.listened_at).toBeUndefined();
  });

  it("builds import payloads with one item per track", () => {
    const body = buildSubmitPayload(
      [
        { artistName: "A", title: "One", listenedAt: 100 },
        { artistName: "B", title: "Two", listenedAt: 200 },
      ],
      "import",
    );
    expect(body.listen_type).toBe("import");
    expect(body.payload.map((p) => p.track_metadata.track_name)).toEqual([
      "One",
      "Two",
    ]);
    expect(body.payload.map((p) => p.listened_at)).toEqual([100, 200]);
  });

  it("floors fractional listened_at values", () => {
    const body = buildSubmitPayload(
      [{ artistName: "A", title: "T", listenedAt: 100.9 }],
      "single",
    );
    expect(body.payload[0]!.listened_at).toBe(100);
  });
});
