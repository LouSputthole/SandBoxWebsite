import type { SteamAsset } from "./item-match";

/** S&box Steam appid. */
export const APPID_SBOX = 590830;

/** Raw shape of Steam's public inventory endpoint (only the fields the oracle needs). */
export interface RawInventoryResponse {
  success?: number;
  assets?: Array<{
    assetid: string;
    classid: string;
    instanceid: string;
    amount?: string;
  }>;
  more_items?: number;
  last_assetid?: string;
}

/** Thrown when a profile's inventory is private (403) — the seller must make it public. */
export class InventoryPrivateError extends Error {
  constructor(public steamId64: string) {
    super(`inventory is private for ${steamId64}`);
    this.name = "InventoryPrivateError";
  }
}

/**
 * Thrown on a soft/transient failure — HTTP 200 with `success !== 1` (rate-limited, temporary
 * error). Crucially distinct from a genuinely empty inventory (`success: 1`, no assets): the oracle
 * must NOT read a soft failure as "the item is gone" and wrongfully refund. Callers fail closed.
 */
export class SteamInventoryUnavailableError extends Error {
  constructor(public steamId64: string) {
    super(`inventory temporarily unavailable for ${steamId64}`);
    this.name = "SteamInventoryUnavailableError";
  }
}

/** True only for a trustworthy successful payload. `success: 1` with no assets = legitimately empty. */
function assertUsable(data: RawInventoryResponse, steamId64: string): void {
  if (data.success !== 1) throw new SteamInventoryUnavailableError(steamId64);
}

/** Pure parse of a raw inventory payload into bare assets (assetid/classid/instanceid). */
export function parseInventory(data: RawInventoryResponse): SteamAsset[] {
  if (!data.assets) return [];
  return data.assets.map((a) => ({
    assetid: a.assetid,
    classid: a.classid,
    instanceid: a.instanceid,
    amount: a.amount,
  }));
}

/** A description block joined to an asset — carries the human name, art, and trade flags. */
interface RawDescription {
  classid: string;
  instanceid: string;
  name?: string;
  market_hash_name?: string;
  icon_url?: string;
  tradable?: number;
  marketable?: number;
}

export interface RawInventoryFull extends RawInventoryResponse {
  descriptions?: RawDescription[];
}

/** An inventory entry enriched with display info — what the "list a skin" picker shows. */
export interface InventoryItem {
  assetId: string;
  classId: string;
  instanceId: string;
  name: string;
  imageUrl: string | null;
  tradable: boolean;
  marketable: boolean;
}

const STEAM_ICON_BASE = "https://community.cloudflare.steamstatic.com/economy/image/";

/** Pure join of assets × descriptions into display items (assets with no description are skipped). */
export function parseInventoryItems(data: RawInventoryFull): InventoryItem[] {
  if (!data.assets || !data.descriptions) return [];
  const byKey = new Map<string, RawDescription>();
  for (const d of data.descriptions) byKey.set(`${d.classid}_${d.instanceid}`, d);
  const items: InventoryItem[] = [];
  for (const a of data.assets) {
    const d = byKey.get(`${a.classid}_${a.instanceid}`);
    if (!d) continue;
    items.push({
      assetId: a.assetid,
      classId: a.classid,
      instanceId: a.instanceid,
      name: d.name ?? d.market_hash_name ?? "Unknown item",
      imageUrl: d.icon_url ? `${STEAM_ICON_BASE}${d.icon_url}` : null,
      tradable: d.tradable === 1,
      marketable: d.marketable === 1,
    });
  }
  return items;
}

/** Fetch a user's PUBLIC inventory as enriched, display-ready items (all pages). */
export async function fetchInventoryItems(steamId64: string, pageSize = 2000): Promise<InventoryItem[]> {
  return (await fetchInventoryPages(steamId64, pageSize)).flatMap(parseInventoryItems);
}

/**
 * Fetch a user's PUBLIC S&box inventory as bare assets. Anonymous, no custom User-Agent
 * (site convention — blend into generic traffic). Throws InventoryPrivateError on 403.
 *
 * ponytail: single page of up to `count` items. S&box inventories are small; if `more_items`
 * is ever set for a whale we'd paginate on `last_assetid` — noted, not built until it bites.
 */
/** Cap total pages so a pathological/looping response can't spin forever (10 × 2000 = 20k items). */
const MAX_PAGES = 10;

/**
 * Fetch ALL pages of a user's public inventory, following `more_items`/`last_assetid`. A truncated
 * single page would drop pre-existing copies of a skin from the before-snapshot and later misread
 * them as a fresh delivery, so completeness matters on the money path.
 */
async function fetchInventoryPages(steamId64: string, pageSize: number): Promise<RawInventoryFull[]> {
  const pages: RawInventoryFull[] = [];
  let startAssetId: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const start = startAssetId ? `&start_assetid=${startAssetId}` : "";
    const url = `https://steamcommunity.com/inventory/${steamId64}/${APPID_SBOX}/2?l=english&count=${pageSize}${start}`;
    const res = await fetch(url);
    if (res.status === 403) throw new InventoryPrivateError(steamId64);
    if (!res.ok) throw new Error(`inventory fetch failed for ${steamId64}: ${res.status}`);
    const data = (await res.json()) as RawInventoryFull;
    assertUsable(data, steamId64);
    pages.push(data);
    if (data.more_items && data.last_assetid) startAssetId = data.last_assetid;
    else break;
  }
  return pages;
}

export async function fetchPublicInventory(steamId64: string, pageSize = 2000): Promise<SteamAsset[]> {
  return (await fetchInventoryPages(steamId64, pageSize)).flatMap(parseInventory);
}
