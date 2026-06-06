/**
 * Shared outbound fetch for sbox.dev / sbox.game.
 *
 * Sends a generic, realistic browser User-Agent (+ Accept headers) on
 * every request to a Facepunch-adjacent host.
 *
 * WHY (2026-06-06): sbox.dev's edge started returning 403 to requests
 * with NO User-Agent coming from datacenter IPs around 2026-05-19.
 * Node's global fetch sends no UA by default, so every server-side
 * enrichment call from Vercel was silently 403'd — freezing all
 * supply/owner/category/scarcity data and leaving every drop created
 * after that date un-enriched (confirmed: api.sbox.dev → 403 from
 * Vercel, 200 from a normal browser). A no-UA request from a datacenter
 * IP is a textbook bot-block signal.
 *
 * Sending a COMMON browser UA blends us in as ordinary browser traffic —
 * the opposite of identifying ourselves as sboxskins.gg. It therefore
 * serves the intent of AGENTS.md convention #1 ("don't get singled out")
 * better than the literal no-UA rule, which had become a fingerprint
 * that got the whole Vercel egress range blocked. Lou approved this
 * departure 2026-06-06.
 *
 * Do NOT revert sbox-host fetches to a UA-less `fetch` without a
 * replacement (e.g. a residential proxy) — it re-breaks all enrichment.
 */
const SBOX_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  Accept: "application/json, text/html;q=0.9, */*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

/**
 * `fetch` wrapper that adds browser headers. Drop-in replacement for the
 * raw `fetch(url, { signal })` calls against sbox.dev / sbox.game.
 * Caller-supplied headers win over the defaults.
 */
export function sboxFetch(
  url: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...SBOX_HEADERS, ...(init.headers ?? {}) },
  });
}
