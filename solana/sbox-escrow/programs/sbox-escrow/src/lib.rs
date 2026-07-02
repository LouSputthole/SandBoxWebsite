use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

// Placeholder (a valid but unowned pubkey) — `anchor keys sync` replaces it with the real
// program id from target/deploy/sbox_escrow-keypair.json; run it before building/deploying.
declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

// Gates the one-time `initialize_config` so a third party can't front-run config creation on a
// fresh program (which would let them set themselves as authorizer + skim fees). SET THIS to the
// operator/deployer pubkey before `anchor deploy` — the all-1s placeholder is the System Program
// id and will (intentionally) reject every caller until replaced.
const BOOTSTRAP_ADMIN: Pubkey = pubkey!("11111111111111111111111111111111");

/// Non-custodial USDC escrow for the sboxskins marketplace.
///
/// Mirrors src/lib/market/escrow/types.ts (EscrowClient) and the escrow-state machine:
///   Funded --confirm_delivery--> ProtectionHold --(hold elapses)--> Released
///                    |                    |
///                 refund               refund (authorizer)      (+ Disputed via freeze/resolve)
///
/// Disputed edges: resolve(refund) -> Refunded; resolve(release) -> Released (hold elapsed) or
/// ProtectionHold (pre-delivery dispute: the hold starts at resolution — see resolve()); the
/// authorizer's refund() may also settle Disputed directly (same checks as resolve-refund).
///
/// Money invariant: vault funds only ever leave to the seller (minus fee) OR the buyer — never
/// the operator, except the fee taken atomically on release. Release is gated on-chain by
/// `protection_until`, so even a compromised authorizer key can't pay a seller early.
///
/// POST-AUDIT TODO (review 2026-07-01, low severity): escrow/vault accounts are not closed on
/// terminal states, so their rent (~0.0038 SOL/order) stays locked and any stray tokens sent to a
/// vault are stranded. Deferred deliberately: naively `close`-ing the escrow PDA (keyed on
/// order_id) would enable order_id replay, so the close+sweep must be designed and TESTED together
/// with a replay guard — not hand-added to unverified source.
#[program]
pub mod sbox_escrow {
    use super::*;

