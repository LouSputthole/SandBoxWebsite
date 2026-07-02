/**
 * sboxskins escrow — DEVNET test-USDC mint helper.
 *
 * Mints test USDC (the devnet mint created by devnet-setup.ts, whose authority is the authorizer)
 * to ANY address. The operator uses this to fund his Phantom wallet with test-USDC so he can walk
 * the buyer flow himself on devnet. DEVNET-ONLY — this is not real USDC.
 *
 * Usage:  npm exec tsx -- scripts/market/devnet-mint-usdc.ts <recipient-pubkey> <amount-usdc>
 * Example: npm exec tsx -- scripts/market/devnet-mint-usdc.ts 7xKq...Phantom 250
 */
import { readFileSync, existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";

const DEVNET_DIR = path.join(os.homedir(), ".sboxskins-devnet");

function loadKeypair(name: string): Keypair {
  const p = path.join(DEVNET_DIR, `${name}.json`);
  if (!existsSync(p)) throw new Error(`missing keypair ${p}`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(p, "utf8"))));
}

async function main() {
  const [recipientArg, amountArg] = process.argv.slice(2);
  if (!recipientArg || !amountArg) {
    console.error("usage: tsx scripts/market/devnet-mint-usdc.ts <recipient-pubkey> <amount-usdc>");
    process.exit(2);
  }
  const envPath = path.join(DEVNET_DIR, "devnet-env.json");
  if (!existsSync(envPath)) throw new Error(`missing ${envPath} — run devnet-setup.ts first`);
  const env = JSON.parse(readFileSync(envPath, "utf8"));

  const recipient = new PublicKey(recipientArg);
  const amountUsdc = Number(amountArg);
  if (!Number.isFinite(amountUsdc) || amountUsdc <= 0) throw new Error(`bad amount: ${amountArg}`);

  const conn = new Connection(env.rpcUrl, "confirmed");
  const authorizer = loadKeypair("authorizer"); // the mint authority
  const usdcMint = new PublicKey(env.usdcMint);
  const decimals: number = env.usdcDecimals ?? 6;
  const baseUnits = BigInt(Math.round(amountUsdc * 10 ** decimals));

  console.log(`Minting ${amountUsdc} test-USDC (${env.usdcMint}) to ${recipient.toBase58()} on ${env.rpcUrl}`);
  const ata = await getOrCreateAssociatedTokenAccount(conn, authorizer, usdcMint, recipient);
  const sig = await mintTo(conn, authorizer, usdcMint, ata.address, authorizer, baseUnits);
  const bal = (await conn.getTokenAccountBalance(ata.address)).value;
  console.log(`ATA ${ata.address.toBase58()}`);
  console.log(`minted OK (sig ${sig.slice(0, 16)}…). New balance: ${bal.uiAmountString} test-USDC`);
}

main().catch((err) => {
  console.error("❌ mint failed:", err);
  process.exit(1);
});
