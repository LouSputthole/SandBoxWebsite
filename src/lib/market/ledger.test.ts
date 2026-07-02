import { describe, it, expect } from "vitest";
import { toLedgerEntry, type LedgerOrderInput } from "./ledger";

// ---------------------------------------------------------------------------
// toLedgerEntry is the pure, privacy-aware shaping behind the public trust ledger. These tests pin
// the privacy matrix (both public / buyer private / seller private / both private) and null-sig
// handling — the parts a subtle regression could quietly de-anonymize a user or drop a proof link.
// ---------------------------------------------------------------------------

const BASE: LedgerOrderInput = {
  id: "order-1",
  state: "RELEASED",
  priceUsdc: BigInt(12_500_000), // 12.50 USDC
  buyerPublic: true,
  sellerPublic: true,
  escrowPda: "EscrowPda11111111111111111111111111111111111",
  openTxSig: "OpenSig1111111111111111111111111111111111111",
  confirmTxSig: "ConfirmSig111111111111111111111111111111111",
  settleTxSig: "SettleSig1111111111111111111111111111111111",
  fundedAt: new Date("2026-07-01T10:00:00.000Z"),
  sellerSentAt: new Date("2026-07-01T10:05:00.000Z"),
  deliveredAt: new Date("2026-07-01T10:10:00.000Z"),
  releasedAt: new Date("2026-07-02T10:10:00.000Z"),
  refundedAt: null,
  deliveredAssetId: "asset-999",
  tradeOfferId: "8156301868",
  buyer: { username: "AlphaBuyer", avatarUrl: "https://av/buyer.jpg", steamId: "76500000000000001", wallet: "BuyerWa11et111111111111111111111111111111111" },
  seller: { username: "OmegaSeller", avatarUrl: "https://av/seller.jpg", steamId: "76500000000000002", wallet: "Se11erWa11et11111111111111111111111111111111" },
  item: { name: "Cardboard King", slug: "cardboard-king", imageUrl: "https://img/ck.png", type: "clothing", rarityColor: "d32ce6" },
};

const withState = (over: Partial<LedgerOrderInput>): LedgerOrderInput => ({ ...BASE, ...over });

