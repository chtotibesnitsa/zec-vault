// Real on-chain test of the vault's money paths on Solana devnet (free test
// SOL, real validators, real signatures). It runs the same Vault class the
// worker runs, stage by stage like the cron, and checks every result on-chain.
// Pump.fun and PumpPortal exist only on mainnet, so the buyback's output is
// seeded into the ledger; the claim is attempted for real and must be
// recognised as rejected.
//   node scripts/devnet-e2e.mjs <keys-dir>
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import { createMint, getMint, getOrCreateAssociatedTokenAccount, mintTo, getAccount } from '@solana/spl-token';
import bs58 from 'bs58';
import { Vault } from '../src/index.js';
import { Rpc } from '../src/rpc.js';
import { buildPayoutTx, sendSigned } from '../src/solana.js';

const RPC = process.env.DEVNET_RPC || 'https://api.devnet.solana.com';
const dir = process.argv[2];
const key = (n) => Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(`${dir}/${n}.json`))));
const [minter, treasury, alice, bob, tiny] = ['minter', 'treasury', 'alice', 'bob', 'tiny'].map(key);
const conn = new Connection(RPC, 'confirmed');
const log = (...a) => console.log(...a);
let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { c ? pass++ : fail++; log(`${c ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`); };
const sigs = [];

function fakeState() {
  const db = new DatabaseSync(':memory:');
  return { storage: { sql: { exec(q, ...p) {
    const parts = q.split(';').map((s) => s.trim()).filter(Boolean);
    if (parts.length > 1) { for (const s of parts) db.exec(s); return { toArray: () => [] }; }
    const st = db.prepare(q);
    if (/^\s*SELECT/i.test(q)) { const rows = st.all(...p); return { toArray: () => rows }; }
    st.run(...p); return { toArray: () => [] };
  } } } };
}

// Count network calls per stage (each is a Cloudflare subrequest in production).
let calls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (...a) => { calls++; return realFetch(...a); };

// --- setup: fund wallets, create a test token, give holders balances
const solOf = async (pk) => (await conn.getBalance(pk)) / LAMPORTS_PER_SOL;
log('minter', minter.publicKey.toBase58(), await solOf(minter.publicKey), 'SOL');
if ((await solOf(treasury.publicKey)) < 0.2) {
  const tx = new Transaction().add(SystemProgram.transfer({ fromPubkey: minter.publicKey, toPubkey: treasury.publicKey, lamports: 0.5 * LAMPORTS_PER_SOL }));
  sigs.push(['fund treasury 0.5 test SOL', await sendAndConfirmTransaction(conn, tx, [minter])]);
}
let mintPk;
const mintFile = `${dir}/mint.txt`;
if (fs.existsSync(mintFile)) mintPk = new PublicKey(fs.readFileSync(mintFile, 'utf8').trim());
else {
  mintPk = await createMint(conn, minter, minter.publicKey, null, 6);
  fs.writeFileSync(mintFile, mintPk.toBase58());
}
log('test token', mintPk.toBase58());
const ata = (owner) => getOrCreateAssociatedTokenAccount(conn, minter, mintPk, owner);
const bal = async (owner) => (await getAccount(conn, (await ata(owner)).address)).amount;
for (const [w, amt] of [[alice, 300_000_000_000n], [bob, 100_000_000_000n], [tiny, 1_000_000n]]) {
  if ((await bal(w.publicKey)) === 0n) await mintTo(conn, minter, mintPk, (await ata(w.publicKey)).address, minter, amt);
}
// Treasury holds 6 tokens: 4 to pay out (stands in for a buyback), 2 to burn.
const tAta = (await ata(treasury.publicKey)).address;
const tHas = await bal(treasury.publicKey);
if (tHas < 6_000_000n) await mintTo(conn, minter, mintPk, tAta, minter, 6_000_000n - tHas);

// --- the vault, configured like production but on devnet
const vault = new Vault(fakeState(), {
  TOKEN_MINT: mintPk.toBase58(),
  SOLANA_RPC_URL: RPC,
  TREASURY_SECRET_KEY: bs58.encode(treasury.secretKey),
  TOKEN_SYMBOL: 'ZATS',
  MIN_HOLD_TOKENS: '1000',
  CLAIM_EVERY_MINUTES: '5',
  GAS_RESERVE_SOL: '0.05',
});
const before = { alice: await bal(alice.publicKey), bob: await bal(bob.publicKey), tiny: await bal(tiny.publicKey), supply: (await getMint(conn, mintPk)).supply, sol: await solOf(treasury.publicKey) };
vault.set('reward_pool_raw', '4000000');
vault.set('burn_owed_raw', '2000000');
vault.set('burn_owed_lamports', '10000000');

