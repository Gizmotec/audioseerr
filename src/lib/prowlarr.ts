export type ProwlarrConfig = {
  url: string;
  apiKey: string;
};

export type ProwlarrRelease = {
  title: string;
  indexer?: string;
  protocol?: string;
  size?: number;
  seeders?: number;
  leechers?: number;
  magnetUrl?: string;
  downloadUrl?: string;
  guid?: string;
};

export type ProwlarrStatus = {
  version: string;
};

class ProwlarrError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function buildUrl(base: string, path: string): string {
  const trimmed = base.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${trimmed}${suffix}`;
}

async function prowlarrFetch<T>(
  config: ProwlarrConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(buildUrl(config.url, path), {
    ...init,
    headers: {
      "X-Api-Key": config.apiKey,
      Accept: "application/json",
      ...init.headers,
    },
  });

  if (!res.ok) {
    throw new ProwlarrError(res.status, `Prowlarr ${path} -> HTTP ${res.status}`);
  }

  return (await res.json()) as T;
}

export async function searchAudioReleases(
  config: ProwlarrConfig,
  query: string,
): Promise<ProwlarrRelease[]> {
  const params = new URLSearchParams({
    query,
    type: "search",
  });
  params.append("categories", "3000");
  const releases = await prowlarrFetch<ProwlarrRelease[]>(
    config,
    `/api/v1/search?${params}`,
  );
  return releases.filter((release) => {
    const protocol = release.protocol?.toLowerCase();
    const hasUrl = !!(
      release.magnetUrl ||
      release.downloadUrl ||
      /^magnet:/i.test(release.guid ?? "")
    );
    return hasUrl && (!protocol || protocol === "torrent");
  });
}

export async function testProwlarrConnection(
  config: ProwlarrConfig,
): Promise<ProwlarrStatus> {
  return prowlarrFetch<ProwlarrStatus>(config, "/api/v1/system/status");
}

export async function downloadReleaseFile(
  config: ProwlarrConfig,
  release: ProwlarrRelease,
): Promise<Blob | null> {
  const url = release.downloadUrl ?? release.guid;
  if (!url || /^magnet:/i.test(url)) return null;
  if (!release.downloadUrl && release.guid) return null;

  const res = await fetch(resolveUrl(config.url, url), {
    headers: {
      "X-Api-Key": config.apiKey,
      Accept: "application/x-bittorrent, application/octet-stream, */*",
    },
  });
  if (!res.ok) {
    throw new ProwlarrError(res.status, `Prowlarr release download -> HTTP ${res.status}`);
  }
  return await res.blob();
}

function resolveUrl(base: string, value: string): string {
  if (/^https?:\/\//i.test(value)) return value;
  return buildUrl(base, value);
}

export function pickBestTrackRelease(
  releases: ProwlarrRelease[],
  input: {
    artistName: string;
    trackTitle: string;
    albumTitle?: string | null;
    maxSizeMb: number;
  },
): ProwlarrRelease | null {
  const maxBytes = input.maxSizeMb * 1024 * 1024;
  const artistNeedles = tokenize(input.artistName);
  const trackNeedles = tokenize(input.trackTitle);
  const albumNeedles = tokenize(input.albumTitle ?? "");

  const scored = releases
    .filter((release) => !release.size || release.size <= maxBytes)
    .map((release) => {
      const title = release.title.toLowerCase();
      const artistHits = artistNeedles.filter((token) => title.includes(token)).length;
      const trackHits = trackNeedles.filter((token) => title.includes(token)).length;
      const albumHits = albumNeedles.filter((token) => title.includes(token)).length;
      const seeders = release.seeders ?? 0;
      const size = release.size ?? maxBytes;
      const compactSingleBonus = size < 80 * 1024 * 1024 ? 4 : 0;
      const magnetBonus = release.magnetUrl ? 2 : 0;
      const score =
        artistHits * 8 +
        trackHits * 12 -
        albumHits * 3 +
        compactSingleBonus +
        magnetBonus +
        Math.min(seeders, 50) / 10;
      return { release, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score);

  return scored[0]?.release ?? null;
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/['"]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3);
}

export { ProwlarrError };
