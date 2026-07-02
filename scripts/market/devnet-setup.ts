/**
 * sboxskins escrow — DEVNET one-time setup.
 *
 * Run AFTER the program is deployed to devnet (via the sbox-escrow-ci `deploy-devnet.yml`
 * workflow). This is devnet/testnet only — no real money anywhere.
 *
 * What it does:
 *   1. Ensures the authorizer / buyer / seller wallets have some devnet SOL (transfers from the
 *      deployer wallet, which is faucet-funded in CI; the dev machine's residential IP is
 *      faucet-rate-limited, so we do NOT rely on `requestAirdrop` here — we try it best-effort
 *      then top up by transfer).
 *   2. Creates a TEST USDC mint (6 decimals, mint authority = authorizer). NOT real USDC.
 *   3. Creates the authorizer's fee ATA for that mint (this is MARKET_FEE_ATA).
 *   4. Creates test buyer.json + seller.json wallets, funds them, and mints 1,000 test-USDC to
 *      the buyer's ATA.
 *   5. Calls the on-chain `initialize_config` (via anchor + the committed IDL) with
 *      fee_bps = 360 and protection_period_seconds = 300.
 *
 * ┌───────────────────────────────────────────────────────────────────────────────────────────┐
 * │  ⚠️  DEVNET-ONLY DIVERGENCE: protection_period = 300s (5 min), NOT the production 86400s     │
 * │  (24h). This is deliberate so the full escrow lifecycle (open → confirm → hold → release)    │
 * │  is observable inside a single e2e test run. MAINNET MUST use 86400. See DEVNET.md.          │
 * └───────────────────────────────────────────────────────────────────────────────────────────┘
 *
 * Keypairs + the generated devnet-env.json live under ~/.sboxskins-devnet (NEVER in the repo).
 *
 * Usage:  npm exec tsx -- scripts/market/devnet-setup.ts
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import path from "node:path";
import * as anchor from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  VersionedTransaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  createMint,
  getMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";

// --- constants ---------------------------------------------------------------

const DEVNET_DIR = path.join(os.homedir(), ".sboxskins-devnet");
const RPC_URL = process.env.SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
const FEE_BPS = 360; // 3.6% marketplace fee
// 🔴 DEVNET-ONLY: 5 minutes so the hold is observable in a test. Production = 86_400 (24h).
const PROTECTION_PERIOD_SECONDS = 300;
const USDC_DECIMALS = 6;
const MINT_TO_BUYER_USDC = 1_000; // 1,000 test-USDC to the buyer for e2e runs

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const IDL_PATH = path.resolve(__dirname, "../../src/lib/market/escrow/sbox_escrow.idl.json");

// --- helpers -----------------------------------------------------------------

function loadKeypair(name: string): Keypair {
  const p = path.join(DEVNET_DIR, `${name}.json`);
  if (!existsSync(p)) throw new Error(`missing keypair ${p} — run keypair generation first`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
}

function loadOrCreateKeypair(name: string): { kp: Keypair; created: boolean } {
  const p = path.join(DEVNET_DIR, `${name}.json`);
  if (existsSync(p)) return { kp: loadKeypair(name), created: false };
  const kp = Keypair.generate();
  writeFileSync(p, JSON.stringify(Array.from(kp.secretKey)));
  return { kp, created: true };
}

/** Minimal anchor Wallet backed by a keypair (avoids anchor's Wallet export edge cases). */
class KeypairWallet {
  constructor(readonly payer: Keypair) {}
  get publicKey() {
    return this.payer.publicKey;
  }
  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if (tx instanceof VersionedTransaction) tx.sign([this.payer]);
    else tx.partialSign(this.payer);
    return tx;
  }
  async signAllTransactions<T extends Transaction | VersionedTransaction>(txs: T[]): Promise<T[]> {
    for (const tx of txs) await this.signTransaction(tx);
    return txs;
  }
}

/**
 * Make sure `who` has at least `minSol`. Tries a devnet airdrop first (best-effort — the residential
 * IP is usually rate-limited), then tops up by transferring from `funder` (the faucet-funded deployer).
 */
