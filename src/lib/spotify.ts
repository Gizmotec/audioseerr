import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/encryption";

// Per-user Spotify OAuth via Authorization Code + PKCE. Each Audioseerr user
// registers their own Spotify app (no shared client; sidesteps Spotify's
// 25-user dev-mode cap). The Client ID is the only thing we ask for — PKCE
// removes the need for the Client Secret entirely.

export const SPOTIFY_SCOPES = [
  "playlist-read-private",
  "playlist-read-collaborative",
];

const TOKEN_ENDPOINT = "https://accounts.spotify.com/api/token";
const AUTH_ENDPOINT = "https://accounts.spotify.com/authorize";

// 60s safety buffer when checking token expiry — refresh just-before-expiry
// rather than waiting for a 401 from the API.
const REFRESH_LEEWAY_MS = 60_000;

export type SpotifyConnection = {
  clientId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
};

// PKCE: spec says verifier is 43-128 chars from [A-Z a-z 0-9 - . _ ~].
// 32 random bytes base64url-encoded gives 43 chars and ample entropy.
export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function computeCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function buildAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("state", params.state);
  url.searchParams.set("scope", SPOTIFY_SCOPES.join(" "));
  return url.toString();
}

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
};

export async function exchangeCodeForTokens(params: {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
    code_verifier: params.codeVerifier,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token exchange failed (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

async function refreshTokens(params: {
  clientId: string;
  refreshToken: string;
}): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
    client_id: params.clientId,
  });
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Spotify token refresh failed (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function storeSpotifyTokens(
  userId: string,
  tokens: TokenResponse,
  existingRefreshToken?: string,
): Promise<void> {
  // Spotify sometimes omits refresh_token on a refresh response — in that
  // case the previous refresh token stays valid, so keep it around.
  const refreshToken = tokens.refresh_token ?? existingRefreshToken;
  if (!refreshToken) {
    throw new Error("Spotify did not return a refresh token");
  }
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);
  await prisma.user.update({
    where: { id: userId },
    data: {
      spotifyAccessToken: encrypt(tokens.access_token),
      spotifyRefreshToken: encrypt(refreshToken),
      spotifyTokenExpiresAt: expiresAt,
    },
  });
}

export async function clearSpotifyTokens(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      spotifyAccessToken: null,
      spotifyRefreshToken: null,
      spotifyTokenExpiresAt: null,
    },
  });
}

export async function getSpotifyConnection(
  userId: string,
): Promise<SpotifyConnection | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      spotifyClientId: true,
      spotifyAccessToken: true,
      spotifyRefreshToken: true,
      spotifyTokenExpiresAt: true,
    },
  });
  if (
    !user?.spotifyClientId ||
    !user.spotifyAccessToken ||
    !user.spotifyRefreshToken ||
    !user.spotifyTokenExpiresAt
  ) {
    return null;
  }
  return {
    clientId: user.spotifyClientId,
    accessToken: decrypt(user.spotifyAccessToken),
    refreshToken: decrypt(user.spotifyRefreshToken),
    expiresAt: user.spotifyTokenExpiresAt,
  };
}

// Returns a valid access token, refreshing first if the stored one is within
// REFRESH_LEEWAY_MS of expiring. Throws if the user hasn't connected Spotify.
export async function getValidSpotifyToken(userId: string): Promise<string> {
  const conn = await getSpotifyConnection(userId);
  if (!conn) throw new Error("Spotify not connected");

  if (conn.expiresAt.getTime() - REFRESH_LEEWAY_MS > Date.now()) {
    return conn.accessToken;
  }

  const refreshed = await refreshTokens({
    clientId: conn.clientId,
    refreshToken: conn.refreshToken,
  });
  await storeSpotifyTokens(userId, refreshed, conn.refreshToken);
  return refreshed.access_token;
}
