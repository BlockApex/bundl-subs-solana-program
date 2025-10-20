import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import {
  createApproveInstruction,
  createAssociatedTokenAccount,
  createMint,
  mintTo,
} from "@solana/spl-token";
import { BN } from "bn.js";
import { assert } from "chai";
import * as dotenv from "dotenv";
import { Bundl } from "../target/types/bundl";

dotenv.config();

describe("bundl", () => {
  const secretKey = Uint8Array.from(JSON.parse(process.env.KEY!));
  const bundlKeypair = anchor.web3.Keypair.fromSecretKey(secretKey);

  const recipientSecretKey = Uint8Array.from(
    JSON.parse(process.env.RECIPIENT!)
  );
  const recipientKeyPair =
    anchor.web3.Keypair.fromSecretKey(recipientSecretKey);

  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Bundl as Program<Bundl>;

  let controllerPda: anchor.web3.PublicKey;
  let controllerBump: number;
  let bundlePda: anchor.web3.PublicKey;
  let bundleBump: number;
  let bundlePda1: anchor.web3.PublicKey;

  // Token related variables
  let user = provider.wallet.publicKey;
  let mint: anchor.web3.PublicKey;
  let userTokenAccount: anchor.web3.PublicKey;
  let recipientTokenAccount: anchor.web3.PublicKey;

  before(async () => {
    // Airdrop some SOL to the user and recipient
    await requestAirdrop(provider.connection, bundlKeypair.publicKey, 2);

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

    recipientTokenAccount = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      recipientKeyPair.publicKey // owner of the ATA
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

    // Step 4: Derive controller PDA
    [controllerPda, controllerBump] =
      await anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("controller"), user.toBuffer()],
        program.programId
      );
  });

  describe("initialize controller", async () => {
    describe("given half amount is approved", async () => {
      before(async () => {
        // Step 5: Approve PDA to spend
        const approveIx = createApproveInstruction(
          userTokenAccount,
          controllerPda,
          user,
          250_000_000 // Approve 500 USDC
        );

        const tx = new anchor.web3.Transaction().add(approveIx);
        await provider.sendAndConfirm(tx);
      });

      it("fails with `LowAllowance`", async () => {
        let failed = false;
        try {
          // Call the instruction without approving the PDA
          await program.methods
            .initializeController()
            .accounts({
              authority: user,
              mintAccount: mint,
            })
            .signers([]) // authority already set in provider
            .rpc();
        } catch (err) {
          failed = true;
          // console.log(err);
          assert.ok(err.error.errorCode.code === "LowAllowance");
        }
        assert.ok(failed, "Expected call to fail but it succeeded");
      });
    });

    describe("given amount is approved", async () => {
      before(async () => {
        // Step 5: Approve PDA to spend
        const approveIx = createApproveInstruction(
          userTokenAccount,
          controllerPda,
          user,
          1_000_000_000 // Approve 1,000 USDC
        );

        const tx = new anchor.web3.Transaction().add(approveIx);
        await provider.sendAndConfirm(tx);
      });

      it("Initializes a controller account", async () => {
        // Call the initialize_controller instruction
        await program.methods
          .initializeController()
          .accounts({
            authority: user,
            mintAccount: mint,
            // controller: controllerPda, // you can add this, but it is auto derived so no need
            // systemProgram: anchor.web3.SystemProgram.programId, // also auto added
          })
          .rpc();

        // Fetch the account
        const controllerAccount =
          await program.account.userBundlSubscriptionController.fetch(
            controllerPda
          );

        // Check controller values
        assert.ok(controllerAccount.user.equals(user));
        assert.ok(controllerAccount.userTokenAccount.equals(userTokenAccount));
        assert.ok(controllerAccount.bundleCounter.toNumber() == 0);
        assert.ok(controllerAccount.bump === controllerBump);
      });
    });

    it("when amount is not approved, then fails with `InvalidDelegate`", async () => {
      let failed = false;
      try {
        // Call the instruction without approving the PDA
        await program.methods
          .initializeController()
          .accounts({
            authority: user,
            mintAccount: mint,
          })
          .signers([]) // authority already set in provider
          .rpc();
      } catch (err) {
        failed = true;
        assert.ok(err.error.errorCode.code === "InvalidDelegate");
      }
      assert.ok(failed, "Expected call to fail but it succeeded");
    });
  });

  describe("add bundle", async () => {
    before(async () => {
      // Step 5: Approve PDA to spend
      const approveIx = createApproveInstruction(
        userTokenAccount,
        controllerPda,
        user,
        500_000_000 // Approve 500 USDC
      );

      const tx = new anchor.web3.Transaction().add(approveIx);
      await provider.sendAndConfirm(tx);

      // // Call the initialize_controller instruction
      // await program.methods
      //   .initializeController()
      //   .accounts({
      //     authority: user,
      //     mintAccount: mint,
      //   })
      //   .rpc();
    });

    it("given percentages do not sum to 100, then fails with `InvalidPercentages`", async () => {
      const amountPerInterval = 100_000_000; // 100 USDC
      const interval = 30 * 24 * 60 * 60; // 30 days in seconds

      let failed = false;
      try {
        // Call the add_bundle instruction
        await program.methods
          .addBundle(
            new BN(amountPerInterval),
            new BN(interval),
            [recipientTokenAccount],
            [20],
            1
          )
          .accounts({
            user: user,
            authority: bundlKeypair.publicKey,
          })
          .signers([bundlKeypair])
          .rpc();
      } catch (err: any) {
        failed = true;
        // console.log(err)
        assert.equal(err.error.errorCode.code, "InvalidPercentages");
      }

      assert.ok(failed, "Expected call to fail but it succeeded");
    });

    it("given more than 5 recipients, then fails with `InvalidNumRecipients`", async () => {
      const amountPerInterval = 100_000_000; // 100 USDC
      const interval = 30 * 24 * 60 * 60; // 30 days in seconds

      let failed = false;
      try {
        // Call the add_bundle instruction
        await program.methods
          .addBundle(
            new BN(amountPerInterval),
            new BN(interval),
            [recipientTokenAccount],
            [20],
            6
          )
          .accounts({
            user: user,
            authority: bundlKeypair.publicKey,
          })
          .signers([bundlKeypair])
          .rpc();
      } catch (err: any) {
        failed = true;
        // console.log(err)
        assert.equal(err.error.errorCode.code, "InvalidNumRecipients");
      }

      assert.ok(failed, "Expected call to fail but it succeeded");
    });

    it("given 0 recipients, then fails with `InvalidNumRecipients`", async () => {
      const amountPerInterval = 100_000_000; // 100 USDC
      const interval = 30 * 24 * 60 * 60; // 30 days in seconds

      let failed = false;
      try {
        // Call the add_bundle instruction
        await program.methods
          .addBundle(
            new BN(amountPerInterval),
            new BN(interval),
            [recipientTokenAccount],
            [20],
            0
          )
          .accounts({
            user: user,
            authority: bundlKeypair.publicKey,
          })
          .signers([bundlKeypair])
          .rpc();
      } catch (err: any) {
        failed = true;
        // console.log(err)
        assert.equal(err.error.errorCode.code, "InvalidNumRecipients");
      }

      assert.ok(failed, "Expected call to fail but it succeeded");
    });

    it("Adds a bundle", async () => {
      const amountPerInterval = 100_000_000; // 100 USDC
      const interval = 30 * 24 * 60 * 60; // 30 days in seconds
      const seed = Buffer.alloc(8);
      seed.writeBigUInt64LE(BigInt(0));

      // Call the add_bundle instruction
      await program.methods
        .addBundle(
          new BN(amountPerInterval),
          new BN(interval),
          [
            recipientTokenAccount,
            recipientTokenAccount,
            recipientTokenAccount,
            recipientTokenAccount,
          ],
          [20, 20, 20, 40],
          4
        )
        .accounts({
          user: user,
          authority: bundlKeypair.publicKey,
        })
        .signers([bundlKeypair])
        .rpc();

      const result = await anchor.web3.PublicKey.findProgramAddressSync(
        [seed, controllerPda.toBuffer()],
        program.programId
      );
      bundlePda = result[0];
      bundleBump = result[1];

      // fetch the controller account to check bundle counter increment
      const controllerAccount =
        await program.account.userBundlSubscriptionController.fetch(
          controllerPda
        );

      // Fetch the bundle account
      const bundleAccount = await program.account.bundle.fetch(bundlePda);

      // Check controller values
      assert.ok(controllerAccount.bundleCounter.toNumber() == 1);

      // Check bundle values
      assert.ok(bundleAccount.bundleIdentifier.toNumber() == 0);
      assert.ok(
        bundleAccount.amountPerInterval.toNumber() == amountPerInterval
      );
      assert.ok(bundleAccount.interval.toNumber() == interval);
      assert.ok(bundleAccount.lastPaid.toNumber() == 0);
      assert.ok(bundleAccount.numRecipients == 4);
      assert.ok(bundleAccount.percentages[0] == 20);
      assert.ok(bundleAccount.percentages[1] == 20);
      assert.ok(bundleAccount.percentages[2] == 20);
      assert.ok(bundleAccount.percentages[3] == 40);
      assert.ok(bundleAccount.percentages[4] == 0);

      for (let i = 0; i < 4; i++) {
        assert.ok(bundleAccount.userAtas[i].equals(recipientTokenAccount));
      }
      assert.ok(
        bundleAccount.userAtas[4].equals(anchor.web3.SystemProgram.programId)
      );
    });
  });

  describe("trigger", async () => {
    before(async () => {
      const amountPerInterval = 100_000_000; // 100 USDC
      const interval = 30 * 24 * 60 * 60; // 30 days in seconds

      // Call the add_bundle instruction
      await program.methods
        .addBundle(
          new BN(amountPerInterval),
          new BN(interval),
          [
            recipientTokenAccount,
            recipientTokenAccount,
            recipientTokenAccount,
            recipientTokenAccount,
          ],
          [100],
          1
        )
        .accounts({
          user: user,
          authority: bundlKeypair.publicKey,
        })
        .signers([bundlKeypair])
        .rpc();

      bundlePda1 = (
        await anchor.web3.PublicKey.findProgramAddressSync(
          [
            Buffer.from(Uint8Array.of(...new BN(1).toArray("le", 8))),
            controllerPda.toBuffer(),
          ],
          program.programId
        )
      )[0];
    });

    it("given incorrect authority, it fails with `Unauthorized`", async () => {
      const bundleIdentifier = 0;

      let failed = false;
      try {
        await program.methods
          .trigger(new BN(bundleIdentifier))
          .accounts({
            authority: user,
            user: user,
            mintAccount: mint,
          })
          .rpc();
      } catch (err: any) {
        failed = true;
        // console.log(err)
        assert.equal(err.error.errorCode.code, "Unauthorized");
      }

      assert.ok(failed, "Expected call to fail but it succeeded");
    });

    it("given first time payment, it triggers a bundle payment", async () => {
      // get balance of recipient before
      const recipientBefore = await provider.connection.getTokenAccountBalance(
        recipientTokenAccount
      );
      // get balance of user before
      const userBefore = await provider.connection.getTokenAccountBalance(
        userTokenAccount
      );

      const bundleIdentifier = 1;
      await program.methods
        .trigger(new BN(bundleIdentifier))
        .accounts({
          authority: bundlKeypair.publicKey,
          user: user,
          mintAccount: mint,
        })
        .remainingAccounts([
          {
            pubkey: recipientTokenAccount,
            isWritable: true,
            isSigner: false,
          },
        ])
        .signers([bundlKeypair])
        .rpc();

      // get balance of recipient after
      const recipientAfter = await provider.connection.getTokenAccountBalance(
        recipientTokenAccount
      );

      // fetch bundle account to check last paid update
      const bundleAccount = await program.account.bundle.fetch(bundlePda1);

      // check the difference
      const difference =
        recipientAfter.value.uiAmount! - recipientBefore.value.uiAmount!;
      assert.ok(
        difference === bundleAccount.amountPerInterval.toNumber() / 1_000_000,
        "invalid difference"
      ); // 100 USDC

      // get balance of user after
      const userAfter = await provider.connection.getTokenAccountBalance(
        userTokenAccount
      );
      const userDifference =
        userBefore.value.uiAmount! - userAfter.value.uiAmount!;
      assert.ok(
        userDifference ===
          bundleAccount.amountPerInterval.toNumber() / 1_000_000,
        "invalid user difference"
      ); // 100 USDC

      // assert last paid is updated
      const now = Math.floor(Date.now() / 1000);
      // allow a difference of 5 seconds
      assert.ok(
        bundleAccount.lastPaid.toNumber() >= now - 5,
        "last paid not updated"
      );
    });

    it("given time has not elapsed, it fails with `IntervalNotPassed`", async () => {
      let failed = false;
      try {
        const bundleIdentifier = 1;
        await program.methods
          .trigger(new BN(bundleIdentifier))
          .accounts({
            authority: bundlKeypair.publicKey,
            user: user,
            mintAccount: mint,
          })
          .remainingAccounts([
            {
              pubkey: recipientTokenAccount,
              isWritable: true,
              isSigner: false,
            },
          ])
          .signers([bundlKeypair])
          .rpc();
      } catch (err: any) {
        // console.log(err)
        failed = true;
        assert.equal(err.error.errorCode.code, "IntervalNotPassed");
      }
      assert.ok(failed, "Expected call to fail but it succeeded");
    });

    it("given multiple splits, it triggers a bundle payment to multiple recipients", async () => {
      // create 3 recipient keys
      const recipientKeyPair1 = anchor.web3.Keypair.generate();
      const recipientKeyPair2 = anchor.web3.Keypair.generate();
      const recipientKeyPair3 = anchor.web3.Keypair.generate();

      // create ATAs for new recipients
      const recipientTokenAccount1 = await createAssociatedTokenAccount(
        provider.connection,
        provider.wallet.payer,
        mint,
        recipientKeyPair1.publicKey // owner of the ATA
      );

      const recipientTokenAccount2 = await createAssociatedTokenAccount(
        provider.connection,
        provider.wallet.payer,
        mint,
        recipientKeyPair2.publicKey // owner of the ATA
      );

      const recipientTokenAccount3 = await createAssociatedTokenAccount(
        provider.connection,
        provider.wallet.payer,
        mint,
        recipientKeyPair3.publicKey // owner of the ATA
      );

      // get balance of recipient before
      const recipientBefore = await provider.connection.getTokenAccountBalance(
        recipientTokenAccount
      );

      const recipient1Before = await provider.connection.getTokenAccountBalance(
        recipientTokenAccount1
      );

      const recipient2Before = await provider.connection.getTokenAccountBalance(
        recipientTokenAccount2
      );

      const recipient3Before = await provider.connection.getTokenAccountBalance(
        recipientTokenAccount3
      );

      // get balance of user before
      const userBefore = await provider.connection.getTokenAccountBalance(
        userTokenAccount
      );

      const bundleIdentifier = 0;
      await program.methods
        .trigger(new BN(bundleIdentifier))
        .accounts({
          authority: bundlKeypair.publicKey,
          user: user,
          mintAccount: mint,
        })
        .remainingAccounts([
          {
            pubkey: recipientTokenAccount,
            isWritable: true,
            isSigner: false,
          },
          { pubkey: recipientTokenAccount1, isWritable: true, isSigner: false },
          {
            pubkey: recipientTokenAccount2,
            isWritable: true,
            isSigner: false,
          },
          {
            pubkey: recipientTokenAccount3,
            isWritable: true,
            isSigner: false,
          },
        ])
        .signers([bundlKeypair])
        .rpc();

      // get balance of recipient after
      const recipientAfter = await provider.connection.getTokenAccountBalance(
        recipientTokenAccount
      );

      const recipient1After = await provider.connection.getTokenAccountBalance(
        recipientTokenAccount1
      );

      const recipient2After = await provider.connection.getTokenAccountBalance(
        recipientTokenAccount2
      );

      const recipient3After = await provider.connection.getTokenAccountBalance(
        recipientTokenAccount3
      );

      // fetch bundle account to check last paid update
      const bundleAccount = await program.account.bundle.fetch(bundlePda1);

      // check the difference
      const difference =
        recipientAfter.value.uiAmount! -
        recipientBefore.value.uiAmount! +
        recipient1After.value.uiAmount! -
        recipient1Before.value.uiAmount! +
        recipient2After.value.uiAmount! -
        recipient2Before.value.uiAmount! +
        recipient3After.value.uiAmount! -
        recipient3Before.value.uiAmount!;
      assert.ok(
        difference === bundleAccount.amountPerInterval.toNumber() / 1_000_000,
        "invalid difference"
      ); // 100 USDC

      // assert recipient splits are correct
      const split =
        recipientAfter.value.uiAmount! - recipientBefore.value.uiAmount!;
      const split1 =
        recipient1After.value.uiAmount! - recipient1Before.value.uiAmount!;
      const split2 =
        recipient2After.value.uiAmount! - recipient2Before.value.uiAmount!;
      const split3 =
        recipient3After.value.uiAmount! - recipient3Before.value.uiAmount!;

      assert.ok(split === 20, "invalid split"); // 20 USDC
      assert.ok(split1 === 20, "invalid split 1"); // 20 USDC
      assert.ok(split2 === 20, "invalid split 2"); // 20 USDC
      assert.ok(split3 === 40, "invalid split 3"); // 40 USDC

      // get balance of user after
      const userAfter = await provider.connection.getTokenAccountBalance(
        userTokenAccount
      );
      const userDifference =
        userBefore.value.uiAmount! - userAfter.value.uiAmount!;
      assert.ok(
        userDifference ===
          bundleAccount.amountPerInterval.toNumber() / 1_000_000,
        "invalid user difference"
      ); // 100 USDC

      // assert last paid is updated
      const now = Math.floor(Date.now() / 1000);
      // allow a difference of 5 seconds
      assert.ok(
        bundleAccount.lastPaid.toNumber() >= now - 5,
        "last paid not updated"
      );
    });

    it("respects the interval — fails before 30s, succeeds after", async () => {
      const amountPerInterval = new BN(100_000_000); // 100 USDC
      const interval = new BN(30); // 30 seconds
      const bundleIdentifier = 2; // new bundle

      // Create a new bundle with 30s interval
      await program.methods
        .addBundle(
          amountPerInterval,
          interval,
          [recipientTokenAccount],
          [100],
          1
        )
        .accounts({
          authority: bundlKeypair.publicKey,
          user: user,
        })
        .signers([bundlKeypair])
        .rpc();

      // Trigger once — should succeed and set `last_paid`
      await program.methods
        .trigger(new BN(bundleIdentifier))
        .accounts({
          authority: bundlKeypair.publicKey,
          user: user,
          mintAccount: mint,
        })
        .remainingAccounts([
          {
            pubkey: recipientTokenAccount,
            isWritable: true,
            isSigner: false,
          },
        ])
        .signers([bundlKeypair])
        .rpc();

      // Immediate re-trigger should fail
      let failed = false;
      try {
        await program.methods
          .trigger(new BN(bundleIdentifier))
          .accounts({
            authority: bundlKeypair.publicKey,
            user: user,
            mintAccount: mint,
          })
          .remainingAccounts([
            {
              pubkey: recipientTokenAccount,
              isWritable: true,
              isSigner: false,
            },
          ])
          .signers([bundlKeypair])
          .rpc();
      } catch (err: any) {
        failed = true;
        assert.equal(err.error.errorCode.code, "IntervalNotPassed");
      }
      assert.ok(failed, "Expected IntervalNotPassed error");

      // Wait 31 seconds
      await new Promise((res) => setTimeout(res, 31_000));

      // Call trigger again — should now succeed
      await program.methods
        .trigger(new BN(bundleIdentifier))
        .accounts({
          authority: bundlKeypair.publicKey,
          user: user,
          mintAccount: mint,
        })
        .remainingAccounts([
          {
            pubkey: recipientTokenAccount,
            isWritable: true,
            isSigner: false,
          },
        ])
        .signers([bundlKeypair])
        .rpc();
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
