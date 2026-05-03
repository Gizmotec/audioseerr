import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM around AUDIOSEERR_SECRET. Format is iv:ciphertext:tag, base64url.
// The secret is hashed into a 32-byte key so any string length works.

const ALGO = "aes-256-gcm";
const IV_LEN = 12;

function key(): Buffer {
  const secret = process.env.AUDIOSEERR_SECRET;
  if (!secret) throw new Error("AUDIOSEERR_SECRET is not set");
  return createHash("sha256").update(secret).digest();
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, ct, tag].map((b) => b.toString("base64url")).join(":");
}

export function decrypt(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) throw new Error("Malformed ciphertext");
  const [iv, ct, tag] = parts.map((p) => Buffer.from(p, "base64url"));
  const decipher = createDecipheriv(ALGO, key(), iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString("utf8");
}
