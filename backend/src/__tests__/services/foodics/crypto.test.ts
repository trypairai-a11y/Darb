// Foodics token crypto — AES-256-GCM roundtrip + key validation (plan §A6).

import {
  FoodicsCryptoConfigError,
  decryptToken,
  encryptToken,
  getFoodicsTokenKey,
} from "../../../services/foodics/crypto";

const HEX_KEY = "a".repeat(64); // 32 bytes as hex
const B64_KEY = Buffer.alloc(32, 7).toString("base64");

describe("foodics crypto", () => {
  const originalKey = process.env.FOODICS_TOKEN_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.FOODICS_TOKEN_KEY;
    else process.env.FOODICS_TOKEN_KEY = originalKey;
  });

  test("roundtrip: encrypt → decrypt returns the plaintext (hex key)", () => {
    process.env.FOODICS_TOKEN_KEY = HEX_KEY;
    const secret = JSON.stringify({ accessToken: "tok_abc123", businessId: "biz-1" });
    const blob = encryptToken(secret);
    expect(blob.split(":")).toHaveLength(3); // iv:tag:ciphertext
    expect(blob).not.toContain("tok_abc123");
    expect(decryptToken(blob)).toBe(secret);
  });

  test("roundtrip works with a base64 key", () => {
    process.env.FOODICS_TOKEN_KEY = B64_KEY;
    expect(decryptToken(encryptToken("hello"))).toBe("hello");
  });

  test("same plaintext encrypts to different blobs (random IV)", () => {
    process.env.FOODICS_TOKEN_KEY = HEX_KEY;
    expect(encryptToken("x")).not.toBe(encryptToken("x"));
  });

  test("missing key throws a clear config error", () => {
    delete process.env.FOODICS_TOKEN_KEY;
    expect(() => getFoodicsTokenKey()).toThrow(FoodicsCryptoConfigError);
    expect(() => encryptToken("x")).toThrow(/FOODICS_TOKEN_KEY is not set/);
  });

  test("wrong-length key throws a clear config error", () => {
    process.env.FOODICS_TOKEN_KEY = "deadbeef"; // 4 bytes
    expect(() => encryptToken("x")).toThrow(/32 bytes/);
  });

  test("tampered ciphertext fails GCM auth", () => {
    process.env.FOODICS_TOKEN_KEY = HEX_KEY;
    const blob = encryptToken("sensitive");
    const [iv, tag, ct] = blob.split(":");
    const flipped = Buffer.from(ct, "base64");
    flipped[0] = flipped[0] ^ 0xff;
    expect(() => decryptToken(`${iv}:${tag}:${flipped.toString("base64")}`)).toThrow();
  });

  test("decrypting with a different key fails", () => {
    process.env.FOODICS_TOKEN_KEY = HEX_KEY;
    const blob = encryptToken("sensitive");
    process.env.FOODICS_TOKEN_KEY = "b".repeat(64);
    expect(() => decryptToken(blob)).toThrow();
  });

  test("malformed blob format throws", () => {
    process.env.FOODICS_TOKEN_KEY = HEX_KEY;
    expect(() => decryptToken("not-a-valid-blob")).toThrow(/iv:tag:ciphertext/);
  });
});
