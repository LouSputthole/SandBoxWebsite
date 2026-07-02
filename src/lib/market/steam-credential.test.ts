import { describe, it, expect } from "vitest";
import { encryptSecret, decryptSecret, generateCredentialKey } from "./steam-credential";

const key = Buffer.from(generateCredentialKey(), "base64");
const API_KEY = "A1B2C3D4E5F6A1B2C3D4E5F6A1B2C3D4"; // shape of a Steam Web API key

describe("steam-credential AES-256-GCM", () => {
  it("round-trips a secret", () => {
    const enc = encryptSecret(API_KEY, key);
    expect(enc.ciphertext).not.toContain(API_KEY);
    expect(decryptSecret(enc, key)).toBe(API_KEY);
  });

  it("produces a fresh iv each time (no nonce reuse)", () => {
    const a = encryptSecret(API_KEY, key);
    const b = encryptSecret(API_KEY, key);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("fails to decrypt with the wrong key", () => {
    const enc = encryptSecret(API_KEY, key);
    const wrong = Buffer.from(generateCredentialKey(), "base64");
    expect(() => decryptSecret(enc, wrong)).toThrow();
  });

  it("fails to decrypt a tampered ciphertext (GCM integrity)", () => {
    const enc = encryptSecret(API_KEY, key);
    const bytes = Buffer.from(enc.ciphertext, "base64");
    bytes[0] ^= 0xff;
    expect(() => decryptSecret({ ...enc, ciphertext: bytes.toString("base64") }, key)).toThrow();
  });

  it("generateCredentialKey yields 32 bytes", () => {
    expect(Buffer.from(generateCredentialKey(), "base64").length).toBe(32);
  });
});
