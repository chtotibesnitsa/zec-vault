// Pure logic for the vault: holder snapshots, pro-rata allocation, payout
// selection and trade parsing. No network calls here, so it is unit tested.

// Groups token accounts by owner, drops excluded and ineligible owners.
// isEligibleOwner(ownerBase58) returns false for pools, bonding curves and
// other program-derived (off-curve) owners.
export function buildSnapshot(accounts, { toBase58, isEligibleOwner, exclude, minHoldRaw }) {
  const byOwner = new Map();
  for (const a of accounts) {
    if (a.amount === 0n) continue;
    const owner = typeof a.owner === 'string' ? a.owner : toBase58(a.owner);
    byOwner.set(owner, (byOwner.get(owner) || 0n) + a.amount);
  }
  const holders = [];
  let total = 0n;
  for (const [owner, amount] of byOwner) {
    if (exclude.has(owner)) continue;
    if (amount < minHoldRaw) continue;
    if (!isEligibleOwner(owner)) continue;
    holders.push({ owner, amount });
    total += amount;
  }
  holders.sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
  return { holders, total };
}

// Splits `pool` raw reward units across holders by balance. Integer math only,
// so the sum of shares never exceeds the pool. Returns the dust left over.
export function allocate(pool, holders, total) {
  const shares = new Map();
  if (pool <= 0n || total <= 0n || holders.length === 0) return { shares, used: 0n, dust: pool };
  let used = 0n;
  for (const h of holders) {
    const s = (pool * h.amount) / total;
    if (s > 0n) {
      shares.set(h.owner, s);
      used += s;
    }
  }
  return { shares, used, dust: pool - used };
}

// Chooses who gets paid this cycle: owed at least minPayoutRaw, biggest first.
export function selectPayouts(owed, minPayoutRaw, maxRecipients) {
  const list = [];
  for (const [wallet, amount] of owed) {
    if (amount > 0n && amount >= minPayoutRaw) list.push({ wallet, amount });
  }
  list.sort((a, b) => (b.amount > a.amount ? 1 : b.amount < a.amount ? -1 : 0));
  return list.slice(0, maxRecipients);
}

export function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function keyStr(k) {
  return typeof k === 'string' ? k : k.pubkey;
}

// Net raw token change for one owner and mint inside a parsed transaction.
export function tokenDelta(tx, owner, mint) {
  const sum = (list) =>
    (list || [])
      .filter((b) => b.mint === mint && b.owner === owner)
      .reduce((acc, b) => acc + BigInt(b.uiTokenAmount.amount), 0n);
  return sum(tx.meta?.postTokenBalances) - sum(tx.meta?.preTokenBalances);
}

// Net SOL change (lamports) for an account, with the network fee added back
// for the fee payer so a claim of X shows as X.
export function solDelta(tx, address, { addBackFee = false } = {}) {
  const keys = tx.transaction.message.accountKeys.map(keyStr);
  const i = keys.indexOf(address);
  if (i < 0) return 0n;
  let d = BigInt(tx.meta.postBalances[i]) - BigInt(tx.meta.preBalances[i]);
  if (addBackFee && i === 0) d += BigInt(tx.meta.fee);
  return d;
}

// Turns a parsed transaction that touched our mint into a feed event, or null.
// The signer (first account) is the trader. Token up = buy, token down = sell.
export function parseTrade(tx, mint, { ignore = new Set() } = {}) {
  if (!tx || !tx.meta || tx.meta.err) return null;
  const keys = tx.transaction.message.accountKeys.map(keyStr);
  const trader = keys[0];
  if (!trader || ignore.has(trader)) return null;
  const tok = tokenDelta(tx, trader, mint);
  if (tok === 0n) return null;
  const lamports = solDelta(tx, trader, { addBackFee: true });
  // Wrapped SOL moves count too (Jupiter routes often use WSOL accounts).
  const wsol = tokenDelta(tx, trader, 'So11111111111111111111111111111111111111112');
  const solMoved = lamports + wsol;
  const side = tok > 0n ? 'buy' : 'sell';
  // A token change with no SOL movement is a transfer, not a trade.
  if ((side === 'buy' && solMoved >= 0n) || (side === 'sell' && solMoved <= 0n)) return null;
  return {
    kind: side,
    sig: tx.transaction.signatures[0],
    wallet: trader,
    amountRaw: (tok < 0n ? -tok : tok).toString(),
    lamports: (solMoved < 0n ? -solMoved : solMoved).toString(),
    ts: (tx.blockTime || Math.floor(Date.now() / 1000)) * 1000,
  };
}

// UI amount string -> raw BigInt with the given decimals. "1.5", 6 -> 1500000n
export function toRaw(ui, decimals) {
  const s = String(ui ?? '0').trim();
  if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') return 0n;
  const [whole, frac = ''] = s.split('.');
  const f = (frac + '0'.repeat(decimals)).slice(0, decimals);
  return BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(f || '0');
}

export function fromRaw(raw, decimals) {
  const r = BigInt(raw);
  const neg = r < 0n;
  const a = neg ? -r : r;
  const base = 10n ** BigInt(decimals);
  const whole = a / base;
  const frac = (a % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return (neg ? '-' : '') + whole.toString() + (frac ? '.' + frac : '');
}
