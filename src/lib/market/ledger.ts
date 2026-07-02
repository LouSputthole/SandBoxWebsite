/**
 * Pure, privacy-aware shaping for the PUBLIC TRUST LEDGER (/market/ledger). Turns a completed
 * MarketOrder (RELEASED or REFUNDED) into the exact proof-chain shape the page renders — deciding
 * per-party what identity is public and what stays hidden. No Prisma / DB / network here so the
 * privacy matrix is unit-testable in isolation; the page maps its rows into {@link LedgerOrderInput}.
 *
 * Privacy rules (the flags gate ONLY Steam identity — the chain is public regardless):
 *  - A party's persona / avatar / Steam profile link show iff that party's flag is true; otherwise
 *    the party renders as "Anonymous".
 *  - The delivery Steam ids (trade-offer id + delivered asset id) show iff BOTH parties are public —
 *    an asset id can deanonymize an inventory, so one private party hides them for both.
 *  - Wallet addresses and every tx signature / escrow PDA are ALWAYS included (public on chain).
 *  - A null signature simply yields a null link field (the card omits that link).
 */

/** One party's on-chain + (optionally) Steam identity, as it should appear on the public ledger. */
export interface LedgerParty {
  /** Whether this party chose to show their Steam identity. */
  public: boolean;
  /** Steam persona — null when private. */
  persona: string | null;
  /** Steam avatar URL — null when private or absent. */
  avatarUrl: string | null;
  /** steamcommunity.com profile link — null when private. */
  profileUrl: string | null;
  /** SteamID64 — null when private. Lets the card link to our own /market/u/[steamId] profile. */
  steamId: string | null;
  /** Solana wallet (base58, full) — always present when known; the card truncates it. */
  wallet: string | null;
}

/** The delivery leg of a completed (RELEASED) trade. Null for a REFUNDED order (no delivery). */
export interface LedgerDelivery {
  sellerSentAt: string | null;
  deliveredAt: string | null;
  /** confirm_delivery tx signature (oracle verification) — null if not captured. */
  txSig: string | null;
  /** True only when both parties are public — gates the Steam ids below. */
  idsVisible: boolean;
  /** Steam trade-offer id — present only when idsVisible. */
  tradeOfferId: string | null;
  /** Delivered Steam asset id — present only when idsVisible. */
  deliveredAssetId: string | null;
}

export interface LedgerEntry {
  id: string;
  state: "RELEASED" | "REFUNDED";
  /** Gross amount, USDC base units as a string (JSON/BigInt-safe). */
  amountUsdc: string;
  /** Gross amount, human dollars (e.g. "12.50"). */
  amountFormatted: string;
  item: { name: string; slug: string; imageUrl: string | null; type: string; rarityColor: string | null };
  escrowPda: string | null;
  buyer: LedgerParty;
  seller: LedgerParty;
  /** Step 1 — buyer funded the escrow vault. */
  funded: { at: string | null; txSig: string | null };
  /** Step 2 — Steam trade delivered (RELEASED only). */
  delivered: LedgerDelivery | null;
  /** Step 3 — vault paid the seller (RELEASED) or refunded the buyer (REFUNDED). */
  settled: { kind: "released" | "refunded"; at: string | null; txSig: string | null };
  /** When the completed lifecycle settled — for display ordering / relative time. */
  completedAt: string | null;
}

/** The narrow row shape {@link toLedgerEntry} needs — the page projects Prisma rows into this. */
export interface LedgerOrderInput {
  id: string;
  state: string;
  priceUsdc: bigint;
  buyerPublic: boolean;
  sellerPublic: boolean;
  escrowPda: string | null;
  openTxSig: string | null;
  confirmTxSig: string | null;
  settleTxSig: string | null;
  fundedAt: Date | null;
  sellerSentAt: Date | null;
  deliveredAt: Date | null;
  releasedAt: Date | null;
  refundedAt: Date | null;
  deliveredAssetId: string | null;
  /** Resolved from the order's trade attempts (the latest one carrying a trade-offer id). */
  tradeOfferId: string | null;
  buyer: { username: string | null; avatarUrl: string | null; steamId: string; wallet: string | null };
  seller: { username: string | null; avatarUrl: string | null; steamId: string; wallet: string | null };
  item: { name: string; slug: string; imageUrl: string | null; type: string; rarityColor: string | null };
}

import { formatUsdc } from "./fees";

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

/** Build a party's public view, redacting Steam identity when their flag is false. */
function toParty(
  isPublic: boolean,
  u: { username: string | null; avatarUrl: string | null; steamId: string; wallet: string | null },
): LedgerParty {
  if (!isPublic) {
    // Redacted: identity hidden, wallet still shown (the chain is public regardless).
    return { public: false, persona: null, avatarUrl: null, profileUrl: null, steamId: null, wallet: u.wallet };
  }
  return {
    public: true,
    persona: u.username ?? u.steamId,
    avatarUrl: u.avatarUrl,
    profileUrl: `https://steamcommunity.com/profiles/${u.steamId}`,
    steamId: u.steamId,
    wallet: u.wallet,
  };
}

/**
 * Shape one completed order into its ledger proof chain. `state` is trusted to be RELEASED or
 * REFUNDED (the ledger query only selects those); anything else is treated as REFUNDED (no delivery
 * leg) defensively.
 */
export function toLedgerEntry(o: LedgerOrderInput): LedgerEntry {
  const released = o.state === "RELEASED";
  const idsVisible = o.buyerPublic && o.sellerPublic;

  return {
    id: o.id,
    state: released ? "RELEASED" : "REFUNDED",
    amountUsdc: o.priceUsdc.toString(),
    amountFormatted: formatUsdc(o.priceUsdc),
    item: o.item,
    escrowPda: o.escrowPda,
    buyer: toParty(o.buyerPublic, o.buyer),
    seller: toParty(o.sellerPublic, o.seller),
    funded: { at: iso(o.fundedAt), txSig: o.openTxSig },
    delivered: released
      ? {
          sellerSentAt: iso(o.sellerSentAt),
          deliveredAt: iso(o.deliveredAt),
          txSig: o.confirmTxSig,
          idsVisible,
          tradeOfferId: idsVisible ? o.tradeOfferId : null,
          deliveredAssetId: idsVisible ? o.deliveredAssetId : null,
        }
      : null,
    settled: released
      ? { kind: "released", at: iso(o.releasedAt), txSig: o.settleTxSig }
      : { kind: "refunded", at: iso(o.refundedAt), txSig: o.settleTxSig },
    completedAt: iso(released ? o.releasedAt : o.refundedAt),
  };
}
