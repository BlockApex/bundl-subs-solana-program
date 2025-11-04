# Bundl Subscriptions Solana Program

This repository hosts the on-chain program for Bundl (bundlsubs.com), implemented with Anchor on Solana. The program manages user subscription “bundles” that periodically distribute a per-interval token budget from a user’s SPL token account to up to five recipients.

## Run the project
```bash
# Install dependencies
yarn install

# Build the program
anchor build

# Run tests
anchor test
```