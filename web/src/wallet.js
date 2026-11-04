// Finds Solana wallets through the Wallet Standard (Phantom, Solflare,
// Backpack, MetaMask's Solana account and others) with a fallback to the
// older injected providers. Sign-in asks only for a message signature. The
// swap page asks the wallet to sign and send a swap the user reviews first.

const found = new Map();
const listeners = new Set();

function add(w) {
  if (!w?.name || found.has(w.name)) return;
  const f = w.features || {};
  const solana = (w.chains || []).some((c) => c.startsWith('solana:'));
  if (!solana || !f['standard:connect'] || !f['solana:signMessage']) return;
  found.set(w.name, { kind: 'standard', name: w.name, icon: w.icon, raw: w });
  listeners.forEach((fn) => fn());
}

if (typeof window !== 'undefined') {
  const api = { register: (...ws) => (ws.forEach(add), () => {}) };
  window.addEventListener('wallet-standard:register-wallet', (e) => {
    try {
      e.detail(api);
    } catch {
      /* a broken wallet shouldn't break the page */
    }
  });
  try {
    window.dispatchEvent(new CustomEvent('wallet-standard:app-ready', { detail: api }));
  } catch {
    /* old browsers */
  }
}

function legacy() {
  const out = [];
  const w = window;
  if (w.phantom?.solana?.isPhantom && !found.has('Phantom')) out.push({ kind: 'legacy', name: 'Phantom', provider: w.phantom.solana });
  if (w.solflare?.isSolflare && !found.has('Solflare')) out.push({ kind: 'legacy', name: 'Solflare', provider: w.solflare });
  if (w.backpack?.isBackpack && !found.has('Backpack')) out.push({ kind: 'legacy', name: 'Backpack', provider: w.backpack });
  return out;
}

export function listWallets() {
  return [...found.values(), ...legacy()];
}

export function onWalletsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const isMobile = () => /android|iphone|ipad|ipod/i.test(navigator.userAgent);

// Opens this page inside a mobile wallet's built-in browser.
export function deepLinks() {
  const here = encodeURIComponent(window.location.href);
  const ref = encodeURIComponent(window.location.origin);
  return [
    { name: 'Phantom', url: `https://phantom.app/ul/browse/${here}?ref=${ref}` },
    { name: 'Solflare', url: `https://solflare.com/ul/v1/browse/${here}?ref=${ref}` },
    { name: 'MetaMask', url: `https://metamask.app.link/dapp/${window.location.host}${window.location.pathname}` },
  ];
}

const toB64 = (bytes) => btoa(String.fromCharCode(...bytes));

const ALPHA = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let out = '';
  while (n > 0n) {
    out = ALPHA[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out;
}

// Connects and returns { address, signMessage(text) -> base64 signature }.
export async function connect(w) {
  if (w.kind === 'standard') {
    const res = await w.raw.features['standard:connect'].connect();
    const account = (res?.accounts || w.raw.accounts || []).find((a) => (a.chains || []).some((c) => c.startsWith('solana:'))) || (res?.accounts || w.raw.accounts)[0];
    if (!account) throw new Error('No Solana account in this wallet');
    return {
      address: account.address,
      async signMessage(text) {
        const out = await w.raw.features['solana:signMessage'].signMessage({ account, message: new TextEncoder().encode(text) });
        const first = Array.isArray(out) ? out[0] : out;
        return toB64(first.signature);
      },
      canSwap: Boolean(w.raw.features['solana:signAndSendTransaction']),
      // Takes the raw bytes of an unsigned VersionedTransaction, returns the base58 signature.
      async signAndSend(bytes) {
        const f = w.raw.features['solana:signAndSendTransaction'];
        if (!f) throw new Error('This wallet cannot send transactions from here');
        const out = await f.signAndSendTransaction({ account, transaction: bytes, chain: 'solana:mainnet' });
        const first = Array.isArray(out) ? out[0] : out;
        return b58(first.signature);
      },
      disconnect: () => w.raw.features['standard:disconnect']?.disconnect?.(),
    };
  }
  const p = w.provider;
  const r = await p.connect();
  const address = (r?.publicKey || p.publicKey).toString();
  return {
    address,
    async signMessage(text) {
      const out = await p.signMessage(new TextEncoder().encode(text), 'utf8');
      return toB64(out.signature || out);
    },
    canSwap: false,
    async signAndSend() {
      throw new Error('Open this page in Phantom, Solflare or Backpack to swap');
    },
    disconnect: () => p.disconnect?.(),
  };
}
