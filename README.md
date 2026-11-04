# Privacy vault (hold to earn)

A memecoin vault on Solana. Every trade of the coin on Pump.fun pays a creator fee to the vault wallet. On a timer the backend claims those fees, spends the holders' share buying the reward token, snapshots everyone holding the coin and sends each wallet its share. Holders do nothing: no staking, no claiming, no sign-up.

- `web/` is the site (Vite + React), hosted on Vercel.
- `functions/` is the backend: a Cloudflare Worker plus one Durable Object that keeps the ledger. It runs every minute.

Nothing is simulated. Every row in the live feed, marquee and pop-ups is a real Solana transaction with a Solscan link. Before launch the site shows empty states instead of numbers.

## How the money moves

1. **Claim.** Every `CLAIM_EVERY_MINUTES` (default 30) the worker claims all Pump.fun creator fees owed to the vault wallet (through PumpPortal's local API, signed by the vault wallet).
2. **Split.** The SOL received is booked: `REWARD_SHARE_BPS` (default 8000 = 80%) to holders, the rest to ops. Ops stays in the wallet for you to withdraw by hand.
3. **Buy.** Every `CYCLE_MINUTES` (default 5), if the holders' budget is at least `MIN_CYCLE_SOL`, the worker buys the reward token. With `REWARD_MINT` empty it buys back the vault's own coin on Pump.fun/PumpSwap. With `REWARD_MINT` set it swaps on Jupiter into that token.
4. **Snapshot.** It reads every token account of the coin, adds them up per owner and drops pools, bonding curves and other program accounts (off-curve owners), the vault wallet, anything in `EXCLUDE_WALLETS`, and anyone under `MIN_HOLD_TOKENS`.
5. **Pay.** Each holder is credited `pool × balance ÷ total`. Wallets owed at least `MIN_PAYOUT` are paid, biggest first, up to `MAX_RECIPIENTS_PER_CYCLE`, 8 transfers per transaction. It never sends more than the wallet holds; anything not sent stays owed for the next cycle.

## Go live (no command line)

You need: Phantom, about 0.2 SOL, a free Helius account, Cloudflare and Vercel.

### 1. The vault wallet
1. In Phantom, add a **new** account just for this vault. Don't reuse a wallet that holds anything else.
2. Fund it with about 0.2 SOL (launch cost plus network fees for payouts).
3. This wallet must be the one that **creates** the coin on Pump.fun, so the creator fees land in it.
4. Phantom → account → Settings → Manage accounts → this account → Show private key. Copy it. Paste it **only** into Cloudflare in step 3. Never into chat, never into Vercel.

### 2. RPC
Sign up at helius.dev (free plan) and copy the **Mainnet RPC URL**. The public Solana RPC blocks the holder snapshot call, so this is required.

### 3. Backend on Cloudflare
1. dash.cloudflare.com → Workers & Pages → Create → Import a repository → pick this repo.
2. Project name: exactly the `name` in `functions/wrangler.jsonc` (`xmr-vault-api` or `zec-vault-api`).
3. Advanced settings → Root directory: `functions`. Build command empty. Deploy command `npx wrangler deploy`.
4. Deploy, then copy the `workers.dev` URL. Open `<url>/ping`: you should see `{"ok":true,...}`.
5. Worker → Settings → Variables and Secrets. Add:

| Name | Type | Value |
|---|---|---|
| `SOLANA_RPC_URL` | Secret | Helius mainnet URL |
| `TREASURY_SECRET_KEY` | Secret | vault wallet private key from step 1 |
| `ADMIN_KEY` | Secret | a long random password, your login for `/admin` |
| `TOKEN_SYMBOL` | Text | the ticker without `$` |
| `TOKEN_MINT` | Text | leave empty until the coin exists |
| `REWARD_MINT` | Text | empty = buy back own coin. Or a reward token mint (see below) |
| `REWARD_SYMBOL` | Text | e.g. `zenZEC`, only if `REWARD_MINT` is set |
| `REWARD_SHARE_BPS` | Text | `8000` |
| `MIN_HOLD_TOKENS` | Text | `100000` (0.01% of supply) |
| `EXCLUDE_WALLETS` | Text | comma-separated wallets never to pay (your dev or team wallets) |

Optional: `CYCLE_MINUTES` (5), `CLAIM_EVERY_MINUTES` (30), `GAS_RESERVE_SOL` (0.05), `MIN_CYCLE_SOL` (0.02), `MIN_PAYOUT` (0), `MAX_RECIPIENTS_PER_CYCLE` (60), `SLIPPAGE_PCT` (15), `JUPITER_API_KEY`.

6. Deployments → redeploy so the values load.

### 4. Site on Vercel
1. vercel.com → Add New → Project → import this repo.
2. Root directory: `web`. Framework: Vite.
3. Environment variable `VITE_API_URL` = the workers.dev URL (no trailing slash). Optional: `VITE_BRAND_NAME`, `VITE_TICKER`, `VITE_X_HANDLE` to rename without code changes.
4. Deploy. Add your domain under Settings → Domains.

### 5. Launch day
1. Create the coin on Pump.fun **from the vault wallet**.
2. Copy the mint (CA). Set `TOKEN_MINT` in Cloudflare, redeploy the worker.
3. Open `yoursite/admin`, enter `ADMIN_KEY`, press Load status. "Live" should say yes. Press Run cycle now once.
4. Within a minute the marquee and feed show real trades. The first payout happens once fees have been claimed and at least `MIN_CYCLE_SOL` is booked for holders.

### 6. Sign-in, names and X (optional, switch on any time)
Wallet sign-in works as soon as the worker is live. People connect Phantom, Solflare, Backpack or MetaMask's Solana account and sign one free message. That message sends no transaction and can't move funds. They pick a public name, which replaces their address on trades, payouts and leaderboards, and they get an invite link.

To let people link their X account as well:
1. Go to developer.x.com, then Projects & Apps, then create an app. Turn on **OAuth 2.0** with type **Web App**.
2. Set the callback URL to `<workers.dev URL>/api/auth/x/callback` and the website to your site URL.
3. Copy the OAuth 2.0 **Client ID** and **Client Secret**, and add them in Cloudflare:

| Name | Type | Value |
|---|---|---|
| `X_CLIENT_ID` | Secret | OAuth 2.0 client ID |
| `X_CLIENT_SECRET` | Secret | OAuth 2.0 client secret |
| `SITE_URL` | Text | your site, e.g. `https://orchard-vault.vercel.app` (where people return after X) |
| `BRAND_NAME` | Text | `Wraith` or `Orchard`, shown in the sign-in message |

4. Redeploy. The **Link X** button appears in the account panel. We only read the public username and avatar (`users.read`). We never post for anyone.

## Launch trailer
`/trailer.html` on the site plays the launch teaser live, built from the site's own components. Add `?cut=explainer` for the longer explainer. To render a 60fps MP4 with sound, run this from the repo root, with Node, Playwright, ffmpeg and Python with numpy installed:

```
cd web && npm run build && cd ..
node trailer/render.cjs web/dist teaser orchard-teaser.mp4 zec
```

The soundtrack is synthesized by `trailer/sfx.py`, so no samples or licenses are involved. Activity in the trailer is a redacted UI preview, never real or invented wallets.

### Reward token choices
- **Own coin (default).** Fees buy the coin back and hand it to holders, like a buyback but paid out instead of burned. Always works.
- **Wrapped ZEC.** Zenrock's zenZEC is wrapped ZEC on Solana, backed 1:1 by its issuer. Get the mint address from Zenrock's own site or app, check it on Solscan, then set `REWARD_MINT` and `REWARD_SYMBOL`.
- **XMR.** There is no wrapped XMR on Solana with a known issuer or proof of backing, so don't pay in one. Real XMR can't be sent to Solana wallets.

## Operator panel
`/admin` on the site. Enter `ADMIN_KEY`. Shows fees claimed, ops balance, rewards paid, last errors, and has Run cycle now and Pause/Resume. "Last claim note" often reads as a failed simulation when there was simply nothing to claim; that's normal.

## Safety notes
- The vault wallet key lives in Cloudflare as a secret. Keep only what the vault needs in that wallet. Withdraw the ops share regularly.
- Rewards come only from real fees. If volume stops, payouts stop. The site says so.
- This never takes deposits and never holds anyone else's funds.

## Develop
```
cd functions && npm install && npm test   # 12 tests, payouts run on a local Solana VM
cd web && npm install && npm run build
```
