use anchor_lang::prelude::*;
use anchor_spl::token::{self, Transfer};

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
    #[access_control(check_owner(&ctx.accounts.authority))]
    pub fn initialize_vault(ctx: Context<InitializeVault>) -> Result<()> {
        let campaign = &mut ctx.accounts.campaign;
        campaign.vault_bump = ctx.bumps.vault;

        msg!("Vault {} initialized with ata {}", ctx.accounts.vault_token_account.key(), ctx.accounts.vault.key());
        Ok(())
    }

    /// Claim tokens using a Merkle proof.
    /// The leaf is hash(amount || user_pubkey || mint_pubkey).
    /// Proof format: an array of 32-byte nodes plus a parallel flags vector:
    ///  - flags[i] == 0 => current_hash is LEFT, proof[i] is RIGHT
    ///  - flags[i] == 1 => proof[i] is LEFT, current_hash is RIGHT
    pub fn claim(
        ctx: Context<Claim>,
        amount: u64,
        proof: Vec<[u8; 32]>,
        flags: Vec<u8>,
    ) -> Result<()> {
        let campaign = &ctx.accounts.campaign;

        // Prevent double-claim for this user + campaign
        let claim_status = &mut ctx.accounts.claim_status;
        require!(!claim_status.claimed, ErrorCode::AlreadyClaimed);

        // Compute leaf & verify the merkle root
        let leaf = leaf_hash(amount, ctx.accounts.claimer.key(), ctx.accounts.mint.key());
        let computed_root = compute_root(leaf, &proof, &flags)?;
        require!(computed_root == campaign.merkle_root, ErrorCode::InvalidProof);

        // Transfer from vault ATA -> user ATA
        // vault_authority is a PDA that signs the transfer
        let campaign_key = campaign.key();
        let bump = campaign.vault_bump;
        let bump_bytes = [bump];

        let vault_authority_seeds: &[&[u8]] = &[
            b"vault",
            campaign_key.as_ref(),
            &bump_bytes,
        ];

        let cpi_accounts = Transfer {
            from: ctx.accounts.vault_token_account.to_account_info(),
            to: ctx.accounts.user_token_account.to_account_info(),
            authority: ctx.accounts.vault_authority.to_account_info(),
        };

        let signer_seeds: &[&[&[u8]]] = &[vault_authority_seeds];
        let cpi_ctx = CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            cpi_accounts,
            signer_seeds,
        );
        token::transfer(cpi_ctx, amount)?;

        // Mark claimed
        claim_status.claimed = true;
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

/// domain-separated SHA-256 leaf hashing:
/// leaf = sha256( "airdrop" || amount_le || user || mint )
fn leaf_hash(amount: u64, user: Pubkey, mint: Pubkey) -> [u8; 32] {
    use solana_program::hash::hashv;
    let amount_le = amount.to_le_bytes();
    let h = hashv(&[
        b"airdrop",
        &amount_le,
        user.as_ref(),
        mint.as_ref(),
    ]);
    h.to_bytes()
}

/// Walk the proof to compute the Merkle root.
/// flags[i] == 0 => (curr || proof[i])
/// flags[i] == 1 => (proof[i] || curr)
fn compute_root(
    mut curr: [u8; 32],
    proof: &[[u8; 32]],
    flags: &[u8],
) -> Result<[u8; 32]> {
    use solana_program::hash::hashv;
    require!(proof.len() == flags.len(), ErrorCode::ProofLengthMismatch);

    for (i, sib) in proof.iter().enumerate() {
        let is_right = flags[i] == 1;
        let h = if is_right {
            hashv(&[sib, &curr])
        } else {
            hashv(&[&curr, sib])
        };
        curr = h.to_bytes();
    }
    Ok(curr)
}