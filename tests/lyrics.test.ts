import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { activeLrcLineIndex, parseLrc } from "@/lib/lrc";
import { getLyrics, mapLrcLibResponse } from "@/lib/lyrics";
import { getCached, setCached } from "@/lib/cache";

// lyrics.ts pulls the prisma-backed cache and the rate limiter at module top;
// stub both so the suite stays hermetic (no db, no real sleeping).
vi.mock("@/lib/cache", () => ({
  getCached: vi.fn(),
  setCached: vi.fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  makeRateLimiter: () => ({ wait: vi.fn().mockResolvedValue(undefined) }),
}));

const getCachedMock = vi.mocked(getCached);
const setCachedMock = vi.mocked(setCached);
const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("parseLrc", () => {
  it("parses a standard [mm:ss.xx] line", () => {
    expect(parseLrc("[01:02.50] hello world")).toEqual([
      { timeMs: 62_500, text: "hello world" },
    ]);
  });

  it("expands multi-timestamp lines into one entry per timestamp", () => {
    expect(parseLrc("[00:10.00][00:20.00] repeated line")).toEqual([
      { timeMs: 10_000, text: "repeated line" },
      { timeMs: 20_000, text: "repeated line" },
    ]);
  });

  it("accepts timestamps without a fraction and with millisecond precision", () => {
    expect(parseLrc("[00:07] no fraction\n[00:01.234] millis")).toEqual([
      { timeMs: 1234, text: "millis" },
      { timeMs: 7000, text: "no fraction" },
    ]);
  });

  it("skips metadata tags and malformed lines", () => {
    const lrc = [
      "[ti:Song Title]",
      "[ar:Some Artist]",
      "[offset:+500]",
      "[xx:yy] not a timestamp",
      "no timestamp at all",
      "[12] missing seconds",
      "[00:75.00] seconds out of range",
      "[00:05.00] real line",
    ].join("\n");
    expect(parseLrc(lrc)).toEqual([{ timeMs: 5000, text: "real line" }]);
  });

  it("keeps instrumental-break lines with empty text", () => {
    expect(parseLrc("[01:23.45]\n[01:25.00]next")).toEqual([
      { timeMs: 83_450, text: "" },
      { timeMs: 85_000, text: "next" },
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(parseLrc("")).toEqual([]);
    expect(parseLrc("\n\n  \n")).toEqual([]);
  });

  it("sorts lines by time even when the file lists them out of order", () => {
    const lines = parseLrc("[00:30.00] later\n[00:05.00] sooner");
    expect(lines.map((l) => l.timeMs)).toEqual([5000, 30_000]);
  });
});

describe("activeLrcLineIndex", () => {
  const lines = parseLrc("[00:10.00] a\n[00:20.00] b\n[00:30.00] c");

  it("returns -1 before the first line", () => {
    expect(activeLrcLineIndex(lines, 9_999)).toBe(-1);
  });

  it("returns the last line at or before the position", () => {
    expect(activeLrcLineIndex(lines, 10_000)).toBe(0);
    expect(activeLrcLineIndex(lines, 25_000)).toBe(1);
    expect(activeLrcLineIndex(lines, 60_000)).toBe(2);
  });

  it("handles an empty line list", () => {
    expect(activeLrcLineIndex([], 1000)).toBe(-1);
  });
});

describe("mapLrcLibResponse", () => {
  it("maps a full payload", () => {
    expect(
      mapLrcLibResponse({
        instrumental: false,
        plainLyrics: "line one\nline two",
        syncedLyrics: "[00:01.00] line one",
      }),
    ).toEqual({
      syncedLyrics: "[00:01.00] line one",
      plainLyrics: "line one\nline two",
      instrumental: false,
    });
  });

  it("treats blank lyric fields as absent and defaults instrumental to false", () => {
    expect(
      mapLrcLibResponse({ plainLyrics: "   ", syncedLyrics: "" }),
    ).toEqual({ syncedLyrics: null, plainLyrics: null, instrumental: false });
  });

  it("maps an instrumental record", () => {
    expect(
      mapLrcLibResponse({ instrumental: true, plainLyrics: null }),
    ).toEqual({ syncedLyrics: null, plainLyrics: null, instrumental: true });
  });
});

describe("getLyrics", () => {
  beforeEach(() => {
    getCachedMock.mockReset().mockResolvedValue(null);
    setCachedMock.mockReset().mockResolvedValue(undefined);
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches LRClib with artist/title/album/duration and maps the hit", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        instrumental: false,
        plainLyrics: "plain",
        syncedLyrics: "[00:01.00] synced",
      }),
    );

    const result = await getLyrics({
      artist: "A Tribe Called Quest",
      title: "Can I Kick It?",
      album: "People's Instinctive Travels",
      durationS: 250.4,
    });

    expect(result).toEqual({
      syncedLyrics: "[00:01.00] synced",
      plainLyrics: "plain",
      instrumental: false,
    });
    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.origin + url.pathname).toBe("https://lrclib.net/api/get");
    expect(url.searchParams.get("artist_name")).toBe("A Tribe Called Quest");
    expect(url.searchParams.get("track_name")).toBe("Can I Kick It?");
    expect(url.searchParams.get("album_name")).toBe(
      "People's Instinctive Travels",
    );
    expect(url.searchParams.get("duration")).toBe("250");
    const headers = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((headers.headers as Record<string, string>)["User-Agent"]).toMatch(
      /^Audioseerr\//,
    );
    expect(setCachedMock).toHaveBeenCalledWith(
      expect.stringContaining("lrclib:v1:"),
      { found: true, data: result },
      expect.any(Number),
    );
  });

  it("omits optional params when album/duration are absent", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { instrumental: true, plainLyrics: null }),
    );

    await getLyrics({ artist: "Mogwai", title: "Mogwai Fear Satan" });

    const url = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(url.searchParams.has("album_name")).toBe(false);
    expect(url.searchParams.has("duration")).toBe(false);
  });

  it("returns null and caches the miss briefly on 404", async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, { statusCode: 404 }));

    const result = await getLyrics({ artist: "Nobody", title: "Nothing" });

    expect(result).toBeNull();
    expect(setCachedMock).toHaveBeenCalledWith(
      expect.stringContaining("lrclib:v1:"),
      { found: false },
      expect.any(Number),
    );
    const missTtl = setCachedMock.mock.calls[0]![2] as number;
    expect(missTtl).toBeLessThanOrEqual(24 * 60 * 60);
  });

  it("throws on 5xx so the UI can offer a retry", async () => {
    fetchMock.mockResolvedValue(jsonResponse(503, {}));
    await expect(
      getLyrics({ artist: "A", title: "B" }),
    ).rejects.toThrow(/HTTP 503/);
    expect(setCachedMock).not.toHaveBeenCalled();
  });

  it("throws on network failure", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    await expect(getLyrics({ artist: "A", title: "B" })).rejects.toThrow(
      /fetch failed/,
    );
  });

  it("serves cache hits without fetching (found and miss alike)", async () => {
    getCachedMock.mockResolvedValueOnce({
      found: true,
      data: { syncedLyrics: null, plainLyrics: "cached", instrumental: false },
    });
    await expect(getLyrics({ artist: "A", title: "B" })).resolves.toEqual({
      syncedLyrics: null,
      plainLyrics: "cached",
      instrumental: false,
    });

    getCachedMock.mockResolvedValueOnce({ found: false });
    await expect(getLyrics({ artist: "A", title: "B" })).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
