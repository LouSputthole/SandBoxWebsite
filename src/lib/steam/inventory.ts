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

/**
 * Pull the full item-def archive for S&box. Two-call sequence:
 * meta → archive. Cached digest could be persisted later for
 * If-None-Match-style polling, but daily cadence + ~80 items
 * makes that premature optimization.
 */
export async function fetchSteamItemDefs(): Promise<ArchiveResult | null> {
  const key = process.env.STEAM_API_KEY;
  if (!key) return null;

  // Step 1: get the current digest.
  let digest: string;
  try {
    const metaUrl = `https://api.steampowered.com/IInventoryService/GetItemDefMeta/v1/?key=${key}&appid=${APPID}`;
    const metaRes = await fetch(metaUrl, {
      signal: AbortSignal.timeout(10000),
    });
    if (!metaRes.ok) return null;
    const metaJson = (await metaRes.json()) as {
      response?: { digest?: string };
    };
    if (!metaJson.response?.digest) return null;
    digest = metaJson.response.digest;
  } catch {
    return null;
  }

  // Step 2: fetch the archive itself.
  let archive: SteamItemDef[];
  try {
    const archiveUrl = `https://api.steampowered.com/IGameInventory/GetItemDefArchive/v0001/?appid=${APPID}&digest=${digest}`;
    const archiveRes = await fetch(archiveUrl, {
      signal: AbortSignal.timeout(15000),
    });
    if (!archiveRes.ok) return null;

    // Steam returns the archive sometimes as plain JSON array, sometimes
    // wrapped in a single response object. Handle both.
    const text = await archiveRes.text();
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      archive = parsed as SteamItemDef[];
    } else if (parsed?.response?.itemdef && Array.isArray(parsed.response.itemdef)) {
      archive = parsed.response.itemdef as SteamItemDef[];
    } else {
      return null;
    }
  } catch {
    return null;
  }

  const map = new Map<number, SteamItemDef>();
  for (const def of archive) {
    if (!def?.itemdefid) continue;
    const id = Number(def.itemdefid);
    if (!Number.isFinite(id)) continue;
    map.set(id, def);
  }

  return { digest, fetchedAt: new Date(), defsByItemdefid: map };
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
