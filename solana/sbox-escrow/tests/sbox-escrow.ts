import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SboxEscrow } from "../target/types/sbox_escrow";
import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  getAccount,
} from "@solana/spl-token";
import { Keypair, PublicKey } from "@solana/web3.js";
import { assert } from "chai";

/**
 * Integration tests — run green in CI (private mirror repo sbox-escrow-ci: anchor build +
 * anchor test on localnet, Anchor 0.30.1). protection_period is set to 0 so `release` is allowed
 * immediately after `confirm_delivery` (warping the validator clock is awkward on localnet). A
 * dedicated test that asserts the hold-gate rejection with a non-zero period + clock warp is a TODO.
 *
 * NOTE: initialize_config is gated on `admin == BOOTSTRAP_ADMIN` (lib.rs). CI substitutes the
 * placeholder with the runner wallet before building; locally set it to `solana address` yourself.
 */
describe("sbox-escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.SboxEscrow as Program<SboxEscrow>;
  const authorizer = provider.wallet; // acts as admin + authorizer in tests

  const FEE_BPS = 360;
  const AMOUNT = 100_000_000; // 100 USDC (6 decimals)
  // open_escrow requires delivery_deadline > now (hardening 8b) — a 0 deadline is rejected.
  const deadline = () => new anchor.BN(Math.floor(Date.now() / 1000) + 3600);

  let mint: PublicKey;
  let feeAta: PublicKey;
  let buyer: Keypair;
  let seller: Keypair;
  let buyerAta: PublicKey;
  let sellerAta: PublicKey;
  let configPda: PublicKey;

  const pda = (label: string, orderId?: string) =>
    PublicKey.findProgramAddressSync(
      orderId ? [Buffer.from(label), Buffer.from(orderId)] : [Buffer.from(label)],
      program.programId,
    )[0];

  before(async () => {
    buyer = Keypair.generate();
    seller = Keypair.generate();
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(buyer.publicKey, 2e9),
    );

    mint = await createMint(provider.connection, buyer, buyer.publicKey, null, 6);
    buyerAta = (await getOrCreateAssociatedTokenAccount(provider.connection, buyer, mint, buyer.publicKey)).address;
    sellerAta = (await getOrCreateAssociatedTokenAccount(provider.connection, buyer, mint, seller.publicKey)).address;
    feeAta = (await getOrCreateAssociatedTokenAccount(provider.connection, buyer, mint, authorizer.publicKey)).address;
    await mintTo(provider.connection, buyer, mint, buyerAta, buyer, 10 * AMOUNT);

    configPda = pda("config");
    // accountsPartial: anchor 0.30 auto-resolves seeded PDAs and its .accounts() type rejects them.
    await program.methods
      .initializeConfig(authorizer.publicKey, FEE_BPS, new anchor.BN(0))
      .accountsPartial({ config: configPda, admin: authorizer.publicKey, feeAccount: feeAta })
      .rpc();
  });

  it("open -> confirm -> release pays seller 96.4% and fee 3.6%", async () => {
    const orderId = "order-release";
    const escrow = pda("escrow", orderId);
    const vault = pda("vault", orderId);

    await program.methods
      .openEscrow(orderId, seller.publicKey, new anchor.BN(AMOUNT), deadline())
      .accountsPartial({
        config: configPda,
        escrow,
        vault,
        buyer: buyer.publicKey,
        buyerTokenAccount: buyerAta,
        usdcMint: mint,
      })
      .signers([buyer])
      .rpc();

    assert.equal(Number((await getAccount(provider.connection, vault)).amount), AMOUNT);

    await program.methods.confirmDelivery(orderId).accountsPartial({ config: configPda, escrow, authorizer: authorizer.publicKey }).rpc();

    await program.methods
      .release(orderId)
      .accountsPartial({
        config: configPda,
        escrow,
        vault,
        sellerTokenAccount: sellerAta,
        feeAccount: feeAta,
        buyerTokenAccount: buyerAta,
        authorizer: authorizer.publicKey,
      })
      .rpc();

    assert.equal(Number((await getAccount(provider.connection, sellerAta)).amount), 96_400_000);
    assert.equal(Number((await getAccount(provider.connection, feeAta)).amount), 3_600_000);
  });

  it("open -> refund by authorizer returns the full amount to the buyer", async () => {
    const orderId = "order-refund";
    const escrow = pda("escrow", orderId);
    const vault = pda("vault", orderId);
    const before = Number((await getAccount(provider.connection, buyerAta)).amount);

    await program.methods
      .openEscrow(orderId, seller.publicKey, new anchor.BN(AMOUNT), deadline())
      .accountsPartial({ config: configPda, escrow, vault, buyer: buyer.publicKey, buyerTokenAccount: buyerAta, usdcMint: mint })
      .signers([buyer])
      .rpc();

    await program.methods
      .refund(orderId)
      .accountsPartial({ config: configPda, escrow, vault, buyerTokenAccount: buyerAta, caller: authorizer.publicKey })
      .rpc();

    assert.equal(Number((await getAccount(provider.connection, buyerAta)).amount), before);
  });

  it("pre-delivery dispute: resolve(release) starts the hold, then release pays (deadlock fix)", async () => {
    const orderId = "order-predelivery";
    const escrow = pda("escrow", orderId);
    const vault = pda("vault", orderId);
    const sellerBefore = Number((await getAccount(provider.connection, sellerAta)).amount);
    const feeBefore = Number((await getAccount(provider.connection, feeAta)).amount);

    await program.methods
      .openEscrow(orderId, seller.publicKey, new anchor.BN(AMOUNT), deadline())
      .accountsPartial({ config: configPda, escrow, vault, buyer: buyer.publicKey, buyerTokenAccount: buyerAta, usdcMint: mint })
      .signers([buyer])
      .rpc();

    // Freeze while still Funded (delivery never confirmed → protection_until stays 0).
    await program.methods
      .freeze(orderId)
      .accountsPartial({ config: configPda, escrow, authorizer: authorizer.publicKey })
      .rpc();

    // Resolving for the seller must NOT pay instantly — it starts the hold (deadlock fix).
    await program.methods
      .resolve(orderId, true)
      .accountsPartial({
        config: configPda,
        escrow,
        vault,
        sellerTokenAccount: sellerAta,
        feeAccount: feeAta,
        buyerTokenAccount: buyerAta,
        authorizer: authorizer.publicKey,
      })
      .rpc();

    const esc = await program.account.escrow.fetch(escrow);
    assert.ok("protectionHold" in esc.state, "resolve(release) on a pre-delivery dispute starts the hold");
    assert.equal(Number((await getAccount(provider.connection, vault)).amount), AMOUNT, "funds still escrowed");

    // protection_period is 0 in these tests, so the hold elapses immediately → normal release pays.
    await program.methods
      .release(orderId)
      .accountsPartial({
        config: configPda,
        escrow,
        vault,
        sellerTokenAccount: sellerAta,
        feeAccount: feeAta,
        buyerTokenAccount: buyerAta,
        authorizer: authorizer.publicKey,
      })
      .rpc();

    assert.equal(Number((await getAccount(provider.connection, sellerAta)).amount), sellerBefore + 96_400_000);
    assert.equal(Number((await getAccount(provider.connection, feeAta)).amount), feeBefore + 3_600_000);
  });
});
