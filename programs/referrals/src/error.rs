use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid mint for campaign")]
    InvalidMint,
    #[msg("User has already claimed")]
    AlreadyClaimed,
    #[msg("Invalid proof")]
    InvalidProof,
    #[msg("Proof length mismatch")]
    ProofLengthMismatch,
}
