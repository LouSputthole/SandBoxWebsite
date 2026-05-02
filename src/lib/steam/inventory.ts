/**
 * Steam IInventoryService / IGameInventory client.
 *
 * The same backend the in-game S&box store reads from — every item
 * is keyed by `itemdefid` (Steamworks' Inventory Service id) and
 * has price + name + description + tags exposed publicly via two
 * Web API endpoints:
 *
 *   1. IInventoryService/GetItemDefMeta — returns a digest that
 *      identifies the current archive
 *   2. IGameInventory/GetItemDefArchive — returns the full item
 *      def array given that digest
 *
 * Used to fill in store pricing for items where sbox.dev's API
 * returns null (almost every brand-new drop). Prices are returned
 * in the format "USD;1500;EUR;1500" meaning $15.00 — we parse the
 * USD slot and store as dollars on Item.storePrice.
 *
 * Requires STEAM_API_KEY in env. Returns null on any failure;
 * caller treats that as "skip this run."
 */

const APPID = "590830"; // S&box

export interface SteamItemDef {
  itemdefid: string;
  type?: string;
  name?: string;
  description?: string;
  display_type?: string;
  tradable?: boolean;
  marketable?: boolean;
  /** Per-currency breakdown, e.g. "USD;1500;EUR;1500". */
  price?: string;
  /** Steam tier code, e.g. "1;VLV500" (VLV500 = $5.00). S&box uses
   *  this form for most items. */
  price_category?: string;
  store_tags?: string;
  background_color?: string;
  icon_url?: string;
  icon_url_large?: string;
}

interface ArchiveResult {
  digest: string;
  fetchedAt: Date;
  defsByItemdefid: Map<number, SteamItemDef>;
}

export interface ArchiveAttempt {
  step: "meta" | "archive";
  url: string;
  status: number | null;
  bytes: number | null;
  bodySnippet?: string;
  error?: string;
}

export interface ArchiveDiagnostic {
  ok: boolean;
  result: ArchiveResult | null;
  attempts: ArchiveAttempt[];
  /** Best-effort interpretation of why the call failed. Surfaced to
   *  the operator on the debug page so we don't have to read between
   *  the lines of an HTTP status. */
  interpretation?: string;
}

/**
 * Diagnostic variant — returns per-step status + body excerpts so we
 * can see exactly what Steam is saying. Used by the debug endpoint
 * + the run-now route for visibility into auth / API issues.
 */
export async function fetchSteamItemDefsWithDiag(): Promise<ArchiveDiagnostic> {
  const attempts: ArchiveAttempt[] = [];
  const key = process.env.STEAM_API_KEY;
  if (!key) {
    return {
      ok: false,
      result: null,
      attempts,
      interpretation: "STEAM_API_KEY env var is not set in this deployment",
    };
  }

  // Step 1 — meta. Requires a publisher key.
  const metaUrl = `https://api.steampowered.com/IInventoryService/GetItemDefMeta/v1/?key=${key}&appid=${APPID}`;
  let digest = "";
  {
    const a: ArchiveAttempt = { step: "meta", url: redactKey(metaUrl), status: null, bytes: null };
    try {
      const res = await fetch(metaUrl, { signal: AbortSignal.timeout(10000) });
      a.status = res.status;
      const text = await res.text();
      a.bytes = text.length;
      a.bodySnippet = text.slice(0, 500);
      if (!res.ok) {
        attempts.push(a);
        return {
          ok: false,
          result: null,
          attempts,
          interpretation: interpretMetaFailure(res.status, text),
        };
      }
      const parsed = JSON.parse(text) as { response?: { digest?: string } };
      const d = parsed.response?.digest;
      if (!d || typeof d !== "string") {
        attempts.push(a);
        return {
          ok: false,
          result: null,
          attempts,
          interpretation:
            "meta call succeeded but response had no digest field — Steam returned an unexpected shape",
        };
      }
      digest = d;
      attempts.push(a);
    } catch (err) {
      a.error = err instanceof Error ? err.message : String(err);
      attempts.push(a);
      return {
        ok: false,
        result: null,
        attempts,
        interpretation: `meta call threw: ${a.error}`,
      };
    }
  }

  // Step 2 — archive itself. No key needed (digest acts as access).
  const archiveUrl = `https://api.steampowered.com/IGameInventory/GetItemDefArchive/v0001/?appid=${APPID}&digest=${digest}`;
  let archive: SteamItemDef[] = [];
  {
    const a: ArchiveAttempt = { step: "archive", url: archiveUrl, status: null, bytes: null };
    try {
      const res = await fetch(archiveUrl, { signal: AbortSignal.timeout(15000) });
      a.status = res.status;
      const text = await res.text();
      a.bytes = text.length;
      a.bodySnippet = text.slice(0, 500);
      if (!res.ok) {
        attempts.push(a);
        return {
          ok: false,
          result: null,
          attempts,
          interpretation: `archive call returned ${res.status} — Steam may have rotated the digest mid-call; retry`,
        };
      }
      const parsed = parseArchiveBody(text);
      if (!parsed) {
        attempts.push(a);
        return {
          ok: false,
          result: null,
          attempts,
          interpretation:
            "archive parse failed even after trim. Steam response neither plain JSON array, response.itemdef wrapper, nor NDJSON.",
        };
      }
      archive = parsed;
      attempts.push(a);
    } catch (err) {
      a.error = err instanceof Error ? err.message : String(err);
      attempts.push(a);
      return {
        ok: false,
        result: null,
        attempts,
        interpretation: `archive call threw: ${a.error}`,
      };
    }
  }

  const map = new Map<number, SteamItemDef>();
  for (const def of archive) {
    if (!def?.itemdefid) continue;
    const id = Number(def.itemdefid);
    if (!Number.isFinite(id)) continue;
    map.set(id, def);
  }

  return {
    ok: true,
    result: { digest, fetchedAt: new Date(), defsByItemdefid: map },
    attempts,
  };
}

