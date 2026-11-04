// Identity: wallet sign-in (Ed25519 signed message, no transaction), a
// username people choose themselves, optional X account link (OAuth 2.0 with
// PKCE), referrals and diamond-hands streaks. Everything public is derived
// from real on-chain events already in the feed.

import bs58 from 'bs58';
import { isValidAddress } from './solana.js';

const DAY = 86400000;
const NONCE_TTL = 10 * 60000;
const SESSION_TTL = 30 * DAY;
const XSTATE_TTL = 10 * 60000;
const USERNAME = /^[A-Za-z0-9_]{3,20}$/;
const RESERVED = new Set(['admin', 'administrator', 'wraith', 'orchard', 'vault', 'team', 'dev', 'official', 'support', 'mod', 'moderator', 'solana', 'pump', 'pumpfun', 'monero', 'zcash', 'null', 'undefined']);

export const IDENTITY_SCHEMA = `
  CREATE TABLE IF NOT EXISTS profiles (
    wallet TEXT PRIMARY KEY, username TEXT, username_lc TEXT UNIQUE, x_id TEXT, x_handle TEXT, x_avatar TEXT,
    ref_by TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS profiles_ref ON profiles(ref_by);
  CREATE TABLE IF NOT EXISTS nonces (nonce TEXT PRIMARY KEY, wallet TEXT NOT NULL, message TEXT NOT NULL, exp INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, wallet TEXT NOT NULL, exp INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS xauth (state TEXT PRIMARY KEY, wallet TEXT NOT NULL, verifier TEXT NOT NULL, ret TEXT NOT NULL, exp INTEGER NOT NULL);
`;

const hex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const rand = (n = 32) => crypto.getRandomValues(new Uint8Array(n));
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function decodeSig(s) {
  if (typeof s !== 'string') throw new Error('signature missing');
  if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(s)) {
    try {
      const b = bs58.decode(s);
      if (b.length === 64) return b;
    } catch {
      /* fall through to base64 */
    }
  }
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const b = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  if (b.length !== 64) throw new Error('bad signature');
  return b;
}

export async function verifyEd25519(wallet, message, signature) {
  const key = await crypto.subtle.importKey('raw', bs58.decode(wallet), { name: 'Ed25519' }, false, ['verify']);
  return crypto.subtle.verify({ name: 'Ed25519' }, key, decodeSig(signature), new TextEncoder().encode(message));
}

export function signInMessage(brandName, wallet, nonce, issued) {
  return [
    `${brandName} vault sign-in`,
    '',
    'Sign to prove you own this wallet. This is free and sends no transaction.',
    '',
    `Wallet: ${wallet}`,
    `Nonce: ${nonce}`,
    `Issued: ${new Date(issued).toISOString()}`,
  ].join('\n');
}

export class Identity {
  constructor(vault) {
    this.v = vault;
    this.sql = vault.sql;
    this.env = vault.env;
  }

  brandName() {
    return this.env.BRAND_NAME || this.env.TOKEN_SYMBOL || 'Vault';
  }

  cleanup() {
    const now = Date.now();
    this.sql.exec('DELETE FROM nonces WHERE exp < ?', now);
    this.sql.exec('DELETE FROM sessions WHERE exp < ?', now);
    this.sql.exec('DELETE FROM xauth WHERE exp < ?', now);
  }

  session(req) {
    const h = req.headers.get('authorization') || '';
    const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
    if (!/^[0-9a-f]{64}$/.test(token)) return null;
    const r = this.sql.exec('SELECT wallet, exp FROM sessions WHERE token = ?', token).toArray()[0];
    if (!r || r.exp < Date.now()) return null;
    return { token, wallet: r.wallet };
  }

  profile(wallet) {
    const r = this.sql.exec('SELECT * FROM profiles WHERE wallet = ?', wallet).toArray()[0];
    const recruits = r?.username_lc ? this.recruitCount(r.username_lc) : 0;
    return {
      wallet,
      username: r?.username || null,
      x: r?.x_handle ? { handle: r.x_handle, avatar: r.x_avatar || null } : null,
      refBy: r?.ref_by || null,
      recruits,
      xEnabled: Boolean(this.env.X_CLIENT_ID && this.env.X_CLIENT_SECRET),
    };
  }

  recruitCount(usernameLc) {
    return this.sql
      .exec('SELECT COUNT(*) AS n FROM profiles p JOIN holders h ON h.wallet = p.wallet WHERE p.ref_by = ?', usernameLc)
      .toArray()[0].n;
  }

  // Public names for a list of wallets, for the feed and boards.
  names(wallets) {
    const uniq = [...new Set(wallets.filter(Boolean))].slice(0, 200);
    if (!uniq.length) return {};
    const out = {};
    for (const group of chunkArr(uniq, 50)) {
      const rows = this.sql
        .exec(`SELECT wallet, username, x_handle FROM profiles WHERE wallet IN (${group.map(() => '?').join(',')})`, ...group)
        .toArray();
      for (const r of rows) if (r.username || r.x_handle) out[r.wallet] = { u: r.username || null, x: r.x_handle || null };
    }
    return out;
  }

