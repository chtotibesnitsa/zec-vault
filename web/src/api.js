import { useEffect, useRef, useState } from 'react';
import { brand } from './brand.js';

export async function api(path) {
  if (!brand.apiUrl) throw new Error('no api');
  const res = await fetch(brand.apiUrl + path);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

// JSON call with optional session token. Throws with the server's message.
export async function apiSend(path, { method = 'POST', body, token } = {}) {
  if (!brand.apiUrl) throw new Error('The vault opens at launch.');
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = 'Bearer ' + token;
  const res = await fetch(brand.apiUrl + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || 'HTTP ' + res.status);
  return j;
}

// Display name for a wallet: @username, else the short address.
export const who = (wallet, names) => {
  const n = names?.[wallet];
  return n?.u ? '@' + n.u : n?.x ? '@' + n.x : short(wallet);
};

// Polls an endpoint. Returns { data, error }. Pauses while the tab is hidden.
export function usePoll(path, ms = 15000) {
  const [state, setState] = useState({ data: null, error: null });
  useEffect(() => {
    if (!path) return;
    let alive = true;
    let t;
    const run = async () => {
      if (document.hidden) {
        t = setTimeout(run, ms);
        return;
      }
      try {
        const data = await api(path);
        if (alive) setState({ data, error: null });
      } catch (e) {
        if (alive) setState((s) => ({ data: s.data, error: e.message }));
      }
      if (alive) t = setTimeout(run, ms);
    };
    run();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [path, ms]);
  return state;
}

// Streams new feed events: first load gets the latest, later polls only ask
// for ids above the newest seen. onNew fires for events that arrive live.
export function useFeed(onNew, ms = 8000) {
  const [events, setEvents] = useState([]);
  const lastId = useRef(0);
  const first = useRef(true);
  const cb = useRef(onNew);
  cb.current = onNew;
  useEffect(() => {
    if (!brand.apiUrl) return;
    let alive = true;
    let t;
    const run = async () => {
      try {
        if (!document.hidden) {
          const { events: raw, profiles = {} } = await api(`/api/feed?limit=40&after=${lastId.current}`);
          const fresh = raw.map((e) => ({ ...e, name: profiles[e.wallet] || null }));
          if (alive && fresh.length) {
            lastId.current = Math.max(lastId.current, ...fresh.map((e) => e.id));
            setEvents((prev) => [...fresh, ...prev].slice(0, 80));
            if (!first.current) fresh.slice(0, 3).forEach((e) => cb.current?.(e));
          }
          first.current = false;
        }
      } catch {
        /* offline or pre-launch */
      }
      if (alive) t = setTimeout(run, ms);
    };
    run();
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [ms]);
  return events;
}

export const short = (a) => (a ? a.slice(0, 4) + '…' + a.slice(-4) : '');
export const solscanTx = (s) => `https://solscan.io/tx/${s}`;
export const solscanAcct = (a) => `https://solscan.io/account/${a}`;

export function fmtNum(n, max = 2) {
  const v = Number(n);
  if (!isFinite(v)) return '—';
  if (Math.abs(v) >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (Math.abs(v) >= 1e4) return (v / 1e3).toFixed(1) + 'K';
  return v.toLocaleString('en-US', { maximumFractionDigits: max });
}

export function fmtUsd(n) {
  const v = Number(n);
  if (!isFinite(v) || v === 0) return '—';
  if (v < 0.01) return '$' + v.toPrecision(3);
  return '$' + fmtNum(v, 2);
}

export function rawToUi(raw, decimals) {
  if (raw == null) return 0;
  return Number(BigInt(raw)) / 10 ** decimals;
}

export function ago(ts) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}
