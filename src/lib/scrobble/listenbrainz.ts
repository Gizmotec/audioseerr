// ListenBrainz scrobbling via the submit-listens API.
// Docs: https://listenbrainz.readthedocs.io/en/latest/users/api/core.html
//
// This module is intentionally free of prisma/settings imports so the pure
// builders stay unit-testable in isolation.

import { isRealMbid, type ScrobbleTrack } from "./types";

const API_BASE = "https://api.listenbrainz.org/1";

export type ListenBrainzValidation =
  | { valid: true; userName: string }
  | { valid: false };

// GET /1/validate-token — 200 + { valid: true, user_name } for good tokens.
// Throws on network failure so callers can distinguish "ListenBrainz is down"
// from "token is wrong".
export async function validateToken(
  token: string,
): Promise<ListenBrainzValidation> {
  const res = await fetch(`${API_BASE}/validate-token`, {
    headers: { Authorization: `Token ${token}` },
  });
  if (!res.ok) return { valid: false };
  const body = (await res.json().catch(() => null)) as {
    valid?: boolean;
    user_name?: string;
  } | null;
  if (body?.valid === true && body.user_name) {
    return { valid: true, userName: body.user_name };
  }
  return { valid: false };
}

export type ListenType = "single" | "import" | "playing_now";

export type ListenTrack = ScrobbleTrack & {
  /** Unix seconds when playback started. Required for scrobbles, forbidden
   * for playing_now. */
  listenedAt?: number;
};

export type ListenMetadata = {
  artist_name: string;
  track_name: string;
  release_name?: string;
  additional_info: {
    media_player: "Audioseerr";
    duration_ms?: number;
    recording_mbid?: string;
  };
};

export type ListenPayloadItem = {
  listened_at?: number;
  track_metadata: ListenMetadata;
};

export type SubmitListensBody = {
  listen_type: ListenType;
  payload: ListenPayloadItem[];
};

// Pure mapping from our track shape to the ListenBrainz submit-listens body.
// `listened_at` is only included for real scrobbles — the playing_now
// listen_type rejects it.
export function buildSubmitPayload(
  tracks: ListenTrack[],
  listenType: ListenType,
): SubmitListensBody {
  return {
    listen_type: listenType,
    payload: tracks.map((track) => {
      const metadata: ListenMetadata = {
        artist_name: track.artistName,
        track_name: track.title,
        ...(track.albumTitle ? { release_name: track.albumTitle } : {}),
        additional_info: {
          media_player: "Audioseerr",
          ...(track.durationMs ? { duration_ms: Math.round(track.durationMs) } : {}),
          ...(isRealMbid(track.recordingMbid)
            ? { recording_mbid: track.recordingMbid }
            : {}),
        },
      };
      const item: ListenPayloadItem = { track_metadata: metadata };
      if (listenType !== "playing_now" && track.listenedAt !== undefined) {
        item.listened_at = Math.floor(track.listenedAt);
      }
      return item;
    }),
  };
}

async function postSubmitListens(
  token: string,
  body: SubmitListensBody,
): Promise<void> {
  const res = await fetch(`${API_BASE}/submit-listens`, {
    method: "POST",
    headers: {
      Authorization: `Token ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ListenBrainz submit-listens failed (${res.status}): ${text}`);
  }
}

// Scrobble one or more finished plays. A single track goes as listen_type
// "single"; batches go as "import".
export async function submitListens(
  token: string,
  tracks: ScrobbleTrack[],
  listenedAt?: number,
): Promise<void> {
  const at = listenedAt ?? Math.floor(Date.now() / 1000);
  const items = tracks.map((t) => ({ ...t, listenedAt: at }));
  const listenType: ListenType = tracks.length === 1 ? "single" : "import";
  await postSubmitListens(token, buildSubmitPayload(items, listenType));
}

export async function submitPlayingNow(
  token: string,
  track: ScrobbleTrack,
): Promise<void> {
  await postSubmitListens(token, buildSubmitPayload([track], "playing_now"));
}

// --- Read API (history import) ------------------------------------------------

// GET /1/user/<name>/listens — a user's listen history, newest first. Auth
// token is sent so private profiles work too (public profiles would be
// readable without it). Deliberately uncached, mirroring the Last.fm import:
// imports are a live user action and caching would fight incremental re-runs.
//
// Window params are unix seconds and inclusive at both ends; callers page by
// moving max_ts below the oldest ts seen. `count` caps at 100 server-side
// (docs max; higher values are accepted today but undocumented).
export type ListenBrainzListen = {
  listened_at: number;
  track_metadata: {
    artist_name?: string;
    track_name?: string;
    release_name?: string;
    additional_info?: {
      recording_mbid?: string;
      /** Release-GROUP mbid (PlayHistory.albumMbid's convention) — present
       * when ListenBrainz's mapper matched the listen. */
      release_group_mbid?: string;
      duration_ms?: number;
      /** Both identify who submitted the listen — our own scrobbles carry
       * media_player "Audioseerr" (see ListenMetadata above), which lets the
       * importer skip re-importing what the app already recorded. */
      media_player?: string;
      submission_client?: string;
    };
  };
};

export type ListenBrainzListensPage = {
  listens: ListenBrainzListen[];
  latestListenTs: number | null;
};

type ListensResponse = {
  payload?: {
    count?: number;
    latest_listen_ts?: number;
    listens?: ListenBrainzListen[];
  };
};

export async function getListens(
  token: string,
  userName: string,
  opts?: { count?: number; minTs?: number; maxTs?: number },
): Promise<ListenBrainzListensPage> {
  const params = new URLSearchParams({ count: String(opts?.count ?? 100) });
  if (opts?.minTs !== undefined) params.set("min_ts", String(opts.minTs));
  if (opts?.maxTs !== undefined) params.set("max_ts", String(opts.maxTs));
  const res = await fetch(
    `${API_BASE}/user/${encodeURIComponent(userName)}/listens?${params.toString()}`,
    {
      headers: {
        Authorization: "Token " + token,
        "User-Agent": "Audioseerr/0.1.0 ( https://github.com/audioseerr )",
        Accept: "application/json",
      },
    },
  );
  if (!res.ok) {
    throw new Error(`ListenBrainz get-listens failed (${res.status})`);
  }
  const body = (await res.json()) as ListensResponse;
  return {
    listens: body.payload?.listens ?? [],
    latestListenTs: body.payload?.latest_listen_ts ?? null,
  };
}
