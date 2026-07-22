// API key primitives for the public REST API (/api/v1/*). PURE module — no
// prisma / next imports — so the format + hashing rules are unit-testable in
// isolation (tests/apiAuth.test.ts). Server-side lookup lives in
// src/lib/apiAuth.ts; management server actions in src/lib/actions/apiKeys.ts.
//
// Key format: "aks_" + 40 lowercase hex chars (20 random bytes). Only the
// sha256 hex digest is stored; the raw key is shown exactly once at creation.

import { createHash, randomBytes } from "node:crypto";

export const API_KEY_PREFIX = "aks_";
/** Full key shape: "aks_" + 40 lowercase hex chars. */
export const API_KEY_PATTERN = /^aks_[0-9a-f]{40}$/;
/** How much of the raw key is stored (and shown) as its display prefix. */
export const API_KEY_DISPLAY_PREFIX_LENGTH = 12;

export function generateApiKey(): string {
  return API_KEY_PREFIX + randomBytes(20).toString("hex");
}

export function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

/** Display prefix stored alongside the hash, e.g. "aks_a1b2c3d4" — enough to
 * tell keys apart in the management UI without leaking usable key material. */
export function apiKeyDisplayPrefix(rawKey: string): string {
  return rawKey.slice(0, API_KEY_DISPLAY_PREFIX_LENGTH);
}

export function isApiKeyFormat(rawKey: string): boolean {
  return API_KEY_PATTERN.test(rawKey);
}

/**
 * Pull the raw API key off a request's headers. Accepts either
 * `Authorization: Bearer <key>` or `x-api-key: <key>`; Authorization wins
 * when both are present. Returns null when no well-formed key is present.
 */
export function extractApiKeyFromHeaders(headers: Headers): string | null {
  const authorization = headers.get("authorization");
  if (authorization) {
    const match = authorization.match(/^Bearer\s+(\S+)\s*$/i);
    if (match?.[1]) return match[1];
  }
  const headerKey = headers.get("x-api-key")?.trim();
  return headerKey ? headerKey : null;
}
