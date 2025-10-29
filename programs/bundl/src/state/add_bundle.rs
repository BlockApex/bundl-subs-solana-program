use anchor_lang::prelude::*;
use crate::{Bundle, UserBundlSubscriptionController};

#[derive(Accounts)]
#[instruction(bundle_seed: [u8; 16])]
pub struct AddBundle<'info> {
    #[account(
        mut,
        seeds = [b"controller", user.key().as_ref()],
        bump = controller.bump,
    )]
    pub controller: Account<'info, UserBundlSubscriptionController>,

    #[account(
        init_if_needed, 
        payer = user, 
        space = 8 + Bundle::INIT_SPACE, 
        seeds = [
            bundle_seed.as_ref(),
            controller.key().as_ref()
        ],
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
