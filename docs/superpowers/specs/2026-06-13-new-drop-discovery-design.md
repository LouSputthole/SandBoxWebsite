# New-Drop Discovery + Drop Labeling — Design

**Date:** 2026-06-13
**Status:** Approved (brainstorming) → ready for implementation plan
**Repo:** sboxskins.gg (`Documents/SandBoxWebsite`)

## Problem

New S&box skins are not appearing on sboxskins.gg. The trigger was **The Hotdog
Costume** (released 2026-06-07) plus a wave of other June 7–8 items. The pipeline
"was catching them" before but stopped.

### Root cause (confirmed with live probes)

Item discovery runs through four mechanisms; every path that could catch a
brand-new store/drop item is broken or a no-op:

| Path | Runs from | Behavior | Status |
|------|-----------|----------|--------|
| `/api/sync` (Steam Market, every 15–30 min) | Vercel | Creates rows for items **with active Steam Market listings** | ✅ works, but only sees the ~105 items that have live Market listings |
| `/api/cron/sbox-discover` (every 6h) → `discoverSboxSkins()` | Vercel | Seeds new items from a sbox.dev catalog list | ❌ starved: `fetchSboxSkinsList()` list-endpoint candidates **all 404**, and the HTML-scrape fallback **403s from Vercel** (Cloudflare IP block since ~2026-05-19) → returns `[]` |
| `/api/cron/steam-itemdef-sync` (daily) | Vercel | Backfills store price/description | ⚠️ **only updates existing rows, never creates**; meta endpoint likely needs a Steamworks *publisher* key |
| GitHub Action `enrich-sbox.yml` (daily) | GH runner | Enriches our items from sbox.dev | ⚠️ **closed loop** — iterates our *own* `/api/items`, so it can never add a new item |

**Evidence:**
- Steam Market `search/render` for appid 590830 returns **total_count = 105**; a
  search for `hotdog` returns **0** — the Hotdog Costume is `marketable:true` but
  has **no active Market listings yet**, so Steam's only discovery surface can't
  see it.
- sbox.dev's full catalog (`https://sbox.dev/sitemap-skins.xml`) lists **116**
  skins including `the-hotdog-costume`. Diffing against our 106 items (by slug
  **and** name, honoring `SLUG_OVERRIDES`) yields **8 genuinely-missing real
  items**, all released June 7–8:
  - `the-hotdog-costume` ($49.99 store), `construction-glasses` ($0.99 store),
    `fluffy-slippers` ($0.49 store)
  - `sunglasses-black/gold/purple/red/white` — **drops** (`isDroppableItem:true`,
    `releasePrice:null`, rarity common→exotic)
  - (+2 edge cases excluded by the scope filter: zero-supply `qa-team-t-shirt`,
    old `the-apron-accident`.)

### Why the data is "so clean" on sbox.dev (investigated, for the record)

sbox.dev is an **authenticated relay of Facepunch's first-party economy API**, not
a public source:
- `sbox.game` is a **Blazor _Server_** app (confirmed live: only transport is the
  `/_blazor/negotiate` SignalR WebSocket; no client JSON/REST). The catalog is
  rendered server-side — there is no client-facing catalog API to consume.
- `services.facepunch.com` is the real Facepunch API gateway but 404s every
  skin/economy path to anonymous requests — it is **auth-gated**.
- sbox.dev's payload exposes seller/per-user fields (`isOwned`, `netRevenue`,
  `unitsRefunded`, `uniqueBuyers`, `waitedToBeAccepted`) that only an
  authenticated economy backend returns; they run `api.sbox.dev/v1/auth/login`
  (Steam auth). So they query Facepunch with a logged-in s&box account and
  re-serve cleanly via `api.sbox.dev`.
- The public `Facepunch/sandbox` repo is only the sandbox gamemode; the
  economy/store client is in the closed engine (`Sandbox.Services`).

