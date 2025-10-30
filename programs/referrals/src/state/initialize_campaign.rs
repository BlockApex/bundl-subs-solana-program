use anchor_lang::prelude::*;
use anchor_spl::token::{Mint};
use crate::Campaign;

#[derive(Accounts)]
pub struct InitializeCampaign<'info> {
    #[account(
        init_if_needed, 
        payer = authority, 
        space = 8 + Campaign::INIT_SPACE, 
        seeds = [b"campaign"], 
        bump
    )]
    pub campaign: Account<'info, Campaign>,
    
    #[account()]
    pub mint: Account<'info, Mint>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}