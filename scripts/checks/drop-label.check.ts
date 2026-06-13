// Micro-check for the drop-label helper. Run: npx tsx scripts/checks/drop-label.check.ts
import assert from "node:assert";
import {
  storePriceLabel,
  isDrop,
  rarityLabel,
  ITEM_DROP_LABEL,
} from "../../src/lib/items/drop-label";

// store item with a price → formatted price
assert.equal(storePriceLabel({ releasePrice: 49.99 }), "$49.99");
assert.equal(storePriceLabel({ releasePrice: null, storePrice: 0.99 }), "$0.99");
// drop (no price) → "Item Drop"
assert.equal(storePriceLabel({ releasePrice: null, isDroppableItem: true }), ITEM_DROP_LABEL);
assert.equal(storePriceLabel({ releasePrice: 0, isDroppableItem: true }), ITEM_DROP_LABEL);
// neither → null
assert.equal(storePriceLabel({}), null);
assert.equal(storePriceLabel({ releasePrice: 0, isDroppableItem: false }), null);

assert.equal(isDrop({ isDroppableItem: true, releasePrice: null }), true);
assert.equal(isDrop({ isDroppableItem: true, releasePrice: 5 }), false);
assert.equal(isDrop({ isDroppableItem: false }), false);

assert.equal(rarityLabel("exotic"), "Exotic");
assert.equal(rarityLabel(null), null);

console.log("drop-label checks passed");
