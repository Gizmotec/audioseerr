// Lidarr API client. Covers connection test (used in setup), profile/folder
// lookups, and the artist-add flow used by request approval.

export type LidarrStatus = {
  version: string;
  appName?: string;
};

export type LidarrQualityProfile = {
  id: number;
  name: string;
};

export type LidarrRootFolder = {
  id: number;
  path: string;
  freeSpace?: number;
};

export type LidarrArtist = {
  id: number;
  foreignArtistId: string;
  artistName: string;
  monitored?: boolean;
};

export type LidarrAlbum = {
  id: number;
  artistId: number;
  foreignAlbumId: string;
  title: string;
  monitored?: boolean;
  /** Some Lidarr versions expose this; not always present. */
  hasFile?: boolean;
  statistics?: {
    trackFileCount?: number;
    totalTrackCount?: number;
    percentOfTracks?: number;
  };
};

export type LidarrQueueItem = {
  id: number;
  albumId?: number;
  artistId?: number;
  status?: string;
};

export type LidarrAlbumState = "downloaded" | "downloading" | "missing";

export type LidarrTrack = {
  id: number;
  albumId: number;
  trackFileId: number;
  trackNumber: string;
  absoluteTrackNumber?: number;
  title: string;
  hasFile: boolean;
  mediumNumber?: number;
};

export type LidarrTrackFile = {
  id: number;
  albumId: number;
  artistId: number;
  path: string;
  size: number;
  quality?: { quality?: { name?: string } };
  mediaInfo?: { audioBitrate?: number; audioChannels?: number };
};

/** Shape returned by `/artist/lookup`. We forward most of it back when adding. */
export type LidarrArtistLookup = Record<string, unknown> & {
  foreignArtistId: string;
  artistName?: string;
};

export type LidarrConfig = {
  url: string;
  apiKey: string;
};

class LidarrError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function buildUrl(base: string, path: string): string {
  const trimmed = base.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${trimmed}${suffix}`;
}

async function lidarrFetch<T>(
  config: LidarrConfig,
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
    throw new LidarrError(res.status, `Lidarr ${path} → HTTP ${res.status}`);
  }

  return (await res.json()) as T;
}

export async function testConnection(config: LidarrConfig): Promise<LidarrStatus> {
  return lidarrFetch<LidarrStatus>(config, "/api/v1/system/status");
}

export async function listQualityProfiles(
  config: LidarrConfig,
): Promise<LidarrQualityProfile[]> {
  return lidarrFetch<LidarrQualityProfile[]>(config, "/api/v1/qualityprofile");
}

export async function listRootFolders(
  config: LidarrConfig,
): Promise<LidarrRootFolder[]> {
  return lidarrFetch<LidarrRootFolder[]>(config, "/api/v1/rootfolder");
}

export async function findArtistByMbid(
  config: LidarrConfig,
  mbid: string,
): Promise<LidarrArtist | null> {
  const list = await lidarrFetch<LidarrArtist[]>(
    config,
    `/api/v1/artist?mbId=${encodeURIComponent(mbid)}`,
  );
  return Array.isArray(list) && list.length > 0 ? list[0]! : null;
}

export async function listArtists(config: LidarrConfig): Promise<LidarrArtist[]> {
  return lidarrFetch<LidarrArtist[]>(config, "/api/v1/artist");
}

export async function listAllAlbums(config: LidarrConfig): Promise<LidarrAlbum[]> {
  return lidarrFetch<LidarrAlbum[]>(config, "/api/v1/album");
}

export async function lookupArtist(
  config: LidarrConfig,
  query: string,
): Promise<LidarrArtistLookup[]> {
  return lidarrFetch<LidarrArtistLookup[]>(
    config,
    `/api/v1/artist/lookup?term=${encodeURIComponent(query)}`,
  );
}

/** Lidarr's add-options monitor enum. We only use a subset. */
export type LidarrMonitor =
  | "all"
  | "future"
  | "missing"
  | "existing"
  | "first"
  | "latest"
  | "pastYear"
  | "none";

type AddArtistOptions = {
  qualityProfileId: number;
  rootFolderPath: string;
  /** Hardcoded to 1 for now — Lidarr's "Standard" metadata profile. */
  metadataProfileId?: number;
  /** Defaults to "none" so album requests can monitor a single album below. */
  monitor?: LidarrMonitor;
  /** Defaults to false — same reason as `monitor`. */
  searchForMissingAlbums?: boolean;
};

export async function addArtist(
  config: LidarrConfig,
  artistMbid: string,
  artistName: string,
  options: AddArtistOptions,
): Promise<LidarrArtist> {
  const lookups = await lookupArtist(config, artistName);
  const stub = lookups.find((l) => l.foreignArtistId === artistMbid);
  if (!stub) {
    throw new Error(
      `Lidarr couldn't resolve artist MBID ${artistMbid} (looked up '${artistName}').`,
    );
  }

  // For album requests we leave monitor=none and explicitly monitor a single
  // album below. For artist requests we pass monitor="all" + searchForMissingAlbums
  // so Lidarr immediately fans out to the back catalog (design doc §8).
  const body = {
    ...stub,
    qualityProfileId: options.qualityProfileId,
    metadataProfileId: options.metadataProfileId ?? 1,
    rootFolderPath: options.rootFolderPath,
    monitored: true,
    addOptions: {
      monitor: options.monitor ?? "none",
      searchForMissingAlbums: options.searchForMissingAlbums ?? false,
    },
  };

  return lidarrFetch<LidarrArtist>(config, "/api/v1/artist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function findAlbumByForeignId(
  config: LidarrConfig,
  artistId: number,
  foreignAlbumId: string,
): Promise<LidarrAlbum | null> {
  const albums = await lidarrFetch<LidarrAlbum[]>(
    config,
    `/api/v1/album?artistId=${artistId}`,
  );
  return albums.find((a) => a.foreignAlbumId === foreignAlbumId) ?? null;
}

