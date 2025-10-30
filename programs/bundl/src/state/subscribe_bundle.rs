use anchor_lang::prelude::*;
use crate::{Bundle, UserBundlSubscriptionController, Subscription};

#[derive(Accounts)]
#[instruction(bundle_seed: [u8; 16])]
pub struct SubscribeBundle<'info> {
    #[account(
        seeds = [b"controller", user.key().as_ref()],
        bump = controller.bump,
    )]
    pub controller: Account<'info, UserBundlSubscriptionController>,

    #[account(
        mut,
        seeds = [
            bundle_seed.as_ref(),
            user.key().as_ref()
        ],
        bump
    )]
    pub bundle: Account<'info, Bundle>,

    #[account(
        init_if_needed, 
        payer = user, 
        space = 8 + Subscription::INIT_SPACE, 
        seeds = [
            controller.key().as_ref(),
            bundle.key().as_ref()
        ],
        bump
    )]
    pub subscription: Account<'info, Subscription>,

    #[account(mut)]
    pub user: Signer<'info>,

    pub system_program: Program<'info, System>,
}