async function ensureFunded(
  conn: Connection,
  who: Keypair,
  minSol: number,
  funder: Keypair,
  label: string,
): Promise<void> {
  const need = Math.ceil(minSol * LAMPORTS_PER_SOL);
  let bal = await conn.getBalance(who.publicKey);
  if (bal >= need) {
    console.log(`  [${label}] already funded: ${(bal / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
    return;
  }
  // best-effort airdrop (honours the intent when the faucet is available)
  try {
    const sig = await conn.requestAirdrop(who.publicKey, need - bal);
    const bh = await conn.getLatestBlockhash("confirmed");
    await conn.confirmTransaction({ signature: sig, ...bh }, "confirmed");
    bal = await conn.getBalance(who.publicKey);
    console.log(`  [${label}] airdropped -> ${(bal / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
  } catch {
    /* faucet rate-limited — fall through to transfer */
  }
  if (bal >= need) return;
  const gap = need - bal;
  const funderBal = await conn.getBalance(funder.publicKey);
  if (funderBal < gap + 5000) {
    throw new Error(
      `cannot fund ${label}: needs ${gap / LAMPORTS_PER_SOL} more SOL but funder ` +
        `${funder.publicKey.toBase58()} has only ${(funderBal / LAMPORTS_PER_SOL).toFixed(3)} SOL`,
    );
  }
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: funder.publicKey, toPubkey: who.publicKey, lamports: gap }),
  );
  const sig = await sendAndConfirmTransaction(conn, tx, [funder], { commitment: "confirmed" });
  bal = await conn.getBalance(who.publicKey);
  console.log(
    `  [${label}] transferred ${(gap / LAMPORTS_PER_SOL).toFixed(3)} SOL from deployer -> ` +
      `${(bal / LAMPORTS_PER_SOL).toFixed(3)} SOL (sig ${sig.slice(0, 12)})`,
  );
}

// --- main --------------------------------------------------------------------

