import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdminRoute } from "@/lib/auth/admin-guard";

/**
 * POST /api/admin/item-nameid
 *
 * Manually sets Item.steamItemNameId for one or more items by slug. This is
 * the by-hand counterpart to the scrape-nameids cron: when Steam HTML
 * scraping fails from Vercel IPs, an operator (or a local harvester) reads
 * the numeric item_nameid off the item's logged-in Steam Market page and
 * POSTs it here. That nameid unblocks the anonymous order-histogram
 * endpoint (itemordershistogram) so the buy/sell order book renders.
 *
 * Accepts a single entry or a batch { items: [...] }. Each entry identifies
 * its item by EITHER `slug` OR `hash` (the Steam market_hash_name, which is
 * stored as Item.steamMarketId) — so the body may be { slug, nameid },
 * { hash, nameid }, or { items: [...] } mixing the two. The `hash` form is
 * what the one-click bookmarklet sends, since a Steam Market page exposes the
 * market_hash_name but not our internal slug.
 *
 * Each nameid must be all digits (Steam ids are numeric). A non-numeric
 * nameid — or an entry missing both an identifier and a nameid — rejects the
 * WHOLE request with 400; partial writes from a typo'd batch are worse than
 * making the caller resend a clean payload.
 *
 * Auth: ANALYTICS_KEY (operator UI) or CRON_SECRET.
 */

const NUMERIC = /^\d+$/;

// Each entry resolves to exactly one of slug / hash (slug wins if both given).
interface Entry {
  slug?: string;
  hash?: string;
  nameid: string;
}

export async function POST(request: NextRequest) {
  const guard = await guardAdminRoute(request, {
    allowedKeys: ["analytics", "cron"],
  });
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Normalize single-item and batch shapes into one list.
  const raw =
    body && typeof body === "object" && "items" in body
      ? (body as { items: unknown }).items
      : [body];

  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json(
      { error: "Provide { slug, nameid } or { items: [{ slug, nameid }] }" },
      { status: 400 },
    );
  }

  const entries: Entry[] = [];
  for (const item of raw) {
    const isObj = item && typeof item === "object";
    const slug =
      isObj && typeof (item as Entry).slug === "string"
        ? (item as Entry).slug!.trim()
        : "";
    const hash =
      isObj && typeof (item as Entry).hash === "string"
        ? (item as Entry).hash!.trim()
        : "";
    const nameid =
      isObj && typeof (item as Entry).nameid === "string"
        ? (item as Entry).nameid!.trim()
        : "";

    // Each entry needs a nameid AND at least one identifier (slug or hash).
    if (!nameid || (!slug && !hash)) {
      return NextResponse.json(
        { error: "Each item needs a nameid and a slug or hash" },
        { status: 400 },
      );
    }
    if (!NUMERIC.test(nameid)) {
      return NextResponse.json(
        {
          error: `nameid must be all digits (got "${nameid}" for "${slug || hash}")`,
        },
        { status: 400 },
      );
    }
    // Slug wins if both are supplied.
    entries.push(slug ? { slug, nameid } : { hash, nameid });
  }

  let updated = 0;
  const notFound: string[] = [];

  for (const { slug, hash, nameid } of entries) {
    // Slug → exact slug match; otherwise resolve by steamMarketId (the Steam
    // market_hash_name). updateMany returns a count instead of throwing on a
    // missing row, so an unknown identifier lands in notFound rather than
    // aborting the batch.
    const res = await prisma.item.updateMany({
      where: slug ? { slug } : { steamMarketId: hash },
      data: { steamItemNameId: nameid },
    });
    if (res.count > 0) updated += res.count;
    else notFound.push(slug ?? hash ?? "");
  }

  return NextResponse.json({ ok: true, updated, notFound });
}
