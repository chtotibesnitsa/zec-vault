// Pre-launch preview activity. Every item carries sample: true and the UI
// labels it SAMPLE and never links it to a transaction. Real events replace
// it the moment the vault has any.
import { useEffect, useState } from 'react';

const NAMES = ['night_owl', 'ghost_01', 'no_kyc', 'quiet_one', 'cipher', 'zero_trace', 'mixer_mike', 'silent_bob', 'hodl_sage', 'shade', 'veil', 'driftwood', 'lowkey_lu', 'stealthy', 'umbra'];
const KINDS = ['payout', 'buy', 'payout', 'join', 'buy', 'payout', 'sell', 'buyback', 'payout', 'buy', 'burn', 'claim', 'buy', 'payout', 'sell', 'join'];

let seq = 0;
function rnd(i) {
  const x = Math.sin(i * 91.7 + 13.1) * 43758.5453;
  return x - Math.floor(x);
}

export function sampleEvent(i, ts) {
  const kind = KINDS[i % KINDS.length];
  const u = NAMES[Math.floor(rnd(i) * NAMES.length)];
  const r = rnd(i + 7);
  return {
    id: 'sample-' + ++seq,
    sample: true,
    ts,
    kind,
    wallet: null,
    name: kind === 'claim' || kind === 'buyback' || kind === 'burn' ? null : { u, x: r > 0.6 ? u : null },
    amountRaw: String(Math.floor((kind === 'payout' ? 800 + r * 9000 : 20000 + r * 900000) * 1e6)),
    lamports: String(Math.floor((kind === 'claim' ? 0.4 + r * 1.6 : 0.05 + r * 1.4) * 1e9)),
    sig: null,
  };
}

export const SAMPLE_CFG = { decimals: 6, rewardDecimals: 6, rewardIsOwnToken: true };

export const SAMPLE_STATS = {
  rewardsPaid: '4210000',
  rewardsPaid24h: '612000',
  holders: 1284,
  feesTotalSol: 38.4,
  burned: '18400000',
  burnSol: 3.84,
  trades24h: 2913,
  community: { members: 642, named: 518, xLinked: 301, invited: 207 },
};

// Rolling sample feed for preview mode.
export function useSampleFeed(enabled, onNew) {
  const [events, setEvents] = useState(() => (enabled ? Array.from({ length: 18 }, (_, i) => sampleEvent(i, Date.now() - i * 41000)) : []));
  useEffect(() => {
    if (!enabled) return setEvents([]);
    let i = 18;
    const iv = setInterval(() => {
      const e = sampleEvent(i++, Date.now());
      setEvents((prev) => [e, ...prev].slice(0, 40));
      onNew?.(e);
    }, 5200);
    return () => clearInterval(iv);
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  return events;
}
