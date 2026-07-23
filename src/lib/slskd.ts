// Soulseek (slskd) client — the single-song download source that replaces the
// Prowlarr+qBittorrent track sidecar. Soulseek shares individual files (not just
// album torrents), which is exactly what playlists need.
//
// API surface (slskd REST, base = {url}/api/v0, auth = X-API-Key header):
//   POST   /searches                     start an async search
//   GET    /searches/{id}                poll search state (isComplete)
//   GET    /searches/{id}/responses      peer responses (files)
//   DELETE /searches/{id}                clean up the search record
//   POST   /transfers/downloads/{user}   enqueue downloads ([{filename,size}])
//   GET    /transfers/downloads/{user}   poll a user's transfers
//   GET    /application                  connection/auth check
//
// Verified against slskd v0.x (bigoulours/slskd-python-api wraps the same paths).

export type SlskdConfig = {
  url: string;
  apiKey: string;
};

// A single downloadable file from one peer's search response, flattened with
// the response-level peer-quality signals we score on.
export type SlskdFileCandidate = {
  username: string;
  filename: string; // remote path, backslash-separated
  size: number;
  bitRate?: number;
  lengthSec?: number;
  extension?: string; // normalized, no dot (e.g. "flac")
  hasFreeUploadSlot: boolean;
  uploadSpeed: number;
  queueLength: number;
};

type SlskdSearchState = {
  id: string;
  isComplete?: boolean;
  state?: string;
  responseCount?: number;
  fileCount?: number;
};

type SlskdResponseFile = {
  filename: string;
  size: number;
  bitRate?: number;
  bitDepth?: number;
  length?: number;
  sampleRate?: number;
  extension?: string;
  code?: number;
  isLocked?: boolean;
};

type SlskdSearchResponse = {
  username: string;
  hasFreeUploadSlot?: boolean;
  uploadSpeed?: number;
  queueLength?: number;
  fileCount?: number;
  files?: SlskdResponseFile[];
};

export type SlskdTransfer = {
  id: string;
  filename: string;
  state: string;
  size?: number;
  bytesTransferred?: number;
  percentComplete?: number;
};

type SlskdDownloadDirectory = {
  directory?: string;
  files?: SlskdTransfer[];
};

type SlskdUserDownloads = {
  username?: string;
  directories?: SlskdDownloadDirectory[];
};

class SlskdError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

class TrackSearchPlanIncompleteError extends Error {
  constructor(
    public readonly searchCause: unknown,
    public readonly queriesTried: string[],
    public readonly budgetRemaining: number | undefined,
  ) {
    const detail = searchCause instanceof Error ? `: ${searchCause.message}` : "";
    super(`Soulseek fallback plan stopped after a failed query${detail}`);
    this.name = "TrackSearchPlanIncompleteError";
  }
}

const AUDIO_EXTENSIONS = new Set([
  "mp3",
  "flac",
  "m4a",
  "aac",
  "ogg",
  "oga",
  "opus",
  "wav",
  "wma",
  "alac",
  "aiff",
  "aif",
  "ape",
]);

