import { describe, expect, it } from 'vitest';
import { allocate, buildSnapshot, fromRaw, parseTrade, selectPayouts, toRaw } from '../src/engine.js';

const MINT = 'Mint1111111111111111111111111111111111111111';

describe('allocation', () => {
  it('splits pro rata and never overspends', () => {
    const holders = [
      { owner: 'a', amount: 700n },
      { owner: 'b', amount: 200n },
      { owner: 'c', amount: 100n },
    ];
    const { shares, used, dust } = allocate(1001n, holders, 1000n);
    expect(shares.get('a')).toBe(700n);
    expect(shares.get('b')).toBe(200n);
    expect(shares.get('c')).toBe(100n);
    expect(used + dust).toBe(1001n);
    expect(dust).toBe(1n);
  });

  it('keeps everything as dust with no holders', () => {
    expect(allocate(50n, [], 0n).dust).toBe(50n);
  });
});

describe('snapshot', () => {
  it('merges accounts per owner and drops excluded, small and PDA owners', () => {
    const accounts = [
      { owner: 'w1', amount: 60n },
      { owner: 'w1', amount: 50n },
      { owner: 'w2', amount: 5n },
      { owner: 'pool', amount: 1000n },
      { owner: 'treasury', amount: 999n },
      { owner: 'w3', amount: 0n },
    ];
    const snap = buildSnapshot(accounts, {
      toBase58: (x) => x,
      isEligibleOwner: (o) => o !== 'pool',
      exclude: new Set(['treasury']),
      minHoldRaw: 10n,
    });
    expect(snap.holders).toEqual([{ owner: 'w1', amount: 110n }]);
    expect(snap.total).toBe(110n);
  });
});

describe('payout selection', () => {
  it('orders by amount and respects minimum and cap', () => {
    const owed = new Map([
      ['a', 5n],
      ['b', 50n],
      ['c', 20n],
      ['d', 0n],
    ]);
    expect(selectPayouts(owed, 10n, 5).map((p) => p.wallet)).toEqual(['b', 'c']);
    expect(selectPayouts(owed, 0n, 1).map((p) => p.wallet)).toEqual(['b']);
  });
});

describe('amount conversion', () => {
  it('round trips decimals', () => {
    expect(toRaw('1.5', 6)).toBe(1500000n);
    expect(toRaw('100000', 6)).toBe(100000000000n);
    expect(toRaw('bad', 6)).toBe(0n);
    expect(fromRaw(1500000n, 6)).toBe('1.5');
    expect(fromRaw('7', 6)).toBe('0.000007');
  });
});

function tx({ signer, preTok, postTok, preSol, postSol, fee = 5000, err = null }) {
  return {
    blockTime: 1700000000,
    meta: {
      err,
      fee,
      preBalances: [preSol],
      postBalances: [postSol],
      preTokenBalances: preTok == null ? [] : [{ mint: MINT, owner: signer, uiTokenAmount: { amount: String(preTok) } }],
      postTokenBalances: [{ mint: MINT, owner: signer, uiTokenAmount: { amount: String(postTok) } }],
    },
    transaction: { signatures: ['sig1'], message: { accountKeys: [{ pubkey: signer }] } },
  };
}

describe('trade parsing', () => {
  it('reads a buy', () => {
    const ev = parseTrade(tx({ signer: 'buyer', preTok: null, postTok: 500, preSol: 2_000_000_000, postSol: 1_000_000_000 }), MINT);
    expect(ev.kind).toBe('buy');
    expect(ev.amountRaw).toBe('500');
    expect(ev.lamports).toBe(String(1_000_000_000 - 5000));
  });

  it('reads a sell', () => {
    const ev = parseTrade(tx({ signer: 's', preTok: 500, postTok: 0, preSol: 1_000_000_000, postSol: 1_400_000_000 }), MINT);
    expect(ev.kind).toBe('sell');
    expect(ev.lamports).toBe(String(400_000_000 + 5000));
  });

  it('ignores plain transfers, failed txs and ignored wallets', () => {
    expect(parseTrade(tx({ signer: 's', preTok: 500, postTok: 0, preSol: 1e9, postSol: 1e9 - 5000 }), MINT)).toBeNull();
    expect(parseTrade(tx({ signer: 'b', preTok: 0, postTok: 5, preSol: 2e9, postSol: 1e9, err: { x: 1 } }), MINT)).toBeNull();
    expect(parseTrade(tx({ signer: 'b', preTok: 0, postTok: 5, preSol: 2e9, postSol: 1e9 }), MINT, { ignore: new Set(['b']) })).toBeNull();
  });
});
