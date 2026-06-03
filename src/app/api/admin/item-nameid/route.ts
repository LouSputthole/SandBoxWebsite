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
 * Accepts either a single { slug, nameid } or a batch { items: [...] }.
 * Each nameid must be all digits (Steam ids are numeric). A non-numeric
 * nameid rejects the WHOLE request with 400 — partial writes from a typo'd
 * batch are worse than making the caller resend a clean payload.
 *
 * Auth: ANALYTICS_KEY (operator UI) or CRON_SECRET.
 */

const NUMERIC = /^\d+$/;

interface Entry {
  slug: string;
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
    const slug =
      item && typeof item === "object" && typeof (item as Entry).slug === "string"
        ? (item as Entry).slug.trim()
        : "";
    const nameid =
      item && typeof item === "object" && typeof (item as Entry).nameid === "string"
        ? (item as Entry).nameid.trim()
        : "";

    if (!slug || !nameid) {
      return NextResponse.json(
        { error: "Each item needs a non-empty slug and nameid" },
        { status: 400 },
      );
    }
    if (!NUMERIC.test(nameid)) {
      return NextResponse.json(
        { error: `nameid must be all digits (got "${nameid}" for "${slug}")` },
        { status: 400 },
      );
    }
    entries.push({ slug, nameid });
  }

  let updated = 0;
  const notFound: string[] = [];

  for (const { slug, nameid } of entries) {
    // updateMany returns a count instead of throwing on a missing row, so
    // an unknown slug lands in notFound rather than aborting the batch.
    const res = await prisma.item.updateMany({
      where: { slug },
      data: { steamItemNameId: nameid },
    });
    if (res.count > 0) updated += res.count;
    else notFound.push(slug);
  }

  return NextResponse.json({ ok: true, updated, notFound });
}
