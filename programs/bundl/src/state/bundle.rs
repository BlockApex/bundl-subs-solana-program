use anchor_lang::prelude::*;
use crate::constant;
#[account]
#[derive(InitSpace)]
pub struct Bundle {
    pub interval: i64,
    pub amount_per_interval: u64,
    pub last_paid: i64,
    pub user_atas: [Pubkey; constant::MAX_BUNDLES_PER_CONTROLLER as usize],
    pub num_recipients: u8,
    pub is_paused: bool,
}