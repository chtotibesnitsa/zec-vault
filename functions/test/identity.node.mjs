// Wallet sign-in, usernames, referrals and streaks against a real SQLite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { generateKeyPairSync, sign } from 'node:crypto';
import bs58 from 'bs58';
import { Vault } from '../src/index.js';

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
          if (/^\s*SELECT/i.test(query)) {
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

function wallet() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
  return { address: bs58.encode(raw), sign: (msg) => bs58.encode(sign(null, Buffer.from(msg), privateKey)) };
}

const vault = () => new Vault(fakeState(), { TOKEN_SYMBOL: 'WRAITH', BRAND_NAME: 'Wraith' });
async function call(v, method, path, body, token) {
  const headers = { 'content-type': 'application/json', origin: 'https://wraith.example' };
  if (token) headers.authorization = 'Bearer ' + token;
  const res = await v.fetch(new Request('https://api.example' + path, { method, headers, body: body ? JSON.stringify(body) : undefined }));
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function signIn(v, w) {
  const n = await call(v, 'POST', '/api/auth/nonce', { wallet: w.address });
  assert.equal(n.status, 200);
  assert.match(n.body.message, /sends no transaction/);
  const r = await call(v, 'POST', '/api/auth/verify', { wallet: w.address, nonce: n.body.nonce, signature: w.sign(n.body.message) });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.token;
}

test('wallet sign-in works and the nonce is single use', async () => {
  const v = vault();
  const w = wallet();
  const n = await call(v, 'POST', '/api/auth/nonce', { wallet: w.address });
  const sig = w.sign(n.body.message);
  const ok = await call(v, 'POST', '/api/auth/verify', { wallet: w.address, nonce: n.body.nonce, signature: sig });
  assert.equal(ok.status, 200);
  const again = await call(v, 'POST', '/api/auth/verify', { wallet: w.address, nonce: n.body.nonce, signature: sig });
  assert.equal(again.status, 400);
  const me = await call(v, 'GET', '/api/me', null, ok.body.token);
  assert.equal(me.body.wallet, w.address);
});

test('a signature from another wallet is rejected', async () => {
  const v = vault();
  const a = wallet();
  const b = wallet();
  const n = await call(v, 'POST', '/api/auth/nonce', { wallet: a.address });
  const r = await call(v, 'POST', '/api/auth/verify', { wallet: a.address, nonce: n.body.nonce, signature: b.sign(n.body.message) });
  assert.equal(r.status, 401);
  assert.equal((await call(v, 'GET', '/api/me', null, 'f'.repeat(64))).status, 401);
});

test('usernames are validated, unique and shown in the feed', async () => {
  const v = vault();
  const a = wallet();
  const b = wallet();
  const ta = await signIn(v, a);
  const tb = await signIn(v, b);
  assert.equal((await call(v, 'POST', '/api/profile', { username: 'x' }, ta)).status, 400);
  assert.equal((await call(v, 'POST', '/api/profile', { username: 'admin' }, ta)).status, 400);
  assert.equal((await call(v, 'POST', '/api/profile', { username: 'ghost_01' }, ta)).body.username, 'ghost_01');
  assert.equal((await call(v, 'POST', '/api/profile', { username: 'GHOST_01' }, tb)).status, 409);
  v.event({ kind: 'buy', sig: 's1', wallet: a.address, amountRaw: 5, lamports: 1 });
  const feed = await call(v, 'GET', '/api/feed');
  assert.equal(feed.body.profiles[a.address].u, 'ghost_01');
});

test('referrals count only recruits who hold, and can be set once', async () => {
  const v = vault();
  const boss = wallet();
  const r1 = wallet();
  const r2 = wallet();
  await call(v, 'POST', '/api/profile', { username: 'boss' }, await signIn(v, boss));
  const t1 = await signIn(v, r1);
  const t2 = await signIn(v, r2);
  await call(v, 'POST', '/api/profile', { username: 'rec_one', ref: 'boss' }, t1);
  await call(v, 'POST', '/api/profile', { ref: 'BOSS' }, t2);
  await call(v, 'POST', '/api/profile', { ref: 'rec_one' }, t2); // ignored, already set
  v.sql.exec('INSERT INTO holders (wallet, amount) VALUES (?, ?)', r1.address, '100');
  let top = (await call(v, 'GET', '/api/referrals')).body.top;
  assert.deepEqual(top.map((t) => [t.username, t.recruits]), [['boss', 1]]);
  v.sql.exec('INSERT INTO holders (wallet, amount) VALUES (?, ?)', r2.address, '100');
  top = (await call(v, 'GET', '/api/referrals')).body.top;
  assert.equal(top[0].recruits, 2);
});

test('diamond streak resets on a sell', async () => {
  const v = vault();
  const a = wallet().address;
  const b = wallet().address;
  for (const w of [a, b]) v.sql.exec("INSERT INTO owed (wallet, raw, paid_raw, payouts) VALUES (?, '0', '10', 3)", w);
  let t = 1000;
  for (let i = 0; i < 3; i++) {
    v.event({ ts: t++, kind: 'payout', sig: 'pa' + i, wallet: a, amountRaw: 1 });
    v.event({ ts: t++, kind: 'payout', sig: 'pb' + i, wallet: b, amountRaw: 1 });
    if (i === 1) v.event({ ts: t++, kind: 'sell', sig: 'sb', wallet: b, amountRaw: 1, lamports: 1 });
  }
  const top = (await call(v, 'GET', '/api/diamonds')).body.top;
  assert.deepEqual(top.map((r) => [r.wallet, r.streak, r.neverSold]), [[a, 3, true], [b, 1, false]]);
});

test('X link is off until the keys are set', async () => {
  const v = vault();
  const t = await signIn(v, wallet());
  const r = await call(v, 'POST', '/api/auth/x/start', {}, t);
  assert.equal(r.status, 503);
});

test('community counts feature usage', async () => {
  const v = vault();
  const a = wallet();
  const t = await signIn(v, a);
  await call(v, 'POST', '/api/profile', { username: 'first_one' }, t);
  const c = v.id.community();
  assert.equal(c.members, 1);
  assert.equal(c.named, 1);
  assert.equal(c.joins[0].u, 'first_one');
});
