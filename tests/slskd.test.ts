import { describe, expect, it } from "vitest";
import {
  buildTrackSearchQueries,
  describeTrackSearchMiss,
  findTrackCandidatesWithFallback,
  rankTrackCandidates,
  type SlskdFileCandidate,
  TrackSearchPlanIncompleteError,
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
      { text: "Linkin Park Numb", requireArtistMatch: true },
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

  it("does not treat an artist name in the basename as directory identity", () => {
    const misleading: SlskdFileCandidate = {
      username: "peer",
      filename: "Music\\Various Artists\\Hits\\Rihanna - Umbrella.flac",
      size: 8_000_000,
      bitRate: 320,
      lengthSec: 275,
      extension: "mp3",
      hasFreeUploadSlot: true,
      uploadSpeed: 500_000,
      queueLength: 0,
    };

    expect(
      rankTrackCandidates([misleading], {
        artistName: "Rihanna",
        trackTitle: "Umbrella",
        requireArtistMatch: true,
      }),
    ).toEqual([]);
  });

  it("does not accept a fallback match based only on an artist stop word", () => {
    const misleading: SlskdFileCandidate = {
      username: "peer",
      filename: "Music\\The Power Station\\Power.flac",
      size: 25_000_000,
      bitRate: 1000,
      lengthSec: 220,
      extension: "flac",
      hasFreeUploadSlot: true,
      uploadSpeed: 500_000,
      queueLength: 0,
    };

    expect(
      rankTrackCandidates([misleading], {
        artistName: "The Weeknd",
        trackTitle: "Power",
        requireArtistMatch: true,
      }),
    ).toEqual([]);
  });

  it("validates short non-Latin artist and title metadata", () => {
    const shared = {
      size: 25_000_000,
      bitRate: 1000,
      lengthSec: 240,
      extension: "flac",
      hasFreeUploadSlot: true,
      uploadSpeed: 500_000,
      queueLength: 0,
    } satisfies Omit<SlskdFileCandidate, "username" | "filename">;
    const sibling: SlskdFileCandidate = {
      ...shared,
      username: "wrong",
      filename: "Music\\宇多田ヒカル\\Album\\花.flac",
    };
    const match: SlskdFileCandidate = {
      ...shared,
      username: "right",
      filename: "Music\\宇多田ヒカル\\Album\\光.flac",
    };

    expect(
      rankTrackCandidates([sibling, match], {
        artistName: "宇多田ヒカル",
        trackTitle: "光",
        requireArtistMatch: true,
      }),
    ).toEqual([match]);
  });

  it("preserves script-significant combining marks during matching", () => {
    const shared = {
      size: 20_000_000,
      bitRate: 1000,
      lengthSec: 210,
      extension: "flac",
      hasFreeUploadSlot: true,
      uploadSpeed: 500_000,
      queueLength: 0,
    } satisfies Omit<SlskdFileCandidate, "username" | "filename">;
    const wrong: SlskdFileCandidate = {
      ...shared,
      username: "wrong",
      filename: "Music\\かく\\Album\\歌.flac",
    };
    const match: SlskdFileCandidate = {
      ...shared,
      username: "right",
      filename: "Music\\がく\\Album\\歌.flac",
    };

    expect(
      rankTrackCandidates([wrong, match], {
        artistName: "がく",
        trackTitle: "歌",
        requireArtistMatch: true,
      }),
    ).toEqual([match]);
  });

  it("treats straight and curly apostrophes as equivalent", () => {
    const match: SlskdFileCandidate = {
      username: "peer",
      filename: "Music\\D’Angelo\\Album\\Don’t Think Twice.flac",
      size: 20_000_000,
      bitRate: 1000,
      lengthSec: 210,
      extension: "flac",
      hasFreeUploadSlot: true,
      uploadSpeed: 500_000,
      queueLength: 0,
    };

    expect(
      rankTrackCandidates([match], {
        artistName: "D'Angelo",
        trackTitle: "Don't Think Twice",
        requireArtistMatch: true,
      }),
    ).toEqual([match]);
  });

  it("validates short, stopword, stylized, and dotted artist identities", () => {
    for (const [artistName, correctDirectory, wrongDirectory] of [
      ["M", "M", "N"],
      ["The The", "The The", "The"],
      ["P!nk", "P!nk", "NK"],
      ["R.E.M.", "REM", "EM"],
      ["With Confidence", "With Confidence", "Confidence"],
      ["And One", "And One", "One"],
      ["FT Island", "FT Island", "Island"],
      ["Featuring X", "Featuring X", "X"],
      ["Earth, Wind & Fire", "Earth, Wind & Fire", "Earth & Wind"],
      ["Simon and Garfunkel", "Simon & Garfunkel", "Simon & Art Garfunkel"],
    ]) {
      const makeCandidate = (directory: string): SlskdFileCandidate => ({
        username: directory,
        filename: `Music\\${directory}\\Album\\Song.flac`,
        size: 20_000_000,
        bitRate: 1000,
        lengthSec: 240,
        extension: "flac",
        hasFreeUploadSlot: true,
        uploadSpeed: 500_000,
        queueLength: 0,
      });
      const correct = makeCandidate(correctDirectory);
      const wrong = makeCandidate(wrongDirectory);

      expect(
        rankTrackCandidates([wrong, correct], {
          artistName,
          trackTitle: "Song",
          durationSec: 240,
          requireArtistMatch: true,
        }),
      ).toEqual([correct]);
    }
  });

  it("accepts explicit artist collaborations but rejects incidental directory text", () => {
    const makeCandidate = (directory: string): SlskdFileCandidate => ({
      username: directory,
      filename: `Music\\${directory}\\Album\\Numb.flac`,
      size: 20_000_000,
      bitRate: 1000,
      lengthSec: 187,
      extension: "flac",
      hasFreeUploadSlot: true,
      uploadSpeed: 500_000,
      queueLength: 0,
    });
    const incidental = makeCandidate("The Best of Linkin Park Covers");
    const collaboration = makeCandidate("Jay-Z & Linkin Park");

    expect(
      rankTrackCandidates([incidental, collaboration], {
        artistName: "Linkin Park",
        trackTitle: "Numb",
        durationSec: 187,
        requireArtistMatch: true,
      }),
    ).toEqual([collaboration]);
  });

  it("does not assemble artist identity across incidental delimiters", () => {
    for (const [artistName, misleadingDirectory] of [
      ["P!nk", "P & NK"],
      ["The The", "The & The"],
      ["AB", "A & B"],
      ["And One", "And & One"],
      ["FT Island", "FT & Island"],
      ["Featuring X", "Featuring & X"],
      ["Rock and Roll", "Rock Roll"],
      ["Linkin Park", "An Evening with Linkin Park"],
      ["Linkin Park", "The Best, Linkin Park"],
    ]) {
      const misleading: SlskdFileCandidate = {
        username: "peer",
        filename: `Music\\${misleadingDirectory}\\Album\\Song.flac`,
        size: 20_000_000,
        bitRate: 1000,
        lengthSec: 240,
        extension: "flac",
        hasFreeUploadSlot: true,
        uploadSpeed: 500_000,
        queueLength: 0,
      };

      expect(
        rankTrackCandidates([misleading], {
          artistName,
          trackTitle: "Song",
          durationSec: 240,
          requireArtistMatch: true,
        }),
      ).toEqual([]);
    }
  });

  it("rejects an album sibling that shares only one generic title token", () => {
    const shared = {
      size: 25_000_000,
      bitRate: 1000,
      lengthSec: undefined,
      extension: "flac",
      hasFreeUploadSlot: true,
      uploadSpeed: 500_000,
      queueLength: 0,
    } satisfies Omit<SlskdFileCandidate, "username" | "filename">;
    const sibling: SlskdFileCandidate = {
      ...shared,
      username: "wrong",
      filename: "Music\\Rihanna\\Talk That Talk\\Drunk on Love.flac",
    };
    const match: SlskdFileCandidate = {
      ...shared,
      username: "right",
      filename: "Music\\Rihanna\\Talk That Talk\\We Found Love.flac",
    };

    expect(
      rankTrackCandidates([sibling, match], {
        artistName: "Rihanna",
        trackTitle: "We Found Love",
        requireArtistMatch: true,
      }),
    ).toEqual([match]);
  });

  it("rejects a strict title superset for a one-word request", () => {
    const sibling: SlskdFileCandidate = {
      username: "peer",
      filename: "Music\\Rihanna\\Album\\Love Story.flac",
      size: 20_000_000,
      bitRate: 1000,
      lengthSec: 240,
      extension: "flac",
      hasFreeUploadSlot: true,
      uploadSpeed: 500_000,
      queueLength: 0,
    };

    expect(
      rankTrackCandidates([sibling], {
        artistName: "Rihanna",
        trackTitle: "Love",
        durationSec: 240,
        requireArtistMatch: true,
      }),
    ).toEqual([]);
  });

  it("requires exact title token sequence and multiplicity", () => {
    for (const [requested, candidate] of [
      ["Love Me Again", "Love Me"],
      ["Love", "The Love"],
      ["Run", "Run Run"],
    ]) {
      const file: SlskdFileCandidate = {
        username: "peer",
        filename: `Music\\Rihanna\\Album\\${candidate}.flac`,
        size: 20_000_000,
        bitRate: 1000,
        lengthSec: 240,
        extension: "flac",
        hasFreeUploadSlot: true,
        uploadSpeed: 500_000,
        queueLength: 0,
      };

      expect(
        rankTrackCandidates([file], {
          artistName: "Rihanna",
          trackTitle: requested,
          durationSec: 240,
          requireArtistMatch: true,
        }),
      ).toEqual([]);
    }
  });

  it("does not strip undelimited artist words from candidate titles", () => {
    for (const candidate of ["Rihanna Love", "Love Rihanna"]) {
      const file: SlskdFileCandidate = {
        username: "peer",
        filename: `Music\\Rihanna\\Album\\${candidate}.flac`,
        size: 20_000_000,
        bitRate: 1000,
        lengthSec: 240,
        extension: "flac",
        hasFreeUploadSlot: true,
        uploadSpeed: 500_000,
        queueLength: 0,
      };

      expect(
        rankTrackCandidates([file], {
          artistName: "Rihanna",
          trackTitle: "Love",
          durationSec: 240,
          requireArtistMatch: true,
        }),
      ).toEqual([]);
    }
  });

  it("accepts structural metadata suffixes and literal one-character titles", () => {
    for (const [requested, candidate] of [
      ["Song", "Song (Deluxe Edition)"],
      ["Song", "Song feat. Guest"],
      ["S", "S"],
    ]) {
      const file: SlskdFileCandidate = {
        username: "peer",
        filename: `Music\\Rihanna\\Album\\${candidate}.flac`,
        size: 20_000_000,
        bitRate: 1000,
        lengthSec: 240,
        extension: "flac",
        hasFreeUploadSlot: true,
        uploadSpeed: 500_000,
        queueLength: 0,
      };

      expect(
        rankTrackCandidates([file], {
          artistName: "Rihanna",
          trackTitle: requested,
          durationSec: 240,
          requireArtistMatch: true,
        }),
      ).toEqual([file]);
    }
  });

  it("keeps requested artist-name tokens and ignores common version metadata", () => {
    const match: SlskdFileCandidate = {
      username: "peer",
      filename:
        "Music\\Beyoncé\\Album\\01 Beyoncé Interlude (Album Version).flac",
      size: 20_000_000,
      bitRate: 1000,
      lengthSec: 120,
      extension: "flac",
      hasFreeUploadSlot: true,
      uploadSpeed: 500_000,
      queueLength: 0,
    };

    expect(
      rankTrackCandidates([match], {
        artistName: "Beyoncé",
        trackTitle: "Beyoncé Interlude",
        durationSec: 120,
        requireArtistMatch: true,
      }),
    ).toEqual([match]);
  });

  it("recognizes numbered filenames with a dotted artist prefix", () => {
    const match: SlskdFileCandidate = {
      username: "peer",
      filename:
        "Music\\REM\\Album\\01 - R.E.M. - Losing My Religion (Remastered 2011).flac",
      size: 20_000_000,
      bitRate: 1000,
      lengthSec: 268,
      extension: "flac",
      hasFreeUploadSlot: true,
      uploadSpeed: 500_000,
      queueLength: 0,
    };

    expect(
      rankTrackCandidates([match], {
        artistName: "R.E.M.",
        trackTitle: "Losing My Religion",
        durationSec: 268,
        requireArtistMatch: true,
      }),
    ).toEqual([match]);
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
      responseCount: 0,
      budgetExhausted: false,
    });
  });

  it("rejects a wrong-artist result from the primary exact query", async () => {
    const shared = {
      size: 20_000_000,
      bitRate: 1000,
      lengthSec: 187,
      extension: "flac",
      hasFreeUploadSlot: true,
      uploadSpeed: 500_000,
      queueLength: 0,
    } satisfies Omit<SlskdFileCandidate, "username" | "filename">;
    const wrong: SlskdFileCandidate = {
      ...shared,
      username: "wrong",
      filename: "Music\\Jay-Z\\Collision Course\\Numb (feat. Linkin Park).flac",
    };
    const match: SlskdFileCandidate = {
      ...shared,
      username: "right",
      filename: "Music\\Linkin Park\\Meteora\\Numb.flac",
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
        if (query === "Linkin Park Numb") return [wrong];
        if (query === "Linkin Numb") return [match];
        return [];
      },
    );

    expect(tried).toEqual(["Linkin Park Numb", "Linkin Numb"]);
    expect(result.ranked).toEqual([match]);
  });

  it("shares a hard query-call budget across requests", async () => {
    const budget = { remaining: 3 };
    const tried: string[] = [];
    const search = async (query: string) => {
      tried.push(query);
      return [];
    };
    const input = {
      artistName: "Linkin Park",
      trackTitle: "Numb",
      albumTitle: "Meteora",
    };

    const first = await findTrackCandidatesWithFallback(input, search, budget);
    const second = await findTrackCandidatesWithFallback(input, search, budget);

    expect(tried).toHaveLength(3);
    expect(budget.remaining).toBe(0);
    expect(first.budgetExhausted).toBe(true);
    expect(second.queriesTried).toEqual([]);
    expect(second.budgetExhausted).toBe(true);
  });

  it("marks any failed query as an incomplete fallback plan", async () => {
    const budget = { remaining: 8 };

    await expect(
      findTrackCandidatesWithFallback(
        {
          artistName: "Linkin Park",
          trackTitle: "Numb",
        },
        async () => {
          throw new Error("slskd timed out");
        },
        budget,
      ),
    ).rejects.toBeInstanceOf(TrackSearchPlanIncompleteError);
    expect(budget.remaining).toBe(7);
  });

  it("marks malformed peer results as an incomplete fallback plan", async () => {
    const malformed = {
      username: "peer",
      filename: 123,
      size: 20_000_000,
      bitRate: 1000,
      lengthSec: 187,
      extension: "flac",
      hasFreeUploadSlot: true,
      uploadSpeed: 500_000,
      queueLength: 0,
    } as unknown as SlskdFileCandidate;

    await expect(
      findTrackCandidatesWithFallback(
        { artistName: "Linkin Park", trackTitle: "Numb" },
        async () => [malformed],
        { remaining: 8 },
      ),
    ).rejects.toBeInstanceOf(TrackSearchPlanIncompleteError);
  });

  it("reports peer responses separately from usable audio candidates", async () => {
    const result = await findTrackCandidatesWithFallback(
      {
        artistName: "Rihanna",
        trackTitle: "Umbrella",
      },
      async () => ({ candidates: [], responseCount: 2 }),
      { remaining: 1 },
    );

    expect(result.responseCount).toBe(2);
    expect(result.candidateCount).toBe(0);
  });
});

describe("describeTrackSearchMiss", () => {
  it("distinguishes peer responses with no usable audio from no responses", () => {
    expect(
      describeTrackSearchMiss({
        queriesTried: ["Rihanna Umbrella"],
        candidateCount: 0,
        responseCount: 2,
      }),
    ).toContain("2 peer responses but no unlocked playable audio files");
    expect(
      describeTrackSearchMiss({
        queriesTried: ["Rihanna Umbrella"],
        candidateCount: 0,
        responseCount: 0,
      }),
    ).toContain("No Soulseek responses");
  });
});
