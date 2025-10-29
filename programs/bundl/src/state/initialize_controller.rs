use anchor_lang::prelude::*;
use anchor_spl::token::{Token, TokenAccount, Mint};
use crate::UserBundlSubscriptionController;

#[derive(Accounts)]
pub struct InitializeController<'info> {
    // create pda with seed "controller" and authority pubkey and use
    #[account(
        init_if_needed, // if it fails the pda is still created with init, when re-running it uses the same pda
        payer = authority, 
        space = 8 + UserBundlSubscriptionController::INIT_SPACE, 
        seeds = [b"controller", authority.key().as_ref()], 
        bump
    )]
    pub controller: Account<'info, UserBundlSubscriptionController>,

    #[account()]
    pub mint_account: Account<'info, Mint>,
    
    #[account(mut)]
    pub authority: Signer<'info>,

    // the user's token account from which funds will be deducted
    #[account(mut,
        associated_token::mint = mint_account,
        associated_token::authority = authority
    )]
    pub from_token_account: Account<'info, TokenAccount>,

    // the token program
    pub token_program: Program<'info, Token>,

    // the system program
    pub system_program: Program<'info, System>,
}