**Conclusion:** Fully first-party ingestion = the roadmap's "own crawler for
sbox.dev independence" (needs an account token + reverse-engineering protected
endpoints + ToS/ban risk) — a separate, larger project. **sbox.dev's per-skin API
+ sitemap already _is_ that clean first-party data, relayed, and carries every
field we need.** This design uses it; the first-party crawler is recorded as a
future option (see Future Work).

## Goal

New S&box skins (store items **and** drops) appear on sboxskins.gg within ~1 hour
of hitting sbox.dev's catalog, displayed correctly (drops labeled, not shown as
`$0.00`), with new drops auto-announced on Twitter going forward.

## Decisions (locked)

1. **Cadence:** hourly GitHub Action.
2. **Scope:** ingest the full sitemap **except** obvious dev/empty items — skip an
   item only when it is **not droppable AND not an active/permanent store item AND
   `totalSupply` is falsy (0/null)**. (Drops with supply and store items always
   pass; this filters internal/test entries like `qa-team-t-shirt`.)
3. **Drop display:** capture `isDroppableItem` + `droppedUnits` + `rarity`; render
   **"Item Drop"** where store/release price would show, with a rarity badge.
4. **Notifications:** auto-tweet new drops **going forward only**; the initial
   backfill ships with tweeting **off**.

## Architecture

