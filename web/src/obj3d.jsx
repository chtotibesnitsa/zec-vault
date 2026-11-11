// Small real-3D objects that sit inside the information boxes. Each one
// shows what its box says, and none repeats. They are WebGL models (see
// src/3d/minis.js) drawn by one shared renderer (src/3d/host.js), which is
// loaded lazily so three.js stays out of the first paint.
import { useEffect, useRef } from 'react';

let lib = null;
const load = () => (lib ||= Promise.all([import('./3d/host.js'), import('./3d/minis.js')]));

function Obj({ kind, args, className = '', label }) {
  const cv = useRef(null);
  const key = args ? JSON.stringify(args) : '';
  useEffect(() => {
    let off = null;
    let dead = false;
    load()
      .then(([host, minis]) => {
        if (dead || !cv.current) return;
        const build = minis.builders[kind];
        return host.attach(cv.current, () => build(args)).then((o) => (dead ? o() : (off = o)));
      })
      .catch((e) => console.warn('3D object unavailable', e));
    return () => {
      dead = true;
      off?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, key]);
  return (
    <div className={`o3 ${className}`} aria-hidden={label ? undefined : 'true'} role={label ? 'img' : undefined} aria-label={label}>
      <div className="o3-floor" />
      <canvas ref={cv} className="o3-cv" />
    </div>
  );
}

// ---- home: how it works ----
export const SwapCubes = () => <Obj kind="swap" className="o-swapcubes" />;
export const FeeSplit = ({ share = 80, burn = 10 }) => <Obj kind="split" args={{ share, burn }} className="o-feesplit" />;
export const CoinDrop = () => <Obj kind="coindrop" className="o-coindrop" />;

// ---- home: start in 30 seconds ----
export const ZCoin = () => <Obj kind="zcoin" className="o-zcoin" />;
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
export const TokenCoin = ({ ticker }) => <Obj kind="token" className="o-token" label={`$${ticker} token`} />;

// ---- boards ----
export const MiniPodium = () => <Obj kind="podium" className="o-mini o-podium" />;
export const SignalTower = () => <Obj kind="tower" className="o-mini o-tower" />;
export const LinkChain = () => <Obj kind="chain" className="o-mini o-chain" />;
export const XBadge = () => <Obj kind="xbadge" className="o-mini o-xbadge" />;
export const CoinFountain = () => <Obj kind="fountain" className="o-mini o-fountain" />;
export const Candles = () => <Obj kind="candles" className="o-mini o-candles" />;
export const HolderGlobe = () => <Obj kind="globe" className="o-mini o-globe" />;
export const AtBlock = () => <Obj kind="at" className="o-mini o-at" />;
