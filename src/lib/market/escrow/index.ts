import type { EscrowClient } from "./types";
import { MockEscrowClient } from "./mock";
import { SolanaEscrowClient } from "./solana";

export * from "./types";
export { MockEscrowClient } from "./mock";
export { SolanaEscrowClient } from "./solana";

let singleton: EscrowClient | null = null;

/**
 * The active escrow client, memoized. Selected by env:
 *   - `MARKET_ESCROW_CLIENT=solana` → the production {@link SolanaEscrowClient} (talks to the
 *     on-chain Anchor program; requires SOLANA_RPC_URL / MARKET_ESCROW_PROGRAM_ID /
 *     MARKET_AUTHORIZER_KEYPAIR / MARKET_USDC_MINT / MARKET_FEE_ATA — validated on construction).
 *   - anything else (default) → the in-memory {@link MockEscrowClient} for dev + tests.
 *
 * Construction is LAZY (first call) so a bare `next build` with the Solana env vars absent doesn't
 * crash at module load — validation only fires when the Solana client is actually selected + used.
 * Single entry point so callers never import a concrete impl directly.
 */
export function getEscrowClient(): EscrowClient {
  if (!singleton) {
    singleton =
      process.env.MARKET_ESCROW_CLIENT === "solana" ? new SolanaEscrowClient() : new MockEscrowClient();
  }
  return singleton;
}

/** Test hook: reset the singleton between tests. */
export function __resetEscrowClient(): void {
  singleton = null;
}
