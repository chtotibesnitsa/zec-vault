import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import bs58 from 'bs58';
import { b64ToBytes, bytesToB64, WSOL_MINT } from './rpc.js';

export function loadKeypair(secret) {
  if (!secret) return null;
  const s = secret.trim();
  const bytes = s.startsWith('[') ? Uint8Array.from(JSON.parse(s)) : bs58.decode(s);
  return Keypair.fromSecretKey(bytes);
}

export function toBase58(bytes) {
  return bs58.encode(bytes);
}

// Real wallets are ed25519 points; pools, bonding curves and vaults are PDAs
// (off-curve). Only on-curve owners are paid.
export function isOnCurveAddress(addr) {
  try {
    return PublicKey.isOnCurve(new PublicKey(addr).toBytes());
  } catch {
    return false;
  }
}

export function isValidAddress(addr) {
  try {
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
}

async function signAndSend(rpc, tx, signer) {
  tx.sign([signer]);
  const sig = await rpc.sendRaw(bytesToB64(tx.serialize()));
  const c = await rpc.confirm(sig);
  if (!c.ok) {
    const e = new Error(`tx ${sig} failed: ${JSON.stringify(c.err)}`);
    e.sig = sig;
    throw e;
  }
  return sig;
}

// PumpPortal local API returns raw bytes of an unsigned VersionedTransaction.
async function pumpPortalTx(body) {
  const res = await fetch('https://pumpportal.fun/api/trade-local', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status !== 200) {
    const t = await res.text().catch(() => '');
    throw new Error(`PumpPortal ${body.action} HTTP ${res.status} ${t.slice(0, 200)}`);
  }
  return VersionedTransaction.deserialize(new Uint8Array(await res.arrayBuffer()));
}

// Claims all pump.fun creator fees owed to the treasury wallet.
export async function collectCreatorFees(rpc, signer, { priorityFee }) {
  const tx = await pumpPortalTx({
    publicKey: signer.publicKey.toBase58(),
    action: 'collectCreatorFee',
    priorityFee,
  });
  return signAndSend(rpc, tx, signer);
}

// Buys the vault's own token with SOL (works on the bonding curve and after
// migration with pool "auto").
export async function buyOwnToken(rpc, signer, { mint, sol, slippage, priorityFee }) {
  const tx = await pumpPortalTx({
    publicKey: signer.publicKey.toBase58(),
    action: 'buy',
    mint,
    amount: Number(sol.toFixed(9)),
    denominatedInSol: 'true',
    slippage,
    priorityFee,
    pool: 'auto',
  });
  return signAndSend(rpc, tx, signer);
}

// Swaps SOL into another reward token (for example a wrapped ZEC) via Jupiter.
export async function swapViaJupiter(rpc, signer, { outputMint, lamports, slippageBps, apiBase, apiKey }) {
  const headers = { 'content-type': 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;
  const q = new URL(`${apiBase}/quote`);
  q.searchParams.set('inputMint', WSOL_MINT);
  q.searchParams.set('outputMint', outputMint);
  q.searchParams.set('amount', lamports.toString());
  q.searchParams.set('slippageBps', String(slippageBps));
  const quoteRes = await fetch(q, { headers });
  if (!quoteRes.ok) throw new Error(`Jupiter quote HTTP ${quoteRes.status}`);
  const quoteResponse = await quoteRes.json();
  const swapRes = await fetch(`${apiBase}/swap`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      userPublicKey: signer.publicKey.toBase58(),
      quoteResponse,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { priorityLevel: 'high', maxLamports: 200000 } },
    }),
  });
  if (!swapRes.ok) throw new Error(`Jupiter swap HTTP ${swapRes.status}`);
  const { swapTransaction } = await swapRes.json();
  const tx = VersionedTransaction.deserialize(b64ToBytes(swapTransaction));
  return signAndSend(rpc, tx, signer);
}

// Sends one batch of reward transfers in a single transaction. Each recipient
// gets an idempotent ATA create (no-op if it exists) plus a checked transfer.
export async function sendPayoutBatch(rpc, signer, { rewardMint, rewardProgram, decimals, items, microLamports }) {
  const mint = new PublicKey(rewardMint);
  const programId = new PublicKey(rewardProgram);
  const from = getAssociatedTokenAddressSync(mint, signer.publicKey, false, programId);
  const ixs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 40000 * items.length + 20000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
  ];
  for (const it of items) {
    const owner = new PublicKey(it.wallet);
    const to = getAssociatedTokenAddressSync(mint, owner, false, programId);
    ixs.push(createAssociatedTokenAccountIdempotentInstruction(signer.publicKey, to, owner, mint, programId));
    ixs.push(createTransferCheckedInstruction(from, mint, to, signer.publicKey, it.amount, decimals, [], programId));
  }
  const { blockhash } = await rpc.getLatestBlockhash();
  const msg = new TransactionMessage({ payerKey: signer.publicKey, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
  const tx = new VersionedTransaction(msg);
  return signAndSend(rpc, tx, signer);
}
