use crate::program_option::COption;
use anchor_lang::prelude::*;
pub mod state;
pub use state::*;
pub mod error;
use crate::error::ErrorCode;

declare_id!("D9JRE9KGCzrVysZQ38YwJjJnfvSPtKZtBmo45czCdNd4");

const OWNER: &str = "BTFsHVsT8V9gXrgDNKdCw574dR9X8hom9KWsiKBvjbSi";

#[program]
pub mod bundl {
    use anchor_spl::token::TokenAccount;

    use super::*;

    /// Initializes the user bundl subscription controller account
    /// # Arguments
    /// * `ctx` - The context containing the accounts involved in the transaction
    pub fn initialize_controller(ctx: Context<InitializeController>) -> Result<()> {
        // read from ctx
        let controller = &mut ctx.accounts.controller;
        let user_token_account = &ctx.accounts.from_token_account;

        // check if controller_pda is delegated
        if user_token_account.delegate != COption::Some(controller.key()) {
            return Err(error!(ErrorCode::InvalidDelegate));
        }

        // Check the delegated amount is sufficient
        if user_token_account.delegated_amount < user_token_account.amount {
            return Err(error!(ErrorCode::LowAllowance));
        }

        // Store config
        controller.user = ctx.accounts.authority.key();
        controller.bundle_counter = 0;
        controller.user_token_account = user_token_account.key();
        controller.bump = ctx.bumps.controller;

        Ok(())
    }

    /// Adds a new bundle to the user's subscription controller
    /// # Arguments
    /// * `ctx` - The context containing the accounts involved in the transaction
    /// * `amount_per_interval` - The amount to be paid per interval
    /// * `interval` - The interval in seconds
    /// * `user_atas` - The associated token accounts of the recipients
    /// * `num_recipients` - The number of recipients
    #[access_control(check_owner(&ctx.accounts.authority))]
    pub fn add_bundle(
        ctx: Context<AddBundle>,
        amount_per_interval: u64,
        interval: u64,
        user_atas: [Pubkey; 5],
        num_recipients: u8,
    ) -> Result<()> {
        // assert valid num_recipients
        if num_recipients == 0 || num_recipients > 5 {
            return Err(error!(ErrorCode::InvalidNumRecipients));
        }

        // read from ctx
        let controller = &mut ctx.accounts.controller;
        let bundle = &mut ctx.accounts.bundle;

        // store config
        bundle.bundle_identifier = controller.bundle_counter;
        bundle.amount_per_interval = amount_per_interval;
        bundle.interval = interval as i64;
        bundle.last_paid = 0;
        bundle.user_atas = user_atas;
        bundle.num_recipients = num_recipients;

        // increment bundle counter
        controller.bundle_counter += 1;

        Ok(())
    }

    /// Triggers a payment for the specified bundle if the interval has passed
    /// # Arguments
    /// * `ctx` - The context containing the accounts involved in the transaction
    /// * `_bundle_identifier` - The identifier of the bundle to trigger
    /// * `amounts` - The amounts to be paid to each recipient
    #[access_control(check_owner(&ctx.accounts.authority))]
    pub fn trigger<'info>(
        ctx: Context<'_, '_, 'info, 'info, Trigger<'info>>,
        _bundle_identifier: u64,
        amounts: [u64; 5],
    ) -> Result<()> {
        // read from ctx
        let bundle = &mut ctx.accounts.bundle;
        let controller = &ctx.accounts.controller;
        let user_token_account = &ctx.accounts.user_token_account;
        let remaining_accounts = ctx.remaining_accounts;

        require_eq!(
            remaining_accounts.len(),
            bundle.num_recipients as usize,
            ErrorCode::InvalidNumRecipientsProvided
        );

        // check if enough time has passed since last payment
        let clock = Clock::get()?;
        let current_time = clock.unix_timestamp;
        if bundle.last_paid != 0 && current_time - bundle.last_paid < bundle.interval {
            return Err(error!(ErrorCode::IntervalNotPassed));
        }

        // sum the amounts array
        let total_amount: u64 = amounts.iter().take(bundle.num_recipients as usize).sum();

        require_gte!(bundle.amount_per_interval, total_amount, ErrorCode::InvalidTotalAmount);

        // check if user has enough balance
        if user_token_account.amount < total_amount {
            return Err(error!(ErrorCode::InsufficientFunds));
        }

        // print split amounts for debugging
        for i in 0..bundle.num_recipients {
            // Borrow instead of clone so we pass &AccountInfo
            let recipient_info = &remaining_accounts[i as usize];
            let recipient_ata = Account::<TokenAccount>::try_from(recipient_info)?;

            msg!(
                "Transferring {} to recipient {}",
                amounts[i as usize],
                recipient_info.key()
            );

            require_eq!(recipient_ata.key(), bundle.user_atas[i as usize], ErrorCode::InvalidRecipient);

            // transfer tokens from user to recipient
            let cpi_accounts = anchor_spl::token::Transfer {
                from: user_token_account.to_account_info(),
                to: recipient_ata.to_account_info(),
                authority: controller.to_account_info(),
            };
            let cpi_program = ctx.accounts.token_program.to_account_info();
            let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
            anchor_spl::token::transfer(
                cpi_ctx.with_signer(&[&[
                    b"controller",
                    controller.user.as_ref(),
                    &[controller.bump],
                ]]),
                amounts[i as usize],
            )?;
        }

        // update last paid time
        bundle.last_paid = current_time;

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
