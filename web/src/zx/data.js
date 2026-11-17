// Live data for the new pages, plus a clearly labelled sample mode (?sample)
// so the layout can be reviewed before launch. Sample rows never link to
// Solscan and every block that shows them says SAMPLE.
import { useEffect, useState } from 'react';
import { usePoll } from '../api.js';

export const SAMPLE = (() => {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.has('sample')) sessionStorage.setItem('zx:sample', q.get('sample') === '0' ? '' : '1');
    return sessionStorage.getItem('zx:sample') === '1';
  } catch {
    return false;
  }
})();

const rnd = (n) => {
  const x = Math.sin(n * 91.7 + 17.3) * 43758.5453;
  return x - Math.floor(x);
};
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const fakeAddr = (i) => Array.from({ length: 44 }, (_, k) => B58[Math.floor(rnd(i * 53 + k) * 58)]).join('');

function sampleHolders(n = 164) {
  const now = Date.now();
  const rows = Array.from({ length: n }, (_, i) => ({
    wallet: fakeAddr(i + 1),
    amount: Math.round(100000 + 42000000 / Math.pow(i + 1, 1.08) * (0.7 + rnd(i) * 0.6)),
    since: now - Math.floor(rnd(i + 400) * 6 * 86400000) - 60000,
    paid: 0,
  }));
  rows.sort((a, b) => b.amount - a.amount);
  const total = rows.reduce((a, r) => a + r.amount, 0);
  return rows.map((r, i) => ({ ...r, rank: i + 1, prevRank: i + 1, pct: (r.amount / total) * 100, paid: +(r.amount / 1e6 * 0.042).toFixed(4) }));
}

function sampleCycles(n = 36) {
  const now = Date.now();
  let holders = 120;
  return Array.from({ length: n }, (_, i) => {
    const joined = Math.floor(rnd(i + 70) * 7);
    const left = Math.floor(rnd(i + 90) * 4);
    holders += joined - left;
    const paid = Math.round((1800 + Math.sin(i / 3) * 900 + rnd(i) * 1400) * 100) / 100;
    return { id: 1000 + i, ts: now - (n - i) * 300000, holders, joined, left, paid, recipients: holders - Math.floor(rnd(i + 5) * 6), burned: Math.round(paid / 4), feesSol: +(paid / 9000).toFixed(3), sigs: [] };
  }).reverse();
}

// Holders, with a gentle reshuffle every few seconds in sample mode so the
// rank animation can be seen.
export function useHolders(limit = 500) {
  const live = usePoll(SAMPLE ? null : `/api/holders?limit=${limit}`, 30000);
  const [sample, setSample] = useState(() => (SAMPLE ? sampleHolders() : null));
  useEffect(() => {
    if (!SAMPLE) return;
    const iv = setInterval(() => {
      setSample((rows) => {
        const next = rows.map((r, i) => ({ ...r, amount: Math.max(100000, Math.round(r.amount * (0.97 + rnd(Date.now() / 1000 + i) * 0.07))) }));
        next.sort((a, b) => b.amount - a.amount);
        const total = next.reduce((a, r) => a + r.amount, 0);
        return next.map((r, i) => ({ ...r, prevRank: r.rank, rank: i + 1, pct: (r.amount / total) * 100 }));
      });
    }, 5000);
    return () => clearInterval(iv);
  }, []);
  if (SAMPLE) return { holders: sample, count: sample.length, joined: 6, left: 2, snapshotAt: Date.now() - 42000, sample: true, ok: true };
  const d = live.data;
  return { holders: d?.holders || [], count: d?.count || 0, joined: d?.joined || 0, left: d?.left || 0, snapshotAt: d?.snapshotAt || null, profiles: d?.profiles, sample: false, ok: Boolean(d) };
}

export function useCycles(limit = 48) {
  const live = usePoll(SAMPLE ? null : `/api/cycles?limit=${limit}`, 30000);
  const [sample] = useState(() => (SAMPLE ? sampleCycles() : null));
  if (SAMPLE) return { cycles: sample, rewardSymbol: 'ZATS', sample: true, ok: true };
  return { cycles: live.data?.cycles || [], rewardSymbol: live.data?.rewardSymbol || null, sample: false, ok: Boolean(live.data) };
}

export function holdFor(since) {
  if (!since) return '—';
  const s = Math.max(0, (Date.now() - since) / 1000);
  if (s < 3600) return Math.max(1, Math.floor(s / 60)) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h ' + Math.floor((s % 3600) / 60) + 'm';
  return Math.floor(s / 86400) + 'd ' + Math.floor((s % 86400) / 3600) + 'h';
}

export function hhmm(ts) {
  const d = new Date(ts);
  return [d.getHours(), d.getMinutes()].map((n) => String(n).padStart(2, '0')).join(':');
}
