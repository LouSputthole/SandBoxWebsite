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
  price?: string; // "USD;1500;EUR;1500"
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
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        archive = parsed as SteamItemDef[];
      } else if (parsed?.response?.itemdef && Array.isArray(parsed.response.itemdef)) {
        archive = parsed.response.itemdef as SteamItemDef[];
      } else {
        attempts.push(a);
        return {
          ok: false,
          result: null,
          attempts,
          interpretation: "archive parse: unexpected shape (neither array nor response.itemdef)",
        };
      }
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
 * Parse a Steam price string like "USD;1500;EUR;1400" and return the
 * value for the requested currency in dollars (or whatever unit the
 * cents-divided-by-100 is). Returns null if the currency isn't in
 * the string or the cents value isn't a number.
 */
export function parseSteamPrice(
  raw: string | undefined,
  currency = "USD",
): number | null {
  if (!raw) return null;
  const parts = raw.split(";");
  for (let i = 0; i + 1 < parts.length; i += 2) {
    if (parts[i].toUpperCase() === currency.toUpperCase()) {
      const cents = Number(parts[i + 1]);
      if (Number.isFinite(cents)) return cents / 100;
    }
  }
  return null;
}

/**
 * Pull a human-readable description from a Steam item def. Steam's
 * `description` field is the marketing tagline shown on the in-game
 * store ("Stay anonymous, yet adorable" etc.). Some items use
 * `display_type` instead. Returns null when neither has content.
 */
export function pickItemDescription(def: SteamItemDef): string | null {
  if (typeof def.description === "string" && def.description.trim()) {
    return def.description.trim();
  }
  if (typeof def.display_type === "string" && def.display_type.trim()) {
    return def.display_type.trim();
  }
  return null;
}
