import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import {
  buildAuthUrl,
  computeCodeChallenge,
  generateCodeVerifier,
} from "@/lib/spotify";

// 10 minutes is plenty for the user to complete the consent screen.
const STATE_COOKIE = "spotify_oauth_state";
const STATE_TTL_SECONDS = 600;

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { spotifyClientId: true },
  });
  if (!user?.spotifyClientId) {
    return NextResponse.redirect(
      new URL("/admin/settings?section=integrations&error=missing_client_id", req.url),
    );
  }

  const verifier = generateCodeVerifier();
  const challenge = computeCodeChallenge(verifier);
  const state = randomBytes(16).toString("base64url");
  const redirectUri = new URL("/api/spotify/callback", req.url).toString();

  // Bundle verifier + state + userId + redirectUri into a single encrypted
  // cookie. We re-derive redirectUri on callback from req.url anyway, but
  // pinning it here defends against the request hitting a different host.
  const payload = encrypt(
    JSON.stringify({ verifier, state, userId, redirectUri }),
  );
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, payload, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.url.startsWith("https://"),
    path: "/",
    maxAge: STATE_TTL_SECONDS,
  });

  const authUrl = buildAuthUrl({
    clientId: user.spotifyClientId,
    redirectUri,
    codeChallenge: challenge,
    state,
  });
  return NextResponse.redirect(authUrl);
}
