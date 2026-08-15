import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAlbum } from "@/lib/musicbrainz";

// musicbrainz.ts pulls the prisma-backed cache and the rate limiter at module
// top; stub both so the suite stays hermetic (no db, no real 1s spacing).
vi.mock("@/lib/cache", () => ({
  withCache: <T>(_key: string, _ttl: number, fn: () => Promise<T>) => fn(),
}));
vi.mock("@/lib/rate-limit", () => ({
  makeRateLimiter: () => ({ wait: vi.fn().mockResolvedValue(undefined) }),
}));

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const RELEASE_GROUP = {
  id: "rg-1",
  title: "Test Album",
  "primary-type": "Album",
  "first-release-date": "2020-01-01",
  "artist-credit": [{ name: "Tester", artist: { id: "a-1", name: "Tester" } }],
  releases: [{ id: "rel-1", status: "Official", country: "US", "track-count": 1 }],
};

const RELEASE = {
  id: "rel-1",
  title: "Test Album",
  media: [
    {
      tracks: [
        { id: "t-1", position: 1, title: "One", length: 1000, recording: { id: "r-1" } },
      ],
    },
  ],
};

describe("getAlbum transient-failure handling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  // The bug this guards: MusicBrainz answers 503 when it thinks we're over the
  // rate limit, getAlbum turned that into null, and the album page called
  // notFound() — a 404 for an album that plainly exists, which then loaded fine
  // on a retry seconds later.
  it("retries a 503 instead of reporting the album as missing", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(jsonResponse(200, RELEASE_GROUP))
      .mockResolvedValueOnce(jsonResponse(200, RELEASE));

    const pending = getAlbum("rg-1");
    await vi.advanceTimersByTimeAsync(1000);
    const album = await pending;

    expect(album).not.toBeNull();
    expect(album?.title).toBe("Test Album");
    expect(album?.tracks).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("waits the Retry-After the server asks for", async () => {
    fetchMock
      .mockResolvedValueOnce(
        new Response(null, { status: 503, headers: { "Retry-After": "3" } }),
      )
      .mockResolvedValueOnce(jsonResponse(200, RELEASE_GROUP))
      .mockResolvedValueOnce(jsonResponse(200, RELEASE));

    const pending = getAlbum("rg-1");

    // Still waiting at the default 1s backoff — the header pushed it to 3s.
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(2000);
    expect(await pending).not.toBeNull();
  });

  it("retries a network failure", async () => {
    fetchMock
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(jsonResponse(200, RELEASE_GROUP))
      .mockResolvedValueOnce(jsonResponse(200, RELEASE));

    const pending = getAlbum("rg-1");
    await vi.advanceTimersByTimeAsync(1000);

    expect(await pending).not.toBeNull();
  });

  it("gives up after three tries and reports no album", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 503 }));

    const pending = getAlbum("rg-1");
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await pending).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  // A real 404 is an answer, not a hiccup: resolve it as a release id once,
  // then stop. Retrying it would just make genuinely-missing albums slow.
  it("does not retry a 404, but still tries the release-id fallback", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 404 }));

    const pending = getAlbum("not-a-real-id");
    await vi.advanceTimersByTimeAsync(10_000);

    expect(await pending).toBeNull();
    // One release-group attempt + one release-resolve attempt. No retries.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
