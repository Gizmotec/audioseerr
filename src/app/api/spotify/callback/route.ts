import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { exchangeCodeForTokens, storeSpotifyTokens } from "@/lib/spotify";

const STATE_COOKIE = "spotify_oauth_state";

type StatePayload = {
  verifier: string;
  state: string;
  userId: string;
  redirectUri: string;
};

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const cookieStore = await cookies();
  const stateCookie = cookieStore.get(STATE_COOKIE);
  cookieStore.delete(STATE_COOKIE);

  const accountUrl = (params: Record<string, string>) => {
    const u = new URL("/account", req.url);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u;
  };

  if (error) {
    return NextResponse.redirect(accountUrl({ error }));
  }
  if (!code || !state || !stateCookie) {
    return NextResponse.redirect(accountUrl({ error: "missing_state" }));
  }

  let payload: StatePayload;
  try {
    payload = JSON.parse(decrypt(stateCookie.value)) as StatePayload;
  } catch {
    return NextResponse.redirect(accountUrl({ error: "invalid_state" }));
  }

  if (payload.state !== state) {
    return NextResponse.redirect(accountUrl({ error: "state_mismatch" }));
  }
  if (payload.userId !== session.user.id) {
    return NextResponse.redirect(accountUrl({ error: "user_mismatch" }));
  }

  // Re-fetch the user's clientId rather than trusting the cookie.
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { spotifyClientId: true },
  });
  if (!user?.spotifyClientId) {
    return NextResponse.redirect(accountUrl({ error: "missing_client_id" }));
  }

  try {
    const tokens = await exchangeCodeForTokens({
      clientId: user.spotifyClientId,
      code,
      codeVerifier: payload.verifier,
      redirectUri: payload.redirectUri,
    });
    await storeSpotifyTokens(session.user.id, tokens);
  } catch (e) {
    console.error("[spotify-callback] token exchange failed", e);
    return NextResponse.redirect(accountUrl({ error: "exchange_failed" }));
  }

  return NextResponse.redirect(accountUrl({ connected: "1" }));
}
