// Discover + enrich S&box skins from sbox.dev.
//
// WHY this runs in GitHub Actions and not the Vercel cron: sbox.dev sits behind
// Cloudflare, which 403s Vercel's datacenter IPs (and a bare Node UA on the
// apex). A GitHub-hosted runner's IP + a browser UA is allowed, so we fetch
// here and hand the data to the site.
//
// What it does (supersedes the old enrich-only script):
//   1. GET sbox.dev/sitemap-skins.xml  → the full catalog of skin slugs.
//   2. GET <site>/api/items            → our existing slugs + names.
//   3. For every sitemap slug, fetch the per-skin sbox.dev payload and POST it
//      to /api/admin/enrich-items, which UPDATES known rows and CREATES rows we
//      don't have yet (new store items + drops). New items are scope-filtered
//      so internal/empty entries (zero supply, not in store, not a drop) are
//      skipped.
//
// Flags / env:
//   --dry-run            log the would-create set, POST nothing (no key needed)
//   SBOX_ANNOUNCE=false  suppress new-drop tweets (used for the initial backfill)
//   SBOXSKINS_ADMIN_KEY  required unless --dry-run
//
// No dependencies — uses Node 18+ global fetch.

import { pathToFileURL } from "node:url";

const SITE = process.env.SITE_URL || "https://sboxskins.gg";
const KEY = process.env.SBOXSKINS_ADMIN_KEY;
const DRY_RUN = process.argv.includes("--dry-run");
const ANNOUNCE = process.env.SBOX_ANNOUNCE !== "false";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Our slug → sbox.dev slug, for the few items whose Steam-derived slug differs
// from sbox.dev's. ("Snapback Black" is "black-snapback" on sbox.dev.)
const SLUG_OVERRIDES = {
  "snapback-black": "black-snapback",
  "sausage-survivors-2-tshirt": "ss2-tshirt",
};
// sbox.dev slug → our slug (inverse), so we can map a sitemap slug back to the
// row we already have under a different slug and avoid creating a duplicate.
const SBOX_TO_OURS = Object.fromEntries(
  Object.entries(SLUG_OVERRIDES).map(([ours, sbox]) => [sbox, ours]),
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Scope filter for items we'd CREATE. Skip internal/empty entries
 * (e.g. "qa-team-t-shirt": zero supply, not in store, not a drop). Real
 * drops (supply or droppable) and store items always pass.
 * Exported for scripts/checks/scope-filter.check.mjs.
 */
export function passesScopeFilter(skin) {
  return !!(
    skin.isDroppableItem ||
    skin.isActiveStoreItem ||
    skin.isPermanentStoreItem ||
    skin.totalSupply
  );
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}

async function getSitemapSlugs() {
  const xml = await fetchText("https://sbox.dev/sitemap-skins.xml");
  const slugs = new Set();
  const re = /\/skins\/([a-z0-9][a-z0-9-]*)/gi;
  let m;
  while ((m = re.exec(xml)) !== null) slugs.add(m[1].toLowerCase());
  return [...slugs];
}

async function getOurItems() {
  const slugs = new Set();
  const names = new Set();
  let page = 1;
  let totalPages = 1;
  do {
    const res = await fetch(`${SITE}/api/items?page=${page}&per_page=100`);
    if (!res.ok) throw new Error(`/api/items page ${page} -> ${res.status}`);
    const json = await res.json();
    for (const it of json.items || []) {
      if (it.slug) slugs.add(it.slug.toLowerCase());
      if (it.name) names.add(it.name.trim().toLowerCase());
    }
    totalPages = json.totalPages || 1;
    page += 1;
  } while (page <= totalPages);
  return { slugs, names };
}

async function fetchSbox(sboxSlug) {
  try {
    const [skinRes, supplyRes] = await Promise.all([
      fetch(`https://api.sbox.dev/v1/skins/${sboxSlug}`, { headers: { "User-Agent": UA } }),
      fetch(`https://api.sbox.dev/v1/skins/${sboxSlug}/supply-sources`, { headers: { "User-Agent": UA } }),
    ]);
    const skin = skinRes.ok ? (await skinRes.json())?.data : null;
    const supply = supplyRes.ok ? (await supplyRes.json())?.data : null;
    return skin ? { skin, supply } : null;
  } catch (err) {
    console.warn(`  ${sboxSlug}: sbox fetch failed (${err.message})`);
    return null;
  }
}

// Map a sbox.dev per-skin payload to the enrich-items `skin` shape. Includes
// `name` + `iconUrl` + drop fields so the endpoint can CREATE a row (not just
// update one).
function toPayloadSkin(s) {
  return {
    name: s.name,
    totalSupply: s.totalSupply ?? null,
    uniqueOwners: s.uniqueOwners ?? null,
    supplyOnMarket: s.supplyOnMarket ?? null,
    soldPast24H: s.soldPast24H ?? null,
    boughtInTheLast24H: s.boughtInTheLast24H ?? null,
    sales: s.sales ?? null,
    price: s.price ?? null,
    priceChange24hPercent: s.priceChange24hPercent ?? null,
    priceChange6h: s.priceChange6h ?? null,
    priceChange6hPercent: s.priceChange6hPercent ?? null,
    isActiveStoreItem: s.isActiveStoreItem ?? null,
    isPermanentStoreItem: s.isPermanentStoreItem ?? null,
    leavingStoreAt: s.leavingStoreAt ?? null,
    release: s.release ?? null,
    releasePrice: s.releasePrice ?? null,
    itemDisplayName: s.itemDisplayName ?? null,
    category: s.category ?? null,
    itemType: s.itemType ?? null,
    workshopId: s.workshopId ?? null,
    itemDefinitionId: s.itemDefinitionId ?? null,
    iconBackgroundColor: s.iconBackgroundColor ?? null,
    isDroppableItem: s.isDroppableItem ?? false,
    droppedUnits: s.droppedUnits ?? null,
    rarity: s.rarity ?? null,
    rarityColor: s.rarityColor ?? null,
    iconUrl: s.iconUrl ?? null,
  };
}

async function postBatch(batch) {
  const res = await fetch(`${SITE}/api/admin/enrich-items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify({ items: batch, announce: ANNOUNCE }),
  });
  if (!res.ok) {
    console.error(`  POST batch -> ${res.status}: ${await res.text()}`);
    return { created: [], updated: 0, notFound: [] };
  }
  return res.json();
}

async function main() {
  if (!KEY && !DRY_RUN) {
    console.error("SBOXSKINS_ADMIN_KEY env var is required (or pass --dry-run)");
    process.exit(1);
  }

  const [sitemap, ours] = await Promise.all([getSitemapSlugs(), getOurItems()]);
  console.log(
    `sbox.dev sitemap: ${sitemap.length} skins · our catalog: ${ours.slugs.size} items` +
      (DRY_RUN ? " · DRY RUN (no POST)" : ` · announce=${ANNOUNCE}`),
  );

  const payloads = [];
  const wouldCreate = [];
  let fetched = 0;
  let miss = 0;
  let filtered = 0;

  for (const sboxSlug of sitemap) {
    const ourSlug = SBOX_TO_OURS[sboxSlug] || sboxSlug;
    const knownBySlug = ours.slugs.has(ourSlug) || ours.slugs.has(sboxSlug);

    const data = await fetchSbox(sboxSlug);
    await sleep(120); // be polite to sbox.dev
    if (!data) {
      miss += 1;
      continue;
    }
    fetched += 1;
    const { skin, supply } = data;
    const knownByName = skin.name && ours.names.has(skin.name.trim().toLowerCase());
    const isNew = !knownBySlug && !knownByName;

    // Only the scope filter gates NEW creations; known items always enrich.
    if (isNew && !passesScopeFilter(skin)) {
      filtered += 1;
      continue;
    }
    if (isNew) wouldCreate.push(`${skin.name} [${sboxSlug}]`);

    payloads.push({ slug: ourSlug, skin: toPayloadSkin(skin), supply });
  }

  console.log(
    `Fetched ${fetched} (${miss} missing on sbox.dev, ${filtered} filtered as dev/empty); ${wouldCreate.length} would be NEW`,
  );
  if (wouldCreate.length) {
    console.log("  new:");
    for (const w of wouldCreate) console.log(`    + ${w}`);
  }

  if (DRY_RUN) {
    console.log("DRY RUN — nothing posted.");
    return;
  }

  let created = [];
  let updated = 0;
  const notFound = [];
  for (let i = 0; i < payloads.length; i += 25) {
    const r = await postBatch(payloads.slice(i, i + 25));
    if (Array.isArray(r.created)) created = created.concat(r.created);
    updated += r.updated || 0;
    if (Array.isArray(r.notFound)) notFound.push(...r.notFound);
  }
  console.log(
    `Done: created ${created.length}, enriched ${updated}, ${notFound.length} not matched.`,
  );
  if (created.length) console.log(`  created: ${created.join(", ")}`);
}

// Only run when invoked directly (so `import { passesScopeFilter }` from the
// check doesn't trigger a full run).
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
