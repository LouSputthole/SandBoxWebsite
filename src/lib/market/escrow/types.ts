import type { EscrowState } from "../escrow-state";

/**
 * Abstraction over the on-chain escrow program (`solana/sbox-escrow`). The in-memory mock backs
 * local dev + tests and enforces the same invariants as the program; the Solana implementation
 * (added once the Anchor program's IDL exists) talks to the real program.
 *
 * `now` (unix seconds) is honoured by the mock so tests can drive the program's Clock-gated
 * checks deterministically. The real client ignores it — the on-chain program reads its own Clock.
 */

export interface OpenEscrowParams {
  /** Our `MarketOrder.id` — the mock/program keys the escrow off this. */
  orderId: string;
  /** Buyer's Solana wallet (base58) — funds the escrow. */
  buyer: string;
  /** Seller's Solana wallet (base58) — receives payout. */
  seller: string;
  /** USDC base units (6 decimals). */
  amount: bigint;
  /** Marketplace fee in basis points (360 = 3.6%). */
  feeBps: number;
  /** Seller must send the Steam trade by this unix-seconds deadline, else buyer refund. */
  deliveryDeadline: number;
}

export interface EscrowRecord {
  orderId: string;
  escrowPda: string;
  onchainOrderId: string;
  buyer: string;
  seller: string;
  amount: bigint;
  feeBps: number;
  state: EscrowState;
  deliveryDeadline: number;
  /** Set on `confirmDelivery`: payout can't release until this unix-seconds time. */
  protectionUntil: number | null;
}

export interface TxResult {
  signature: string;
  escrow: EscrowRecord;
}

/**
 * Thrown when an on-chain escrow EXISTS but does not match what our order expects
 * (wrong buyer / seller / amount) — i.e. a tampered client funded the PDA with different values.
 * Distinguishable from transient "not funded yet" / RPC errors so the service can react by
 * refunding the buyer instead of ever marking the order FUNDED. Never thrown for a not-yet-funded
 * (missing) or not-FUNDED escrow — those are ordinary retry conditions, not tampering.
 */
export class EscrowMismatchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EscrowMismatchError";
  }
}

/**
 * Thrown by {@link EscrowClient.submitAndVerifyOpenEscrow} when the buyer's open_escrow tx failed
 * BECAUSE its blockhash aged out (a PENDING order lives ~10 min but a Solana blockhash is only valid
 * ~60–90s) AND a follow-up read confirms NO escrow landed on-chain. This is a proven not-funded,
 * safe-to-retry condition: the service reverts the funding claim (FUNDING → PENDING) and re-prepares
 * a fresh tx for the buyer to sign, rather than stranding the order. Never thrown once any escrow
 * exists on-chain (that path falls through to ordinary verification / mismatch handling).
 */
export class EscrowTxExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EscrowTxExpiredError";
  }
}

export interface EscrowClient {
  /**
   * Phase 1 of the buyer-signed open flow. Returns the transaction the BUYER must sign in their
   * wallet, base64-serialized — or `{ txBase64: null }` when there is nothing to sign (the mock:
   * it opens the escrow directly in {@link submitAndVerifyOpenEscrow}). NB: there is deliberately no
   * `openEscrow` on this interface — on-chain `open_escrow` is buyer-signed, so the backend can never
   * open an escrow server-side. Service code must go prepare → (buyer signs) → submitAndVerify.
   */
  prepareOpenEscrow(params: OpenEscrowParams): Promise<{ txBase64: string | null }>;
  /**
   * Phase 2 of the buyer-signed open flow. If `signedTxBase64` is provided, submit + confirm it, then
   * assert the resulting on-chain escrow is FUNDED and matches `params`. If it is null (recovery /
   * reconcile path, e.g. the cron reaper), skip submission and just verify. Idempotent: a retry after
   * the tx already landed returns the existing FUNDED record instead of erroring. Throws
   * {@link EscrowMismatchError} when an escrow exists but does not match (tampered funding).
   *
   * Returns the verified `record` plus the funding-tx `signature` for the public trust ledger:
   * the open_escrow tx signature when this call had a signed tx to submit (recovered from the tx
   * itself, so it survives the already-processed / expired-but-landed retry paths), or `null` on the
   * pure-verify / reconcile path (and always null for the mock).
   */
  submitAndVerifyOpenEscrow(
    params: OpenEscrowParams,
    signedTxBase64: string | null,
  ): Promise<{ record: EscrowRecord; signature: string | null }>;
  /** Authorizer confirms the exact item was delivered → starts the protection hold. */
  confirmDelivery(orderId: string, protectionPeriodSeconds: number, now: number): Promise<TxResult>;
  /** Authorizer releases funds to the seller (minus fee). Only after the hold elapses. */
  release(orderId: string, now: number): Promise<TxResult>;
  /** Refund the buyer in full (delivery SLA missed, or a reversal during the hold). */
  refund(orderId: string, now: number): Promise<TxResult>;
  /** Freeze a contested escrow. State → DISPUTED. */
  freeze(orderId: string, reason?: string): Promise<TxResult>;
  /** Operator resolves a dispute → release to seller (respecting the hold) or refund the buyer. */
  resolve(orderId: string, outcome: "release" | "refund", now: number): Promise<TxResult>;
  /** Read the current escrow record, or null if none. */
  get(orderId: string): Promise<EscrowRecord | null>;
}
