// Privacy vault backend: a Cloudflare Worker plus one Durable Object that
// owns the ledger. Every minute it records real trades of the token. Every
// CYCLE_MINUTES it claims pump.fun creator fees, buys the reward token with
// the holders' share, snapshots holders and pays them pro rata on-chain.
// Nothing here is simulated: every feed row has a Solana signature.

import { Rpc, TOKEN_PROGRAM, sleep } from './rpc.js';
import { allocate, buildSnapshot, chunk, fromRaw, parseTrade, selectPayouts, solDelta, toRaw, tokenDelta } from './engine.js';
import {
  buyOwnToken,
  collectCreatorFees,
  isOnCurveAddress,
  isValidAddress,
  loadKeypair,
  sendPayoutBatch,
  swapViaJupiter,
  toBase58,
} from './solana.js';

const LAMPORTS = 1_000_000_000;

function cfg(env) {
  const num = (v, d) => (v === undefined || v === '' ? d : Number(v));
  return {
    mint: (env.TOKEN_MINT || '').trim(),
    rewardMint: (env.REWARD_MINT || '').trim(), // empty = buy back the vault token itself
    tokenSymbol: env.TOKEN_SYMBOL || 'VAULT',
    rewardSymbol: env.REWARD_SYMBOL || '',
    shareBps: Math.min(10000, Math.max(0, num(env.REWARD_SHARE_BPS, 8000))),
    cycleMinutes: Math.max(1, num(env.CYCLE_MINUTES, 5)),
    claimEveryMinutes: Math.max(1, num(env.CLAIM_EVERY_MINUTES, 30)),
    gasReserveSol: num(env.GAS_RESERVE_SOL, 0.05),
    minCycleSol: num(env.MIN_CYCLE_SOL, 0.02),
    minHold: env.MIN_HOLD_TOKENS || '100000',
    minPayout: env.MIN_PAYOUT || '0',
    maxRecipients: Math.max(1, num(env.MAX_RECIPIENTS_PER_CYCLE, 60)),
    perTx: Math.max(1, Math.min(10, num(env.TRANSFERS_PER_TX, 8))),
    slippage: num(env.SLIPPAGE_PCT, 15),
    priorityFee: num(env.PRIORITY_FEE_SOL, 0.00005),
    microLamports: num(env.PRIORITY_MICROLAMPORTS, 50000),
    exclude: new Set((env.EXCLUDE_WALLETS || '').split(',').map((s) => s.trim()).filter(Boolean)),
    jupBase: env.JUPITER_API_BASE || 'https://lite-api.jup.ag/swap/v1',
    jupKey: env.JUPITER_API_KEY || '',
  };
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,x-admin-key',
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
  async scheduled(_event, env, ctx) {
    const stub = env.VAULT.get(env.VAULT.idFromName('main'));
    ctx.waitUntil(stub.fetch('https://vault/internal/tick', { method: 'POST' }));
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
    `);
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
        await this.tick();
        return json({ ok: true });
      }
      if (p === '/api/config') return json(this.publicConfig());
      if (p === '/api/stats') return json(await this.stats());
      if (p === '/api/feed') return json(this.feed(url));
      if (p === '/api/leaderboard') return json(this.leaderboard());
      if (p.startsWith('/api/holder/')) return json(this.holder(decodeURIComponent(p.slice('/api/holder/'.length))));
      if (p.startsWith('/api/admin/')) return this.admin(req, p);
      return json({ error: 'not found' }, 404);
    } catch (e) {
      return json({ error: String(e.message || e) }, 500);
    }
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
  async tick() {
    if (this.running) return;
    this.running = true;
    try {
      const c = cfg(this.env);
      if (!c.mint || !this.env.SOLANA_RPC_URL) return;
      const rpc = this.makeRpc ? this.makeRpc() : new Rpc(this.env.SOLANA_RPC_URL);
      await this.ensureMintInfo(rpc, c);
      try {
        await this.scanTrades(rpc, c);
      } catch (e) {
        this.set('last_feed_error', `${new Date().toISOString()} ${e.message}`);
      }
      const now = Date.now();
      const lastCycle = Number(this.get('last_cycle_at', '0'));
      if (this.get('paused') === '1' || !this.signer()) return;
      if (now - lastCycle < c.cycleMinutes * 60000 - 5000) return;
      this.set('last_cycle_at', now);
      try {
        await this.cycle(rpc, c);
        this.set('last_error', '');
      } catch (e) {
        this.set('last_error', `${new Date().toISOString()} ${e.message}`);
      }
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

  // Records real buys and sells of the token, newest signatures first.
  async scanTrades(rpc, c) {
    const until = this.get('last_feed_sig') || undefined;
    const sigs = await rpc.getSignaturesForAddress(c.mint, { limit: 40, ...(until ? { until } : {}) });
    if (!sigs.length) return;
    const ignore = new Set();
    const s = this.signer();
    if (s) ignore.add(s.publicKey.toBase58());
    const fresh = sigs.filter((x) => !x.err).reverse();
    for (const group of chunk(fresh, 4)) {
      const txs = await Promise.all(group.map((x) => rpc.getTransaction(x.signature).catch(() => null)));
      for (const tx of txs) {
        const ev = parseTrade(tx, c.mint, { ignore });
        if (ev) this.event(ev);
      }
    }
    this.set('last_feed_sig', sigs[0].signature);
  }

  async cycle(rpc, c) {
    const signer = this.signer();
    const me = signer.publicKey.toBase58();
    const now = Date.now();

    // 1. Claim creator fees on a slower timer (each claim costs a network fee).
    if (now - Number(this.get('last_claim_at', '0')) >= c.claimEveryMinutes * 60000 - 5000) {
      this.set('last_claim_at', now);
      try {
        const sig = await collectCreatorFees(rpc, signer, { priorityFee: c.priorityFee });
        const tx = await this.txWithRetry(rpc, sig);
        const gained = tx ? solDelta(tx, me, { addBackFee: true }) : 0n;
        if (gained > 0n) {
          const toHolders = (gained * BigInt(c.shareBps)) / 10000n;
          this.addBig('fees_total_lamports', gained);
          this.addBig('holders_budget_lamports', toHolders);
          this.addBig('ops_lamports', gained - toHolders);
          this.event({ kind: 'claim', sig, wallet: me, lamports: gained, meta: { toHolders: toHolders.toString() } });
        }
      } catch (e) {
        // "nothing to claim" shows up as a failed simulation; that is normal.
        this.set('last_claim_error', `${new Date().toISOString()} ${e.message}`);
      }
    }

    // 2. Spend the holders' budget on the reward token.
    const balance = BigInt(await rpc.getBalance(me));
    const reserve = BigInt(Math.round(c.gasReserveSol * LAMPORTS));
    const budget = this.big('holders_budget_lamports');
    const spendable = balance > reserve ? balance - reserve : 0n;
    const spend = budget < spendable ? budget : spendable;
    const rewardMint = c.rewardMint || c.mint;
    if (spend >= BigInt(Math.round(c.minCycleSol * LAMPORTS))) {
      const sol = Number(spend) / LAMPORTS;
      const sig = c.rewardMint
        ? await swapViaJupiter(rpc, signer, { outputMint: c.rewardMint, lamports: spend, slippageBps: Math.round(c.slippage * 100), apiBase: c.jupBase, apiKey: c.jupKey })
        : await buyOwnToken(rpc, signer, { mint: c.mint, sol, slippage: c.slippage, priorityFee: c.priorityFee });
      const tx = await this.txWithRetry(rpc, sig);
      const got = tx ? tokenDelta(tx, me, rewardMint) : 0n;
      const spent = tx ? -solDelta(tx, me) : spend;
      this.addBig('holders_budget_lamports', -spend);
      this.addBig('sol_spent_lamports', spent);
      if (got > 0n) {
        this.addBig('reward_pool_raw', got);
        this.addBig('rewards_bought_raw', got);
      }
      this.event({ kind: 'buyback', sig, wallet: me, amountRaw: got, lamports: spent });
    }

    // 3. Snapshot holders and credit each one's share of the reward pool.
    const decimals = Number(this.get('mint_decimals', '6'));
    const accounts = await rpc.getHolderAccounts(c.mint, this.get('mint_program', TOKEN_PROGRAM));
    const exclude = new Set([...c.exclude, me]);
    const snap = buildSnapshot(accounts, { toBase58, isEligibleOwner: isOnCurveAddress, exclude, minHoldRaw: toRaw(c.minHold, decimals) });
    this.sql.exec('DELETE FROM holders');
    for (const h of snap.holders) this.sql.exec('INSERT INTO holders (wallet, amount) VALUES (?, ?)', h.owner, h.amount.toString());
    this.set('holders_total_raw', snap.total.toString());
    this.set('holders_count', snap.holders.length);
    this.set('snapshot_at', Date.now());

    const pool = this.big('reward_pool_raw');
    const { shares, dust } = allocate(pool, snap.holders, snap.total);
    for (const [wallet, s] of shares) {
      const row = this.sql.exec('SELECT raw FROM owed WHERE wallet = ?', wallet).toArray()[0];
      const next = (row ? BigInt(row.raw) : 0n) + s;
      this.sql.exec(
        'INSERT INTO owed (wallet, raw) VALUES (?, ?) ON CONFLICT(wallet) DO UPDATE SET raw = excluded.raw',
        wallet,
        next.toString(),
      );
    }
    this.set('reward_pool_raw', dust.toString());

    // 4. Pay out, never more than the treasury actually holds.
    const rewardDecimals = Number(this.get('reward_decimals', String(decimals)));
    const rewardProgram = this.get('reward_program', TOKEN_PROGRAM);
    const owedMap = new Map(this.sql.exec('SELECT wallet, raw FROM owed').toArray().map((r) => [r.wallet, BigInt(r.raw)]));
    let picks = selectPayouts(owedMap, toRaw(c.minPayout, rewardDecimals), c.maxRecipients);
    if (!picks.length) return;
    let held = await this.rewardBalance(rpc, me, rewardMint);
    picks = picks.filter((p) => {
      if (p.amount > held) return false;
      held -= p.amount;
      return true;
    });
    for (const batch of chunk(picks, c.perTx)) {
      const sig = await sendPayoutBatch(rpc, signer, {
        rewardMint,
        rewardProgram,
        decimals: rewardDecimals,
        items: batch,
        microLamports: c.microLamports,
      });
      const ts = Date.now();
      for (const it of batch) {
        const row = this.sql.exec('SELECT raw, paid_raw FROM owed WHERE wallet = ?', it.wallet).toArray()[0];
        const left = BigInt(row.raw) - it.amount;
        const paid = BigInt(row.paid_raw) + it.amount;
        this.sql.exec(
          'UPDATE owed SET raw = ?, paid_raw = ?, payouts = payouts + 1, last_paid = ? WHERE wallet = ?',
          (left > 0n ? left : 0n).toString(),
          paid.toString(),
          ts,
          it.wallet,
        );
        this.addBig('rewards_paid_raw', it.amount);
        this.event({ kind: 'payout', sig, wallet: it.wallet, amountRaw: it.amount, ts });
      }
      await sleep(300);
    }
  }

  async rewardBalance(rpc, owner, mint) {
    const r = await rpc.call('getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed', commitment: 'confirmed' }]);
    return r.value.reduce((a, acc) => a + BigInt(acc.account.data.parsed.info.tokenAmount.amount), 0n);
  }

  async txWithRetry(rpc, sig) {
    for (let i = 0; i < 6; i++) {
      const tx = await rpc.getTransaction(sig).catch(() => null);
      if (tx) return tx;
      await sleep(1500);
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
      pendingBudgetSol: Number(this.big('holders_budget_lamports')) / LAMPORTS,
      solSpent: Number(this.big('sol_spent_lamports')) / LAMPORTS,
      rewardsBought: fromRaw(this.big('rewards_bought_raw'), rd),
      rewardsPaid: fromRaw(this.big('rewards_paid_raw'), rd),
      rewardsPaid24h: fromRaw(paid24, rd),
      rewardPool: fromRaw(this.big('reward_pool_raw'), rd),
      paidWallets,
      trades24h: trades24,
      lastCycleAt: lastCycle || null,
      nextCycleAt: lastCycle ? lastCycle + c.cycleMinutes * 60000 : null,
      snapshotAt: Number(this.get('snapshot_at', '0')) || null,
      lastError: this.get('last_error') || null,
    };
  }

  feed(url) {
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 40)));
    const after = Number(url.searchParams.get('after') || 0);
    const kinds = (url.searchParams.get('kinds') || 'buy,sell,claim,buyback,payout').split(',').filter((k) => /^[a-z]+$/.test(k));
    const placeholders = kinds.map(() => '?').join(',');
    const rows = this.sql
      .exec(`SELECT * FROM events WHERE id > ? AND kind IN (${placeholders}) ORDER BY id DESC LIMIT ?`, after, ...kinds, limit)
      .toArray();
    return {
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

  leaderboard() {
    const rows = this.sql
      .exec('SELECT wallet, paid_raw, payouts, last_paid FROM owed WHERE CAST(paid_raw AS INTEGER) > 0 ORDER BY CAST(paid_raw AS INTEGER) DESC LIMIT 50')
      .toArray();
    return { top: rows };
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
    if (!key || req.headers.get('x-admin-key') !== key) return json({ error: 'unauthorized' }, 401);
    if (p === '/api/admin/status') {
      return json({
        lastError: this.get('last_error'),
        lastClaimError: this.get('last_claim_error'),
        lastFeedError: this.get('last_feed_error'),
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
      this.set('last_cycle_at', '0');
      await this.tick();
      return json({ ok: true, lastError: this.get('last_error') });
    }
    return json({ error: 'not found' }, 404);
  }
}