  upsertProfile(wallet) {
    const now = Date.now();
    this.sql.exec('INSERT OR IGNORE INTO profiles (wallet, created, updated) VALUES (?, ?, ?)', wallet, now, now);
  }

  async route(req, p, url, json) {
    if (p === '/api/auth/nonce' && req.method === 'POST') {
      this.cleanup();
      const body = await req.json().catch(() => ({}));
      if (!isValidAddress(body.wallet)) return json({ error: 'invalid wallet' }, 400);
      const nonce = hex(rand(16));
      const issued = Date.now();
      const message = signInMessage(this.brandName(), body.wallet, nonce, issued);
      this.sql.exec('INSERT INTO nonces (nonce, wallet, message, exp) VALUES (?, ?, ?, ?)', nonce, body.wallet, message, issued + NONCE_TTL);
      return json({ nonce, message });
    }

    if (p === '/api/auth/verify' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const n = this.sql.exec('SELECT * FROM nonces WHERE nonce = ?', String(body.nonce || '')).toArray()[0];
      if (!n || n.exp < Date.now() || n.wallet !== body.wallet) return json({ error: 'sign-in expired, try again' }, 400);
      this.sql.exec('DELETE FROM nonces WHERE nonce = ?', n.nonce); // single use
      let ok = false;
      try {
        ok = await verifyEd25519(n.wallet, n.message, body.signature);
      } catch {
        ok = false;
      }
      if (!ok) return json({ error: 'signature does not match this wallet' }, 401);
      const token = hex(rand(32));
      this.sql.exec('INSERT INTO sessions (token, wallet, exp) VALUES (?, ?, ?)', token, n.wallet, Date.now() + SESSION_TTL);
      this.upsertProfile(n.wallet);
      return json({ token, profile: this.profile(n.wallet) });
    }

    if (p === '/api/auth/x/callback') return this.xCallback(url);

    if (p.startsWith('/api/u/')) {
      const name = decodeURIComponent(p.slice('/api/u/'.length)).toLowerCase();
      const r = this.sql.exec('SELECT wallet FROM profiles WHERE username_lc = ?', name).toArray()[0];
      if (!r) return json({ error: 'not found' }, 404);
      return json({ ...this.profile(r.wallet), holder: this.v.holder(r.wallet) });
    }

    if (p === '/api/referrals') return json({ top: this.topRecruiters() });

    // everything below needs a session
    const s = this.session(req);
    if (!s) return json({ error: 'sign in first' }, 401);

    if (p === '/api/me') return json(this.profile(s.wallet));

    if (p === '/api/auth/logout' && req.method === 'POST') {
      this.sql.exec('DELETE FROM sessions WHERE token = ?', s.token);
      return json({ ok: true });
    }

    if (p === '/api/profile' && req.method === 'POST') {
      const body = await req.json().catch(() => ({}));
      const now = Date.now();
      this.upsertProfile(s.wallet);
      const cur = this.sql.exec('SELECT username_lc, ref_by FROM profiles WHERE wallet = ?', s.wallet).toArray()[0];
      if (body.username != null) {
        const u = String(body.username).trim();
        if (!USERNAME.test(u)) return json({ error: 'Use 3 to 20 letters, numbers or _' }, 400);
        if (RESERVED.has(u.toLowerCase())) return json({ error: 'That name is reserved' }, 400);
        const taken = this.sql.exec('SELECT wallet FROM profiles WHERE username_lc = ?', u.toLowerCase()).toArray()[0];
        if (taken && taken.wallet !== s.wallet) return json({ error: 'That name is taken' }, 409);
        this.sql.exec('UPDATE profiles SET username = ?, username_lc = ?, updated = ? WHERE wallet = ?', u, u.toLowerCase(), now, s.wallet);
      }
      if (body.ref && !cur.ref_by) {
        const ref = String(body.ref).toLowerCase();
        const refRow = this.sql.exec('SELECT wallet FROM profiles WHERE username_lc = ?', ref).toArray()[0];
        if (refRow && refRow.wallet !== s.wallet) this.sql.exec('UPDATE profiles SET ref_by = ? WHERE wallet = ?', ref, s.wallet);
      }
      return json(this.profile(s.wallet));
    }

    if (p === '/api/auth/x/start' && req.method === 'POST') return this.xStart(req, s, url, json);

    if (p === '/api/auth/x/unlink' && req.method === 'POST') {
      this.sql.exec('UPDATE profiles SET x_id = NULL, x_handle = NULL, x_avatar = NULL, updated = ? WHERE wallet = ?', Date.now(), s.wallet);
      return json(this.profile(s.wallet));
    }

    return json({ error: 'not found' }, 404);
  }

