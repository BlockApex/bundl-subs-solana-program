use anchor_lang::prelude::*;
use anchor_spl::{associated_token::AssociatedToken, token::{Mint, Token, TokenAccount}};
use crate::{ErrorCode, Campaign};

#[derive(Accounts)]
pub struct InitializeVault<'info> {
    #[account(
        mut,
        seeds = [b"campaign"],
        bump = campaign.bump
    )]
    pub campaign: Account<'info, Campaign>,

    #[account(
        constraint = mint.key() == campaign.mint @ ErrorCode::InvalidMint,
    )]
    pub mint: Account<'info, Mint>,

    /// Vault authority PDA that owns the vault ATA
    /// seeds: ["vault", campaign]
    /// One per campaign.
    /// NOTE: This account is not stored, only derived & used as signer.
    ///       We include it here to compute bump & to anchor its address in the tx.
    ///       No allocation needed.
    /// CHECK: PDA only, used as a signer
    #[account(
        seeds = [b"vault", campaign.key().as_ref()],
        bump
    )]
    pub vault: UncheckedAccount<'info>,

    /// The ATA of the vault authority for the campaign mint
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = vault
    )]
    pub vault_token_account: Account<'info, TokenAccount>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub associated_token_program: Program<'info, AssociatedToken>,
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}