function buildUrl(base: string, path: string): string {
  const trimmed = base.replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${trimmed}/api/v0${suffix}`;
}

// Hard ceiling on any single slskd HTTP call. Without it, a wedged slskd
// (accepts the connection, never responds) leaves the fetch unsettled forever
// — which once hung syncActiveRequests mid-run, pinning its `running` guard
// and silently stopping ALL searches/downloads until restart.
const REQUEST_TIMEOUT_MS = 15000;

async function slskdFetch<T>(
  config: SlskdConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const res = await fetch(buildUrl(config.url, path), {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: {
      "X-API-Key": config.apiKey,
      Accept: "application/json",
      ...init.headers,
    },
  });
  if (!res.ok) {
    // Keep slskd's own error text — it surfaces as the admin-visible failure
    // reason on the request (e.g. "peer offline", "invalid filename").
    const body = await res.text().catch(() => "");
    const detail = body.trim() ? `: ${body.trim().slice(0, 200)}` : "";
    throw new SlskdError(res.status, `slskd ${path} -> HTTP ${res.status}${detail}`);
  }
  // Some endpoints (DELETE, enqueue) return empty bodies.
  const text = await res.text();
  return (text ? JSON.parse(text) : null) as T;
}

export async function testSlskdConnection(
  config: SlskdConfig,
): Promise<{ ok: true }> {
  await slskdFetch(config, "/application");
  return { ok: true };
}

/**
 * Run a Soulseek search to completion (bounded) and return every audio file
 * across all peer responses, flattened with peer-quality signals. Cleans up the
 * search record afterwards so slskd's search history doesn't grow unbounded.
 */
export type SlskdTrackSearchResult = {
  candidates: SlskdFileCandidate[];
  responseCount: number;
};

export async function searchTracks(
  config: SlskdConfig,
  query: string,
  opts: { searchTimeoutMs?: number; maxWaitMs?: number } = {},
): Promise<SlskdFileCandidate[]> {
  return (await searchTracksWithStats(config, query, opts)).candidates;
}

export async function searchTracksWithStats(
  config: SlskdConfig,
  query: string,
  opts: { searchTimeoutMs?: number; maxWaitMs?: number } = {},
): Promise<SlskdTrackSearchResult> {
  const searchTimeoutMs = opts.searchTimeoutMs ?? 4000;
  // Bounded so an auto-approve add (which runs the search inline) stays snappy.
  const maxWaitMs = opts.maxWaitMs ?? 8000;

  console.log(`[slskd] search query=${JSON.stringify(query)}`);
  const started = await slskdFetch<SlskdSearchState>(config, "/searches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      searchText: query,
      searchTimeout: searchTimeoutMs,
      filterResponses: true,
    }),
  });
  const searchId = started?.id;
  if (!searchId) {
    throw new SlskdError(502, "slskd did not return a search id.");
  }

  try {
    const deadline = Date.now() + maxWaitMs;
    // Poll until slskd marks the search complete or we hit our own ceiling.
    // Date.now() is fine here (live server code, not a replayed workflow).
    for (;;) {
      const state = await slskdFetch<SlskdSearchState>(
        config,
        `/searches/${searchId}`,
      );
      if (state?.isComplete) break;
      if (Date.now() >= deadline) break;
      await sleep(750);
    }

    const responses = await slskdFetch<SlskdSearchResponse[]>(
      config,
      `/searches/${searchId}/responses`,
    );
    const candidates = flattenResponses(responses ?? []);
    console.log(
      `[slskd] search query=${JSON.stringify(query)} responses=${responses?.length ?? 0} audioFiles=${candidates.length}`,
    );
    return { candidates, responseCount: responses?.length ?? 0 };
  } finally {
    // Best-effort cleanup; never let it break the flow.
    await slskdFetch(config, `/searches/${searchId}`, { method: "DELETE" }).catch(
      () => {},
    );
  }
}

function flattenResponses(
  responses: SlskdSearchResponse[],
): SlskdFileCandidate[] {
  const out: SlskdFileCandidate[] = [];
  for (const resp of responses) {
    const username = resp.username;
    if (!username) continue;
    for (const file of resp.files ?? []) {
      if (file.isLocked) continue;
      const ext = normalizeExtension(file.extension, file.filename);
      if (!ext || !AUDIO_EXTENSIONS.has(ext)) continue;
      out.push({
        username,
        filename: file.filename,
        size: file.size ?? 0,
        bitRate: file.bitRate,
        lengthSec: file.length,
        extension: ext,
        hasFreeUploadSlot: resp.hasFreeUploadSlot ?? false,
        uploadSpeed: resp.uploadSpeed ?? 0,
        queueLength: resp.queueLength ?? 0,
      });
    }
  }
  return out;
}

export type PickTrackInput = {
  artistName: string;
  trackTitle: string;
  /** Expected duration from MusicBrainz; the strongest correctness signal. */
  durationSec?: number | null;
  /** Used by title/album-only searches to reject same-title files by other artists. */
  requireArtistMatch?: boolean;
};

export type TrackSearchQuery = {
  text: string;
  /** Broad fallbacks must prove the artist appears somewhere in the remote path. */
  requireArtistMatch: boolean;
};

export type TrackSearchInput = PickTrackInput & {
  albumTitle?: string | null;
};

/**
 * Build a small, ordered set of Soulseek queries. Some otherwise-common exact
 * artist/title combinations are suppressed by the network, while a distinctive
 * artist token, title, or album query can still return the same files. Broad
 * fallbacks are marked for strict artist validation during candidate ranking.
 */
export function buildTrackSearchQueries(
  input: TrackSearchInput,
): TrackSearchQuery[] {
  const queries: TrackSearchQuery[] = [];
  const seen = new Set<string>();
  const add = (text: string, requireArtistMatch: boolean) => {
    const cleaned = text.replace(/\s+/g, " ").trim();
    const key = cleaned.toLowerCase();
    if (!cleaned || seen.has(key)) return;
    seen.add(key);
    queries.push({ text: cleaned, requireArtistMatch });
  };

  // Search specificity does not make peer results trustworthy: slskd may return
  // a same-title collaboration or compilation track from another artist.
  add(`${input.artistName} ${input.trackTitle}`, true);

  const compactArtist = input.artistName
    .split(/\s+/)
    .map((part) => part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ""))
    .find(
      (part) =>
        part.length >= 3 && !new Set(["the", "and"]).has(part.toLowerCase()),
    );
  if (compactArtist) add(`${compactArtist} ${input.trackTitle}`, true);

  add(input.trackTitle, true);
  if (input.albumTitle) add(input.albumTitle, true);

  return queries.slice(0, 4);
}

export type TrackSearchOutcome = {
  ranked: SlskdFileCandidate[];
  queriesTried: string[];
  candidateCount: number;
  responseCount: number;
  budgetExhausted: boolean;
};

export type TrackSearchQueryBudget = {
  remaining: number;
};

export function describeTrackSearchMiss(
  outcome: Pick<
    TrackSearchOutcome,
    "candidateCount" | "queriesTried" | "responseCount"
  >,
): string {
  const searches = outcome.queriesTried.length;
  const searchLabel = searches === 1 ? "search variation" : "search variations";
  if (outcome.responseCount === 0) {
    return `No Soulseek responses to ${searches} ${searchLabel} yet — we'll keep checking.`;
  }
  if (outcome.candidateCount === 0) {
    const responseLabel = outcome.responseCount === 1 ? "response" : "responses";
    return `Soulseek returned ${outcome.responseCount} peer ${responseLabel} but no unlocked playable audio files across ${searches} ${searchLabel}.`;
  }
  const fileLabel = outcome.candidateCount === 1 ? "file" : "files";
  return `Found ${outcome.candidateCount} usable audio ${fileLabel} across ${searches} ${searchLabel}, but none matched the artist, title, and duration closely enough yet.`;
}

