// Privacy vault backend: a Cloudflare Worker plus one Durable Object that
// owns the ledger. Every minute it records real trades of the token. Every
// CYCLE_MINUTES it claims pump.fun creator fees, buys the reward token with
// the holders' share, snapshots holders and pays them pro rata on-chain.
// Nothing here is simulated: every feed row has a Solana signature.

import { Identity, IDENTITY_SCHEMA } from './identity.js';
import { Rpc, TOKEN_PROGRAM, sleep } from './rpc.js';
import { allocate, buildSnapshot, chunk, fitNewAccounts, fromRaw, parseTrade, selectPayouts, solDelta, swapSpend, toRaw, tokenDelta } from './engine.js';
import {
  buildBurnTx,
  buildBuyTx,
  buildClaimTx,
  buildJupiterTx,
  buildPayoutTx,
  ataAddress,
  isOnCurveAddress,
  isValidAddress,
  loadKeypair,
  sendSigned,
  toBase58,
} from './solana.js';

const LAMPORTS = 1_000_000_000;
const ACCOUNT_RENT = 2039280n; // rent-exempt minimum of a 165-byte token account

function cfg(env) {
  const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
  return {
    mint: (env.TOKEN_MINT || '').trim(),
    rewardMint: (env.REWARD_MINT || '').trim(), // empty = buy back the vault token itself
    tokenSymbol: env.TOKEN_SYMBOL || 'VAULT',
    rewardSymbol: env.REWARD_SYMBOL || '',
    shareBps: Math.min(10000, Math.max(0, num(env.REWARD_SHARE_BPS, 8000))),
    burnBps: Math.max(0, num(env.BURN_BPS, 2000)),
    cycleMinutes: Math.max(1, num(env.CYCLE_MINUTES, 5)),
    claimEveryMinutes: Math.max(1, num(env.CLAIM_EVERY_MINUTES, 30)),
    gasReserveSol: num(env.GAS_RESERVE_SOL, 0.05),
    minCycleSol: num(env.MIN_CYCLE_SOL, 0.02),
    minHold: env.MIN_HOLD_TOKENS || '100000',
    minPayout: env.MIN_PAYOUT || '0',
    maxRecipients: Math.max(1, num(env.MAX_RECIPIENTS_PER_CYCLE, 60)),
    perTx: Math.max(1, Math.min(10, num(env.TRANSFERS_PER_TX, 8))),
    // PumpPortal fallback only (burn buys when Jupiter has no route).
    slippage: num(env.SLIPPAGE_PCT, 5),
    // Jupiter swaps. SOL -> ZEC moves the price ~0.03% even at 1 SOL, so 1% is
    // ample; wider only lets sandwich bots take the difference.
    rewardSlippageBps: Math.max(10, num(env.REWARD_SLIPPAGE_BPS, 100)),
    burnSlippageBps: Math.max(10, num(env.BURN_SLIPPAGE_BPS, 300)),
    jupPriorityLevel: env.JUPITER_PRIORITY_LEVEL || 'medium',
    jupMaxPriorityLamports: Math.max(0, num(env.JUPITER_MAX_PRIORITY_LAMPORTS, 50000)),
    // Claims are not time-sensitive, so they pay a small priority fee.
    priorityFee: num(env.PRIORITY_FEE_SOL, 0.00001),
    microLamports: num(env.PRIORITY_MICROLAMPORTS, 50000),
    exclude: new Set((env.EXCLUDE_WALLETS || '').split(',').map((s) => s.trim()).filter(Boolean)),
    // The keyless lite host is being retired; with a key (free at portal.jup.ag) use the main host.
    jupBase: env.JUPITER_API_BASE || (env.JUPITER_API_KEY ? 'https://api.jup.ag/swap/v1' : 'https://lite-api.jup.ag/swap/v1'),
    jupKey: env.JUPITER_API_KEY || '',
    // A holder with no reward token account yet is paid only once what they are
    // owed is worth at least this many times the ~0.002 SOL it costs to open one.
    newAccountRentX: Math.max(0, num(env.NEW_ACCOUNT_MIN_RENT_X, 1)),
  };
}

// scan: record trades. claim: settle pending, claim fees, buy for holders.
// burn: buy and burn. pay: snapshot holders and pay them.
const STAGES = ['scan', 'claim', 'burn', 'pay'];

// Constant-time string compare for the admin key.
function sameKey(a, b) {
  const x = new TextEncoder().encode(String(a));
  const y = new TextEncoder().encode(String(b));
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] || 0) ^ (y[i] || 0);
  return d === 0;
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,x-admin-key,authorization',
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v)), {
    status,
    headers: { 'content-type': 'application/json', ...CORS, ...extra },
  });
}

