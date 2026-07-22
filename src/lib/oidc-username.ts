// Pure helpers for deriving a local username from an OIDC profile on first
// SSO sign-in. Kept free of Prisma/Next/Auth.js imports so the logic is
// unit-testable in isolation (tests/oidc-username.test.ts).

// Matches the setup wizard / invite validation (z.string().min(2).max(64)).
export const USERNAME_MIN_LENGTH = 2;
export const USERNAME_MAX_LENGTH = 64;

const FALLBACK_USERNAME = "user";

/**
 * Normalizes an arbitrary string into the username alphabet: lowercase ASCII,
 * digits, dots, underscores, dashes. Runs of anything else become a single
 * dash; leading/trailing separators are stripped. May return "" when the
 * input has no usable characters — callers handle the fallback.
 */
export function sanitizeUsername(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[._-]+/, "")
    .replace(/[._-]+$/, "");
}

/**
 * Picks the base username for an auto-provisioned SSO account: the IdP's
 * preferred_username claim when usable, otherwise the email local-part,
 * otherwise "user". The result is sanitized and capped at USERNAME_MAX_LENGTH;
 * uniqueness is handled separately by uniquifyUsername.
 */
export function deriveBaseUsername(input: {
  preferredUsername?: string | null;
  email?: string | null;
}): string {
  const localPart = input.email?.split("@")[0] ?? null;
  const candidates = [input.preferredUsername ?? null, localPart];

  for (const candidate of candidates) {
    if (!candidate) continue;
    // Cap first, then re-trim: the slice can expose a trailing separator.
    const cleaned = sanitizeUsername(candidate)
      .slice(0, USERNAME_MAX_LENGTH)
      .replace(/[._-]+$/, "");
    if (cleaned.length >= USERNAME_MIN_LENGTH) return cleaned;
  }
  return FALLBACK_USERNAME;
}

/**
 * Returns `base`, or the first free `base<N>` variant (N = 2, 3, …), keeping
 * every candidate within USERNAME_MAX_LENGTH. `taken` must contain the
 * existing usernames lowercased (derived candidates are already lowercase).
 */
export function uniquifyUsername(
  base: string,
  taken: ReadonlySet<string>,
): string {
  const withSuffix = (suffix: string): string => {
    const stem = base
      .slice(0, USERNAME_MAX_LENGTH - suffix.length)
      .replace(/[._-]+$/, "");
    return `${stem || FALLBACK_USERNAME}${suffix}`;
  };

  const first = withSuffix("");
  if (!taken.has(first)) return first;

  for (let n = 2; n < 100_000; n++) {
    const candidate = withSuffix(String(n));
    if (!taken.has(candidate)) return candidate;
  }
  // Practically unreachable — would need 100k colliding accounts.
  throw new Error("Could not derive a unique username");
}
