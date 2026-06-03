import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { guardAdminRoute } from "@/lib/auth/admin-guard";

/**
 * GET /api/admin/items-missing-nameid
 *
 * Lists items that have a Steam Market listing (steamMarketId set) but no
 * order-book nameid yet (steamItemNameId null). These are exactly the
 * items whose buy/sell order book can't render until someone sets the
 * nameid — via the scrape cron or the manual /admin/set-nameid form.
 *
 * Powers the worklist on /admin/set-nameid and gives a local harvester a
 * queue of slugs to resolve. Ordered by name, capped at 500 so a large
 * backlog can't blow up the payload.
 *
 * Auth: ANALYTICS_KEY (operator UI) or CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const guard = await guardAdminRoute(request, {
    allowedKeys: ["analytics", "cron"],
  });
  if (!guard.ok) return guard.response;

  const items = await prisma.item.findMany({
    where: {
      steamMarketId: { not: null },
      steamItemNameId: null,
    },
    select: { slug: true, name: true, steamMarketId: true },
    orderBy: { name: "asc" },
    take: 500,
  });

  return NextResponse.json({ count: items.length, items });
}
