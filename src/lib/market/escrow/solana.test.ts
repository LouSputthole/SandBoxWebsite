import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BN } from "@coral-xyz/anchor";
import { Keypair, PublicKey, Transaction } from "@solana/web3.js";
import {
  SolanaEscrowClient,
  assertOrderId,
  deriveConfigPda,
  deriveEscrowPda,
  deriveVaultPda,
  isBlockhashExpired,
  mapRustEscrowState,
  toEscrowRecord,
} from "./solana";
import type { EscrowState } from "../escrow-state";

// Offline-only tests: PDA derivation, guards, state decoding, env validation, and building the
// (unsigned) buyer open tx with an injected blockhash. Nothing here touches the network.

const PROGRAM_ID = new PublicKey("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");
const OTHER_PROGRAM_ID = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");

const ENV_KEYS = [
  "SOLANA_RPC_URL",
  "MARKET_ESCROW_PROGRAM_ID",
  "MARKET_AUTHORIZER_KEYPAIR",
  "MARKET_USDC_MINT",
  "MARKET_FEE_ATA",
] as const;

function validEnv(): Record<string, string> {
  return {
    SOLANA_RPC_URL: "http://localhost:8899",
    MARKET_ESCROW_PROGRAM_ID: PROGRAM_ID.toBase58(),
    MARKET_AUTHORIZER_KEYPAIR: JSON.stringify(Array.from(Keypair.generate().secretKey)),
    MARKET_USDC_MINT: Keypair.generate().publicKey.toBase58(),
    MARKET_FEE_ATA: Keypair.generate().publicKey.toBase58(),
  };
}

function setEnv(env: Record<string, string>): void {
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
}

describe("solana escrow PDAs", () => {
  it("derive against known vectors computed with the same libs (stability + shape)", () => {
    const orderId = "order-1";
    const expectedConfig = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID)[0];
    const expectedEscrow = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), Buffer.from(orderId)],
      PROGRAM_ID,
    )[0];
    const expectedVault = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), Buffer.from(orderId)],
      PROGRAM_ID,
    )[0];

    expect(deriveConfigPda(PROGRAM_ID).equals(expectedConfig)).toBe(true);
    expect(deriveEscrowPda(PROGRAM_ID, orderId).equals(expectedEscrow)).toBe(true);
    expect(deriveVaultPda(PROGRAM_ID, orderId).equals(expectedVault)).toBe(true);

    // shape
    const pda = deriveEscrowPda(PROGRAM_ID, orderId);
    expect(pda).toBeInstanceOf(PublicKey);
    expect(pda.toBase58().length).toBeGreaterThanOrEqual(32);
    expect(pda.toBase58().length).toBeLessThanOrEqual(44);
  });

  it("changing the program id changes every derived address", () => {
    expect(deriveConfigPda(PROGRAM_ID).equals(deriveConfigPda(OTHER_PROGRAM_ID))).toBe(false);
    expect(deriveEscrowPda(PROGRAM_ID, "order-1").equals(deriveEscrowPda(OTHER_PROGRAM_ID, "order-1"))).toBe(false);
    expect(deriveVaultPda(PROGRAM_ID, "order-1").equals(deriveVaultPda(OTHER_PROGRAM_ID, "order-1"))).toBe(false);
  });

  it("escrow and vault PDAs differ for the same order id", () => {
    expect(deriveEscrowPda(PROGRAM_ID, "order-1").equals(deriveVaultPda(PROGRAM_ID, "order-1"))).toBe(false);
  });
});

