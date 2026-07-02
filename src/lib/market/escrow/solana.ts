import { AnchorProvider, BN, Program, utils, type Idl } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  type ConfirmOptions,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountIdempotentInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

import type { EscrowState } from "../escrow-state";
import {
  EscrowMismatchError,
  EscrowTxExpiredError,
  type EscrowClient,
  type EscrowRecord,
  type OpenEscrowParams,
  type TxResult,
} from "./types";
import idlJson from "./sbox_escrow.idl.json";

/**
 * Production Solana implementation of {@link EscrowClient} — talks to the on-chain Anchor program
 * (`solana/sbox-escrow`). SERVER-ONLY: it imports `@coral-xyz/anchor` + `@solana/spl-token` and
 * carries the backend authorizer keypair, so it must never be pulled into a client component.
 *
 * The authorizer-signed operations (confirmDelivery / release / refund / freeze / resolve) map 1:1
 * onto the program instructions and are signed by MARKET_AUTHORIZER_KEYPAIR. `open_escrow` is
 * BUYER-signed (Phantom in the browser) and CANNOT be done by a backend signer — see
 * {@link SolanaEscrowClient.openEscrow} / {@link SolanaEscrowClient.prepareOpenEscrowTx}.
 *
 * The `now` / `protectionPeriodSeconds` params on the interface exist for the deterministic mock;
 * the real program reads its own Clock and takes the protection period from the on-chain Config, so
 * this client ignores them.
 */

/** On-chain seed constraint: `#[max_len(32)]` on `Escrow.order_id` (our cuids are ~25 chars). */
const MAX_ORDER_ID_BYTES = 32;

// --- pure helpers (offline-testable) -----------------------------------------

/** The decoded shape of the on-chain `Escrow` account (anchor camelCases field + enum names). */
interface RawEscrowAccount {
  orderId: string;
  buyer: PublicKey;
  seller: PublicKey;
  amount: BN;
  feeBps: number;
  state: Record<string, unknown>;
  deliveryDeadline: BN;
  protectionUntil: BN;
  bump: number;
  vaultBump: number;
}

/** Map the Rust `EscrowState` enum (anchor decodes it to `{ funded: {} }` etc.) to our TS union. */
export function mapRustEscrowState(state: Record<string, unknown>): EscrowState {
  if ("funded" in state) return "FUNDED";
  if ("protectionHold" in state) return "PROTECTION_HOLD";
  if ("released" in state) return "RELEASED";
  if ("refunded" in state) return "REFUNDED";
  if ("disputed" in state) return "DISPUTED";
  throw new Error(`unknown on-chain escrow state: ${JSON.stringify(state)}`);
}

/** Convert a decoded on-chain escrow account into our {@link EscrowRecord}. Pure — no network. */
export function toEscrowRecord(orderId: string, escrowPda: PublicKey, acc: RawEscrowAccount): EscrowRecord {
  const protectionUntil = acc.protectionUntil.toNumber();
  return {
    orderId,
    escrowPda: escrowPda.toBase58(),
    onchainOrderId: acc.orderId,
    buyer: acc.buyer.toBase58(),
    seller: acc.seller.toBase58(),
    amount: BigInt(acc.amount.toString()),
    feeBps: acc.feeBps,
    state: mapRustEscrowState(acc.state),
    deliveryDeadline: acc.deliveryDeadline.toNumber(),
    // The program uses 0 for "hold not started"; surface that as null (mirrors the mock/record).
    protectionUntil: protectionUntil === 0 ? null : protectionUntil,
  };
}

/** Guard the on-chain seed length constraint before deriving any order-keyed PDA. */
export function assertOrderId(orderId: string): void {
  const bytes = Buffer.byteLength(orderId, "utf8");
  if (bytes === 0) throw new Error("orderId must not be empty");
  if (bytes > MAX_ORDER_ID_BYTES) {
    throw new Error(
      `orderId is ${bytes} bytes; the on-chain escrow seed allows at most ${MAX_ORDER_ID_BYTES} (utf8)`,
    );
  }
}

/** Config PDA: seeds ["config"]. */
export function deriveConfigPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], programId)[0];
}

/** Escrow PDA: seeds ["escrow", orderId]. */
export function deriveEscrowPda(programId: PublicKey, orderId: string): PublicKey {
  assertOrderId(orderId);
  return PublicKey.findProgramAddressSync([Buffer.from("escrow"), Buffer.from(orderId, "utf8")], programId)[0];
}

