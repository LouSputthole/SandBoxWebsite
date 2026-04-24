import { Resend } from "resend";

/**
 * Resend SDK singleton. Same graceful-fallback pattern as the Anthropic
 * client: if `RESEND_API_KEY` is missing we return `null` and every send
 * helper in this folder no-ops + logs. Keeps shipping without a Resend
 * account viable (verification just won't be emailed — the admin can
 * verify via `/admin/newsletter` instead).
 *
 * Sender identity lives here too so the From/Reply-To headers are
 * consistent across the verify email and the newsletter issues. Change
 * once here, propagates.
 */

let _client: Resend | null = null;

export function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (_client) return _client;
  _client = new Resend(process.env.RESEND_API_KEY);
  return _client;
}

export function hasResend(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/** From address — whatever Resend domain we verified. Override with env
 *  for staging / testing sender domains. */
export const SENDER_FROM =
  process.env.NEWSLETTER_FROM ?? "sboxskins.gg <newsletter@sboxskins.gg>";

/** Reply-to defaults to a human-readable inbox so replies go somewhere
 *  someone checks. Optional — leave unset and the SENDER_FROM is used. */
export const SENDER_REPLY_TO =
  process.env.NEWSLETTER_REPLY_TO ?? "hello@sboxskins.gg";

/** Public origin for links inside emails — must be absolute or Gmail/
 *  Apple Mail will mangle them. */
export const SITE_ORIGIN =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://sboxskins.gg";
