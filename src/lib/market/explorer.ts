/**
 * Solana explorer links for the public trust ledger + admin dashboard. Both an address (escrow PDA,
 * wallet) and a transaction signature get a deep link so anyone can verify the money movement on
 * chain themselves — the whole point of the ledger.
 *
 * TODO: cluster is hardcoded to devnet for the current phase — swap to "mainnet-beta" (or derive it
 * from env) at launch. Single source of truth so there's exactly one place to flip.
 */
const SOLANA_CLUSTER = "devnet";

/** Explorer link for an on-chain address (escrow PDA, wallet, mint). */
export function explorerAddressUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=${SOLANA_CLUSTER}`;
}

/** Explorer link for a transaction signature. */
export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=${SOLANA_CLUSTER}`;
}