describe("toLedgerEntry — privacy matrix (RELEASED)", () => {
  it("both public: full identity for both parties + Steam ids visible + all proof links", () => {
    const e = toLedgerEntry(withState({ buyerPublic: true, sellerPublic: true }));

    expect(e.buyer.public).toBe(true);
    expect(e.buyer.persona).toBe("AlphaBuyer");
    expect(e.buyer.avatarUrl).toBe("https://av/buyer.jpg");
    expect(e.buyer.profileUrl).toBe("https://steamcommunity.com/profiles/76500000000000001");
    expect(e.seller.public).toBe(true);
    expect(e.seller.persona).toBe("OmegaSeller");
    expect(e.seller.profileUrl).toBe("https://steamcommunity.com/profiles/76500000000000002");

    // steamId is carried for public parties (used to link to our own /market/u/[steamId] profile),
    // and null for private ones.
    expect(e.buyer.steamId).toBe("76500000000000001");
    expect(e.seller.steamId).toBe("76500000000000002");

    // Wallets always present (chain is public), regardless of identity privacy.
    expect(e.buyer.wallet).toBe(BASE.buyer.wallet);
    expect(e.seller.wallet).toBe(BASE.seller.wallet);

    // Delivery ids visible only when BOTH public.
    expect(e.delivered?.idsVisible).toBe(true);
    expect(e.delivered?.tradeOfferId).toBe("8156301868");
    expect(e.delivered?.deliveredAssetId).toBe("asset-999");

    // Proof links.
    expect(e.funded.txSig).toBe(BASE.openTxSig);
    expect(e.delivered?.txSig).toBe(BASE.confirmTxSig);
    expect(e.settled).toEqual({ kind: "released", at: "2026-07-02T10:10:00.000Z", txSig: BASE.settleTxSig });
    expect(e.amountFormatted).toBe("12.50");
    expect(e.amountUsdc).toBe("12500000");
  });

  it("buyer private: buyer anonymized, seller shown, Steam ids HIDDEN (one private hides both)", () => {
    const e = toLedgerEntry(withState({ buyerPublic: false, sellerPublic: true }));

    expect(e.buyer.public).toBe(false);
    expect(e.buyer.persona).toBeNull();
    expect(e.buyer.avatarUrl).toBeNull();
    expect(e.buyer.profileUrl).toBeNull();
    expect(e.buyer.steamId).toBeNull(); // no internal profile link for a private party
    expect(e.buyer.wallet).toBe(BASE.buyer.wallet); // wallet still public

    expect(e.seller.public).toBe(true);
    expect(e.seller.persona).toBe("OmegaSeller");

    // An asset id can deanonymize an inventory → hidden unless BOTH public.
    expect(e.delivered?.idsVisible).toBe(false);
    expect(e.delivered?.tradeOfferId).toBeNull();
    expect(e.delivered?.deliveredAssetId).toBeNull();
    // ...but the verification tx link stays (it reveals nothing about the inventory).
    expect(e.delivered?.txSig).toBe(BASE.confirmTxSig);
  });

  it("seller private: seller anonymized, buyer shown, Steam ids HIDDEN", () => {
    const e = toLedgerEntry(withState({ buyerPublic: true, sellerPublic: false }));

    expect(e.seller.public).toBe(false);
    expect(e.seller.persona).toBeNull();
    expect(e.seller.profileUrl).toBeNull();
    expect(e.buyer.public).toBe(true);
    expect(e.buyer.persona).toBe("AlphaBuyer");

    expect(e.delivered?.idsVisible).toBe(false);
    expect(e.delivered?.tradeOfferId).toBeNull();
    expect(e.delivered?.deliveredAssetId).toBeNull();
  });

  it("both private: both anonymized, no Steam ids, but wallets + all tx links remain", () => {
    const e = toLedgerEntry(withState({ buyerPublic: false, sellerPublic: false }));

    expect(e.buyer.public).toBe(false);
    expect(e.seller.public).toBe(false);
    expect(e.buyer.persona).toBeNull();
    expect(e.seller.persona).toBeNull();
    expect(e.buyer.wallet).toBe(BASE.buyer.wallet);
    expect(e.seller.wallet).toBe(BASE.seller.wallet);
    expect(e.delivered?.idsVisible).toBe(false);
    expect(e.delivered?.tradeOfferId).toBeNull();
    expect(e.funded.txSig).toBe(BASE.openTxSig);
    expect(e.delivered?.txSig).toBe(BASE.confirmTxSig);
    expect(e.settled.txSig).toBe(BASE.settleTxSig);
  });

  it("falls back to steamId as persona when a public party has no username", () => {
    const e = toLedgerEntry(
      withState({ buyer: { ...BASE.buyer, username: null } }),
    );
    expect(e.buyer.persona).toBe("76500000000000001");
  });
});

describe("toLedgerEntry — null-signature handling", () => {
  it("missing proof-chain signatures yield null link fields (no crash, links just omitted)", () => {
    const e = toLedgerEntry(withState({ openTxSig: null, confirmTxSig: null, settleTxSig: null }));
    expect(e.funded.txSig).toBeNull();
    expect(e.delivered?.txSig).toBeNull();
    expect(e.settled.txSig).toBeNull();
    // The escrow PDA (an address, not a tx) is independent and still present.
    expect(e.escrowPda).toBe(BASE.escrowPda);
  });

  it("a fully unlinked-but-completed order still shapes cleanly", () => {
    const e = toLedgerEntry(
      withState({ escrowPda: null, openTxSig: null, confirmTxSig: null, settleTxSig: null }),
    );
    expect(e.escrowPda).toBeNull();
    expect(e.state).toBe("RELEASED");
    expect(e.delivered).not.toBeNull();
  });
});

describe("toLedgerEntry — REFUNDED", () => {
  it("has no delivery leg and a refund settlement, ordered by refundedAt", () => {
    const e = toLedgerEntry(
      withState({
        state: "REFUNDED",
        releasedAt: null,
        refundedAt: new Date("2026-07-03T00:00:00.000Z"),
        confirmTxSig: null,
        deliveredAt: null,
        sellerSentAt: null,
      }),
    );
    expect(e.state).toBe("REFUNDED");
    expect(e.delivered).toBeNull();
    expect(e.settled).toEqual({ kind: "refunded", at: "2026-07-03T00:00:00.000Z", txSig: BASE.settleTxSig });
    expect(e.completedAt).toBe("2026-07-03T00:00:00.000Z");
  });

  it("REFUNDED never exposes Steam ids even when both public (there was no delivery)", () => {
    const e = toLedgerEntry(withState({ state: "REFUNDED", releasedAt: null, refundedAt: new Date() }));
    expect(e.delivered).toBeNull();
  });
});
