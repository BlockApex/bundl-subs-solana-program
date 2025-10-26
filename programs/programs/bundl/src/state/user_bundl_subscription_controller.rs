use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct UserBundlSubscriptionController {
    pub user: Pubkey,
    pub user_token_account: Pubkey, //TODO: maybe redundant store mint account maybe 
    pub bump: u8,
}