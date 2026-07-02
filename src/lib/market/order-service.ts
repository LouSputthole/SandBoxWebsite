import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { assertNotBanned } from "./bans";
import { getEscrowClient } from "./escrow";
import { EscrowMismatchError, EscrowTxExpiredError, type EscrowRecord, type OpenEscrowParams } from "./escrow/types";
import { FEE_BPS, usdToUsdcBaseUnits } from "./fees";
import {
  DEFAULT_DELIVERY_SLA_SECONDS,
  PENDING_FUNDING_MAX_AGE_SECONDS,
  PROTECTION_PERIOD_SECONDS,
} from "./escrow-state";
import { nextOrderAction } from "./order-flow";
import { APPID_SBOX, fetchPublicInventory } from "./steam-inventory";
import { assetIdsForClass, type SteamAsset } from "./item-match";
import { decryptSecret } from "./steam-credential";
import { fetchTradeOffer, fetchTradeStatus } from "./steam-trade";
import {
  ETradeOfferState,
  classifyHoldDisappearance,
  correlateDelivery,
  type CorrelatedDelivery,
  type TradeStatus,
} from "./trade-correlation";

/** Standard Steam inventory context for tradable game items. */
const STEAM_CONTEXT_ID = "2";

/**
 * A fund/cancel request raced another that is already confirming this order's funding on-chain
 * (state === FUNDING). Not an error the buyer caused — the routes surface it as HTTP 409 ("a
 * purchase is already being confirmed") rather than deleting the row or double-submitting.
 */
export class FundingInProgressError extends Error {
  constructor(message = "order funding is already in progress") {
    super(message);
    this.name = "FundingInProgressError";
  }
}

/** The distinguishable "the blockhash expired — re-sign this fresh tx" result of {@link fundOrder}. */
export interface FundRetry {
  retry: true;
  openTx: { txBase64: string | null };
}

/** Unix seconds. Module-level helper (never call Date.now() inside a React render — repo lint). */
const nowSec = () => Math.floor(Date.now() / 1000);

/** Reconstruct the minimal "before" asset list for the delivery check from stored prior ids. */
function priorAssets(order: { buyerPriorAssetIds: string[]; classId: string; instanceId: string }): SteamAsset[] {
  return order.buyerPriorAssetIds.map((assetid) => ({
    assetid,
    classid: order.classId,
    instanceid: order.instanceId,
  }));
}

export interface CreateOrderParams {
  listingId: string;
  buyerId: string;
  /** buyer's SteamID64 — to snapshot their inventory before the trade. */
  buyerSteamId64: string;
}

/** A MarketOrder row shape sufficient to rebuild the {@link OpenEscrowParams} for it. */
interface FundableOrder {
  id: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  priceUsdc: bigint;
  feeBps: number;
  deliveryDeadline: Date;
}

/** Re-read the order after a settlement write so callers get the persisted row (a full MarketOrder). */
async function reloadOrder(id: string) {
  const order = await prisma.marketOrder.findUnique({ where: { id } });
  if (!order) throw new Error(`order ${id} vanished during settlement`);
  return order;
}

/** Rebuild the escrow open params from a stored order row + both parties' wallet addresses. */
function openEscrowParamsForOrder(order: FundableOrder, buyer: string, seller: string): OpenEscrowParams {
  return {
    orderId: order.id,
    buyer,
    seller,
    amount: order.priceUsdc,
    feeBps: order.feeBps,
    deliveryDeadline: Math.floor(order.deliveryDeadline.getTime() / 1000),
  };
}

/**
 * Buyer commits to a listing: snapshot their inventory, create a PENDING order, and build the
 * buyer-signed open_escrow transaction. NO funds move here (the buyer signs + submits the tx next,
 * via fundOrder). The listing STAYS ACTIVE — the partial-unique "one live order per listing/asset"
 * indexes (which count PENDING) are the race backstop against two simultaneous buyers → P2002 →
 * the route's 409. A prepare failure rolls the order back (nothing funded yet, safe to delete).
 *
 * Returns `{ order, txBase64 }`: `txBase64` is the unsigned tx for the buyer to sign (solana), or
 * null when there is nothing to sign (mock/dev — fundOrder opens the escrow directly).
 */
