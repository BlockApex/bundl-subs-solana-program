use anchor_lang::prelude::*;
// use solana_program::keccak;

pub mod error;
use crate::error::ErrorCode;

pub mod state;
use crate::state::*;

declare_id!("35YWrusRg5PBtjKvrKjckewYrfTwGEEx1rqTzwPkTRzq");

const OWNER: &str = "BTFsHVsT8V9gXrgDNKdCw574dR9X8hom9KWsiKBvjbSi";

#[program]
pub mod referrals {
    use super::*;

    /// Initializes the campaign with the given merkle root.
    /// * `ctx` - The context containing accounts required for initialization.
    /// * `merkle_root` - The merkle root to be set for the campaign
    #[access_control(check_owner(&ctx.accounts.authority))]
    pub fn initialize_campaign(
        ctx: Context<InitializeCampaign>, 
        merkle_root: [u8; 32]
    ) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        msg!("testing initialize_campaign");
        campaign.admin = ctx.accounts.authority.key();
        campaign.mint = ctx.accounts.mint.key();
        campaign.merkle_root = merkle_root;
        campaign.bump = ctx.bumps.campaign;
        Ok(())
    }
    
    /// Create (if absent) the campaign vault ATA owned by the vault authority PDA.
    /// You can then fund it by sending tokens to it from anywhere.
    #[access_control(check_owner(&ctx.accounts.authority))]
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        campaign.vault_bump = ctx.bumps.vault;

        msg!("Vault {} initialized with ata {}", ctx.accounts.vault_token_account.key(), ctx.accounts.vault.key());
        Ok(())
    }
}

fn check_owner(authority: &Signer) -> Result<()> {
    require_keys_eq!(
        authority.key(),
        OWNER.parse::<Pubkey>().unwrap(),
        ErrorCode::Unauthorized
    );
    Ok(())
}