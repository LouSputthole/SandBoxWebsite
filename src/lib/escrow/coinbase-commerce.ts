import { createHmac, timingSafeEqual } from "crypto";
import type {
  ChargeStatus,
  CreateChargeInput,
  CreatedCharge,
  PaymentProcessor,
  ProcessorChargeStatus,
  VerifiedWebhookEvent,
} from "./payment-processor";

/**
 * Coinbase Commerce concrete implementation of PaymentProcessor.
 *
 * Why Coinbase Commerce vs. BitPay vs. self-hosted:
 *   - Lowest friction (no money-transmission license, hosted checkout
 *     handles every UX gotcha for us).
 *   - Multi-currency by default — buyer picks USDC / BTC / ETH on the
 *     hosted page, we just quote USD on our side.
 *   - HMAC-signed webhooks (no shared secret in URL, no IP allowlisting
 *     pain).
 *
 * Env vars required to enable:
 *   COINBASE_COMMERCE_API_KEY      — server-side calls
 *   COINBASE_COMMERCE_WEBHOOK_SECRET — HMAC verify
 *
 * If either is missing, this client throws on use. The escrow feature
 * flag (ESCROW_ENABLED env var) gates whether we expose buy-now in the
 * UI at all, so the throws are reachable only when the operator has
 * explicitly turned the feature on.
 */

const API_BASE = "https://api.commerce.coinbase.com";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} not set — Coinbase Commerce processor cannot operate. Set it in Vercel env vars or disable escrow with ESCROW_ENABLED=0.`,
    );
  }
  return v;
}

/**
 * Map Coinbase Commerce charge timeline events to our canonical status
 * enum. CC's timeline is a list of {status, time} entries; the latest
 * one is the source of truth.
 *
 * Reference (CC docs): NEW → PENDING (broadcasted) → COMPLETED /
 *   CONFIRMED (post-confirmations). UNRESOLVED is anything weird (under
 *   /over payment, late) — we treat it as failed and surface to admin.
 */
function mapCoinbaseStatus(timeline: { status: string }[]): ProcessorChargeStatus {
  if (!timeline || timeline.length === 0) return "new";
  const latest = timeline[timeline.length - 1].status.toUpperCase();
  switch (latest) {
    case "NEW":
      return "new";
    case "PENDING":
      return "pending";
    case "COMPLETED":
    case "CONFIRMED":
      return "confirmed";
    case "EXPIRED":
      return "expired";
    case "RESOLVED":
      return "resolved";
    case "UNRESOLVED":
    case "CANCELED":
    default:
      return "failed";
  }
}

interface CoinbaseChargeResponse {
  data: {
    id: string;
    code: string;
    hosted_url: string;
    timeline: { status: string; time: string }[];
    pricing?: Record<string, { amount: string; currency: string }>;
    payments?: Array<{
      value?: { local?: { amount: string; currency: string } };
    }>;
    expires_at?: string;
  };
}

export const coinbaseCommerce: PaymentProcessor = {
  name: "coinbase_commerce",

  async createCharge(input: CreateChargeInput): Promise<CreatedCharge> {
    const apiKey = requireEnv("COINBASE_COMMERCE_API_KEY");
    const res = await fetch(`${API_BASE}/charges`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CC-Api-Key": apiKey,
        "X-CC-Version": "2018-03-22",
      },
      body: JSON.stringify({
        // CC's required schema. local_price is what we quote;
        // pricing_type "fixed_price" pegs it (vs no_price for tips).
        name: "sboxskins.gg escrow trade",
        description: input.description.slice(0, 200),
        pricing_type: "fixed_price",
        local_price: { amount: input.amountUsd.toFixed(2), currency: "USD" },
        // CC echoes metadata back on every webhook event — we use this
        // to look up the trade without trusting URL params.
        metadata: { tradeId: input.tradeId },
        redirect_url: input.redirectUrl,
        cancel_url: input.cancelUrl,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `Coinbase Commerce createCharge failed (${res.status}): ${text.slice(0, 500)}`,
      );
    }

    const json = (await res.json()) as CoinbaseChargeResponse;
    const data = json.data;
    const pricing = data.pricing
      ? Object.entries(data.pricing).map(([currency, v]) => ({
          currency,
          amount: v.amount,
        }))
      : undefined;

    return {
      processorChargeId: data.id,
      hostedUrl: data.hosted_url,
      pricing,
      expiresAt: data.expires_at ? new Date(data.expires_at) : undefined,
    };
  },

  async getCharge(processorChargeId: string): Promise<ChargeStatus> {
    const apiKey = requireEnv("COINBASE_COMMERCE_API_KEY");
    const res = await fetch(`${API_BASE}/charges/${processorChargeId}`, {
      headers: {
        "X-CC-Api-Key": apiKey,
        "X-CC-Version": "2018-03-22",
      },
    });
    if (!res.ok) {
      throw new Error(
        `Coinbase Commerce getCharge failed (${res.status})`,
      );
    }
    const json = (await res.json()) as CoinbaseChargeResponse;
    const data = json.data;
    const status = mapCoinbaseStatus(data.timeline);
    // For settled charges, surface the actual paid amount + currency
    // (which can differ from local_price after the buyer's chosen
    // currency converts — e.g. BTC settled = USD locked at confirm time).
    const lastPay = data.payments?.[data.payments.length - 1];
    return {
      processorChargeId: data.id,
      status,
      amountSettled: lastPay?.value?.local?.amount,
      currencySettled: lastPay?.value?.local?.currency,
      paidAt:
        status === "confirmed" || status === "resolved"
          ? new Date(
              data.timeline[data.timeline.length - 1]?.time ?? Date.now(),
            )
          : undefined,
    };
  },

  /**
   * Verify the X-CC-Webhook-Signature header against the raw body using
   * HMAC-SHA256 with the webhook shared secret. Coinbase signs the
   * exact request body; any reformatting (Express's automatic JSON
   * parse + re-stringify) breaks the signature, which is why callers
   * MUST pass the raw body string.
   */
  verifyWebhook(
    rawBody: string,
    signatureHeader: string | null,
  ): VerifiedWebhookEvent | null {
    if (!signatureHeader) return null;
    const secret = process.env.COINBASE_COMMERCE_WEBHOOK_SECRET;
    if (!secret) return null;

    const expected = createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    const provided = signatureHeader.trim();

    // Constant-time compare to avoid timing oracles.
    if (expected.length !== provided.length) return null;
    if (
      !timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"))
    ) {
      return null;
    }

    let parsed: {
      event?: {
        id?: string;
        type?: string;
        data?: {
          id?: string;
          timeline?: { status: string; time: string }[];
          payments?: Array<{
            value?: { local?: { amount: string; currency: string } };
          }>;
        };
      };
    };
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return null;
    }

    const event = parsed.event;
    if (!event?.id || !event.type || !event.data?.id) return null;

    const status = mapCoinbaseStatus(event.data.timeline ?? []);
    const lastPay = event.data.payments?.[event.data.payments.length - 1];

    return {
      eventId: event.id,
      type: event.type,
      processorChargeId: event.data.id,
      status,
      amountSettled: lastPay?.value?.local?.amount,
      currencySettled: lastPay?.value?.local?.currency,
      raw: parsed,
    };
  },
};