/** Vault PDA: seeds ["vault", orderId]. */
export function deriveVaultPda(programId: PublicKey, orderId: string): PublicKey {
  assertOrderId(orderId);
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), Buffer.from(orderId, "utf8")], programId)[0];
}

/** Best-effort human string for anchor / RPC errors (surfaces the program error code + message). */
function describeError(err: unknown): string {
  if (err && typeof err === "object") {
    const e = err as {
      error?: { errorCode?: { code?: string }; errorMessage?: string };
      message?: string;
    };
    const code = e.error?.errorCode?.code;
    const msg = e.error?.errorMessage;
    if (code) return msg ? `${code}: ${msg}` : code;
    if (typeof e.message === "string") return e.message;
  }
  return String(err);
}

/**
 * True when a sendRawTransaction failure just means the tx already landed (a retried fund POST for a
 * tx that already confirmed). Solana surfaces this as "This transaction has already been processed".
 * We treat it as success and fall through to verification instead of failing the retry.
 */
function isAlreadyProcessed(err: unknown): boolean {
  return /already been processed|already processed/i.test(describeError(err));
}

/**
 * True when a submit/confirm failure means the tx's BLOCKHASH aged out (valid ~60–90s, but a PENDING
 * order lives 10 min — a buyer who approves in Phantom late hits this deterministically). Two shapes
 * web3.js 1.98 actually produces (matched robustly on name AND message):
 *  - preflight simulation rejects the send: SendTransactionError "Transaction simulation failed:
 *    Blockhash not found";
 *  - confirmTransaction's blockheight strategy: TransactionExpiredBlockheightExceededError
 *    ("Signature … has expired: block height exceeded.").
 * Deliberately does NOT match TransactionExpiredTimeoutError — a timeout is "unknown if it succeeded"
 * (web3.js's own words), not proof of expiry; that path stays a plain failure so the order is left
 * FUNDING for the reaper to reconcile.
 */
export function isBlockhashExpired(err: unknown): boolean {
  if (err && typeof err === "object" && "name" in err) {
    if ((err as { name?: unknown }).name === "TransactionExpiredBlockheightExceededError") return true;
  }
  const msg = describeError(err);
  return /blockhash not found/i.test(msg) || /block height exceeded/i.test(msg);
}

/**
 * Recover the transaction signature (base58) from a buyer-signed open_escrow tx WITHOUT hitting the
 * RPC. The fee-payer's signature IS the transaction id, so this equals what `sendRawTransaction`
 * returns — but it also survives the retry paths where we never get that return value (an
 * already-processed resubmit, or a blockhash-expired error whose escrow still landed). Used only to
 * surface the funding proof link on the public ledger; returns null if the tx can't be decoded or is
 * unsigned (a null link is always safe — it just omits the link).
 */
export function recoverTxSignature(raw: Buffer): string | null {
  try {
    const sig = Transaction.from(raw).signature;
    return sig ? utils.bytes.bs58.encode(sig) : null;
  } catch {
    return null;
  }
}

// --- env parsing (all validated on construction) -----------------------------

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(`${name} is required for the Solana escrow client but is not set`);
  }
  return v.trim();
}

function parsePubkey(name: string, value: string): PublicKey {
  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`${name} is not a valid base58 Solana public key: "${value}"`);
  }
}

function parseAuthorizerKeypair(value: string): Keypair {
  let arr: unknown;
  try {
    arr = JSON.parse(value);
  } catch {
    throw new Error("MARKET_AUTHORIZER_KEYPAIR must be a JSON array of 64 bytes (the secret key)");
  }
  if (
    !Array.isArray(arr) ||
    arr.length !== 64 ||
    !arr.every((n) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 255)
  ) {
    throw new Error("MARKET_AUTHORIZER_KEYPAIR must be a JSON array of 64 integers in [0, 255]");
  }
  try {
    return Keypair.fromSecretKey(Uint8Array.from(arr as number[]));
  } catch (err) {
    throw new Error(`MARKET_AUTHORIZER_KEYPAIR is not a valid Solana secret key: ${describeError(err)}`);
  }
}

/**
 * Minimal anchor `Wallet` backed by the authorizer keypair. We do NOT import anchor's `Wallet`
 * export: its ESM build attaches it via a non-static `exports.Wallet = require(...)` guard that
 * Turbopack can't resolve (build fails with "Export Wallet doesn't exist"). This is behaviourally
 * identical to anchor's NodeWallet (partial-sign legacy txs, sign versioned txs).
 */
