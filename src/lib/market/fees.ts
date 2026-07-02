/**
 * Marketplace money math. All USDC amounts are **base units** (bigint, 6 decimals —
 * 1 USDC = 1_000_000) so there is never any float rounding on the money path.
 *
 * NB: tsconfig targets ES2017, which has no `n` BigInt literal suffix — use the `BigInt()`
 * constructor throughout (same convention as `src/lib/trade/url.ts`).
 */

/** Marketplace fee in basis points. 360 bps = 3.6% (the lowest in the S&box skin space). */
export const FEE_BPS = 360;

/** USDC has 6 decimals. */
export const USDC_DECIMALS = 6;

const ZERO = BigInt(0);
const USDC_SCALE = BigInt(1_000_000);
const BPS_DENOM = BigInt(10_000);
const HUNDRED = BigInt(100);

export interface FeeSplit {
  /** What the seller receives, in USDC base units. */
  sellerAmount: bigint;
  /** The marketplace fee, in USDC base units. */
  feeAmount: bigint;
}

/**
 * Split a gross amount into seller proceeds and the marketplace fee.
 * Rounding-safe by construction: `feeAmount = amount − sellerAmount`, so the two
 * always sum back to exactly `amount` (no dust created or lost).
 */
export function splitFee(amount: bigint, feeBps: number = FEE_BPS): FeeSplit {
  if (amount < ZERO) throw new Error("amount must be non-negative");
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 10_000) {
    throw new Error("feeBps must be an integer in [0, 10000]");
  }
  const feeAmount = (amount * BigInt(feeBps)) / BPS_DENOM; // floor
  const sellerAmount = amount - feeAmount;
  return { sellerAmount, feeAmount };
}

/**
 * Convert a USD price (dollars, as a number) to USDC base units.
 * Rounds to whole cents first so float dust in the input can't leak into the amount.
 */
export function usdToUsdcBaseUnits(usd: number): bigint {
  if (!Number.isFinite(usd) || usd < 0) throw new Error("invalid usd amount");
  const cents = BigInt(Math.round(usd * 100));
  return cents * (USDC_SCALE / HUNDRED); // cents → 6-decimal base units
}

/** Format USDC base units back to a human dollar string (e.g. 1_500_000 → "1.50"). */
export function formatUsdc(baseUnits: bigint): string {
  const negative = baseUnits < ZERO;
  const abs = negative ? -baseUnits : baseUnits;
  const whole = abs / USDC_SCALE;
  const frac = (abs % USDC_SCALE).toString().padStart(USDC_DECIMALS, "0").slice(0, 2);
  return `${negative ? "-" : ""}${whole}.${frac}`;
}
