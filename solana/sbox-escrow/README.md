# sbox-escrow (Anchor program)

Non-custodial USDC escrow for the sboxskins marketplace. This is the on-chain half that
`src/lib/market/escrow/` abstracts over — the in-memory mock stands in for it until it's deployed.

> ⚠️ **UNVERIFIED.** Authored without a local Solana/Anchor toolchain (the main repo is on
> Windows). It has NOT been `anchor build`/`anchor test`-run yet — expect to fix small details
> (account names, PDA derivation, version pins) on the first real build. Do not deploy to mainnet
> without a fresh build + the **security audit** gate.

## What it does

- `initialize_config(authorizer, fee_bps, protection_period)` — one-time Config PDA. `authorizer`
  is the backend signer (the swappable seam); `fee_bps = 360` (3.6%); `protection_period` = the
  Steam trade-protection window in seconds (7 days in prod, **0 in tests**).
- `open_escrow(order_id, seller, amount, delivery_deadline)` — buyer deposits USDC into a vault PDA.
- `confirm_delivery(order_id)` — authorizer; starts the protection hold.
- `release(order_id)` — authorizer **and** `now >= protection_until`; pays seller `amount*(1-fee)`
  and the fee account `amount*fee`. The hold gate is enforced on-chain, so a compromised authorizer
  key still can't pay a seller early.
- `refund(order_id)` — buyer after the delivery deadline, or authorizer any time (reversal/dispute).
- `freeze` / `resolve(release_to_seller)` — dispute handling.

State: `Funded → ProtectionHold → Released | Refunded` (+ `Disputed`). Matches
`src/lib/market/escrow-state.ts`.

## Build & test (needs WSL/Linux)

```sh
# prereqs: rustup, solana-cli, anchor-cli (avm), yarn
cd solana/sbox-escrow
anchor keys list                 # copy the program id
# paste it into declare_id!(...) in programs/sbox-escrow/src/lib.rs AND Anchor.toml
anchor build
anchor test                      # spins up a local validator, runs tests/sbox-escrow.ts
```

## Wiring to the web app (after deploy)

1. `anchor deploy --provider.cluster devnet` → note the program id.
2. Copy `target/idl/sbox_escrow.json` + `target/types/sbox_escrow.ts` into the web app.
3. Implement `src/lib/market/escrow/solana.ts` (`SolanaEscrowClient implements EscrowClient`)
   against the IDL, and switch `getEscrowClient()` on `MARKET_ESCROW=solana`.
4. Provision the operator wallets + env per `docs/superpowers/plans/2026-07-01-marketplace-operator-setup.md`.

## Security-review hardening (2026-07-01)

Applied to source (still UNVERIFIED — validate on `anchor build`):
- **Init front-run gate:** `initialize_config` requires `admin == BOOTSTRAP_ADMIN`. **Set
  `BOOTSTRAP_ADMIN` (top of lib.rs) to your deployer/operator pubkey before deploy** — the all-1s
  placeholder rejects everyone. **For `anchor test`, set it to your provider wallet
  (`solana address`)** or the init test will fail the gate.
- **USDC mint pinned:** Config now stores `mint` (from `fee_account.mint`); `open_escrow` rejects
  any escrow whose mint ≠ `config.mint` (`WrongMint`). No more arbitrary-token escrows.
- **Deadline bound:** `open_escrow` requires `delivery_deadline > now` (no past-dated instant self-refund).

## TODO before mainnet

- Non-zero-`protection_period` + clock-warp test proving `release` is rejected during the hold.
- Close vault + escrow accounts on terminal states to reclaim rent — **must ship with an order_id
  replay guard** (closing the order_id-keyed PDA otherwise allows re-init). Deferred to the audited build.
- Oracle-attribution rework (see the web review): correlate delivery to the seller's outgoing trade offer.
- **Third-party audit.**
