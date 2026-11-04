// Every name, ticker and line of copy lives here, so a rename is one edit.
// VITE_VAULT picks the vault ("xmr" or "zec"); each repo sets its own default.

const BRANDS = {
  xmr: {
    key: 'xmr',
    name: 'Wraith',
    ticker: 'WRAITH',
    domain: 'wraith.fun',
    xHandle: 'wraithvault',
    accent: '#ff6a13',
    accent2: '#ffb27a',
    glow: 'rgba(255,106,19,0.35)',
    aura: ['#ff6a13', '#8b5cf6', '#e11d74'],
    emblem: 'rings',
    theme: 'dark',
    accentDeep: '#9c3500',
    accentText: '#ff7a2b',
    hud: ['OBJ  ring signature', 'DECOYS  11', 'SIGNER  hidden'],
    statusWord: 'unseen',
    site: 'wraith-vault.vercel.app',
    trailer: {
      cmd: './wraith --decrypt',
      hook: ['ONE SIGNER.', 'TEN DECOYS.'],
      beats: ['EVERY TRADE PAYS A FEE', 'THE VAULT BUYS $WRAITH', 'HOLDERS GET PAID', 'EVERY 5 MINUTES'],
    },
    kicker: 'Monero meta · Solana vault',
    headline: 'Hold in silence. Get paid in public.',
    sub: 'Every trade of ${ticker} pays creator fees. The vault spends its share buying ${reward} and drops it straight into holders’ wallets every few minutes. No staking, no sign-up, no KYC.',
    steps: [
      ['Every trade feeds the wraith', 'Each buy and sell of ${ticker} on Pump.fun pays a creator fee into the vault wallet.'],
      ['The vault buys ${reward}', 'On a timer the vault claims those fees and buys ${reward} on the open market. Nothing is minted.'],
      ['Holders get paid', 'The vault snapshots every wallet holding ${ticker} and sends each its share. You don’t click anything.'],
    ],
    closer: 'Stay unseen. Keep holding. The wraith pays.',
    faqExtra: [
      ['Do I get real XMR?', 'No. Monero can’t live on Solana without a custodian, and we won’t hold anyone’s coins. The vault pays in ${reward}, bought with real trading fees. The theme is Monero; the payouts are Solana tokens you can sell anytime.'],
    ],
  },
  zec: {
    key: 'zec',
    name: 'Orchard',
    ticker: 'ORCHARD',
    domain: 'orchard.fun',
    xHandle: 'orchardvault',
    accent: '#f4b728',
    accent2: '#ffe29a',
    glow: 'rgba(244,183,40,0.33)',
    aura: ['#f4b728', '#6366f1', '#f97316'],
    emblem: 'shield',
    theme: 'light',
    accentDeep: '#a76f00',
    accentText: '#8f5c00',
    hud: ['OBJ  shielded note', 'POOL  orchard', 'VIEW KEY  none'],
    statusWord: 'shielded',
    site: 'orchard-vault.vercel.app',
    trailer: {
      cmd: './orchard --harvest',
      hook: ['SHIELDED', 'BY DESIGN.'],
      beats: ['EVERY TRADE PLANTS A SEED', 'FEES BECOME $ORCHARD', 'HOLDERS HARVEST', 'EVERY 5 MINUTES'],
    },
    kicker: 'Zcash meta · Solana vault',
    headline: 'Every trade grows the orchard.',
    sub: 'Every trade of ${ticker} pays creator fees. The vault turns its share into ${reward} and sends it to every holder on a timer. Hold in any wallet. No staking, no sign-up, no KYC.',
    steps: [
      ['Trades plant seeds', 'Each buy and sell of ${ticker} on Pump.fun pays a creator fee into the vault wallet.'],
      ['Fees become ${reward}', 'The vault claims fees and swaps the holders’ share into ${reward} at market price.'],
      ['Holders harvest', 'Every few minutes the vault splits ${reward} across all holders by balance and sends it.'],
    ],
    closer: 'Plant once. Hold. Harvest every five minutes.',
    faqExtra: [
      ['Is this real ZEC?', 'If the reward is set to a wrapped ZEC token on Solana (such as Zenrock’s zenZEC), you receive that token, which its issuer backs 1:1 with ZEC. Otherwise the vault pays in ${ticker} bought back from the market. The token section below always shows exactly what is paid.'],
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