export async function createOrder(params: CreateOrderParams): Promise<{
  order: Awaited<ReturnType<typeof prisma.marketOrder.create>>;
  txBase64: string | null;
}> {
  const listing = await prisma.marketListing.findUnique({ where: { id: params.listingId } });
  if (!listing || listing.status !== "ACTIVE") throw new Error("listing is not available");
  if (listing.sellerId === params.buyerId) throw new Error("cannot buy your own listing");

  const [buyerWallet, sellerWallet] = await Promise.all([
    prisma.userWallet.findUnique({ where: { userId: params.buyerId } }),
    prisma.userWallet.findUnique({ where: { userId: listing.sellerId } }),
  ]);

  // Ban gate — a banned buyer (by Steam id OR linked wallet) can never fund an order. Checked before
  // the wallet/readiness errors so a banned user gets the ban message, and BEFORE any funds move.
  await assertNotBanned({ steamId: params.buyerSteamId64, walletAddress: buyerWallet?.address });

  if (!buyerWallet) throw new Error("link a wallet before buying");
  if (!sellerWallet) throw new Error("seller wallet unavailable");

  const amount = usdToUsdcBaseUnits(listing.priceUsd);
  const now = nowSec();
  const deliveryDeadline = now + DEFAULT_DELIVERY_SLA_SECONDS;

  // Prior copies of this exact skin the buyer already holds — so delivery is a NEW assetid.
  const buyerInv = await fetchPublicInventory(params.buyerSteamId64);
  const buyerPriorAssetIds = [...assetIdsForClass(buyerInv, listing.classId, listing.instanceId)];

  const order = await prisma.marketOrder.create({
    data: {
      listingId: listing.id,
      buyerId: params.buyerId,
      sellerId: listing.sellerId,
      priceUsdc: amount,
      feeBps: FEE_BPS,
      state: "PENDING",
      steamAssetId: listing.steamAssetId,
      classId: listing.classId,
      instanceId: listing.instanceId,
      buyerPriorAssetIds,
      deliveryDeadline: new Date(deliveryDeadline * 1000),
    },
  });

  // Build the buyer-signed open tx in ISOLATION. If THIS fails, nothing funded, so it's safe to drop
  // the PENDING order (keeps the listing buyable). Never delete an order once funds can have moved
  // (i.e. after fundOrder submits the signed tx).
  try {
    const { txBase64 } = await getEscrowClient().prepareOpenEscrow(
      openEscrowParamsForOrder(order, buyerWallet.address, sellerWallet.address),
    );
    return { order, txBase64 };
  } catch (err) {
    await prisma.marketOrder.delete({ where: { id: order.id } }).catch(() => {});
    throw err;
  }
}

/**
 * Promote a PENDING order whose escrow verified as FUNDED: mark it FUNDED + stamp fundedAt + persist
 * the escrow refs, and take the listing out of circulation. Funds HAVE MOVED here, so this follows
 * the never-delete-after-funds-move rule: best-effort persistence with a loud console.error, leaving
 * the order FUNDED for the oracle to reconcile if the listing flip fails.
 */
async function promoteFundedOrder(
  order: FundableOrder,
  escrow: EscrowRecord,
  openTxSig: string | null,
  now: number,
) {
  const fundedData = {
    state: "FUNDED",
    fundedAt: new Date(now * 1000),
    escrowPda: escrow.escrowPda,
    onchainOrderId: escrow.onchainOrderId,
    // Best-effort proof link for the public ledger. Only set when present so a later reconcile (which
    // has no signed tx → null) can't wipe a signature an earlier submit already persisted.
    ...(openTxSig ? { openTxSig } : {}),
  };
  try {
    await prisma.$transaction([
      prisma.marketOrder.update({ where: { id: order.id }, data: fundedData }),
      prisma.marketListing.update({ where: { id: order.listingId }, data: { status: "SOLD" } }),
    ]);
  } catch (err) {
    console.error(
      `[market] order ${order.id}: escrow FUNDED but the DB promote failed — marking FUNDED for reconciliation`,
      err,
    );
    await prisma.marketOrder.update({ where: { id: order.id }, data: fundedData }).catch(() => {});
  }
  return reloadOrder(order.id);
}

/**
 * A tampered client funded the escrow PDA with values that don't match the order (wrong
 * buyer/seller/amount). NEVER mark FUNDED. Return the buyer's funds via the authorizer refund and
 * mark the order REFUNDED; if the refund itself fails, freeze the escrow and mark DISPUTED for an
 * operator. Funds are already on-chain, so we never delete the order.
 */
