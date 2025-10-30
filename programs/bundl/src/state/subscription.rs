use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Subscription {
    pub last_paid: u64,
}