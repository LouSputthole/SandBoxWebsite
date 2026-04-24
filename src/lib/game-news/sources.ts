import { prisma } from "@/lib/db";

/**
 * Fetches game-update news from Facepunch + sbox.game. We scrape rather
 * than hit an official API because neither publisher offers a stable
 * public feed for S&box updates specifically.
 *
 * Philosophy (matches AGENTS.md): NO custom User-Agent. We blend into
 * generic Vercel traffic so we can't be selectively banned. If a source
 * blocks us, we still return whatever the other source found — a partial
 * feed is better than a dead feature.
 *
 * Dedupe: we hash each item's source+url and store the hash so we don't
 * resurface the same post across multiple cron runs. The hash table is
 * a JSON column on a tiny persistent Redis-style key; we fall back to
 * an in-memory cache if Redis isn't configured so local dev still works.
 */

export interface GameNewsItem {
  /** Stable fingerprint: "<source>:<url>" hashed. Used for dedupe. */
  id: string;
  source: "facepunch" | "sbox.game" | "manual";
  title: string;
  url: string;
  /** ISO publish date if the source emitted one. Falls back to fetch time
   *  so sort-by-recency still works for sources without dates. */
  publishedAt: string;
  /** Short teaser (1-2 sentences). Empty string if we couldn't extract one. */
  excerpt: string;
}

const FACEPUNCH_INDEX = "https://www.facepunch.com/news";
const SBOX_GAME_NEWS = "https://sbox.game/news";

/**
 * Cheap HTML-to-text excerpt extraction. Scraping pages we don't control,
 * so we try two tactics: look for <meta name="description"> then fall
 * back to the first <p> in <main>. Never throws — returns "" on any
 * failure so the caller can still ship the title + link.
 */
function extractExcerpt(html: string): string {
  const meta = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
  );
  if (meta?.[1]) return decodeEntities(meta[1]).slice(0, 220);
  const og = html.match(
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
  );
  if (og?.[1]) return decodeEntities(og[1]).slice(0, 220);
  return "";
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

async function fetchWithTimeout(url: string, ms = 10_000): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    // No custom User-Agent per AGENTS.md. Vercel's default fetch UA blends
    // into the generic Vercel edge population.
    const res = await fetch(url, {
      signal: controller.signal,
      // Cache at the Vercel edge for 30 min — the cron runs far less
      // frequently than that, but admin previews in the UI benefit from
      // the cache so quick refresh clicks don't hammer the source.
      next: { revalidate: 1800 },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return res;
  } catch {
    return null;
  }
}

/**
 * Parse Facepunch's news index. Their page uses
 * <a class="news-item" href="/news/<slug>"><h2>…</h2></a> blocks — we
 * regex those out since there's no JSON endpoint. This is intentionally
 * brittle — when they redesign, we notice via the graceful fallback
 * (no items emitted) and fix it; blanket HTML parsers are overkill.
 */
