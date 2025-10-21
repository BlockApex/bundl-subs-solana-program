use anchor_lang::prelude::*;
use crate::{Bundle, UserBundlSubscriptionController};

#[derive(Accounts)]
pub struct AddBundle<'info> {
    #[account(
        mut,
        seeds = [b"controller", user.key().as_ref()],
        bump = controller.bump,
    )]
    pub controller: Account<'info, UserBundlSubscriptionController>,

    #[account(
        init, 
        payer = authority, 
        space = 8 + Bundle::INIT_SPACE, 
        seeds = [controller.bundle_counter.to_le_bytes().as_ref(), controller.key().as_ref()], 
        bump
    )]
    pub bundle: Account<'info, Bundle>,

    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(mut)]
    pub user: Signer<'info>,

    // the system program
    pub system_program: Program<'info, System>,
}