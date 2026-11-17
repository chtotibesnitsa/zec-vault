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
function svmRpc(svm, programId, tokenAccounts, height = { value: 100 }, landed = new Set()) {
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
      try {
        svm.sendTransaction(tx);
      } catch (e) {
        e.rpc = { message: e.message }; // like a failed preflight
        throw e;
      }
      svm.expireBlockhash();
      const sig = bs58.encode(tx.signatures[0]);
      landed.add(sig);
      return sig;
    },
    async confirm() {
      return { ok: true };
    },
    async signatureStatus(sig) {
      return landed.has(sig) ? { confirmationStatus: 'confirmed', err: null } : null;
    },
    async getBlockHeight() {
      return height.value;
    },
    async getTransaction(sig) {
      // Payout and burn settlement only need to know it landed.
      return landed.has(sig) ? { meta: { preTokenBalances: [], postTokenBalances: [] }, transaction: { signatures: [sig], message: { accountKeys: [] } } } : null;
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

      // SOL sent to the vault by hand is booked only through the admin top-up,
      // and never beyond what the wallet holds on top of existing budgets.
      const post = (path, body, key = 'k') => vault.fetch(new Request('https://v' + path, { method: 'POST', headers: { 'x-admin-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) })).then((r) => r.json().then((j) => ({ status: r.status, ...j })));
      expect((await post('/api/admin/topup', { sol: 0.2 }, 'wrong')).status).toBe(401);
      expect((await post('/api/admin/topup', { sol: 50 })).status).toBe(400);
      const ok = await post('/api/admin/topup', { sol: 0.2 });
      expect(ok.ok).toBe(true);
      expect(vault.get('holders_budget_lamports')).toBe(String(0.2 * LAMPORTS_PER_SOL));
      const burnUp = await post('/api/admin/topup', { sol: 0.1, to: 'burn' });
      expect(burnUp.to).toBe('burn');
      expect(vault.get('burn_budget_lamports')).toBe(String(0.1 * LAMPORTS_PER_SOL));
      vault.set('holders_budget_lamports', '0');
      vault.set('burn_budget_lamports', '0');

      const feed = vault.feed(new URL('https://x/api/feed'));
      expect(feed.events.filter((e) => e.kind === 'payout')).toHaveLength(2);

      // Holder grid and payout history.
      const hl = vault.holdersList(new URL('https://x/api/holders'));
      expect(hl.count).toBe(2);
      expect(hl.holders.map((x) => x.wallet)).toEqual([alice.toBase58(), bob.toBase58()]);
      expect(hl.holders[0].rank).toBe(1);
      expect(hl.holders[0].pct).toBe(75);
      expect(hl.holders[0].paid).toBe('3');
      expect(typeof hl.holders[0].since).toBe('number');
      const cy = vault.cyclesList(new URL('https://x/api/cycles'));
      expect(cy.cycles).toHaveLength(1);
      expect(cy.cycles[0].paid).toBe('4');
      expect(cy.cycles[0].recipients).toBe(2);
      expect(cy.cycles[0].holders).toBe(2);
      expect(cy.cycles[0].joined).toBe(2);
      expect(cy.cycles[0].left).toBe(0);

      // Second cycle with an empty pool pays nothing more.
      vault.set('last_cycle_at', '0');
      await vault.tick();
      expect(balanceOf(mint, alice)).toBe(300_000_000_000n + 3_000_000n);
      const cy2 = vault.cyclesList(new URL('https://x/api/cycles'));
      expect(cy2.cycles).toHaveLength(2);
      expect(cy2.cycles[0].paid).toBe('0');
      expect(cy2.cycles[0].joined).toBe(0);
      expect(vault.holdersList(new URL('https://x/api/holders')).holders[0].since).toBe(hl.holders[0].since);
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

import { burnTokens } from '../src/solana.js';
for (const [label, programId] of [
  ['SPL Token', TOKEN_PROGRAM_ID],
  ['Token-2022', TOKEN_2022_PROGRAM_ID],
]) {
  describe(`buyback burn (${label})`, () => {
    it('burns exactly the bought amount and lowers supply', async () => {
      const { svm, newMint, mintTo, balanceOf } = setup(programId);
      const treasury = Keypair.generate();
      svm.airdrop(treasury.publicKey, BigInt(LAMPORTS_PER_SOL));
      const mint = newMint(6);
      mintTo(mint, treasury.publicKey, 5_000_000n);
      const supply = () => MintLayout.decode(Buffer.from(svm.getAccount(mint).data).subarray(0, MINT_SIZE)).supply;
      const before = supply();
      const rpc = svmRpc(svm, programId, () => []);
      await burnTokens(rpc, treasury, { mint: mint.toBase58(), program: programId.toBase58(), amount: 1_250_000n, decimals: 6, microLamports: 1000 });
      expect(balanceOf(mint, treasury.publicKey)).toBe(3_750_000n);
      expect(supply()).toBe(before - 1_250_000n);
    });
  });
}

// A payout whose confirmation times out must never be paid twice.
for (const [label, programId] of [
  ['SPL Token', TOKEN_PROGRAM_ID],
  ['Token-2022', TOKEN_2022_PROGRAM_ID],
]) {
  describe(`slow confirmations (${label})`, () => {
    const make = () => {
      const { svm, newMint, mintTo, balanceOf } = setup(programId);
      const treasury = Keypair.generate();
      svm.airdrop(treasury.publicKey, BigInt(LAMPORTS_PER_SOL));
      const mint = newMint(6);
      const alice = Keypair.generate().publicKey;
      const accounts = [mintTo(mint, alice, 500_000_000_000n), mintTo(mint, treasury.publicKey, 10_000_000n)];
      const vault = new Vault(fakeState(), {
        TOKEN_MINT: mint.toBase58(),
        SOLANA_RPC_URL: 'x',
        TREASURY_SECRET_KEY: bs58.encode(treasury.secretKey),
        CLAIM_EVERY_MINUTES: '100000',
      });
      const height = { value: 100 };
      const landed = new Set();
      const rpc = svmRpc(svm, programId, () => accounts, height, landed);
      vault.makeRpc = () => rpc;
      vault.set('last_claim_at', Date.now());
      const run = async () => {
        vault.set('last_cycle_at', '0');
        await vault.tick();
      };
      return { vault, rpc, height, landed, alice, mint, balanceOf, svm, treasury };
    };

    it('lands late: settled once from pending, never resent', async () => {
      const t = make();
      t.vault.set('reward_pool_raw', '2000000');
      t.rpc.confirm = async () => ({ ok: false, err: 'timeout' }); // it lands, but we never hear back in time
      t.vault.set('last_cycle_at', '0');
      await t.vault.tick();
      expect(t.balanceOf(t.mint, t.alice)).toBe(500_000_000_000n + 2_000_000n);
      expect(Boolean(t.vault.get('pending'))).toBe(true);
      expect(t.vault.holder(t.alice.toBase58()).owed).toBe('2'); // not yet settled

      t.rpc.confirm = async () => ({ ok: true });
      t.vault.set('last_cycle_at', '0');
      await t.vault.tick(); // settles the pending payout, does not pay again
      expect(t.balanceOf(t.mint, t.alice)).toBe(500_000_000_000n + 2_000_000n);
      expect(t.vault.holder(t.alice.toBase58()).owed).toBe('0');
      expect(t.vault.holder(t.alice.toBase58()).paid).toBe('2');
      expect(t.vault.get('pending')).toBe('');
    });

    it('never lands: waits until the blockhash expires, then pays once', async () => {
      const t = make();
      t.vault.set('reward_pool_raw', '2000000');
      const realSend = t.rpc.sendRaw;
      t.rpc.sendRaw = async (b64) => bs58.encode(VersionedTransaction.deserialize(b64ToBytes(b64)).signatures[0]); // dropped
      t.rpc.confirm = async () => ({ ok: false, err: 'timeout' });
      t.vault.set('last_cycle_at', '0');
      await t.vault.tick();
      expect(t.balanceOf(t.mint, t.alice)).toBe(500_000_000_000n);

      // Still inside the blockhash window: no new payout may be sent.
      t.rpc.sendRaw = realSend;
      t.rpc.confirm = async () => ({ ok: true });
      t.vault.set('last_cycle_at', '0');
      await t.vault.tick();
      expect(t.balanceOf(t.mint, t.alice)).toBe(500_000_000_000n);
      expect(Boolean(t.vault.get('pending'))).toBe(true);

      // Blockhash expired: the dropped payout is released and paid exactly once.
      t.height.value = 1e12;
      t.vault.set('last_cycle_at', '0');
      await t.vault.tick();
      expect(t.balanceOf(t.mint, t.alice)).toBe(500_000_000_000n + 2_000_000n);
      expect(t.vault.holder(t.alice.toBase58()).paid).toBe('2');
      expect(t.vault.holder(t.alice.toBase58()).owed).toBe('0');
    });

    it('burns tokens owed to the burn and keeps them out of payouts', async () => {
      const t = make();
      const supply = () => MintLayout.decode(Buffer.from(t.svm.getAccount(t.mint).data).subarray(0, MINT_SIZE)).supply;
      const before = supply();
      t.vault.set('burn_owed_raw', '3000000'); // bought for burning, burn not done yet
      t.vault.set('burn_owed_lamports', '1000');
      t.vault.set('reward_pool_raw', '7000000');
      t.vault.set('last_cycle_at', '0');
      await t.vault.tick();
      expect(supply()).toBe(before - 3_000_000n);
      expect(t.vault.get('burn_owed_raw')).toBe('0');
      expect(t.balanceOf(t.mint, t.alice)).toBe(500_000_000_000n + 7_000_000n);
      expect(t.balanceOf(t.mint, t.treasury.publicKey)).toBe(0n);
      const s = await t.vault.stats();
      expect(s.burned).toBe('3');
    });
  });
}
