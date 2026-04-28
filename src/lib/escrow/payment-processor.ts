/**
 * Payment processor abstraction. Today we only have Coinbase Commerce
 * (crypto-only Phase 2 — no card surface, no money-transmission
 * licensing exposure). The interface is here so swapping to BitPay or
 * adding Stripe Connect in Phase 3 is a one-file change.
 *
 * Every processor must:
 *   1. createCharge — given USD amount + metadata, return a hosted-
 *      checkout URL the buyer is redirected to + a stable charge id we
 *      store on Payment.processorChargeId.
 *   2. getCharge — pull current state from the processor (used for
 *      reconciliation polls in case a webhook is missed).
 *   3. verifyWebhook — given raw request body + signature header,
 *      return parsed event or null. ALWAYS used before trusting a
 *      webhook payload — never parse a webhook without verifying.
 */

export type ProcessorChargeStatus =
  | "new"
  | "pending"
  | "confirmed"
  | "failed"
  | "expired"
  | "resolved";

export interface CreateChargeInput {
  /** Internal id used for idempotency + cross-reference in webhooks. */
  tradeId: string;
  amountUsd: number;
  /** Buyer-facing description shown on the hosted checkout page. */
  description: string;
  /** Where the buyer is redirected after pay. */
  redirectUrl: string;
  /** Where the buyer is redirected if they cancel out of checkout. */
  cancelUrl: string;
}

export interface CreatedCharge {
  processorChargeId: string;
  hostedUrl: string;
  /** Optional pre-filled crypto pricing if the processor returns it on
   *  create. Coinbase Commerce does (multiple currencies). */
  pricing?: Array<{ currency: string; amount: string }>;
  expiresAt?: Date;
}

export interface ChargeStatus {
  processorChargeId: string;
  status: ProcessorChargeStatus;
  amountSettled?: string;
  currencySettled?: string;
  paidAt?: Date;
}

export interface VerifiedWebhookEvent {
  /** Stable id from the processor — used for idempotent processing
   *  (the same event can arrive twice; we dedupe on this). */
  eventId: string;
  type: string; // e.g. "charge:confirmed"
  processorChargeId: string;
  status: ProcessorChargeStatus;
  amountSettled?: string;
  currencySettled?: string;
  raw: unknown;
}

export interface PaymentProcessor {
  readonly name: string;
  createCharge(input: CreateChargeInput): Promise<CreatedCharge>;
  getCharge(processorChargeId: string): Promise<ChargeStatus>;
  /**
   * Verify HMAC signature + parse. Returns null on signature mismatch,
   * malformed body, or missing required fields. Callers MUST treat
   * null as "ignore this webhook entirely" — do not attempt to recover.
   */
  verifyWebhook(
    rawBody: string,
    signatureHeader: string | null,
  ): VerifiedWebhookEvent | null;
}
