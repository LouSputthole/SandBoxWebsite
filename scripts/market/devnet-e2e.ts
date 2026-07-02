/**
 * sboxskins escrow — DEVNET end-to-end test.
 *
 * Drives the REAL production TypeScript client (`src/lib/market/escrow/solana.ts`,
 * `SolanaEscrowClient`) against the deployed devnet program. It sets the five env vars the client
 * reads (from ~/.sboxskins-devnet/devnet-env.json + authorizer.json), then runs three scenarios,
 * each with a fresh unique orderId:
 *
 *   a. HAPPY PATH  — prepareOpenEscrowTx → buyer signs (simulating Phantom) → send+confirm →
 *      verifyEscrowFunded → confirmDelivery → assert PROTECTION_HOLD w/ protectionUntil ≈ now+300 →
 *      wait out the 5-min hold → release → assert seller got amount-3.6%, fee ATA got 3.6%, RELEASED.
 *   b. REFUND      — open+fund → refund → buyer USDC restored, state REFUNDED.
 *   c. DISPUTE     — open+fund → freeze → resolve(refund) → state REFUNDED, funds back to buyer.
 *
 * The happy-path hold wait is ~5 minutes (protection_period is set to 300s on devnet — see
 * devnet-setup.ts). Prints PASS/FAIL per scenario; exits non-zero on any failure.
 *
 * Usage:  npm exec tsx -- scripts/market/devnet-e2e.ts
 */
import { readFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import { getAssociatedTokenAddressSync } from "@solana/spl-token";

const DEVNET_DIR = path.join(os.homedir(), ".sboxskins-devnet");

function loadKeypair(name: string): Keypair {
  const p = path.join(DEVNET_DIR, `${name}.json`);
  if (!existsSync(p)) throw new Error(`missing keypair ${p} — run devnet-setup.ts first`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
}

const envPath = path.join(DEVNET_DIR, "devnet-env.json");
if (!existsSync(envPath)) throw new Error(`missing ${envPath} — run devnet-setup.ts first`);
const env = JSON.parse(readFileSync(envPath, "utf8"));

// ── Set the five env vars the SolanaEscrowClient reads, BEFORE importing/constructing it. ──
process.env.SOLANA_RPC_URL = env.rpcUrl;
process.env.MARKET_ESCROW_PROGRAM_ID = env.programId;
process.env.MARKET_USDC_MINT = env.usdcMint;
process.env.MARKET_FEE_ATA = env.feeAta;
process.env.MARKET_AUTHORIZER_KEYPAIR = readFileSync(path.join(DEVNET_DIR, "authorizer.json"), "utf8");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const nowSec = () => Math.floor(Date.now() / 1000);
const uniqueId = (scen: string) => `e2e-${scen}-${Date.now().toString(36)}${Math.floor(Math.random() * 46656).toString(36)}`;

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`assertion failed: ${msg}`);
}

