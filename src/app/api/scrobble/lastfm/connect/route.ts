import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { encrypt } from "@/lib/encryption";
import { accountRedirect, getLastFmAppCredentials } from "@/lib/scrobble";
import { buildAuthUrl, getAuthToken } from "@/lib/scrobble/lastfm";

// Kicks off the Last.fm web auth flow: fetch a request token, stash it in an
// encrypted cookie (it doubles as the CSRF state — Last.fm echoes it back to
// the callback), then send the user to last.fm to authorize. 10 minutes is
// plenty for the consent screen.
const STATE_COOKIE = "lastfm_auth_state";
const STATE_TTL_SECONDS = 600;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const creds = await getLastFmAppCredentials();
  if (!creds) {
    return accountRedirect(req, { scrobbleError: "lastfm_unconfigured" });
  }

  let token: string;
  try {
    token = await getAuthToken(creds.apiKey, creds.secret);
  } catch (e) {
    console.error("[lastfm-connect] auth.getToken failed", e);
    return accountRedirect(req, { scrobbleError: "token_failed" });
  }

  const callbackUrl = new URL("/api/scrobble/lastfm/callback", req.url).toString();
  const payload = encrypt(
    JSON.stringify({ token, userId: session.user.id, callbackUrl }),
  );
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, payload, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.url.startsWith("https://"),
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });

  return NextResponse.redirect(
    buildAuthUrl({ apiKey: creds.apiKey, token, callbackUrl }),
  );
}
