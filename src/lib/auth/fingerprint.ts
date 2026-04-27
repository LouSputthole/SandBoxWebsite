import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import { headers } from "next/headers";

/**
 * Session fingerprinting helpers. Two purposes:
 *   1. We never store raw IPs — hash them with a salt so a DB leak
 *      doesn't hand out PII.
 *   2. The hash is stable across requests so we can compare "is this
 *      the same network as session-create time" without keeping the
 *      address itself.
 *
 * The salt only needs to defeat rainbow-tabling the IPv4 space (~4B
 * possibilities — trivial without a salt). It's not a high-entropy
 * authentication secret. Default falls back to a constant if the env
 * var is unset so the system works out of the box; production should
 * set AUTH_HASH_SALT to a random per-deployment string for full effect.
 */

const DEFAULT_SALT = "sboxskins-default-fingerprint-salt-2026";

function getSalt(): string {
  return process.env.AUTH_HASH_SALT || DEFAULT_SALT;
}

export function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null;
  return createHash("sha256")
    .update(`${ip}:${getSalt()}`)
    .digest("hex")
    // Truncate to 32 chars — full SHA-256 is 64 hex chars and we don't
    // need cryptographic collision resistance, just uniqueness across a
    // small per-user set of recent fingerprints.
    .slice(0, 32);
}

/**
 * Pull the client IP from typical proxy headers (Vercel sets
 * `x-forwarded-for`). Falls back to a literal "unknown" so callers can
 * still hash + store a value — comparing hash-of-"unknown" between
 * two requests still detects "this connection lost its proxy header."
 */
export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Same as getClientIp but pulls from the App Router's headers() helper —
 * lets server components and helpers like getCurrentUser() get an IP
 * without being passed a request object.
 */
export async function getClientIpFromHeaders(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0].trim() ??
    h.get("x-real-ip") ??
    "unknown"
  );
}

export async function getUserAgentFromHeaders(): Promise<string | null> {
  const h = await headers();
  const ua = h.get("user-agent");
  if (!ua) return null;
  return ua.slice(0, 200);
}

export function getUserAgentFromRequest(
  request: NextRequest,
): string | null {
  const ua = request.headers.get("user-agent");
  if (!ua) return null;
  return ua.slice(0, 200);
}

/**
 * Cheap "what device is this" label derived from a UA string. Not
 * accurate enough to block on, but good enough for /account/sessions
 * to render "Chrome on macOS" instead of a 200-char gibberish string.
 */
export function deviceLabel(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : /curl|wget|python|node/i.test(ua)
            ? "CLI"
            : "Browser";
  const os = /Windows/i.test(ua)
    ? "Windows"
    : /Mac OS X/i.test(ua)
      ? "macOS"
      : /Android/i.test(ua)
        ? "Android"
        : /iPhone|iPad|iOS/i.test(ua)
          ? "iOS"
          : /Linux/i.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}