/** Run the query plan in order and stop at the first safely-ranked match set. */
export async function findTrackCandidatesWithFallback(
  input: TrackSearchInput,
  search: (
    query: string,
  ) => Promise<SlskdFileCandidate[] | SlskdTrackSearchResult>,
  budget?: TrackSearchQueryBudget,
): Promise<TrackSearchOutcome> {
  const queriesTried: string[] = [];
  let candidateCount = 0;
  let responseCount = 0;

  for (const query of buildTrackSearchQueries(input)) {
    if (budget && budget.remaining <= 0) {
      return {
        ranked: [],
        queriesTried,
        candidateCount,
        responseCount,
        budgetExhausted: true,
      };
    }
    if (budget) budget.remaining -= 1;
    queriesTried.push(query.text);
    try {
      const searchResult = await search(query.text);
      const candidates = Array.isArray(searchResult)
        ? searchResult
        : searchResult.candidates;
      responseCount += Array.isArray(searchResult) ? 0 : searchResult.responseCount;
      candidateCount += candidates.length;
      const ranked = rankTrackCandidates(candidates, {
        artistName: input.artistName,
        trackTitle: input.trackTitle,
        durationSec: input.durationSec,
        requireArtistMatch: query.requireArtistMatch,
      });
      if (ranked.length > 0) {
        return {
          ranked,
          queriesTried,
          candidateCount,
          responseCount,
          budgetExhausted: false,
        };
      }
    } catch (error) {
      throw new TrackSearchPlanIncompleteError(
        error,
        [...queriesTried],
        budget?.remaining,
      );
    }
  }

  return {
    ranked: [],
    queriesTried,
    candidateCount,
    responseCount,
    budgetExhausted: false,
  };
}

/**
 * Rank candidates best-first. Selection prioritises, in rough order:
 *   1. The file is plausibly the right recording (title tokens + duration).
 *   2. Quality (lossless > 320 > lower).
 *   3. Peer reliability (free slot, no queue, speed) so it actually downloads.
 * Candidates whose title tokens don't match at all, or whose duration is wildly
 * off (a remix/live/extended/mislabel), are dropped entirely.
 */
