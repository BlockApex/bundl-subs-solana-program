# Bundl Subscriptions Solana Program

This repository hosts the on-chain program for Bundl (bundlsubs.com), implemented with Anchor on Solana. The program manages user subscription “bundles” that periodically distribute a per-interval token budget from a user’s SPL token account to up to five recipients.

- Program ID: `FUEepu5sAshZAfkqWNszgymFj6xcymv5AVwVY2c6zY6i`
- Owner authority (hardcoded): `BTFsHVsT8V9gXrgDNKdCw574dR9X8hom9KWsiKBvjbSi`
- Anchor entrypoint: [programs/bundl/src/lib.rs](https://github.com/BlockApex/bundl-subs-solana-program/blob/6c837c6ddb7bb3c238ef9ce24adcef9e04266630/programs/bundl/src/lib.rs)
- Errors: [programs/bundl/src/error.rs](https://github.com/BlockApex/bundl-subs-solana-program/blob/6c837c6ddb7bb3c238ef9ce24adcef9e04266630/programs/bundl/src/error.rs)
- State module: [programs/bundl/src/state/mod.rs](https://github.com/BlockApex/bundl-subs-solana-program/blob/6c837c6ddb7bb3c238ef9ce24adcef9e04266630/programs/bundl/src/state/mod.rs)

Note: This program uses Anchor. Ensure you have the appropriate Anchor/Solana toolchains installed.

---

## High-level Design

The program organizes user subscriptions via two PDA-backed accounts:

- Controller PDA (one per user): Signs CPI SPL token transfers on behalf of the user.
  - Seeds: `["controller", user_pubkey]`
  - Stores: `user` (Pubkey), `user_token_account` (source SPL token account), `bump`

- Bundle PDA (one per subscription “bundle”, under a controller):
  - Seeds: `[bundle_seed_16_bytes, controller_pubkey]`
  - Stores:
    - `amount_per_interval: u64` (max budget per run)
    - `interval: i64` (seconds)
    - `last_paid: i64` (unix timestamp, 0 until first run)
    - `user_atas: [Pubkey; 5]` (recipient ATAs)
    - `num_recipients: u8` (1..=5)

A privileged Owner is allowed to add bundles and to trigger payment runs once the configured interval has elapsed.

The controller PDA signs SPL token transfers using these signer seeds:
- `["controller", controller.user, controller.bump]`

---

## Authority Model

- Owner (hardcoded): `BTFsHVsT8V9gXrgDNKdCw574dR9X8hom9KWsiKBvjbSi`
  - Only this authority can add bundles and trigger payments.
- User: The actual token holder who initializes the controller and whose SPL token account funds are used.

Signature requirements:
- initialize_controller: signed by the user.
- add_bundle: must be signed by both the Owner and the user.
  - Owner enforces permission; user pays for account creation (payer = user).
- trigger: signed by the Owner.

---

## Accounts and PDAs

Controller PDA
- Defined in: [state/initialize_controller.rs](https://github.com/BlockApex/bundl-subs-solana-program/blob/6c837c6ddb7bb3c238ef9ce24adcef9e04266630/programs/bundl/src/state/initialize_controller.rs) and [state/user_bundl_subscription_controller.rs](https://github.com/BlockApex/bundl-subs-solana-program/blob/main/programs/bundl/src/state/user_bundl_subscription_controller.rs)
- Seeds: `["controller", authority]`
- Stores the user’s pubkey, the associated source token account, and the PDA bump.

Bundle PDA
- Defined in: [state/add_bundle.rs](https://github.com/BlockApex/bundl-subs-solana-program/blob/6c837c6ddb7bb3c238ef9ce24adcef9e04266630/programs/bundl/src/state/add_bundle.rs) and [state/bundle.rs](https://github.com/BlockApex/bundl-subs-solana-program/blob/main/programs/bundl/src/state/bundle.rs)
- Seeds: `[bundle_seed_16_bytes, controller_pubkey]`
- Stores the bundle configuration, recipients, and timing.

---

## Instructions

All instruction handlers are in [lib.rs](https://github.com/BlockApex/bundl-subs-solana-program/blob/6c837c6ddb7bb3c238ef9ce24adcef9e04266630/programs/bundl/src/lib.rs).

1) initialize_controller

- Who: Any user (Signer)
- Purpose: Initializes a controller PDA for the user and records their source token account.
- Parameters: none
- Accounts (summary):
  - authority: Signer (the user)
  - controller: PDA; seeds `["controller", authority]`, init_if_needed
  - mint_account: SPL Token mint of the token being paid out
  - from_token_account: Associated token account for (mint_account, authority)
  - token_program, system_program
- Effects:
  - Persists the user’s pubkey, the source token account, and the PDA bump on the controller.

2) add_bundle

- Who: Owner AND user (both must sign)
- Purpose: Creates and configures a bundle for the user’s controller.
- Parameters:
  - `bundle_seed: [u8; 16]` — 16-byte identifier (e.g., a truncated keccak256)
  - `amount_per_interval: u64`
  - `interval: u64` — seconds
  - `user_atas: [Pubkey; 5]` — recipient SPL token accounts (ATAs)
  - `num_recipients: u8` — must be 1..=5
- Accounts (summary) [see: state/add_bundle.rs]:
  - controller: PDA; seeds `["controller", user]`
  - bundle: PDA; seeds `[bundle_seed, controller]`, `init_if_needed`, `payer = user`
  - authority: Signer (must equal Owner; enforced by access_control in lib.rs)
  - user: Signer (payer for bundle account allocation)
  - system_program
- Validations and effects (lib.rs):
  - Enforces 1..=5 recipients.
  - Stores `amount_per_interval`, `interval`, initializes `last_paid = 0`.
  - Persists recipients and `num_recipients`.

3) trigger

- Who: Owner (Signer)
- Purpose: Executes a payment run if the configured interval has elapsed.
- Parameters:
  - `bundle_seed: [u8; 16]`
  - `amounts: [u64; 5]` — only the first `num_recipients` entries are used
- Accounts (summary):
  - controller: User’s controller PDA
  - bundle: The bundle PDA for this seed
  - user_token_account: The user’s source SPL token account (must match the controller’s stored account)
  - token_program
  - Remaining accounts: Exactly `num_recipients` recipient token accounts, in the same order as stored in the bundle
- Validations (lib.rs):
  - Provided recipient accounts length must equal `bundle.num_recipients`.
  - `Clock::get().unix_timestamp - bundle.last_paid >= bundle.interval`.
  - Sum of active `amounts` entries must be <= `bundle.amount_per_interval`.
  - `user_token_account.amount` must be >= total.
  - Each provided recipient account must equal the stored `bundle.user_atas[i]`.
- Effects:
  - CPI `token::transfer` from `user_token_account` to each recipient using the controller PDA as authority signer with seeds:
    - `["controller", controller.user, controller.bump]`
  - Updates `bundle.last_paid` to the current time.

Important: The controller PDA must be a valid authority for the `user_token_account` (as owner or approved delegate with adequate allowance). There are commented checks in the code for delegate/allowance. Ensure correct off-chain setup before triggering payments.

---

## Error Codes

Defined in [error.rs](https://github.com/BlockApex/bundl-subs-solana-program/blob/6c837c6ddb7bb3c238ef9ce24adcef9e04266630/programs/bundl/src/error.rs):

- InsufficientFunds — Not enough balance in the user’s token account.
- InvalidDelegate — Program is not approved as a delegate (validation currently commented).
- LowAllowance — Insufficient delegated allowance (validation currently commented).
- Unauthorized — Caller is not the Owner.
- IntervalNotPassed — Interval has not elapsed since last payment.
- InvalidTotalAmount — Sum of `amounts` exceeds `amount_per_interval`.
- InvalidNumRecipients — Number of recipients must be 1..=5.
- InvalidNumRecipientsProvided — Mismatch between provided accounts and `num_recipients`.
- InvalidRecipient — Provided recipient ATA does not match the stored one.

---

## Build, Test, Deploy

Prerequisites:
- Rust (as per `rust-toolchain.toml`)
- Anchor CLI
- Node.js / yarn (for tests/clients)

Build:
```bash
anchor build
```

Test (if tests present under `tests/`):
```bash
anchor test
```

Deploy:
```bash
anchor deploy
```

Configure `Anchor.toml` for localnet/devnet/mainnet as needed.

---

## Client Integration Guide

1) Prepare the user’s SPL token account
- User must have an ATA for the desired mint with sufficient balance.

2) Initialize controller (user signs)
```ts
// PDA derivation
const PROGRAM_ID = new PublicKey("FUEepu5sAshZAfkqWNszgymFj6xcymv5AVwVY2c6zY6i");
const [controllerPda] = PublicKey.findProgramAddressSync(
  [Buffer.from("controller"), user.publicKey.toBuffer()],
  PROGRAM_ID
);

// Initialize
await program.methods.initializeController().accounts({
  authority: user.publicKey,
  controller: controllerPda,
  mintAccount: mint,                 // the mint for the token you’ll pay with
  fromTokenAccount: userTokenAccount,
  tokenProgram: TOKEN_PROGRAM_ID,
  systemProgram: SystemProgram.programId,
}).signers([user]).rpc();
```

3) Approve controller PDA on the token account
- Either set the controller PDA as the account owner OR approve it as a delegate with sufficient allowance for ongoing transfers.

4) Add a bundle (requires signatures from Owner AND user)
```ts
// Bundle PDA derivation uses [bundleSeed16, controllerPda]
const [bundlePda] = PublicKey.findProgramAddressSync(
  [Buffer.from(bundleSeed16), controllerPda.toBuffer()],
  PROGRAM_ID
);

await program.methods.addBundle(
  bundleSeed16,              // [u8;16]
  amountPerInterval,         // u64
  intervalSeconds,           // u64
  recipientAtas5,            // [Pubkey;5]
  numRecipients,             // u8 (1..=5)
).accounts({
  controller: controllerPda,
  bundle: bundlePda,
  authority: owner.publicKey,        // must equal hardcoded Owner
  user: user.publicKey,              // payer = user
  systemProgram: SystemProgram.programId,
}).signers([owner, user]).rpc();      // both must sign
```