class KeypairWallet {
  constructor(readonly payer: Keypair) {}
  get publicKey(): PublicKey {
    return this.payer.publicKey;
  }
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof VersionedTransaction) tx.sign([this.payer]);
    else tx.partialSign(this.payer);
    return tx;
  }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    for (const tx of txs) {
      if (tx instanceof VersionedTransaction) tx.sign([this.payer]);
      else tx.partialSign(this.payer);
    }
    return txs;
  }
}

// --- minimal typed surface over the anchor Program ---------------------------
// The IDL ships only as JSON (no generated TS types committed), so we describe exactly the anchor
// API we drive and cast the constructed Program to it — keeping OUR call sites fully type-checked.

interface AnchorTxBuilder {
  accountsPartial(accounts: Record<string, PublicKey>): AnchorTxBuilder;
  preInstructions(ixs: TransactionInstruction[]): AnchorTxBuilder;
  rpc(options?: ConfirmOptions): Promise<string>;
  transaction(): Promise<Transaction>;
}

interface EscrowProgram {
  programId: PublicKey;
  methods: {
    openEscrow(orderId: string, seller: PublicKey, amount: BN, deliveryDeadline: BN): AnchorTxBuilder;
    confirmDelivery(orderId: string): AnchorTxBuilder;
    release(orderId: string): AnchorTxBuilder;
    refund(orderId: string): AnchorTxBuilder;
    freeze(orderId: string): AnchorTxBuilder;
    resolve(orderId: string, releaseToSeller: boolean): AnchorTxBuilder;
  };
  account: {
    escrow: { fetchNullable(address: PublicKey): Promise<RawEscrowAccount | null> };
  };
}

const CONFIRMED: ConfirmOptions = { commitment: "confirmed", preflightCommitment: "confirmed" };

// -----------------------------------------------------------------------------

export class SolanaEscrowClient implements EscrowClient {
  private readonly connection: Connection;
  private readonly authorizer: Keypair;
  private readonly program: EscrowProgram;
  private readonly programId: PublicKey;
  private readonly usdcMint: PublicKey;
  private readonly feeAta: PublicKey;
  private readonly configPda: PublicKey;

  constructor() {
    const rpcUrl = requireEnv("SOLANA_RPC_URL");
    this.programId = parsePubkey("MARKET_ESCROW_PROGRAM_ID", requireEnv("MARKET_ESCROW_PROGRAM_ID"));
    this.authorizer = parseAuthorizerKeypair(requireEnv("MARKET_AUTHORIZER_KEYPAIR"));
    this.usdcMint = parsePubkey("MARKET_USDC_MINT", requireEnv("MARKET_USDC_MINT"));
    this.feeAta = parsePubkey("MARKET_FEE_ATA", requireEnv("MARKET_FEE_ATA"));

    this.connection = new Connection(rpcUrl, CONFIRMED.commitment);
    const provider = new AnchorProvider(this.connection, new KeypairWallet(this.authorizer), CONFIRMED);
    // The committed IDL's `address` is a throwaway per-CI-run program id — the real program id
    // ALWAYS comes from env; override it before building the client.
    const idl: Idl = { ...(idlJson as unknown as Idl), address: this.programId.toBase58() };
    this.program = new Program(idl, provider) as unknown as EscrowProgram;
    this.configPda = deriveConfigPda(this.programId);
  }

  // --- reads -----------------------------------------------------------------

  async get(orderId: string): Promise<EscrowRecord | null> {
    const pda = deriveEscrowPda(this.programId, orderId);
    let acc: RawEscrowAccount | null;
    try {
      acc = await this.program.account.escrow.fetchNullable(pda);
    } catch (err) {
      throw new Error(`failed to read escrow for order ${orderId} from the Solana RPC: ${describeError(err)}`);
    }
    return acc ? toEscrowRecord(orderId, pda, acc) : null;
  }

  private async getOrThrow(orderId: string): Promise<EscrowRecord> {
    const rec = await this.get(orderId);
    if (!rec) throw new Error(`no on-chain escrow found for order ${orderId}`);
    return rec;
  }

  // --- authorizer-signed operations -----------------------------------------