/**
 * After a fresh artist add, Lidarr refreshes metadata asynchronously and the
 * album rows take a few seconds to appear. This polls until the requested
 * album shows up or we hit `timeoutMs`.
 */
export async function pollForAlbum(
  config: LidarrConfig,
  artistId: number,
  foreignAlbumId: string,
  timeoutMs = 12000,
): Promise<LidarrAlbum | null> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = await findAlbumByForeignId(config, artistId, foreignAlbumId);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

export async function setAlbumsMonitored(
  config: LidarrConfig,
  albumIds: number[],
  monitored: boolean,
): Promise<void> {
  await lidarrFetch(config, "/api/v1/album/monitor", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ albumIds, monitored }),
  });
}

export async function triggerAlbumSearch(
  config: LidarrConfig,
  albumIds: number[],
): Promise<void> {
  await lidarrFetch(config, "/api/v1/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "AlbumSearch", albumIds }),
  });
}

export async function triggerArtistSearch(
  config: LidarrConfig,
  artistId: number,
): Promise<void> {
  await lidarrFetch(config, "/api/v1/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "ArtistSearch", artistId }),
  });
}

export async function getQueue(config: LidarrConfig): Promise<LidarrQueueItem[]> {
  type QueueResponse =
    | LidarrQueueItem[]
    | { records?: LidarrQueueItem[] };
  // Lidarr's queue endpoint paginates; pageSize is generous. Some installs
  // return a bare array, newer ones wrap it in `{ records, totalRecords }`.
  const res = await lidarrFetch<QueueResponse>(
    config,
    "/api/v1/queue?pageSize=200&includeUnknownArtistItems=true",
  );
  if (Array.isArray(res)) return res;
  return res.records ?? [];
}

export async function listTracksByAlbum(
  config: LidarrConfig,
  albumId: number,
): Promise<LidarrTrack[]> {
  return lidarrFetch<LidarrTrack[]>(config, `/api/v1/track?albumId=${albumId}`);
}

export async function listTrackFilesByAlbum(
  config: LidarrConfig,
  albumId: number,
): Promise<LidarrTrackFile[]> {
  return lidarrFetch<LidarrTrackFile[]>(
    config,
    `/api/v1/trackfile?albumId=${albumId}`,
  );
}

export async function getTrackFile(
  config: LidarrConfig,
  trackFileId: number,
): Promise<LidarrTrackFile> {
  return lidarrFetch<LidarrTrackFile>(
    config,
    `/api/v1/trackfile/${trackFileId}`,
  );
}

export function classifyAlbum(
  album: LidarrAlbum,
  queueAlbumIds: Set<number>,
): LidarrAlbumState {
  const stats = album.statistics;
  const total = stats?.totalTrackCount ?? 0;
  const have = stats?.trackFileCount ?? 0;
  if (total > 0 && have >= total) return "downloaded";
  if (album.hasFile === true && total === 0) return "downloaded";
  if (queueAlbumIds.has(album.id)) return "downloading";
  return "missing";
}

export { LidarrError };