5) Trigger payments (Owner signs)
```ts
await program.methods.trigger(
  bundleSeed16,
  amounts5, // [u64;5], only first numRecipients entries used
).accounts({
  controller: controllerPda,
  bundle: bundlePda,
  userTokenAccount,                  // must match controller.user_token_account
  tokenProgram: TOKEN_PROGRAM_ID,
  authority: owner.publicKey,
}).remainingAccounts(
  recipientAtas.slice(0, numRecipients).map((pubkey) => ({
    pubkey, isWritable: true, isSigner: false
  }))
).signers([owner]).rpc();
```

---

## Constraints and Limits

- Max recipients per bundle: 5
- `amounts` and `user_atas` arrays are fixed length 5; only the first `num_recipients` are active.
- Time values (`interval`, `last_paid`) are unix seconds.
- add_bundle must be signed by both Owner and user; trigger by Owner only.

---

## Security Notes

- Delegate/allowance checks in `initialize_controller` are commented out; enforce proper authority off-chain:
  - Controller PDA must be the token account’s owner or a delegate with sufficient allowance.
- Protect the Owner key; consider multisig or governance for production.
- Validate `amounts` passed to `trigger` off-chain to prevent user confusion about partial payments.

---

## Repository Structure

- `programs/bundl/src/lib.rs` — instruction handlers
- `programs/bundl/src/error.rs` — custom errors
- `programs/bundl/src/state/`
  - `initialize_controller.rs` — accounts for controller initialization
  - `add_bundle.rs` — accounts/constraints for bundle creation (requires Owner + user signatures)
  - `trigger.rs` — accounts/constraints for triggering payments
  - `user_bundl_subscription_controller.rs` — controller account layout
  - `bundle.rs` — bundle account layout
- `Anchor.toml` — Anchor config
- `Cargo.toml` — Rust workspace config
- `rust-toolchain.toml` — pinned toolchain
- `tests/` — program tests (if present)

---