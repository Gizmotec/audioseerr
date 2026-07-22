import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRateLimiter } from "@/lib/rate-limit";

describe("makeRateLimiter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lets the first call through immediately", async () => {
    const limiter = makeRateLimiter(1);
    const t0 = Date.now();
    await limiter.wait();
    expect(Date.now()).toBe(t0);
  });

  it("spaces a back-to-back second call by the configured interval", async () => {
    const limiter = makeRateLimiter(2); // 500ms spacing
    await limiter.wait();
    const t0 = Date.now();

    let resolved = false;
    const p = limiter.wait().then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(499);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(resolved).toBe(true);
    expect(Date.now() - t0).toBe(500);
  });

  it("serializes concurrent waiters in arrival order, each spaced apart", async () => {
    const limiter = makeRateLimiter(2);
    await limiter.wait();
    const start = Date.now();

    const order: number[] = [];
    const times: number[] = [];
    const waiters = [0, 1, 2].map((i) =>
      limiter.wait().then(() => {
        order.push(i);
        times.push(Date.now() - start);
      }),
    );

    await vi.advanceTimersByTimeAsync(2000);
    await Promise.all(waiters);

    expect(order).toEqual([0, 1, 2]);
    expect(times).toEqual([500, 1000, 1500]);
  });

  it("does not wait when the interval already elapsed while idle", async () => {
    const limiter = makeRateLimiter(2);
    await limiter.wait();

    await vi.advanceTimersByTimeAsync(600); // idle longer than the 500ms interval
    const t = Date.now();
    await limiter.wait();
    expect(Date.now()).toBe(t);
  });

  it("does not bank idle credit — a burst after idling is still spaced", async () => {
    const limiter = makeRateLimiter(2);
    await limiter.wait();

    await vi.advanceTimersByTimeAsync(5000); // long idle
    const start = Date.now();

    // First call after idle goes immediately…
    await limiter.wait();
    expect(Date.now()).toBe(start);

    // …but the next one still waits a full 500ms (no debt carried).
    const p = limiter.wait();
    await vi.advanceTimersByTimeAsync(500);
    await p;
    expect(Date.now() - start).toBe(500);
  });

  it("supports sub-1-per-second rates", async () => {
    const limiter = makeRateLimiter(0.5); // one call per 2s
    await limiter.wait();
    const start = Date.now();

    const p = limiter.wait();
    await vi.advanceTimersByTimeAsync(1999);
    let resolved = false;
    void p.then(() => {
      resolved = true;
    });
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(Date.now() - start).toBe(2000);
  });

  it("keeps spacing across many sequential calls", async () => {
    const limiter = makeRateLimiter(10); // 100ms
    const start = Date.now();
    await limiter.wait(); // first call immediate
    for (let i = 0; i < 4; i += 1) {
      const p = limiter.wait();
      await vi.advanceTimersByTimeAsync(100);
      await p;
    }
    // First call immediate, then 4 spaced calls → 400ms total.
    expect(Date.now() - start).toBe(400);
  });
});
