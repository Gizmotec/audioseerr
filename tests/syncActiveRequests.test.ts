import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  searchTracksWithStats: vi.fn(),
  enqueueDownload: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    request: {
      findMany: mocks.findMany,
      update: mocks.update,
    },
  },
}));

vi.mock("@/lib/slskd", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/slskd")>();
  return {
    ...actual,
    searchTracksWithStats: mocks.searchTracksWithStats,
    enqueueDownload: mocks.enqueueDownload,
  };
});

import { runTrackSearches } from "@/lib/jobs/syncActiveRequests";

const pendingRequest = () => ({
  id: "request-1",
  artistName: "Linkin Park",
  title: "Numb",
  albumTitle: "Meteora",
  albumMbid: null,
  albumPosition: null,
  approvedAt: new Date(0),
  requestedAt: new Date(0),
  lastSearchedAt: null,
});

describe("runTrackSearches", () => {
  let now = Date.UTC(2026, 0, 1);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime((now += 60 * 60 * 1000));
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("does not stamp lastSearchedAt when a query aborts the fallback plan", async () => {
    mocks.findMany.mockResolvedValue([pendingRequest()]);
    mocks.searchTracksWithStats.mockRejectedValue(new Error("slskd timed out"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      runTrackSearches({ url: "http://slskd", apiKey: "test" }),
    ).resolves.toBe(0);
    await expect(
      runTrackSearches({ url: "http://slskd", apiKey: "test" }),
    ).resolves.toBe(0);

    expect(mocks.searchTracksWithStats).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(15 * 60 * 1000);
    await expect(
      runTrackSearches({ url: "http://slskd", apiKey: "test" }),
    ).resolves.toBe(0);

    expect(mocks.searchTracksWithStats).toHaveBeenCalledTimes(2);
    expect(mocks.update).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("does not stamp malformed peer results as a completed search", async () => {
    mocks.findMany.mockResolvedValue([pendingRequest()]);
    mocks.searchTracksWithStats.mockResolvedValue({
      candidates: [
        {
          username: "peer",
          filename: 123,
          size: 20_000_000,
          bitRate: 1000,
          lengthSec: 187,
          extension: "flac",
          hasFreeUploadSlot: true,
          uploadSpeed: 500_000,
          queueLength: 0,
        },
      ],
      responseCount: 1,
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      runTrackSearches({ url: "http://slskd", apiKey: "test" }),
    ).resolves.toBe(0);

    expect(mocks.searchTracksWithStats).toHaveBeenCalledTimes(1);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("does not stamp the request whose final budgeted query throws", async () => {
    mocks.findMany.mockResolvedValue([
      pendingRequest(),
      { ...pendingRequest(), id: "request-2" },
    ]);
    let queryCalls = 0;
    mocks.searchTracksWithStats.mockImplementation(async () => {
      queryCalls += 1;
      if (queryCalls === 8) throw new Error("final query timed out");
      return { candidates: [], responseCount: 0 };
    });
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      runTrackSearches({ url: "http://slskd", apiKey: "test" }),
    ).resolves.toBe(0);

    expect(mocks.searchTracksWithStats).toHaveBeenCalledTimes(8);
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.update.mock.calls[0]?.[0].where.id).toBe("request-1");
  });

  it("does not stamp a request whose fallback plan is budget-truncated", async () => {
    mocks.findMany.mockResolvedValue([
      {
        ...pendingRequest(),
        id: "request-1",
        artistName: "Rihanna",
        title: "Love",
        albumTitle: "Loud",
      },
      {
        ...pendingRequest(),
        id: "request-2",
        artistName: "Rihanna",
        title: "Umbrella",
        albumTitle: "Good Girl Gone Bad",
      },
      { ...pendingRequest(), id: "request-3" },
    ]);
    mocks.searchTracksWithStats.mockResolvedValue({
      candidates: [],
      responseCount: 0,
    });
    vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(
      runTrackSearches({ url: "http://slskd", apiKey: "test" }),
    ).resolves.toBe(0);

    expect(mocks.searchTracksWithStats).toHaveBeenCalledTimes(8);
    expect(mocks.update).toHaveBeenCalledTimes(2);
    expect(mocks.update.mock.calls.map((call) => call[0].where.id)).toEqual([
      "request-1",
      "request-2",
    ]);
  });

  it("logs all matches while persisting only the failover shortlist", async () => {
    mocks.findMany.mockResolvedValue([pendingRequest()]);
    const candidates = Array.from({ length: 10 }, (_, index) => ({
      username: `peer-${index}`,
      filename: `Music\\Linkin Park\\Meteora\\Numb.flac`,
      size: 20_000_000 + index,
      bitRate: 1000,
      lengthSec: 187,
      extension: "flac",
      hasFreeUploadSlot: true,
      uploadSpeed: 500_000,
      queueLength: 0,
    }));
    mocks.searchTracksWithStats.mockResolvedValue({
      candidates,
      responseCount: 10,
    });
    mocks.enqueueDownload.mockResolvedValue(undefined);
    mocks.update.mockResolvedValue(undefined);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await expect(
      runTrackSearches({ url: "http://slskd", apiKey: "test" }),
    ).resolves.toBe(1);

    expect(log.mock.calls.flat().join("\n")).toContain("matches=10 shortlist=8");
    const persistenceCall = mocks.update.mock.calls[0]?.[0];
    expect(JSON.parse(persistenceCall.data.slskdCandidatesJson)).toHaveLength(8);
  });
});