async function handleFundingMismatch(order: FundableOrder, err: EscrowMismatchError, now: number) {
  const reason = `escrow funding mismatch — buyer refunded: ${err.message}`;
  const escrow = getEscrowClient();
  try {
    const { signature } = await escrow.refund(order.id, now);
    await prisma.marketOrder.update({
      where: { id: order.id },
      data: {
        state: "REFUNDED",
        refundedAt: new Date(now * 1000),
        disputeReason: reason,
        ...(signature ? { settleTxSig: signature } : {}),
      },
    });
  } catch (refundErr) {
    console.error(`[market] order ${order.id}: mismatch refund failed — freezing for dispute`, refundErr);
    const disputeReason = `escrow funding mismatch AND refund failed — needs operator review: ${err.message}`;
    await escrow
      .freeze(order.id, disputeReason)
      .catch((freezeErr) => console.error(`[market] order ${order.id}: freeze also failed`, freezeErr));
    await prisma.marketOrder.update({
      where: { id: order.id },
      data: { state: "DISPUTED", disputeReason },
    });
  }
  return reloadOrder(order.id);
}

/**
 * Shared PENDING→terminal driver used by fundOrder, cancelPendingOrder, and expirePendingOrders.
 * Submits the (optional) buyer-signed tx + verifies the escrow, then promotes to FUNDED — or, on a
 * tampered-funding mismatch, refunds/disputes. `signedTxBase64` null = reconcile-only (verify an
 * already-submitted funding), used by the cancel / reaper paths.
 */
async function settlePendingFunding(order: FundableOrder, signedTxBase64: string | null) {
  const [buyerWallet, sellerWallet] = await Promise.all([
    prisma.userWallet.findUnique({ where: { userId: order.buyerId } }),
    prisma.userWallet.findUnique({ where: { userId: order.sellerId } }),
  ]);
  if (!buyerWallet) throw new Error("buyer wallet unavailable");
  if (!sellerWallet) throw new Error("seller wallet unavailable");

  const params = openEscrowParamsForOrder(order, buyerWallet.address, sellerWallet.address);
  const now = nowSec();
  let result: { record: EscrowRecord; signature: string | null };
  try {
    result = await getEscrowClient().submitAndVerifyOpenEscrow(params, signedTxBase64);
  } catch (err) {
    if (err instanceof EscrowMismatchError) return handleFundingMismatch(order, err, now);
    throw err;
  }
  return promoteFundedOrder(order, result.record, result.signature, now);
}

/** Re-build the buyer-signed open tx for an order (fresh blockhash) — used by the expiry re-sign. */
async function prepareOpenTxForOrder(order: FundableOrder): Promise<{ txBase64: string | null }> {
  const [buyerWallet, sellerWallet] = await Promise.all([
    prisma.userWallet.findUnique({ where: { userId: order.buyerId } }),
    prisma.userWallet.findUnique({ where: { userId: order.sellerId } }),
  ]);
  if (!buyerWallet) throw new Error("buyer wallet unavailable");
  if (!sellerWallet) throw new Error("seller wallet unavailable");
  return getEscrowClient().prepareOpenEscrow(
    openEscrowParamsForOrder(order, buyerWallet.address, sellerWallet.address),
  );
}

/**
 * Phase 2 of the buyer purchase: the buyer submits their signed open_escrow tx. Verifies the escrow
 * funded as expected and promotes the order PENDING → FUNDED (listing → SOLD). `signedTxBase64` null
 * = mock/dev (the escrow client opens directly) or a reconcile retry.
 *
 * Concurrency: BEFORE any funds can move, atomically CLAIMS the order PENDING → FUNDING with a
 * conditional updateMany. That latch is what lets cancelPendingOrder safely delete only a still-
 * PENDING row (never one whose funding is confirming). Idempotency + races:
 *  - already FUNDED / REFUNDED / DISPUTED / … → returns the order unchanged.
 *  - FUNDING (a concurrent call owns the claim) → throws {@link FundingInProgressError} (route 409).
 *  - lost the PENDING→FUNDING claim to a racing call → re-reads and resolves the same way.
 * If submit/verify fails for a non-proven reason we LEAVE the order FUNDING for the reaper to
 * reconcile (funds may have landed). The one exception is a proven-not-landed blockhash expiry
 * ({@link EscrowTxExpiredError}): we revert the claim to PENDING and hand back a fresh tx to sign.
 */