    /// One-time: create the Config PDA. `authorizer` is the backend signer (the swappable seam);
    /// `fee_account` is the USDC token account that collects the fee.
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        authorizer: Pubkey,
        fee_bps: u16,
        protection_period: i64,
    ) -> Result<()> {
        require_keys_eq!(ctx.accounts.admin.key(), BOOTSTRAP_ADMIN, EscrowError::Unauthorized);
        require!(fee_bps <= 10_000, EscrowError::InvalidFee);
        require!(protection_period >= 0, EscrowError::InvalidArg);
        let config = &mut ctx.accounts.config;
        config.admin = ctx.accounts.admin.key();
        config.authorizer = authorizer;
        config.fee_account = ctx.accounts.fee_account.key();
        // Pin the escrow currency to the fee account's mint (USDC). All escrows must use this mint.
        config.mint = ctx.accounts.fee_account.mint;
        config.fee_bps = fee_bps;
        config.protection_period = protection_period;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    /// Swap the authorizer (single signer -> multisig/TEE later). Admin only.
    pub fn update_authorizer(ctx: Context<AdminOnly>, new_authorizer: Pubkey) -> Result<()> {
        ctx.accounts.config.authorizer = new_authorizer;
        Ok(())
    }

    /// Buyer deposits `amount` USDC into a fresh escrow vault. State -> Funded.
    pub fn open_escrow(
        ctx: Context<OpenEscrow>,
        order_id: String,
        seller: Pubkey,
        amount: u64,
        delivery_deadline: i64,
    ) -> Result<()> {
        require!(order_id.len() <= 32, EscrowError::InvalidArg);
        require!(amount > 0, EscrowError::InvalidArg);
        require!(ctx.accounts.buyer.key() != seller, EscrowError::SelfDeal);
        // Deadline must be in the future — stops a buyer setting it to the past and self-refunding
        // out of Funded before the authorizer confirms delivery.
        require!(delivery_deadline > Clock::get()?.unix_timestamp, EscrowError::InvalidArg);

        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer_token_account.to_account_info(),
                    to: ctx.accounts.vault.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            amount,
        )?;

        let escrow = &mut ctx.accounts.escrow;
        escrow.order_id = order_id;
        escrow.buyer = ctx.accounts.buyer.key();
        escrow.seller = seller;
        escrow.amount = amount;
        escrow.fee_bps = ctx.accounts.config.fee_bps;
        escrow.state = EscrowState::Funded;
        escrow.delivery_deadline = delivery_deadline;
        escrow.protection_until = 0;
        escrow.bump = ctx.bumps.escrow;
        escrow.vault_bump = ctx.bumps.vault;
        Ok(())
    }

    /// Authorizer confirms the exact item was delivered -> starts the protection hold.
    pub fn confirm_delivery(ctx: Context<AuthorizerAction>, _order_id: String) -> Result<()> {
        let config = &ctx.accounts.config;
        let escrow = &mut ctx.accounts.escrow;
        require_keys_eq!(ctx.accounts.authorizer.key(), config.authorizer, EscrowError::Unauthorized);
        require!(escrow.state == EscrowState::Funded, EscrowError::InvalidState);
        let now = Clock::get()?.unix_timestamp;
        escrow.protection_until = now.checked_add(config.protection_period).ok_or(EscrowError::Overflow)?;
        escrow.state = EscrowState::ProtectionHold;
        Ok(())
    }

    /// Release to the seller (minus fee). Authorizer-signed AND gated on the hold having elapsed.
    pub fn release(ctx: Context<Settle>, order_id: String) -> Result<()> {
        let config = &ctx.accounts.config;
        require_keys_eq!(ctx.accounts.authorizer.key(), config.authorizer, EscrowError::Unauthorized);
        require!(ctx.accounts.escrow.state == EscrowState::ProtectionHold, EscrowError::InvalidState);
        let now = Clock::get()?.unix_timestamp;
        require!(now >= ctx.accounts.escrow.protection_until, EscrowError::ProtectionNotElapsed);
        require_keys_eq!(ctx.accounts.fee_account.key(), config.fee_account, EscrowError::WrongFeeAccount);
        require_keys_eq!(ctx.accounts.seller_token_account.owner, ctx.accounts.escrow.seller, EscrowError::WrongRecipient);

        pay_out(
            &ctx.accounts.escrow,
            &ctx.accounts.vault,
            &ctx.accounts.seller_token_account,
            &ctx.accounts.fee_account,
            &ctx.accounts.token_program,
            &order_id,
        )?;
        ctx.accounts.escrow.state = EscrowState::Released;
        Ok(())
    }

    /// Refund the buyer in full. Buyer may call after the delivery deadline (state Funded);
    /// the authorizer may call any time (reversal during hold, or dispute cleanup).
    pub fn refund(ctx: Context<Refund>, order_id: String) -> Result<()> {
        let config = &ctx.accounts.config;
        let escrow = &ctx.accounts.escrow;
        let caller = ctx.accounts.caller.key();
        let now = Clock::get()?.unix_timestamp;

        let by_authorizer = caller == config.authorizer
            && matches!(escrow.state, EscrowState::Funded | EscrowState::ProtectionHold | EscrowState::Disputed);
        let by_buyer = caller == escrow.buyer
            && escrow.state == EscrowState::Funded
            && now >= escrow.delivery_deadline;
        require!(by_authorizer || by_buyer, EscrowError::Unauthorized);
        require_keys_eq!(ctx.accounts.buyer_token_account.owner, escrow.buyer, EscrowError::WrongRecipient);

        transfer_from_vault(
            &ctx.accounts.escrow,
            &ctx.accounts.vault,
            &ctx.accounts.buyer_token_account,
            &ctx.accounts.token_program,
            ctx.accounts.escrow.amount,
            &order_id,
        )?;
        ctx.accounts.escrow.state = EscrowState::Refunded;
        Ok(())
    }

    /// Freeze a contested escrow for operator resolution.
    pub fn freeze(ctx: Context<AuthorizerAction>, _order_id: String) -> Result<()> {
        require_keys_eq!(ctx.accounts.authorizer.key(), ctx.accounts.config.authorizer, EscrowError::Unauthorized);
        let escrow = &mut ctx.accounts.escrow;
        require!(
            matches!(escrow.state, EscrowState::Funded | EscrowState::ProtectionHold),
            EscrowError::InvalidState
        );
        escrow.state = EscrowState::Disputed;
        Ok(())
    }

    /// Resolve a dispute -> release to seller (still respecting the hold) or refund the buyer.
    ///
    /// Pre-delivery disputes (frozen from Funded, so `protection_until` is still 0 — only
    /// `confirm_delivery` sets it): deciding for the seller STARTS the hold (state ->
    /// ProtectionHold) instead of failing forever; the normal `release` path then pays out once the
    /// hold elapses. Without this, such disputes could only ever resolve to refund. Instant release
    /// stays impossible in every path.
    pub fn resolve(ctx: Context<Settle>, order_id: String, release_to_seller: bool) -> Result<()> {
        let config = &ctx.accounts.config;
        require_keys_eq!(ctx.accounts.authorizer.key(), config.authorizer, EscrowError::Unauthorized);
        require!(ctx.accounts.escrow.state == EscrowState::Disputed, EscrowError::InvalidState);

        if release_to_seller {
            let now = Clock::get()?.unix_timestamp;
            if ctx.accounts.escrow.protection_until == 0 {
                let until = now.checked_add(config.protection_period).ok_or(EscrowError::Overflow)?;
                let escrow = &mut ctx.accounts.escrow;
                escrow.protection_until = until;
                escrow.state = EscrowState::ProtectionHold;
                return Ok(());
            }
            require!(now >= ctx.accounts.escrow.protection_until, EscrowError::ProtectionNotElapsed);
            require_keys_eq!(ctx.accounts.fee_account.key(), config.fee_account, EscrowError::WrongFeeAccount);
            require_keys_eq!(ctx.accounts.seller_token_account.owner, ctx.accounts.escrow.seller, EscrowError::WrongRecipient);
            pay_out(
                &ctx.accounts.escrow,
                &ctx.accounts.vault,
                &ctx.accounts.seller_token_account,
                &ctx.accounts.fee_account,
                &ctx.accounts.token_program,
                &order_id,
            )?;
            ctx.accounts.escrow.state = EscrowState::Released;
        } else {
            require_keys_eq!(
                ctx.accounts.buyer_token_account.owner,
                ctx.accounts.escrow.buyer,
                EscrowError::WrongRecipient
            );
            transfer_from_vault(
                &ctx.accounts.escrow,
                &ctx.accounts.vault,
                &ctx.accounts.buyer_token_account,
                &ctx.accounts.token_program,
                ctx.accounts.escrow.amount,
                &order_id,
            )?;
            ctx.accounts.escrow.state = EscrowState::Refunded;
        }
        Ok(())
    }
}

