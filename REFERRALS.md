Referrals program README

This repository contains the Anchor/Rust `referrals` program — a Merkle-root-based airdrop/campaign that lets eligible recipients claim tokens with a Merkle proof.

- Anchor entrypoint: `programs/referrals/src/lib.rs`
- State & accounts: `programs/referrals/src/state/`
- Tests & examples: `tests/referrals.ts`

## High-level Design

The program implements a single campaign/airdrop with a stored Merkle root and an on-chain vault of tokens. Main responsibilities:

- `initialize_campaign`: store the campaign metadata (admin, mint, merkle_root).
- `initialize_vault`: initialize/configure the vault authority PDA and prepare for funding.
- `claim`: verify a Merkle proof, prevent double-claims, and transfer tokens from the vault to the claimer.

## Authority Model

- Admin (campaign owner): the keypair that initializes the campaign. Controls vault initialization and campaign parameters.
- Vault authority PDA: derived from the campaign and used as the signer for token transfer CPI when moving tokens out of the vault.
- Claimant: any user who supplies a valid Merkle proof for a leaf in the campaign's tree.

## Accounts and PDAs

Key PDAs used by the program:

- Campaign PDA (program-owned)

  - Seeds: `[b"campaign"]`
  - Stores: `admin: Pubkey`, `mint: Pubkey`, `merkle_root: [u8;32]`, bumps and metadata.
  - Note: only one campaign per program instance.

- Vault authority PDA

  - Seeds: `[b"vault", campaign.key().as_ref()]`
  - Used as the program-signed authority for transferring tokens from the vault's associated token account.
  - One per campaign.

- ClaimStatus PDA (prevents double-claim)

  - Seeds: `[b"claimed", campaign.key().as_ref(), claimer_pubkey.as_ref()]`
  - Stores a small marker indicating the claimer has already claimed.

- Vault ATA (SPL Associated Token Account)
  - Owner: `vault_authority` PDA, Mint: campaign mint. Must be created and funded by the admin/off-chain test setup before claims.

## Instructions

All instruction handlers are in `programs/referrals/src/lib.rs`.

1. initialize_campaign

- Who: Admin (Signer)
- Purpose: Persist campaign metadata (merkle root, mint, admin) to a program-owned Campaign PDA.
- Parameters:
  - `merkle_root: [u8;32]`
- Accounts (summary):
  - payer/admin: Signer
  - campaign: PDA (init)
  - system_program

2. initialize_vault

- Who: Admin (Signer)
- Purpose: Create/configure the vault authority PDA and associated token account that will hold campaign funds.
- Parameters: none
- Accounts (summary):
  - admin: Signer
  - campaign: Campaign PDA (must match admin/mint)
  - vault_authority: PDA (derived)
  - vault_ata: Associated token account for vault_authority + mint (init by admin)
  - token_program, system_program, rent

3. claim

- Who: Claimer (Signer)
- Purpose: Verify a Merkle proof, ensure the claimer hasn't already claimed, and transfer the claimed amount from the campaign vault to the claimer's token account.
- Parameters:
  - `amount: u64` — in TS pass `BN` (bn.js)
  - `proof: Vec<[u8;32]>` — in TS pass `number[][]`
  - `flags: bytes` — in TS pass `Buffer | Uint8Array` (proof position flags)
- Accounts (summary):
  - claimer: Signer
  - claimer_token_account: Writable ATA for claimer (mint)
  - campaign: Campaign PDA (read)
  - claim_status: ClaimStatus PDA (init)
  - vault_authority: PDA (used as CPI signer)
  - vault_ata: Writable token account holding campaign funds
  - token_program

Validations and effects:

- Verifies `leaf_hash = sha256("airdrop" || amount_le || claimer_pubkey || mint)` is in the Merkle tree via `proof` and `flags`.
- Checks claim_status PDA is not initialized (prevent double-claim).
- Transfers `amount` tokens from `vault_ata` to `claimer_token_account` using the `vault_authority` PDA as the signer (CPI with seeds).
- Marks claim_status PDA to prevent future claims by the same claimer.

## Error Codes

Custom errors are defined in `programs/referrals/src/error.rs`. Important entries include:

- `InvalidProof` — Proof verification failed.
- `AlreadyClaimed` — Claimer already claimed funds.
- `InvalidMint` — Provided mint does not match campaign mint.
- `InsufficientFunds` — Vault lacks enough tokens to satisfy the claim.
- `Unauthorized` — Caller is not permitted to perform the action.

## Build, Test, Deploy

Prereqs

- Node >= 16, yarn or npm
- Rust + toolchain (see `rust-toolchain.toml`)
- Anchor CLI

Install JS deps

```bash
# from repo root
yarn install
# or npm install
```

Build programs

```bash
anchor build
```

Run tests

```bash
anchor test
```

Deploy

```bash
anchor deploy
```

## TypeScript client tips (proof/flags/amount)

Anchor's generated TypeScript types map the Rust IDL types as follows:

- `u64` -> `BN` (bn.js)
- `Vec<[u8;32]>` -> `number[][]` (Array of 32-byte arrays)
- `bytes` -> `Buffer | Uint8Array`

Conversions used in `tests/referrals.ts`:

```ts
import { BN } from "bn.js";

// amount (u64)
const amount = new BN(2_000);

// merkletreejs returns Buffer[] for nodes; convert each 32-byte Buffer -> number[]
const proofArr: number[][] = proofBuffers.map((b) => Array.from(b));

// flags: pass as Buffer (bytes)
const flags = Buffer.from(
  proofObjects.map((p) => (p.position === "left" ? 1 : 0))
);

await program.methods
  .claim(amount, proofArr, flags)
  .accounts({
    /* ... */
  })
  .rpc();
```

## Merkle proof construction notes

- On-chain leaf hash (must match client): `sha256("airdrop" || amount_le || claimer_pubkey || mint)`
  - `amount_le` is the 8-byte little-endian representation of the u64 amount.
- When constructing the tree with `merkletreejs`, ensure you use the same SHA-256 and the same concatenation order.
- Use ordered pairing (set `sortPairs: false`) if your on-chain verifier expects position-sensitive proofs.

Example helper (used in tests)

```ts
function getProofArgs(tree: MerkleTree, index: number) {
  const leaves = tree.getLeaves();
  const proofObjects = tree.getProof(leaves[index]);
  const proof = proofObjects.map((p) => Array.from(p.data)); // number[][]
  const flags = Buffer.from(
    proofObjects.map((p) => (p.position === "left" ? 1 : 0))
  );
  return { proof, flags };
}
```

## Sample flow in tests (high-level)

1. Build Merkle tree (domain-separated SHA-256 leaves).
2. Call `initialize_campaign` (admin signs) with the root.
3. Call `initialize_vault` (admin signs) to derive the vault authority PDA.
4. Create and fund the vault ATA (associated token account owned by the vault PDA).
5. For each claimer: compute `proof` and `flags`, then call `claim(amountBN, proofArr, flagsBuffer)` with the proper accounts.
