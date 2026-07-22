// Last.fm scrobbling via the web-services API (https://www.last.fm/api).
//
// Auth uses Last.fm's web flow (mirrors the Spotify connect pattern):
//   1. auth.getToken  → one-time request token (signed call)
//   2. User is redirected to last.fm/api/auth to grant access
//   3. auth.getSession exchanges the token for a non-expiring session key
// Write calls (track.scrobble, track.updateNowPlaying) are signed POSTs with
// the session key as `sk`.
//
// This module is intentionally free of prisma/settings imports so the pure
// signature builder stays unit-testable in isolation.

import { createHash } from "node:crypto";
import { isRealMbid, type ScrobbleTrack } from "./types";

const API_ROOT = "https://ws.audioscrobbler.com/2.0/";
const AUTH_ROOT = "https://www.last.fm/api/auth/";

// api_sig = md5 of the alphabetically-sorted "name + value" pairs of every
// signed parameter, with the API secret appended, as a hex digest. The
// `format` and `callback` parameters are never part of the signature — the
// callers here simply never pass them in.
export function buildApiSig(
  params: Record<string, string>,
  secret: string,
): string {
  let raw = "";
  for (const key of Object.keys(params).sort()) {
    raw += key + params[key];
  }
  raw += secret;
  return createHash("md5").update(raw, "utf8").digest("hex");
}

export function buildAuthUrl(params: {
  apiKey: string;
  token: string;
  callbackUrl: string;
}): string {
  const url = new URL(AUTH_ROOT);
  url.searchParams.set("api_key", params.apiKey);
  url.searchParams.set("token", params.token);
  url.searchParams.set("cb", params.callbackUrl);
  return url.toString();
}

type LastFmErrorBody = { error?: number; message?: string };

async function parseResponse(res: Response, method: string): Promise<unknown> {
  const body = (await res.json().catch(() => null)) as LastFmErrorBody | null;
  // Last.fm reports API errors as { error, message } — frequently with an
  // HTTP 200/4xx mix, so check both.
  if (!res.ok || body?.error) {
    throw new Error(
      `Last.fm ${method} failed (${res.status}): ${body?.message ?? "unknown error"}`,
    );
  }
  return body;
}

// Signed GET for the read-only auth methods.
async function callGet(
  method: string,
  apiKey: string,
  secret: string,
  params: Record<string, string>,
): Promise<unknown> {
  const signed = { ...params, api_key: apiKey, method };
  const url = new URL(API_ROOT);
  for (const [k, v] of Object.entries(signed)) url.searchParams.set(k, v);
  url.searchParams.set("api_sig", buildApiSig(signed, secret));
  url.searchParams.set("format", "json");
  const res = await fetch(url);
  return parseResponse(res, method);
}

// Signed POST for the write methods (Last.fm requires POST for those).
async function callPost(
  method: string,
  apiKey: string,
  secret: string,
  params: Record<string, string>,
): Promise<unknown> {
  const signed = { ...params, api_key: apiKey, method };
  const body = new URLSearchParams({
    ...signed,
    api_sig: buildApiSig(signed, secret),
    format: "json",
  });
  const res = await fetch(API_ROOT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  return parseResponse(res, method);
}

// auth.getToken — the first step of the web auth flow. Returns the one-time
// request token the user then authorizes at last.fm/api/auth.
export async function getAuthToken(
  apiKey: string,
  secret: string,
): Promise<string> {
  const body = (await callGet("auth.getToken", apiKey, secret, {})) as {
    token?: string;
  } | null;
  if (!body?.token) throw new Error("Last.fm auth.getToken returned no token");
  return body.token;
}

export type LastFmSession = { name: string; key: string };

// auth.getSession — exchanges an authorized request token for a session key.
// Session keys don't expire (until the user revokes access on Last.fm).
export async function getSession(
  apiKey: string,
  secret: string,
  token: string,
): Promise<LastFmSession> {
  const body = (await callGet("auth.getSession", apiKey, secret, { token })) as {
    session?: { name?: string; key?: string };
  } | null;
  if (!body?.session?.key || !body.session.name) {
    throw new Error("Last.fm auth.getSession returned no session");
  }
  return { name: body.session.name, key: body.session.key };
}

function trackParams(
  track: ScrobbleTrack,
  sessionKey: string,
): Record<string, string> {
  const params: Record<string, string> = {
    artist: track.artistName,
    track: track.title,
    sk: sessionKey,
  };
  if (track.albumTitle) params.album = track.albumTitle;
  if (track.durationMs) params.duration = String(Math.round(track.durationMs / 1000));
  if (isRealMbid(track.recordingMbid)) params.mbid = track.recordingMbid;
  return params;
}

// track.scrobble — `startedAt` is unix seconds for when playback began.
export async function scrobble(
  apiKey: string,
  secret: string,
  sessionKey: string,
  track: ScrobbleTrack,
  startedAt: number,
): Promise<void> {
  await callPost("track.scrobble", apiKey, secret, {
    ...trackParams(track, sessionKey),
    timestamp: String(Math.floor(startedAt)),
  });
}

export async function updateNowPlaying(
  apiKey: string,
  secret: string,
  sessionKey: string,
  track: ScrobbleTrack,
): Promise<void> {
  await callPost(
    "track.updateNowPlaying",
    apiKey,
    secret,
    trackParams(track, sessionKey),
  );
}
