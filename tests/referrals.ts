import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  createApproveInstruction,
  createAssociatedTokenAccount,
  createMint,
  createTransferInstruction,
  mintTo,
} from "@solana/spl-token";
import { BN } from "bn.js";
import { assert } from "chai";
import * as dotenv from "dotenv";
import { keccak256 } from "js-sha3";
import { Referrals } from "../target/types/referrals";
import { program } from "@coral-xyz/anchor/dist/cjs/native/system";

dotenv.config();

describe("referrals", () => {
  const secretKey = Uint8Array.from(JSON.parse(process.env.KEY!));
  const ownerKp = anchor.web3.Keypair.fromSecretKey(secretKey);
  // const recipientKeyPair0 = anchor.web3.Keypair.generate();
  // const recipientKeyPair1 = anchor.web3.Keypair.generate();
  // const recipientKeyPair2 = anchor.web3.Keypair.generate();
  // const recipientKeyPair3 = anchor.web3.Keypair.generate();

  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Referrals as Program<Referrals>;

  // // Token related variables
  let user = provider.wallet.publicKey;
  let mint: anchor.web3.PublicKey;
  let userTokenAccount: anchor.web3.PublicKey;
  // let recipientTokenAccount0: anchor.web3.PublicKey;
  // let recipientTokenAccount1: anchor.web3.PublicKey;
  // let recipientTokenAccount2: anchor.web3.PublicKey;
  // let recipientTokenAccount3: anchor.web3.PublicKey;

  before(async () => {
    // Airdrop some SOL to the user and recipient
    await requestAirdrop(provider.connection, ownerKp.publicKey, 2);

    // Step 1: Create test mint (USDC)
    mint = await createMint(
      provider.connection,
      provider.wallet.payer,
      user, // mint authority
      null,
      6 // decimals
    );

    // Step 2: Create ATA for user
    userTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      user
    );

    // // create ATAs for new recipients
    // recipientTokenAccount0 = await createAssociatedTokenAccount(
    //   provider.connection,
    //   provider.wallet.payer,
    //   mint,
    //   recipientKeyPair0.publicKey // owner of the ATA
    // );

    // recipientTokenAccount1 = await createAssociatedTokenAccount(
    //   provider.connection,
    //   provider.wallet.payer,
    //   mint,
    //   recipientKeyPair1.publicKey // owner of the ATA
    // );

    // recipientTokenAccount2 = await createAssociatedTokenAccount(
    //   provider.connection,
    //   provider.wallet.payer,
    //   mint,
    //   recipientKeyPair2.publicKey // owner of the ATA
    // );

    // recipientTokenAccount3 = await createAssociatedTokenAccount(
    //   provider.connection,
    //   provider.wallet.payer,
    //   mint,
    //   recipientKeyPair3.publicKey // owner of the ATA
    // );

    // Step 3: Mint tokens to user
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      mint,
      userTokenAccount,
      user,
      1_000_000_000 // 1000 USDC
    );
  });

  describe("Referrals", () => {
    it(`initialize`, async () => {
      await program.methods.initialize().rpc();
    });
  });
});

async function requestAirdrop(
  connection: anchor.web3.Connection,
  publicKey: anchor.web3.PublicKey,
  amount: number
) {
  const signature = await connection.requestAirdrop(
    publicKey,
    amount * anchor.web3.LAMPORTS_PER_SOL
  );

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();

  await connection.confirmTransaction({
    blockhash,
    lastValidBlockHeight,
    signature,
  });

  // console.log(`Airdropped ${amount} SOL to ${publicKey.toBase58()}`);
}
