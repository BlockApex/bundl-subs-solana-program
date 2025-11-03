import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  createAssociatedTokenAccount,
  createMint,
  getAssociatedTokenAddress,
  mintTo,
} from "@solana/spl-token";
import { assert, expect } from "chai";
import { createHash } from "crypto";
import * as dotenv from "dotenv";
import { MerkleTree } from "merkletreejs";
import { Referrals } from "../target/types/referrals";

dotenv.config();

describe("referrals", () => {
  const secretKey = Uint8Array.from(JSON.parse(process.env.KEY!));
  const ownerKp = anchor.web3.Keypair.fromSecretKey(secretKey);
  const recipientKeyPair1 = anchor.web3.Keypair.generate();
  const recipientKeyPair2 = anchor.web3.Keypair.generate();
  const recipientKeyPair3 = anchor.web3.Keypair.generate();

  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Referrals as Program<Referrals>;

  let campaignPda: anchor.web3.PublicKey;
  let campaignBump: number;
  let vaultPda: anchor.web3.PublicKey;
  let vaultBump: number;
  let vaultAta: anchor.web3.PublicKey;

  // // Token related variables
  let user = provider.wallet.publicKey;
  let mint: anchor.web3.PublicKey;
  let userTokenAccount: anchor.web3.PublicKey;
  let recipientTokenAccount1: anchor.web3.PublicKey;
  let recipientTokenAccount2: anchor.web3.PublicKey;
  let recipientTokenAccount3: anchor.web3.PublicKey;

  // test data
  let merkleRoot: Buffer;
  let proof: Buffer[];
  let proofObjects: any[];

  before(async () => {
    // Airdrop some SOL to the user and recipient
    await requestAirdrop(provider.connection, ownerKp.publicKey, 2);
    await requestAirdrop(provider.connection, recipientKeyPair2.publicKey, 2);

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

    // create ATAs for new recipients
    recipientTokenAccount1 = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      recipientKeyPair1.publicKey // owner of the ATA
    );

    recipientTokenAccount2 = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      recipientKeyPair2.publicKey // owner of the ATA
    );

    recipientTokenAccount3 = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      recipientKeyPair3.publicKey // owner of the ATA
    );

    // Step 3: Mint tokens to user
    await mintTo(
      provider.connection,
      provider.wallet.payer,
      mint,
      userTokenAccount,
      user,
      1_000_000_000 // 1000 USDC
    );

    [campaignPda, campaignBump] =
      await anchor.web3.PublicKey.findProgramAddress(
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

    it("should initialize campaign with dummy leaves", async () => {
      // --------------- STEP 1: Build the Merkle tree ----------------
      // Each leaf: keccak256(amount || user_pubkey || mint)
      const dummyMints = Array(3)
        .fill(null)
        .map(() => mint);

      const dummyUsers = Array(3).fill(null);
      dummyUsers[0] = recipientKeyPair1.publicKey;
      dummyUsers[1] = recipientKeyPair2.publicKey;
      dummyUsers[2] = recipientKeyPair3.publicKey;

      // We'll pick the 2nd leaf for the test claimer
      // SHA-256 domain-separated leaf: sha256("airdrop" || amount_le || user || mint)
      const sha256 = (data: Buffer) =>
        createHash("sha256").update(data).digest();

      const leaves = dummyUsers.map((user, i) => {
        const amt = Buffer.alloc(8);
        amt.writeBigUInt64LE(BigInt(1000 * (i + 1)));
        return sha256(
          Buffer.concat([
            Buffer.from("airdrop"),
            amt,
            user.toBuffer(),
            dummyMints[i].toBuffer(),
          ])
        );
      });

      // Use ordered pairs (no sorting) so proof positions correspond to left/right
      const tree = new MerkleTree(leaves, sha256, { sortPairs: false });
      merkleRoot = tree.getRoot();

      // pick leaf index 1 for the test claimer
      proofObjects = tree.getProof(leaves[1]);
      proof = proofObjects.map((p) => p.data);
      console.log("Merkle root:", merkleRoot.toString("hex"));
      console.log(
        "Proof for leaf 1:",
        proof.map((p) => p.toString("hex"))
      );

      // --------------- STEP 2: Create campaign ----------------
      await program.methods
        .initializeCampaign(Array.from(merkleRoot))
        .accounts({
          authority: ownerKp.publicKey,
          mint,
        })
        .signers([ownerKp])
        .rpc();

      const campaignAccount = await program.account.campaign.fetch(campaignPda);
      assert.ok(campaignAccount.admin.equals(ownerKp.publicKey));
      assert.ok(campaignAccount.mint.equals(mint));
      assert.deepEqual(campaignAccount.merkleRoot, Array.from(merkleRoot));
      assert.equal(campaignAccount.bump, campaignBump);
    });

    it.skip(`should update campaign`, async () => {
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

      const campaignAccount = await program.account.campaign.fetch(campaignPda);
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
      } catch (err) {
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

      const campaignAccount = await program.account.campaign.fetch(campaignPda);
      assert.ok(campaignAccount.vaultBump === vaultBump);

      vaultAta = await getAssociatedTokenAddress(mint, vaultPda, true);
    });
  });

  describe("claim", () => {
    // we selected leaf index 1 (second leaf) during tree construction; that leaf
    // used amount = 1000 * (1 + 1) = 2000, so use 2000 here.
    const amount = new anchor.BN(2000);

    it("given invalid proof, should return error", async () => {
      const proofArr = proof.map((b) => Array.from(b));
      // Messing up the flags to make the proof invalid
      const flagsArr = Buffer.from(
        proofObjects.map((p) => (p.position === "right" ? 1 : 0))
      );
      let fail = false;
      try {
        await program.methods
          .claim(amount, proofArr, flagsArr)
          .accounts({
            claimer: recipientKeyPair2.publicKey,
            mint: mint,
          })
          .signers([recipientKeyPair2])
          .rpc();
      } catch (err) {
        fail = true;
        // console.log(err)
        assert.equal(err.error.errorCode.code, "InvalidProof");
      }
      assert.ok(fail);
    });

    it("claims successfully using valid proof", async () => {
      const proofArr = proof.map((b) => Array.from(b));
      // Construct flags from the proof positions returned by merkletreejs.
      // Anchor's program expects flags[i] == 1 when proof[i] is LEFT.
      const flagsArr = Buffer.from(
        proofObjects.map((p) => (p.position === "left" ? 1 : 0))
      );

      // Fund the vault with sufficient tokens (mint authority is provider.wallet)
      await mintTo(
        provider.connection,
        provider.wallet.payer,
        mint,
        vaultAta,
        user,
        2_000_000_000
      );

      await program.methods
        .claim(amount, proofArr, flagsArr)
        .accounts({
          claimer: recipientKeyPair2.publicKey,
          mint: mint,
        })
        .signers([recipientKeyPair2])
        .rpc();

      const [claimStatusPda, _] =
        await anchor.web3.PublicKey.findProgramAddress(
          [
            Buffer.from("claimed"),
            campaignPda.toBuffer(),
            recipientKeyPair2.publicKey.toBuffer(),
          ],
          program.programId
        );

      const claimStatus = await program.account.claimStatus.fetch(
        claimStatusPda
      );

      expect(claimStatus.claimed).to.be.true;
    });

    it("given recipient has already claimed, should return error", async () => {
      const proofArr = proof.map((b) => Array.from(b));
      // Construct flags from the proof positions returned by merkletreejs.
      // Anchor's program expects flags[i] == 1 when proof[i] is LEFT.
      const flagsArr = Buffer.from(
        proofObjects.map((p) => (p.position === "left" ? 1 : 0))
      );
      let fail = false;
      try {
      await program.methods
        .claim(amount, proofArr, flagsArr)
        .accounts({
          claimer: recipientKeyPair2.publicKey,
          mint: mint,
        })
        .signers([recipientKeyPair2])
        .rpc();
      } catch (err) {
        fail = true;
        // console.log(err)
        assert.equal(err.error.errorCode.code, "AlreadyClaimed");
      }
      assert.ok(fail);
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