export async function fundOrder(
  orderId: string,
  buyerId: string,
  signedTxBase64: string | null,
): Promise<Awaited<ReturnType<typeof reloadOrder>> | FundRetry> {
  const order = await prisma.marketOrder.findUnique({ where: { id: orderId } });
  if (!order || order.buyerId !== buyerId) throw new Error("order not found");
  if (order.state === "FUNDING") throw new FundingInProgressError();
  if (order.state !== "PENDING") return order; // already FUNDED / refunded / disputed — idempotent

  // Atomically claim PENDING → FUNDING. If another request beat us to it, count === 0.
  const claim = await prisma.marketOrder.updateMany({
    where: { id: orderId, state: "PENDING" },
    data: { state: "FUNDING" },
  });
  if (claim.count === 0) {
    const fresh = await prisma.marketOrder.findUnique({ where: { id: orderId } });
    if (!fresh || fresh.buyerId !== buyerId) throw new Error("order not found");
    if (fresh.state === "FUNDING") throw new FundingInProgressError();
    if (fresh.state === "PENDING") throw new Error("order funding could not be claimed"); // unreachable
    return fresh; // advanced to FUNDED+ under us — idempotent
  }

  try {
    return await settlePendingFunding(order, signedTxBase64);
  } catch (err) {
    if (err instanceof EscrowTxExpiredError) {
      // Proven not-landed: release the claim and re-prepare a fresh tx for the buyer to re-sign.
      await prisma.marketOrder.updateMany({ where: { id: orderId, state: "FUNDING" }, data: { state: "PENDING" } });
      const { txBase64 } = await prepareOpenTxForOrder(order);
      return { retry: true, openTx: { txBase64 } };
    }
    throw err; // any other failure leaves the order FUNDING for the reaper to reconcile
  }
}

/**
 * Buyer abandons a PENDING order (rejected the wallet signature, closed the tab). If no escrow
 * exists on-chain, delete the order — the listing never flipped and nothing moved. If an escrow
 * unexpectedly EXISTS (the buyer actually did sign + submit), do NOT delete: run the same
 * promote/mismatch settlement as funding (with no signed tx) so real funds are never stranded.
 *
 * Only a PENDING order is cancellable. A FUNDING order (a fund call holds the claim and is
 * confirming on-chain RIGHT NOW) throws {@link FundingInProgressError} — deleting it would orphan
 * funds that land seconds later. The delete itself is atomic-conditional (`deleteMany` gated on
 * state PENDING) so a funding claim that lands between our chain read and the delete wins: we
 * re-read and return the in-flight/funded order instead of destroying the row.
 */
export async function cancelPendingOrder(orderId: string, buyerId: string) {
  const order = await prisma.marketOrder.findUnique({ where: { id: orderId } });
  if (!order || order.buyerId !== buyerId) throw new Error("order not found");
  if (order.state === "FUNDING") throw new FundingInProgressError();
  if (order.state !== "PENDING") throw new Error("order is not pending");

  const chain = await getEscrowClient().get(orderId);
  if (!chain) {
    // Atomic-conditional: only delete the row if it is STILL the PENDING row we read. count 0 means
    // a concurrent fundOrder claimed (or settled) it after our chain read → not cancellable.
    const del = await prisma.marketOrder.deleteMany({ where: { id: orderId, state: "PENDING" } });
    if (del.count > 0) return { cancelled: true as const };
    const fresh = await prisma.marketOrder.findUnique({ where: { id: orderId } });
    if (!fresh || fresh.buyerId !== buyerId) throw new Error("order not found");
    if (fresh.state === "FUNDING") throw new FundingInProgressError();
    return { cancelled: false as const, order: fresh };
  }
  // Funds exist on-chain — settle instead of deleting.
  return { cancelled: false as const, order: await settlePendingFunding(order, null) };
}

/**
 * Reap pre-funded orders — BOTH abandoned PENDING checkouts and FUNDING rows whose fund call died
 * mid-confirm (crash, timeout, unreachable RPC) — older than `maxAgeSeconds`. Both hold the
 * per-listing/asset live-order lock and both reconcile identically off the chain:
 *  - no escrow on-chain → delete (atomic-conditional on the same state we read, so a fund call
 *    racing the reaper can't have its row deleted out from under a landing escrow);
 *  - FUNDED + matching → promote; FUNDED + mismatch → refund;
 *  - any other on-chain state → freeze + DISPUTED.
 * Per-order failures are isolated so one bad order can't stall the sweep. Called at the top of the
 * oracle cron.
 */
