// Micro-check for the discovery scope filter. Run: node scripts/checks/scope-filter.check.mjs
import assert from "node:assert";
import { passesScopeFilter } from "../discover-from-sbox.mjs";

// Real drops and store items pass (even with 0 supply).
assert.equal(passesScopeFilter({ isDroppableItem: true, totalSupply: 0 }), true);
assert.equal(passesScopeFilter({ isActiveStoreItem: true }), true);
assert.equal(passesScopeFilter({ isPermanentStoreItem: true }), true);
assert.equal(passesScopeFilter({ totalSupply: 100 }), true);
// Internal/empty dev entry is filtered out.
assert.equal(
  passesScopeFilter({
    totalSupply: 0,
    isActiveStoreItem: false,
    isPermanentStoreItem: false,
    isDroppableItem: false,
  }),
  false,
);
assert.equal(passesScopeFilter({}), false);

console.log("scope-filter checks passed");
