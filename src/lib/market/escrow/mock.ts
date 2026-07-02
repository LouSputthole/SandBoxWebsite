import { splitFee } from "../fees";
import { PROTECTION_PERIOD_SECONDS, assertTransition, releaseAllowed } from "../escrow-state";
import { EscrowMismatchError, type EscrowClient, type EscrowRecord, type OpenEscrowParams, type TxResult } from "./types";

export interface Payout {
  to: string;
  amount: bigint;
  kind: "seller" | "fee" | "refund";
  orderId: string;
}

/**
 * In-memory escrow for dev + tests. Enforces the SAME invariants the on-chain program does —
 * legal state transitions, the protection-hold release gate, and the fee split — plus a payout
 * ledger so tests can assert fund conservation. No signatures / no auth here: on-chain that's the
 * authorizer's job (covered by the Anchor tests); this models state + money movement only.
 */
export class MockEscrowClient implements EscrowClient {
  private readonly escrows = new Map<string, EscrowRecord>();
  /** Every fund movement out of a vault — for test assertions. */
  readonly payouts: Payout[] = [];
  private seq = 0;

  /**
   * NOT on the {@link EscrowClient} interface (on-chain open is buyer-signed) — kept public for the
   * mock's own tests + as the shared "create the funded escrow" internal used by
   * {@link submitAndVerifyOpenEscrow}. Rejects a duplicate order id so callers must use the
   * idempotent two-phase path for retries.
   */
  async openEscrow(p: OpenEscrowParams): Promise<TxResult> {
    if (this.escrows.has(p.orderId)) throw new Error(`escrow already exists for order ${p.orderId}`);
    if (p.amount < BigInt(0)) throw new Error("amount must be non-negative");
    if (p.buyer === p.seller) throw new Error("buyer and seller must differ");
    const rec: EscrowRecord = {
      orderId: p.orderId,
      escrowPda: `mock-pda-${p.orderId}`,
      onchainOrderId: `mock-oid-${p.orderId}`,
      buyer: p.buyer,
      seller: p.seller,
      amount: p.amount,
      feeBps: p.feeBps,
      state: "FUNDED",
      deliveryDeadline: p.deliveryDeadline,
      protectionUntil: null,
    };
    this.escrows.set(p.orderId, rec);
    return this.tx(rec);
  }

  /** Nothing for the buyer to sign in dev — the mock opens the escrow directly in submitAndVerify. */
  async prepareOpenEscrow(_p: OpenEscrowParams): Promise<{ txBase64: string | null }> {
    void _p;
    return { txBase64: null };
  }

  /**
   * Two-phase open, mock side: `signedTxBase64` is ignored (no chain). Creates the FUNDED escrow from
   * `p` exactly like {@link openEscrow}. Idempotent: if an escrow already exists it returns it when it
   * matches, or throws {@link EscrowMismatchError} when buyer/seller/amount differ (tampered funding).
   * The ledger funding signature is always `null` off-chain (there is no real open_escrow tx).
   */
  async submitAndVerifyOpenEscrow(
    p: OpenEscrowParams,
    signedTxBase64: string | null,
  ): Promise<{ record: EscrowRecord; signature: string | null }> {
    void signedTxBase64;
    const existing = this.escrows.get(p.orderId);
    if (existing) {
      if (existing.buyer !== p.buyer || existing.seller !== p.seller || existing.amount !== p.amount) {
        throw new EscrowMismatchError(
          `escrow for order ${p.orderId} does not match: on-chain buyer=${existing.buyer} seller=${existing.seller} ` +
            `amount=${existing.amount}, expected buyer=${p.buyer} seller=${p.seller} amount=${p.amount}`,
        );
      }
      return { record: { ...existing }, signature: null };
    }
    const { escrow } = await this.openEscrow(p);
    return { record: escrow, signature: null };
  }

  async confirmDelivery(orderId: string, protectionPeriodSeconds: number, now: number): Promise<TxResult> {
    const rec = this.must(orderId);
    assertTransition(rec.state, "PROTECTION_HOLD");
    rec.state = "PROTECTION_HOLD";
    rec.protectionUntil = now + protectionPeriodSeconds;
    return this.tx(rec);
  }

  async release(orderId: string, now: number): Promise<TxResult> {
    const rec = this.must(orderId);
    const until = rec.protectionUntil ?? Number.MAX_SAFE_INTEGER;
    if (!releaseAllowed(rec.state, until, now)) {
      throw new Error(
        `release not allowed (order=${orderId}, state=${rec.state}, protectionUntil=${rec.protectionUntil}, now=${now})`,
      );
    }
    assertTransition(rec.state, "RELEASED");
    this.payOut(rec);
    rec.state = "RELEASED";
    return this.tx(rec);
  }

  async refund(orderId: string, now: number): Promise<TxResult> {
    void now; // signature parity with EscrowClient; the mock's refund isn't time-gated
    const rec = this.must(orderId);
    assertTransition(rec.state, "REFUNDED");
    this.payouts.push({ to: rec.buyer, amount: rec.amount, kind: "refund", orderId });
    rec.state = "REFUNDED";
    return this.tx(rec);
  }

  async freeze(orderId: string, reason?: string): Promise<TxResult> {
    void reason; // freeze reason is persisted by the service layer, not the escrow record
    const rec = this.must(orderId);
    assertTransition(rec.state, "DISPUTED");
    rec.state = "DISPUTED";
    return this.tx(rec);
  }

  async resolve(orderId: string, outcome: "release" | "refund", now: number): Promise<TxResult> {
    const rec = this.must(orderId);
    if (rec.state !== "DISPUTED") throw new Error(`resolve requires DISPUTED, got ${rec.state}`);
    if (outcome === "release") {
      if (rec.protectionUntil === null) {
        // Pre-delivery dispute (frozen from FUNDED): the hold never started, so deciding for the
        // seller STARTS it rather than failing forever (the old behavior deadlocked — only refund
        // was reachable). Instant release stays impossible. Mirrors lib.rs resolve().
        rec.protectionUntil = now + PROTECTION_PERIOD_SECONDS;
        assertTransition(rec.state, "PROTECTION_HOLD");
        rec.state = "PROTECTION_HOLD";
        return this.tx(rec);
      }
      // The operator can't front-run the hold — a release still needs it elapsed.
      if (now < rec.protectionUntil) {
        throw new Error("cannot release before the protection window elapses");
      }
      this.payOut(rec);
      rec.state = "RELEASED";
    } else {
      this.payouts.push({ to: rec.buyer, amount: rec.amount, kind: "refund", orderId });
      rec.state = "REFUNDED";
    }
    return this.tx(rec);
  }

  async get(orderId: string): Promise<EscrowRecord | null> {
    const rec = this.escrows.get(orderId);
    return rec ? { ...rec } : null;
  }

  private payOut(rec: EscrowRecord): void {
    const { sellerAmount, feeAmount } = splitFee(rec.amount, rec.feeBps);
    this.payouts.push({ to: rec.seller, amount: sellerAmount, kind: "seller", orderId: rec.orderId });
    this.payouts.push({ to: "fee-account", amount: feeAmount, kind: "fee", orderId: rec.orderId });
  }

  private must(orderId: string): EscrowRecord {
    const rec = this.escrows.get(orderId);
    if (!rec) throw new Error(`no escrow for order ${orderId}`);
    return rec;
  }

  private tx(rec: EscrowRecord): TxResult {
    return { signature: `mock-sig-${++this.seq}`, escrow: { ...rec } };
  }
}