describe("isBlockhashExpired", () => {
  it("matches web3.js's TransactionExpiredBlockheightExceededError by name and message", () => {
    // Shape web3.js 1.98 actually produces (name set via defineProperty on the prototype).
    const err = new Error("Signature 5v…xY has expired: block height exceeded.");
    Object.defineProperty(err, "name", { value: "TransactionExpiredBlockheightExceededError" });
    expect(isBlockhashExpired(err)).toBe(true);
    // Message-only match (e.g. after our own wrapping preserved the text but not the name).
    expect(isBlockhashExpired(new Error("something: block height exceeded."))).toBe(true);
  });

  it("matches the preflight 'Blockhash not found' simulation failure", () => {
    expect(
      isBlockhashExpired(new Error("Transaction simulation failed: Blockhash not found")),
    ).toBe(true);
  });

  it("does NOT match timeouts ('unknown if it succeeded') or unrelated failures", () => {
    const timeout = new Error(
      "Transaction was not confirmed in 60.00 seconds. It is unknown if it succeeded or failed.",
    );
    Object.defineProperty(timeout, "name", { value: "TransactionExpiredTimeoutError" });
    expect(isBlockhashExpired(timeout)).toBe(false); // ambiguous — must stay a plain failure
    expect(isBlockhashExpired(new Error("insufficient funds for rent"))).toBe(false);
    expect(isBlockhashExpired("string error")).toBe(false);
    expect(isBlockhashExpired(null)).toBe(false);
  });
});

describe("orderId length guard", () => {
  it("rejects empty and > 32-byte order ids, accepts <= 32 bytes", () => {
    expect(() => assertOrderId("")).toThrow(/must not be empty/);
    expect(() => assertOrderId("x".repeat(33))).toThrow(/at most 32/);
    expect(() => assertOrderId("x".repeat(32))).not.toThrow();
    // a typical cuid (~25 chars) is fine
    expect(() => assertOrderId("cktz1a2b3c4d5e6f7g8h9i0j1")).not.toThrow();
  });

  it("counts utf8 BYTES, not chars (multibyte over the limit is rejected)", () => {
    // 17 × 2-byte "é" = 34 bytes > 32
    expect(() => assertOrderId("é".repeat(17))).toThrow(/at most 32/);
    expect(() => deriveEscrowPda(PROGRAM_ID, "x".repeat(33))).toThrow(/at most 32/);
  });
});

describe("state enum decoding", () => {
  const rec = (state: Record<string, unknown>, protectionUntil = 0) =>
    toEscrowRecord("order-x", PROGRAM_ID, {
      orderId: "order-x",
      buyer: PROGRAM_ID,
      seller: OTHER_PROGRAM_ID,
      amount: new BN("100000000"),
      feeBps: 360,
      state,
      deliveryDeadline: new BN(1_900_000_000),
      protectionUntil: new BN(protectionUntil),
      bump: 1,
      vaultBump: 2,
    });

  it("maps all five Rust enum variants", () => {
    const cases: Array<[Record<string, unknown>, EscrowState]> = [
      [{ funded: {} }, "FUNDED"],
      [{ protectionHold: {} }, "PROTECTION_HOLD"],
      [{ released: {} }, "RELEASED"],
      [{ refunded: {} }, "REFUNDED"],
      [{ disputed: {} }, "DISPUTED"],
    ];
    for (const [raw, expected] of cases) {
      expect(mapRustEscrowState(raw)).toBe(expected);
      expect(rec(raw).state).toBe(expected);
    }
  });

  it("throws on an unknown variant", () => {
    expect(() => mapRustEscrowState({ bogus: {} })).toThrow(/unknown on-chain escrow state/);
  });

  it("protection_until 0 → null, non-zero → the number; amounts → bigint", () => {
    expect(rec({ funded: {} }, 0).protectionUntil).toBeNull();
    expect(rec({ protectionHold: {} }, 1_700_000_000).protectionUntil).toBe(1_700_000_000);
    const r = rec({ funded: {} });
    expect(r.amount).toBe(BigInt(100_000_000));
    expect(typeof r.amount).toBe("bigint");
    expect(r.buyer).toBe(PROGRAM_ID.toBase58());
    expect(r.seller).toBe(OTHER_PROGRAM_ID.toBase58());
    expect(r.deliveryDeadline).toBe(1_900_000_000);
    expect(r.escrowPda).toBe(PROGRAM_ID.toBase58());
  });
});

