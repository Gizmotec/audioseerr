import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/encryption";
import { accountRedirect, getLastFmAppCredentials } from "@/lib/scrobble";
import { getSession } from "@/lib/scrobble/lastfm";

const STATE_COOKIE = "lastfm_auth_state";

type StatePayload = {
  token: string;
  userId: string;
  callbackUrl: string;
};

// Last.fm redirects here with ?token=<the authorized request token>. Verify
// it against the cookie from the connect step, exchange it for a session key
// via auth.getSession, and store the connection on the user.
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const token = new URL(req.url).searchParams.get("token");

  const cookieStore = await cookies();
  const stateCookie = cookieStore.get(STATE_COOKIE);
  cookieStore.delete(STATE_COOKIE);

  if (!token || !stateCookie) {
    return accountRedirect(req, { scrobbleError: "missing_state" });
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(decrypt(stateCookie.value)) as StatePayload;
  } catch {
    return accountRedirect(req, { scrobbleError: "invalid_state" });
  }

  if (payload.token !== token) {
    return accountRedirect(req, { scrobbleError: "state_mismatch" });
  }
  if (payload.userId !== session.user.id) {
    return accountRedirect(req, { scrobbleError: "user_mismatch" });
  }

  const creds = await getLastFmAppCredentials();
  if (!creds) {
    return accountRedirect(req, { scrobbleError: "lastfm_unconfigured" });
  }

  try {
    const lfSession = await getSession(creds.apiKey, creds.secret, token);
    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        lastfmUsername: lfSession.name,
        lastfmSessionKey: encrypt(lfSession.key),
        // Connecting is an explicit opt-in to scrobbling.
        scrobbleLastfm: true,
      },
    });
  } catch (e) {
    console.error("[lastfm-callback] auth.getSession failed", e);
    return accountRedirect(req, { scrobbleError: "session_failed" });
  }

  return accountRedirect(req, { scrobbleConnected: "lastfm" });
}
