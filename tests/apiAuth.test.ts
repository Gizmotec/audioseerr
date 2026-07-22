import { describe, expect, it } from "vitest";
import {
  apiKeyDisplayPrefix,
  API_KEY_DISPLAY_PREFIX_LENGTH,
  extractApiKeyFromHeaders,
  generateApiKey,
  hashApiKey,
  isApiKeyFormat,
} from "@/lib/apiKeys";

// Tests cover the PURE parts of API-key auth (src/lib/apiKeys.ts). getApiUser
// itself (src/lib/apiAuth.ts) is a thin Prisma/HTTP wrapper over these and is
// exercised via the manual e2e instead — importing it here would construct
// PrismaClient against the dev database.

describe("generateApiKey", () => {
  it("produces keys in the aks_ + 40 lowercase hex format", () => {
    const key = generateApiKey();
    expect(key).toMatch(/^aks_[0-9a-f]{40}$/);
    expect(key).toHaveLength(44);
  });

  it("is unique across calls", () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateApiKey()));
    expect(keys.size).toBe(100);
  });
});

describe("hashApiKey", () => {
  it("is the sha256 hex digest of the raw key", () => {
    // Well-known sha256 vectors.
    expect(hashApiKey("hello")).toBe(
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
    expect(hashApiKey("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("produces 64 lowercase hex chars for a real key", () => {
    expect(hashApiKey(generateApiKey())).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    const key = generateApiKey();
    expect(hashApiKey(key)).toBe(hashApiKey(key));
  });
});

describe("apiKeyDisplayPrefix", () => {
  it("keeps the first 12 chars (aks_ + 8 hex)", () => {
    const key = "aks_" + "a".repeat(40);
    expect(apiKeyDisplayPrefix(key)).toBe("aks_aaaaaaaa");
    expect(apiKeyDisplayPrefix(key)).toHaveLength(API_KEY_DISPLAY_PREFIX_LENGTH);
  });

  it("never exposes enough of the key to authenticate", () => {
    const key = generateApiKey();
    const prefix = apiKeyDisplayPrefix(key);
    expect(key.startsWith(prefix)).toBe(true);
    expect(isApiKeyFormat(prefix)).toBe(false);
  });
});

describe("isApiKeyFormat", () => {
  it("accepts generated keys", () => {
    expect(isApiKeyFormat(generateApiKey())).toBe(true);
  });

  it("rejects malformed keys", () => {
    expect(isApiKeyFormat("")).toBe(false);
    expect(isApiKeyFormat("aks_")).toBe(false);
    expect(isApiKeyFormat("aks_" + "a".repeat(39))).toBe(false);
    expect(isApiKeyFormat("aks_" + "a".repeat(41))).toBe(false);
    // uppercase hex is not our format
    expect(isApiKeyFormat("aks_" + "A".repeat(40))).toBe(false);
    // wrong prefix
    expect(isApiKeyFormat("xyz_" + "a".repeat(40))).toBe(false);
    // non-hex chars
    expect(isApiKeyFormat("aks_" + "g".repeat(40))).toBe(false);
  });
});

describe("extractApiKeyFromHeaders", () => {
  const withHeaders = (headers: Record<string, string>) =>
    extractApiKeyFromHeaders(new Headers(headers));

  it("reads Authorization: Bearer <key>", () => {
    expect(withHeaders({ authorization: "Bearer aks_abc123" })).toBe("aks_abc123");
  });

  it("is case-insensitive on the Bearer scheme", () => {
    expect(withHeaders({ authorization: "bearer aks_abc123" })).toBe("aks_abc123");
    expect(withHeaders({ authorization: "BEARER aks_abc123" })).toBe("aks_abc123");
  });

  it("reads x-api-key", () => {
    expect(withHeaders({ "x-api-key": "aks_abc123" })).toBe("aks_abc123");
  });

  it("trims surrounding whitespace on x-api-key", () => {
    expect(withHeaders({ "x-api-key": "  aks_abc123  " })).toBe("aks_abc123");
  });

  it("prefers Authorization when both are present", () => {
    expect(
      withHeaders({ authorization: "Bearer aks_first", "x-api-key": "aks_second" }),
    ).toBe("aks_first");
  });

  it("falls back to x-api-key when Authorization isn't a Bearer token", () => {
    expect(
      withHeaders({ authorization: "Basic dXNlcjpwYXNz", "x-api-key": "aks_abc" }),
    ).toBe("aks_abc");
  });

  it("returns null when no key is present", () => {
    expect(extractApiKeyFromHeaders(new Headers())).toBeNull();
    expect(withHeaders({ authorization: "Basic dXNlcjpwYXNz" })).toBeNull();
    expect(withHeaders({ "x-api-key": "   " })).toBeNull();
  });
});
