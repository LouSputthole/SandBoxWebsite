/**
 * Rarity display helpers.
 *
 * The only rarity signal Steam gives us for S&box items is
 * `asset_description.name_color` — a hex tint stored verbatim (no leading
 * '#') in `Item.rarityColor` by the sync. Steam ships NO human-readable
 * rarity name for these items (`market_bucket_group_name` just echoes the
 * item's own name and there are no rarity `tags`). The tier NAMES were since
 * recovered from the Steam item definitions (see RARITY_NAMES below), so we now
 * render both the colored dot and the tier label for graded items.
 *
 * "Rarity exists" for an item ≡ `rarityColor` is a non-empty string. These
 * helpers are intentionally pure (no Date/Math.random) so they're safe to
 * call directly in a React render body.
 */

/**
 * Hex `name_color` → tier name, used by rarityLabel(). Lower-case, no '#',
 * matching storage. Decoded 2026-06-26 from the s&box Steam item definitions
 * (`ISteamInventory`, appid 590830): the itemdef's `name_color` and `rarity`
 * properties are a clean 1:1 across all graded items, and the colors are the
 * classic Valve grade palette. Only the ~35 graded items carry a color/tier;
 * ungraded items have no `name_color`, so rarityLabel() returns null for them
 * and the UI shows no label (the colored dot only renders when a color exists).
 */
const RARITY_NAMES: Record<string, string> = {
  b0c3d9: "Common",
  "5e98d9": "Uncommon",
  "4b69ff": "Rare",
  "8847ff": "Epic",
  d32ce6: "Legendary",
  eb4b4b: "Mythic",
  e4ae39: "Exotic",
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
