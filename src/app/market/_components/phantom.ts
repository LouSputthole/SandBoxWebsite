import type { Transaction } from "@solana/web3.js";

export interface PhantomProvider {
  isPhantom?: boolean;
  connect(): Promise<{ publicKey: { toString(): string } }>;
  /** Sign a legacy transaction in the wallet. Rejects if the user declines. */
  signTransaction(tx: Transaction): Promise<Transaction>;
}

/** The injected Phantom provider, or null if it isn't installed. */
export function getPhantom(): PhantomProvider | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { phantom?: { solana?: PhantomProvider }; solana?: PhantomProvider };
  return w.phantom?.solana ?? (w.solana?.isPhantom ? w.solana : null);
}