const perStage = {};
for (const stage of ['scan', 'claim', 'burn', 'pay']) {
  calls = 0;
  const t0 = Date.now();
  await vault.tick(stage);
  perStage[stage] = { calls, ms: Date.now() - t0 };
}
log('network calls per stage (Cloudflare free limit is 50 each):', JSON.stringify(perStage));
ok(Object.values(perStage).every((s) => s.calls < 50), 'every stage stays under the subrequest limit');
ok(!vault.get('pending'), 'nothing left pending');
ok(/PumpPortal|failed|HTTP/.test(vault.get('last_claim_error') || ''), 'claim on a non-pump.fun wallet is recognised as rejected', (vault.get('last_claim_error') || '').slice(25, 120));
ok(!vault.get('last_error'), 'cycle finished without errors', vault.get('last_error') || '');

// --- verify on-chain
const after = { alice: await bal(alice.publicKey), bob: await bal(bob.publicKey), tiny: await bal(tiny.publicKey), supply: (await getMint(conn, mintPk)).supply, treas: await bal(treasury.publicKey), sol: await solOf(treasury.publicKey) };
ok(after.alice - before.alice === 3_000_000n, 'alice (75% of holders) received 3 tokens on-chain');
ok(after.bob - before.bob === 1_000_000n, 'bob (25%) received 1 token on-chain');
ok(after.tiny === before.tiny, 'wallet under the minimum got nothing');
ok(before.supply - after.supply === 2_000_000n, 'burn lowered total supply by exactly 2 tokens');
ok(after.treas === 0n, 'treasury holds no leftover tokens');
const feed = vault.feed(new URL('https://x/api/feed?limit=20')).events;
for (const e of feed) {
  const st = (await conn.getSignatureStatuses([e.sig], { searchTransactionHistory: true })).value[0];
  ok(st && !st.err && ['confirmed', 'finalized'].includes(st.confirmationStatus), `feed ${e.kind} is a confirmed transaction`, e.sig);
  sigs.push([`${e.kind} ${e.wallet ? e.wallet.slice(0, 4) : ''} ${e.amountRaw}`, e.sig]);
}
const s = await vault.stats();
ok(s.rewardsPaid === '4' && s.burned === '2' && s.holders === 2 && s.paidWallets === 2, 'stats match the chain', `paid=${s.rewardsPaid} burned=${s.burned} holders=${s.holders}`);
const h = vault.holder(alice.publicKey.toBase58());
ok(h.paid === '3' && h.owed === '0' && h.sharePct === 75 && h.payouts.length === 1, 'holder page matches the chain');

// --- a transaction that must fail is recognised as failed, and nothing is recorded
const rpc = new Rpc(RPC);
const built = await buildPayoutTx(rpc, treasury, { rewardMint: mintPk.toBase58(), rewardProgram: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', decimals: 6, items: [{ wallet: alice.publicKey.toBase58(), amount: '999000000' }], microLamports: 1000 });
const r = await sendSigned(rpc, built);
ok(r.state === 'failed', 'overspending transfer is rejected by the network and reported as failed', String(r.err).slice(0, 90));

// --- slow confirmation on a real network: the payout lands but the vault
// does not hear back in time. It must settle it once, never resend.
await mintTo(conn, minter, mintPk, tAta, minter, 2_000_000n);
vault.set('reward_pool_raw', '2000000');
const realConfirm = Rpc.prototype.confirm;
Rpc.prototype.confirm = async () => ({ ok: false, err: 'timeout' });
vault.set('last_cycle_at', '0');
for (const st of ['claim', 'burn', 'pay']) await vault.tick(st);
const p = vault.get('pending') ? JSON.parse(vault.get('pending')) : null;
ok(p && p.kind === 'payout', 'timed-out payout is held as pending', p?.sig);
Rpc.prototype.confirm = realConfirm;
await new Promise((res) => setTimeout(res, 8000));
const mid = await bal(alice.publicKey);
vault.set('last_cycle_at', '0');
for (const st of ['claim', 'burn', 'pay']) await vault.tick(st);
const end = await bal(alice.publicKey);
ok(mid - after.alice === 1_500_000n && end === mid, 'it landed once and was not sent again', `alice +${mid - after.alice} then +${end - mid}`);
ok(!vault.get('pending') && vault.holder(alice.publicKey.toBase58()).paid === '4.5', 'ledger settled from the pending record');
if (p) sigs.push(['payout after slow confirm', p.sig]);

// --- the vault API's transaction status lookup against real signatures
const vault2 = new Vault(fakeState(), { SOLANA_RPC_URL: RPC });
ok((await vault2.txStatus(feed[0].sig)).status !== 'pending', 'tx status lookup sees a confirmed payout', JSON.stringify(await vault2.txStatus(feed[0].sig)));

log(`\ntreasury SOL used: ${(before.sol - (await solOf(treasury.publicKey))).toFixed(6)} test SOL`);
log('\nsignatures (devnet):');
for (const [k, v] of sigs) log(`  ${k.padEnd(34)} https://solscan.io/tx/${v}?cluster=devnet`);
log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