/**
 * Backwards-compat wrapper for callers that only care about the
 * happy-path result. New diagnostic-aware paths use
 * fetchSteamItemDefsWithDiag() directly.
 */
export async function fetchSteamItemDefs(): Promise<ArchiveResult | null> {
  const diag = await fetchSteamItemDefsWithDiag();
  return diag.result;
}

function redactKey(url: string): string {
  return url.replace(/key=[^&]+/i, "key=***REDACTED***");
}

/**
 * Translate a meta-call HTTP status into something actionable. The
 * most common gotcha: IInventoryService requires a *publisher* API
 * key (Steamworks partner backend), not the regular Web API key
 * (steamcommunity.com/dev/apikey). Publisher keys are issued to game
 * developers — Facepunch — and we don't get one as a third party.
 */
function interpretMetaFailure(status: number, body: string): string {
  if (status === 401 || status === 403) {
    return (
      "Steam returned " +
      status +
      " on meta call. Most likely cause: STEAM_API_KEY is a regular Web API key, but " +
      "IInventoryService/GetItemDefMeta requires a *publisher* API key (Steamworks partner key, " +
      "issued to the game developer). We can't get one as a third party — Facepunch would need " +
      "to issue it. Alternative paths needed: scrape sbox.game/itemstore (Blazor — needs headless " +
      "browser) or wait for Facepunch to expose the catalog publicly."
    );
  }
  if (status === 429) {
    return "Steam returned 429 — rate limited. Back off and retry.";
  }
  if (status === 503 || status >= 500) {
    return `Steam returned ${status} — Steam Web API is having issues. Try again later.`;
  }
  return `Steam returned ${status}. Body excerpt: ${body.slice(0, 200)}`;
}

/**
 * Parse a Steam price-related string and return USD dollars.
 *
 * Steam's item-def archive uses two different price encodings:
 *
 *   1. Per-currency breakdown: "USD;1500;EUR;1400"
 *      → each currency followed by cents.
 *   2. Currency tier code: "1;VLV500"
 *      → the VLV<N> token is Steam's price-tier id where N is
 *        cents (VLV500 = $5.00, VLV1500 = $15.00, etc.).
 *
 * For S&box specifically, items mostly use the VLV form (we observed
 * Prison Jumpsuit at price_category "1;VLV500"). We accept both to
 * be safe and try the per-currency breakdown first since it's the
 * more precise signal.
 *
 * Returns null if neither encoding produces a valid number.
 */
