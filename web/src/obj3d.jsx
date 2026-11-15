import { Coin } from './coin.jsx';
// Small 3D objects that sit inside the information boxes. Each one shows
// what its box says, and none repeats.
// Each object is a path-traced render made by the dev render bench
// (/render.html, see src/render/), shipped as a transparent WebP. No 3D
// runs in the visitor's browser; a slow CSS float keeps them alive.
function Obj({ kind, className = '', label }) {
  return (
    <div className={`o3 float ${className}`} aria-hidden={label ? undefined : 'true'} role={label ? 'img' : undefined} aria-label={label}>
      <img src={`/renders/${kind}.webp`} alt="" loading="lazy" decoding="async" draggable="false" />
    </div>
  );
}

// A coin spinning: 24 path-traced frames in one strip, stepped by CSS.
export function Spin({ kind = 'zats', className = '' }) {
  return (
    <span className={`spin ${className}`}>
      <img src={`/renders/spin-${kind}.webp`} alt="" decoding="async" draggable="false" />
    </span>
  );
}

// ---- home: how it works ----
export const SwapCubes = () => <Obj kind="swap" className="o-swapcubes" />;
export const FeeSplit = () => <Obj kind="split" className="o-feesplit" />;
export const CoinDrop = () => <Obj kind="coindrop" className="o-coindrop" />;

// ---- home: start in 30 seconds ----
export const ZCoin = () => (
  <div className="o3 o-zcoin o-vcoin" aria-hidden="true">
    <Coin kind="zats" size={88} spin />
  </div>
);
export const HoldSafe = () => <Obj kind="safe" className="o-safe" />;
export const NameCard = () => <Obj kind="namecard" className="o-namecard" />;
export const FriendsOrbit = () => <Obj kind="friends" className="o-friends" />;

// ---- proof numbers (small) ----
export const CoinStack = () => <Obj kind="coinstack" className="o-mini o-stack" />;
export const BurnBlock = () => <Obj kind="burn" className="o-mini o-burnblock" />;
export const HolderGrid = () => <Obj kind="holders" className="o-mini o-holders" />;
export const TradeBars = () => <Obj kind="bars" className="o-mini o-bars" />;
export const FeePrism = () => <Obj kind="prism" className="o-mini o-prism" />;

// ---- live page ----
export const Furnace = () => <Obj kind="furnace" className="o-furnace" />;

// ---- swap page ----
export const WalletKey = () => <Obj kind="wallet" className="o-mini o-wallet" />;
export const TimerRing = () => <Obj kind="timer" className="o-mini o-timer" />;
export const ShieldGem = () => <Obj kind="shield" className="o-mini o-shield" />;

// ---- how page: token spec ----
// How page: where every fee goes, as a chart that draws itself.
export function TokenCoin({ ticker, share = 80, burn = 10 }) {
  const ops = Math.max(0, 100 - share - burn);
  const R = 70;
  const C = 2 * Math.PI * R;
  const parts = [
    ['pay', share, 'to holders'],
    ['burn', burn, 'bought and burned'],
    ['vault', ops, 'runs the project'],
  ];
  let acc = 0;
  return (
    <div className="fee-donut" role="img" aria-label={`$${ticker}: ${share}% of fees to holders, ${burn}% burned, ${ops}% operations`}>
      <svg viewBox="0 0 200 200">
        <circle cx="100" cy="100" r={R} className="fd-track" />
        {parts.map(([tone, pct], i) => {
          const len = (pct / 100) * C;
          const el = (
            <circle
              key={tone}
              cx="100"
              cy="100"
              r={R}
              className={`fd-arc tone-${tone}`}
              style={{ '--len': len, '--gap': C - len, '--off': -acc + C * 0.25, '--i': i }}
            />
          );
          acc += len;
          return el;
        })}
      </svg>
      <div className="fd-center">
        <b>{share}%</b>
        <span>of every fee goes back to holders</span>
      </div>
      <ul className="fd-legend">
        {parts.map(([tone, pct, label]) => (
          <li key={tone} className={`tone-${tone}`}>
            <i /> <b>{pct}%</b> {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---- boards ----
export const MiniPodium = () => <Obj kind="podium" className="o-mini o-podium" />;
export const SignalTower = () => <Obj kind="tower" className="o-mini o-tower" />;
export const LinkChain = () => <Obj kind="chain" className="o-mini o-chain" />;
export const XBadge = () => <Obj kind="xbadge" className="o-mini o-xbadge" />;
export const CoinFountain = () => <Obj kind="fountain" className="o-mini o-fountain" />;
export const Candles = () => <Obj kind="candles" className="o-mini o-candles" />;
export const HolderGlobe = () => <Obj kind="globe" className="o-mini o-globe" />;
export const AtBlock = () => <Obj kind="at" className="o-mini o-at" />;
