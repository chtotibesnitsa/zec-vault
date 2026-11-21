# Zatoshi launch guide (your accounts)

Everything runs on accounts you own:

| Piece | Where | Address |
|---|---|---|
| Site | Vercel, team **EcoDrop**, project `zec-vault` | https://zec-vault.vercel.app |
| Backend | Cloudflare, *Evansocials1111@gmail.com's Account*, worker `zec-vault-api` | https://zec-vault-api.privacy-vault-api.workers.dev |
| Vault wallet | Phantom | `BZ5Gn8TwLRsAciMuib67Hns48SDwXxy2jWs4z3ErET1K` |
| Code | GitHub | `main` branch of this repo |

Already done: the latest backend is deployed; the vault wallet key (`TREASURY_SECRET_KEY`), `ADMIN_KEY` and the Helius RPC (`SOLANA_RPC_URL`) are set in Cloudflare; and the site is connected to the backend (`VITE_API_URL` in Vercel).

## Before launch (do these once)

1. **Fund the vault wallet.** It holds 0.025 SOL. Send it about **0.2 SOL**: enough to create the coin, plus 0.05 SOL kept for network fees.
2. **Helius RPC: done.** `SOLANA_RPC_URL` is set in Cloudflare as a Text variable, and the backend reads Solana through it. To swap in another key later, edit that variable in Cloudflare → `zec-vault-api` → Settings → Variables and Secrets.
3. **Add a Jupiter key (recommended).** Get a free key at portal.jup.ag and add it the same way as a Secret named `JUPITER_API_KEY`. The swap works without it today, but Jupiter is retiring its keyless API.
4. **Exclude your own wallets (optional).** Add a Text variable `EXCLUDE_WALLETS` listing any dev or team wallets that shouldn't be paid, separated by commas.
5. **Payouts per cycle: set.** `MAX_RECIPIENTS_PER_CYCLE` is `30` in `functions/wrangler.jsonc`, so each payout round fits Cloudflare's free plan. The biggest 30 holders owed are paid each cycle (every 5 minutes), and the rest are paid on the following cycles. If you upgrade to Workers Paid ($5/mo), you can raise it to `60`.

Check: https://zec-vault-api.privacy-vault-api.workers.dev/ping should show `{"ok":true,...}`.

## Launch day

1. In Phantom, switch to the vault wallet (`BZ5Gn8…ET1K`) and **create the coin on Pump.fun from it**. Creator fees go to whichever wallet creates the coin, so this is the step that matters most.
2. Copy the coin's contract address (CA).
3. In Cloudflare → `zec-vault-api` → Variables and Secrets, add a Text variable `TOKEN_MINT` with the CA, then Deploy.
4. Open https://zec-vault.vercel.app/admin, enter your `ADMIN_KEY` and press **Load status**. "Live" should say **yes**. Press **Run cycle now** once.
5. Check https://zec-vault-api.privacy-vault-api.workers.dev/api/holders. Within a few minutes it lists everyone holding at least 100,000 $ZATS. The bonding curve, pools and the vault wallet are left out on purpose.

After that it runs itself. It claims fees every 5 minutes, buys ZEC with 80% of them, buys and burns $ZATS with the other 20%, and pays holders by balance. The first ZEC payout comes once at least 0.02 SOL of fees is booked for holders. If lots of people buy at once, their first ZEC accounts are opened over several cycles. Anyone not paid yet stays owed and gets paid on a later cycle.

## Updating it yourself later

From this folder, signed in with the `vercel` and `wrangler` CLIs you already have:

```bash
cd functions && npm test && npx wrangler deploy
```

```bash
cd web && vercel deploy --prod
```

Variables you set in the Cloudflare dashboard are kept when you redeploy the backend.

## If something looks wrong

- `/admin` → Load status shows the last error, the last claim note and any transaction still pending. A claim note that reads like a failed simulation usually just means there was nothing to claim yet.
- **Pause** in `/admin` stops all money movement until you press Resume.
- Never paste the vault wallet's private key anywhere except Cloudflare.