export function rankTrackCandidates(
  candidates: SlskdFileCandidate[],
  input: PickTrackInput,
): SlskdFileCandidate[] {
  const artistTokens = tokenizeArtist(input.artistName);
  const trackTokens = tokenizeTrackTitle(input.trackTitle);
  const wantsLive = /\blive\b/i.test(input.trackTitle);
  const wantsRemix = /\bremix\b/i.test(input.trackTitle);

  const scored = candidates
    .map((c) => ({ c, score: scoreCandidate(c, input, artistTokens, trackTokens, wantsLive, wantsRemix) }))
    .filter(({ score }) => score > -Infinity)
    .sort((a, b) => b.score - a.score);

  return scored.map(({ c }) => c);
}

export function pickBestTrackFile(
  candidates: SlskdFileCandidate[],
  input: PickTrackInput,
): SlskdFileCandidate | null {
  return rankTrackCandidates(candidates, input)[0] ?? null;
}

function scoreCandidate(
  c: SlskdFileCandidate,
  input: PickTrackInput,
  artistTokens: string[],
  trackTokens: string[],
  wantsLive: boolean,
  wantsRemix: boolean,
): number {
  const base = baseName(c.filename).toLowerCase();
  const candidateTitleTokens = tokenizeCandidateTitle(
    base,
    artistTokens,
    trackTokens,
  );
  const pathParts = c.filename.split(/[\\/]/);
  pathParts.pop();

  // Must match at least one track-title token, else it's almost certainly the
  // wrong file — drop it (a single album folder can return dozens of siblings).
  const baseTokens = new Set(candidateTitleTokens);
  const trackHits = trackTokens.filter((token) => baseTokens.has(token)).length;
  if (input.requireArtistMatch) {
    if (trackTokens.length === 0) return -Infinity;
    if (!tokenSequencesEqual(candidateTitleTokens, trackTokens)) return -Infinity;
  } else if (trackTokens.length > 0 && trackHits === 0) {
    return -Infinity;
  }

  // Broad title/album-only queries can return another artist's recording with
  // the same title. The remote directory normally carries the artist even when
  // the basename is just "01 Title.flac", so validate against directory tokens.
  const hasArtistDirectory = pathParts.some((part) =>
    directoryComponentMatchesArtist(part, input.artistName, artistTokens),
  );
  const artistHits = hasArtistDirectory ? artistTokens.length : 0;
  if (input.requireArtistMatch) {
    if (artistTokens.length === 0) return -Infinity;
    if (!hasArtistDirectory) return -Infinity;
  }

  // Duration is the strongest correctness signal. Reject files that are far off
  // the MusicBrainz length (remixes, live cuts, extended edits, mislabels).
  if (input.durationSec && c.lengthSec) {
    const diff = Math.abs(c.lengthSec - input.durationSec);
    if (diff > 30) return -Infinity;
  }

  let score = 0;
  score += trackHits * 10;
  score += artistHits * 5;

  // Duration bonus, finer-grained than the hard reject above.
  if (input.durationSec && c.lengthSec) {
    const diff = Math.abs(c.lengthSec - input.durationSec);
    if (diff <= 2) score += 25;
    else if (diff <= 5) score += 18;
    else if (diff <= 12) score += 8;
  }

  score += formatScore(c);

  // Penalise unwanted variants unless the request explicitly asked for them.
  if (!wantsLive && /\blive\b/.test(base)) score -= 20;
  if (!wantsRemix && /\bremix\b/.test(base)) score -= 12;
  if (/\b(instrumental|karaoke|acapella|a cappella)\b/.test(base)) score -= 25;

  // Peer reliability — a free slot means the download starts now instead of
  // queueing behind other users (or never).
  if (c.hasFreeUploadSlot) score += 12;
  score -= Math.min(c.queueLength, 20);
  score += Math.min(c.uploadSpeed / 50000, 6); // ~6 pts at 300+ KB/s

  return score;
}

function formatScore(c: SlskdFileCandidate): number {
  const ext = c.extension ?? "";
  if (ext === "flac" || ext === "alac" || ext === "wav" || ext === "aiff" || ext === "aif" || ext === "ape") {
    return 40;
  }
  const bitRate = c.bitRate ?? 0;
  if (ext === "mp3") {
    if (bitRate >= 320) return 30;
    if (bitRate >= 256) return 22; // includes V0 (~245-256)
    if (bitRate >= 192) return 14;
    return 6;
  }
  // m4a/aac/ogg/opus — generally fine; lean on bitrate when present.
  if (bitRate >= 256) return 24;
  if (bitRate >= 192) return 16;
  return 10;
}

