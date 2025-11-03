use crate::error::ErrorCode;
use crate::Campaign;
use crate::ClaimStatus;
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

#[derive(Accounts)]
pub struct Claim<'info> {
    /// The claimer (recipient)
    #[account(mut)]
    pub claimer: Signer<'info>,

    #[account(
        constraint = mint.key() == campaign.mint @ ErrorCode::InvalidMint,
    )]
    pub mint: Account<'info, Mint>,

    /// Campaign holding the root and config
    #[account(
        mut,
        seeds = [b"campaign"],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,

    /// ClaimStatus PDA: unique for (campaign, claimer) to prevent double-claim
    #[account(
        init_if_needed,
        payer = claimer,
        space = 8 + ClaimStatus::INIT_SPACE,
        seeds = [b"claimed", campaign.key().as_ref(), claimer.key().as_ref()],
        bump
    )]
    pub claim_status: Account<'info, ClaimStatus>,

    /// PDA that owns the vault ATA
    /// CHECK: PDA only
    #[account(
        seeds = [b"vault", campaign.key().as_ref()],
        bump = campaign.vault_bump
    )]
    pub vault_authority: UncheckedAccount<'info>,

    /// Campaign vault ATA
    // #[account(
    //     mut,
    //     constraint = vault_token_account.mint == mint.key(),
    //     constraint = vault_token_account.owner == vault_authority.key()
    // )]
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = vault_authority
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    /// User's ATA (created if missing by client beforehand, or you can add an init_if_needed pattern)
    // #[account(
    //     mut,
    //     constraint = user_token_account.mint == mint.key(),
    //     constraint = user_token_account.owner == claimer.key()
    // )]
    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = claimer
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}