export default {
  async fetch(req, env) {
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const url = new URL(req.url);
    if (url.pathname === '/ping') return json({ ok: true, service: 'privacy-vault', time: Date.now() });
    if (!url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    const stub = env.VAULT.get(env.VAULT.idFromName('main'));
    return stub.fetch(req);
  },
  // Each stage is its own request to the Durable Object, so each gets its own
  // Cloudflare subrequest budget (50 on the free plan). Stages run in order.
  async scheduled(_event, env, ctx) {
    const stub = env.VAULT.get(env.VAULT.idFromName('main'));
    ctx.waitUntil(
      (async () => {
        for (const stage of STAGES) await stub.fetch(`https://vault/internal/tick?stage=${stage}`, { method: 'POST' });
      })(),
    );
  },
};

export class Vault {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sql = state.storage.sql;
    this.running = false;
    this.priceCache = null;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, kind TEXT NOT NULL,
        sig TEXT, wallet TEXT, amount_raw TEXT, lamports TEXT, meta TEXT);
      CREATE UNIQUE INDEX IF NOT EXISTS events_uniq ON events(kind, sig, wallet);
      CREATE INDEX IF NOT EXISTS events_ts ON events(ts);
      CREATE INDEX IF NOT EXISTS events_wallet ON events(wallet);
      CREATE TABLE IF NOT EXISTS owed (
        wallet TEXT PRIMARY KEY, raw TEXT NOT NULL DEFAULT '0', paid_raw TEXT NOT NULL DEFAULT '0',
        payouts INTEGER NOT NULL DEFAULT 0, last_paid INTEGER);
      CREATE TABLE IF NOT EXISTS holders (wallet TEXT PRIMARY KEY, amount TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT);
      CREATE TABLE IF NOT EXISTS holder_seen (
        wallet TEXT PRIMARY KEY, first_seen INTEGER NOT NULL, last_seen INTEGER NOT NULL,
        rank INTEGER, prev_rank INTEGER);
      CREATE TABLE IF NOT EXISTS cycles (
        id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, holders INTEGER NOT NULL,
        joined INTEGER NOT NULL, left_n INTEGER NOT NULL, paid_raw TEXT NOT NULL, recipients INTEGER NOT NULL,
        burned_raw TEXT NOT NULL, fees_lamports TEXT NOT NULL, sigs TEXT);
    `);
    this.sql.exec(IDENTITY_SCHEMA);
    this.id = new Identity(this);
  }

  // ---------- small storage helpers ----------
  get(k, d = null) {
    const r = this.sql.exec('SELECT v FROM kv WHERE k = ?', k).toArray()[0];
    return r ? r.v : d;
  }
  set(k, v) {
    this.sql.exec('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v', k, String(v));
  }
  big(k) {
    return BigInt(this.get(k, '0'));
  }
  addBig(k, d) {
    this.set(k, (this.big(k) + BigInt(d)).toString());
  }
  event(e) {
    this.sql.exec(
      'INSERT OR IGNORE INTO events (ts, kind, sig, wallet, amount_raw, lamports, meta) VALUES (?, ?, ?, ?, ?, ?, ?)',
      e.ts || Date.now(),
      e.kind,
      e.sig || null,
      e.wallet || null,
      e.amountRaw != null ? String(e.amountRaw) : null,
      e.lamports != null ? String(e.lamports) : null,
      e.meta ? JSON.stringify(e.meta) : null,
    );
  }

  async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname;
    try {
      if (p === '/internal/tick') {
        if (req.headers.get('cf-connecting-ip')) return json({ error: 'not found' }, 404); // never from the internet
        await this.tick(url.searchParams.get('stage') || 'all');
        return json({ ok: true });
      }
      if (p === '/api/config') return json(this.publicConfig());
      if (p === '/api/stats') return json(await this.stats());
      if (p === '/api/feed') return json(this.feed(url));
      if (p === '/api/leaderboard') return json(this.leaderboard());
      if (p === '/api/holders') return json(this.holdersList(url));
      if (p === '/api/cycles') return json(this.cyclesList(url));
      if (p.startsWith('/api/holder/')) return json(this.holder(decodeURIComponent(p.slice('/api/holder/'.length))));
      if (p.startsWith('/api/admin/')) return this.admin(req, p);
      if (p === '/api/diamonds') return json(this.diamonds());
      if (p.startsWith('/api/tx/')) return json(await this.txStatus(decodeURIComponent(p.slice('/api/tx/'.length))));
      if (p === '/api/jup/quote' || p === '/api/jup/swap') return this.jupProxy(req, p, url);
      if (p.startsWith('/api/auth/') || p === '/api/me' || p === '/api/profile' || p === '/api/referrals' || p.startsWith('/api/u/')) {
        return this.id.route(req, p, url, json);
      }
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: String(e.message || e) }, 500);
    }
  }

  // Pass-through to Jupiter for browsers that can't call it directly. Only the
  // quote and swap-build endpoints; the user's wallet still signs and sends.
  async jupProxy(req, p, url) {
    const c = cfg(this.env);
    const headers = { 'content-type': 'application/json' };
    if (c.jupKey) headers['x-api-key'] = c.jupKey;
    const target = c.jupBase + (p.endsWith('quote') ? '/quote' + url.search : '/swap');
    const init = p.endsWith('quote') ? { headers } : { method: 'POST', headers, body: await req.text() };
    const r = await fetch(target, init);
    return new Response(await r.text(), { status: r.status, headers: { 'content-type': 'application/json', ...CORS } });
  }

  // Confirmation status of any Solana transaction, for the swap screen.
  async txStatus(sig) {
    if (!/^[1-9A-HJ-NP-Za-km-z]{80,90}$/.test(sig)) return { error: 'invalid signature' };
    if (!this.env.SOLANA_RPC_URL) return { status: 'unknown' };
    const st = await new Rpc(this.env.SOLANA_RPC_URL).signatureStatus(sig);
    if (!st) return { status: 'pending' };
    if (st.err) return { status: 'failed', err: st.err };
    return { status: st.confirmationStatus === 'processed' ? 'pending' : st.confirmationStatus };
  }

  publicConfig() {
    const c = cfg(this.env);
    const signer = this.signer();
    return {
      tokenMint: c.mint || null,
      tokenSymbol: c.tokenSymbol,
      rewardMint: c.rewardMint || c.mint || null,
      rewardSymbol: c.rewardSymbol || c.tokenSymbol,
      rewardIsOwnToken: !c.rewardMint,
      rewardShareBps: c.shareBps,
      burnBps: Math.min(c.burnBps, 10000 - c.shareBps),
      cycleMinutes: c.cycleMinutes,
      minHoldTokens: c.minHold,
      treasury: signer ? signer.publicKey.toBase58() : null,
      live: Boolean(c.mint && signer && this.env.SOLANA_RPC_URL),
      paused: this.get('paused') === '1',
      decimals: Number(this.get('mint_decimals', '6')),
      rewardDecimals: Number(this.get('reward_decimals', this.get('mint_decimals', '6'))),
    };
  }

  signer() {
    if (this._signer !== undefined) return this._signer;
    try {
      this._signer = loadKeypair(this.env.TREASURY_SECRET_KEY);
    } catch {
      this._signer = null;
    }
    return this._signer;
  }

  // ---------- scheduled work ----------
  // stage: 'scan' | 'claim' | 'burn' | 'pay' | 'all'
  async tick(stage = 'all') {
    if (this.running) return;
    this.running = true;
    try {
      const c = cfg(this.env);
      if (!c.mint || !this.env.SOLANA_RPC_URL) return;
      const rpc = this.makeRpc ? this.makeRpc() : new Rpc(this.env.SOLANA_RPC_URL);
      await this.ensureMintInfo(rpc, c);
      if (stage === 'scan' || stage === 'all') {
        try {
          await this.scanTrades(rpc, c);
          this.set('last_feed_error', '');
        } catch (e) {
          this.set('last_feed_error', `${new Date().toISOString()} ${e.message}`);
        }
      }
      if (stage === 'scan' || this.get('paused') === '1' || !this.signer()) {
        // Without a running cycle the holder list still refreshes on the cycle timer.
        if ((stage === 'scan' || stage === 'all') && Date.now() - Number(this.get('snapshot_at', '0')) >= c.cycleMinutes * 60000 - 5000) {
          try {
            await this.snapshotHolders(rpc, c);
          } catch (e) {
            this.set('last_feed_error', `${new Date().toISOString()} holders: ${e.message}`);
          }
        }
        return;
      }

      // A cycle opens in the claim stage when it is due; burn and pay follow it.
      if (stage === 'claim' || stage === 'all') {
        const lastCycle = Number(this.get('last_cycle_at', '0'));
        if (Date.now() - lastCycle < c.cycleMinutes * 60000 - 5000) return;
        this.set('last_cycle_at', Date.now());
        this.set('cycle_open', '1');
        this.set('last_error', '');
      }
      if (this.get('cycle_open') !== '1') return;
      const steps = stage === 'all' ? ['claim', 'burn', 'pay'] : [stage];
      for (const st of steps) {
        try {
          const go = await this.cycleStage(rpc, c, st);
          if (!go) {
            this.set('cycle_open', '0');
            return;
          }
        } catch (e) {
          this.set('last_error', `${new Date().toISOString()} ${st}: ${e.message}`);
          // With a transaction in flight nothing else may move money this cycle.
          // Otherwise a failed buy must not block paying what holders are owed.
          if (this.get('pending')) {
            this.set('cycle_open', '0');
            return;
          }
        }
      }
      if (stage === 'pay' || stage === 'all') this.set('cycle_open', '0');
    } finally {
      this.running = false;
    }
  }

  async ensureMintInfo(rpc, c) {
    if (this.get('mint_for') !== c.mint) {
      const info = await rpc.getAccountInfoParsed(c.mint);
      if (!info) throw new Error('TOKEN_MINT not found on-chain');
      this.set('mint_decimals', info.data.parsed.info.decimals);
      this.set('mint_program', info.owner);
      this.set('mint_for', c.mint);
    }
    const rewardMint = c.rewardMint || c.mint;
    if (this.get('reward_for') !== rewardMint) {
      const info = await rpc.getAccountInfoParsed(rewardMint);
      if (!info) throw new Error('REWARD_MINT not found on-chain');
      this.set('reward_decimals', info.data.parsed.info.decimals);
      this.set('reward_program', info.owner);
      this.set('reward_for', rewardMint);
    }
  }

  // Records real buys and sells of the token. Pages back to the last seen
  // signature so a busy minute is not skipped (up to 3 pages per run).
  async scanTrades(rpc, c) {
    const until = this.get('last_feed_sig') || undefined;
    let sigs = [];
    if (!until) {
      sigs = await rpc.getSignaturesForAddress(c.mint, { limit: 25 });
    } else {
      let before;
      for (let page = 0; page < 3; page++) {
        const batch = await rpc.getSignaturesForAddress(c.mint, { limit: 100, until, ...(before ? { before } : {}) });
        sigs.push(...batch);
        if (batch.length < 100) break;
        before = batch[batch.length - 1].signature;
      }
    }
    if (!sigs.length) return;
    const ignore = new Set();
    const s = this.signer();
    if (s) ignore.add(s.publicKey.toBase58());
    // Oldest first, and at most 30 transaction reads per run (subrequest budget).
    // If more are waiting, the rest are read on the next run.
    const fresh = sigs.filter((x) => !x.err).reverse();
    const take = fresh.slice(0, 30);
    for (const group of chunk(take, 5)) {
      const txs = await Promise.all(group.map((x) => rpc.getTransaction(x.signature).catch(() => null)));
      for (const tx of txs) {
        const ev = parseTrade(tx, c.mint, { ignore });
        if (ev) this.event(ev);
      }
    }
    const lastTaken = take.length < fresh.length ? take[take.length - 1].signature : sigs[0].signature;
    this.set('last_feed_sig', lastTaken);
  }

  // ---------- money transactions: record, send, settle exactly once ----------
  // Before sending, the signed transaction's signature is stored as pending.
  // It is applied to the ledger only when it is confirmed on-chain, whenever
  // that is. A transaction that timed out stays pending and blocks new money
  // moves until it is confirmed, fails, or its blockhash expires.
  async submit(rpc, kind, data, built) {
    this.set('pending', JSON.stringify({ kind, sig: built.sig, lastValid: built.lastValid, data, at: Date.now() }));
    const r = await sendSigned(rpc, built);
    if (r.state === 'failed') {
      this.set('pending', '');
      throw new Error(`${kind} tx ${built.sig} failed: ${JSON.stringify(r.err)}`);
    }
    if (r.state === 'pending') throw new Error(`${kind} tx ${built.sig} not confirmed yet, it will be settled next run`);
    const tx = await this.txWithRetry(rpc, built.sig);
    if (!tx) throw new Error(`${kind} tx ${built.sig} confirmed but not readable yet, it will be settled next run`);
    this.settle(kind, built.sig, tx, data);
    this.set('pending', '');
    return tx;
  }

  // true = nothing pending any more. false = still waiting on the network.
  async resolvePending(rpc) {
    const raw = this.get('pending');
    if (!raw) return true;
    const p = JSON.parse(raw);
    const st = await rpc.signatureStatus(p.sig);
    if (st && !st.err && (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized')) {
      const tx = await this.txWithRetry(rpc, p.sig);
      if (!tx) return false;
      this.settle(p.kind, p.sig, tx, p.data);
      this.set('pending', '');
      return true;
    }
    if (st && st.err) {
      this.set('pending', '');
      this.set('last_dropped', `${p.kind} ${p.sig} failed on-chain`);
      return true;
    }
    if ((await rpc.getBlockHeight()) > p.lastValid) {
      this.set('pending', '');
      this.set('last_dropped', `${p.kind} ${p.sig} expired without landing`);
      return true;
    }
    return false;
  }

  // Applies one confirmed transaction to the ledger. Amounts come from the
  // transaction itself, never from what was asked for.
  settle(kind, sig, tx, data) {
    const me = this.signer().publicKey.toBase58();
    const c = cfg(this.env);
    if (kind === 'claim') {
      // Net of the network fee, so the gas reserve never pays for claims.
      const gained = solDelta(tx, me);
      if (gained <= 0n) return;
      const toHolders = (gained * BigInt(c.shareBps)) / 10000n;
      const toBurn = (gained * BigInt(Math.min(c.burnBps, 10000 - c.shareBps))) / 10000n;
      this.addBig('fees_total_lamports', gained);
      this.addBig('holders_budget_lamports', toHolders);
      this.addBig('burn_budget_lamports', toBurn);
      this.addBig('ops_lamports', gained - toHolders - toBurn);
      this.event({ kind: 'claim', sig, wallet: me, lamports: gained, meta: { toHolders: toHolders.toString(), toBurn: toBurn.toString() } });
    } else if (kind === 'buyback') {
      const got = tokenDelta(tx, me, data.mint);
      const measured = -solDelta(tx, me);
      // Everything the swap cost (amount, network and priority fees, the vault's
      // own token account the first time) comes out of the holders' budget.
      const spent = measured > BigInt(data.spend) ? measured : BigInt(data.spend);
      this.addBig('holders_budget_lamports', -spent);
      this.addBig('sol_spent_lamports', spent);
      if (got > 0n) {
        this.addBig('reward_pool_raw', got);
        this.addBig('rewards_bought_raw', got);
        // Reward units per SOL at the last buy, used to price new token accounts.
        this.set('reward_rate', JSON.stringify({ raw: got.toString(), lamports: data.spend }));
      }
      this.event({ kind: 'buyback', sig, wallet: me, amountRaw: got, lamports: spent });
    } else if (kind === 'burnbuy') {
      const got = tokenDelta(tx, me, data.mint);
      const measured = -solDelta(tx, me);
      this.addBig('burn_budget_lamports', -(measured > BigInt(data.spend) ? measured : BigInt(data.spend)));
      this.addBig('burn_owed_lamports', BigInt(data.spend));
      if (got > 0n) this.addBig('burn_owed_raw', got);
      this.set('burn_buy_sig', sig);
    } else if (kind === 'burn') {
      const amount = BigInt(data.amount);
      this.addBig('burn_owed_raw', -amount);
      this.addBig('burned_raw', amount);
      this.addBig('burn_sol_lamports', BigInt(data.lamports));
      this.addBig('burn_owed_lamports', -BigInt(data.lamports));
      this.addBig('burn_budget_lamports', -BigInt(tx.meta?.fee || 0));
      this.event({ kind: 'burn', sig, wallet: me, amountRaw: amount, lamports: BigInt(data.lamports), meta: { buySig: data.buySig || null } });
    } else if (kind === 'payout') {
      const ts = Date.now();
      // Network fees and new holder token accounts are paid from the holders' budget.
      const cost = -solDelta(tx, me);
      if (cost > 0n) {
        this.addBig('holders_budget_lamports', -cost);
        this.addBig('payout_cost_lamports', cost);
      }
      for (const it of data.items) {
        const amount = BigInt(it.amount);
        const row = this.sql.exec('SELECT raw, paid_raw FROM owed WHERE wallet = ?', it.wallet).toArray()[0];
        const left = BigInt(row ? row.raw : '0') - amount;
        const paid = BigInt(row ? row.paid_raw : '0') + amount;
        this.sql.exec(
          `INSERT INTO owed (wallet, raw, paid_raw, payouts, last_paid) VALUES (?, ?, ?, 1, ?)
           ON CONFLICT(wallet) DO UPDATE SET raw = excluded.raw, paid_raw = excluded.paid_raw, payouts = payouts + 1, last_paid = excluded.last_paid`,
          it.wallet,
          (left > 0n ? left : 0n).toString(),
          paid.toString(),
          ts,
        );
        this.addBig('rewards_paid_raw', amount);
        this.event({ kind: 'payout', sig, wallet: it.wallet, amountRaw: amount, ts });
      }
    }
  }

  jupOpts(c, outputMint, lamports, slippageBps) {
    return { outputMint, lamports, slippageBps, apiBase: c.jupBase, apiKey: c.jupKey, priorityLevel: c.jupPriorityLevel, maxPriorityLamports: c.jupMaxPriorityLamports };
  }

  // Buys the vault's own token. Jupiter routes the Pump.fun curve and PumpSwap
  // with no swap fee; PumpPortal (which charges per trade) is the fallback.
  async buildOwnTokenBuy(rpc, signer, c, lamports) {
    try {
      return await buildJupiterTx(rpc, signer, this.jupOpts(c, c.mint, lamports, c.burnSlippageBps));
    } catch (e) {
      this.set('last_route_note', `${new Date().toISOString()} Jupiter: ${e.message}; used PumpPortal`);
      return buildBuyTx(rpc, signer, { mint: c.mint, sol: Number(lamports) / LAMPORTS, slippage: c.slippage, priorityFee: c.priorityFee });
    }
  }

  // Returns false when the cycle should stop (something is still pending).
  async cycleStage(rpc, c, stage) {
    if (!(await this.resolvePending(rpc))) throw new Error('waiting for an earlier transaction to confirm or expire');
    const signer = this.signer();
    const me = signer.publicKey.toBase58();
    const reserve = BigInt(Math.round(c.gasReserveSol * LAMPORTS));
    const minSpend = BigInt(Math.round(c.minCycleSol * LAMPORTS));
    const rewardMint = c.rewardMint || c.mint;

    if (stage === 'claim') {
      // 1. Claim creator fees on a slower timer (each claim costs a network fee).
      if (Date.now() - Number(this.get('last_claim_at', '0')) >= c.claimEveryMinutes * 60000 - 5000) {
        this.set('last_claim_at', Date.now());
        try {
          await this.submit(rpc, 'claim', {}, await buildClaimTx(rpc, signer, { priorityFee: c.priorityFee }));
          this.set('last_claim_error', '');
        } catch (e) {
          // "nothing to claim" shows up as a failed simulation; that is normal.
          this.set('last_claim_error', `${new Date().toISOString()} ${e.message}`);
          if (this.get('pending')) return false;
        }
      }
      // 2. Spend the holders' budget on the reward token.
      const balance = BigInt(await rpc.getBalance(me));
      const budget = this.big('holders_budget_lamports');
      const spendable = balance > reserve ? balance - reserve : 0n;
      // Rent for holders' first reward token accounts stays as SOL for the pay stage.
      const spend = swapSpend({ budget, spendable, rentWanted: this.big('rent_wanted_lamports') });
      if (spend >= minSpend) {
        const built = c.rewardMint
          ? await buildJupiterTx(rpc, signer, this.jupOpts(c, c.rewardMint, spend, c.rewardSlippageBps))
          : await this.buildOwnTokenBuy(rpc, signer, c, spend);
        await this.submit(rpc, 'buyback', { spend: spend.toString(), mint: rewardMint }, built);
      }
      return true;
    }

    if (stage === 'burn') {
      // 2b. Buy the vault token with the burn budget.
      const burnBudget = this.big('burn_budget_lamports');
      const bal = BigInt(await rpc.getBalance(me));
      const avail = bal > reserve ? bal - reserve : 0n;
      const burnSpend = burnBudget < avail ? burnBudget : avail;
      if (burnSpend >= minSpend) {
        const built = await this.buildOwnTokenBuy(rpc, signer, c, burnSpend);
        await this.submit(rpc, 'burnbuy', { spend: burnSpend.toString(), mint: c.mint }, built);
      }
      // 2c. Burn exactly what was bought for burning (also retries an earlier failed burn).
      const owed = this.big('burn_owed_raw');
      if (owed > 0n) {
        const built = await buildBurnTx(rpc, signer, {
          mint: c.mint,
          program: this.get('mint_program', TOKEN_PROGRAM),
          amount: owed,
          decimals: Number(this.get('mint_decimals', '6')),
          microLamports: c.microLamports,
        });
        await this.submit(rpc, 'burn', { amount: owed.toString(), lamports: this.big('burn_owed_lamports').toString(), buySig: this.get('burn_buy_sig') }, built);
      }
      return true;
    }

    // stage === 'pay'
    // 3. Snapshot holders and credit each one's share of the reward pool.
    const decimals = Number(this.get('mint_decimals', '6'));
    const snap = await this.snapshotHolders(rpc, c);

    const pool = this.big('reward_pool_raw');
    const { shares, dust } = allocate(pool, snap.holders, snap.total);
    for (const [wallet, s] of shares) {
      const row = this.sql.exec('SELECT raw FROM owed WHERE wallet = ?', wallet).toArray()[0];
      const next = (row ? BigInt(row.raw) : 0n) + s;
      this.sql.exec('INSERT INTO owed (wallet, raw) VALUES (?, ?) ON CONFLICT(wallet) DO UPDATE SET raw = excluded.raw', wallet, next.toString());
    }
    this.set('reward_pool_raw', dust.toString());

    // 4. Pay out, never more than the treasury actually holds (minus tokens
    // still waiting to be burned, when the reward is the vault token itself).
    const rewardDecimals = Number(this.get('reward_decimals', String(decimals)));
    const rewardProgram = this.get('reward_program', TOKEN_PROGRAM);
    const owedMap = new Map(this.sql.exec('SELECT wallet, raw FROM owed').toArray().map((r) => [r.wallet, BigInt(r.raw)]));
    let picks = selectPayouts(owedMap, toRaw(c.minPayout, rewardDecimals), c.maxRecipients);
    if (!picks.length) {
      this.recordCycle(snap);
      return true;
    }
    let held = await this.rewardBalance(rpc, me, rewardMint);
    if (!c.rewardMint) held -= this.big('burn_owed_raw');
    const exists = await this.rewardAccountsExist(rpc, picks, rewardMint, rewardProgram);
    picks = this.skipCostlyNewAccounts(c, picks, exists);
    picks = picks.filter((p) => {
      if (p.amount > held) return false;
      held -= p.amount;
      return true;
    });
    // Opening a holder's first token account costs rent. Open only as many as the
    // wallet can pay for while keeping half the gas reserve, so claims and fees
    // always have SOL. The rest stay owed; the next swap holds their rent back.
    const floor = BigInt(Math.round(c.gasReserveSol * LAMPORTS)) / 2n;
    const fit = fitNewAccounts(picks, exists, BigInt(await rpc.getBalance(me)) - floor, ACCOUNT_RENT);
    picks = fit.picks;
    this.set('rent_wanted_lamports', fit.wanted.toString());
    for (const batch of chunk(picks, c.perTx)) {
      const items = batch.map((it) => ({ wallet: it.wallet, amount: it.amount.toString() }));
      const built = await buildPayoutTx(rpc, signer, { rewardMint, rewardProgram, decimals: rewardDecimals, items, microLamports: c.microLamports });
      await this.submit(rpc, 'payout', { items }, built);
      await sleep(300);
    }
    this.recordCycle(snap);
    return true;
  }

  // Reads every token account of the mint, keeps real wallets above the
  // minimum, and tracks when each wallet first appeared and how its rank moved.
  async snapshotHolders(rpc, c) {
    const decimals = Number(this.get('mint_decimals', '6'));
    const accounts = await rpc.getHolderAccounts(c.mint, this.get('mint_program', TOKEN_PROGRAM));
    const signer = this.signer();
    const exclude = new Set([...c.exclude, ...(signer ? [signer.publicKey.toBase58()] : [])]);
    const snap = buildSnapshot(accounts, { toBase58, isEligibleOwner: isOnCurveAddress, exclude, minHoldRaw: toRaw(c.minHold, decimals) });
    const before = new Set(this.sql.exec('SELECT wallet FROM holders').toArray().map((r) => r.wallet));
    const now = Date.now();
    const ranked = [...snap.holders].sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
    this.sql.exec('DELETE FROM holders');
    let joined = 0;
    ranked.forEach((h, i) => {
      this.sql.exec('INSERT INTO holders (wallet, amount) VALUES (?, ?)', h.owner, h.amount.toString());
      if (!before.has(h.owner)) joined++;
      this.sql.exec(
        `INSERT INTO holder_seen (wallet, first_seen, last_seen, rank, prev_rank) VALUES (?, ?, ?, ?, NULL)
         ON CONFLICT(wallet) DO UPDATE SET last_seen = excluded.last_seen, prev_rank = holder_seen.rank, rank = excluded.rank`,
        h.owner,
        now,
        now,
        i + 1,
      );
    });
    const kept = new Set(ranked.map((h) => h.owner));
    let left = 0;
    for (const w of before) if (!kept.has(w)) left++;
    // A wallet that dropped out starts its hold time again if it comes back.
    this.sql.exec('DELETE FROM holder_seen WHERE last_seen < ?', now);
    this.set('holders_total_raw', snap.total.toString());
    this.set('holders_count', ranked.length);
    this.set('snapshot_at', now);
    this.set('snap_joined', joined);
    this.set('snap_left', left);
    return { ...snap, holders: ranked, joined, left };
  }

  // One row per finished cycle: what was paid, burned and collected since the last one.
  recordCycle(snap) {
    const start = Number(this.get('last_cycle_at', '0')) || Date.now();
    const paid = this.sql.exec("SELECT amount_raw, wallet, sig FROM events WHERE kind = 'payout' AND ts >= ?", start).toArray();
    const paidRaw = paid.reduce((a, r) => a + BigInt(r.amount_raw || '0'), 0n);
    const recipients = new Set(paid.map((r) => r.wallet)).size;
    const sigs = [...new Set(paid.map((r) => r.sig))].slice(0, 12);
    const burned = this.big('burned_raw');
    const fees = this.big('fees_total_lamports');
    const burnedSince = burned - BigInt(this.get('cycle_mark_burned', '0'));
    const feesSince = fees - BigInt(this.get('cycle_mark_fees', '0'));
    this.set('cycle_mark_burned', burned.toString());
    this.set('cycle_mark_fees', fees.toString());
    this.sql.exec(
      'INSERT INTO cycles (ts, holders, joined, left_n, paid_raw, recipients, burned_raw, fees_lamports, sigs) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      Date.now(),
      snap.holders.length,
      snap.joined || 0,
      snap.left || 0,
      paidRaw.toString(),
      recipients,
      (burnedSince > 0n ? burnedSince : 0n).toString(),
      (feesSince > 0n ? feesSince : 0n).toString(),
      JSON.stringify(sigs),
    );
    this.sql.exec('DELETE FROM cycles WHERE id <= (SELECT MAX(id) - 2000 FROM cycles)');
  }

  // Drops payouts to wallets that have no reward token account yet when the
  // amount is worth less than opening one costs. They stay owed and are paid
  // once their balance has grown. Unknown price (no buy yet) = no filter.
  skipCostlyNewAccounts(c, picks, exists) {
    if (!picks.length || !c.newAccountRentX || !c.rewardMint) return picks;
    let rate;
    try {
      rate = JSON.parse(this.get('reward_rate') || 'null');
    } catch {
      rate = null;
    }
    if (!rate || BigInt(rate.lamports) <= 0n) return picks;
    const minRaw = (ACCOUNT_RENT * BigInt(rate.raw) * BigInt(Math.round(c.newAccountRentX * 100))) / (BigInt(rate.lamports) * 100n);
    return picks.filter((p) => p.amount >= minRaw || exists.has(p.wallet));
  }

  // Which of these wallets already have a reward token account.
  async rewardAccountsExist(rpc, picks, rewardMint, rewardProgram) {
    const exists = new Set();
    for (const group of chunk(picks, 100)) {
      const atas = group.map((p) => ataAddress(rewardMint, p.wallet, rewardProgram));
      const r = await rpc.call('getMultipleAccounts', [atas, { encoding: 'base64', dataSlice: { offset: 0, length: 0 }, commitment: 'confirmed' }]);
      r.value.forEach((acc, i) => acc && exists.add(group[i].wallet));
    }
    return exists;
  }

  async rewardBalance(rpc, owner, mint) {
    const r = await rpc.call('getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
    return r.value.reduce((a, acc) => a + BigInt(acc.account.data.parsed.info.tokenAmount.amount), 0n);
  }

  // Token balance gained since `before`, never negative.
  async gainSince(rpc, owner, mint, before) {
    const after = await this.rewardBalance(rpc, owner, mint);
    return after > before ? after - before : 0n;
  }

  async txWithRetry(rpc, sig) {
    for (let i = 0; i < 4; i++) {
      const tx = await rpc.getTransaction(sig).catch(() => null);
      if (tx) return tx;
      await sleep(2000);
    }
    return null;
  }

  // ---------- read API ----------
  async market() {
    const c = cfg(this.env);
    if (!c.mint) return null;
    if (this.priceCache && Date.now() - this.priceCache.at < 30000) return this.priceCache.data;
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${c.mint}`);
      const j = await res.json();
      const pairs = (j.pairs || []).filter((p) => p.chainId === 'solana');
      pairs.sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0));
      const p = pairs[0];
      const data = p
        ? {
            priceUsd: Number(p.priceUsd || 0),
            priceNative: Number(p.priceNative || 0),
            marketCap: p.marketCap || p.fdv || null,
            volume24h: p.volume?.h24 || 0,
            change24h: p.priceChange?.h24 || 0,
            liquidityUsd: p.liquidity?.usd || 0,
            dex: p.dexId,
            pairUrl: p.url,
          }
        : null;
      this.priceCache = { at: Date.now(), data };
      return data;
    } catch {
      return this.priceCache?.data || null;
    }
  }

  async stats() {
    const c = cfg(this.env);
    const decimals = Number(this.get('mint_decimals', '6'));
    const rd = Number(this.get('reward_decimals', String(decimals)));
    const day = Date.now() - 86400000;
    const paid24 = this.sql
      .exec("SELECT amount_raw FROM events WHERE kind = 'payout' AND ts >= ?", day)
      .toArray()
      .reduce((a, r) => a + BigInt(r.amount_raw || '0'), 0n);
    const trades24 = this.sql.exec("SELECT COUNT(*) AS n FROM events WHERE kind IN ('buy','sell') AND ts >= ?", day).toArray()[0].n;
    const paidWallets = this.sql.exec("SELECT COUNT(*) AS n FROM owed WHERE CAST(paid_raw AS INTEGER) > 0").toArray()[0].n;
    const lastCycle = Number(this.get('last_cycle_at', '0'));
    return {
      config: this.publicConfig(),
      market: await this.market(),
      holders: Number(this.get('holders_count', '0')),
      holdersTotal: fromRaw(this.big('holders_total_raw'), decimals),
      feesTotalSol: Number(this.big('fees_total_lamports')) / LAMPORTS,
      opsSol: Number(this.big('ops_lamports')) / LAMPORTS,
      pendingBudgetSol: Math.max(0, Number(this.big('holders_budget_lamports')) / LAMPORTS),
      solSpent: Number(this.big('sol_spent_lamports')) / LAMPORTS,
      rewardsBought: fromRaw(this.big('rewards_bought_raw'), rd),
      rewardsPaid: fromRaw(this.big('rewards_paid_raw'), rd),
      rewardsPaid24h: fromRaw(paid24, rd),
      burned: fromRaw(this.big('burned_raw'), decimals),
      burnSol: Number(this.big('burn_sol_lamports')) / LAMPORTS,
      burnPendingSol: Math.max(0, Number(this.big('burn_budget_lamports')) / LAMPORTS),
      rewardPool: fromRaw(this.big('reward_pool_raw'), rd),
      paidWallets,
      trades24h: trades24,
      lastCycleAt: lastCycle || null,
      nextCycleAt: lastCycle ? lastCycle + c.cycleMinutes * 60000 : null,
      snapshotAt: Number(this.get('snapshot_at', '0')) || null,
      lastError: this.get('last_error') ? 'The last cycle hit an error. The team can see details in /admin.' : null,
      pending: Boolean(this.get('pending')),
      burnOwed: fromRaw(this.big('burn_owed_raw'), decimals),
      community: this.id.community(),
    };
  }

  feed(url) {
    const limit = Math.min(100, Math.max(1, Math.floor(Number(url.searchParams.get('limit'))) || 40));
    const after = Math.max(0, Math.floor(Number(url.searchParams.get('after')) || 0));
    const kinds = (url.searchParams.get('kinds') || 'buy,sell,claim,topup,buyback,burn,payout').split(',').filter((k) => /^[a-z]+$/.test(k));
    const placeholders = kinds.map(() => '?').join(',');
    const rows = this.sql
      .exec(`SELECT * FROM events WHERE id > ? AND kind IN (${placeholders}) ORDER BY id DESC LIMIT ?`, after, ...kinds, limit)
      .toArray();
    return {
      profiles: this.id.names(rows.map((r) => r.wallet)),
      events: rows.map((r) => ({
        id: r.id,
        ts: r.ts,
        kind: r.kind,
        sig: r.sig,
        wallet: r.wallet,
        amountRaw: r.amount_raw,
        lamports: r.lamports,
        meta: r.meta ? JSON.parse(r.meta) : null,
      })),
    };
  }

  // Every eligible holder, biggest first, with hold time and rank movement.
  holdersList(url) {
    const limit = Math.min(1000, Math.max(1, Math.floor(Number(url.searchParams.get('limit'))) || 500));
    const decimals = Number(this.get('mint_decimals', '6'));
    const rd = Number(this.get('reward_decimals', String(decimals)));
    const total = this.big('holders_total_raw');
    const rows = this.sql
      .exec(
        `SELECT h.wallet, h.amount, s.first_seen, s.rank, s.prev_rank, o.paid_raw
         FROM holders h LEFT JOIN holder_seen s ON s.wallet = h.wallet LEFT JOIN owed o ON o.wallet = h.wallet
         ORDER BY CAST(h.amount AS INTEGER) DESC LIMIT ?`,
        limit,
      )
      .toArray();
    return {
      snapshotAt: Number(this.get('snapshot_at', '0')) || null,
      count: Number(this.get('holders_count', '0')),
      joined: Number(this.get('snap_joined', '0')),
      left: Number(this.get('snap_left', '0')),
      total: fromRaw(total, decimals),
      profiles: this.id.names(rows.map((r) => r.wallet)),
      holders: rows.map((r, i) => ({
        wallet: r.wallet,
        rank: i + 1,
        prevRank: r.prev_rank || null,
        amount: fromRaw(r.amount, decimals),
        pct: total > 0n ? Number((BigInt(r.amount) * 1000000n) / total) / 10000 : 0,
        since: r.first_seen || null,
        paid: fromRaw(r.paid_raw || '0', rd),
      })),
    };
  }

  // The payout history, newest first.
  cyclesList(url) {
    const limit = Math.min(200, Math.max(1, Math.floor(Number(url.searchParams.get('limit'))) || 48));
    const decimals = Number(this.get('mint_decimals', '6'));
    const rd = Number(this.get('reward_decimals', String(decimals)));
    const c = cfg(this.env);
    const rows = this.sql.exec('SELECT * FROM cycles ORDER BY id DESC LIMIT ?', limit).toArray();
    return {
      rewardSymbol: c.rewardSymbol || c.tokenSymbol,
      cycles: rows.map((r) => ({
        id: r.id,
        ts: r.ts,
        holders: r.holders,
        joined: r.joined,
        left: r.left_n,
        paid: fromRaw(r.paid_raw, rd),
        recipients: r.recipients,
        burned: fromRaw(r.burned_raw, decimals),
        feesSol: Number(BigInt(r.fees_lamports)) / LAMPORTS,
        sigs: r.sigs ? JSON.parse(r.sigs) : [],
      })),
    };
  }

  leaderboard() {
    const rows = this.sql
      .exec('SELECT wallet, paid_raw, payouts, last_paid FROM owed WHERE CAST(paid_raw AS INTEGER) > 0 ORDER BY CAST(paid_raw AS INTEGER) DESC LIMIT 50')
      .toArray();
    const wallets = rows.map((r) => r.wallet);
    return { top: rows, profiles: this.id.names(wallets), streaks: this.id.streaks(wallets.slice(0, 20)) };
  }

  // Longest run of payouts without a sell, among wallets that have been paid.
  diamonds() {
    const rows = this.sql.exec('SELECT wallet FROM owed WHERE payouts > 0 ORDER BY payouts DESC LIMIT 200').toArray();
    const st = this.id.streaks(rows.map((r) => r.wallet));
    const top = Object.entries(st)
      .map(([wallet, v]) => ({ wallet, ...v }))
      .filter((r) => r.streak > 0)
      .sort((a, b) => b.streak - a.streak)
      .slice(0, 20);
    return { top, profiles: this.id.names(top.map((r) => r.wallet)) };
  }

  holder(wallet) {
    if (!isValidAddress(wallet)) return { error: 'invalid wallet' };
    const decimals = Number(this.get('mint_decimals', '6'));
    const rd = Number(this.get('reward_decimals', String(decimals)));
    const h = this.sql.exec('SELECT amount FROM holders WHERE wallet = ?', wallet).toArray()[0];
    const o = this.sql.exec('SELECT * FROM owed WHERE wallet = ?', wallet).toArray()[0];
    const total = this.big('holders_total_raw');
    const amount = h ? BigInt(h.amount) : 0n;
    const payouts = this.sql
      .exec("SELECT ts, sig, amount_raw FROM events WHERE kind = 'payout' AND wallet = ? ORDER BY id DESC LIMIT 25", wallet)
      .toArray();
    return {
      wallet,
      eligible: Boolean(h),
      balance: fromRaw(amount, decimals),
      sharePct: total > 0n ? Number((amount * 1000000n) / total) / 10000 : 0,
      owed: fromRaw(o ? o.raw : '0', rd),
      paid: fromRaw(o ? o.paid_raw : '0', rd),
      payoutCount: o ? o.payouts : 0,
      lastPaid: o ? o.last_paid : null,
      payouts: payouts.map((p) => ({ ts: p.ts, sig: p.sig, amount: fromRaw(p.amount_raw, rd) })),
      snapshotAt: Number(this.get('snapshot_at', '0')) || null,
    };
  }

  async admin(req, p) {
    const key = this.env.ADMIN_KEY;
    if (!key || !sameKey(req.headers.get('x-admin-key') || '', key)) return json({ error: 'unauthorized' }, 401);
    if (p === '/api/admin/status') {
      return json({
        lastError: this.get('last_error'),
        lastClaimError: this.get('last_claim_error'),
        lastFeedError: this.get('last_feed_error'),
        lastDropped: this.get('last_dropped'),
        lastRouteNote: this.get('last_route_note'),
        pending: this.get('pending') ? JSON.parse(this.get('pending')) : null,
        burnOwed: this.get('burn_owed_raw', '0'),
        rentWantedSol: Number(this.big('rent_wanted_lamports')) / LAMPORTS,
        stats: await this.stats(),
      });
    }
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
    if (p === '/api/admin/pause') {
      const body = await req.json().catch(() => ({}));
      this.set('paused', body.paused ? '1' : '0');
      return json({ paused: body.paused ? true : false });
    }
    if (p === '/api/admin/run') {
      if (this.running) return json({ ok: false, error: 'a run is already in progress, try again in a minute' }, 409);
      this.set('last_cycle_at', '0');
      await this.tick('all');
      return json({ ok: true, lastError: this.get('last_error'), lastClaimError: this.get('last_claim_error'), pending: this.get('pending') || null });
    }
    // Books SOL that was sent to the vault wallet by hand (not creator fees)
    // into the next cycle: by default into holder rewards, or into the burn.
    // Only SOL the wallet holds beyond everything already booked can be used.
    if (p === '/api/admin/topup') {
      const body = await req.json().catch(() => ({}));
      const lamports = BigInt(Math.round(Number(body.sol) * LAMPORTS) || 0);
      if (lamports <= 0n) return json({ error: 'send { "sol": <amount> }' }, 400);
      const signer = this.signer();
      if (!signer) return json({ error: 'TREASURY_SECRET_KEY is not set' }, 400);
      const c = cfg(this.env);
      const rpc = this.makeRpc ? this.makeRpc() : new Rpc(this.env.SOLANA_RPC_URL);
      const balance = BigInt(await rpc.getBalance(signer.publicKey.toBase58()));
      const booked = this.big('holders_budget_lamports') + this.big('burn_budget_lamports') + BigInt(Math.round(c.gasReserveSol * LAMPORTS));
      const free = balance > booked ? balance - booked : 0n;
      if (lamports > free) return json({ error: `only ${Number(free) / LAMPORTS} SOL in the vault wallet is not already booked` }, 400);
      const toBurn = body.to === 'burn';
      this.addBig(toBurn ? 'burn_budget_lamports' : 'holders_budget_lamports', lamports);
      this.addBig('topup_lamports', lamports);
      this.event({ kind: 'topup', sig: null, wallet: signer.publicKey.toBase58(), lamports, meta: { to: toBurn ? 'burn' : 'holders' } });
      return json({ ok: true, booked: Number(lamports) / LAMPORTS, to: toBurn ? 'burn' : 'holders' });
    }
    return json({ error: 'not found' }, 404);
  }
}