async function main() {
  console.log("=== sboxskins escrow — DEVNET setup ===");
  console.log(`RPC: ${RPC_URL}`);
  console.log(
    "🔴 protection_period = 300s (DEVNET-ONLY; production must be 86400 = 24h). " +
      "See the loud comment at the top of this file / DEVNET.md.\n",
  );

  const program = loadKeypair("program-keypair");
  const authorizer = loadKeypair("authorizer");
  const deployer = loadKeypair("deployer");
  const programId = program.publicKey;

  console.log(`program id:  ${programId.toBase58()}`);
  console.log(`authorizer:  ${authorizer.publicKey.toBase58()} (admin + authorizer + mint authority)`);
  console.log(`deployer:    ${deployer.publicKey.toBase58()} (local funding source)\n`);

  const conn = new Connection(RPC_URL, "confirmed");

  // Guard: the program must actually be deployed before we can initialize_config.
  const progAcct = await conn.getAccountInfo(programId);
  if (!progAcct || !progAcct.executable) {
    throw new Error(
      `program ${programId.toBase58()} is not deployed/executable on ${RPC_URL} yet — ` +
        `run the deploy-devnet.yml workflow first`,
    );
  }
  const deployerBal = await conn.getBalance(deployer.publicKey);
  console.log(`deployer balance: ${(deployerBal / LAMPORTS_PER_SOL).toFixed(3)} SOL\n`);

  // 1. Fund the authorizer (pays for mint/ATA creation, config init, and all e2e tx fees).
  console.log("Funding wallets (from deployer)…");
  await ensureFunded(conn, authorizer, 0.5, deployer, "authorizer");

  // 2. Test USDC mint (6 decimals, mint authority = authorizer). Reuse if it already exists.
  console.log("\nTest USDC mint…");
  const { kp: mintKp, created: mintCreated } = loadOrCreateKeypair("usdc-mint");
  let usdcMint: PublicKey;
  const mintAcct = await conn.getAccountInfo(mintKp.publicKey);
  if (mintAcct) {
    await getMint(conn, mintKp.publicKey); // validate it's a real mint
    usdcMint = mintKp.publicKey;
    console.log(`  reusing existing test USDC mint ${usdcMint.toBase58()}`);
  } else {
    usdcMint = await createMint(
      conn,
      authorizer, // payer
      authorizer.publicKey, // mint authority
      null, // no freeze authority
      USDC_DECIMALS,
      mintKp,
    );
    console.log(`  created test USDC mint ${usdcMint.toBase58()} (created=${mintCreated})`);
  }

  // 3. Fee ATA (authorizer owns it) — this is MARKET_FEE_ATA.
  const feeAtaAccount = await getOrCreateAssociatedTokenAccount(
    conn,
    authorizer,
    usdcMint,
    authorizer.publicKey,
  );
  const feeAta = feeAtaAccount.address;
  console.log(`  fee ATA (MARKET_FEE_ATA): ${feeAta.toBase58()}`);

  // 4. Test buyer + seller wallets, funded, buyer gets 1,000 test-USDC.
  console.log("\nTest buyer + seller wallets…");
  const { kp: buyer, created: buyerCreated } = loadOrCreateKeypair("buyer");
  const { kp: seller, created: sellerCreated } = loadOrCreateKeypair("seller");
  console.log(`  buyer:  ${buyer.publicKey.toBase58()} (created=${buyerCreated})`);
  console.log(`  seller: ${seller.publicKey.toBase58()} (created=${sellerCreated})`);
  await ensureFunded(conn, buyer, 0.5, deployer, "buyer");
  await ensureFunded(conn, seller, 0.5, deployer, "seller");

  const buyerAtaAccount = await getOrCreateAssociatedTokenAccount(
    conn,
    authorizer, // payer
    usdcMint,
    buyer.publicKey,
  );
  const buyerAta = buyerAtaAccount.address;
  const mintAmount = BigInt(MINT_TO_BUYER_USDC) * BigInt(10 ** USDC_DECIMALS);
  await mintTo(conn, authorizer, usdcMint, buyerAta, authorizer, mintAmount);
  const buyerUsdc = (await conn.getTokenAccountBalance(buyerAta)).value;
  console.log(`  minted ${MINT_TO_BUYER_USDC} test-USDC to buyer ATA ${buyerAta.toBase58()}`);
  console.log(`  buyer USDC balance: ${buyerUsdc.uiAmountString}`);

  // 5. initialize_config via anchor + the committed IDL. admin = authorizer (== BOOTSTRAP_ADMIN
  //    baked into the deployed program), so the front-run gate passes.
  console.log("\ninitialize_config…");
  const idl = JSON.parse(readFileSync(IDL_PATH, "utf8"));
  idl.address = programId.toBase58(); // the committed IDL's address is a throwaway
  const provider = new anchor.AnchorProvider(conn, new KeypairWallet(authorizer) as anchor.Wallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const anchorProgram = new anchor.Program(idl, provider);
  const configPda = PublicKey.findProgramAddressSync([Buffer.from("config")], programId)[0];

  const existingConfig = await conn.getAccountInfo(configPda);
  if (existingConfig) {
    console.log(`  config PDA ${configPda.toBase58()} already initialized — skipping`);
    // Surface the on-chain values so a re-run is self-documenting.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- anchor Program is untyped without generated IDL types
    const cfg = await (anchorProgram.account as any).config.fetch(configPda);
    console.log(
      `    authorizer=${cfg.authorizer.toBase58()} feeAccount=${cfg.feeAccount.toBase58()} ` +
        `mint=${cfg.mint.toBase58()} feeBps=${cfg.feeBps} protectionPeriod=${cfg.protectionPeriod}s`,
    );
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- anchor Program is untyped without generated IDL types
    const sig = await (anchorProgram.methods as any)
      .initializeConfig(authorizer.publicKey, FEE_BPS, new anchor.BN(PROTECTION_PERIOD_SECONDS))
      .accountsPartial({ config: configPda, admin: authorizer.publicKey, feeAccount: feeAta })
      .rpc({ commitment: "confirmed" });
    console.log(`  initialize_config OK (sig ${sig.slice(0, 16)}…)`);
    console.log(
      `    fee_bps=${FEE_BPS}, protection_period=${PROTECTION_PERIOD_SECONDS}s ` +
        `🔴(DEVNET-ONLY; prod=86400), authorizer=${authorizer.publicKey.toBase58()}`,
    );
  }

  // Persist everything the e2e + docs need.
  const env = {
    network: "devnet",
    rpcUrl: RPC_URL,
    programId: programId.toBase58(),
    authorizer: authorizer.publicKey.toBase58(),
    deployer: deployer.publicKey.toBase58(),
    usdcMint: usdcMint.toBase58(),
    feeAta: feeAta.toBase58(),
    configPda: configPda.toBase58(),
    buyer: buyer.publicKey.toBase58(),
    seller: seller.publicKey.toBase58(),
    buyerAta: buyerAta.toBase58(),
    feeBps: FEE_BPS,
    protectionPeriodSeconds: PROTECTION_PERIOD_SECONDS,
    usdcDecimals: USDC_DECIMALS,
    generatedAt: new Date().toISOString(),
  };
  const envPath = path.join(DEVNET_DIR, "devnet-env.json");
  writeFileSync(envPath, JSON.stringify(env, null, 2));
  console.log(`\nWrote ${envPath}`);

  // The five env values the SolanaEscrowClient needs (for .env.local).
  console.log("\n=== .env.local (devnet) ===");
  console.log(`SOLANA_RPC_URL=${RPC_URL}`);
  console.log(`MARKET_ESCROW_PROGRAM_ID=${programId.toBase58()}`);
  console.log(`MARKET_USDC_MINT=${usdcMint.toBase58()}`);
  console.log(`MARKET_FEE_ATA=${feeAta.toBase58()}`);
  console.log(`MARKET_AUTHORIZER_KEYPAIR=<contents of ${path.join(DEVNET_DIR, "authorizer.json")}>`);
  console.log("\n(also set MARKET_ESCROW=solana to switch the app off the mock)");
  console.log("\n✅ devnet setup complete.");
}

main().catch((err) => {
  console.error("\n❌ devnet setup FAILED:", err);
  process.exit(1);
});