// --- helpers -----------------------------------------------------------------

fn split_fee(amount: u64, fee_bps: u16) -> Result<(u64, u64)> {
    let fee = (amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(EscrowError::Overflow)?
        / 10_000u128;
    let fee = fee as u64;
    let seller = amount.checked_sub(fee).ok_or(EscrowError::Overflow)?;
    Ok((seller, fee))
}

fn vault_signer_seeds<'a>(order_id: &'a str, bump: &'a [u8; 1]) -> [&'a [u8]; 3] {
    [b"escrow", order_id.as_bytes(), bump]
}

fn transfer_from_vault<'info>(
    escrow: &Account<'info, Escrow>,
    vault: &Account<'info, TokenAccount>,
    dest: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    amount: u64,
    order_id: &str,
) -> Result<()> {
    let bump = [escrow.bump];
    let seeds = vault_signer_seeds(order_id, &bump);
    let signer = [&seeds[..]];
    token::transfer(
        CpiContext::new_with_signer(
            token_program.to_account_info(),
            Transfer {
                from: vault.to_account_info(),
                to: dest.to_account_info(),
                authority: escrow.to_account_info(),
            },
            &signer,
        ),
        amount,
    )
}

fn pay_out<'info>(
    escrow: &Account<'info, Escrow>,
    vault: &Account<'info, TokenAccount>,
    seller: &Account<'info, TokenAccount>,
    fee_account: &Account<'info, TokenAccount>,
    token_program: &Program<'info, Token>,
    order_id: &str,
) -> Result<()> {
    let (seller_amount, fee_amount) = split_fee(escrow.amount, escrow.fee_bps)?;
    transfer_from_vault(escrow, vault, seller, token_program, seller_amount, order_id)?;
    if fee_amount > 0 {
        transfer_from_vault(escrow, vault, fee_account, token_program, fee_amount, order_id)?;
    }
    Ok(())
}

