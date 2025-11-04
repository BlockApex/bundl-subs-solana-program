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
import { assert, expect } from "chai";
import * as dotenv from "dotenv";
import { keccak256 } from "js-sha3";
import { Bundl } from "../target/types/bundl";

dotenv.config();

describe("bundl", () => {
  const secretKey = Uint8Array.from(JSON.parse(process.env.KEY!));
  const bundlKeypair = anchor.web3.Keypair.fromSecretKey(secretKey);
  const recipientKeyPair0 = anchor.web3.Keypair.generate();
  const recipientKeyPair1 = anchor.web3.Keypair.generate();
  const recipientKeyPair2 = anchor.web3.Keypair.generate();
  const recipientKeyPair3 = anchor.web3.Keypair.generate();

  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Bundl as Program<Bundl>;

  let controllerPda: anchor.web3.PublicKey;
  let controllerBump: number;
  let bundlePda: anchor.web3.PublicKey;
  let bundleBump: number;
  let bundlePda1: anchor.web3.PublicKey;
  let bundlePda2: anchor.web3.PublicKey;

  // Token related variables
  let user = provider.wallet.publicKey;
  let mint: anchor.web3.PublicKey;
  let userTokenAccount: anchor.web3.PublicKey;
  let recipientTokenAccount0: anchor.web3.PublicKey;
  let recipientTokenAccount1: anchor.web3.PublicKey;
  let recipientTokenAccount2: anchor.web3.PublicKey;
  let recipientTokenAccount3: anchor.web3.PublicKey;

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

    // create ATAs for new recipients
    recipientTokenAccount0 = await createAssociatedTokenAccount(
      provider.connection,
      provider.wallet.payer,
      mint,
      recipientKeyPair0.publicKey // owner of the ATA
    );

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

    // Step 4: Derive controller PDA
    [controllerPda, controllerBump] =
      await anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("controller"), user.toBuffer()],
        program.programId
      );
  });

  describe("initialize controller", async () => {
    // describe("given half amount is approved", async () => {
    //   before(async () => {
    //     // Step 5: Approve PDA to spend
    //     const approveIx = createApproveInstruction(
    //       userTokenAccount,
    //       controllerPda,
    //       user,
    //       250_000_000 // Approve 500 USDC
    //     );

    //     const tx = new anchor.web3.Transaction().add(approveIx);
    //     await provider.sendAndConfirm(tx);
    //   });

    //   it("fails with `LowAllowance`", async () => {
    //     let failed = false;
    //     try {
    //       // Call the instruction without approving the PDA
    //       await program.methods
    //         .initializeController()
    //         .accounts({
    //           authority: user,
    //           mintAccount: mint,
    //         })
    //         .signers([]) // authority already set in provider
    //         .rpc();
    //     } catch (err) {
    //       failed = true;
    //       // console.log(err);
    //       assert.ok(err.error.errorCode.code === "LowAllowance");
    //     }
    //     assert.ok(failed, "Expected call to fail but it succeeded");
    //   });
    // });

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
        assert.ok(controllerAccount.bump === controllerBump);
      });
    });

    // it("when amount is not approved, then fails with `InvalidDelegate`", async () => {
    //   let failed = false;
    //   try {
    //     // Call the instruction without approving the PDA
    //     await program.methods
    //       .initializeController()
    //       .accounts({
    //         authority: user,
    //         mintAccount: mint,
    //       })
    //       .signers([]) // authority already set in provider
    //       .rpc();
    //   } catch (err) {
    //     failed = true;
    //     assert.ok(err.error.errorCode.code === "InvalidDelegate");
    //   }
    //   assert.ok(failed, "Expected call to fail but it succeeded");
    // });
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

    it("given incorrect authority, then fails with `Unauthorized`", async () => {
      const amountPerInterval = 100_000_000; // 100 USDC
      const interval = 30 * 24 * 60 * 60; // 30 days in seconds
      const bundleId = "test-unauthorized-bundle";

      // Hash the bundle ID with Keccak256 and take first 16 bytes
      const hash = keccak256(bundleId);
      const seed16 = Buffer.from(hash, "hex").slice(0, 16);

      let failed = false;
      try {
        // Call the add_bundle instruction
        await program.methods
          .addBundle(
            Array.from(seed16), // Convert to array
            new BN(amountPerInterval),
            new BN(interval),
            [
              recipientTokenAccount0,
              anchor.web3.PublicKey.default,
              anchor.web3.PublicKey.default,
              anchor.web3.PublicKey.default,
              anchor.web3.PublicKey.default,
            ],
            1
          )
          .accounts({
            user,
            authority: user, // incorrect authority (should be bundlKeypair)
          })
          .signers([])
          .rpc();
      } catch (err: any) {
        failed = true;
        // console.log(err)
        assert.equal(err.error.errorCode.code, "Unauthorized");
      }

      assert.ok(failed, "Expected call to fail but it succeeded");
    });

    it("given more than 5 recipients, then fails with `InvalidNumRecipients`", async () => {
      const amountPerInterval = 100_000_000; // 100 USDC
      const interval = 30 * 24 * 60 * 60; // 30 days in seconds
      const bundleId = "test-too-many-recipients";

      // Hash the bundle ID with Keccak256 and take first 16 bytes
      const hash = keccak256(bundleId);
      const seed16 = Buffer.from(hash, "hex").slice(0, 16);

      let failed = false;
      try {
        // Call the add_bundle instruction
        await program.methods
          .addBundle(
            Array.from(seed16),
            new BN(amountPerInterval),
            new BN(interval),
            [
              recipientTokenAccount0,
              anchor.web3.PublicKey.default,
              anchor.web3.PublicKey.default,
              anchor.web3.PublicKey.default,
              anchor.web3.PublicKey.default,
            ],
            6 // More than 5 recipients
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
      const bundleId = "test-zero-recipients";

      // Hash the bundle ID with Keccak256 and take first 16 bytes
      const hash = keccak256(bundleId);
      const seed16 = Buffer.from(hash, "hex").slice(0, 16);

      let failed = false;
      try {
        // Call the add_bundle instruction
        await program.methods
          .addBundle(
            Array.from(seed16),
            new BN(amountPerInterval),
            new BN(interval),
            [
              recipientTokenAccount0,
              anchor.web3.PublicKey.default,
              anchor.web3.PublicKey.default,
              anchor.web3.PublicKey.default,
              anchor.web3.PublicKey.default,
            ],
            0 // Zero recipients
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
      const bundleId = "68fe0143fa35862d934ae947";

      // Hash the bundle ID string with Keccak256 and take first 16 bytes
      const hash = keccak256(bundleId);
      const seed16 = Buffer.from(hash, "hex").slice(0, 16);

      // Derive bundle PDA
      [bundlePda] = anchor.web3.PublicKey.findProgramAddressSync(
        [seed16, controllerPda.toBuffer()],
        program.programId
      );

      // get sol amount of user before
      const userBalanceBefore = await provider.connection.getBalance(user);
      // get sol amount of bundl authority before
      const bundlBalanceBefore = await provider.connection.getBalance(
        bundlKeypair.publicKey
      );

      try {
        // Call the add_bundle instruction
        await program.methods
          .addBundle(
            Array.from(seed16), // Convert Buffer to array
            new BN(amountPerInterval),
            new BN(interval),
            [
              recipientTokenAccount0,
              recipientTokenAccount1,
              recipientTokenAccount2,
              recipientTokenAccount3,
              anchor.web3.PublicKey.default, // 5th recipient
            ],
            4
          )
          .accounts({
            user,
            authority: bundlKeypair.publicKey,
          })
          .signers([bundlKeypair])
          .rpc();
      } catch (error) {
        throw error;
      }

      // Fetch the bundle account
      const bundleAccount = await program.account.bundle.fetch(bundlePda);

      // Check bundle values
      assert.ok(
        bundleAccount.amountPerInterval.toNumber() == amountPerInterval
      );
      assert.ok(bundleAccount.interval.toNumber() == interval);
      assert.ok(bundleAccount.lastPaid.toNumber() == 0);
      assert.ok(bundleAccount.numRecipients == 4);
      assert.ok(bundleAccount.userAtas[0].equals(recipientTokenAccount0));
      assert.ok(bundleAccount.userAtas[1].equals(recipientTokenAccount1));
      assert.ok(bundleAccount.userAtas[2].equals(recipientTokenAccount2));
      assert.ok(bundleAccount.userAtas[3].equals(recipientTokenAccount3));
      assert.ok(
        bundleAccount.userAtas[4].equals(anchor.web3.SystemProgram.programId)
      );
      assert.ok(!bundleAccount.isPaused, "Bundle is paused");

      // get sol amount of user after
      const userBalanceAfter = await provider.connection.getBalance(user);
      // get sol amount of bundl authority after
      const bundlBalanceAfter = await provider.connection.getBalance(
        bundlKeypair.publicKey
      );

      // bundl authority balance after should be more to indicate it received rent
      assert.ok(
        bundlBalanceAfter == bundlBalanceBefore,
        "bundl did not receive rent"
      );

      // sol amount after should be less to indicate user paid rent
      assert.ok(userBalanceAfter < userBalanceBefore, "user did not pay rent");
    });
  });

  describe("trigger", async () => {
    let amountArray = [
      new BN(100_000_000),
      new BN(0),
      new BN(0),
      new BN(0),
      new BN(0),
    ];
    before(async () => {
      const amountPerInterval = 100_000_000; // 100 USDC
      const interval = 30 * 24 * 60 * 60; // 30 days in seconds
      const bundleId = "bundle-trigger-1";
      const hash = keccak256(bundleId);
      const seed16 = Buffer.from(hash, "hex").slice(0, 16);

      // Call the add_bundle instruction
      await program.methods
        .addBundle(
          Array.from(seed16),
          new BN(amountPerInterval),
          new BN(interval),
          [
            recipientTokenAccount0,
            anchor.web3.PublicKey.default,
            anchor.web3.PublicKey.default,
            anchor.web3.PublicKey.default,
            anchor.web3.PublicKey.default,
          ],
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
          [seed16, controllerPda.toBuffer()],
          program.programId
        )
      )[0];
    });

    it("given incorrect authority, it fails with `Unauthorized`", async () => {
      const bundleId = "bundle-trigger-1";
      const hash = keccak256(bundleId);
      const seed16 = Buffer.from(hash, "hex").slice(0, 16);

      let failed = false;
      try {
        await program.methods
          .trigger(Array.from(seed16), amountArray)
          .accounts({
            authority: user,
            user: user,
            mintAccount: mint,
          })
          .rpc();
      } catch (err: any) {
        failed = true;
        // console.log(err);
        assert.equal(err.error.errorCode.code, "Unauthorized");
      }

      assert.ok(failed, "Expected call to fail but it succeeded");
    });

    it("given amount more than amount per interval, it fails with `InvalidTotalAmount`", async () => {
      let failed = false;
      try {
        const bundleId = "bundle-trigger-1";
        const hash = keccak256(bundleId);
        const seed16 = Buffer.from(hash, "hex").slice(0, 16);

        await program.methods
          .trigger(Array.from(seed16), [
            new BN(200_000_000),
            new BN(0),
            new BN(0),
            new BN(0),
            new BN(0),
          ])
          .accounts({
            authority: bundlKeypair.publicKey,
            user: user,
            mintAccount: mint,
          })
          .remainingAccounts([
            {
              pubkey: recipientTokenAccount0,
              isWritable: true,
              isSigner: false,
            },
          ])
          .signers([bundlKeypair])
          .rpc();
      } catch (err: any) {
        failed = true;
        // console.log(err);
        assert.equal(err.error.errorCode.code, "InvalidTotalAmount");
      }

      assert.ok(failed, "Expected call to fail but it succeeded");
    });

    it("given invalid number of recipients provided, it fails with `InvalidNumRecipientsProvided`", async () => {
      let failed = false;
      try {
        const bundleId = "bundle-trigger-1";
        const hash = keccak256(bundleId);
        const seed16 = Buffer.from(hash, "hex").slice(0, 16);

        await program.methods
          .trigger(Array.from(seed16), amountArray)
          .accounts({
            authority: bundlKeypair.publicKey,
            user: user,
            mintAccount: mint,
          })
          .signers([bundlKeypair])
          .rpc();
      } catch (err: any) {
        failed = true;
        // console.log(err);
        assert.equal(err.error.errorCode.code, "InvalidNumRecipientsProvided");
      }
      assert.ok(failed, "Expected call to fail but it succeeded");
    });

    it("given invalid recipient, it fails with `InvalidRecipient`", async () => {
      let failed = false;
      try {
        const bundleId = "bundle-trigger-1";
        const hash = keccak256(bundleId);
        const seed16 = Buffer.from(hash, "hex").slice(0, 16);

        await program.methods
          .trigger(Array.from(seed16), amountArray)
          .accounts({
            authority: bundlKeypair.publicKey,
            user: user,
            mintAccount: mint,
          })
          .remainingAccounts([
            {
              pubkey: recipientTokenAccount1,
              isWritable: true,
              isSigner: false,
            },
          ])
          .signers([bundlKeypair])
          .rpc();
      } catch (err: any) {
        failed = true;
        // console.log(err);
        assert.equal(err.error.errorCode.code, "InvalidRecipient");
      }
      assert.ok(failed, "Expected call to fail but it succeeded");
    });

    it("given insufficient balance, it fails with `InsufficientFunds`", async () => {
      // transfer all user tokens to recipient to ensure no tokens
      const userBalance = await provider.connection.getTokenAccountBalance(
        userTokenAccount
      );
      try {
        const transferInstruction = createTransferInstruction(
          userTokenAccount,
          recipientTokenAccount0,
          user,
          userBalance.value.uiAmount! * 1_000_000
        );
        const tx = new anchor.web3.Transaction().add(transferInstruction);
        await provider.sendAndConfirm(tx);
      } catch (error) {
        throw error;
      }
      // Now attempt to trigger with an amount that exceeds remaining balance
      let failed = false;
      try {
        const bundleId = "bundle-trigger-1";
        const hash = keccak256(bundleId);
        const seed16 = Buffer.from(hash, "hex").slice(0, 16);

        await program.methods
          .trigger(Array.from(seed16), [
            new BN(200),
            new BN(0),
            new BN(0),
            new BN(0),
            new BN(0),
          ])
          .accounts({
            authority: bundlKeypair.publicKey,
            user: user,
            mintAccount: mint,
          })
          .remainingAccounts([
            {
              pubkey: recipientTokenAccount0,
              isWritable: true,
              isSigner: false,
            },
          ])
          .signers([bundlKeypair])
          .rpc();
      } catch (err: any) {
        failed = true;
        // Expect the program to fail with InsufficientFunds
        if (err.error?.errorCode?.code) {
          assert.equal(err.error.errorCode.code, "InsufficientFunds");
        } else {
          // Re-throw to surface unexpected failures
          throw err;
        }
      }
      assert.ok(failed, "Expected call to fail but it succeeded");

      // transfer back tokens to user for further tests
      try {
        const transferBackIx = createTransferInstruction(
          recipientTokenAccount0,
          userTokenAccount,
          recipientKeyPair0.publicKey,
          userBalance.value.uiAmount! * 1_000_000
        );
        const tx2 = new anchor.web3.Transaction().add(transferBackIx);
        // set recipient 3 as payer
        await provider.sendAndConfirm(tx2, [recipientKeyPair0]);
      } catch (error) {
        throw error;
      }
    });

    it("given first time payment, it triggers a bundle payment", async () => {
      // get balance of recipient before
      const recipientBefore = await provider.connection.getTokenAccountBalance(
        recipientTokenAccount0
      );
      // get balance of user before
      const userBefore = await provider.connection.getTokenAccountBalance(
        userTokenAccount
      );

      const bundleId = "bundle-trigger-1";
      const hash = keccak256(bundleId);
      const seed16 = Buffer.from(hash, "hex").slice(0, 16);

      await program.methods
        .trigger(Array.from(seed16), amountArray)
        .accounts({
          authority: bundlKeypair.publicKey,
          user: user,
          mintAccount: mint,
        })
        .remainingAccounts([
          {
            pubkey: recipientTokenAccount0,
            isWritable: true,
            isSigner: false,
          },
        ])
        .signers([bundlKeypair])
        .rpc();

      // get balance of recipient after
      const recipientAfter = await provider.connection.getTokenAccountBalance(
        recipientTokenAccount0
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
        const bundleId = "bundle-trigger-1";
        const hash = keccak256(bundleId);
        const seed16 = Buffer.from(hash, "hex").slice(0, 16);

        await program.methods
          .trigger(Array.from(seed16), amountArray)
          .accounts({
            authority: bundlKeypair.publicKey,
            user: user,
            mintAccount: mint,
          })
          .remainingAccounts([
            {
              pubkey: recipientTokenAccount0,
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

    it("given paused bundle, it fails with `BundlePaused`", async () => {
      // pause the bundle first
      const bundleId = "bundle-trigger-1";
      const hash = keccak256(bundleId);
      const seed16 = Buffer.from(hash, "hex").slice(0, 16);

      await program.methods
        .pauseBundle(Array.from(seed16))
        .accounts({
          user: user,
        })
        .rpc();

      let failed = false;
      try {
        await program.methods
          .trigger(Array.from(seed16), amountArray)
          .accounts({
            authority: bundlKeypair.publicKey,
            user: user,
            mintAccount: mint,
          })
          .remainingAccounts([
            {
              pubkey: recipientTokenAccount0,
              isWritable: true,
              isSigner: false,
            },
          ])
          .signers([bundlKeypair])
          .rpc();
      } catch (err: any) {
        failed = true;
        // console.log(err)
        assert.equal(err.error.errorCode.code, "BundlePaused");
      }
      assert.ok(failed, "Expected call to fail but it succeeded");
    });

    it("given multiple splits, it triggers a bundle payment to multiple recipients", async () => {
      const bundleId = "68fe0143fa35862d934ae947";
      const hash = keccak256(bundleId);
      const seed16 = Buffer.from(hash, "hex").slice(0, 16);

      // fetch bundle account to check last paid update
      const bundleAccount = await program.account.bundle.fetch(bundlePda1);

      // get balance of recipient before
      const recipient0Before = await provider.connection.getTokenAccountBalance(
        recipientTokenAccount0
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

      // fetch the bundle account to get ATAs manually because js only references the first index
      const accountInfo = await provider.connection.getAccountInfo(bundlePda);
      // Skip the discriminator (8 bytes) + 4 u64/i64 fields (40 bytes)
      const offset = 8 + 8 + 8 + 8; // = 48
      const data = accountInfo.data.slice(offset);
      const atas = [];
      for (let i = 0; i < 5; i++) {
        atas.push(new anchor.web3.PublicKey(data.slice(i * 32, (i + 1) * 32)));
      }
      // console.log(atas.map((x) => x.toBase58()));

      await program.methods
        .trigger(Array.from(seed16), [
          new BN(20_000_000),
          new BN(20_000_000),
          new BN(20_000_000),
          new BN(40_000_000),
          new BN(0),
        ])
        .accounts({
          authority: bundlKeypair.publicKey,
          user: user,
          mintAccount: mint,
        })
        .remainingAccounts([
          {
            pubkey: atas[0],
            isWritable: true,
            isSigner: false,
          },
          { pubkey: atas[1], isWritable: true, isSigner: false },
          {
            pubkey: atas[2],
            isWritable: true,
            isSigner: false,
          },
          {
            pubkey: atas[3],
            isWritable: true,
            isSigner: false,
          },
        ])
        .signers([bundlKeypair])
        .rpc();

      // get balance of recipient after
      const recipient0After = await provider.connection.getTokenAccountBalance(
        recipientTokenAccount0
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

      // check the difference
      const difference =
        recipient0After.value.uiAmount! -
        recipient0Before.value.uiAmount! +
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
      const split0 =
        recipient0After.value.uiAmount! - recipient0Before.value.uiAmount!;
      const split1 =
        recipient1After.value.uiAmount! - recipient1Before.value.uiAmount!;
      const split2 =
        recipient2After.value.uiAmount! - recipient2Before.value.uiAmount!;
      const split3 =
        recipient3After.value.uiAmount! - recipient3Before.value.uiAmount!;

      assert.ok(split0 === 20, "invalid split"); // 20 USDC
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
      const bundleId = "interval-test-bundle"; // unique bundle ID

      // Hash the bundle ID
      const hash = keccak256(bundleId);
      const seed16 = Buffer.from(hash, "hex").slice(0, 16);

      // Create a new bundle with 30s interval
      await program.methods
        .addBundle(
          Array.from(seed16),
          amountPerInterval,
          interval,
          [
            recipientTokenAccount0,
            anchor.web3.PublicKey.default,
            anchor.web3.PublicKey.default,
            anchor.web3.PublicKey.default,
            anchor.web3.PublicKey.default,
          ],
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
        .trigger(Array.from(seed16), [
          new BN(100_000_000),
          new BN(0),
          new BN(0),
          new BN(0),
          new BN(0),
        ])
        .accounts({
          authority: bundlKeypair.publicKey,
          user: user,
          mintAccount: mint,
        })
        .remainingAccounts([
          {
            pubkey: recipientTokenAccount0,
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
          .trigger(Array.from(seed16), [
            new BN(100_000_000),
            new BN(0),
            new BN(0),
            new BN(0),
            new BN(0),
          ])
          .accounts({
            authority: bundlKeypair.publicKey,
            user: user,
            mintAccount: mint,
          })
          .remainingAccounts([
            {
              pubkey: recipientTokenAccount0,
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
        .trigger(Array.from(seed16), [
          new BN(100_000_000),
          new BN(0),
          new BN(0),
          new BN(0),
          new BN(0),
        ])
        .accounts({
          authority: bundlKeypair.publicKey,
          user: user,
          mintAccount: mint,
        })
        .remainingAccounts([
          {
            pubkey: recipientTokenAccount0,
            isWritable: true,
            isSigner: false,
          },
        ])
        .signers([bundlKeypair])
        .rpc();
    });
  });

  describe("pause bundle", async () => {
    it("pauses a bundle", async () => {
      const bundleId = "bundle-trigger-1";
      const hash = keccak256(bundleId);
      const seed16 = Buffer.from(hash, "hex").slice(0, 16);

      await program.methods
        .pauseBundle(Array.from(seed16))
        .accounts({
          user: user,
        })
        .rpc();

      // Fetch the bundle account
      const bundleAccount = await program.account.bundle.fetch(bundlePda1);

      // Check bundle is paused
      assert.ok(bundleAccount.isPaused, "Bundle is not paused");
    });
  });

  describe("unpause bundle", async () => {
    it("unpauses a bundle", async () => {
      const bundleId = "bundle-trigger-1";
      const hash = keccak256(bundleId);
      const seed16 = Buffer.from(hash, "hex").slice(0, 16);

      await program.methods
        .resumeBundle(Array.from(seed16))
        .accounts({
          user: user,
        })
        .rpc();

      // Fetch the bundle account
      const bundleAccount = await program.account.bundle.fetch(bundlePda1);

      // Check bundle is unpaused
      assert.ok(!bundleAccount.isPaused, "Bundle is still paused");
    });
  });

  describe("cancel bundle", async () => {
    it("given incorrect signer, should return error", async () => {
      const bundleId = "bundle-trigger-1";
      const hash = keccak256(bundleId);
      const seed16 = Buffer.from(hash, "hex").slice(0, 16);

      let failed = false;
      try {
        await program.methods
          .cancelBundle(Array.from(seed16))
          .accounts({
            user: user,
          })
          .signers([bundlKeypair])
          .rpc();
      } catch (err: any) {
        failed = true;
        // console.log(err);
        expect(err.toString()).to.include("Error: unknown signer:");
      }
      assert.ok(failed, "Expected call to fail but it succeeded");
    });

    it("cancels a bundle", async () => {
      // fetch user sol balance before
      const userBalanceBefore = await provider.connection.getBalance(user);
      const bundleId = "bundle-trigger-1";
      const hash = keccak256(bundleId);
      const seed16 = Buffer.from(hash, "hex").slice(0, 16);

      await program.methods
        .cancelBundle(Array.from(seed16))
        .accounts({
          user: user,
        })
        .rpc();

      // Try to fetch the bundle account — should fail
      let failed = false;
      try {
        await program.account.bundle.fetch(bundlePda1);
      } catch (err: any) {
        // Error: Account does not exist or has no data
        expect(err.toString()).to.include(
          "Error: Account does not exist or has no data"
        );
        failed = true;
      }
      assert.ok(failed, "Expected fetch to fail but it succeeded");

      // fetch user sol balance after
      const userBalanceAfter = await provider.connection.getBalance(user);
      // user balance after should be more to indicate rent refunded
      assert.ok(
        userBalanceAfter > userBalanceBefore,
        "user did not receive rent refund"
      );
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
