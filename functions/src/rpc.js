// Minimal Solana JSON-RPC client built on fetch. Works in Cloudflare Workers
// without websockets (web3.js confirmTransaction relies on them).

export class Rpc {
  constructor(url) {
    if (!url) throw new Error('SOLANA_RPC_URL is not set');
    this.url = url;
    this.id = 0;
  }

  async call(method, params = []) {
    const body = JSON.stringify({ jsonrpc: '2.0', id: ++this.id, method, params });
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(this.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
        });
        if (res.status === 429 || res.status >= 500) {
          lastErr = new Error(`RPC ${method} HTTP ${res.status}`);
          await sleep(400 * (attempt + 1));
          continue;
        }
        const json = await res.json();
        if (json.error) {
          const e = new Error(`RPC ${method}: ${json.error.message || JSON.stringify(json.error)}`);
          e.rpc = json.error;
          throw e;
        }
        return json.result;
      } catch (e) {
        if (e.rpc) throw e;
        lastErr = e;
        await sleep(400 * (attempt + 1));
      }
    }
    throw lastErr;
  }

  getBalance(pubkey) {
    return this.call('getBalance', [pubkey, { commitment: 'confirmed' }]).then((r) => r.value);
  }

  getLatestBlockhash() {
    return this.call('getLatestBlockhash', [{ commitment: 'confirmed' }]).then((r) => r.value);
  }

  getAccountInfoParsed(pubkey) {
    return this.call('getAccountInfo', [pubkey, { encoding: 'jsonParsed', commitment: 'confirmed' }]).then((r) => r.value);
  }

  getTransaction(sig) {
    return this.call('getTransaction', [
      sig,
      { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
    ]);
  }

  getSignaturesForAddress(address, opts = {}) {
    return this.call('getSignaturesForAddress', [address, { commitment: 'confirmed', ...opts }]);
  }

  sendRaw(base64Tx) {
    return this.call('sendTransaction', [
      base64Tx,
      { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3 },
    ]);
  }

  // Polls until the signature is confirmed, fails, or times out.
  async confirm(sig, timeoutMs = 50000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const r = await this.call('getSignatureStatuses', [[sig], { searchTransactionHistory: false }]);
      const st = r.value[0];
      if (st) {
        if (st.err) return { ok: false, err: st.err };
        if (st.confirmationStatus === 'confirmed' || st.confirmationStatus === 'finalized') return { ok: true };
      }
      await sleep(1500);
    }
    return { ok: false, err: 'timeout' };
  }

  // All token accounts for a mint, returning only owner and raw amount.
  // dataSlice keeps the payload tiny: owner is bytes 32..64, amount 64..72.
  async getHolderAccounts(mint, tokenProgram) {
    const filters = [{ memcmp: { offset: 0, bytes: mint } }];
    if (tokenProgram === TOKEN_PROGRAM) filters.push({ dataSize: 165 });
    const res = await this.call('getProgramAccounts', [
      tokenProgram,
      { encoding: 'base64', commitment: 'confirmed', dataSlice: { offset: 32, length: 40 }, filters },
    ]);
    return res.map((a) => {
      const bytes = b64ToBytes(a.account.data[0]);
      return { owner: bytes.slice(0, 32), amount: readU64LE(bytes, 32) };
    });
  }
}

export const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
export const TOKEN_2022_PROGRAM = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PeEsN7J9ScAp3T';
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function b64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

export function readU64LE(bytes, offset) {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(bytes[offset + i]);
  return v;
}