// --- state -------------------------------------------------------------------

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum EscrowState {
    Funded,
    ProtectionHold,
    Released,
    Refunded,
    Disputed,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
    pub authorizer: Pubkey,
    pub fee_account: Pubkey,
    /// The one SPL mint (USDC) all escrows must use. Pinned from fee_account.mint at init.
    pub mint: Pubkey,
    pub fee_bps: u16,
    pub protection_period: i64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct Escrow {
    #[max_len(32)]
    pub order_id: String,
    pub buyer: Pubkey,
    pub seller: Pubkey,
    pub amount: u64,
    pub fee_bps: u16,
    pub state: EscrowState,
    pub delivery_deadline: i64,
    pub protection_until: i64,
    pub bump: u8,
    pub vault_bump: u8,
}

// --- contexts ----------------------------------------------------------------

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(init, payer = admin, space = 8 + Config::INIT_SPACE, seeds = [b"config"], bump)]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub admin: Signer<'info>,
    pub fee_account: Account<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AdminOnly<'info> {
    #[account(mut, seeds = [b"config"], bump = config.bump, has_one = admin @ EscrowError::Unauthorized)]
    pub config: Account<'info, Config>,
    pub admin: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(order_id: String)]
pub struct OpenEscrow<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = buyer,
        space = 8 + Escrow::INIT_SPACE,
        seeds = [b"escrow", order_id.as_bytes()],
        bump
    )]
    pub escrow: Account<'info, Escrow>,
    #[account(
        init,
        payer = buyer,
        token::mint = usdc_mint,
        token::authority = escrow,
        seeds = [b"vault", order_id.as_bytes()],
        bump
    )]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub buyer: Signer<'info>,
    #[account(mut, constraint = buyer_token_account.owner == buyer.key(), constraint = buyer_token_account.mint == usdc_mint.key())]
    pub buyer_token_account: Account<'info, TokenAccount>,
    #[account(constraint = usdc_mint.key() == config.mint @ EscrowError::WrongMint)]
    pub usdc_mint: Account<'info, Mint>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(order_id: String)]
pub struct AuthorizerAction<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"escrow", order_id.as_bytes()], bump = escrow.bump)]
    pub escrow: Account<'info, Escrow>,
    pub authorizer: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(order_id: String)]
pub struct Settle<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"escrow", order_id.as_bytes()], bump = escrow.bump)]
    pub escrow: Account<'info, Escrow>,
    #[account(mut, seeds = [b"vault", order_id.as_bytes()], bump = escrow.vault_bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub seller_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub fee_account: Account<'info, TokenAccount>,
    /// Only used by resolve() when refunding a dispute to the buyer; ignored by release().
    #[account(mut)]
    pub buyer_token_account: Account<'info, TokenAccount>,
    pub authorizer: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
#[instruction(order_id: String)]
pub struct Refund<'info> {
    #[account(seeds = [b"config"], bump = config.bump)]
    pub config: Account<'info, Config>,
    #[account(mut, seeds = [b"escrow", order_id.as_bytes()], bump = escrow.bump)]
    pub escrow: Account<'info, Escrow>,
    #[account(mut, seeds = [b"vault", order_id.as_bytes()], bump = escrow.vault_bump)]
    pub vault: Account<'info, TokenAccount>,
    #[account(mut)]
    pub buyer_token_account: Account<'info, TokenAccount>,
    pub caller: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum EscrowError {
    #[msg("Not authorized for this action")]
    Unauthorized,
    #[msg("Escrow is not in the required state")]
    InvalidState,
    #[msg("Protection window has not elapsed")]
    ProtectionNotElapsed,
    #[msg("Delivery deadline has not passed")]
    DeadlineNotReached,
    #[msg("Fee account does not match config")]
    WrongFeeAccount,
    #[msg("Escrow mint must match the configured USDC mint")]
    WrongMint,
    #[msg("Recipient token account owner mismatch")]
    WrongRecipient,
    #[msg("Fee basis points out of range")]
    InvalidFee,
    #[msg("Invalid argument")]
    InvalidArg,
    #[msg("Buyer and seller must differ")]
    SelfDeal,
    #[msg("Arithmetic overflow")]
    Overflow,
}
