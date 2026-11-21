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

// MetaMask's EVM side, announced through EIP-6963. Tells "installed but no
// Solana account yet" apart from "not installed". rdns is MetaMask's own id,
// so other wallets that set ethereum.isMetaMask for compatibility don't count.
let metaMaskEvm = false;

if (typeof window !== 'undefined') {
  window.addEventListener('eip6963:announceProvider', (e) => {
    if (e.detail?.info?.rdns === 'io.metamask' || e.detail?.info?.rdns === 'io.metamask.flask') {
      if (!metaMaskEvm) {
        metaMaskEvm = true;
        listeners.forEach((fn) => fn());
      }
    }
  });
  try {
    window.dispatchEvent(new Event('eip6963:requestProvider'));
  } catch {
    /* old browsers */
  }
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

const isMetaMaskName = (n) => /metamask/i.test(n || '');

// MetaMask first when its Solana account is there, then the rest.
export function listWallets() {
  const all = [...found.values(), ...legacy()];
  return [...all.filter((w) => isMetaMaskName(w.name)), ...all.filter((w) => !isMetaMaskName(w.name))];
}

// 'ready': MetaMask's Solana account is available to connect.
// 'no-solana': MetaMask is installed but has no Solana account turned on.
// 'missing': MetaMask isn't in this browser.
export function metaMaskStatus() {
  if ([...found.keys()].some(isMetaMaskName)) return 'ready';
  return metaMaskEvm ? 'no-solana' : 'missing';
}

export const METAMASK_DOWNLOAD = 'https://metamask.io/download/';

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

// Mainnet as the wallet names it: 'solana:mainnet' (Wallet Standard) or the
// CAIP-2 genesis-hash form some wallets, MetaMask among them, may report.
const MAINNET_CAIP = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp';
function mainnetChain(account, wallet) {
  const chains = [...(account.chains || []), ...(wallet.chains || [])];
  if (chains.includes('solana:mainnet')) return 'solana:mainnet';
  if (chains.includes(MAINNET_CAIP)) return MAINNET_CAIP;
  return 'solana:mainnet';
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
        const out = await f.signAndSendTransaction({ account, transaction: bytes, chain: mainnetChain(account, w.raw) });
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
      throw new Error('Open this page in Phantom, MetaMask, Solflare or Backpack to swap');
    },
    disconnect: () => p.disconnect?.(),
  };
}
