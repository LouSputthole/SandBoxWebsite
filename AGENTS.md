<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Project summary (sboxskins.gg)

CoinMarketCap-style tracker for S&box Steam cosmetics. Live on Vercel at sboxskins.gg. Top-3 Google ranking. Actively competing against sbox.dev (a third-party tracker whose `.dev` domain makes it look official).

**Stack:** Next.js 16 (App Router), Prisma 7 (with `@prisma/adapter-pg`), React 19, Tailwind, Upstash Redis (optional), Neon Postgres, Vercel cron, Steam OAuth, Twitter API v2, Anthropic API (key set, not yet wired).

**Data pipeline:** Steam Market APIs (prices, orders, inventory) + sbox.dev API (supply, owners, top holders, store rotation, release dates). All outbound requests to third parties are anonymous — **no custom User-Agent ever** so we blend into generic Vercel traffic and can't be individually banned.

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
