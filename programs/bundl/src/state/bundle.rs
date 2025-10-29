use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Bundle {
    pub owner: Pubkey,
    pub interval: i64,
    pub amount_per_interval: u64,
    pub user_atas: [Pubkey; 5],
    pub num_recipients: u8,
    pub subs: u64,
}