export async function expirePendingOrders(maxAgeSeconds: number = PENDING_FUNDING_MAX_AGE_SECONDS) {
  const now = nowSec();
  const cutoff = new Date((now - maxAgeSeconds) * 1000);
  const stale = await prisma.marketOrder.findMany({
    where: { state: { in: ["PENDING", "FUNDING"] }, createdAt: { lt: cutoff } },
    take: 200,
  });

  const results = { deleted: 0, promoted: 0, refunded: 0, disputed: 0, error: 0 };
  const escrow = getEscrowClient();
  for (const order of stale) {
    try {
      const chain = await escrow.get(order.id);
      if (!chain) {
        // Delete only if the row is still in the exact pre-funded state we read it in — if a live
        // fund call moved it (PENDING → FUNDING, or FUNDING → FUNDED) since the findMany, leave it.
        const del = await prisma.marketOrder.deleteMany({ where: { id: order.id, state: order.state } });
        if (del.count > 0) results.deleted += 1;
        continue;
      }
      if (chain.state === "FUNDED") {
        // Promote (or refund a mismatch). settlePendingFunding's writes are unconditional updates,
        // so promotion works identically for PENDING and FUNDING rows.
        const settled = await settlePendingFunding(order, null);
        if (settled.state === "FUNDED") results.promoted += 1;
        else if (settled.state === "REFUNDED") results.refunded += 1;
        else results.disputed += 1;
        continue;
      }
      // Unexpected: a pre-funded order whose escrow is in some non-FUNDED state (RELEASED /
      // REFUNDED / PROTECTION_HOLD / DISPUTED). Never guess — freeze (best-effort) and hand to an
      // operator.
      const reason = `${order.state} order found with escrow in unexpected state ${chain.state}`;
      console.error(`[market] expirePendingOrders: order ${order.id} — ${reason}`);
      if (chain.state !== "DISPUTED") {
        await escrow
          .freeze(order.id, reason)
          .catch((err) => console.error(`[market] order ${order.id}: freeze failed`, err));
      }
      await prisma.marketOrder.update({ where: { id: order.id }, data: { state: "DISPUTED", disputeReason: reason } });
      results.disputed += 1;
    } catch (err) {
      results.error += 1;
      console.error(`[market] expirePendingOrders: order ${order.id} failed`, err);
    }
  }
  return results;
}

/**
 * Seller marks the Steam trade sent — records the timestamp + a TradeAttempt for the oracle.
 * The trade-offer id is REQUIRED: it is the primary delivery evidence (trade-offer correlation).
 * Without it the oracle can never confirm delivery and the order would SLA-refund the buyer even
 * after an honest delivery.
 */
export async function markSellerSent(orderId: string, sellerId: string, tradeOfferId: string) {
  if (!/^\d{1,20}$/.test(tradeOfferId)) {
    throw new Error("a valid Steam trade offer id is required (digits only — from the trade offer URL)");
  }
  const order = await prisma.marketOrder.findUnique({ where: { id: orderId } });
  if (!order || order.sellerId !== sellerId) throw new Error("order not found");
  if (order.state !== "FUNDED") throw new Error("order is not awaiting delivery");
  await prisma.$transaction([
    prisma.marketOrder.update({ where: { id: orderId }, data: { sellerSentAt: new Date() } }),
    prisma.tradeAttempt.create({ data: { orderId, tradeOfferId, status: "SENT" } }),
  ]);
}

/**
 * PRIMARY delivery evidence for a FUNDED order: correlate the seller's actual outgoing Steam trade
 * offer to this order (decrypt the seller's stored API key → GetTradeOffer → GetTradeStatus), rather
 * than trusting a class-fungible inventory delta. See trade-correlation.ts for the pure decision.
 *
 * Fail-closed contract:
 *  - No trade-offer id recorded yet (seller hasn't sent) → not delivered (the reducer waits, then
 *    SLA-refunds the buyer). No Steam call needed.
 *  - A trade-offer id exists but the seller has no stored credential → THROW. A key is mandatory to
 *    list, so this is a data/config error; we refuse to guess (never fall back to the exploitable
 *    class-delta, never wrongly refund) — the cron isolates the tick.
 *  - Steam trade API transient failure → the fetchers throw SteamTradeUnavailableError, which
 *    propagates out so the cron skips this tick (never an auto-refund/release off a Steam blip).
 */
