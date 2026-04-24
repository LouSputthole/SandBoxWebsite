import { randomBytes } from "crypto";

/**
 * Opaque random tokens for verify + unsubscribe links. Using 32 random
 * bytes (base64url) = 256 bits of entropy, which is plenty — these
 * tokens live in email bodies and get guessed-against for years, but
 * the search space is enormous.
 *
 * We deliberately avoid JWTs here: no need for a signing secret, no
 * key rotation to worry about, and rotating a token = just issuing a
 * new random string.
 */
export function newOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Basic RFC-5322-adjacent email shape check. Intentionally loose — we
 * catch the obvious "user forgot the @" mistakes without trying to
 * fully validate deliverability. Deliverability is the email
 * provider's job; our job is don't-write-garbage-to-the-DB.
 */
export function looksLikeEmail(s: string): boolean {
  if (!s || s.length > 254) return false;
  const at = s.indexOf("@");
  if (at <= 0 || at === s.length - 1) return false;
  const local = s.slice(0, at);
  const domain = s.slice(at + 1);
  if (local.length === 0 || local.length > 64) return false;
  if (!/\./.test(domain)) return false;
  if (/\s/.test(s)) return false;
  return true;
}
