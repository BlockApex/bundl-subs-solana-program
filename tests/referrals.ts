import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccount,
  createMint,
  mintTo,
} from "@solana/spl-token";
import { assert } from "chai";
import * as dotenv from "dotenv";
import { Referrals } from "../target/types/referrals";

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

  let campaignPda: anchor.web3.PublicKey;
  let campaignBump: number;
  let vaultPda: anchor.web3.PublicKey;
  let vaultBump: number;

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

    [campaignPda, campaignBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("campaign")],
      program.programId
    );

    [vaultPda, vaultBump] = await anchor.web3.PublicKey.findProgramAddress(
      [Buffer.from("vault"), campaignPda.toBuffer()],
      program.programId
    );
  });

  describe("initialize campaign", () => {
    it(`given incorrect authority, should return error`, async () => {
      let fail = false;
      try {
        const merkleRoot = Buffer.from(
          "5a81eceaec1a11d779f2583bbb222ac2aa7f12fa2d8398d7c6b8f1b944bf15fc",
          "hex"
        );
        // Anchor typings expect a JS array of numbers for fixed-size `[u8; 32]` args.
        // Convert the Buffer to `number[]` to satisfy TypeScript while keeping
        // the same runtime bytes.
        const merkleRootArr = Array.from(merkleRoot);
        await program.methods
          .initializeCampaign(merkleRootArr)
          .accounts({
            authority: provider.wallet.publicKey,
            mint: mint,
          })
          .signers([])
          .rpc();
      } catch (err) {
        fail = true;
        // console.log(err)
        assert.equal(err.error.errorCode.code, "Unauthorized");
      }
      assert.ok(fail);
    });

    it(`should initialize campaign`, async () => {
      const merkleRoot = Buffer.from(
        "5a81eceaec1a11d779f2583bbb222ac2aa7f12fa2d8398d7c6b8f1b944bf15fc",
        "hex"
      );
      await program.methods
        .initializeCampaign(Array.from(merkleRoot))
        .accounts({
          authority: ownerKp.publicKey,
          mint: mint,
        })
        .signers([ownerKp])
        .rpc();

      const campaignAccount = await program.account.campaign.fetch(
        campaignPda
      );
      assert.ok(campaignAccount.admin.equals(ownerKp.publicKey));
      assert.ok(campaignAccount.mint.equals(mint));
      assert.deepEqual(campaignAccount.merkleRoot, Array.from(merkleRoot));
      assert.equal(campaignAccount.bump, campaignBump);
    });

    it(`should update campaign`, async () => {
      const merkleRoot = Buffer.from(
        "5a81eceaec1a11d779f2583bbb222ac2aa7f12fa2d8398d7c6b8f1b944bf15fc",
        "hex"
      );
      await program.methods
        .initializeCampaign(Array.from(merkleRoot))
        .accounts({
          authority: ownerKp.publicKey,
          mint: mint,
        })
        .signers([ownerKp])
        .rpc();

      const campaignAccount = await program.account.campaign.fetch(
        campaignPda
      );
      assert.ok(campaignAccount.admin.equals(ownerKp.publicKey));
      assert.ok(campaignAccount.mint.equals(mint));
      assert.deepEqual(campaignAccount.merkleRoot, Array.from(merkleRoot));
      assert.equal(campaignAccount.bump, campaignBump);
    });
  });

  describe("initialize vault", () => {
    it(`given incorrect authority, should return error`, async () => {
      let fail = false;
      try {
        await program.methods
          .initializeVault()
          .accounts({
            authority: provider.wallet.publicKey,
            mint: mint,
          })
          .signers([])
          .rpc();
      }
      catch (err) {
        fail = true;
        // console.log(err)
        assert.equal(err.error.errorCode.code, "Unauthorized");
      }
      assert.ok(fail);
    });

    it(`should initialize vault`, async () => {
      await program.methods
        .initializeVault()
        .accounts({
          authority: ownerKp.publicKey,
          mint: mint,
        })
        .signers([ownerKp])
        .rpc();

      const campaignAccount = await program.account.campaign.fetch(
        campaignPda
      );
      assert.ok(campaignAccount.vaultBump === vaultBump);
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
