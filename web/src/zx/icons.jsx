// Line icons and the Zatoshi mark. One stroke weight, no fills, so they sit
// quietly next to text instead of looking like stickers.
const P = {
  home: 'M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z',
  live: 'M3 12h4l2.2-5 4 10 2.3-5H21',
  swap: 'M7 7h12m0 0-3.5-3.5M19 7l-3.5 3.5M17 17H5m0 0 3.5 3.5M5 17l3.5-3.5',
  how: 'M5 5h5.5A2.5 2.5 0 0 1 13 7.5V20a2 2 0 0 0-2-2H5zM19 5h-3.5A2.5 2.5 0 0 0 13 7.5V20a2 2 0 0 1 2-2h4z',
  boards: 'M5 20v-6m7 6V8m7 12v-9M3 20h18',
  wallet: 'M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3M4 7.5V17a2 2 0 0 0 2 2h14V9H6.5A2.5 2.5 0 0 1 4 7.5zM16.5 14h.01',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  ext: 'M14 5h5v5m0-5-8 8M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  check: 'm5 12.5 4.5 4.5L19 7',
  x: 'M6 6l12 12M18 6 6 18',
  flame: 'M12 21c3.9 0 6.5-2.6 6.5-6.3 0-3.8-3-6.2-4.4-9.7-1.8 1.6-2.4 3.7-2.2 5.5-1-.6-1.8-1.6-2.2-2.7C7.2 9.9 5.5 12.2 5.5 14.7 5.5 18.4 8.1 21 12 21z',
  up: 'm6 15 6-6 6 6',
  down: 'm6 9 6 6 6-6',
};

export function Icon({ name, size = 18, className = '' }) {
  return (
    <svg className={`zi ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={P[name]} />
    </svg>
  );
}

// The mark: a Z set in a 5x7 dot matrix inside a black tile, with the two
// Zcash ticks above and below in gold. Reads at 16px and at 400px.
const Z_DOTS = [
  '.....',
  '#####',
  '...#.',
  '..#..',
  '.#...',
  '#####',
  '.....',
];
export function Mark({ size = 28, className = '', tile = true }) {
  const dots = [];
  Z_DOTS.forEach((row, y) =>
    row.split('').forEach((c, x) => {
      if (c === '#') dots.push(<circle key={`${x}-${y}`} cx={8 + x * 4} cy={4 + y * 4} r="1.55" fill="#f6f4ee" />);
    }),
  );
  return (
    <svg className={`zmark ${className}`} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      {tile && <rect x="0.5" y="0.5" width="31" height="31" rx="8" fill="#0b0a08" stroke="rgba(246,244,238,0.22)" />}
      {dots}
      <circle cx="16" cy="4" r="1.55" fill="#e9b44c" />
      <circle cx="16" cy="28" r="1.55" fill="#e9b44c" />
    </svg>
  );
}

export function Logo({ name = 'zatoshi' }) {
  return (
    <span className="zlogo">
      <Mark size={30} />
      <span className="zlogo-wm">{name.toLowerCase()}</span>
    </span>
  );
}