async function main() {
  console.log("=== sboxskins escrow — DEVNET e2e ===");
  console.log(`RPC:        ${env.rpcUrl}`);
  console.log(`program:    ${env.programId}`);
  console.log(`USDC mint:  ${env.usdcMint}`);
  console.log(`fee ATA:    ${env.feeAta}`);
  console.log(`protection_period: ${env.protectionPeriodSeconds}s (DEVNET-ONLY; prod=86400)\n`);

  const conn = new Connection(env.rpcUrl, "confirmed");
  const buyer = loadKeypair("buyer");
  const seller = loadKeypair("seller");
  const authorizer = loadKeypair("authorizer");
  const mint = new PublicKey(env.usdcMint);
  const feeBps = env.feeBps as number;

  // Import + construct the REAL production client (env already set above). The repo transpiles to
  // CommonJS (no "type":"module"), so under tsx a dynamic import exposes the named exports under
  // `.default`; fall back to it so we drive the exact same class the app uses — no src edits.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- CJS/ESM interop shim for a dynamic import under tsx
  const mod: any = await import("../../src/lib/market/escrow/solana.ts");
  const SolanaEscrowClient = mod.SolanaEscrowClient ?? mod.default?.SolanaEscrowClient;
  if (typeof SolanaEscrowClient !== "function") {
    throw new Error("could not load SolanaEscrowClient from src/lib/market/escrow/solana.ts");
  }
  const client = new SolanaEscrowClient();

  const usdcBal = async (owner: PublicKey): Promise<bigint> => {
    const ata = getAssociatedTokenAddressSync(mint, owner);
    try {
      return BigInt((await conn.getTokenAccountBalance(ata)).value.amount);
    } catch {
      return 0n; // ATA not created yet
    }
  };

  /** open_escrow via the client's buyer-signed flow (Phantom simulated by the buyer Keypair). */
  const openAndFund = async (orderId: string, amount: bigint) => {
    const deadline = nowSec() + 3600;
    const bh = await conn.getLatestBlockhash("confirmed");
    const b64 = await client.prepareOpenEscrowTx({
      orderId,
      buyer: buyer.publicKey.toBase58(),
      seller: seller.publicKey.toBase58(),
      amount,
      feeBps,
      deliveryDeadline: deadline,
      recentBlockhash: bh.blockhash,
    });
    const tx = Transaction.from(Buffer.from(b64, "base64"));
    tx.partialSign(buyer); // buyer signs (fee payer = buyer)
    const sig = await conn.sendRawTransaction(tx.serialize());
    await conn.confirmTransaction(
      { signature: sig, blockhash: bh.blockhash, lastValidBlockHeight: bh.lastValidBlockHeight },
      "confirmed",
    );
    const rec = await client.verifyEscrowFunded(orderId, {
      buyer: buyer.publicKey.toBase58(),
      seller: seller.publicKey.toBase58(),
      amount,
    });
    assert(rec.state === "FUNDED", `expected FUNDED after open, got ${rec.state}`);
    console.log(`   open+fund ok (sig ${sig.slice(0, 12)}…), escrow FUNDED, amount ${amount}`);
    return rec;
  };

  const results: { name: string; ok: boolean; err?: string }[] = [];
  const run = async (name: string, fn: () => Promise<void>) => {
    console.log(`\n──── ${name} ────`);
    try {
      await fn();
      results.push({ name, ok: true });
      console.log(`   ✅ PASS: ${name}`);
    } catch (err) {
      results.push({ name, ok: false, err: String(err) });
      console.log(`   ❌ FAIL: ${name}\n      ${String(err)}`);
    }
  };

  // ── a. Happy path ──────────────────────────────────────────────────────────
  await run("a. happy path (open → confirm → hold → release)", async () => {
    const orderId = uniqueId("rel");
    const amount = 10_000_000n; // 10 USDC (6 decimals)
    console.log(`   orderId=${orderId}`);

    await openAndFund(orderId, amount);

    await client.confirmDelivery(orderId, env.protectionPeriodSeconds, nowSec());
    const held = await client.get(orderId);
    assert(held, "escrow missing after confirmDelivery");
    assert(held!.state === "PROTECTION_HOLD", `expected PROTECTION_HOLD, got ${held!.state}`);
    const expectedUntil = nowSec() + env.protectionPeriodSeconds;
    assert(held!.protectionUntil !== null, "protectionUntil should be set");
    const drift = Math.abs((held!.protectionUntil as number) - expectedUntil);
    assert(drift <= 120, `protectionUntil off by ${drift}s (expected ≈ now+${env.protectionPeriodSeconds})`);
    console.log(`   PROTECTION_HOLD, protectionUntil=${held!.protectionUntil} (≈ now+${env.protectionPeriodSeconds}s, drift ${drift}s)`);

    // Wait out the hold.
    const until = held!.protectionUntil as number;
    console.log(`   waiting out the ~${env.protectionPeriodSeconds}s protection hold…`);
    while (nowSec() < until + 5) {
      const remaining = until + 5 - nowSec();
      console.log(`     ${remaining}s remaining…`);
      await sleep(Math.min(20_000, Math.max(1000, remaining * 1000)));
    }

    const sellerBefore = await usdcBal(seller.publicKey);
    const feeBefore = await usdcBal(authorizer.publicKey); // fee ATA is authorizer-owned

    // release (retry a couple times if the on-chain clock lags our wall clock slightly).
    let released = false;
    for (let i = 0; i < 5 && !released; i++) {
      try {
        await client.release(orderId, nowSec());
        released = true;
      } catch (err) {
        if (String(err).includes("ProtectionNotElapsed")) {
          console.log(`     release rejected (hold not elapsed on-chain yet), retrying in 20s…`);
          await sleep(20_000);
        } else {
          throw err;
        }
      }
    }
    assert(released, "release never succeeded");

    const rel = await client.get(orderId);
    assert(rel!.state === "RELEASED", `expected RELEASED, got ${rel!.state}`);
    const sellerAfter = await usdcBal(seller.publicKey);
    const feeAfter = await usdcBal(authorizer.publicKey);
    const fee = (amount * BigInt(feeBps)) / 10_000n;
    const sellerAmt = amount - fee;
    assert(
      sellerAfter - sellerBefore === sellerAmt,
      `seller delta ${sellerAfter - sellerBefore} != expected ${sellerAmt}`,
    );
    assert(feeAfter - feeBefore === fee, `fee delta ${feeAfter - feeBefore} != expected ${fee}`);
    console.log(`   RELEASED: seller +${sellerAmt} (96.4%), fee +${fee} (3.6%) ✓`);
  });

  // ── b. Refund path ─────────────────────────────────────────────────────────
  await run("b. refund path (open → refund)", async () => {
    const orderId = uniqueId("ref");
    const amount = 5_000_000n; // 5 USDC
    console.log(`   orderId=${orderId}`);

    const buyerBefore = await usdcBal(buyer.publicKey);
    await openAndFund(orderId, amount);
    await client.refund(orderId, nowSec());

    const rec = await client.get(orderId);
    assert(rec!.state === "REFUNDED", `expected REFUNDED, got ${rec!.state}`);
    const buyerAfter = await usdcBal(buyer.publicKey);
    assert(
      buyerAfter === buyerBefore,
      `buyer USDC not restored: before ${buyerBefore}, after ${buyerAfter}`,
    );
    console.log(`   REFUNDED: buyer USDC restored to ${buyerAfter} ✓`);
  });

  // ── c. Dispute path ────────────────────────────────────────────────────────
  await run("c. dispute path (open → freeze → resolve(refund))", async () => {
    const orderId = uniqueId("dis");
    const amount = 7_000_000n; // 7 USDC
    console.log(`   orderId=${orderId}`);

    const buyerBefore = await usdcBal(buyer.publicKey);
    await openAndFund(orderId, amount);

    await client.freeze(orderId, "e2e dispute test");
    const froz = await client.get(orderId);
    assert(froz!.state === "DISPUTED", `expected DISPUTED, got ${froz!.state}`);
    console.log(`   frozen → DISPUTED`);

    await client.resolve(orderId, "refund", nowSec());
    const rec = await client.get(orderId);
    assert(rec!.state === "REFUNDED", `expected REFUNDED, got ${rec!.state}`);
    const buyerAfter = await usdcBal(buyer.publicKey);
    assert(
      buyerAfter === buyerBefore,
      `buyer USDC not restored: before ${buyerBefore}, after ${buyerAfter}`,
    );
    console.log(`   resolved(refund) → REFUNDED: buyer USDC restored to ${buyerAfter} ✓`);
  });

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n=== SUMMARY ===");
  for (const r of results) console.log(`  ${r.ok ? "✅ PASS" : "❌ FAIL"}  ${r.name}${r.err ? ` — ${r.err}` : ""}`);
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.log(`\n${failed.length}/${results.length} scenario(s) FAILED`);
    process.exit(1);
  }
  console.log(`\nAll ${results.length} scenarios PASSED ✅`);
}

main().catch((err) => {
  console.error("\n❌ e2e crashed:", err);
  process.exit(1);
});
