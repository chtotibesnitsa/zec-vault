// End-to-end payout cycle against a real local Solana VM (LiteSVM runs the
// actual SPL Token, Token-2022 and ATA programs). Only creator-fee claiming
// and the swap are skipped: the reward pool is seeded directly instead.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const expect = (a) => ({
  toBe: (b) => assert.strictEqual(a, b),
  toEqual: (b) => assert.deepStrictEqual(a, b),
  toHaveLength: (n) => assert.strictEqual(a.length, n),
});
import { DatabaseSync } from 'node:sqlite';
import { LiteSVM as KitSVM, FailedTransactionMetadata } from 'litesvm';
import { getTransactionDecoder } from '@solana/kit';
import { Keypair, PublicKey, SystemProgram, Transaction, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  ACCOUNT_SIZE,
  AccountLayout,
  MINT_SIZE,
  MintLayout,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createInitializeMint2Instruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { Vault } from '../src/index.js';
import { b64ToBytes, bytesToB64 } from '../src/rpc.js';

// litesvm 1.x speaks @solana/kit (string addresses, kit transactions). This
// adapter lets the test and the worker keep using web3.js v1 objects.
const txDecoder = getTransactionDecoder();
class LiteSVM {
  constructor() {
    this.svm = new KitSVM();
  }
  airdrop(pk, lamports) {
    return this.svm.airdrop(pk.toBase58(), lamports);
  }
  getBalance(pk) {
    return this.svm.getBalance(pk.toBase58());
  }
  getAccount(pk) {
    const r = this.svm.getAccount(pk.toBase58());
    return r.exists ? { data: r.data, owner: new PublicKey(r.programAddress) } : null;
  }
  latestBlockhash() {
    return this.svm.latestBlockhash();
  }
  expireBlockhash() {
    this.svm.expireBlockhash();
  }
  minimumBalanceForRentExemption(n) {
    return this.svm.minimumBalanceForRentExemption(n);
  }
  sendTransaction(tx) {
    const r = this.svm.sendTransaction(txDecoder.decode(tx.serialize()));
    if (r instanceof FailedTransactionMetadata) {
      const e = new Error('tx failed: ' + r.meta().logs().join('\n'));
      throw e;
    }
    return r;
  }
}

function fakeState() {
  const db = new DatabaseSync(':memory:');
  return {
    storage: {
      sql: {
        exec(query, ...params) {
          const statements = query.split(';').map((s) => s.trim()).filter(Boolean);
          if (statements.length > 1) {
            for (const s of statements) db.exec(s);
            return { toArray: () => [] };
          }
          const st = db.prepare(query);
          if (/^\s*(SELECT)/i.test(query)) {
            const rows = st.all(...params);
            return { toArray: () => rows };
          }
          st.run(...params);
          return { toArray: () => [] };
        },
      },
    },
  };
}

function setup(programId) {
  const svm = new LiteSVM();
  const payer = Keypair.generate();
  svm.airdrop(payer.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
  const send = (ixs, signers) => {
    const tx = new Transaction();
    tx.recentBlockhash = svm.latestBlockhash();
    tx.feePayer = signers[0].publicKey;
    tx.add(...ixs);
    tx.sign(...signers);
    return svm.sendTransaction(tx);
  };
  const newMint = (decimals) => {
    const mint = Keypair.generate();
    send(
      [
        SystemProgram.createAccount({
          fromPubkey: payer.publicKey,
          newAccountPubkey: mint.publicKey,
          lamports: Number(svm.minimumBalanceForRentExemption(BigInt(MINT_SIZE))),
          space: MINT_SIZE,
          programId,
        }),
        createInitializeMint2Instruction(mint.publicKey, decimals, payer.publicKey, null, programId),
      ],
      [payer, mint],
    );
    return mint.publicKey;
  };
  const mintTo = (mint, owner, amount) => {
    const ata = getAssociatedTokenAddressSync(mint, owner, true, programId);
    send(
      [
        createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata, owner, mint, programId),
        createMintToInstruction(mint, ata, payer.publicKey, amount, [], programId),
      ],
      [payer],
    );
    return ata;
  };
  const balanceOf = (mint, owner) => {
    const acc = svm.getAccount(getAssociatedTokenAddressSync(mint, owner, true, programId));
    if (!acc) return 0n;
    return AccountLayout.decode(Buffer.from(acc.data).subarray(0, ACCOUNT_SIZE)).amount;
  };
  return { svm, payer, newMint, mintTo, balanceOf };
}

// RPC shim backed by LiteSVM for the calls the cycle makes.
function svmRpc(svm, programId, tokenAccounts) {
  return {
    async call(method, params) {
      if (method === 'getTokenAccountsByOwner') {
        const [owner, { mint }] = params;
        const ata = getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(owner), true, programId);
        const acc = svm.getAccount(ata);
        const amount = acc ? AccountLayout.decode(Buffer.from(acc.data).subarray(0, ACCOUNT_SIZE)).amount : 0n;
        return { value: [{ account: { data: { parsed: { info: { tokenAmount: { amount: amount.toString() } } } } } }] };
      }
      throw new Error('unexpected rpc ' + method);
    },
    async getBalance(pk) {
      return Number(svm.getBalance(new PublicKey(pk)) || 0n);
    },
    async getLatestBlockhash() {
      return { blockhash: svm.latestBlockhash(), lastValidBlockHeight: 1e9 };
    },
    async getAccountInfoParsed(pk) {
      const acc = svm.getAccount(new PublicKey(pk));
      const m = MintLayout.decode(Buffer.from(acc.data).subarray(0, MINT_SIZE));
      return { owner: acc.owner.toBase58(), data: { parsed: { info: { decimals: m.decimals } } } };
    },
    async getSignaturesForAddress() {
      return [];
    },
    async getHolderAccounts() {
      return tokenAccounts().map((pk) => {
        const acc = svm.getAccount(pk);
        const d = AccountLayout.decode(Buffer.from(acc.data).subarray(0, ACCOUNT_SIZE));
        return { owner: d.owner.toBytes(), amount: d.amount };
      });
    },
    async sendRaw(b64) {
      const tx = VersionedTransaction.deserialize(b64ToBytes(b64));
      svm.sendTransaction(tx);
      svm.expireBlockhash();
      return bs58.encode(tx.signatures[0]);
    },
    async confirm() {
      return { ok: true };
    },
  };
}

