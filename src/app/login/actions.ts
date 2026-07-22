"use server";

import { buildPlexAuthUrl, createPlexPin, getPlexAuthConfig } from "@/lib/plex";

export type PlexStartResult =
  | { ok: true; pinId: string; code: string; authUrl: string }
  | { ok: false; error: string };

/**
 * Kick off the Plex PIN flow: create a strong PIN at plex.tv and hand the
 * browser everything it needs to (a) open the Plex auth page and (b) poll
 * /api/auth/plex-callback until the user approves. The (pinId, code) pair is
 * later re-verified server-side by the "plex" credentials provider — nothing
 * returned here is trusted on its own.
 */
export async function startPlexLoginAction(): Promise<PlexStartResult> {
  const config = getPlexAuthConfig();
  if (!config) {
    return { ok: false, error: "Plex sign-in isn't enabled on this server." };
  }
  try {
    const pin = await createPlexPin(config.clientId);
    if (!pin) {
      return { ok: false, error: "Plex.tv didn't issue a sign-in PIN. Try again." };
    }
    return {
      ok: true,
      pinId: String(pin.id),
      code: pin.code,
      authUrl: buildPlexAuthUrl({ clientId: config.clientId, code: pin.code }),
    };
  } catch (err) {
    console.error("[plex] PIN creation failed:", err);
    return { ok: false, error: "Could not reach Plex.tv. Try again." };
  }
}
