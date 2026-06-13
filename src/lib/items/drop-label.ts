/**
 * Shared display logic for an item's "store / release price" slot.
 *
 * S&box skins enter circulation two ways:
 *   - **Store buys** — purchasable at a fixed price (releasePrice/storePrice > 0).
 *   - **Drops** — random in-game drops (sbox.dev `isDroppableItem`). These were
 *     never sold, so they have no release price; showing "$0.00" is misleading.
 *
 * Use `storePriceLabel` everywhere the store/release price renders so drops show
 * "Item Drop" instead of a bogus zero, consistently across the site + CSV export.
 */

export interface StorePriceFields {
  releasePrice?: number | null;
  storePrice?: number | null;
  isDroppableItem?: boolean | null;
  rarity?: string | null;
}

/** "Item Drop" string used in display + export — single source of truth. */
export const ITEM_DROP_LABEL = "Item Drop";

/**
 * Label for the store/release price slot:
 *   - a real store price  → "$X.YY"
 *   - a drop with no price → "Item Drop"
 *   - neither              → null (caller renders its own "—"/hidden fallback)
 */
export function storePriceLabel(item: StorePriceFields): string | null {
  const price = item.releasePrice ?? item.storePrice ?? null;
  if (price != null && price > 0) return `$${price.toFixed(2)}`;
  if (item.isDroppableItem) return ITEM_DROP_LABEL;
  return null;
}

/** True when the item is a drop with no store price (drives the rarity badge). */
export function isDrop(item: StorePriceFields): boolean {
  return !!item.isDroppableItem && !(item.releasePrice ?? item.storePrice);
}

/** Title-cased rarity tier for display (e.g. "exotic" → "Exotic"), or null. */
export function rarityLabel(rarity: string | null | undefined): string | null {
  if (!rarity) return null;
  return rarity.charAt(0).toUpperCase() + rarity.slice(1);
}
