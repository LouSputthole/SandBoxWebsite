import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createHash } from "crypto";

/**
 * Bot UA patterns — tested against the incoming User-Agent. If any match
 * AND the request isn't from a real browser Chrome/Safari/etc., we skip
 * the DB write. The tracker is client-side JS so "traditional" crawlers
 * (Googlebot, Bingbot classic) never hit us — but AI crawlers and
 * rendering bots (Perplexity, ChatGPT, Claude-Web, Googlebot with JS
 * rendering) DO execute JS and would otherwise inflate our counts.
 */
const BOT_UA_PATTERNS: readonly RegExp[] = [
  /\bbot\b/i, // generic "bot" catches most self-identifying crawlers
  /crawler/i,
  /spider/i,
  /scraper/i,
  /headlesschrome/i,
  /puppeteer/i,
  /playwright/i,
  /phantomjs/i,
  /slurp/i,
  /yandex/i,
  /baiduspider/i,
  /duckduckbot/i,
  /googlebot/i,
  /bingbot/i,
  /applebot/i,
  /perplexity/i,
  /chatgpt/i,
  /gptbot/i,
  /claude-web/i,
  /anthropic/i,
  /meta-externalagent/i,
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /discordbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /vercel-screenshot/i,
  /lighthouse/i,
  /pagespeed/i,
];

function isBot(ua: string): boolean {
  if (!ua) return true; // empty UA is almost certainly a bot
  return BOT_UA_PATTERNS.some((re) => re.test(ua));
}

/**
 * Collapse a raw referrer hostname into a friendly source label. Without
 * this, Google traffic splits across google.com, www.google.com,
 * google.co.uk, l.google.com, encrypted.google.com, etc. — each showing
 * as a separate row in the top-referrers table. Makes our "Google"
 * number comparable to what Google Search Console reports as a single
 * bucket. Only collapses well-known sources; unknown hosts pass through
 * unchanged so we don't lose granularity on niche referrers.
 */
function normalizeReferrer(hostname: string): string {
  const h = hostname.toLowerCase().replace(/^www\./, "");
  if (h === "google" || h.endsWith(".google.com") || /^google\.[a-z.]+$/.test(h)) {
    return "google";
  }
  if (h === "bing.com" || h.endsWith(".bing.com")) return "bing";
  if (h === "duckduckgo.com" || h.endsWith(".duckduckgo.com")) return "duckduckgo";
  if (h === "yahoo.com" || h.endsWith(".yahoo.com") || /search\.yahoo/.test(h)) {
    return "yahoo";
  }
  if (h === "yandex.com" || h.endsWith(".yandex.com") || h === "yandex.ru") {
    return "yandex";
  }
  if (h === "t.co" || h === "x.com" || h === "twitter.com" || h.endsWith(".x.com")) {
    return "twitter";
  }
  if (
    h === "facebook.com" ||
    h.endsWith(".facebook.com") ||
    h === "l.facebook.com" ||
    h === "m.facebook.com" ||
    h === "lm.facebook.com"
  ) {
    return "facebook";
  }
  if (h === "reddit.com" || h.endsWith(".reddit.com") || h === "out.reddit.com") {
    return "reddit";
  }
  if (h === "youtube.com" || h.endsWith(".youtube.com") || h === "youtu.be") {
    return "youtube";
  }
  if (h === "discord.com" || h.endsWith(".discord.com") || h === "discord.gg") {
    return "discord";
  }
  if (
    h === "chatgpt.com" ||
    h === "openai.com" ||
    h.endsWith(".openai.com") ||
    h === "claude.ai" ||
    h === "perplexity.ai" ||
    h === "gemini.google.com"
  ) {
    return "ai-chat";
  }
  // Not a known bucket — return as-is so niche traffic stays visible.
  return h;
}

/**
 * POST /api/analytics — Record a page view.
 * Body: { path: string, referrer?: string }
 *
 * Extracts device/browser/OS from User-Agent.
 * Creates an anonymous session ID from hashed IP + UA (no cookies needed).
 * Skips bot traffic (see BOT_UA_PATTERNS above) so owned analytics aren't
 * inflated by AI crawlers.
 */
export async function POST(request: NextRequest) {
  try {
    const { path, referrer } = (await request.json()) as {
      path?: string;
      referrer?: string;
    };

    if (!path) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }

    const ua = request.headers.get("user-agent") ?? "";

    // Drop bot traffic early — return OK so the client doesn't retry.
    if (isBot(ua)) {
      return NextResponse.json({ ok: true, skipped: "bot" });
    }

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      request.headers.get("x-real-ip") ??
      "unknown";

    // Vercel geo headers
    const country = request.headers.get("x-vercel-ip-country") ?? null;
    const city = request.headers.get("x-vercel-ip-city") ?? null;

    // Parse device/browser/OS from UA
    const device = parseDevice(ua);
    const browser = parseBrowser(ua);
    const os = parseOS(ua);

    // Anonymous session: hash of IP + UA + date (rotates daily)
    const today = new Date().toISOString().slice(0, 10);
    const sessionId = createHash("sha256")
      .update(`${ip}:${ua}:${today}`)
      .digest("hex")
      .slice(0, 16);

    // Clean referrer — strip the current domain, then normalize to a
    // friendly source label so "google.com" / "google.co.uk" / "l.google.com"
    // all roll up to "google" (matches how GSC reports the bucket).
    // Also capture the pathname separately so we can see WHICH specific
    // external pages are sending traffic (e.g. which steamcommunity.com
    // group or profile links to us).
    let cleanReferrer = referrer ?? null;
    let cleanReferrerPath: string | null = null;
    if (cleanReferrer) {
      try {
        const refUrl = new URL(cleanReferrer);
        if (
          refUrl.hostname === "sboxskins.gg" ||
          refUrl.hostname.endsWith(".vercel.app")
        ) {
          cleanReferrer = null; // Internal navigation, not a real referrer
        } else {
          cleanReferrer = normalizeReferrer(refUrl.hostname);
          // Keep pathname (no query/hash — those often carry tokens/PII).
          // Skip the bare "/" case since it adds no information.
          if (refUrl.pathname && refUrl.pathname !== "/") {
            cleanReferrerPath = refUrl.pathname.slice(0, 500);
          }
        }
      } catch {
        cleanReferrer = null;
      }
    }

    // Fire and forget — don't block the response on DB write
    prisma.pageView
      .create({
        data: {
          path,
          referrer: cleanReferrer,
          referrerPath: cleanReferrerPath,
          userAgent: ua.slice(0, 500),
          country,
          city,
          device,
          browser,
          os,
          sessionId,
        },
      })
      .catch((err) => console.error("[analytics] Failed to record:", err));

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true }); // Never fail the client
  }
}

function parseDevice(ua: string): string {
  if (/tablet|ipad/i.test(ua)) return "tablet";
  if (/mobile|android|iphone|ipod/i.test(ua)) return "mobile";
  return "desktop";
}

function parseBrowser(ua: string): string {
  if (/edg\//i.test(ua)) return "Edge";
  if (/chrome|crios/i.test(ua)) return "Chrome";
  if (/firefox|fxios/i.test(ua)) return "Firefox";
  if (/safari/i.test(ua) && !/chrome/i.test(ua)) return "Safari";
  if (/opera|opr/i.test(ua)) return "Opera";
  return "Other";
}

function parseOS(ua: string): string {
  if (/windows/i.test(ua)) return "Windows";
  if (/macintosh|mac os/i.test(ua)) return "macOS";
  if (/linux/i.test(ua) && !/android/i.test(ua)) return "Linux";
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  return "Other";
}
