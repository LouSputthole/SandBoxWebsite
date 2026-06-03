/**
 * Rarity display helpers.
 *
 * The only rarity signal Steam gives us for S&box items is
 * `asset_description.name_color` — a hex tint stored verbatim (no leading
 * '#') in `Item.rarityColor` by the sync. Steam ships NO human-readable
 * rarity name for these items (`market_bucket_group_name` just echoes the
 * item's own name and there are no rarity `tags`), so any tier *label* is
 * derived here from the known Valve color palette rather than stored.
 *
 * "Rarity exists" for an item ≡ `rarityColor` is a non-empty string. These
 * helpers are intentionally pure (no Date/Math.random) so they're safe to
 * call directly in a React render body.
 */

/**
 * Canonical Valve item-quality palette → tier name. These are the exact
 * hex tints Steam returns in `name_color` (the same grading scale CS uses),
 * observed on live S&box market data (e.g. d32ce6, 4b69ff, 5e98d9, b0c3d9).
 * Lower-case, no '#', matching how the column is stored.
 */
const RARITY_NAMES: Record<string, string> = {
  b0c3d9: "Common",
  "5e98d9": "Uncommon",
  "4b69ff": "Rare",
  "8847ff": "Mythical",
  d32ce6: "Legendary",
  eb4b4b: "Ancient",
  e4ae39: "Immortal",
  ffd700: "Exotic",
};

/** Normalize a stored rarity color to a CSS-usable `#rrggbb` string, or null. */
export function rarityCssColor(rarityColor: string | null | undefined): string | null {
  if (!rarityColor) return null;
  const hex = rarityColor.trim().replace(/^#/, "").toLowerCase();
  if (!/^[0-9a-f]{3}$|^[0-9a-f]{6}$/.test(hex)) return null;
  return `#${hex}`;
}

/**
 * Human-readable tier name for a stored rarity color, when the hex matches a
 * known Valve grade. Returns null for unrecognized colors — callers should
 * still show the colored dot, just without a text label.
 */
export function rarityLabel(rarityColor: string | null | undefined): string | null {
  if (!rarityColor) return null;
  const hex = rarityColor.trim().replace(/^#/, "").toLowerCase();
  return RARITY_NAMES[hex] ?? null;
}