describe("SolanaEscrowClient env validation", () => {
  let saved: Record<string, string | undefined>;
  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("constructs with a full valid env", () => {
    setEnv(validEnv());
    expect(() => new SolanaEscrowClient()).not.toThrow();
  });

  it("throws a clear error when SOLANA_RPC_URL is missing", () => {
    setEnv(validEnv());
    delete process.env.SOLANA_RPC_URL;
    expect(() => new SolanaEscrowClient()).toThrow(/SOLANA_RPC_URL is required/);
  });

  it("throws for an invalid program id", () => {
    setEnv({ ...validEnv(), MARKET_ESCROW_PROGRAM_ID: "not-base58-!!!" });
    expect(() => new SolanaEscrowClient()).toThrow(/MARKET_ESCROW_PROGRAM_ID is not a valid/);
  });

  it("throws for a wrong-length authorizer keypair", () => {
    setEnv({ ...validEnv(), MARKET_AUTHORIZER_KEYPAIR: JSON.stringify([1, 2, 3]) });
    expect(() => new SolanaEscrowClient()).toThrow(/64 integers/);
  });

  it("throws for a non-JSON authorizer keypair", () => {
    setEnv({ ...validEnv(), MARKET_AUTHORIZER_KEYPAIR: "definitely not json" });
    expect(() => new SolanaEscrowClient()).toThrow(/JSON array of 64 bytes/);
  });

  it("throws for an invalid USDC mint", () => {
    setEnv({ ...validEnv(), MARKET_USDC_MINT: "xxx" });
    expect(() => new SolanaEscrowClient()).toThrow(/MARKET_USDC_MINT is not a valid/);
  });
});

describe("SolanaEscrowClient open flow", () => {
  let saved: Record<string, string | undefined>;
  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
    setEnv(validEnv());
  });
  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("openEscrow() throws pointing at the two-step flow", async () => {
    const client = new SolanaEscrowClient();
    await expect(client.openEscrow()).rejects.toThrow(/prepareOpenEscrowTx/);
  });

  it("prepareOpenEscrowTx builds an unsigned, buyer-paid open_escrow tx (offline)", async () => {
    const client = new SolanaEscrowClient();
    const buyer = Keypair.generate().publicKey;
    const seller = Keypair.generate().publicKey;
    const blockhash = Keypair.generate().publicKey.toBase58();

    const b64 = await client.prepareOpenEscrowTx({
      orderId: "order-1",
      buyer: buyer.toBase58(),
      seller: seller.toBase58(),
      amount: BigInt(100_000_000),
      feeBps: 360,
      deliveryDeadline: 1_900_000_000,
      recentBlockhash: blockhash,
    });

    const tx = Transaction.from(Buffer.from(b64, "base64"));
    expect(tx.feePayer?.equals(buyer)).toBe(true);
    expect(tx.recentBlockhash).toBe(blockhash);
    // Unsigned — no populated signatures.
    expect(tx.signatures.every((s) => s.signature === null)).toBe(true);

    const ix = tx.instructions.find((i) => i.programId.equals(PROGRAM_ID));
    expect(ix, "tx contains the escrow program's open_escrow instruction").toBeDefined();
    // open_escrow discriminator from the committed IDL.
    const OPEN_ESCROW_DISCRIMINATOR = Buffer.from([82, 178, 155, 253, 74, 41, 161, 219]);
    expect(Buffer.from(ix!.data.subarray(0, 8)).equals(OPEN_ESCROW_DISCRIMINATOR)).toBe(true);

    // The escrow PDA is present among the instruction accounts.
    const escrowPda = deriveEscrowPda(PROGRAM_ID, "order-1");
    expect(ix!.keys.some((k) => k.pubkey.equals(escrowPda))).toBe(true);
  });

  it("prepareOpenEscrowTx rejects self-deal, non-positive amount, and over-long order ids", async () => {
    const client = new SolanaEscrowClient();
    const same = Keypair.generate().publicKey.toBase58();
    const seller = Keypair.generate().publicKey.toBase58();
    const base = {
      buyer: same,
      seller,
      amount: BigInt(1),
      feeBps: 360,
      deliveryDeadline: 1_900_000_000,
      recentBlockhash: Keypair.generate().publicKey.toBase58(),
    };
    await expect(client.prepareOpenEscrowTx({ ...base, orderId: "o", seller: same })).rejects.toThrow(/must differ/);
    await expect(client.prepareOpenEscrowTx({ ...base, orderId: "o", amount: BigInt(0) })).rejects.toThrow(/positive/);
    await expect(client.prepareOpenEscrowTx({ ...base, orderId: "x".repeat(33) })).rejects.toThrow(/at most 32/);
  });
});