Five components. The pipeline keeps the established split: **all sbox.dev fetches
happen on the GitHub runner IP** (Cloudflare allows it; Vercel is 403'd), and the
site exposes an admin ingest endpoint that writes to the DB.

```
GitHub Action (hourly)                         Vercel (Next.js)
─────────────────────                          ────────────────
discover-from-sbox.mjs                         POST /api/admin/enrich-items
  1. GET sbox.dev/sitemap-skins.xml  ──────►     (ANALYTICS_KEY / CRON_SECRET)
     → full slug catalog                         • match by slug
  2. GET site /api/items                         • else match by name (dedupe)
     → our slugs + names                         • else CREATE row from payload
  3. diff (slug + name + overrides)                (seedItemFromSboxPayload)
     → new slugs                                 • map drop fields + rarity
  4. per new/known slug:                         • compute scarcityScore
     GET api.sbox.dev/v1/skins/<slug>            • return {created:[], updated, ...}
     (+ /supply-sources)              ──────►   
     apply scope filter                         (created[] drives the tweet step)
     POST payloads here
  5. tweet step (recent + newly created)
```

### Component 1 — `scripts/discover-from-sbox.mjs` (GitHub Action)

Supersedes/extends the enrich script (discovery is a superset of enrichment).

- Fetch `https://sbox.dev/sitemap-skins.xml` with a browser User-Agent (the
  runner-IP + browser-UA pattern already used by the enrich path; required —
  sbox.dev Cloudflare 403s Vercel IPs *and* the default `Python-urllib`/no-UA on
  the apex domain). Parse `/skins/<slug>` → full catalog slug set.
- Fetch our catalog from the site's `/api/items` (slugs **and** names).
- Compute the work set:
  - **Known** slugs (by our slug, by `SLUG_OVERRIDES`, or by case-insensitive
    name match) → still fetched + POSTed so enrichment continues as today.
  - **New** slugs → fetched, scope-filtered, POSTed with a `discover` intent so
    the endpoint creates them.
- For each slug: `GET /v1/skins/<slug>` + `GET /v1/skins/<slug>/supply-sources`,
  with the existing polite delay (~120ms) and timeouts.
- **Scope filter** (Decision 2): skip when
  `!isDroppableItem && !isActiveStoreItem && !isPermanentStoreItem && !totalSupply`.
- POST in batches of ≤25 to `/api/admin/enrich-items` (existing `MAX_ITEMS=200`
  cap respected).
- Collect the endpoint's `created[]` slugs across batches for the tweet step.
- Schedule: hourly (`cron: "0 * * * *"`) via `workflow_dispatch`-able workflow.
  Decision pending in plan: fold into `enrich-sbox.yml` (rename to discover) vs a
  sibling workflow. Default: **extend `enrich-sbox.yml`** so there is one sbox.dev
  pipeline, renamed conceptually to "discover + enrich".

### Component 2 — Create-on-missing ingest (`POST /api/admin/enrich-items`)

Today the endpoint only `updateMany({where:{slug}})` and reports `notFound`. Change:

- Factor the create logic out of `seedItemFromSboxDev()` (sync-service.ts) into a
  pure **`seedItemFromSboxPayload(slug, skin, supply?)`** that writes a row from an
  **already-fetched** payload (no server-side sbox.dev fetch — that would 403 from
  Vercel). It reuses the existing helpers: `inferItemType`, the auto-description
  builder, `pickSboxImage`, scarcity, and the **name-match dedupe** (`findFirst`
  by case-insensitive name with `steamMarketId:null`) so a sitemap slug that
  already exists under a different slug (e.g. `black-snapback`↔`snapback-black`)
  refreshes the existing row instead of duplicating.
- `seedItemFromSboxDev()` becomes a thin wrapper: `fetchSboxSkin()` →
  `seedItemFromSboxPayload()` (keeps existing callers working).
- Endpoint flow per item: try update-by-slug → if 0 rows, try the
  payload-seed (which itself does name-match-or-create) → tally into
  `created[]` / `updated` / `notFound` / `skipped`.
- Image handling on create: use `pickSboxImage(skin)`; the per-skin page
  og:image scrape (`fetchSboxSkinImage`) **must not** be called from the endpoint
  (Vercel→sbox.dev 403). If the payload has no image, the GitHub script can
  optionally resolve `iconUrl` (it has one — `cdn.sbox.game/...`) and include it in
  the payload; the endpoint just stores what it's given.
- Cache busting (`invalidatePattern("items:*"|"item:*")`) fires when
  `created+updated > 0` (today: only `updated>0`).

### Component 3 — Drop model + "Item Drop" label

**Migration** (`prisma migrate`) — add to `Item`:
- `isDroppableItem Boolean @default(false)`
- `droppedUnits Int?`
- `rarity String?` — human-readable tier from sbox.dev (`common`/`uncommon`/
  `rare`/`exotic`/…). Note the existing `rarityColor String?` is currently
  Steam-sourced; sbox.dev also returns `rarityColor` — prefer sbox.dev's
  `rarity`+`rarityColor` when present, never overwrite a known value with null.

**Ingest mapping** (enrich-items + `syncSboxData` for parity): map
`isDroppableItem`, `droppedUnits`, `rarity`, and sbox.dev `rarityColor`
(only-when-present, never clobber with null — convention #2).

**Display rule** for the store/release price slot:
- `releasePrice != null && releasePrice > 0` → show the price (`$X.YY`).
- else `isDroppableItem` → show **"Item Drop"** (with rarity badge when `rarity`).
- else → existing fallback ("—"/hidden), unchanged.

Surfaces to update: `components/items/item-detail.tsx`,
`components/items/price-signals.tsx`, `app/store/page.tsx`, the `app/s/[slug]`
share card, and `app/api/export/route.ts` (CSV: emit `Item Drop` / `rarity`
columns rather than `0`). Render rarity as JSX (convention #5), `"use client"`
only where event handlers exist (convention #4).

### Component 4 — New-drop tweet (going forward only)

- The discovery script, after ingest, has `created[]` (truly-new slugs this run).
- Tweet **only** items that are both newly-created **and** have a recent sbox.dev
  `release` (within the last **48h** — tunable constant). This guarantees no
  stale-find tweets, including the initial backfill (all 8 are >48h old).
- Enqueue via the existing Twitter pipeline (`src/lib/twitter/*` + the
  `tweet-dispatcher` cron every 5 min / scheduling). Copy differs for store vs
  drop:
  - store: `New S&box drop: {name} 🆕 — ${price}{, leaves store {date}}. {url}`
  - drop: `New S&box drop: {name} 🆕 — in-game drop ({rarity}), {droppedUnits} dropped. {url}`
- **Dedupe**: never tweet the same item twice (track tweeted item ids /
  reuse the dispatcher's existing dedupe). Backfill path passes a `noTweet`/
  `skipTweet` flag explicitly.

### Component 5 — Immediate backfill (one-shot)

After deploy, run the discovery once (`workflow_dispatch`, or a local run of the
script against prod with the admin key) with tweeting suppressed. Expected result:
the 8 missing items created (Hotdog, Construction Glasses, Fluffy Slippers, 5
Sunglasses), drops labeled correctly, no tweets. Verify via `/api/items` count
(106 → ~114) and the item pages.

## Data flow summary

1. Hourly Action → sitemap → diff → per-skin fetch → scope filter → POST.
2. Endpoint → update-or-name-match-or-create → map fields incl. drop/rarity →
   scarcity → cache bust → return `created[]`.
3. Action → for recent+created items → enqueue tweet.
4. Steam Market sync (unchanged) remains the secondary path: when a discovered
   item later gets Market listings, `upsertItem`'s name-match link-up fills in
   `steamMarketId`, price, and volume on the existing row.

## Error handling

- sbox.dev fetch failure for a slug → skip that slug, keep going (per-item
  isolation, like the enrich script today). Never null existing rows (convention
  #2): create path only writes new rows; known-item updates already use
  only-when-present guards.
- Endpoint auth via `guardAdminRoute(["analytics","cron"])` (unchanged).
- Sitemap fetch failure → Action logs and exits non-zero (so GH surfaces it); no
  partial-catalog assumptions.
- Tweet enqueue failure → logged, non-fatal (item is already on the site).
- Idempotency: re-running discovery is a no-op for existing items (update path);
  `created[]` only reflects genuine inserts, so tweets don't repeat.

## Testing

- **Unit:** `seedItemFromSboxPayload` (create vs name-match vs update branches);
  scope-filter predicate; drop-display rule (`releasePrice` vs `isDroppableItem`
  vs neither); tweet-eligibility (recent+created) incl. the 48h boundary.
- **Ingest endpoint:** POST a known slug (updates), a new store slug (creates),
  a new drop slug (creates + drop fields), a name-collision slug (no dupe),
  a junk/zero-supply item (filtered by the script, but endpoint also tolerant).
- **Script (integration, against prod read APIs):** sitemap parse count,
  diff correctness vs `SLUG_OVERRIDES`, batch POST shape. Dry-run mode that logs
  the would-create set without POSTing.
- **Manual verification:** backfill run brings the 8 items in, drops show "Item
  Drop" + rarity, store items show price, no tweets fired for the backfill.

## Conventions / constraints (AGENTS.md)

- #1 Anonymous from Vercel; the **browser-UA is only used from the GH runner** to
  sbox.dev (established pattern). The Vercel endpoint never fetches sbox.dev.
- #2 Cache stale, never null — create-only writes + only-when-present updates.
- #3 No JSON endpoints exposing derived metrics — ingest is admin-gated write-only;
  no new public JSON read surface.
- #4/#5 client wrappers for handlers; render markdown/rarity as JSX.
- Do **not** "fix" by moving sbox.dev fetches back into the Vercel cron.

## Future work (out of scope here)

- **First-party Facepunch crawler** for full sbox.dev independence: authenticated
  `Sandbox.Services` economy queries with a logged-in s&box account token.
  Larger effort, ToS/ban risk — track separately.
- Steam **itemdef archive** as a discovery source *iff* a publisher key becomes
  available (the cron already fetches the archive; it would need create-on-missing
  too).
- Rarity-tier filtering/sorting UI once `rarity` is populated catalog-wide.

## Risks

- **Sitemap freshness:** depends on sbox.dev updating `sitemap-skins.xml` promptly
  after a drop. They're a live tracker, so expected within minutes–hours; the
  Hotdog (released Jun 7) was present by Jun 13. Mitigation: the Steam Market sync
  (15–30 min) still catches items once they get Market listings.
- **sbox.dev dependency:** single upstream. Acceptable — it already is our
  enrichment source; the first-party crawler is the long-term hedge.
- **sbox.dev slug vs our slug drift:** handled by `SLUG_OVERRIDES` + name-match
  dedupe; new mismatches surface as a (harmless) duplicate to reconcile, same as
  today.
