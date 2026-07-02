import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { expirePendingOrders, tickOrder } from "@/lib/market/order-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET/POST /api/cron/market-oracle — advance every live order one tick: confirm deliveries, start
 * protection holds, release matured payouts, refund reversals/SLA-misses. Per-order failures
 * (e.g. a private inventory) are isolated so one bad order can't stall the batch.
 *
 * DEPLOY NOTE (Neon cost): do NOT schedule this as a standalone frequent cron — that would wake
 * the compute 24/7 and undo the cost fix. Either add it to vercel.json at the SAME times as
 * /api/sync (0,15,30,45 peak; 0,30 off-peak) so it piggybacks existing wakes, or call
 * `tickOrder` from inside the /api/sync handler.
 */
async function handle(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Reap abandoned PENDING orders first (delete unfunded / promote late-funded / refund mismatches),
  // freeing the per-listing + per-asset live-order locks. Isolated: a failure here must not abort the
  // tick loop below.
  try {
    const reaped = await expirePendingOrders();
    console.log("[cron:market-oracle] reaped pending", reaped);
  } catch (err) {
    console.error("[cron:market-oracle] expirePendingOrders failed", err);
  }

  const orders = await prisma.marketOrder.findMany({
    where: { state: { in: ["FUNDED", "PROTECTION_HOLD"] } },
    include: { buyer: { select: { steamId: true } } },
    take: 200,
  });

  const results: Record<string, number> = {
    confirm_delivery: 0,
    release: 0,
    refund: 0,
    dispute: 0,
    wait: 0,
    skipped_no_steamid: 0,
    error: 0,
  };
  for (const o of orders) {
    try {
      // A missing/empty buyer steamId would feed garbage to the Steam inventory fetch (and could
      // read as "not delivered" → wrong SLA refund). Data error — skip loudly, never tick.
      if (!o.buyer?.steamId) {
        results.skipped_no_steamid += 1;
        console.error(`[cron:market-oracle] order ${o.id} skipped: buyer has no steamId`);
        continue;
      }
      const { action } = await tickOrder(o.id, o.buyer.steamId);
      results[action] = (results[action] ?? 0) + 1;
    } catch (err) {
      results.error += 1;
      console.error(`[cron:market-oracle] order ${o.id} failed`, err);
    }
  }
  console.log(`[cron:market-oracle] ticked ${orders.length}`, results);
  return NextResponse.json({ ticked: orders.length, results });
}

export const GET = handle;
export const POST = handle;
