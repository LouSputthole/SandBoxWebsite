/**
 * Feature flag for crypto escrow. Set `ESCROW_ENABLED=1` in env to
 * surface the buy-now flow in the UI + accept new trades. Without it:
 *
 *   - /api/escrow/* endpoints return 503
 *   - Buy-now button is hidden on listings
 *   - Webhook receivers still verify + log events but no DB mutation
 *
 * Phase 2 also has a hard cap on trade size to bound exposure during
 * the early-operations period. Set ESCROW_MAX_USD to override the
 * default; trades over the cap are rejected with a clear error.
 */

export function isEscrowEnabled(): boolean {
  return process.env.ESCROW_ENABLED === "1";
}

export function escrowMaxUsd(): number {
  const raw = process.env.ESCROW_MAX_USD;
  if (!raw) return 200;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 200;
}

/** Required env vars for escrow to function. Used by /admin/storage-
 *  style readiness check + by createCharge to throw early. */
export const REQUIRED_ENV = [
  "COINBASE_COMMERCE_API_KEY",
  "COINBASE_COMMERCE_WEBHOOK_SECRET",
] as const;

export function escrowEnvMissing(): string[] {
  return REQUIRED_ENV.filter((k) => !process.env[k]);
}
