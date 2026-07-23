import { describe, expect, it } from "vitest";
import {
  buildTrackSearchQueries,
  findTrackCandidatesWithFallback,
  rankTrackCandidates,
  type SlskdFileCandidate,
} from "@/lib/slskd";

describe("buildTrackSearchQueries", () => {
  it("builds bounded exact, compact-artist, title, and album fallbacks", () => {
    expect(
      buildTrackSearchQueries({
        artistName: "Linkin Park",
        trackTitle: "Numb",
        albumTitle: "Meteora",
      }),
    ).toEqual([
      { text: "Linkin Park Numb", requireArtistMatch: false },
      { text: "Linkin Numb", requireArtistMatch: true },
      { text: "Numb", requireArtistMatch: true },
      { text: "Meteora", requireArtistMatch: true },
    ]);
  });
});

describe("rankTrackCandidates", () => {
  it("requires an artist match in the full path for broad fallback searches", () => {
    const shared = {
      size: 25_000_000,
      bitRate: 1000,
      lengthSec: 187,
      extension: "flac",
      hasFreeUploadSlot: true,
      uploadSpeed: 500_000,
      queueLength: 0,
    } satisfies Omit<SlskdFileCandidate, "username" | "filename">;
    const wrongArtist: SlskdFileCandidate = {
      ...shared,
      username: "wrong",
      filename: "Music\\Jay-Z\\Collision Course\\06 Numb.flac",
    };
    const rightArtist: SlskdFileCandidate = {
      ...shared,
      username: "right",
      filename: "Music\\Linkin Park\\Meteora\\13 Numb.flac",
    };

    expect(
      rankTrackCandidates([wrongArtist, rightArtist], {
        artistName: "Linkin Park",
        trackTitle: "Numb",
        durationSec: 187,
        requireArtistMatch: true,
      }),
    ).toEqual([rightArtist]);
  });
});

describe("findTrackCandidatesWithFallback", () => {
  it("tries broader queries until one yields a safely ranked match", async () => {
    const match: SlskdFileCandidate = {
      username: "peer",
      filename: "Music\\Linkin Park\\Meteora\\13 Numb.flac",
      size: 25_000_000,
      bitRate: 1000,
      lengthSec: 187,
      extension: "flac",
      hasFreeUploadSlot: true,
      uploadSpeed: 500_000,
      queueLength: 0,
    };
    const tried: string[] = [];

    const result = await findTrackCandidatesWithFallback(
      {
        artistName: "Linkin Park",
        trackTitle: "Numb",
        albumTitle: "Meteora",
        durationSec: 187,
      },
      async (query) => {
        tried.push(query);
        return query === "Linkin Numb" ? [match] : [];
      },
    );

    expect(tried).toEqual(["Linkin Park Numb", "Linkin Numb"]);
    expect(result).toEqual({
      ranked: [match],
      queriesTried: ["Linkin Park Numb", "Linkin Numb"],
      candidateCount: 1,
    });
  });
});
