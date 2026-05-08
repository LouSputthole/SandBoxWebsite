import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdminRoute } from "@/lib/auth/admin-guard";

/**
 * GET /api/admin/nameid-scrape?slug=<slug>
 *
 * One-shot probe to verify whether Steam Market HTML page scraping
 * actually works from Vercel datacenter IPs. The codebase has been
 * operating on the assumption that it doesn't — the existing
 * scripts/scrape-nameids.ts must be run from a local machine — but
 * that assumption was never re-tested. If this endpoint succeeds,
 * we can wire the scrape directly into the sync cron and retire
 * the local-script workflow entirely.
 *
 * Uses browser-impersonation headers (Mozilla UA + Accept-Language)
 * matching scripts/scrape-nameids.ts exactly. Reports HTTP status,
 * response size, the parsed item_nameid (if extractable), and a
 * short HTML snippet for diagnosis when parsing fails.
 *
 * Protected by CRON_SECRET / ANALYTICS_KEY admin guard.
 */
export async function GET(request: NextRequest) {
  const guard = await guardAdminRoute(request, {
    allowedKeys: ["cron", "analytics"],
  });
  if (!guard.ok) return guard.response;

  const slug = request.nextUrl.searchParams.get("slug")?.trim();
  if (!slug) {
    return NextResponse.json(
      { error: "slug query param is required" },
      { status: 400 },
    );
  }

  const item = await prisma.item.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      steamMarketId: true,
      steamItemNameId: true,
    },
  });
  if (!item) {
    return NextResponse.json({ error: "no item with that slug" }, { status: 404 });
  }
  if (!item.steamMarketId) {
    return NextResponse.json(
      {
        error:
          "item has no steamMarketId — there's no Steam Market listing page to scrape yet",
      },
      { status: 400 },
    );
  }

  const url = `https://steamcommunity.com/market/listings/590830/${encodeURIComponent(
    item.steamMarketId,
  )}`;

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(url, {
      // Browser-impersonation headers — matches scripts/scrape-nameids.ts.
      // We're deliberately diverging from project convention #1 (anonymous
      // outbound) here because Steam's HTML market pages serve a different
      // (rate-limited) response to vanilla fetch. If this works, this
      // endpoint becomes the basis for a cron job that nukes the local-
      // script workflow.
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      error: `fetch threw: ${err instanceof Error ? err.message : String(err)}`,
      url,
      slug,
      steamMarketId: item.steamMarketId,
      elapsedMs: Date.now() - startedAt,
    });
  }

  const elapsedMs = Date.now() - startedAt;
  const status = response.status;
  const html = response.ok ? await response.text() : "";
  const length = html.length;

  // The page serves Market_LoadOrderSpread( <numeric_id> ) inline.
  const match = html.match(/Market_LoadOrderSpread\(\s*(\d+)\s*\)/);
  const nameId = match ? match[1] : null;

  // Pull a short snippet to make diagnosis easier when we can't
  // parse the nameid. Three cases worth seeing:
  //   1. Steam returned a normal page but parser failed (snippet of
  //      <head> for fingerprinting)
  //   2. Steam served a captcha / rate-limit interstitial (we'll see
  //      it in the snippet)
  //   3. Steam served a CDN-edge block ("Access denied" etc.)
  const snippet = response.ok
    ? html.slice(0, 500).replace(/\s+/g, " ").trim()
    : null;

  return NextResponse.json({
    ok: response.ok && !!nameId,
    status,
    url,
    slug,
    name: item.name,
    steamMarketId: item.steamMarketId,
    existingNameId: item.steamItemNameId,
    parsedNameId: nameId,
    htmlLength: length,
    snippet,
    elapsedMs,
    hint:
      response.ok && nameId
        ? "Vercel CAN scrape Steam HTML. Next step: wire into a cron and retire the local script."
        : status === 200 && !nameId
          ? "Page came back 200 but parser failed. Inspect snippet — likely Steam changed page structure or served a different layout."
          : status === 429
            ? "Steam rate-limited this Vercel IP. Try once more in 30s, or accept that automation needs a non-Vercel host."
            : status >= 500
              ? "Steam-side error. Retry."
              : "Steam blocked the request from a Vercel IP. The local-script workflow is genuinely needed unless we route through a proxy / VPS.",
  });
}
