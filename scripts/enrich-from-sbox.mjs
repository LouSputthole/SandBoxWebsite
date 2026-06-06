// Fetches sbox.dev enrichment (supply, owners, category, store status, top
// holders, release info) and POSTs it to /api/admin/enrich-items.
//
// WHY this runs in GitHub Actions and not the Vercel cron: api.sbox.dev sits
// behind Cloudflare, which 403s Vercel's datacenter IPs (confirmed 2026-06-06:
// 403 from Vercel, 200 from a residential / GitHub-runner IP). A GitHub-hosted
// runner's IP is allowed, so we fetch here and hand the data to the site.
//
// No dependencies — uses Node 18+ global fetch. See enrich-sbox.yml.

const SITE = process.env.SITE_URL || "https://sboxskins.gg";
const KEY = process.env.SBOXSKINS_ADMIN_KEY;
if (!KEY) {
  console.error("SBOXSKINS_ADMIN_KEY env var is required");
  process.exit(1);
}

// Our slug → sbox.dev slug, for the few items whose Steam-derived slug differs
// from sbox.dev's. ("Snapback Black" is "black-snapback" on sbox.dev.)
const SLUG_OVERRIDES = {
  "snapback-black": "black-snapback",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getAllSlugs() {
  const slugs = [];
  let page = 1;
  let totalPages = 1;
  do {
    const res = await fetch(`${SITE}/api/items?page=${page}&per_page=100`);
    if (!res.ok) throw new Error(`/api/items page ${page} -> ${res.status}`);
    const json = await res.json();
    for (const it of json.items || []) if (it.slug) slugs.push(it.slug);
    totalPages = json.totalPages || 1;
    page += 1;
  } while (page <= totalPages);
  return slugs;
}

async function fetchSbox(ourSlug) {
  const sboxSlug = SLUG_OVERRIDES[ourSlug] || ourSlug;
  try {
    const [skinRes, supplyRes] = await Promise.all([
      fetch(`https://api.sbox.dev/v1/skins/${sboxSlug}`),
      fetch(`https://api.sbox.dev/v1/skins/${sboxSlug}/supply-sources`),
    ]);
    const skin = skinRes.ok ? (await skinRes.json())?.data : null;
    const supply = supplyRes.ok ? (await supplyRes.json())?.data : null;
    if (!skin) return null;
    return { slug: ourSlug, skin, supply };
  } catch (err) {
    console.warn(`  ${ourSlug}: sbox fetch failed (${err.message})`);
    return null;
  }
}

async function postBatch(batch) {
  const res = await fetch(`${SITE}/api/admin/enrich-items`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${KEY}`,
    },
    body: JSON.stringify({ items: batch }),
  });
  if (!res.ok) {
    console.error(`  POST batch -> ${res.status}: ${await res.text()}`);
    return { updated: 0, notFound: [] };
  }
  return res.json();
}

async function main() {
  const slugs = await getAllSlugs();
  console.log(`Got ${slugs.length} item slugs from ${SITE}`);

  const payloads = [];
  let miss = 0;
  for (const slug of slugs) {
    const p = await fetchSbox(slug);
    if (p) payloads.push(p);
    else miss += 1;
    await sleep(120); // be polite to sbox.dev
  }
  console.log(
    `Fetched sbox.dev data for ${payloads.length}/${slugs.length} (${miss} not on sbox.dev)`,
  );

  let updated = 0;
  const notFound = [];
  for (let i = 0; i < payloads.length; i += 25) {
    const r = await postBatch(payloads.slice(i, i + 25));
    updated += r.updated || 0;
    if (Array.isArray(r.notFound)) notFound.push(...r.notFound);
  }
  console.log(
    `Done: enriched ${updated} items; ${notFound.length} posted slugs not matched in DB`,
  );
  if (notFound.length) console.log(`  notFound: ${notFound.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
