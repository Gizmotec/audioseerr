import { describe, expect, it } from "vitest";
import {
  deriveBaseUsername,
  sanitizeUsername,
  uniquifyUsername,
  USERNAME_MAX_LENGTH,
} from "@/lib/oidc-username";

describe("sanitizeUsername", () => {
  it("passes through already-valid usernames", () => {
    expect(sanitizeUsername("alex")).toBe("alex");
    expect(sanitizeUsername("alex.f_2-x")).toBe("alex.f_2-x");
  });

  it("lowercases", () => {
    expect(sanitizeUsername("AlexF")).toBe("alexf");
  });

  it("replaces runs of invalid characters with a single dash", () => {
    expect(sanitizeUsername("alex f")).toBe("alex-f");
    expect(sanitizeUsername("alex   f!!")).toBe("alex-f");
    expect(sanitizeUsername("alex+f@gmail")).toBe("alex-f-gmail");
  });

  it("strips leading and trailing separators", () => {
    expect(sanitizeUsername("--alex--")).toBe("alex");
    expect(sanitizeUsername("..alex..")).toBe("alex");
    expect(sanitizeUsername("_alex_")).toBe("alex");
  });

  it("drops non-ASCII letters", () => {
    expect(sanitizeUsername("beyoncé")).toBe("beyonc");
    expect(sanitizeUsername("日本語")).toBe("");
  });

  it("returns an empty string when nothing usable remains", () => {
    expect(sanitizeUsername("!!!")).toBe("");
    expect(sanitizeUsername("")).toBe("");
  });
});

describe("deriveBaseUsername", () => {
  it("prefers preferred_username over the email local-part", () => {
    expect(
      deriveBaseUsername({
        preferredUsername: "AlexF",
        email: "alex@example.com",
      }),
    ).toBe("alexf");
  });

  it("falls back to the email local-part", () => {
    expect(
      deriveBaseUsername({ preferredUsername: null, email: "alex.f@example.com" }),
    ).toBe("alex.f");
  });

  it("handles an email without an @ by using the whole string", () => {
    expect(deriveBaseUsername({ email: "alex" })).toBe("alex");
  });

  it("skips a preferred_username that sanitizes to nothing", () => {
    expect(
      deriveBaseUsername({ preferredUsername: "!!!", email: "alex@example.com" }),
    ).toBe("alex");
  });

  it("skips candidates shorter than the minimum length", () => {
    expect(deriveBaseUsername({ preferredUsername: "a", email: "ab@example.com" })).toBe(
      "ab",
    );
  });

  it("falls back to 'user' when no claim is usable", () => {
    expect(deriveBaseUsername({})).toBe("user");
    expect(deriveBaseUsername({ preferredUsername: "!!", email: null })).toBe("user");
  });

  it("caps the result at the maximum length", () => {
    const long = "a".repeat(100);
    expect(deriveBaseUsername({ preferredUsername: long })).toHaveLength(
      USERNAME_MAX_LENGTH,
    );
  });

  it("re-trims a trailing separator exposed by the length cap", () => {
    const input = `${"a".repeat(USERNAME_MAX_LENGTH)}-bbb`;
    const derived = deriveBaseUsername({ preferredUsername: input });
    expect(derived).toHaveLength(USERNAME_MAX_LENGTH);
    expect(derived.endsWith("-")).toBe(false);
  });
});

describe("uniquifyUsername", () => {
  it("returns the base when it is free", () => {
    expect(uniquifyUsername("alex", new Set())).toBe("alex");
  });

  it("appends a numeric suffix on collision, starting at 2", () => {
    expect(uniquifyUsername("alex", new Set(["alex"]))).toBe("alex2");
    expect(uniquifyUsername("alex", new Set(["alex", "alex2"]))).toBe("alex3");
  });

  it("keeps suffixed candidates within the maximum length", () => {
    const base = "a".repeat(USERNAME_MAX_LENGTH);
    const candidate = uniquifyUsername(base, new Set([base]));
    expect(candidate).toBe(`${"a".repeat(USERNAME_MAX_LENGTH - 1)}2`);
    expect(candidate.length).toBeLessThanOrEqual(USERNAME_MAX_LENGTH);
  });

  it("keeps long suffixes within the maximum length", () => {
    const base = "a".repeat(USERNAME_MAX_LENGTH);
    const taken = new Set([base]);
    for (let n = 2; n <= 999; n++) {
      taken.add(`${"a".repeat(USERNAME_MAX_LENGTH - String(n).length)}${n}`);
    }
    const candidate = uniquifyUsername(base, taken);
    expect(candidate).toBe(`${"a".repeat(USERNAME_MAX_LENGTH - 4)}1000`);
    expect(candidate.length).toBeLessThanOrEqual(USERNAME_MAX_LENGTH);
  });

  it("falls back to 'user' variants when the stem trims away", () => {
    expect(uniquifyUsername("user", new Set(["user"]))).toBe("user2");
  });
});
