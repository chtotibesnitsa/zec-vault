// Seven-segment digits, drawn like a bedside alarm clock: lit segments in
// white, the unlit ones faintly visible behind them.
const W = 56;
const H = 100;
const T = 10; // segment thickness
const G = 1.6; // gap between segments
const ADV = W + 16; // digit advance

function hseg(yc) {
  const x1 = T / 2 + G;
  const x2 = W - T / 2 - G;
  const h = T / 2;
  return `${x1},${yc} ${x1 + h},${yc - h} ${x2 - h},${yc - h} ${x2},${yc} ${x2 - h},${yc + h} ${x1 + h},${yc + h}`;
}
function vseg(xc, y1, y2) {
  const h = T / 2;
  return `${xc},${y1} ${xc + h},${y1 + h} ${xc + h},${y2 - h} ${xc},${y2} ${xc - h},${y2 - h} ${xc - h},${y1 + h}`;
}

const SEG = {
  a: hseg(T / 2),
  g: hseg(H / 2),
  d: hseg(H - T / 2),
  f: vseg(T / 2, T / 2 + G, H / 2 - G),
  b: vseg(W - T / 2, T / 2 + G, H / 2 - G),
  e: vseg(T / 2, H / 2 + G, H - T / 2 - G),
  c: vseg(W - T / 2, H / 2 + G, H - T / 2 - G),
};
const ON = ['abcdef', 'bc', 'abged', 'abgcd', 'fgbc', 'afgcd', 'afgedc', 'abc', 'abcdefg', 'abcdfg'];

function Digit({ n, x }) {
  const on = ON[n] || '';
  return (
    <g transform={`translate(${x} 0)`}>
      {Object.entries(SEG).map(([k, pts]) => (
        <polygon key={k} points={pts} className={on.includes(k) ? 'sg-on' : 'sg-off'} />
      ))}
    </g>
  );
}

// "MM:SS" as an SVG. Colon blinks each second.
export default function SegClock({ mm, ss, className = '' }) {
  const digits = (mm + ss).split('').map(Number);
  const colonW = 30;
  const xs = [0, ADV, 2 * ADV + colonW, 3 * ADV + colonW];
  const width = 3 * ADV + colonW + W;
  return (
    <svg className={`segclock ${className}`} viewBox={`-8 -4 ${width + 16} ${H + 8}`} role="img" aria-label={`${mm}:${ss}`}>
      <g transform="skewX(-6) translate(10 0)">
        {digits.map((d, i) => (
          <Digit key={i} n={d} x={xs[i]} />
        ))}
        <g className="sg-colon" transform={`translate(${2 * ADV - 8 + colonW / 2} 0)`}>
          <rect x={-T / 2} y={H * 0.3 - T / 2} width={T} height={T} rx="1.5" />
          <rect x={-T / 2} y={H * 0.7 - T / 2} width={T} height={T} rx="1.5" />
        </g>
      </g>
    </svg>
  );
}
