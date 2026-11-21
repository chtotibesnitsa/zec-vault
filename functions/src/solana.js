import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createBurnCheckedInstruction,
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

// Associated token account of a wallet for a mint.
export function ataAddress(mint, owner, program) {
  return getAssociatedTokenAddressSync(new PublicKey(mint), new PublicKey(owner), false, new PublicKey(program)).toBase58();
}

export function isValidAddress(addr) {
  try {
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
}

// Every money transaction goes through two steps: build + sign (the signature
// is known before anything is sent, so the vault can record it as pending),
// then send + confirm. A confirm timeout is NOT a failure: the transaction may
// still land, so the caller keeps it pending and settles it later.
async function finish(rpc, signer, tx, lastValid) {
  tx.sign([signer]);
  return { tx, sig: bs58.encode(tx.signatures[0]), lastValid };
}

// Upper bound for when a transaction built elsewhere (PumpPortal, Jupiter) can
// no longer land. Waiting a little too long is safe; too short is not.
async function lastValidSoon(rpc) {
  return (await rpc.getBlockHeight()) + 160;
}

export async function sendSigned(rpc, built) {
  try {
    await rpc.sendRaw(bytesToB64(built.tx.serialize()));
  } catch (e) {
    // A JSON-RPC error (failed preflight) means the network rejected it outright.
    // A network error is ambiguous: it may have been received, so keep it pending.
    return e.rpc ? { state: 'failed', err: e.message } : { state: 'pending', err: e.message };
  }
  const c = await rpc.confirm(built.sig);
  if (c.ok) return { state: 'ok' };
  if (c.err === 'timeout') return { state: 'pending', err: 'timeout' };
  return { state: 'failed', err: c.err };
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

// Claim of all pump.fun creator fees owed to the treasury wallet.
export async function buildClaimTx(rpc, signer, { priorityFee }) {
  const tx = await pumpPortalTx({ publicKey: signer.publicKey.toBase58(), action: 'collectCreatorFee', priorityFee });
  return finish(rpc, signer, tx, await lastValidSoon(rpc));
}

// Buy of the vault's own token with SOL (bonding curve, or the AMM after
// migration, via pool "auto").
export async function buildBuyTx(rpc, signer, { mint, sol, slippage, priorityFee }) {
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
  return finish(rpc, signer, tx, await lastValidSoon(rpc));
}

// Swap of SOL into a token via Jupiter (no swap fee). Tight slippage: the
// quote already prices in impact, and a wide tolerance only invites sandwich
// bots. Priority fee is capped; a swap that misses is simply retried.
export async function buildJupiterTx(rpc, signer, { outputMint, lamports, slippageBps, apiBase, apiKey, priorityLevel = 'medium', maxPriorityLamports = 50000 }) {
  const headers = { 'content-type': 'application/json' };
  if (apiKey) headers['x-api-key'] = apiKey;
  const q = new URL(`${apiBase}/quote`);
  q.searchParams.set('inputMint', WSOL_MINT);
  q.searchParams.set('outputMint', outputMint);
  q.searchParams.set('amount', lamports.toString());
  q.searchParams.set('slippageBps', String(slippageBps));
  q.searchParams.set('restrictIntermediateTokens', 'true');
  const quoteRes = await fetch(q, { headers });
  if (!quoteRes.ok) throw new Error(`Jupiter quote HTTP ${quoteRes.status}`);
  const quoteResponse = await quoteRes.json();
  if (!quoteResponse.outAmount || quoteResponse.outAmount === '0') throw new Error(`Jupiter found no route to ${outputMint}`);
  const swapRes = await fetch(`${apiBase}/swap`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      userPublicKey: signer.publicKey.toBase58(),
      quoteResponse,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: { priorityLevelWithMaxLamports: { priorityLevel, maxLamports: maxPriorityLamports } },
    }),
  });
  if (!swapRes.ok) throw new Error(`Jupiter swap HTTP ${swapRes.status}`);
  const { swapTransaction, lastValidBlockHeight } = await swapRes.json();
  const tx = VersionedTransaction.deserialize(b64ToBytes(swapTransaction));
  return finish(rpc, signer, tx, lastValidBlockHeight || (await lastValidSoon(rpc)));
}

// One batch of reward transfers in a single transaction. Each recipient gets
// an idempotent ATA create (no-op if it exists) plus a checked transfer.
export async function buildPayoutTx(rpc, signer, { rewardMint, rewardProgram, decimals, items, microLamports }) {
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
    ixs.push(createTransferCheckedInstruction(from, mint, to, signer.publicKey, BigInt(it.amount), decimals, [], programId));
  }
  const { blockhash, lastValidBlockHeight } = await rpc.getLatestBlockhash();
  const msg = new TransactionMessage({ payerKey: signer.publicKey, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
  return finish(rpc, signer, new VersionedTransaction(msg), lastValidBlockHeight);
}

export async function sendPayoutBatch(rpc, signer, opts) {
  const built = await buildPayoutTx(rpc, signer, opts);
  const r = await sendSigned(rpc, built);
  if (r.state !== 'ok') throw Object.assign(new Error(`tx ${built.sig} ${r.state}`), { sig: built.sig, pending: r.state === 'pending' });
  return built.sig;
}

// Burn of tokens held by the treasury. Supply goes down for good.
export async function buildBurnTx(rpc, signer, { mint, program, amount, decimals, microLamports }) {
  const m = new PublicKey(mint);
  const programId = new PublicKey(program);
  const ata = getAssociatedTokenAddressSync(m, signer.publicKey, false, programId);
  const ixs = [
    ComputeBudgetProgram.setComputeUnitLimit({ units: 30000 }),
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
    createBurnCheckedInstruction(ata, m, signer.publicKey, BigInt(amount), decimals, [], programId),
  ];
  const { blockhash, lastValidBlockHeight } = await rpc.getLatestBlockhash();
  const msg = new TransactionMessage({ payerKey: signer.publicKey, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
  return finish(rpc, signer, new VersionedTransaction(msg), lastValidBlockHeight);
}

export async function burnTokens(rpc, signer, opts) {
  const built = await buildBurnTx(rpc, signer, opts);
  const r = await sendSigned(rpc, built);
  if (r.state !== 'ok') throw Object.assign(new Error(`tx ${built.sig} ${r.state}`), { sig: built.sig, pending: r.state === 'pending' });
  return built.sig;
}
