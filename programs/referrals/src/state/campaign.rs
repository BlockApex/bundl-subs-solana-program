use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Campaign {
    pub admin: Pubkey,          // 32
    pub mint: Pubkey,           // 32
    pub merkle_root: [u8; 32],  // 32
    pub bump: u8,               // 1
}
