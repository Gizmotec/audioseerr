import { beforeEach, describe, expect, it, vi } from "vitest";
import { withCache } from "@/lib/cache";

const findUnique = vi.fn();
const upsert = vi.fn();

vi.mock("@/lib/db", () => ({
  prisma: {
    apiCache: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      upsert: (...args: unknown[]) => upsert(...args),
      delete: vi.fn().mockResolvedValue(undefined),
    },
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("withCache", () => {
  beforeEach(() => {
    findUnique.mockReset().mockResolvedValue(null); // always a miss
    upsert.mockReset().mockResolvedValue(undefined);
  });

  // The bug this guards: every concurrent miss used to run `fn`. For
  // MusicBrainz that meant N requests through a 1-req/sec gate — the last
  // caller waited N seconds, and the burst is what earned us the 503s.
  it("runs fn once for concurrent callers of the same key", async () => {
    const gate = deferred<string>();
    const fn = vi.fn(() => gate.promise);

    const a = withCache("k", 60, fn);
    const b = withCache("k", 60, fn);
    const c = withCache("k", 60, fn);

    gate.resolve("value");

    expect(await Promise.all([a, b, c])).toEqual(["value", "value", "value"]);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does not hold a failed lookup against the next caller", async () => {
    const failing = vi.fn().mockRejectedValue(new Error("upstream down"));
    await expect(withCache("k", 60, failing)).rejects.toThrow("upstream down");

    const ok = vi.fn().mockResolvedValue("second try");
    expect(await withCache("k", 60, ok)).toBe("second try");
    expect(ok).toHaveBeenCalledTimes(1);
  });

  it("keeps separate keys separate", async () => {
    const fn = vi.fn(async (v: string) => v);
    const [a, b] = await Promise.all([
      withCache("one", 60, () => fn("a")),
      withCache("two", 60, () => fn("b")),
    ]);
    expect([a, b]).toEqual(["a", "b"]);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("stores a real value but not a null one", async () => {
    await withCache("hit", 60, async () => ({ ok: true }));
    expect(upsert).toHaveBeenCalledTimes(1);

    // getCached can't tell a stored null from an absent row, so writing one
    // would only cost a row that never gets read back as a hit.
    await withCache("miss", 60, async () => null);
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
