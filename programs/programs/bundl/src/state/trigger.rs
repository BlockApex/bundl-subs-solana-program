use anchor_lang::prelude::*;
use crate::{Bundle, UserBundlSubscriptionController};
use anchor_spl::token::{Token, TokenAccount, Mint};

#[derive(Accounts)]
#[instruction(_bundle_identifier: u64)]
pub struct Trigger<'info> {
    #[account(
        mut,
        seeds = [b"controller", user.key().as_ref()], 
        bump = controller.bump,
    )]
    pub controller: Account<'info, UserBundlSubscriptionController>,

    #[account(
        mut,
        seeds = [_bundle_identifier.to_le_bytes().as_ref(), controller.key().as_ref()], 
        bump
    )]
    pub bundle: Account<'info, Bundle>,

    #[account(
        mut,
        associated_token::mint = mint_account,
        associated_token::authority = user
    )]
    pub user_token_account: Account<'info, TokenAccount>,

    /// CHECK: recipient is only used to derive its associated token account.
    #[account(mut)]
    pub user: AccountInfo<'info>,
    
    #[account()]
    pub mint_account: Account<'info, Mint>,
    
    #[account(mut)]
    pub authority: Signer<'info>,

    // the token program
    pub token_program: Program<'info, Token>,

    // the system program
    pub system_program: Program<'info, System>,
}