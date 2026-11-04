// Every name, ticker and line of copy lives here, so a rename is one edit.
// VITE_VAULT picks the vault ("xmr" or "zec"); each repo sets its own default.

const BRANDS = {
  xmr: {
    key: 'xmr',
    name: 'Piconero',
    ticker: 'PICO',
    domain: 'piconero.fun',
    xHandle: 'piconero_sol',
    coin: 'XMR',
    chainName: 'Monero',
    accent: '#ff6600',
    accent2: '#ffb27a',
    glow: 'rgba(255,102,0,0.32)',
    aura: ['#ff6600', '#4c4c4c', '#ff9a3c'],
    emblem: 'xmr',
    theme: 'dark',
    accentDeep: '#8a3300',
    accentText: '#ff7a1f',
    hud: ['OBJ  piconero', 'RING  16 decoys', 'SIGNER  hidden'],
    statusWord: 'unlinkable',
    site: 'wraith-vault.vercel.app',
    trailer: {
      cmd: './piconero --decrypt',
      hook: ['THE SMALLEST UNIT', 'OF MONERO'],
      beats: ['EVERY TRADE PAYS A FEE', '80% TO HOLDERS', '10% BOUGHT AND BURNED', 'EVERY 5 MINUTES'],
    },
    kicker: 'Monero meta · on Solana',
    headline: 'One piconero at a time.',
    sub: 'Every trade of ${ticker} pays a creator fee. 80% goes back to holders as ${reward} every few minutes, 10% buys ${ticker} and burns it. Connect once to see what you earn. No staking, no KYC.',
    steps: [
      ['Someone trades ${ticker}', 'Every buy and sell, on any app, pays a small Pump.fun creator fee into the vault wallet.'],
      ['The vault splits it', '80% buys ${reward} for holders, 10% buys ${ticker} and burns it, 10% runs the project. All on-chain.'],
      ['You get paid', 'Every few minutes the vault snapshots holders and sends each wallet its share. Nothing to click.'],
    ],
    closer: 'Hold quietly. Get paid loudly.',
    faqExtra: [
      ['Do I get real XMR?', 'No. Monero can’t live on Solana without a custodian, and we won’t hold anyone’s coins. The vault pays in ${reward}, bought with real trading fees. Monero is the theme; payouts are Solana tokens you can sell anytime.'],
    ],
  },
  zec: {
    key: 'zec',
    name: 'Zatoshi',
    ticker: 'ZATS',
    domain: 'zatoshi.fun',
    xHandle: 'zatoshi_sol',
    coin: 'ZEC',
    chainName: 'Zcash',
    accent: '#e3a83a',
    accent2: '#f6d48e',
    glow: 'rgba(227,168,58,0.28)',
    aura: ['#e3a83a', '#3b3527', '#c98a1c'],
    emblem: 'zec',
    theme: 'dark',
    accentDeep: '#6e4a06',
    accentText: '#f0bf5e',
    hud: ['OBJ  zatoshi', 'POOL  orchard', 'VIEW KEY  none'],
    statusWord: 'shielded',
    site: 'orchard-vault.vercel.app',
    trailer: {
      cmd: './zatoshi --shield',
      hook: ['THE SMALLEST UNIT', 'OF ZCASH'],
      beats: ['EVERY TRADE PAYS A FEE', '80% TO HOLDERS', '10% BOUGHT AND BURNED', 'EVERY 5 MINUTES'],
    },
    kicker: 'Zcash meta · on Solana',
    headline: 'Shielded by design. Paid by the minute.',
    sub: 'Every trade of ${ticker} pays a creator fee. 80% is swapped into ${reward} and sent to every holder on a timer, 10% buys ${ticker} and burns it. Hold in any wallet. No staking, no KYC.',
    steps: [
      ['Someone trades ${ticker}', 'Every buy and sell, on any app, pays a small Pump.fun creator fee into the vault wallet.'],
      ['The vault shields it', '80% becomes ${reward} for holders, 10% buys ${ticker} and burns it, 10% runs the project.'],
      ['You get paid', 'Every few minutes the vault splits ${reward} across holders by balance and sends it.'],
    ],
    closer: 'Shield your bag. Collect every five minutes.',
    faqExtra: [
      ['Is this real ZEC?', 'If the reward is set to a wrapped ZEC token on Solana (such as Zenrock’s zenZEC), you receive that token, which its issuer backs 1:1 with ZEC. Otherwise the vault pays in ${ticker} bought back from the market. The token section always shows exactly what is paid.'],
    ],
  },
};

const key = (import.meta.env.VITE_VAULT || 'xmr').toLowerCase();
const base = BRANDS[key] || BRANDS.xmr;

export const brand = {
  ...base,
  name: import.meta.env.VITE_BRAND_NAME || base.name,
  ticker: import.meta.env.VITE_TICKER || base.ticker,
  xHandle: import.meta.env.VITE_X_HANDLE || base.xHandle,
  apiUrl: (import.meta.env.VITE_API_URL || '').replace(/\/$/, ''),
};

// Fills ${ticker} and ${reward} in copy strings.
export function fill(s, cfg) {
  const ticker = '$' + (cfg?.tokenSymbol && cfg.tokenSymbol !== 'VAULT' ? cfg.tokenSymbol : brand.ticker);
  const reward = cfg && !cfg.rewardIsOwnToken && cfg.rewardSymbol ? cfg.rewardSymbol : ticker;
  return s.replaceAll('${ticker}', ticker).replaceAll('${reward}', reward);
}
