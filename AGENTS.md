<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Codebase knowledge graph (graphify) — CHECK THIS FIRST

This repo ships a prebuilt knowledge graph of itself in `graphify-out/`. **Before grepping/reading broadly to understand how something works, query the graph** — it already maps the call/data relationships across all ~270 source files.

- **Ask a question:** `/graphify query "how does the tweet system wire together"` (answers from `graphify-out/graph.json`, no rebuild).
- **Trace a path / explain a node:** `/graphify path "generateTweet" "Twitter Posting API"` · `/graphify explain "guardAdminRoute"`.
- **Read the map:** `graphify-out/GRAPH_REPORT.md` (god nodes, communities, surprising connections). Open `graphify-out/graph.html` in a browser for the interactive view.
- **After a significant change** (new feature, refactor, files added/moved), refresh it: `/graphify . --update` (incremental — only re-extracts changed files), then commit the updated `graphify-out/`.

God nodes (core abstractions): `guardAdminRoute()`, `formatPrice()`, `Button`, `generateTweet()`, `getCurrentUser()`. Communities of note: Twitter News Sourcing, Twitter Posting API, Tweet Admin Dashboard, Skin Discovery & Sync, Item Enrichment & Scarcity, Anthropic Content Generation.

## Project summary (sboxskins.gg)

CoinMarketCap-style tracker for S&box Steam cosmetics. Live on Vercel at sboxskins.gg. Top-3 Google ranking. Actively competing against sbox.dev (a third-party tracker whose `.dev` domain makes it look official).

**Stack:** Next.js 16 (App Router), Prisma 7 (with `@prisma/adapter-pg`), React 19, Tailwind, Upstash Redis (optional), Neon Postgres, Vercel cron, Steam OAuth, Twitter API v2, Anthropic API (key set, not yet wired).

**Data pipeline:** Steam Market APIs (prices, orders, inventory) + sbox.dev API (supply, owners, top holders, store rotation, release dates). All outbound requests to third parties are anonymous — **no custom User-Agent ever** so we blend into generic Vercel traffic and can't be individually banned.

> **sbox.dev enrichment runs in GitHub Actions, NOT the Vercel cron.** api.sbox.dev sits behind Cloudflare, which 403s Vercel's datacenter IPs (confirmed 2026-06-06: 403 from Vercel, 200 from a residential / GitHub-runner IP — it's an IP/ASN block, a browser User-Agent does NOT help). So `syncSboxData` silently enriched nothing from ~2026-05-19. The working path: `.github/workflows/enrich-sbox.yml` (workflow `discover-enrich-sbox`, **hourly**) → `scripts/discover-from-sbox.mjs` reads `sbox.dev/sitemap-skins.xml` (the full skin catalog) from a runner IP Cloudflare allows + a browser UA, fetches each per-skin payload, and POSTs to `POST /api/admin/enrich-items`. That endpoint **updates known rows AND creates ones we don't have yet** (new store items + drops) via `seedItemFromSboxPayload` (name-match dedupe first), applies the same field-mapping + `computeScarcityScore`, and enqueues a `ScheduledTweet` for genuinely-new drops released within 48h (`announce:false` suppresses it — used for backfills). New items are scope-filtered (skip zero-supply non-store non-drop entries). Needs repo secret `SBOXSKINS_ADMIN_KEY` = the site's `ANALYTICS_KEY`. The Vercel-side `syncSboxData`/`discoverSboxSkins` fetches remain (harmless, just 403 from Vercel) — don't rely on them; don't "fix" discovery/enrichment by moving it back into the Vercel cron. Drop items (sbox.dev `isDroppableItem`) have no store price → the UI shows "Item Drop" (`src/lib/items/drop-label.ts`).

## Critical project conventions

1. **Don't identify ourselves in outbound fetches.** No `User-Agent: sboxskins.gg/1.0`. Blend into Vercel traffic — Lou's explicit preference. Targeted ban > blanket ban.
2. **Cache stale data, never null it.** If sbox.dev times out on an item, keep the existing DB row. Stale > "N/A".
3. **No JSON endpoints for our derived metrics.** CSV export only. JSON API would let competitors harvest scarcity score trivially.
4. **Server components can't pass event handlers down.** Interactive widgets (onChange, onClick) need `"use client"` wrappers.
5. **Render markdown as JSX**, not via injected HTML — the repo's pre-commit hooks will reject the innerHTML approach.
6. **React `cache()` around cross-boundary helpers** when `generateMetadata` and the page component both call the same data function — Next.js doesn't dedupe automatically.

## Key env vars

`DATABASE_URL`, `CRON_SECRET`, `ANALYTICS_KEY` (admin auth), Upstash Redis vars (optional), Twitter API creds, `ANTHROPIC_API_KEY` (set in Vercel, not yet consumed in code).

## Pending work

1. Wire up `ANTHROPIC_API_KEY` in `src/lib/blog/weekly-report.ts` — replace the flat `buildMarkdown()` template with a Sonnet 4.6 API call for the narrative paragraphs. Keep the stat sections generator-produced. Fall back to the existing template if the env var is missing. Tone: casual / Wendy's-Twitter, same vibe as the tweet generators in `src/lib/twitter/content.ts`.
2. Trigger `POST /api/admin/backfill-cap` in prod to fill historical market cap data.
3. Reddit outreach (see `/api/export` for CSV, OG images on major pages).
4. Long-term: own Steam inventory crawler for full sbox.dev independence.

## Bug-review findings we intentionally punted

- `pricePointsCreated` counter inflation — log metric only
- Holders page full-table scan — 80 items, scan is microseconds
- Markdown renderer list-flushing edge case — our generator always emits blank lines
