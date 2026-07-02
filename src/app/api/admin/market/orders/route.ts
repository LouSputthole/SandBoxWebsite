import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { guardAdminRoute } from "@/lib/auth/admin-guard";
import { MARKET_ORDER_STATES } from "@/lib/market/escrow-state";
import { ORDER_INCLUDE, serializeOrder } from "../_serialize";

export const dynamic = "force-dynamic";

const DEFAULT_TAKE = 50;
const MAX_TAKE = 200;

const VALID_STATES: ReadonlySet<string> = new Set(MARKET_ORDER_STATES);

/** Free-text search across order id, both parties (username / steamId), the item, and escrow PDA. */
function searchWhere(q: string | null): Prisma.MarketOrderWhereInput {
  const term = q?.trim();
  if (!term) return {};
  const ci = { contains: term, mode: "insensitive" as const };
  return {
    OR: [
      { id: ci },
      { escrowPda: ci },
      { onchainOrderId: ci },
      { buyer: { is: { OR: [{ username: ci }, { steamId: ci }] } } },
      { seller: { is: { OR: [{ username: ci }, { steamId: ci }] } } },
      { listing: { is: { item: { is: { OR: [{ name: ci }, { slug: ci }] } } } } },
    ],
  };
}

/**
 * GET /api/admin/market/orders?state=&q=&take=&skip=
 *
 * Orders newest-first with full relations, serialized (bigints → strings). Returns the page of rows
 * plus the total count and per-state counts for the filter tabs. Counts respect `q` but ignore
 * `state`, so the tabs always show how many matching orders sit in each state.
 */
export async function GET(request: NextRequest) {
  const guard = await guardAdminRoute(request, { allowedKeys: ["cron", "analytics"] });
  if (!guard.ok) return guard.response;

  const sp = request.nextUrl.searchParams;
  const stateParam = sp.get("state");
  const q = sp.get("q");
  const take = Math.min(MAX_TAKE, Math.max(1, Number(sp.get("take")) || DEFAULT_TAKE));
  const skip = Math.max(0, Number(sp.get("skip")) || 0);

  const base = searchWhere(q);
  const stateFilter = stateParam && stateParam !== "all" && VALID_STATES.has(stateParam) ? stateParam : null;
  const where: Prisma.MarketOrderWhereInput = stateFilter ? { AND: [base, { state: stateFilter }] } : base;

  const [rows, total, grouped, activeListings] = await Promise.all([
    prisma.marketOrder.findMany({
      where,
      include: ORDER_INCLUDE,
      orderBy: { createdAt: "desc" },
      take,
      skip,
    }),
    prisma.marketOrder.count({ where: base }),
    prisma.marketOrder.groupBy({ by: ["state"], where: base, _count: { _all: true } }),
    prisma.marketListing.count({ where: { status: "ACTIVE" } }),
  ]);

  const countsByState: Record<string, number> = {};
  for (const s of MARKET_ORDER_STATES) countsByState[s] = 0;
  for (const g of grouped) countsByState[g.state] = g._count._all;

  return NextResponse.json({
    orders: rows.map(serializeOrder),
    total,
    countsByState,
    activeListings,
    take,
    skip,
  });
}