export async function enqueueDownload(
  config: SlskdConfig,
  username: string,
  files: { filename: string; size: number }[],
): Promise<void> {
  await slskdFetch(config, `/transfers/downloads/${encodeURIComponent(username)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(files),
  });
}

/**
 * Find the transfer for a specific remote file under a user's downloads. slskd
 * nests transfers as user → directories[] → files[]; we flatten and match on
 * the exact remote filename (falling back to basename for robustness).
 */
export async function getDownloadTransfer(
  config: SlskdConfig,
  username: string,
  remoteFilename: string,
): Promise<SlskdTransfer | null> {
  const data = await slskdFetch<SlskdUserDownloads | SlskdUserDownloads[]>(
    config,
    `/transfers/downloads/${encodeURIComponent(username)}`,
  );
  const users = Array.isArray(data) ? data : data ? [data] : [];
  const transfers: SlskdTransfer[] = [];
  for (const user of users) {
    for (const dir of user.directories ?? []) {
      for (const file of dir.files ?? []) transfers.push(file);
    }
  }
  const exact = transfers.find((t) => t.filename === remoteFilename);
  if (exact) return exact;
  const target = baseName(remoteFilename);
  return transfers.find((t) => baseName(t.filename) === target) ?? null;
}

// --- Albums -----------------------------------------------------------------
// Soulseek shares whole album folders. We reconstruct candidate folders from
// the flat search results (each file's remote path), pick the one that best
// matches the album, download all its files, then map each downloaded file back
// to an album track position.

export type SlskdAlbumFolder = {
  username: string;
  folder: string; // remote folder path, no trailing separator
  files: SlskdFileCandidate[];
};

/** The remote directory containing a file (its path minus the last segment). */
export function folderOf(filename: string): string {
  const idx = Math.max(filename.lastIndexOf("\\"), filename.lastIndexOf("/"));
  return idx >= 0 ? filename.slice(0, idx) : "";
}

/**
 * The album-level folder: like folderOf, but collapses a trailing disc segment
 * (CD1, Disc 2, Disk03, …) up to its parent so multi-disc rips spread across
 * `Album/CD1` + `Album/CD2` group as one album, not two half-albums.
 */
export function albumFolderOf(filename: string): string {
  const dir = folderOf(filename);
  const idx = Math.max(dir.lastIndexOf("\\"), dir.lastIndexOf("/"));
  const leaf = (idx >= 0 ? dir.slice(idx + 1) : dir).trim();
  if (/^(cd|dis[ck])\s*\d{1,2}$/i.test(leaf)) {
    return idx >= 0 ? dir.slice(0, idx) : "";
  }
  return dir;
}

/** Group flat search candidates into (peer, album-folder) buckets. */
export function groupAlbumFolders(
  candidates: SlskdFileCandidate[],
): SlskdAlbumFolder[] {
  const map = new Map<string, SlskdAlbumFolder>();
  for (const c of candidates) {
    const folder = albumFolderOf(c.filename);
    const key = `${c.username} ${folder}`;
    let g = map.get(key);
    if (!g) {
      g = { username: c.username, folder, files: [] };
      map.set(key, g);
    }
    g.files.push(c);
  }
  return [...map.values()];
}

export type PickAlbumInput = {
  artistName: string;
  albumTitle: string;
  trackCount: number;
};

/**
 * Rank candidate folders best-first. A good album folder has ~the right number
 * of audio files, a path matching artist/album, decent format, and a reachable
 * peer. Folders with far too few files (clearly not the album) are dropped.
 */
export function rankAlbumFolders(
  folders: SlskdAlbumFolder[],
  input: PickAlbumInput,
): SlskdAlbumFolder[] {
  const artistTokens = tokenize(input.artistName);
  const albumTokens = tokenize(input.albumTitle);
  const minFiles = Math.max(2, Math.ceil(input.trackCount / 2));

  const scored = folders
    .filter((f) => f.files.length >= minFiles)
    .map((f) => ({ f, score: scoreFolder(f, input, artistTokens, albumTokens) }))
    .sort((a, b) => b.score - a.score);

  return scored.map(({ f }) => f);
}

export function pickBestAlbumFolder(
  folders: SlskdAlbumFolder[],
  input: PickAlbumInput,
): SlskdAlbumFolder | null {
  return rankAlbumFolders(folders, input)[0] ?? null;
}

function scoreFolder(
  f: SlskdAlbumFolder,
  input: PickAlbumInput,
  artistTokens: string[],
  albumTokens: string[],
): number {
  let score = 0;

  // File-count closeness to the expected tracklist. Exact (or a few bonus
  // tracks) is best; missing tracks is penalised harder than extras.
  const diff = f.files.length - input.trackCount;
  if (diff === 0) score += 30;
  else if (diff > 0) score += Math.max(0, 30 - diff * 3); // bonus tracks ok-ish
  else score += Math.max(-30, diff * 6); // missing tracks: heavy penalty

  // Folder path should mention the artist and album.
  const path = f.folder.toLowerCase();
  score += artistTokens.filter((t) => path.includes(t)).length * 4;
  score += albumTokens.filter((t) => path.includes(t)).length * 4;

  // Average format quality across the folder.
  if (f.files.length > 0) {
    const avgFormat =
      f.files.reduce((s, c) => s + formatScore(c), 0) / f.files.length;
    score += avgFormat * 0.5;
  }

  // Peer reliability (response-level, identical across a peer's files).
  const peer = f.files[0];
  if (peer?.hasFreeUploadSlot) score += 12;
  if (peer) {
    score -= Math.min(peer.queueLength, 20);
    score += Math.min(peer.uploadSpeed / 50000, 6);
  }

  return score;
}

export type AlbumTrackInput = {
  absolutePosition: number;
  mediumNumber: number;
  position: number;
  title: string;
  recordingMbid: string | null;
  lengthMs: number | null;
};

export type AlbumFileMatch = {
  position: number; // absolute album position (1-indexed)
  recordingMbid: string | null;
  title: string;
  durationMs: number | null;
  filename: string;
};

type MatchFile = { filename: string; lengthSec?: number | null };

/**
 * Parse a filename's disc/track index. "1-01 x" → {disc:1,track:1}; "05 x" →
 * {disc:null,track:5}; "x" → null. The disc-track form is what lets multi-disc
 * folders (where per-disc numbering restarts) map correctly.
 */
export function parseDiscTrack(
  name: string,
): { disc: number | null; track: number } | null {
  const base = name.replace(/\.[a-z0-9]+$/i, "");
  const dt = base.match(/^\s*(\d{1,2})\s*[-_.]\s*(\d{1,2})(?!\d)/);
  if (dt) {
    return { disc: Number.parseInt(dt[1]!, 10), track: Number.parseInt(dt[2]!, 10) };
  }
  const m = base.match(/^\s*(\d{1,3})(?!\d)/);
  if (m) return { disc: null, track: Number.parseInt(m[1]!, 10) };
  return null;
}

/**
 * Map a folder's audio files to album track positions.
 *   Pass 1 — filename disc/track number → the matching MusicBrainz track
 *     (by (disc,track) for multi-disc, else by absolute number for single-disc).
 *   Pass 2 — remaining tracks to the closest unused file by duration, tie-broken
 *     by shared title tokens so similar-length tracks aren't cross-assigned.
 * A file is only ever used once.
 */
export function matchAlbumFiles<F extends MatchFile>(
  files: F[],
  tracks: AlbumTrackInput[],
): AlbumFileMatch[] {
  const used = new Set<F>();
  const matchedPos = new Set<number>();
  const out: AlbumFileMatch[] = [];

  const byDiscPos = new Map<string, AlbumTrackInput>();
  const byAbs = new Map<number, AlbumTrackInput>();
  for (const t of tracks) {
    byDiscPos.set(`${t.mediumNumber}-${t.position}`, t);
    byAbs.set(t.absolutePosition, t);
  }

  const push = (t: AlbumTrackInput, f: F) => {
    used.add(f);
    matchedPos.add(t.absolutePosition);
    out.push({
      position: t.absolutePosition,
      recordingMbid: t.recordingMbid,
      title: t.title,
      durationMs: t.lengthMs,
      filename: f.filename,
    });
  };

  // Pass 1: by filename disc/track number.
  for (const f of files) {
    if (used.has(f)) continue;
    const dt = parseDiscTrack(baseName(f.filename));
    if (!dt) continue;
    let t: AlbumTrackInput | undefined;
    if (dt.disc != null) t = byDiscPos.get(`${dt.disc}-${dt.track}`);
    if (!t) t = byAbs.get(dt.track) ?? byDiscPos.get(`1-${dt.track}`);
    if (t && !matchedPos.has(t.absolutePosition)) push(t, f);
  }

  // Pass 2: by duration, preferring shared title tokens.
  const pairs: { t: AlbumTrackInput; f: F; diff: number; tokenHits: number }[] = [];
  for (const t of tracks) {
    if (matchedPos.has(t.absolutePosition) || !t.lengthMs) continue;
    const titleTokens = tokenize(t.title);
    for (const f of files) {
      if (used.has(f) || !f.lengthSec) continue;
      const diff = Math.abs(f.lengthSec - t.lengthMs / 1000);
      if (diff > 12) continue;
      const base = baseName(f.filename).toLowerCase();
      const tokenHits = titleTokens.filter((tok) => base.includes(tok)).length;
      pairs.push({ t, f, diff, tokenHits });
    }
  }
  pairs.sort((a, b) => b.tokenHits - a.tokenHits || a.diff - b.diff);
  for (const { t, f } of pairs) {
    if (matchedPos.has(t.absolutePosition) || used.has(f)) continue;
    push(t, f);
  }

  return out;
}

/** All download transfers for a user, flattened across directories. */
export async function listUserDownloads(
  config: SlskdConfig,
  username: string,
): Promise<SlskdTransfer[]> {
  const data = await slskdFetch<SlskdUserDownloads | SlskdUserDownloads[]>(
    config,
    `/transfers/downloads/${encodeURIComponent(username)}`,
  );
  const users = Array.isArray(data) ? data : data ? [data] : [];
  const transfers: SlskdTransfer[] = [];
  for (const user of users) {
    for (const dir of user.directories ?? []) {
      for (const file of dir.files ?? []) transfers.push(file);
    }
  }
  return transfers;
}

/** "Completed, Succeeded" → done; "Completed, Errored/Cancelled" → failed. */
export function classifyTransfer(state: string): "done" | "failed" | "active" {
  const s = state.toLowerCase();
  if (s.includes("completed")) {
    return s.includes("succeeded") ? "done" : "failed";
  }
  if (/errored|cancel|rejected|timedout/.test(s)) return "failed";
  return "active";
}

export function baseName(remoteFilename: string): string {
  const parts = remoteFilename.split(/[\\/]/);
  return parts[parts.length - 1] ?? remoteFilename;
}

function normalizeExtension(
  ext: string | undefined,
  filename: string,
): string | null {
  const raw = (ext && ext.trim()) || filename.split(".").pop() || "";
  const cleaned = raw.toLowerCase().replace(/^\./, "").trim();
  return cleaned.length > 0 && cleaned.length <= 5 ? cleaned : null;
}

function tokenize(value: string, minLength = 2): string[] {
  return value
    .normalize("NFKD")
    // Fold Latin accents for common metadata variants (Beyoncé/Beyonce) while
    // preserving marks that change letters in other scripts (for example,
    // Japanese dakuten: が must not collapse to か).
    .replace(/(?<=\p{Script=Latin})\p{M}+/gu, "")
    .toLowerCase()
    // Treat straight, curly, modifier, and full-width apostrophes alike.
    .replace(/['’‘ʼ＇"“”]/g, "")
    .split(/[^\p{L}\p{N}\p{M}]+/u)
    .filter((token) => token.length >= minLength);
}

function tokenizeArtist(value: string): string[] {
  // Collapse explicitly dotted initialisms such as R.E.M. before tokenization.
  // Do not merge arbitrary one-letter path tokens: "A & B" must not become AB.
  // Canonicalise ampersands to the literal word "and" so a real group name can
  // match both forms without discarding identity-bearing connector words.
  const canonical = value
    .replace(/&/gu, " and ")
    .replace(/(?:\p{L}\.){2,}(?:\p{L}\.?)?/gu, (initialism) =>
      initialism.replace(/[^\p{L}\p{N}]/gu, ""),
    );
  return tokenize(canonical, 1);
}

function splitExplicitArtistCredits(value: string): string[] | null {
  const parts = value.split(
    /\s*(?:&|\b(?:feat(?:uring)?|ft)\b\.?)\s*/iu,
  );
  if (parts.length <= 1 || parts.some((part) => part.trim().length === 0)) {
    return null;
  }
  return parts;
}

function directoryComponentMatchesArtist(
  value: string,
  artistName: string,
  artistTokens: string[],
): boolean {
  const componentTokens = tokenizeArtist(value);
  const componentCredits = splitExplicitArtistCredits(value);
  if (!componentCredits) {
    return tokenSequencesEqual(componentTokens, artistTokens);
  }

  // Whole-component equality is valid when the requested credit itself contains
  // a corresponding connector (for example Earth, Wind & Fire or Simon and
  // Garfunkel). Otherwise compare each explicit credit independently so P & NK
  // cannot impersonate P!nk and The & The cannot impersonate The The.
  const requestedIsCompoundCredit =
    splitExplicitArtistCredits(artistName) !== null ||
    /\S\s+and\s+\S/iu.test(artistName);
  if (
    requestedIsCompoundCredit &&
    tokenSequencesEqual(componentTokens, artistTokens)
  ) {
    return true;
  }

  return componentCredits.some((part) =>
    tokenSequencesEqual(tokenizeArtist(part), artistTokens),
  );
}

function tokenizeTrackTitle(value: string): string[] {
  return tokenize(stripTrailingMetadataSuffixes(value), 1);
}

const TRAILING_METADATA_TOKENS = new Set([
  "album",
  "anniversary",
  "audio",
  "bonus",
  "clean",
  "deluxe",
  "digital",
  "disc",
  "edit",
  "edition",
  "expanded",
  "explicit",
  "hd",
  "hq",
  "lyric",
  "lyrics",
  "mono",
  "official",
  "radio",
  "remaster",
  "remastered",
  "single",
  "stereo",
  "track",
  "video",
  "version",
]);
const FEATURE_MARKERS = new Set(["feat", "featuring", "ft"]);

function tokenizeCandidateTitle(
  value: string,
  artistTokens: string[],
  requestedTokens: string[],
): string[] {
  const withoutExtension = value.replace(/\.[\p{L}\p{N}]{1,5}$/u, "");
  let structured = stripTrailingMetadataSuffixes(withoutExtension).replace(
    /^\s*\d{1,3}(?:[.-]\d{1,3})?\s*(?:[-–—.)]\s*)+/u,
    "",
  );
  if (!tokenSequencesEqual(tokenize(structured, 1), requestedTokens)) {
    const prefixed = structured.match(/^(.+?)\s+[-–—]\s+(.+)$/u);
    if (
      prefixed &&
      tokenSequencesEqual(tokenizeArtist(prefixed[1] ?? ""), artistTokens)
    ) {
      structured = prefixed[2] ?? structured;
    } else {
      const suffixed = structured.match(/^(.+)\s+[-–—]\s+(.+?)$/u);
      if (
        suffixed &&
        tokenSequencesEqual(tokenizeArtist(suffixed[2] ?? ""), artistTokens)
      ) {
        structured = suffixed[1] ?? structured;
      }
    }
  }
  let tokens = tokenize(structured, 1);
  const requested = new Set(requestedTokens);
  const featureIndex = tokens.findIndex((token) => FEATURE_MARKERS.has(token));
  if (featureIndex >= 0 && !requested.has(tokens[featureIndex]!)) {
    tokens = tokens.slice(0, featureIndex);
  }

  while (
    tokens.length > requestedTokens.length &&
    /^\d{1,3}$/.test(tokens[0] ?? "") &&
    !requested.has(tokens[0]!)
  ) {
    tokens = tokens.slice(1);
  }

  return tokens;
}

function stripTrailingMetadataSuffixes(value: string): string {
  let current = value.trim();
  for (;;) {
    const bracketed = current.match(/^(.*)\s*[\[(]([^\])]+)[\])]\s*$/u);
    if (bracketed && isMetadataSuffix(bracketed[2] ?? "")) {
      current = (bracketed[1] ?? "").trim();
      continue;
    }
    const dashed = current.match(/^(.*)\s[-–—]\s([^\-–—]+)$/u);
    if (dashed && isMetadataSuffix(dashed[2] ?? "")) {
      current = (dashed[1] ?? "").trim();
      continue;
    }
    return current;
  }
}

function isMetadataSuffix(value: string): boolean {
  const tokens = tokenize(value, 1);
  return (
    tokens.length > 0 &&
    tokens.every(
      (token) =>
        TRAILING_METADATA_TOKENS.has(token) ||
        AUDIO_EXTENSIONS.has(token) ||
        /^\d{2,4}$/.test(token) ||
        /^\d{2,4}(?:kbps|khz|hz)$/.test(token),
    )
  );
}

function tokenSequencesEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((token, index) => token === b[index]);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { SlskdError, TrackSearchPlanIncompleteError };
