// End-to-end check of the HTTP API, sign-in and database against a running
// worker (local `wrangler dev` or a test deployment). Uses throwaway wallets.
//   node scripts/api-e2e.mjs http://localhost:8787 <admin-key>
import { generateKeyPairSync, sign } from 'node:crypto';
import bs58 from 'bs58';

const BASE = process.argv[2] || 'http://localhost:8787';
const ADMIN = process.argv[3] || '';
let pass = 0;
let fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}${extra ? '  ' + extra : ''}`);
};
async function api(method, path, body, headers = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let j = null;
  try {
    j = await r.json();
  } catch {}
  return { status: r.status, body: j };
}
function wallet() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url');
  return { address: bs58.encode(raw), sign: (m) => bs58.encode(sign(null, Buffer.from(m), privateKey)) };
}
async function signIn(w) {
  const n = await api('POST', '/api/auth/nonce', { wallet: w.address });
  const v = await api('POST', '/api/auth/verify', { wallet: w.address, nonce: n.body.nonce, signature: w.sign(n.body.message) });
  return { n, v };
}
const tag = Date.now().toString(36).slice(-5);

// --- read API
let r = await api('GET', '/api/stats');
ok(r.status === 200 && r.body.config, 'stats loads', `symbol=${r.body?.config?.tokenSymbol}`);
r = await api('GET', '/api/feed?limit=5');
ok(r.status === 200 && Array.isArray(r.body.events), 'feed loads');
r = await api('GET', '/api/feed?after=abc&limit=zzz');
ok(r.status === 200, 'feed ignores bad paging values');
r = await api('GET', '/api/holder/not-a-wallet');
ok(r.body?.error === 'invalid wallet', 'holder rejects bad address');

// --- sign-in
const a = wallet();
const b = wallet();
const { n, v } = await signIn(a);
ok(n.status === 200 && n.body.message.includes(a.address), 'nonce issued for the wallet');
ok(n.body.message.startsWith(`${r.body ? '' : ''}`) && /vault sign-in/.test(n.body.message), 'sign-in message is plain text', JSON.stringify(n.body.message.split('\n')[0]));
ok(v.status === 200 && /^[0-9a-f]{64}$/.test(v.body.token), 'valid signature gives a session');
const token = v.body.token;
const auth = { authorization: `Bearer ${token}` };
r = await api('POST', '/api/auth/verify', { wallet: a.address, nonce: n.body.nonce, signature: a.sign(n.body.message) });
ok(r.status === 400, 'nonce cannot be reused');
const n2 = await api('POST', '/api/auth/nonce', { wallet: a.address });
r = await api('POST', '/api/auth/verify', { wallet: a.address, nonce: n2.body.nonce, signature: b.sign(n2.body.message) });
ok(r.status === 401, "another wallet's signature is rejected");
const n3 = await api('POST', '/api/auth/nonce', { wallet: a.address });
r = await api('POST', '/api/auth/verify', { wallet: b.address, nonce: n3.body.nonce, signature: b.sign(n3.body.message) });
ok(r.status === 400, 'nonce issued to one wallet cannot sign in another');

// --- profile writes, reads, uniqueness
r = await api('GET', '/api/me', null, auth);
ok(r.status === 200 && r.body.wallet === a.address, 'session reads own profile');
const name = `qa_${tag}`;
r = await api('POST', '/api/profile', { username: name }, auth);
ok(r.status === 200 && r.body.username === name, 'username saved', name);
r = await api('POST', '/api/profile', { username: 'x' }, auth);
ok(r.status === 400, 'too-short username rejected');
r = await api('POST', '/api/profile', { username: 'admin' }, auth);
ok(r.status === 400, 'reserved username rejected');
r = await api('POST', '/api/profile', { username: "a'; DROP TABLE profiles;--" }, auth);
ok(r.status === 400, 'injection-shaped username rejected');
const sb = await signIn(b);
const authB = { authorization: `Bearer ${sb.v.body.token}` };
r = await api('POST', '/api/profile', { username: name.toUpperCase() }, authB);
ok(r.status === 409, 'name is unique regardless of case');
r = await api('POST', '/api/profile', { username: `qb_${tag}`, ref: name }, authB);
ok(r.status === 200 && r.body.refBy === name, 'referral recorded');
r = await api('POST', '/api/profile', { ref: 'someone_else' }, authB);
ok(r.body.refBy === name, 'referral can only be set once');
r = await api('GET', `/api/u/${name}`);
ok(r.status === 200 && r.body.wallet === a.address && r.body.holder, 'public profile by name');
r = await api('GET', '/api/stats');
ok(r.body.community.members >= 2 && r.body.community.named >= 2, 'community counts update', JSON.stringify(r.body.community).slice(0, 80));
r = await api('POST', '/api/auth/x/start', {}, auth);
ok(r.status === 503, 'X link is off until keys are set');

// --- sign-out deletes the session
r = await api('POST', '/api/auth/logout', {}, auth);
ok(r.status === 200, 'sign-out');
r = await api('GET', '/api/me', null, auth);
ok(r.status === 401, 'old session no longer works');
r = await api('GET', '/api/me', null, { authorization: 'Bearer ' + '0'.repeat(64) });
ok(r.status === 401, 'made-up session rejected');

// --- admin
r = await api('GET', '/api/admin/status');
ok(r.status === 401, 'admin needs a key');
r = await api('GET', '/api/admin/status', null, { 'x-admin-key': 'wrong' });
ok(r.status === 401, 'wrong admin key rejected');
r = await api('POST', '/internal/tick');
ok(r.status === 404, 'internal tick is not reachable from outside');
if (ADMIN) {
  const h = { 'x-admin-key': ADMIN };
  r = await api('GET', '/api/admin/status', null, h);
  ok(r.status === 200 && 'pending' in r.body, 'admin status');
  r = await api('POST', '/api/admin/pause', { paused: true }, h);
  ok(r.body.paused === true, 'pause');
  r = await api('GET', '/api/config');
  ok(r.body.paused === true, 'pause is visible publicly');
  r = await api('POST', '/api/admin/pause', { paused: false }, h);
  ok(r.body.paused === false, 'unpause');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