  async confirmDelivery(orderId: string, protectionPeriodSeconds: number, now: number): Promise<TxResult> {
    void protectionPeriodSeconds; // real client: the hold length is read from the on-chain Config.
    void now; // real client: the program reads its own Clock.
    const builder = this.program.methods
      .confirmDelivery(orderId)
      .accountsPartial({
        config: this.configPda,
        escrow: deriveEscrowPda(this.programId, orderId),
        authorizer: this.authorizer.publicKey,
      });
    const signature = await this.runRpc("confirmDelivery", orderId, builder);
    return { signature, escrow: await this.getOrThrow(orderId) };
  }

  async release(orderId: string, now: number): Promise<TxResult> {
    void now; // release is gated on-chain by the escrow's protection_until, not a caller clock.
    const rec = await this.getOrThrow(orderId);
    const { sellerAta, buyerAta, preIxs } = this.settleAtas(rec);
    const builder = this.program.methods
      .release(orderId)
      .accountsPartial({
        config: this.configPda,
        escrow: deriveEscrowPda(this.programId, orderId),
        vault: deriveVaultPda(this.programId, orderId),
        sellerTokenAccount: sellerAta,
        feeAccount: this.feeAta,
        buyerTokenAccount: buyerAta,
        authorizer: this.authorizer.publicKey,
      })
      .preInstructions(preIxs);
    const signature = await this.runRpc("release", orderId, builder);
    return { signature, escrow: await this.getOrThrow(orderId) };
  }

  async refund(orderId: string, now: number): Promise<TxResult> {
    void now; // authorizer refund isn't caller-clock gated (the program enforces the state rules).
    const rec = await this.getOrThrow(orderId);
    const buyer = new PublicKey(rec.buyer);
    const buyerAta = getAssociatedTokenAddressSync(this.usdcMint, buyer);
    const builder = this.program.methods
      .refund(orderId)
      .accountsPartial({
        config: this.configPda,
        escrow: deriveEscrowPda(this.programId, orderId),
        vault: deriveVaultPda(this.programId, orderId),
        buyerTokenAccount: buyerAta,
        caller: this.authorizer.publicKey,
      })
      .preInstructions([
        createAssociatedTokenAccountIdempotentInstruction(this.authorizer.publicKey, buyerAta, buyer, this.usdcMint),
      ]);
    const signature = await this.runRpc("refund", orderId, builder);
    return { signature, escrow: await this.getOrThrow(orderId) };
  }

  async freeze(orderId: string, reason?: string): Promise<TxResult> {
    void reason; // the freeze reason is persisted by the service layer, not stored on-chain.
    const builder = this.program.methods
      .freeze(orderId)
      .accountsPartial({
        config: this.configPda,
        escrow: deriveEscrowPda(this.programId, orderId),
        authorizer: this.authorizer.publicKey,
      });
    const signature = await this.runRpc("freeze", orderId, builder);
    return { signature, escrow: await this.getOrThrow(orderId) };
  }

  async resolve(orderId: string, outcome: "release" | "refund", now: number): Promise<TxResult> {
    void now;
    const rec = await this.getOrThrow(orderId);
    const { sellerAta, buyerAta, preIxs } = this.settleAtas(rec);
    const builder = this.program.methods
      .resolve(orderId, outcome === "release")
      .accountsPartial({
        config: this.configPda,
        escrow: deriveEscrowPda(this.programId, orderId),
        vault: deriveVaultPda(this.programId, orderId),
        sellerTokenAccount: sellerAta,
        feeAccount: this.feeAta,
        buyerTokenAccount: buyerAta,
        authorizer: this.authorizer.publicKey,
      })
      .preInstructions(preIxs);
    const signature = await this.runRpc("resolve", orderId, builder);
    // Re-fetch the ACTUAL resulting state: a PRE-DELIVERY dispute resolved for the seller lands in
    // PROTECTION_HOLD (the program starts the hold here), NOT RELEASED. order-service.resolveDispute
    // branches on this true post-resolve state, so we must return it rather than assuming "release".
    return { signature, escrow: await this.getOrThrow(orderId) };
  }

  // --- buyer-signed open flow (two real methods; the interface method throws) -------------------

