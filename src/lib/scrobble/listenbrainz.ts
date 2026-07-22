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
