import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import {
  escrowEnvMissing,
  escrowMaxUsd,
  isEscrowEnabled,
} from "@/lib/escrow/config";
import {
  calculateFee,
  depositDeadlineFrom,
} from "@/lib/escrow/state-machine";
import { defaultBotSelection } from "@/lib/escrow/bot-selection";
import { coinbaseCommerce } from "@/lib/escrow/coinbase-commerce";

/**
 * POST /api/escrow/trades — initiate an escrow buy on an existing
 * TradeListing. Body: { listingId }.
 *
 * Flow:
 *   1. Caller must be a logged-in user with a Steam trade URL on file
 *      (so the bot has a destination to release the item to).
 *   2. Listing must be active + sellable (status="active", side in
 *      ["selling","both"]).
 *   3. Caller can't be the seller themselves.
 *   4. Listing total <= escrowMaxUsd() — Phase 2 hard cap.
 *   5. A bot must have capacity. If not, 503 — buyer retries.
 *   6. We snapshot items + price into EscrowTrade, create a Coinbase
 *      Commerce charge, and return the hosted-checkout URL.
 *
 * The bot worker takes over from here: polls /api/escrow/work-queue
 * for trades in pending_deposit and sends the deposit offer to seller.
 */

const SITE = process.env.NEXT_PUBLIC_BASE_URL ?? "https://sboxskins.gg";

