// Scrobble orchestrator. Called from the play path (fire-and-forget) — every
// failure is caught and logged with console.warn so a scrobble outage can
// never break playback or play recording.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { getSettings } from "@/lib/settings";
import * as lastfm from "./lastfm";
import * as listenbrainz from "./listenbrainz";
import type { ScrobbleTrack } from "./types";

// Redirect helper shared by the Last.fm auth routes (route files can't
// export non-handler symbols, so it lives here).
export function accountRedirect(
  req: Request,
  params: Record<string, string>,
): NextResponse {
  const url = new URL("/account", req.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

export type ScrobbleInput = ScrobbleTrack & {
  albumMbid?: string | null;
  /** How far into the track the play was recorded — used to back-date the
   * scrobble to when playback actually started. */
  playedMs?: number;
};

type EnabledServices = {
  lastfm?: { apiKey: string; secret: string; sessionKey: string };
  listenbrainz?: { token: string };
};

// The app-level Last.fm API credentials (public key + secret), the secret
// already decrypted by getSettings().
export async function getLastFmAppCredentials(): Promise<{
  apiKey: string;
  secret: string;
} | null> {
  const settings = await getSettings();
  if (!settings.lastFmApiKey || !settings.lastFmApiSecret) return null;
  return { apiKey: settings.lastFmApiKey, secret: settings.lastFmApiSecret };
}

async function getEnabledServices(
  userId: string,
): Promise<EnabledServices | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      scrobbleLastfm: true,
      lastfmSessionKey: true,
      scrobbleListenbrainz: true,
      listenbrainzToken: true,
    },
  });
  if (!user) return null;

  const services: EnabledServices = {};
  if (user.scrobbleLastfm && user.lastfmSessionKey) {
    const creds = await getLastFmAppCredentials();
    if (creds) {
      services.lastfm = {
        ...creds,
        sessionKey: decrypt(user.lastfmSessionKey),
      };
    }
  }
  if (user.scrobbleListenbrainz && user.listenbrainzToken) {
    services.listenbrainz = { token: decrypt(user.listenbrainzToken) };
  }
  return services;
}

// PlayHistory records the album MBID but not its title; scrobble services
// want a release name. Resolve it against the library when we can.
async function resolveAlbumTitle(
  albumMbid: string | null | undefined,
): Promise<string | null> {
  if (!albumMbid) return null;
  const item = await prisma.libraryItem.findUnique({
    where: { mbid: albumMbid },
    select: { title: true },
  });
  return item?.title ?? null;
}

async function run(
  userId: string,
  input: ScrobbleInput,
  kind: "scrobble" | "nowPlaying",
): Promise<void> {
  try {
    const services = await getEnabledServices(userId);
    if (!services?.lastfm && !services?.listenbrainz) return;

    const track: ScrobbleTrack = {
      artistName: input.artistName,
      title: input.title,
      albumTitle: input.albumTitle ?? (await resolveAlbumTitle(input.albumMbid)),
      durationMs: input.durationMs ?? null,
      recordingMbid: input.recordingMbid ?? null,
    };
    // The play is recorded at the scrobble threshold (50% / 4min), so the
    // listen started `playedMs` ago.
    const startedAt = Math.floor((Date.now() - (input.playedMs ?? 0)) / 1000);

    const jobs: Promise<void>[] = [];
    if (services.lastfm) {
      const { apiKey, secret, sessionKey } = services.lastfm;
      const call =
        kind === "scrobble"
          ? lastfm.scrobble(apiKey, secret, sessionKey, track, startedAt)
          : lastfm.updateNowPlaying(apiKey, secret, sessionKey, track);
      jobs.push(
        call.catch((e) => console.warn("[scrobble] Last.fm failed:", e)),
      );
    }
    if (services.listenbrainz) {
      const { token } = services.listenbrainz;
      const call =
        kind === "scrobble"
          ? listenbrainz.submitListens(token, [track], startedAt)
          : listenbrainz.submitPlayingNow(token, track);
      jobs.push(
        call.catch((e) => console.warn("[scrobble] ListenBrainz failed:", e)),
      );
    }
    await Promise.all(jobs);
  } catch (e) {
    // Belt-and-braces: even config/DB failures must not reach the play path.
    console.warn(`[scrobble] ${kind} aborted:`, e);
  }
}

export async function scrobbleTrack(
  userId: string,
  input: ScrobbleInput,
): Promise<void> {
  return run(userId, input, "scrobble");
}

export async function nowPlaying(
  userId: string,
  input: ScrobbleInput,
): Promise<void> {
  return run(userId, input, "nowPlaying");
}