export function parseSteamPrice(
  raw: string | undefined,
  currency = "USD",
): number | null {
  if (!raw) return null;
  const parts = raw.split(";");

  // Per-currency breakdown ("USD;500" or "USD;500;EUR;500").
  for (let i = 0; i + 1 < parts.length; i += 2) {
    if (parts[i].toUpperCase() === currency.toUpperCase()) {
      const cents = Number(parts[i + 1]);
      if (Number.isFinite(cents)) return cents / 100;
    }
  }

  // VLV tier code anywhere in the string. The number after VLV is
  // cents — VLV500 = $5.00.
  for (const p of parts) {
    const m = p.match(/^VLV(\d+)$/i);
    if (m?.[1]) {
      const cents = Number(m[1]);
      if (Number.isFinite(cents) && cents > 0) return cents / 100;
    }
  }

  return null;
}

/**
 * Parse Steam's item-def archive body into a defs array, tolerating
 * the trailing-character corruption that broke our previous strict
 * JSON.parse (Steam appends a stray byte at the end of the response
 * that's not valid JSON — verified at byte 70308 of a 70309-byte
 * payload).
 *
 * Cascade:
 *   1. Plain JSON.parse — works for clean responses.
 *   2. Trim trailing non-array chars (whitespace, null bytes, BOMs)
 *      back to the last `]` and parse again.
 *   3. NDJSON — split on newlines, parse each line, collect array.
 *   4. response.itemdef wrapper for any "modern" Steam wrapping.
 *
 * Returns null only if every strategy fails — caller surfaces a
 * detailed error.
 */
export function parseArchiveBody(text: string): SteamItemDef[] | null {
  // 1. Strict
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed as SteamItemDef[];
    if (parsed?.response?.itemdef && Array.isArray(parsed.response.itemdef)) {
      return parsed.response.itemdef as SteamItemDef[];
    }
  } catch {
    /* try the trim path */
  }

  // 2. Trim back to the last ']' and retry.
  const lastBracket = text.lastIndexOf("]");
  if (lastBracket > 0) {
    try {
      const trimmed = text.slice(0, lastBracket + 1);
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed as SteamItemDef[];
    } catch {
      /* try NDJSON */
    }
  }

  // 3. NDJSON fallback — line per def.
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length > 1) {
    const out: SteamItemDef[] = [];
    let parsedAny = false;
    for (const line of lines) {
      try {
        const v = JSON.parse(line);
        if (v && typeof v === "object") {
          parsedAny = true;
          out.push(v as SteamItemDef);
        }
      } catch {
        /* skip line */
      }
    }
    if (parsedAny) return out;
  }

  return null;
}

/**
 * Pull a human-readable description from a Steam item def. Steam's
 * `description` field is the marketing tagline shown on the in-game
 * store ("Stay anonymous, yet adorable" etc.). It often contains
 * BBCode markup (`[color=#3cba54]Available in store[/color]`,
 * `[b]bold[/b]`) and a trailing "Available in store" callout we
 * don't want in our copy. Strip both.
 */
export function pickItemDescription(def: SteamItemDef): string | null {
  const raw =
    typeof def.description === "string" && def.description.trim()
      ? def.description
      : typeof def.display_type === "string" && def.display_type.trim()
        ? def.display_type
        : null;
  if (!raw) return null;
  return cleanBbcode(raw);
}

/**
 * Strip BBCode tags + Facepunch's "Available in store" footer that
 * Steam item-def descriptions carry. Collapses surplus whitespace
 * and returns null when nothing usable remains.
 */
function cleanBbcode(s: string): string | null {
  let out = s
    // Strip [color=...]…[/color] / [b]…[/b] / etc. Two-pass — opening
    // tags then closing tags — keeps the inner text intact.
    .replace(/\[(?:[a-z]+)(?:=[^\]]*)?\]/gi, "")
    .replace(/\[\/[a-z]+\]/gi, "")
    // Drop the boilerplate callout Facepunch appends to in-store items.
    .replace(/available in store/gi, "")
    // Collapse whitespace.
    .replace(/\s+/g, " ")
    .trim();
  if (!out) return null;
  return out;
}

/**
 * Best-effort price lookup from a SteamItemDef. Tries `price` (per-
 * currency breakdown) first since it's the more precise signal,
 * then falls through to `price_category` (VLV tier code).
 */
export function pickItemPrice(def: SteamItemDef, currency = "USD"): number | null {
  const fromPrice = parseSteamPrice(def.price, currency);
  if (fromPrice != null) return fromPrice;
  return parseSteamPrice(def.price_category, currency);
}
