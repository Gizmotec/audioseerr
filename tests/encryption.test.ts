import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decrypt, encrypt } from "@/lib/encryption";

const SECRET = "test-secret-not-for-production";

function parts(payload: string): string[] {
  return payload.split(":");
}

describe("encryption", () => {
  beforeEach(() => {
    process.env.AUDIOSEERR_SECRET = SECRET;
  });

  afterEach(() => {
    delete process.env.AUDIOSEERR_SECRET;
  });

  describe("roundtrip", () => {
    it("decrypts what it encrypts", () => {
      const payload = encrypt("spotify-refresh-token-123");
      expect(decrypt(payload)).toBe("spotify-refresh-token-123");
    });

    it("roundtrips an empty string", () => {
      expect(decrypt(encrypt(""))).toBe("");
    });

    it("roundtrips unicode, emoji, and CJK text", () => {
      const text = "Beyoncé — 日本語テスト 🎵 ñoño";
      expect(decrypt(encrypt(text))).toBe(text);
    });

    it("roundtrips a long string", () => {
      const text = "x".repeat(10_000);
      expect(decrypt(encrypt(text))).toBe(text);
    });

    it("roundtrips text containing colons (format separator is safe)", () => {
      const text = "a:b:c::d";
      expect(decrypt(encrypt(text))).toBe(text);
    });
  });

  describe("payload format", () => {
    it("produces three base64url segments: iv:ciphertext:tag", () => {
      const payload = encrypt("hello");
      const ps = parts(payload);
      expect(ps).toHaveLength(3);
      for (const p of ps) {
        expect(p).toMatch(/^[A-Za-z0-9_-]+$/);
      }
    });

    it("uses a 12-byte IV", () => {
      const [iv] = parts(encrypt("hello"));
      expect(Buffer.from(iv, "base64url")).toHaveLength(12);
    });

    it("uses a random IV — same plaintext encrypts differently twice", () => {
      expect(encrypt("same input")).not.toBe(encrypt("same input"));
    });
  });

  describe("rejection", () => {
    it("rejects payloads without exactly 3 segments", () => {
      expect(() => decrypt("")).toThrow("Malformed ciphertext");
      expect(() => decrypt("only-one-part")).toThrow("Malformed ciphertext");
      expect(() => decrypt("two:parts")).toThrow("Malformed ciphertext");
      expect(() => decrypt("four:part:payload:here")).toThrow(
        "Malformed ciphertext",
      );
    });

    it("rejects segments that are not valid base64url content", () => {
      // Buffer.from is lenient and decodes this to empty buffers, which then
      // fail at GCM setup/auth rather than silently "decrypting".
      expect(() => decrypt("!!!:!!!:!!!")).toThrow();
    });

    it("rejects a tampered ciphertext byte (GCM auth failure)", () => {
      const ps = parts(encrypt("sensitive token value"));
      const ct = ps[1]!;
      ps[1] = (ct[0] === "A" ? "B" : "A") + ct.slice(1);
      expect(() => decrypt(ps.join(":"))).toThrow();
    });

    it("rejects a tampered auth tag", () => {
      const ps = parts(encrypt("sensitive token value"));
      const tag = ps[2]!;
      ps[2] = (tag[0] === "A" ? "B" : "A") + tag.slice(1);
      expect(() => decrypt(ps.join(":"))).toThrow();
    });

    it("rejects a tampered IV", () => {
      const ps = parts(encrypt("sensitive token value"));
      const iv = ps[0]!;
      ps[0] = (iv[0] === "A" ? "B" : "A") + iv.slice(1);
      expect(() => decrypt(ps.join(":"))).toThrow();
    });

    it("rejects a payload swapped between two different plaintexts", () => {
      const a = parts(encrypt("token A"));
      const b = parts(encrypt("token B which is longer"));
      // IV+tag from A, ciphertext from B — must not authenticate.
      expect(() => decrypt([a[0], b[1], a[2]].join(":"))).toThrow();
    });

    it("fails to decrypt with a different secret", () => {
      const payload = encrypt("hello");
      process.env.AUDIOSEERR_SECRET = "a-different-secret";
      expect(() => decrypt(payload)).toThrow();
    });

    it("throws a clear error when AUDIOSEERR_SECRET is unset", () => {
      delete process.env.AUDIOSEERR_SECRET;
      expect(() => encrypt("hello")).toThrow("AUDIOSEERR_SECRET is not set");
      expect(() => decrypt(encryptWithSecret("hello"))).toThrow(
        "AUDIOSEERR_SECRET is not set",
      );
    });
  });
});

function encryptWithSecret(plaintext: string): string {
  process.env.AUDIOSEERR_SECRET = SECRET;
  const payload = encrypt(plaintext);
  delete process.env.AUDIOSEERR_SECRET;
  return payload;
}