for (const [label, programId] of [
  ['SPL Token', TOKEN_PROGRAM_ID],
  ['Token-2022', TOKEN_2022_PROGRAM_ID],
]) {
  describe(`payout cycle (${label})`, () => {
    it('pays holders pro rata on-chain, skips pools and records the ledger', async () => {
      const { svm, newMint, mintTo, balanceOf } = setup(programId);
      const treasury = Keypair.generate();
      svm.airdrop(treasury.publicKey, BigInt(LAMPORTS_PER_SOL));
      const mint = newMint(6);

      const alice = Keypair.generate().publicKey;
      const bob = Keypair.generate().publicKey;
      const tiny = Keypair.generate().publicKey;
      // A pool-style PDA owner: off-curve, must never be paid.
      const [poolPda] = PublicKey.findProgramAddressSync([Buffer.from('pool')], SystemProgram.programId);

      const accounts = [
        mintTo(mint, alice, 300_000_000_000n), // 300k tokens
        mintTo(mint, bob, 100_000_000_000n), // 100k tokens
        mintTo(mint, tiny, 1_000_000n), // 1 token, below MIN_HOLD
        mintTo(mint, poolPda, 500_000_000_000n),
        mintTo(mint, treasury.publicKey, 4_000_000n), // reward tokens the treasury bought
      ];

      const env = {
        TOKEN_MINT: mint.toBase58(),
        SOLANA_RPC_URL: 'http://unused',
        TREASURY_SECRET_KEY: bs58.encode(treasury.secretKey),
        MIN_HOLD_TOKENS: '1000',
        CLAIM_EVERY_MINUTES: '100000',
        ADMIN_KEY: 'k',
      };
      const vault = new Vault(fakeState(), env);
      vault.makeRpc = () => svmRpc(svm, programId, () => accounts);
      vault.set('last_claim_at', Date.now()); // no claim in this test
      vault.set('reward_pool_raw', '4000000'); // 4 tokens to distribute

      await vault.tick();
      expect(vault.get('last_error')).toBe('');

      expect(balanceOf(mint, alice)).toBe(300_000_000_000n + 3_000_000n);
      expect(balanceOf(mint, bob)).toBe(100_000_000_000n + 1_000_000n);
      expect(balanceOf(mint, tiny)).toBe(1_000_000n);
      expect(balanceOf(mint, poolPda)).toBe(500_000_000_000n);
      expect(balanceOf(mint, treasury.publicKey)).toBe(0n);

      const h = vault.holder(alice.toBase58());
      expect(h.eligible).toBe(true);
      expect(h.paid).toBe('3');
      expect(h.owed).toBe('0');
      expect(h.sharePct).toBe(75);
      expect(h.payouts).toHaveLength(1);

      const stats = await vault.stats();
      expect(stats.rewardsPaid).toBe('4');
      expect(stats.holders).toBe(2);
      expect(stats.paidWallets).toBe(2);

      const feed = vault.feed(new URL('https://x/api/feed'));
      expect(feed.events.filter((e) => e.kind === 'payout')).toHaveLength(2);

      // Second cycle with an empty pool pays nothing more.
      vault.set('last_cycle_at', '0');
      await vault.tick();
      expect(balanceOf(mint, alice)).toBe(300_000_000_000n + 3_000_000n);
    });

    it('never pays more than the treasury holds', async () => {
      const { svm, newMint, mintTo, balanceOf } = setup(programId);
      const treasury = Keypair.generate();
      svm.airdrop(treasury.publicKey, BigInt(LAMPORTS_PER_SOL));
      const mint = newMint(6);
      const alice = Keypair.generate().publicKey;
      const accounts = [mintTo(mint, alice, 500_000_000_000n), mintTo(mint, treasury.publicKey, 1_000_000n)];
      const vault = new Vault(fakeState(), {
        TOKEN_MINT: mint.toBase58(),
        SOLANA_RPC_URL: 'x',
        TREASURY_SECRET_KEY: bs58.encode(treasury.secretKey),
        CLAIM_EVERY_MINUTES: '100000',
      });
      vault.makeRpc = () => svmRpc(svm, programId, () => accounts);
      vault.set('last_claim_at', Date.now());
      vault.set('reward_pool_raw', '9000000'); // ledger says 9, wallet only has 1
      await vault.tick();
      expect(balanceOf(mint, alice)).toBe(500_000_000_000n);
      expect(vault.holder(alice.toBase58()).owed).toBe('9');
    });
  });
}
