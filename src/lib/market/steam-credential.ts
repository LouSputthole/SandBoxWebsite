import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM encryption for secrets at rest — used for the seller's Steam Web API key
 * (SellerSteamCredential). GCM gives confidentiality + integrity (a tampered ciphertext or
 * auth tag fails to decrypt). The 32-byte key comes from env `MARKET_CREDENTIAL_KEY` (base64).
 */

export interface EncryptedSecret {
  /** base64 */
  ciphertext: string;
  /** base64 (12-byte GCM nonce) */
  iv: string;
  /** base64 (16-byte GCM auth tag) */
  authTag: string;
}

function envKey(): Buffer {
  const raw = process.env.MARKET_CREDENTIAL_KEY;
  if (!raw) throw new Error("MARKET_CREDENTIAL_KEY is not set");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) throw new Error("MARKET_CREDENTIAL_KEY must decode to 32 bytes (base64)");
  return key;
}

export function encryptSecret(plaintext: string, key: Buffer = envKey()): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ct.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(enc: EncryptedSecret, key: Buffer = envKey()): string {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(enc.iv, "base64"));
  decipher.setAuthTag(Buffer.from(enc.authTag, "base64"));
  const pt = Buffer.concat([decipher.update(Buffer.from(enc.ciphertext, "base64")), decipher.final()]);
  return pt.toString("utf8");
}

/** Generate a fresh 32-byte key as base64 (for `MARKET_CREDENTIAL_KEY` provisioning / tests). */
export function generateCredentialKey(): string {
  return randomBytes(32).toString("base64");
}