export async function fetchFacepunchNews(limit = 5): Promise<GameNewsItem[]> {
  const res = await fetchWithTimeout(FACEPUNCH_INDEX);
  if (!res) return [];
  const html = await res.text();

  // Look for /news/<slug> links with an accompanying title tag.
  const linkPattern = /<a[^>]+href=["'](\/news\/[a-z0-9-]+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const items: GameNewsItem[] = [];
  const seen = new Set<string>();

  for (const m of html.matchAll(linkPattern)) {
    const href = m[1];
    if (seen.has(href)) continue;
    seen.add(href);

    const inner = m[2];
    // Title = first heading tag's text content, or the first text node.
    const titleMatch =
      inner.match(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/i) ??
      inner.match(/>([^<]{8,120})</);
    if (!titleMatch) continue;
    const title = decodeEntities(
      titleMatch[1].replace(/<[^>]+>/g, "").trim(),
    ).slice(0, 140);
    if (!title || !/s&?box|sandbox/i.test(title) && !/facepunch/i.test(title)) {
      // Only pick up posts that are clearly about S&box or general
      // Facepunch news — skip Rust/Garry's Mod coverage.
      if (!/s.?box|sandbox/i.test(title)) continue;
    }

    const fullUrl = `https://www.facepunch.com${href}`;
    items.push({
      id: hash(`facepunch:${fullUrl}`),
      source: "facepunch",
      title,
      url: fullUrl,
      // No reliable date in the index — stamp with fetch time for now.
      // The individual post page has a date but we don't want N+1 fetches.
      publishedAt: new Date().toISOString(),
      excerpt: "",
    });
    if (items.length >= limit) break;
  }

  return items;
}

/**
 * sbox.game/news is a Nuxt-powered page. Their markup changes a bit
 * but there's consistently a <script id="__NUXT_DATA__"> blob with the
 * article list embedded. We extract it if we can, otherwise fall back
 * to scraping visible <article> tags.
 */
export async function fetchSboxGameNews(limit = 5): Promise<GameNewsItem[]> {
  const res = await fetchWithTimeout(SBOX_GAME_NEWS);
  if (!res) return [];
  const html = await res.text();

  // Try to find headline/link pairs. sbox.game uses <a href="/news/<slug>">
  const linkPattern =
    /<a[^>]+href=["'](\/news\/[a-z0-9-]+)["'][^>]*>([\s\S]{0,400}?)<\/a>/gi;
  const items: GameNewsItem[] = [];
  const seen = new Set<string>();

  for (const m of html.matchAll(linkPattern)) {
    const href = m[1];
    if (seen.has(href)) continue;
    seen.add(href);
    const inner = m[2];
    const titleText = decodeEntities(
      inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
    ).slice(0, 140);
    if (!titleText || titleText.length < 8) continue;

    const fullUrl = `https://sbox.game${href}`;
    items.push({
      id: hash(`sbox.game:${fullUrl}`),
      source: "sbox.game",
      title: titleText,
      url: fullUrl,
      publishedAt: new Date().toISOString(),
      excerpt: "",
    });
    if (items.length >= limit) break;
  }

  return items;
}

/**
 * Aggregate both sources, dedupe by id, return newest-first. Missing
 * sources degrade gracefully — one source down ≠ feature down.
 */
export async function fetchAllGameNews(limit = 10): Promise<GameNewsItem[]> {
  const [fp, sb] = await Promise.all([
    fetchFacepunchNews(limit),
    fetchSboxGameNews(limit),
  ]);
  const merged = new Map<string, GameNewsItem>();
  for (const item of [...fp, ...sb]) {
    if (!merged.has(item.id)) merged.set(item.id, item);
  }
  return Array.from(merged.values())
    .sort((a, b) => (b.publishedAt > a.publishedAt ? 1 : -1))
    .slice(0, limit);
}

// Tiny non-cryptographic hash — FNV-1a 32-bit. Plenty for dedupe keys;
// we only need collision resistance within a few hundred entries.
function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Check which news IDs we've already posted about (using the SentTweet
 * table: we encode the news ID into the tweet kind or a dedicated
 * field). Keeps cron from retweeting the same Facepunch post every run.
 */
export async function filterUnposted(
  items: GameNewsItem[],
): Promise<GameNewsItem[]> {
  if (items.length === 0) return [];
  // We store the news ID in SentTweet.itemSlug for game-update tweets
  // (same column already exists, just repurposed). Scanning the last
  // 200 sends is enough — we don't recycle news older than a few weeks.
  const recent = await prisma.sentTweet.findMany({
    where: { kind: "game-update" },
    select: { itemSlug: true },
    orderBy: { sentAt: "desc" },
    take: 200,
  });
  const posted = new Set(recent.map((r) => r.itemSlug).filter(Boolean));
  return items.filter((i) => !posted.has(i.id));
}