async function correlateFundedOrder(
  order: {
    id: string;
    sellerId: string;
    steamAssetId: string;
    classId: string;
    instanceId: string;
  },
  buyerSteamId64: string,
  buyerInventoryNow: readonly SteamAsset[],
  claimedAssetIds: readonly string[],
): Promise<CorrelatedDelivery> {
  const attempt = await prisma.tradeAttempt.findFirst({
    where: { orderId: order.id, tradeOfferId: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { tradeOfferId: true },
  });
  const tradeOfferId = attempt?.tradeOfferId ?? null;
  if (!tradeOfferId) {
    return {
      delivered: false,
      deliveredAssetId: null,
      tradeCompleted: false,
      reason: "seller has not sent the trade yet (no trade-offer id recorded)",
    };
  }

  const cred = await prisma.sellerSteamCredential.findUnique({ where: { userId: order.sellerId } });
  if (!cred) {
    throw new Error(
      `order ${order.id}: seller ${order.sellerId} has no Steam credential to correlate delivery (a key is mandatory to list)`,
    );
  }
  const apiKey = decryptSecret({ ciphertext: cred.encryptedApiKey, iv: cred.iv, authTag: cred.authTag });

  const offer = await fetchTradeOffer(apiKey, tradeOfferId);
  let trade: TradeStatus | null = null;
  if (offer && offer.trade_offer_state === ETradeOfferState.Accepted && offer.tradeid) {
    const trades = await fetchTradeStatus(apiKey, offer.tradeid);
    trade = trades.find((t) => t.tradeid === offer.tradeid) ?? null;
  }

  return correlateDelivery({
    offer,
    trade,
    listed: {
      appid: APPID_SBOX,
      contextid: STEAM_CONTEXT_ID,
      steamAssetId: order.steamAssetId,
      classid: order.classId,
      instanceid: order.instanceId,
    },
    buyerSteamId64,
    buyerInventoryNow,
    excludeAssetIds: new Set(claimedAssetIds),
  });
}

/**
 * Oracle tick for one order (called by the Chunk-5 cron). Fetches the buyer's live inventory,
 * asks the pure reducer what to do, and applies it (escrow tx + persisted state + timestamps).
 */
export async function tickOrder(orderId: string, buyerSteamId64: string) {
  const order = await prisma.marketOrder.findUnique({
    where: { id: orderId },
    include: { seller: { select: { steamId: true } } },
  });
  if (!order) throw new Error("order not found");
  if (order.state !== "FUNDED" && order.state !== "PROTECTION_HOLD") return { action: "wait" as const };

  const buyerInventoryNow = await fetchPublicInventory(buyerSteamId64);
  const now = nowSec();

  // Assetids already claimed as delivered by the buyer's OTHER orders of this exact skin — so one
  // incoming physical copy can't be counted as delivery for two concurrent orders (double-pay).
  let claimedAssetIds: string[] = [];
  let correlation: CorrelatedDelivery | undefined;
  if (order.state === "FUNDED") {
    const siblings = await prisma.marketOrder.findMany({
      where: {
        buyerId: order.buyerId,
        classId: order.classId,
        instanceId: order.instanceId,
        id: { not: order.id },
        deliveredAssetId: { not: null },
        state: { in: ["PROTECTION_HOLD", "DISPUTED", "RELEASED"] },
      },
      select: { deliveredAssetId: true },
    });
    claimedAssetIds = siblings.map((s) => s.deliveredAssetId).filter((x): x is string => !!x);
    // Correlation is the primary, required delivery evidence for FUNDED orders (never undefined here,
    // so the reducer's exploitable class-delta fallback is disabled on the production path).
    correlation = await correlateFundedOrder(order, buyerSteamId64, buyerInventoryNow, claimedAssetIds);
  }

  const action = nextOrderAction({
    state: order.state as "FUNDED" | "PROTECTION_HOLD",
    deliveryDeadline: Math.floor(order.deliveryDeadline.getTime() / 1000),
    protectionUntil: order.protectionUntil ? Math.floor(order.protectionUntil.getTime() / 1000) : null,
    deliveredAssetId: order.deliveredAssetId,
    classid: order.classId,
    instanceid: order.instanceId,
    beforeSnapshot: priorAssets(order),
    buyerInventoryNow,
    claimedAssetIds,
    correlation,
    now,
  });

  // Idempotent/reconciling: the escrow tx and the DB write aren't atomic, so a DB failure after an
  // escrow tx would otherwise re-issue the tx next tick and throw on the already-advanced escrow.
  // Read the escrow's current state and, per action, write the DB ONLY when the chain is either the
  // expected PREcondition (we issue the tx now) or the expected POSTcondition (the tx already landed
  // on a previous tick — catch-up write, tx skipped). On ANY other chain state — including a null
  // chain while the DB says FUNDED/PROTECTION_HOLD — the DB must never advance against a
  // contradictory chain (e.g. a partially-failed freeze/resolve left the chain DISPUTED): log loudly
  // and wait for the operator / a later tick to reconcile.
  const escrow = getEscrowClient();
  const chain = await escrow.get(orderId);
  const contradictory = (expected: string): { action: "wait" } => {
    console.error(
      `[market] tickOrder ${orderId}: refusing to advance DB (db=${order.state}, chain=${chain?.state ?? "null"}) — ` +
        `expected chain ${expected}; waiting for reconciliation`,
    );
    return { action: "wait" as const };
  };
  switch (action.type) {
    case "confirm_delivery": {
      // FUNDED → PROTECTION_HOLD: issue on chain FUNDED, catch up on chain PROTECTION_HOLD.
      // Capture the confirm_delivery tx signature (the ledger's delivery-verification proof link);
      // null on the catch-up path where the tx already landed a previous tick.
      let confirmSig: string | null = null;
      if (chain?.state === "FUNDED") ({ signature: confirmSig } = await escrow.confirmDelivery(orderId, PROTECTION_PERIOD_SECONDS, now));
      else if (chain?.state !== "PROTECTION_HOLD") return contradictory("FUNDED or PROTECTION_HOLD");
      await prisma.marketOrder.update({
        where: { id: orderId },
        data: {
          state: "PROTECTION_HOLD",
          deliveredAssetId: action.deliveredAssetId,
          deliveredAt: new Date(now * 1000),
          protectionStartedAt: new Date(now * 1000),
          protectionUntil: new Date((now + PROTECTION_PERIOD_SECONDS) * 1000),
          ...(confirmSig ? { confirmTxSig: confirmSig } : {}),
        },
      });
      break;
    }
    case "release": {
      // PROTECTION_HOLD → RELEASED: issue on chain PROTECTION_HOLD, catch up on chain RELEASED.
      let settleSig: string | null = null;
      if (chain?.state === "PROTECTION_HOLD") ({ signature: settleSig } = await escrow.release(orderId, now));
      else if (chain?.state !== "RELEASED") return contradictory("PROTECTION_HOLD or RELEASED");
      await prisma.marketOrder.update({
        where: { id: orderId },
        data: { state: "RELEASED", releasedAt: new Date(now * 1000), ...(settleSig ? { settleTxSig: settleSig } : {}) },
      });
      break;
    }
    case "refund": {
      // FUNDED → REFUNDED (SLA refund): issue on chain FUNDED, catch up on chain REFUNDED.
      let settleSig: string | null = null;
      if (chain?.state === "FUNDED") ({ signature: settleSig } = await escrow.refund(orderId, now));
      else if (chain?.state !== "REFUNDED") return contradictory("FUNDED or REFUNDED");
      // The REFUNDED marking MUST land; the relist is best-effort so a listing conflict can't roll
      // it back (which would zombie the order into a perpetual re-refund loop).
      await prisma.marketOrder.update({
        where: { id: orderId },
        data: {
          state: "REFUNDED",
          refundedAt: new Date(now * 1000),
          disputeReason: action.reason,
          ...(settleSig ? { settleTxSig: settleSig } : {}),
        },
      });
      await prisma.marketListing
        .update({ where: { id: order.listingId }, data: { status: "ACTIVE" } })
        .catch((err) => console.error(`[market] order ${orderId}: refunded, relist failed`, err));
      break;
    }
    case "dispute": {
      // FUNDED|PROTECTION_HOLD → DISPUTED: freeze on either live chain state, catch up on chain
      // DISPUTED. Anything else (null / RELEASED / REFUNDED) contradicts the freeze intent → wait.
      const chainLive = chain?.state === "FUNDED" || chain?.state === "PROTECTION_HOLD";
      if (!chainLive && chain?.state !== "DISPUTED") {
        return contradictory("FUNDED, PROTECTION_HOLD, or DISPUTED");
      }

      // Two paths land here, neither may auto-refund (s&box has no Valve reversal):
      //  - PROTECTION_HOLD: the delivered item vanished from the buyer's inventory. Gather
      //    return-to-seller evidence best-effort (a failed seller read must not block the freeze).
      //  - FUNDED at the SLA deadline: Steam says the trade COMPLETED but corroboration failed
      //    (inventory lag / instant re-trade / sibling claim) — refunding would double-pay the buyer.
      let evidence: Prisma.InputJsonValue;
      if (order.state === "PROTECTION_HOLD") {
        let sellerInventory: SteamAsset[] | null = null;
        if (order.seller?.steamId) {
          sellerInventory = await fetchPublicInventory(order.seller.steamId).catch(() => null);
        }
        evidence = {
          kind: "hold_disappearance",
          deliveredAssetId: order.deliveredAssetId,
          reason: action.reason,
          ...classifyHoldDisappearance(sellerInventory, order.classId, order.instanceId),
        };
      } else {
        evidence = { kind: "uncorroborated_completed_trade", reason: action.reason };
      }

      if (chainLive) {
        await escrow.freeze(orderId, action.reason);
      }
      await prisma.$transaction([
        prisma.marketOrder.update({
          where: { id: orderId },
          data: { state: "DISPUTED", disputeReason: action.reason },
        }),
        prisma.tradeAttempt.create({ data: { orderId, status: "DISPUTED", evidence } }),
      ]);
      break;
    }
    case "wait":
      break;
  }
  return { action: action.type };
}

/**
 * A party toggles whether their Steam identity shows on the public trust ledger. The party is
 * INFERRED from the session user: the buyer sets `buyerPublic`, the seller sets `sellerPublic`.
 * Anyone who is neither gets the same "order not found" as a missing order (no existence leak).
 * Allowed in any lifecycle state — a user can hide/show a completed trade after the fact. Amounts
 * and on-chain proof stay public regardless; this only gates identity. Returns both flags so the
 * caller can reflect the new state.
 */
export async function setOrderPartyPublic(orderId: string, userId: string, isPublic: boolean) {
  const order = await prisma.marketOrder.findUnique({
    where: { id: orderId },
    select: { buyerId: true, sellerId: true },
  });
  if (!order || (order.buyerId !== userId && order.sellerId !== userId)) throw new Error("order not found");
  const data = order.buyerId === userId ? { buyerPublic: isPublic } : { sellerPublic: isPublic };
  const updated = await prisma.marketOrder.update({
    where: { id: orderId },
    data,
    select: { buyerPublic: true, sellerPublic: true },
  });
  return { role: order.buyerId === userId ? ("buyer" as const) : ("seller" as const), ...updated };
}

/** Buyer or seller contests → freeze the escrow for operator resolution. */
export async function openDispute(orderId: string, byUserId: string, reason: string) {
  const order = await prisma.marketOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new Error("order not found");
  if (order.buyerId !== byUserId && order.sellerId !== byUserId) throw new Error("not your order");
  if (order.state !== "FUNDED" && order.state !== "PROTECTION_HOLD") throw new Error("order can't be disputed");
  await getEscrowClient().freeze(orderId, reason);
  await prisma.marketOrder.update({
    where: { id: orderId },
    data: { state: "DISPUTED", disputeReason: reason },
  });
}

/**
 * Operator resolves a dispute → release to seller (respecting the hold) or refund the buyer.
 * Mirrors the escrow's ACTUAL post-resolve state: resolving a PRE-DELIVERY dispute for the seller
 * doesn't release — it STARTS the protection hold (deadlock fix in the escrow/program); the oracle
 * tick then releases once it elapses.
 */
export async function resolveDispute(orderId: string, outcome: "release" | "refund") {
  const order = await prisma.marketOrder.findUnique({ where: { id: orderId } });
  if (!order || order.state !== "DISPUTED") throw new Error("order is not disputed");
  const now = nowSec();
  const { escrow, signature } = await getEscrowClient().resolve(orderId, outcome, now);
  await prisma.marketOrder.update({
    where: { id: orderId },
    data:
      escrow.state === "PROTECTION_HOLD"
        ? {
            // Pre-delivery dispute decided for the seller only STARTS the hold — no payout tx yet, so
            // no settleTxSig here; the eventual tickOrder release records it.
            state: "PROTECTION_HOLD",
            protectionStartedAt: new Date(now * 1000),
            protectionUntil: new Date((escrow.protectionUntil ?? now) * 1000),
          }
        : outcome === "release"
          ? { state: "RELEASED", releasedAt: new Date(now * 1000), ...(signature ? { settleTxSig: signature } : {}) }
          : { state: "REFUNDED", refundedAt: new Date(now * 1000), ...(signature ? { settleTxSig: signature } : {}) },
  });
}
