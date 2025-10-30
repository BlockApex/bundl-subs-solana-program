use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Insufficient funds in the vault")]
    InsufficientFunds,
    #[msg("The program is not approved as a delegate")]
    InvalidDelegate,
    #[msg("Sufficient allowance is not set")]
    LowAllowance,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("The required interval has not yet passed since the last payment")]
    IntervalNotPassed,
    #[msg("Total amounts is greater than bundle's amount per interval")]
    InvalidTotalAmount,
    #[msg("Number of recipients must be between 1 and 5")]
    InvalidNumRecipients,
    #[msg("Number of recipients provided does not match the bundle")]
    InvalidNumRecipientsProvided,
    #[msg("Invalid recipient")]
    InvalidRecipient,
    #[msg("Overflow occurred")]
    Overflow,
}
