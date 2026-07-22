// API-key authentication for the public REST API (/api/v1/*). The session
// proxy (src/proxy.ts) only matches app pages, so /api/* routes are reachable
// without a login — every v1 handler (except /api/v1/status) must call
// getApiUser itself and 401 on null.
//
// Pure key primitives (generate/hash/prefix/format, header extraction) live in
// src/lib/apiKeys.ts so they're unit-testable without constructing PrismaClient.

import type { User } from "@prisma/client";
import {
  extractApiKeyFromHeaders,
  hashApiKey,
  isApiKeyFormat,
} from "@/lib/apiKeys";
import { prisma } from "@/lib/db";

/** Consistent `{ error }` body for v1 failures. */
export function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status });
}

const DEFAULT_TAKE = 20;
const MAX_TAKE = 100;

/** Shared `?take&skip` parsing for list endpoints. Defaults: take=20, skip=0. */
export function parsePagination(
  searchParams: URLSearchParams,
): { take: number; skip: number } | { error: string } {
  const takeRaw = searchParams.get("take");
  const skipRaw = searchParams.get("skip");
  const take = takeRaw === null ? DEFAULT_TAKE : Number(takeRaw);
  const skip = skipRaw === null ? 0 : Number(skipRaw);
  if (!Number.isInteger(take) || take < 1 || take > MAX_TAKE) {
    return { error: `take must be an integer between 1 and ${MAX_TAKE}.` };
  }
  if (!Number.isInteger(skip) || skip < 0) {
    return { error: "skip must be a non-negative integer." };
  }
  return { take, skip };
}

/**
 * Resolve the calling user from an API key, supplied either as
 * `Authorization: Bearer <key>` or `x-api-key: <key>`.
 *
 * Keys are looked up by their sha256 digest (the raw key is never stored).
 * On a hit, lastUsedAt is bumped fire-and-forget — never awaited, so a slow
 * write can't add latency to every API call. Returns null on any miss.
 */
export async function getApiUser(request: Request): Promise<User | null> {
  const rawKey = extractApiKeyFromHeaders(request.headers);
  if (!rawKey || !isApiKeyFormat(rawKey)) return null;

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(rawKey) },
    include: { user: true },
  });
  if (!apiKey) return null;

  void prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch((err) => {
      console.error("[apiAuth] lastUsedAt update failed:", err);
    });

  return apiKey.user;
}