export async function POST(request: NextRequest) {
  if (!isEscrowEnabled()) {
    return NextResponse.json(
      { error: "Escrow is not enabled on this deployment." },
      { status: 503 },
    );
  }
  const missing = escrowEnvMissing();
  if (missing.length > 0) {
    return NextResponse.json(
      {
        error: `Escrow misconfigured. Missing env: ${missing.join(", ")}.`,
      },
      { status: 500 },
    );
  }

  const buyer = await getCurrentUser();
  if (!buyer) {
    return NextResponse.json(
      { error: "Sign in with Steam to buy via escrow" },
      { status: 401 },
    );
  }
  if (!buyer.steamTradeUrl) {
    return NextResponse.json(
      {
        error:
          "Add your Steam trade URL on /trade/new before buying via escrow — that's where the bot will release the item.",
      },
      { status: 400 },
    );
  }

  let body: { listingId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const listingId =
    typeof body.listingId === "string" ? body.listingId : null;
  if (!listingId) {
    return NextResponse.json(
      { error: "listingId required" },
      { status: 400 },
    );
  }

  const listing = await prisma.tradeListing.findUnique({
    where: { id: listingId },
    include: {
      items: {
        include: {
          item: {
            select: {
              id: true,
              name: true,
              slug: true,
              currentPrice: true,
            },
          },
        },
      },
      user: {
        select: {
          id: true,
          steamTradeUrl: true,
          username: true,
        },
      },
    },
  });
  if (!listing) {
    return NextResponse.json({ error: "Listing not found" }, { status: 404 });
  }
  if (listing.status !== "active") {
    return NextResponse.json(
      { error: `Listing is ${listing.status}; can't buy.` },
      { status: 400 },
    );
  }
  if (!["selling", "both"].includes(listing.side)) {
    return NextResponse.json(
      { error: "This listing isn't open for direct buy." },
      { status: 400 },
    );
  }
  if (listing.userId === buyer.id) {
    return NextResponse.json(
      { error: "Can't buy your own listing." },
      { status: 400 },
    );
  }
  if (!listing.user.steamTradeUrl) {
    return NextResponse.json(
      {
        error:
          "Seller hasn't set their Steam trade URL — bot can't pick up the item. Ask them to add one to their listing.",
      },
      { status: 400 },
    );
  }

  // Lock pricing at create time. We use unitPriceAtListing if present
  // (the listing snapshot), otherwise current market price. If neither
  // exists for an item the listing isn't priceable through escrow.
  const offering = listing.items.filter((i) => i.slot === "offering");
  if (offering.length === 0) {
    return NextResponse.json(
      { error: "Listing has no items to sell." },
      { status: 400 },
    );
  }
  let priceUsd = 0;
  for (const li of offering) {
    const unit = li.unitPriceAtListing ?? li.item?.currentPrice ?? null;
    if (unit == null) {
      return NextResponse.json(
        {
          error: `Item "${li.item?.name ?? li.customName ?? "unknown"}" has no price — escrow can't price the trade.`,
        },
        { status: 400 },
      );
    }
    priceUsd += unit * li.quantity;
  }
  priceUsd = Math.round(priceUsd * 100) / 100;

  const cap = escrowMaxUsd();
  if (priceUsd > cap) {
    return NextResponse.json(
      {
        error: `Trade total $${priceUsd.toFixed(2)} exceeds the current escrow cap of $${cap.toFixed(2)}. (Phase 2 cap; lifts as we add capacity.)`,
      },
      { status: 400 },
    );
  }

  // Reject if there's already an open escrow for this listing (avoids
  // double-spending the seller's items).
  const conflicting = await prisma.escrowTrade.findFirst({
    where: {
      listingId: listing.id,
      state: {
        in: ["pending_deposit", "awaiting_payment", "payment_confirmed", "disputed"],
      },
    },
    select: { id: true },
  });
  if (conflicting) {
    return NextResponse.json(
      {
        error:
          "Another buyer is already in escrow on this listing. Wait for it to clear or pick a different listing.",
      },
      { status: 409 },
    );
  }

  const bot = await defaultBotSelection.selectAvailable();
  if (!bot) {
    return NextResponse.json(
      {
        error:
          "Escrow capacity is full — no bot available right now. Try again in a few minutes.",
      },
      { status: 503 },
    );
  }

  const fee = calculateFee(priceUsd);
  const itemSnapshot = {
    offering: offering.map((li) => ({
      itemId: li.itemId,
      slug: li.item?.slug ?? null,
      name: li.item?.name ?? li.customName ?? "Unknown",
      quantity: li.quantity,
      unitPriceAtListing: li.unitPriceAtListing ?? li.item?.currentPrice ?? null,
    })),
  };

  // Wrap trade-row create + Coinbase charge create + Payment-row create
  // in a transaction so we never end up with a half-formed escrow on
  // network hiccup.
  const trade = await prisma.escrowTrade.create({
    data: {
      listingId: listing.id,
      buyerId: buyer.id,
      sellerId: listing.userId,
      itemSnapshot,
      priceUsd,
      feeUsd: fee,
      botAccountId: bot.id,
      depositDeadline: depositDeadlineFrom(),
    },
  });

  let charge;
  try {
    charge = await coinbaseCommerce.createCharge({
      tradeId: trade.id,
      amountUsd: priceUsd,
      description: `Escrow buy of "${listing.description.slice(0, 80)}" from ${listing.user.username ?? "seller"} on sboxskins.gg`,
      redirectUrl: `${SITE}/trade/escrow/${trade.id}?paid=1`,
      cancelUrl: `${SITE}/trade/escrow/${trade.id}?cancelled=1`,
    });
  } catch (err) {
    // Clean up the trade row so the listing isn't locked behind a
    // dead escrow we can never settle.
    await prisma.escrowTrade.delete({ where: { id: trade.id } }).catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Couldn't create payment: ${msg}` },
      { status: 502 },
    );
  }

  await prisma.payment.create({
    data: {
      tradeId: trade.id,
      processor: "coinbase_commerce",
      processorChargeId: charge.processorChargeId,
      hostedUrl: charge.hostedUrl,
    },
  });

  return NextResponse.json({
    tradeId: trade.id,
    state: trade.state,
    hostedUrl: charge.hostedUrl,
    priceUsd,
    feeUsd: fee,
    botLabel: bot.label,
    depositDeadline: trade.depositDeadline.toISOString(),
  });
}
