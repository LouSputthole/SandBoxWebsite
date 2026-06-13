# New-Drop Discovery + Drop Labeling — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Discover new S&box skins (store + drops) from sbox.dev's sitemap hourly via the GitHub runner IP, create them on the site, label drops as "Item Drop", and auto-tweet genuinely-new drops going forward.

**Architecture:** GitHub Action fetches sbox.dev `sitemap-skins.xml` + per-skin payloads (runner IP isn't Cloudflare-blocked) and POSTs to `/api/admin/enrich-items`, which is upgraded to **create** rows it can't match (factored `seedItemFromSboxPayload`). New drop fields (`isDroppableItem`/`droppedUnits`/`rarity`) drive an "Item Drop" display via one shared helper. The endpoint enqueues a `ScheduledTweet` for newly-created items released within 48h (off for the backfill).

**Tech Stack:** Next.js 16 (App Router), Prisma 7 + Postgres (Neon), Node ESM scripts, GitHub Actions, existing Twitter `ScheduledTweet` + dispatcher pipeline.

**Repo verification model:** No unit-test framework exists. Verify with `npx tsc --noEmit` (typecheck), `npm run lint`, `node` `assert`-based micro-checks for pure functions (committed under `scripts/checks/`), the discovery script's `--dry-run`, and live checks against prod read APIs. Commit per task.

**Conventions (AGENTS.md):** anonymous from Vercel (browser-UA only from the runner); cache stale never null (only-when-present updates, create-only writes); no new public derived-metric JSON; render rarity as JSX; `"use client"` only where handlers exist. Migration is **owner-applied on merge/deploy** — do not apply to prod.

---

## File map

- **Modify** `prisma/schema.prisma` — add 3 columns to `Item`.
- **Create** `prisma/migrations/<ts>_item_drop_fields/migration.sql` — additive.
- **Modify** `src/lib/services/sync-service.ts` — extend `SboxSkinData`; add `seedItemFromSboxPayload()`; thin `seedItemFromSboxDev()`; map drop fields in `syncSboxData`.
- **Modify** `src/app/api/admin/enrich-items/route.ts` — payload fields; create-on-missing; `created[]`; tweet enqueue.
- **Create** `src/lib/items/drop-label.ts` — shared `storePriceLabel(item)` + `dropRarity(item)` helpers.
- **Modify** display surfaces: `src/components/items/item-detail.tsx`, `src/app/store/page.tsx`, `src/app/s/[slug]/page.tsx`, `src/app/api/export/route.ts`.
- **Create** `scripts/discover-from-sbox.mjs` — sitemap discovery + enrich (supersedes `enrich-from-sbox.mjs`).
- **Modify** `.github/workflows/enrich-sbox.yml` — hourly, run the discovery script.
- **Create** `scripts/checks/drop-label.check.mjs`, `scripts/checks/scope-filter.check.mjs` — `node:assert` micro-checks.

---

### Task 1: DB — drop fields on Item

**Files:**
- Modify: `prisma/schema.prisma` (Item model)
- Create: `prisma/migrations/<timestamp>_item_drop_fields/migration.sql`

- [ ] **Step 1: Add columns to the Item model** (near `rarityColor`):

```prisma
  isDroppableItem     Boolean    @default(false) // sbox.dev isDroppableItem — random in-game drop, no store price
  droppedUnits        Int?       // sbox.dev droppedUnits — count that dropped
  rarity              String?    // sbox.dev rarity tier (common/uncommon/rare/exotic/...)
```

- [ ] **Step 2: Create the migration** by hand (do NOT run `migrate dev` against prod). Create `prisma/migrations/<YYYYMMDDHHMMSS>_item_drop_fields/migration.sql`:

```sql
ALTER TABLE "Item" ADD COLUMN "isDroppableItem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Item" ADD COLUMN "droppedUnits" INTEGER;
ALTER TABLE "Item" ADD COLUMN "rarity" TEXT;
```

- [ ] **Step 3: Regenerate the Prisma client**

Run: `npm run db:generate`
Expected: "Generated Prisma Client" with no errors.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (new fields available on the `Item` type).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat(db): add isDroppableItem/droppedUnits/rarity to Item"
```

---

### Task 2: `seedItemFromSboxPayload` — create rows from a payload (no Vercel→sbox.dev fetch)

**Files:**
- Modify: `src/lib/services/sync-service.ts`

- [ ] **Step 1: Extend `SboxSkinData`** (the interface ~line 904) with the new fields the payload carries:

```ts
  isDroppableItem?: boolean | null;
  droppedUnits?: number | null;
  rarity?: string | null;
  rarityColor?: string | null;
```

- [ ] **Step 2: Extract the body of `seedItemFromSboxDev` into a pure payload-seeder.** Add a new exported function that takes an already-fetched `skin` (and optional resolved `imageUrl`) and does the name-match-or-create write. It must NOT call `fetchSboxSkin`/`fetchSboxSkinImage` (those 403 from Vercel). Move the existing description/type/image/data-mapping logic here, add the drop fields, and have the image come from `skin` (`pickSboxImage`) or a passed-in `imageUrl`:

```ts
export async function seedItemFromSboxPayload(
  slug: string,
  skin: SboxSkinData,
  result: SyncResult,
  imageUrl?: string | null,
): Promise<{ itemId: string | null; matchedName: string | null; slug: string | null; created: boolean }> {
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return { itemId: null, matchedName: null, slug: null, created: false };
  }
  const itemType = inferItemType(skin.itemType ?? "", skin.name);

  let existing = await prisma.item.findUnique({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });
  let matchedByName = false;
  if (!existing) {
    existing = await prisma.item.findFirst({
      where: { name: { equals: skin.name, mode: "insensitive" } },
      select: { id: true, slug: true, name: true },
    });
    matchedByName = !!existing;
  }

  const description = `${skin.name} is a${
    /^[aeiou]/i.test(itemType) ? "n" : ""
  } S&box ${itemType}${skin.itemDisplayName ? ` (${skin.itemDisplayName})` : ""}${
    skin.category ? ` in the ${skin.category} category` : ""
  }. ${skin.totalSupply ? `Total supply: ${skin.totalSupply.toLocaleString()}. ` : ""}Track price history, supply, and ownership over time.`;

  const resolvedImage = imageUrl ?? pickSboxImage(skin);

  const data = {
    name: skin.name,
    slug,
    type: itemType,
    description,
    imageUrl: resolvedImage,
    currentPrice: skin.price > 0 ? skin.price : null,
    storePrice: skin.releasePrice ?? null,
    releasePrice: skin.releasePrice ?? null,
    releaseDate: skin.release ? new Date(skin.release) : null,
    isActiveStoreItem: skin.isActiveStoreItem,
    isPermanentStoreItem: skin.isPermanentStoreItem,
    leavingStoreAt: skin.leavingStoreAt ? new Date(skin.leavingStoreAt) : null,
    totalSupply: skin.totalSupply,
    uniqueOwners: skin.uniqueOwners,
    soldPast24h: skin.soldPast24H ?? skin.boughtInTheLast24H,
    supplyOnMarket: skin.supplyOnMarket,
    totalSales: skin.sales,
    itemDisplayName: skin.itemDisplayName,
    category: skin.category,
    itemSubType: skin.itemType,
    workshopId: skin.workshopId,
    iconBackgroundColor: skin.iconBackgroundColor,
    itemDefinitionId: skin.itemDefinitionId ?? null,
    isDroppableItem: skin.isDroppableItem ?? false,
    droppedUnits: skin.droppedUnits ?? null,
    rarity: skin.rarity ?? null,
    ...(skin.rarityColor ? { rarityColor: normalizeRarityColor(skin.rarityColor) ?? undefined } : {}),
    sboxSyncedAt: new Date(),
  };

  if (existing) {
    const updateData = matchedByName ? (() => { const { slug: _s, name: _n, ...rest } = data; return rest; })() : data;
    await prisma.item.update({ where: { id: existing.id }, data: updateData });
    result.itemsUpdated++;
    return { itemId: existing.id, matchedName: skin.name, slug: existing.slug, created: false };
  }
  const created = await prisma.item.create({ data, select: { id: true } });
  result.itemsCreated++;
  return { itemId: created.id, matchedName: skin.name, slug, created: true };
}
```

- [ ] **Step 3: Rewrite `seedItemFromSboxDev` as a thin wrapper** that fetches then delegates (preserves existing callers — `discoverSboxSkins`, admin seed route):

```ts
export async function seedItemFromSboxDev(
  slugOrUrl: string,
  result: SyncResult,
): Promise<{ itemId: string | null; matchedName: string | null; slug: string | null }> {
  const slug = slugOrUrl.trim()
    .replace(/^https?:\/\/(www\.)?sbox\.dev\/skins\//, "")
    .replace(/^\//, "").split(/[?#]/)[0];
  if (!slug || !/^[a-z0-9-]+$/.test(slug)) return { itemId: null, matchedName: null, slug: null };
  const skin = await fetchSboxSkin(slug);
  if (!skin) return { itemId: null, matchedName: null, slug: null };
  let imageUrl: string | null = pickSboxImage(skin);
  if (!imageUrl) imageUrl = await fetchSboxSkinImage(slug);
  const r = await seedItemFromSboxPayload(slug, skin, result, imageUrl);
  return { itemId: r.itemId, matchedName: r.matchedName, slug: r.slug };
}
```

- [ ] **Step 4: Map drop fields in `syncSboxData`** (the `prisma.item.update` data block ~line 1924) so the Vercel-side enrichment keeps drop data in parity when it runs:

```ts
          isDroppableItem: skin.isDroppableItem ?? false,
          droppedUnits: skin.droppedUnits ?? null,
          rarity: skin.rarity ?? null,
          ...(skin.rarityColor ? { rarityColor: normalizeRarityColor(skin.rarityColor) ?? undefined } : {}),
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/services/sync-service.ts
git commit -m "feat(sync): seedItemFromSboxPayload (create from payload) + drop fields"
```

---

### Task 3: enrich-items endpoint — create-on-missing + drop fields + new-drop tweet

**Files:**
- Modify: `src/app/api/admin/enrich-items/route.ts`

- [ ] **Step 1: Extend `SboxSkinPayload`** with the fields needed to create + label:

```ts
  name?: string | null;
  slug?: string | null;
  isDroppableItem?: boolean | null;
  droppedUnits?: number | null;
  rarity?: string | null;
  rarityColor?: string | null;
  iconUrl?: string | null;
```

- [ ] **Step 2: Accept an `announce` flag and import the seeder.** At top add:

```ts
import { computeScarcityScore, seedItemFromSboxPayload, type SboxSkinData } from "@/lib/services/sync-service";
```
Read `const announce = body?.announce !== false;` from the request body (default true; backfill sends `announce:false`).

- [ ] **Step 3: Map drop fields into the existing `updateMany` data block** (only-when-present so we never null a known value):

```ts
          ...(typeof skin.isDroppableItem === "boolean" ? { isDroppableItem: skin.isDroppableItem } : {}),
          ...(skin.droppedUnits != null ? { droppedUnits: skin.droppedUnits } : {}),
          ...(skin.rarity ? { rarity: skin.rarity } : {}),
          ...(skin.rarityColor ? { rarityColor: skin.rarityColor.replace(/^#/, "").toLowerCase() } : {}),
```

- [ ] **Step 4: Create-on-missing.** Replace the `else notFound.push(slug)` branch: when the update matched 0 rows, attempt a payload seed and record creations. Requires the payload to carry `skin.name` (the script sends it). Build a `SboxSkinData`-shaped object from the payload and call the seeder:

```ts
      if (res.count > 0) { updated += res.count; }
      else if (skin.name) {
        const seedRes: SyncResult = { success: true, itemsProcessed: 0, itemsCreated: 0, itemsUpdated: 0, pricePointsCreated: 0, errors: [], duration: 0 };
        const seeded = await seedItemFromSboxPayload(slug, skin as unknown as SboxSkinData, seedRes, skin.iconUrl ?? null);
        if (seeded.created) { created.push(slug); newlyCreated.push({ slug, skin }); }
        else if (seeded.itemId) { updated++; }       // matched by name → refreshed existing row
        else notFound.push(slug);
      } else { notFound.push(slug); }
```
(Declare `const created: string[] = [];` and `const newlyCreated: {slug:string; skin:SboxSkinPayload}[] = [];` alongside `notFound`. Import `type SyncResult` from steam types.)

- [ ] **Step 5: Enqueue new-drop tweets** after the loop, before the cache bust. Only newly-created items, released within 48h, when `announce`. Dedupe via existing `ScheduledTweet(itemSlug, kind="new-drop")`:

```ts
  const TWEET_WINDOW_MS = 48 * 60 * 60 * 1000;
  if (announce && newlyCreated.length) {
    for (const { slug, skin } of newlyCreated) {
      const rel = skin.release ? new Date(skin.release).getTime() : 0;
      if (!rel || Date.now() - rel > TWEET_WINDOW_MS) continue;
      const dup = await prisma.scheduledTweet.findFirst({ where: { itemSlug: slug, kind: "new-drop" } });
      if (dup) continue;
      const url = `https://sboxskins.gg/items/${slug}`;
      const name = skin.name ?? slug;
      const text = skin.isDroppableItem
        ? `New S&box drop: ${name} 🆕 — in-game drop${skin.rarity ? ` (${skin.rarity})` : ""}${skin.droppedUnits ? `, ${skin.droppedUnits.toLocaleString()} dropped` : ""}. ${url}`
        : `New S&box drop: ${name} 🆕${skin.releasePrice ? ` — $${skin.releasePrice.toFixed(2)}` : ""}${skin.leavingStoreAt ? `, leaves store ${new Date(skin.leavingStoreAt).toISOString().slice(0,10)}` : ""}. ${url}`;
      await prisma.scheduledTweet.create({ data: { text: text.slice(0, 280), scheduledFor: new Date(), kind: "new-drop", itemSlug: slug } });
    }
  }
```

- [ ] **Step 6: Return `created` in the JSON** (`{ ok: true, created, updated, notFound, skipped }`) and bust caches when `created.length || updated > 0`.

- [ ] **Step 7: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/app/api/admin/enrich-items/route.ts
git commit -m "feat(enrich-items): create-on-missing + drop fields + new-drop tweet"
```

---

### Task 4: "Item Drop" display — shared helper + surfaces

**Files:**
- Create: `src/lib/items/drop-label.ts`
- Create: `scripts/checks/drop-label.check.mjs`
- Modify: `src/components/items/item-detail.tsx`, `src/app/store/page.tsx`, `src/app/s/[slug]/page.tsx`, `src/app/api/export/route.ts`

- [ ] **Step 1: Write the helper.** Pure, framework-free so it's reusable + checkable:

```ts
// src/lib/items/drop-label.ts
export interface StorePriceFields {
  releasePrice?: number | null;
  storePrice?: number | null;
  isDroppableItem?: boolean | null;
  rarity?: string | null;
}

/** Label for the "store/release price" slot.
 *  store item with a price → "$X.YY"; drop → "Item Drop"; otherwise null. */
export function storePriceLabel(item: StorePriceFields): string | null {
  const p = item.releasePrice ?? item.storePrice ?? null;
  if (p != null && p > 0) return `$${p.toFixed(2)}`;
  if (item.isDroppableItem) return "Item Drop";
  return null;
}

export function isDrop(item: StorePriceFields): boolean {
  return !!item.isDroppableItem && !(item.releasePrice ?? item.storePrice);
}
```

- [ ] **Step 2: Write the micro-check** and run it:

```js
// scripts/checks/drop-label.check.mjs
import assert from "node:assert";
import { storePriceLabel, isDrop } from "../../src/lib/items/drop-label.ts";
assert.equal(storePriceLabel({ releasePrice: 49.99 }), "$49.99");
assert.equal(storePriceLabel({ releasePrice: null, isDroppableItem: true }), "Item Drop");
assert.equal(storePriceLabel({ releasePrice: 0, isDroppableItem: true }), "Item Drop");
assert.equal(storePriceLabel({}), null);
assert.equal(isDrop({ isDroppableItem: true, releasePrice: null }), true);
assert.equal(isDrop({ isDroppableItem: true, releasePrice: 5 }), false);
console.log("drop-label checks passed");
```

Run: `npx tsx scripts/checks/drop-label.check.mjs`
Expected: "drop-label checks passed" (use `tsx` since it imports a `.ts` file).

- [ ] **Step 3: Apply in each surface.** Find where release/store price renders and replace the raw price with `storePriceLabel(item)`, falling back to existing "—" when null. In `item-detail.tsx` and `store/page.tsx`, when `isDrop(item)` also render a small rarity badge using `item.rarity` + `item.rarityColor` (JSX, capitalized tier). In `export/route.ts`, emit `Item Drop` (or the price) in the store-price column and add a `rarity` column. Read each file's current price-render block first; keep styling consistent with neighbors.

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/items/drop-label.ts scripts/checks/drop-label.check.mjs src/components/items/item-detail.tsx src/app/store/page.tsx src/app/s/[slug]/page.tsx src/app/api/export/route.ts
git commit -m "feat(ui): label drop items as 'Item Drop' with rarity badge"
```

---

### Task 5: Discovery script — sitemap → diff → scope-filter → POST

**Files:**
- Create: `scripts/discover-from-sbox.mjs`
- Create: `scripts/checks/scope-filter.check.mjs`

- [ ] **Step 1: Write the scope-filter as a tiny exported predicate + check.**

```js
// inside discover-from-sbox.mjs, exported for the check
export function passesScopeFilter(skin) {
  return !!(skin.isDroppableItem || skin.isActiveStoreItem || skin.isPermanentStoreItem || skin.totalSupply);
}
```

```js
// scripts/checks/scope-filter.check.mjs
import assert from "node:assert";
import { passesScopeFilter } from "../discover-from-sbox.mjs";
assert.equal(passesScopeFilter({ isDroppableItem: true, totalSupply: 0 }), true);
assert.equal(passesScopeFilter({ isActiveStoreItem: true }), true);
assert.equal(passesScopeFilter({ totalSupply: 100 }), true);
assert.equal(passesScopeFilter({ totalSupply: 0, isActiveStoreItem: false, isDroppableItem: false, isPermanentStoreItem: false }), false);
console.log("scope-filter checks passed");
```

Run: `node scripts/checks/scope-filter.check.mjs` → "scope-filter checks passed".

- [ ] **Step 2: Write the script.** Browser-UA on all fetches; parse sitemap; fetch our slugs+names; honor `SLUG_OVERRIDES`; for new+known slugs fetch per-skin (+supply); scope-filter new ones; send `{ slug, name, skin, supply, iconUrl }` (include `name` + `iconUrl` so the endpoint can create); batch ≤25; `--dry-run` logs the would-create set without POSTing; pass `announce` from `SBOX_ANNOUNCE` env (default true; backfill sets `false`). Reuse `SLUG_OVERRIDES` (our→sbox) and invert it for sbox→our name matching. Map the per-skin payload into the `skin` object including `isDroppableItem`, `droppedUnits`, `rarity`, `rarityColor`, `iconUrl`, `name`. (Full content authored at implementation time, mirroring `enrich-from-sbox.mjs` structure.)

- [ ] **Step 3: Dry-run against prod read APIs** (no key needed for read; dry-run does not POST):

Run: `node scripts/discover-from-sbox.mjs --dry-run`
Expected: prints sitemap count (~116), our count (~106), and a would-create list containing `the-hotdog-costume`, `construction-glasses`, `fluffy-slippers`, `sunglasses-*`, and NOT `qa-team-t-shirt`.

- [ ] **Step 4: Commit**

```bash
git add scripts/discover-from-sbox.mjs scripts/checks/scope-filter.check.mjs
git commit -m "feat(scripts): sitemap-driven sbox discovery (dry-run verified)"
```

---

### Task 6: GitHub Action — hourly discover + enrich

**Files:**
- Modify: `.github/workflows/enrich-sbox.yml`

- [ ] **Step 1: Update schedule + step** to run hourly and call the discovery script (keep `workflow_dispatch`, keep `SBOXSKINS_ADMIN_KEY`):

```yaml
on:
  schedule:
    - cron: "0 * * * *"   # hourly
  workflow_dispatch:
    inputs:
      announce:
        description: "Tweet new drops (false for backfill)"
        default: "true"
# ...
      - name: Discover + enrich from sbox.dev
        env:
          SBOXSKINS_ADMIN_KEY: ${{ secrets.SBOXSKINS_ADMIN_KEY }}
          SITE_URL: https://sboxskins.gg
          SBOX_ANNOUNCE: ${{ github.event.inputs.announce || 'true' }}
        run: node scripts/discover-from-sbox.mjs
```

- [ ] **Step 2: Validate YAML**

Run: `npx --yes js-yaml .github/workflows/enrich-sbox.yml >/dev/null && echo OK`
Expected: OK.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/enrich-sbox.yml
git commit -m "ci: hourly sbox discover+enrich (was daily enrich-only)"
```

---

### Task 7: Verify, push, PR, backfill

- [ ] **Step 1: Full typecheck + lint + build**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS. (Skip `next build` if it requires `DATABASE_URL`; rely on typecheck/lint.)

- [ ] **Step 2: Code review the diff** — run `/code-review` (this is auth/data-pipeline + money-adjacent display). Address findings.

- [ ] **Step 3: Push branch + open PR**

```bash
git push -u origin claude/new-drop-discovery
gh pr create --title "New-drop discovery + drop labeling" --body "<summary + spec link + 'migration owner-applied on merge'>"
```

- [ ] **Step 4 (after owner merges + applies migration): backfill with tweeting OFF.** Either trigger the Action via `workflow_dispatch` with `announce=false`, or run locally against prod:

Run: `SBOX_ANNOUNCE=false SBOXSKINS_ADMIN_KEY=<key> node scripts/discover-from-sbox.mjs`
Expected: ~8 items created (Hotdog, Construction Glasses, Fluffy Slippers, 5 Sunglasses); 0 tweets.

- [ ] **Step 5: Verify live.** `/api/items` total 106 → ~114; the Hotdog page shows `$49.99`; each Sunglasses page shows **"Item Drop"** + rarity; no `ScheduledTweet` rows with `kind="new-drop"` for the backfill.

---

## Self-review notes

- **Spec coverage:** discovery source (T5/T6), create-on-missing (T2/T3), drop model (T1), drop label + rarity (T4), forward-only tweets w/ 48h window + backfill-off (T3/T7), scope filter (T5), conventions (throughout), backfill (T7). ✓
- **Type consistency:** `seedItemFromSboxPayload(slug, skin, result, imageUrl?)` and `storePriceLabel`/`isDrop`/`passesScopeFilter` used with the same signatures across tasks. ✓
- **Migration safety:** additive, owner-applied; code only reads new columns after merge+deploy. ✓
