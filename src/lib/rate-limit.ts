// Per-process serial gate. MusicBrainz wants 1 req/sec strictly; the simplest
// reliable enforcement is to chain promises so each call waits for the
// previous, then throttles to the configured spacing.
//
// Single Node process per container in v1, so this is enough. A Redis-backed
// limiter can replace it if Audioseerr ever runs multi-instance.

export function makeRateLimiter(perSecond: number) {
  const intervalMs = 1000 / perSecond;
  let chain: Promise<void> = Promise.resolve();
  let lastRun = 0;

  return {
    async wait(): Promise<void> {
      const next = chain.then(async () => {
        const since = Date.now() - lastRun;
        const wait = Math.max(0, intervalMs - since);
        if (wait > 0) await new Promise((r) => setTimeout(r, wait));
        lastRun = Date.now();
      });
      chain = next.catch(() => {});
      await next;
    },
  };
}