  /**
   * The `EscrowClient.openEscrow` contract cannot be honoured on-chain: `open_escrow` is signed by
   * the BUYER (their wallet funds the vault), which a backend signer can't do. Use the two-step
   * flow: {@link prepareOpenEscrowTx} to build the unsigned tx for the buyer to sign in the browser,
   * then {@link verifyEscrowFunded} once they submit it.
   */
  async openEscrow(): Promise<TxResult> {
    throw new Error(
      "SolanaEscrowClient.openEscrow() is unavailable: open_escrow is BUYER-signed (Phantom in the " +
        "browser) and cannot be performed by the backend authorizer. Use prepareOpenEscrowTx() to build " +
        "the unsigned transaction for the buyer to sign, then verifyEscrowFunded() after submission.",
    );
  }

  /**
   * Build the full `open_escrow` transaction for the BUYER to sign (fee payer = buyer). Returns the
   * unsigned tx base64-serialized. `feeBps` from the params is IGNORED — the program takes fee_bps
   * from the on-chain Config at open time. Pass `recentBlockhash` to build fully offline (else it is
   * fetched from the RPC).
   */
  async prepareOpenEscrowTx(params: OpenEscrowParams & { recentBlockhash?: string }): Promise<string> {
    assertOrderId(params.orderId);
    const buyer = parsePubkey("buyer", params.buyer);
    const seller = parsePubkey("seller", params.seller);
    if (buyer.equals(seller)) throw new Error("buyer and seller must differ");
    if (params.amount <= BigInt(0)) throw new Error("amount must be positive");

    const buyerAta = getAssociatedTokenAddressSync(this.usdcMint, buyer);
    const tx = await this.program.methods
      .openEscrow(params.orderId, seller, new BN(params.amount.toString()), new BN(params.deliveryDeadline))
      .accountsPartial({
        config: this.configPda,
        escrow: deriveEscrowPda(this.programId, params.orderId),
        vault: deriveVaultPda(this.programId, params.orderId),
        buyer,
        buyerTokenAccount: buyerAta,
        usdcMint: this.usdcMint,
      })
      .transaction();
    tx.feePayer = buyer;
    tx.recentBlockhash = params.recentBlockhash ?? (await this.getRecentBlockhash());
    // Unsigned: the buyer signs in the browser. Don't require/verify signatures at serialization.
    return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
  }

  /** Phase 1 of the uniform two-phase flow: wrap {@link prepareOpenEscrowTx} — always a real tx. */
  async prepareOpenEscrow(params: OpenEscrowParams): Promise<{ txBase64: string | null }> {
    return { txBase64: await this.prepareOpenEscrowTx(params) };
  }

  /**
   * Phase 2 of the uniform two-phase flow. Submit the buyer-signed tx (if given), confirm it, then
   * verify the escrow funded as expected. Idempotent: a retry after the tx already landed —
   * sendRawTransaction errors with "already processed" — falls through to verification and returns
   * the existing FUNDED record. `signedTxBase64` null = reconcile-only (cron reaper): skip
   * submission, just verify. Propagates {@link EscrowMismatchError} from verify unchanged so the
   * service can refund a tampered funding.
   *
   * Blockhash expiry: if the failure matches {@link isBlockhashExpired} AND a follow-up read proves
   * no escrow landed for this order, throws {@link EscrowTxExpiredError} — the one submit failure
   * that is PROVEN not-funded, letting the service safely revert the funding claim and hand the
   * buyer a freshly-blockhashed tx to re-sign. If an escrow somehow exists despite the expiry error
   * (e.g. an earlier duplicate submit landed), falls through to ordinary verification instead.
   */
  async submitAndVerifyOpenEscrow(
    params: OpenEscrowParams,
    signedTxBase64: string | null,
  ): Promise<{ record: EscrowRecord; signature: string | null }> {
    let signature: string | null = null;
    if (signedTxBase64) {
      let raw: Buffer;
      try {
        raw = Buffer.from(signedTxBase64, "base64");
      } catch (err) {
        throw new Error(`invalid signed transaction for order ${params.orderId}: ${describeError(err)}`);
      }
      // Recover the funding-tx signature from the signed tx up front so every submit path — fresh,
      // already-processed, or expired-but-landed — yields the same proof link for the ledger.
      signature = recoverTxSignature(raw);
      try {
        const sent = await this.connection.sendRawTransaction(raw, {
          preflightCommitment: CONFIRMED.commitment,
        });
        signature = sent; // authoritative on a successful submit
        await this.connection.confirmTransaction(sent, CONFIRMED.commitment);
      } catch (err) {
        // A retried submit of an already-confirmed tx is not a failure — fall through to verify.
        if (!isAlreadyProcessed(err)) {
          if (isBlockhashExpired(err)) {
            const existing = await this.get(params.orderId);
            if (!existing) {
              throw new EscrowTxExpiredError(
                `open_escrow tx for order ${params.orderId} expired before landing (blockhash aged out): ${describeError(err)}`,
              );
            }
            // An escrow exists despite the expiry — verify it below like any other landed funding.
          } else {
            throw new Error(`failed to submit open_escrow tx for order ${params.orderId}: ${describeError(err)}`);
          }
        }
      }
    }
    const record = await this.verifyEscrowFunded(params.orderId, {
      buyer: params.buyer,
      seller: params.seller,
      amount: params.amount,
    });
    return { record, signature };
  }