  // ---------- X (Twitter) OAuth 2.0 with PKCE ----------
  async xStart(req, s, url, json) {
    if (!this.env.X_CLIENT_ID || !this.env.X_CLIENT_SECRET) return json({ error: 'X sign-in is not switched on yet' }, 503);
    const origin = req.headers.get('origin') || '';
    const site = (this.env.SITE_URL || origin).replace(/\/$/, '');
    if (!/^https:\/\/[^/]+$|^http:\/\/localhost(:\d+)?$/.test(site)) return json({ error: 'unknown site' }, 400);
    this.cleanup();
    const state = hex(rand(16));
    const verifier = b64url(rand(48));
    const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
    this.sql.exec('INSERT INTO xauth (state, wallet, verifier, ret, exp) VALUES (?, ?, ?, ?, ?)', state, s.wallet, verifier, site, Date.now() + XSTATE_TTL);
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: this.env.X_CLIENT_ID,
      redirect_uri: `${url.origin}/api/auth/x/callback`,
      scope: 'users.read tweet.read',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    return json({ url: `https://x.com/i/oauth2/authorize?${q}` });
  }

  async xCallback(url) {
    const state = url.searchParams.get('state') || '';
    const code = url.searchParams.get('code') || '';
    const row = this.sql.exec('SELECT * FROM xauth WHERE state = ?', state).toArray()[0];
    if (!row || row.exp < Date.now()) return new Response('This X sign-in link expired. Go back and try again.', { status: 400 });
    this.sql.exec('DELETE FROM xauth WHERE state = ?', state);
    const back = (q) => Response.redirect(`${row.ret}/app?x=${q}`, 302);
    if (!code) return back('cancelled');
    try {
      const tok = await fetch('https://api.x.com/2/oauth2/token', {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: 'Basic ' + btoa(`${this.env.X_CLIENT_ID}:${this.env.X_CLIENT_SECRET}`),
        },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: `${url.origin}/api/auth/x/callback`, code_verifier: row.verifier }),
      }).then((r) => r.json());
      if (!tok.access_token) return back('failed');
      const me = await fetch('https://api.x.com/2/users/me?user.fields=profile_image_url', {
        headers: { authorization: `Bearer ${tok.access_token}` },
      }).then((r) => r.json());
      const u = me?.data;
      if (!u?.username) return back('failed');
      // one X account per wallet profile
      this.sql.exec('UPDATE profiles SET x_id = NULL, x_handle = NULL, x_avatar = NULL WHERE x_id = ? AND wallet != ?', u.id, row.wallet);
      this.upsertProfile(row.wallet);
      this.sql.exec('UPDATE profiles SET x_id = ?, x_handle = ?, x_avatar = ?, updated = ? WHERE wallet = ?', u.id, u.username, u.profile_image_url || null, Date.now(), row.wallet);
      return back('linked');
    } catch {
      return back('failed');
    }
  }

  // Usage of the social features, plus the newest named members.
  community() {
    const one = (q) => this.sql.exec(q).toArray()[0].n;
    const joins = this.sql
      .exec('SELECT username, x_handle, created FROM profiles WHERE username IS NOT NULL ORDER BY created DESC LIMIT 8')
      .toArray()
      .map((r) => ({ u: r.username, x: r.x_handle || null, ts: r.created }));
    return {
      members: one('SELECT COUNT(*) AS n FROM profiles'),
      named: one('SELECT COUNT(*) AS n FROM profiles WHERE username IS NOT NULL'),
      xLinked: one('SELECT COUNT(*) AS n FROM profiles WHERE x_handle IS NOT NULL'),
      invited: one('SELECT COUNT(*) AS n FROM profiles WHERE ref_by IS NOT NULL'),
      joins,
    };
  }

  // ---------- boards ----------
  topRecruiters() {
    const rows = this.sql
      .exec(
        `SELECT p.ref_by AS ref, COUNT(*) AS n FROM profiles p JOIN holders h ON h.wallet = p.wallet
         WHERE p.ref_by IS NOT NULL GROUP BY p.ref_by ORDER BY n DESC LIMIT 20`,
      )
      .toArray();
    return rows.map((r) => {
      const p = this.sql.exec('SELECT wallet, username, x_handle FROM profiles WHERE username_lc = ?', r.ref).toArray()[0];
      return { username: p?.username || r.ref, wallet: p?.wallet || null, x: p?.x_handle || null, recruits: r.n };
    });
  }

  // Payouts received since the wallet's last recorded sell. Never sold = full count.
  streaks(wallets) {
    const out = {};
    for (const w of wallets) {
      const lastSell = this.sql.exec("SELECT MAX(ts) AS t FROM events WHERE kind = 'sell' AND wallet = ?", w).toArray()[0]?.t || 0;
      const n = this.sql.exec("SELECT COUNT(*) AS n FROM events WHERE kind = 'payout' AND wallet = ? AND ts > ?", w, lastSell).toArray()[0].n;
      out[w] = { streak: n, neverSold: !lastSell };
    }
    return out;
  }
}

function chunkArr(a, n) {
  const out = [];
  for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n));
  return out;
}
