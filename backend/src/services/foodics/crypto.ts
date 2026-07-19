/**
 * Foodics token crypto (plan §A6) — AES-256-GCM envelope encryption for
 * FoodicsConnection.accessTokenEnc. Never persist plaintext tokens.
 *
 * Key: env FOODICS_TOKEN_KEY — MUST decode to exactly 32 bytes. Accepted
 * encodings: 64 hex chars, or base64 of 32 raw bytes. Anything else fails
 * loudly at first use (misconfigured crypto must never silently degrade —
 * unlike utils/portalCreds.ts, no pad/truncate leniency here).
 *
 * Wire format: "iv:tag:ciphertext", each part standalone base64
 * (base64's alphabet contains no ':', so the separator is unambiguous).
 */
import crypto from "crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // GCM-recommended nonce size
const KEY_BYTES = 32;

/** Thrown for FOODICS_TOKEN_KEY problems — message says exactly how to fix. */
export class FoodicsCryptoConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FoodicsCryptoConfigError";
  }
}

/**
 * Resolve + validate the 32-byte key from env FOODICS_TOKEN_KEY.
 * Exported for tests; read lazily (per call) so env changes in tests apply.
 */
export function getFoodicsTokenKey(): Buffer {
  const raw = process.env.FOODICS_TOKEN_KEY;
  if (!raw) {
    throw new FoodicsCryptoConfigError(
      "FOODICS_TOKEN_KEY is not set. Generate one with: openssl rand -hex 32",
    );
  }
  let key: Buffer | null = null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    key = Buffer.from(raw, "hex");
  } else if (/^[A-Za-z0-9+/]+={0,2}$/.test(raw)) {
    const decoded = Buffer.from(raw, "base64");
    if (decoded.length === KEY_BYTES) key = decoded;
  }
  if (!key || key.length !== KEY_BYTES) {
    throw new FoodicsCryptoConfigError(
      "FOODICS_TOKEN_KEY must be 32 bytes encoded as 64 hex chars or base64. " +
        "Generate one with: openssl rand -hex 32",
    );
  }
  return key;
}

/** Encrypt a UTF-8 string → "iv:tag:ciphertext" (each base64). */
export function encryptToken(plaintext: string): string {
  const key = getFoodicsTokenKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/** Decrypt "iv:tag:ciphertext" → UTF-8 string. Throws on tamper/format/key. */
export function decryptToken(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error(
      "Invalid encrypted token format — expected iv:tag:ciphertext (base64 parts)",
    );
  }
  const [ivB64, tagB64, ctB64] = parts;
  const key = getFoodicsTokenKey();
  const decipher = crypto.createDecipheriv(ALGO, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(), // throws on auth-tag mismatch (tampered/wrong key)
  ]);
  return plaintext.toString("utf8");
}