  /**
   * After the buyer submits their signed open_escrow tx, confirm the escrow really funded as
   * expected before treating the order as live. Asserts state FUNDED + buyer/seller/amount match and
   * returns the {@link EscrowRecord}. A buyer/seller/amount mismatch throws {@link EscrowMismatchError}
   * (a tampered client funded the PDA with different values); a missing or not-yet-FUNDED escrow
   * throws a plain Error (ordinary "tx hasn't confirmed" retry condition, not tampering).
   */
  async verifyEscrowFunded(
    orderId: string,
    expected: { buyer: string; seller: string; amount: bigint },
  ): Promise<EscrowRecord> {
    const rec = await this.get(orderId);
    if (!rec) {
      throw new Error(`escrow for order ${orderId} not found on-chain — the buyer's open_escrow tx has not confirmed`);
    }
    if (rec.state !== "FUNDED") {
      throw new Error(`escrow for order ${orderId} is ${rec.state}, expected FUNDED`);
    }
    const norm = (k: string) => parsePubkey("wallet", k).toBase58();
    if (norm(rec.buyer) !== norm(expected.buyer)) {
      throw new EscrowMismatchError(
        `escrow buyer mismatch for order ${orderId}: on-chain ${rec.buyer}, expected ${expected.buyer}`,
      );
    }
    if (norm(rec.seller) !== norm(expected.seller)) {
      throw new EscrowMismatchError(
        `escrow seller mismatch for order ${orderId}: on-chain ${rec.seller}, expected ${expected.seller}`,
      );
    }
    if (rec.amount !== expected.amount) {
      throw new EscrowMismatchError(
        `escrow amount mismatch for order ${orderId}: on-chain ${rec.amount}, expected ${expected.amount}`,
      );
    }
    return rec;
  }

  // --- internals -------------------------------------------------------------

  /**
   * Recipient token accounts for a Settle (release/resolve). The Settle context deserializes BOTH
   * the seller and buyer token accounts up front (even the branch it ignores), so both must exist —
   * we idempotently create both (payer = authorizer) so a recipient without an ATA can't brick the
   * payout, and a missing placeholder can't abort the tx before the handler runs.
   */
  private settleAtas(rec: EscrowRecord): {
    sellerAta: PublicKey;
    buyerAta: PublicKey;
    preIxs: TransactionInstruction[];
  } {
    const seller = new PublicKey(rec.seller);
    const buyer = new PublicKey(rec.buyer);
    const sellerAta = getAssociatedTokenAddressSync(this.usdcMint, seller);
    const buyerAta = getAssociatedTokenAddressSync(this.usdcMint, buyer);
    const preIxs = [
      createAssociatedTokenAccountIdempotentInstruction(this.authorizer.publicKey, sellerAta, seller, this.usdcMint),
      createAssociatedTokenAccountIdempotentInstruction(this.authorizer.publicKey, buyerAta, buyer, this.usdcMint),
    ];
    return { sellerAta, buyerAta, preIxs };
  }

  private async runRpc(label: string, orderId: string, builder: AnchorTxBuilder): Promise<string> {
    try {
      return await builder.rpc(CONFIRMED);
    } catch (err) {
      throw new Error(`escrow ${label} failed for order ${orderId}: ${describeError(err)}`);
    }
  }

  private async getRecentBlockhash(): Promise<string> {
    try {
      return (await this.connection.getLatestBlockhash(CONFIRMED.commitment)).blockhash;
    } catch (err) {
      throw new Error(`failed to fetch a recent blockhash from the Solana RPC: ${describeError(err)}`);
    }
  }
}
