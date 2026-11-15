// Crisp vector coins ($ZATS and SOL), sharp at any size.
// <Coin kind="zats" size={64} />            a flat coin face
// <Coin kind="sol" size={120} spin />       a real 3D flip (front, back, reeded edge)
import { useId } from 'react';

const TICKS = Array.from({ length: 96 }, (_, i) => (i / 96) * Math.PI * 2);

function Ticks({ r0, r1, color }) {
  return (
    <g stroke={color} strokeWidth="1.2">
      {TICKS.map((a, i) => (
        <line key={i} x1={100 + Math.cos(a) * r0} y1={100 + Math.sin(a) * r0} x2={100 + Math.cos(a) * r1} y2={100 + Math.sin(a) * r1} />
      ))}
    </g>
  );
}

function ZatsFace({ id }) {
  const g = (n) => `${id}-${n}`;
  return (
    <svg viewBox="0 0 200 200" className="coin-face" aria-hidden="true">
      <defs>
        <linearGradient id={g('rim')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff2c2" />
          <stop offset="0.3" stopColor="#f1bd52" />
          <stop offset="0.62" stopColor="#b47c1c" />
          <stop offset="0.85" stopColor="#e9b14a" />
          <stop offset="1" stopColor="#fbe0a0" />
        </linearGradient>
        <radialGradient id={g('field')} cx="0.38" cy="0.32" r="0.8">
          <stop offset="0" stopColor="#ffe08c" />
          <stop offset="0.5" stopColor="#ebb64e" />
          <stop offset="1" stopColor="#b98226" />
        </radialGradient>
        <linearGradient id={g('ink')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3a342a" />
          <stop offset="1" stopColor="#14120f" />
        </linearGradient>
        <path id={g('legend')} d="M100 100 m-76 0 a76 76 0 1 1 152 0 a76 76 0 1 1 -152 0" />
        <clipPath id={g('clip')}>
          <circle cx="100" cy="100" r="98" />
        </clipPath>
      </defs>
      <circle cx="100" cy="100" r="98" fill={`url(#${g('rim')})`} />
      <Ticks r0={91} r1={97} color="rgba(110, 70, 8, 0.38)" />
      <circle cx="100" cy="100" r="89" fill={`url(#${g('field')})`} stroke="#9c6a16" strokeWidth="1.6" />
      <circle cx="100" cy="100" r="87.4" fill="none" stroke="rgba(255, 244, 205, 0.55)" strokeWidth="1" strokeDasharray="180 400" transform="rotate(200 100 100)" />
      <circle cx="100" cy="100" r="76" fill="none" stroke={`url(#${g('ink')})`} strokeWidth="19" />
      <circle cx="100" cy="100" r="66.4" fill="none" stroke="rgba(255, 230, 160, 0.35)" strokeWidth="0.8" />
      <text fontFamily="'JetBrains Mono', ui-monospace, monospace" fontWeight="700" fontSize="9.6" letterSpacing="2.4" fill="#e9b44c">
        <textPath href={`#${g('legend')}`} startOffset="0">
          ZATOSHI · $ZATS · SHIELDED · ZATOSHI · $ZATS · SHIELDED ·
        </textPath>
      </text>
      <g transform="translate(100 100) scale(70)">
        <path
          d="M-0.42 -0.44H0.42V-0.28L-0.14 0.28H0.42V0.44H-0.42V0.28L0.14 -0.28H-0.42Z M-0.075 -0.66H0.075V-0.44H-0.075Z M-0.075 0.44H0.075V0.66H-0.075Z"
          fill={`url(#${g('ink')})`}
          stroke="rgba(255, 228, 160, 0.4)"
          strokeWidth="0.012"
        />
      </g>
      <g clipPath={`url(#${g('clip')})`}>
        <ellipse cx="70" cy="46" rx="80" ry="40" fill="#fff" opacity="0.13" transform="rotate(-28 70 46)" />
      </g>
    </svg>
  );
}

function SolFace({ id }) {
  const g = (n) => `${id}-${n}`;
  return (
    <svg viewBox="0 0 200 200" className="coin-face" aria-hidden="true">
      <defs>
        <linearGradient id={g('rim')} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c9ced8" />
          <stop offset="0.35" stopColor="#5d616b" />
          <stop offset="0.65" stopColor="#24262c" />
          <stop offset="1" stopColor="#9ba1ad" />
        </linearGradient>
        <radialGradient id={g('field')} cx="0.38" cy="0.3" r="0.85">
          <stop offset="0" stopColor="#2c2f37" />
          <stop offset="1" stopColor="#0c0d10" />
        </radialGradient>
        <linearGradient id={g('logo')} x1="100" y1="0" x2="0" y2="80" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#00FFA3" />
          <stop offset="0.5" stopColor="#5fa8f0" />
          <stop offset="1" stopColor="#DC1FFF" />
        </linearGradient>
        <path id={g('legend')} d="M100 100 m-79 0 a79 79 0 1 1 158 0 a79 79 0 1 1 -158 0" />
        <clipPath id={g('clip')}>
          <circle cx="100" cy="100" r="98" />
        </clipPath>
      </defs>
      <circle cx="100" cy="100" r="98" fill={`url(#${g('rim')})`} />
      <Ticks r0={91} r1={97} color="rgba(0, 0, 0, 0.35)" />
      <circle cx="100" cy="100" r="89" fill={`url(#${g('field')})`} stroke="#0a0b0d" strokeWidth="1.6" />
      <circle cx="100" cy="100" r="70" fill="none" stroke="rgba(200, 206, 218, 0.55)" strokeWidth="1.4" />
      <text fontFamily="'JetBrains Mono', ui-monospace, monospace" fontWeight="700" fontSize="8.4" letterSpacing="2.6" fill="#8f96a3">
        <textPath href={`#${g('legend')}`} startOffset="0">
          SOLANA · PROOF OF HISTORY · SOL · SOLANA · PROOF OF HISTORY · SOL ·
        </textPath>
      </text>
      <g transform="translate(54 63.2) scale(0.92)" fill={`url(#${g('logo')})`}>
        <path d="M20 0H100L80 18H0Z" />
        <path d="M0 31H80L100 49H20Z" />
        <path d="M20 62H100L80 80H0Z" />
      </g>
      <g clipPath={`url(#${g('clip')})`}>
        <ellipse cx="70" cy="46" rx="80" ry="40" fill="#fff" opacity="0.1" transform="rotate(-28 70 46)" />
      </g>
    </svg>
  );
}

export function Coin({ kind = 'zats', size = 64, spin = false, className = '', style }) {
  const id = useId().replace(/:/g, '');
  const Face = kind === 'sol' ? SolFace : ZatsFace;
  if (!spin) {
    return (
      <span className={`coin coin-${kind} ${className}`} style={{ '--s': `${size}px`, ...style }}>
        <Face id={id} />
      </span>
    );
  }
  return (
    <span className={`coin coin-${kind} spinning ${className}`} style={{ '--s': `${size}px`, ...style }}>
      <span className="coin-3d">
        <span className="coin-side front">
          <Face id={id + 'f'} />
        </span>
        <i className="coin-edge" />
        <span className="coin-side back">
          <Face id={id + 'b'} />
        </span>
      </span>
    </span>
  );
}
