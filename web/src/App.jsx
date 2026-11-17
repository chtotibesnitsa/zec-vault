import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import LiquidMap from './zx/bg.jsx';
import { ZNav, Ticker, ZFooter } from './zx/parts.jsx';
import { ZHome, ZLive, ZSwap, ZHow, ZBoards } from './zx/pages.jsx';
import { Ambient, detectLite, useDepth } from './glass.jsx';
import { CoinDrop, FeeSplit, FriendsOrbit, HoldSafe, NameCard, SwapCubes, TokenCoin, ZCoin } from './obj3d.jsx';
import StillScene from './stills.jsx';
import { brand, fill } from './brand.js';
import { api, fmtNum, fmtUsd, solscanAcct, solscanTx, ago, useFeed, usePoll } from './api.js';
import { CopyChip, Countdown, Counter, eventText, FeedTable, Marquee, Reveal, Toasts, txLink, WalletLink, Win, Wordmark } from './components.jsx';
import { Px } from './pixel.jsx';
import { UsageStrip } from './proof.jsx';
import { BurnTracker, FlowStory, Hero5, HoldCheck, LiveBoard, ProofBar, SwapSection } from './landing.jsx';
import { AccountButton, AuthProvider, InviteCopy, inviteLink, shareOnX, useAuth } from './auth.jsx';
import { Link, KIND_ICON, KIND_TONE } from './nav.jsx';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Client-side routes with a pixel-dissolve wipe between pages.
// A path may carry a #section to scroll to after the page opens.
function scrollToHash(hash) {
  if (!hash) return;
  let tries = 0;
  const tick = () => {
    const el = document.getElementById(hash);
    if (el) el.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    else if (tries++ < 20) setTimeout(tick, 60);
  };
  setTimeout(tick, 40);
}

function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  const [wipe, setWipe] = useState('');
  useEffect(() => {
    const on = () => setPath(window.location.pathname);
    window.addEventListener('popstate', on);
    scrollToHash(window.location.hash.slice(1));
    return () => window.removeEventListener('popstate', on);
  }, []);
  const go = useCallback((to) => {
    const [p0, hash] = to.split('#');
    const p = p0 || window.location.pathname;
    if (p === window.location.pathname) {
      window.history.pushState({}, '', to);
      if (hash) scrollToHash(hash);
      else window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
      return;
    }
    const swap = () => {
      window.history.pushState({}, '', to);
      setPath(p);
      if (hash) scrollToHash(hash);
      else window.scrollTo({ top: 0 });
    };
    if (reducedMotion()) return swap();
    setWipe('in');
    setTimeout(() => {
      swap();
      setWipe('out');
      setTimeout(() => setWipe(''), 520);
    }, 420);
  }, []);
  useEffect(() => {
    const on = (e) => go(e.detail);
    window.addEventListener('vault:nav', on);
    return () => window.removeEventListener('vault:nav', on);
  }, [go]);
  return [path, go, wipe];
}

// Cards light up under the pointer in their own color. One listener for the
// whole page; each card reads --mx/--my in CSS.
const SPOT = '.spot, .pb-item, .st-step, .usage-item, .lpanel, .burn-card, .faq details, .spec, .buy-card, .stat, .hm-step, .key-item, .estimator, .swapcard, .pulse';
function useSpotlight() {
  useEffect(() => {
    const on = (e) => {
      const el = e.target.closest?.(SPOT);
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty('--mx', `${e.clientX - r.left}px`);
      el.style.setProperty('--my', `${e.clientY - r.top}px`);
    };
    window.addEventListener('pointermove', on, { passive: true });
    return () => window.removeEventListener('pointermove', on);
  }, []);
}

const WIPE_CELLS = Array.from({ length: 16 * 10 }, () => Math.random());

function PixelWipe({ state }) {
  return (
    <div className={`wipe ${state}`} aria-hidden="true">
      {WIPE_CELLS.map((r, i) => (
        <i key={i} style={{ '--d': `${Math.round(r * 300)}ms` }} />
      ))}
    </div>
  );
}

export default function App() {
  const [path, go, wipe] = useRoute();
  const stats = usePoll('/api/stats', 15000);
  const [toasts, setToasts] = useState([]);
  const pushToast = useCallback((e) => {
    setToasts((t) => [e, ...t].slice(0, 3));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== e.id)), 6500);
  }, []);
  const realEvents = useFeed(pushToast);
  const cfg = stats.data?.config || null;
  // Only real on-chain activity is ever shown; before launch the feeds are empty.
  const preview = false;
  const events = realEvents;
  const page = pageOf(path);
  const isApp = page === 'app';
  useSpotlight();
  useDepth(page);
  useEffect(() => {
    detectLite();
  }, []);

  useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = brand.theme;
    r.style.setProperty('--glow', brand.glow);
    r.dataset.vault = brand.key;
    r.style.setProperty('--accent', brand.accent);
    r.style.setProperty('--accent2', brand.accent2);
    r.style.setProperty('--accent-deep', brand.accentDeep);
    r.style.setProperty('--accent-text', brand.accentText);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', brand.theme === 'light' ? '#f1ece0' : brand.key === 'zec' ? '#0a0907' : '#09090b');
    const t = PAGES.find((x) => x.key === page)?.label;
    document.title = page === 'home' ? `${brand.name} · ${brand.headline}` : `${brand.name} · ${isApp ? 'My vault' : t || ''}`;
  }, [isApp, page]);

  const [notice, setNotice] = useState('');
  const notify = useCallback((m) => {
    setNotice(m);
    setTimeout(() => setNotice(''), 5000);
  }, []);

  return (
    <AuthProvider notify={notify}>
    <div className={`site zx v-${brand.key}`} style={{ "--n": brand.name.length }}>
      <LiquidMap />
      <div className="zx-grid" aria-hidden="true" />
      <ZNav page={page} cfg={cfg} />
      <Ticker s={stats.data} cfg={cfg} />
      <div className="page" key={page}>
        {page === 'admin' ? (
          <Admin />
        ) : page === 'app' ? (
          <VaultApp stats={stats} events={events} cfg={cfg} />
        ) : page === 'swap' ? (
          <ZSwap cfg={cfg} />
        ) : page === 'live' ? (
          <ZLive s={stats.data} cfg={cfg} events={events} />
        ) : page === 'how' ? (
          <ZHow s={stats.data} cfg={cfg} />
        ) : page === 'boards' ? (
          <ZBoards cfg={cfg} />
        ) : (
          <ZHome s={stats.data} cfg={cfg} events={events} />
        )}
      </div>
      <ZFooter />
      <Toasts items={toasts} cfg={cfg} />
      <PixelWipe state={wipe} />
      {notice && <div className="notice pixel">{notice}</div>}
    </div>
    </AuthProvider>
  );
}

export const PAGES = [
  { key: 'home', to: '/', label: 'Home', icon: 'shield', tone: 'pay' },
  { key: 'live', to: '/live', label: 'Live', icon: 'bolt', tone: 'trade' },
  { key: 'swap', to: '/swap', label: 'Swap', icon: 'swap', tone: 'trade' },
  { key: 'how', to: '/how', label: 'How it works', icon: 'pie', tone: 'vault' },
  { key: 'boards', to: '/boards', label: 'Leaderboards', icon: 'users', tone: 'people' },
];

function pageOf(path) {
  if (path.startsWith('/admin')) return 'admin';
  if (path.startsWith('/app')) return 'app';
  const hit = PAGES.find((p) => p.to !== '/' && path.startsWith(p.to));
  return hit ? hit.key : 'home';
}

function Nav({ page, cfg }) {
  const isApp = page === 'app';
  return (
    <header className="nav">
      <Link to="/" className="logo" aria-label={`${brand.name} home`}>
        <Px name={brand.key === 'zec' ? 'shield' : 'eye'} size={26} className="logo-px" />
        <Wordmark text={brand.name} className="wm-sm" />
      </Link>
      <nav className="nav-pages" aria-label="Pages">
        {PAGES.map((p) => (
          <Link key={p.key} to={p.to} className={`np tone-${p.tone} ${page === p.key ? 'on' : ''}`} aria-current={page === p.key ? 'page' : undefined}>
            <Px name={p.icon} size={14} />
            {p.label}
          </Link>
        ))}
      </nav>
      <nav className="nav-links">
        {cfg?.tokenMint && (
          <a className="hide-sm" href={`https://pump.fun/coin/${cfg.tokenMint}`} target="_blank" rel="noreferrer">
            buy ${brand.ticker}
          </a>
        )}
        <Link to={isApp ? '/' : '/app'} className="btn btn-sm hide-xs">
          {isApp ? 'Home' : 'Open vault'}
        </Link>
        <AccountButton />
      </nav>
    </header>
  );
}

function StatTile({ label, children, hint, icon, big, tone }) {
  return (
    <div className={`stat ${big ? 'stat-big' : ''} ${tone ? 'tone-' + tone : ''}`}>
      <div className="stat-top">
        {icon && <Px name={icon} size={20} />}
        <span className="pixel stat-label">{label}</span>
      </div>
      <div className="stat-value">{children}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

function rewardSym(cfg) {
  return cfg && !cfg.rewardIsOwnToken && cfg.rewardSymbol ? cfg.rewardSymbol : '$' + brand.ticker;
}

function StatsGrid({ s }) {
  const live = s?.config?.live;
  const m = s?.market;
  const rs = rewardSym(s?.config);
  return (
    <div className="stats">
      <StatTile big tone="pay" label="paid to holders" hint={rs} icon="coins">
        <Counter value={s?.rewardsPaid || 0} />
      </StatTile>
      <StatTile big tone="pay" label="next payout" hint={live ? `every ${s.config.cycleMinutes} min, automatic` : 'starts at launch'} icon="clock">
        {live ? <Countdown to={s?.nextCycleAt} /> : '--:--'}
      </StatTile>
      <StatTile tone="pay" label="paid last 24h" hint={rs} icon="bolt">
        <Counter value={s?.rewardsPaid24h || 0} />
      </StatTile>
      <StatTile tone="people" icon="users" label="wallets earning" hint={s?.config ? `hold ${fmtNum(s.config.minHoldTokens)}+ to qualify` : 'every holder above the minimum'}>
        <Counter value={s?.holders || 0} format={(v) => Math.round(v).toLocaleString()} />
      </StatTile>
      <StatTile tone="vault" label="fees collected" hint="SOL, all time" icon="bolt">
        <Counter value={s?.feesTotalSol || 0} format={(v) => v.toFixed(3)} />
      </StatTile>
      <StatTile tone="trade" label="trades 24h" hint="real swaps, on-chain" icon="swap">
        <Counter value={s?.trades24h || 0} format={(v) => Math.round(v).toLocaleString()} />
      </StatTile>
      <StatTile tone="trade" icon="chart" label="price" hint={m ? `${m.change24h >= 0 ? '+' : ''}${m.change24h}% 24h` : 'from dexscreener'}>
        {fmtUsd(m?.priceUsd)}
      </StatTile>
      <StatTile tone="trade" icon="pie" label="market cap" hint={m ? `vol 24h ${fmtUsd(m.volume24h)}` : 'from dexscreener'}>
        {fmtUsd(m?.marketCap)}
      </StatTile>
    </div>
  );
}

function SectionHead({ title, right, icon = 'bolt', tone = 'pay' }) {
  return (
    <div className={`shead tone-${tone}`}>
      <span className="shead-ic">
        <Px name={icon} size={22} />
      </span>
      <h2>{title}</h2>
      {right && <span className="shead-r">{right}</span>}
    </div>
  );
}

function FeeBlocks({ pct }) {
  const n = 40;
  const on = Math.round((pct / 100) * n);
  return (
    <div className="feeblocks" aria-label={`${pct}% to holders`}>
      {Array.from({ length: n }).map((_, i) => (
        <i key={i} className={i < on ? 'on' : ''} style={{ '--i': i }} />
      ))}
    </div>
  );
}

// Real numbers only.
function proofOf(s) {
  return s;
}

// Big title at the top of each inner page.
function PageHead({ icon, tone, eyebrow, title, sub }) {
  return (
    <header className={`phead tone-${tone}`}>
      <span className="phead-eyebrow pixel">
        <span className="phead-ic">
          <Px name={icon} size={18} />
        </span>
        {eyebrow}
      </span>
      <h1>{title}</h1>
      {sub && <p>{sub}</p>}
    </header>
  );
}

// Three plain steps on the home page; the full story lives on /how.
function HomeHow({ cfg }) {
  const tones = ['trade', 'vault', 'pay'];
  const objs = [<SwapCubes key="a" />, <FeeSplit key="b" share={(cfg?.rewardShareBps ?? 8000) / 100} burn={(cfg?.burnBps ?? 1000) / 100} />, <CoinDrop key="c" />];
  return (
    <section className="section homehow" id="how">
      <div className="s5-head">
        <span className="s5-eyebrow pixel">how it works</span>
        <h2>Three steps, <span className="w-trade">all automatic</span></h2>
      </div>
      <div className="hm-steps">
        {brand.steps.map(([t, d], i) => (
          <div key={t} className={`hm-step tone-${tones[i]}`} style={{ '--i': i }}>
            <div className="hm-top">
              {objs[i]}
              <span className="hm-n mono">0{i + 1}</span>
            </div>
            <h3>{fill(t, cfg)}</h3>
            <p>{fill(d, cfg)}</p>
            {i < 2 && <span className="hm-arrow" aria-hidden="true" />}
          </div>
        ))}
      </div>
      <div className="more-row">
        <Link to="/how" className="morelink tone-vault">
          See the full fee breakdown <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}

// A short slice of the live feed with a link to the full page.
function HomeLive({ events, cfg, preview }) {
  const list = events.slice(0, 6);
  return (
    <section className="section homelive" id="live">
      <div className="s5-head">
        <span className="s5-eyebrow pixel">
          <span className="rec" /> {preview ? 'sample feed · real transactions replace it at launch' : 'live from solana'}
        </span>
        <h2>Happening <span className="w-trade">right now</span></h2>
      </div>
      <Marquee events={events} cfg={cfg} />
      <div className="hl-list">
        {list.map((e) => {
          const t = eventText(e, cfg);
          const tone = KIND_TONE[e.kind] || 'vault';
          return (
            <a key={e.id} className={`hl-row tone-${tone}`} {...txLink(e)}>
              <span className="hl-ic">
                <Px name={KIND_ICON[e.kind] || 'bolt'} size={18} />
              </span>
              <span className="hl-tag pixel">{t.tag}</span>
              <span className="hl-text">{t.text}</span>
              <span className="hl-t muted small">{e.sample ? <i className="sample-tag pixel">sample</i> : ago(e.ts) + ' ↗'}</span>
            </a>
          );
        })}
        {!list.length && <div className="lp-empty muted">The first trade after launch lands here within a minute.</div>}
      </div>
      <div className="more-row">
        <Link to="/live" className="morelink tone-trade">
          See all live activity and burns <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}

function Landing({ go, stats, events, cfg, preview }) {
  const s = stats.data;
  const proof = proofOf(s, preview);
  return (
    <main>
      <Hero5 cfg={cfg} s={{ ...proof, nextCycleAt: s?.nextCycleAt }} preview={preview} events={events} />
      <div className="home-ticker">
        <Marquee events={events} cfg={cfg} />
      </div>
      <div className="h5-check" id="numbers">
        <HoldCheck cfg={cfg} preview={preview} />
      </div>
      <ProofBar s={proof} preview={preview} />

      <Reveal>
        <HomeHow cfg={cfg} />
      </Reveal>

      <Reveal>
        <HomeLive events={events} cfg={cfg} preview={preview} />
      </Reveal>

      <Reveal>
        <Starter go={go} cfg={cfg} />
      </Reveal>

      <section className="closer">
        <div className="closer-in">
          <h2 className="closer-h">{brand.closer}</h2>
          <div className="hero-cta center">
            <a href="/app" className="btn" onClick={(e) => (e.preventDefault(), go('/app'))}>
              Open the vault
            </a>
            <button className="btn btn-ghost" onClick={() => shareOnX(`${brand.headline} $${brand.ticker} pays holders every few minutes from real trading fees. No staking, no KYC.`, window.location.origin)}>
              Share on X
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

// A wide glass frame holding the page's WebGL scene, with a plain caption.
function SceneBand({ kind, tone, title, sub, legend, events }) {
  return (
    <div className={`scene-band scene-${kind} tone-${tone} ${kind === 'reactor' ? '' : 'scene-stacked'}`}>
      <div className="scene-frame">
        <StillScene kind={kind} events={events} />
        <div className="scene-copy">
          <h1>{title}</h1>
          {sub && <p>{sub}</p>}
        </div>
        {legend && (
          <div className="scene-legend">
            {legend.map(([c, t]) => (
              <span key={t} style={{ '--c': c }}>
                <i /> {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function LivePage({ events, cfg, preview, proof }) {
  return (
    <main>
      <SceneBand
        kind="reactor"
        tone="trade"
        events={events}
        title={<>The vault, <span className="w-trade">live</span></>}
        sub="Every trade, payout and burn on this page moves through the vault below."
        legend={[
          ['var(--c-trade)', 'buys flying in'],
          ['var(--c-sell)', 'sells'],
          ['var(--c-pay)', 'payouts to holders'],
          ['var(--c-burn)', 'burns'],
          ['var(--c-people)', 'holder wallets'],
        ]}
      />
      <LiveBoard events={events} cfg={cfg} preview={preview} ticker={<Marquee events={events} cfg={cfg} />} />
      <Reveal>
        <BurnTracker s={proof} events={events} cfg={cfg} preview={preview} />
      </Reveal>
    </main>
  );
}

function HowPage({ cfg, proof }) {
  const shareBps = cfg?.rewardShareBps ?? 8000;
  const burnBps = cfg?.burnBps ?? 1000;
  const faq = useMemo(
    () => [
      ['Do I need to stake or claim?', 'No. Hold ${ticker} in any Solana wallet. The vault finds you in its snapshot and sends your share. Nothing to sign, nothing to lock.', 'pay'],
      ['Where does the money come from?', 'Only from real trading. Pump.fun pays the coin creator a fee on every trade. The vault wallet is the creator, so those fees land there and get spent on rewards. Nothing is minted.', 'vault'],
      ['How is my share worked out?', 'Your balance divided by the total held by all eligible wallets at each snapshot. Pools, bonding curves and the vault itself are excluded, so only people get paid.', 'people'],
      ['Can the team take the fees?', `${(shareBps / 100).toFixed(0)}% of every fee claimed is booked for holders by the vault's code and spent only on rewards. ${(burnBps / 100).toFixed(0)}% buys $${brand.ticker} and burns it. The other ${(100 - shareBps / 100 - burnBps / 100).toFixed(0)}% runs the project. The team runs the vault wallet, so the split is kept by that code, not locked by the blockchain. That is why every claim, buy, burn and payout is a public Solana transaction linked in the feed: anyone can check it.`, 'vault'],
      ['Why swap on this site?', 'We add 0% on top. The swap is routed by Jupiter and signed in your own wallet, so you get the best price and the funds never pass through us.', 'trade'],
      ['Why no KYC?', 'Because there is nothing to sign up for. We never hold your coins and never ask who you are. You hold a token in your own wallet; the vault sends rewards to that address.', 'people'],
      ...brand.faqExtra.map((x) => [...x, 'pay']),
      ['Is this safe?', 'Memecoins are volatile and can go to zero. Rewards depend on trading volume and are never guaranteed. Not financial advice.', 'burn'],
    ],
    [shareBps, burnBps],
  );
  return (
    <main>
      <FlowStory cfg={cfg} s={proof} />

      <Reveal>
        <section className="section" id="token">
          <SectionHead icon="coins" tone="pay" title={<>The <span className="w-pay">token</span></>} />
          <div className="spec-wrap">
          <dl className="spec card">
            <Row k="ticker" v={`$${brand.ticker}`} />
            <Row k="launch" v="Fair launch on Pump.fun, no presale" />
            <Row k="supply" v="1,000,000,000" />
            <Row k="reward paid" v={rewardSym(cfg)} />
            <Row k="payout timer" v={`every ${cfg?.cycleMinutes || 5} minutes`} />
            <Row k="contract" v={cfg?.tokenMint ? <a className="mono" href={solscanAcct(cfg.tokenMint)} target="_blank" rel="noreferrer">{cfg.tokenMint}</a> : 'revealed at launch'} />
            <Row k="vault wallet" v={cfg?.treasury ? <a className="mono" href={solscanAcct(cfg.treasury)} target="_blank" rel="noreferrer">{cfg.treasury}</a> : 'revealed at launch'} />
          </dl>
          <TokenCoin ticker={brand.ticker} share={(cfg?.rewardShareBps ?? 8000) / 100} burn={(cfg?.burnBps ?? 1000) / 100} />
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="section" id="faq">
          <SectionHead icon="eye" tone="people" title={<>Questions, <span className="w-vault">answered</span></>} />
          <div className="faq">
            {faq.map(([q, a, tone], i) => (
              <details key={i} className={`tone-${tone}`}>
                <summary>
                  <span className="pixel faq-n">{String(i + 1).padStart(2, '0')}</span>
                  <span>{fill(q, cfg)}</span>
                  <span className="faq-x pixel" aria-hidden="true" />
                </summary>
                <p>{fill(a, cfg)}</p>
              </details>
            ))}
          </div>
        </section>
      </Reveal>
    </main>
  );
}

function BoardsPage({ proof, preview }) {
  return (
    <main>
      <SceneBand kind="podium" tone="people" title={<>The <span className="w-pay">leader</span><span className="w-people">boards</span></>} sub="Who has been paid the most, who has held the longest without selling, and who has invited the most holders." legend={[['#f3f2ee', 'most paid'], ['#9a9a96', 'second'], ['#5e5e5b', 'third']]} />
      <TopEarners />
      <Reveal>
        <section className="section" id="community">
          <SectionHead icon="users" tone="people" title={<>Every feature, <span className="w-people">in use</span></>} right={<span className="pixel muted">{preview ? 'sample counts' : 'live counts'}</span>} />
          <UsageStrip s={proof} sample={preview} />
        </section>
      </Reveal>
    </main>
  );
}

// Guided start: four steps that tick off for a signed-in holder.
function Starter({ go, cfg }) {
  const { me, setOpen } = useAuth();
  const [h, setH] = useState(null);
  useEffect(() => {
    if (!me?.wallet) return setH(null);
    api(`/api/holder/${me.wallet}`).then(setH).catch(() => setH(null));
  }, [me?.wallet]);
  const has = Number(h?.balance || 0) > 0;
  const steps = [
    {
      ic: 'swap',
      obj: <ZCoin />,
      tone: 'trade',
      t: `Get $${brand.ticker}`,
      d: cfg?.tokenMint ? 'Buy any amount on Pump.fun or Jupiter.' : 'Fair launch on Pump.fun. Follow so you catch the CA.',
      done: has,
      cta: cfg?.tokenMint ? (
        <a className="btn btn-sm" href={`https://pump.fun/coin/${cfg.tokenMint}`} target="_blank" rel="noreferrer">
          Buy
        </a>
      ) : (
        <a className="btn btn-sm" href={`https://x.com/${brand.xHandle}`} target="_blank" rel="noreferrer">
          Follow
        </a>
      ),
    },
    {
      ic: 'clock',
      obj: <HoldSafe />,
      tone: 'pay',
      t: 'Just hold',
      d: `Keep ${fmtNum(cfg?.minHoldTokens || 100000)}+ in any wallet. Payouts land every ${cfg?.cycleMinutes || 5} min. Nothing to stake or claim.`,
      done: Boolean(h?.eligible),
      cta: null,
    },
    {
      ic: 'eye',
      obj: <NameCard />,
      tone: 'people',
      t: 'Claim your name',
      d: 'Connect, sign one free message, pick a name. It shows on every payout you get.',
      done: Boolean(me?.username),
      cta: !me?.username && (
        <button className="btn btn-sm" onClick={() => setOpen(true)}>
          Connect
        </button>
      ),
    },
    {
      ic: 'users',
      obj: <FriendsOrbit />,
      tone: 'people',
      t: 'Bring friends',
      d: 'Share your invite link and climb the recruiters board.',
      done: (me?.recruits || 0) > 0,
      cta: me?.username ? (
        <button className="btn btn-sm" onClick={() => shareOnX(`Hold $${brand.ticker}, get paid every ${cfg?.cycleMinutes || 5} minutes from real trading fees. No staking, no KYC.`, inviteLink(me.username))}>
          Share
        </button>
      ) : null,
    },
  ];
  const done = steps.filter((x) => x.done).length;
  return (
    <section className="section" id="start">
      <SectionHead icon="bolt" tone="trade" title={<>Start in <span className="w-trade">30 seconds</span></>} right={<span className="pixel muted">{me ? `${done}/4 done` : 'no sign-up, no kyc'}</span>} />
      <div className="starter">
        <div className="st-bar">
          <i style={{ width: `${(done / 4) * 100}%` }} />
        </div>
        {steps.map((x, i) => (
          <div key={x.t} className={`st-step tone-${x.tone} ${x.done ? 'done' : ''}`} style={{ '--i': i }}>
            <span className="st-n pixel">{x.done ? '✓' : '0' + (i + 1)}</span>
            {x.obj}
            <h3>{x.t}</h3>
            <p className="muted">{x.d}</p>
            {!x.done && x.cta}
          </div>
        ))}
      </div>
      <div className="st-foot">
        <a href="/app" className="linkbtn" onClick={(e) => (e.preventDefault(), go('/app'))}>
          or paste any wallet to see what it earned →
        </a>
      </div>
    </section>
  );
}

function Row({ k, v }) {
  return (
    <div className="spec-row">
      <dt className="pixel">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function TopEarners() {
  const [tab, setTab] = useState('earners');
  const earners = usePoll('/api/leaderboard', 30000).data;
  const diamonds = usePoll(tab === 'diamond hands' ? '/api/diamonds' : null, 30000).data;
  const recruiters = usePoll(tab === 'recruiters' ? '/api/referrals' : null, 30000).data;
  const cfgState = usePoll('/api/config', 60000);
  const d = cfgState.data?.rewardDecimals ?? 6;
  const { me } = useAuth();
  let rows = [];
  if (tab === 'earners')
    rows = (earners?.top || []).slice(0, 10).map((r) => ({
      key: r.wallet,
      n: Number(BigInt(r.paid_raw)) / 10 ** d,
      who: <WalletLink address={r.wallet} name={earners.profiles?.[r.wallet]} />,
      value: fmtNum(Number(BigInt(r.paid_raw)) / 10 ** d, 4),
      note: (
        <>
          {r.payouts} payouts {earners.streaks?.[r.wallet]?.neverSold && <span className="badge" title="Never sold">◆ diamond</span>}
        </>
      ),
    }));
  if (tab === 'diamond hands')
    rows = (diamonds?.top || []).map((r) => ({
      key: r.wallet,
      n: r.streak,
      who: <WalletLink address={r.wallet} name={diamonds.profiles?.[r.wallet]} />,
      value: `${r.streak} payouts`,
      note: r.neverSold ? 'never sold' : 'since last sell',
    }));
  if (tab === 'recruiters')
    rows = (recruiters?.top || []).map((r) => ({
      key: r.username,
      n: r.recruits,
      who: r.wallet ? <WalletLink address={r.wallet} name={{ u: r.username, x: r.x }} /> : <span className="who">@{r.username}</span>,
      value: `${r.recruits}`,
      note: 'holders invited',
    }));
  const empty = {
    earners: 'Fills in after the first payout.',
    'diamond hands': 'Wallets that keep getting paid without selling show up here.',
    recruiters: me?.username ? 'No invites yet. Share your link from My vault to top this board.' : 'Connect a wallet and pick a name to get your invite link.',
  }[tab];
  return (
    <section className="section tone-people" id="earners">
      
      <Win title="Leaderboards" tabs={['earners', 'diamond hands', 'recruiters']} tab={tab} onTab={setTab}>
        {rows.length ? (
          <ol className="earners">
            {rows.map((r, i) => (
              <li key={r.key} style={{ '--w': Math.max(0.04, (Number(r.n) || 0) / (Math.max(...rows.map((x) => Number(x.n) || 0)) || 1)), '--i': i }}>
                <span className="earn-bar" aria-hidden="true" />
                <span className={`rank pixel r${i + 1}`}>#{String(i + 1).padStart(2, '0')}</span>
                {r.who}
                <span className="mono earn-amt">{r.value}</span>
                <span className="muted small">{r.note}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="log-empty">
            <span className="pixel">$ sort --by {tab.replace(' ', '-')}</span>
            <span>{empty}</span>
            <span className="cursor">▮</span>
          </div>
        )}
      </Win>
    </section>
  );
}

function VaultApp({ stats, events, cfg }) {
  const [tab, setTab] = useState('overview');
  const s = stats.data;
  return (
    <main className="app">
      <div className="tabs pixel" role="tablist">
        {['overview', 'my vault', 'buy'].map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {tab === 'overview' && (
        <>
          <section className="section">
            <SectionHead icon="chart" tone="vault" title={"Overview"} right={<span className="muted small">{s?.config?.paused ? 'payouts paused' : s?.config?.live ? 'vault running' : 'opens at launch'}</span>} />
            <Win title="Your stats">
              <StatsGrid s={s} />
            </Win>
          </section>
          <section className="section">
            <SectionHead icon="bolt" tone="vault" title={"Last vault actions"} />
            <Win title="Actions">
              <FeedTable events={events.filter((e) => ['claim', 'buyback', 'payout'].includes(e.kind))} cfg={cfg} empty="The vault’s first claim, buyback and payout will show here." />
            </Win>
          </section>
        </>
      )}
      {tab === 'my vault' && <MyVault cfg={cfg} stats={stats} />}
      {tab === 'buy' && <Buy cfg={cfg} />}
    </main>
  );
}

function MyVault({ cfg, stats }) {
  const { me, setOpen } = useAuth();
  const [addr, setAddr] = useState(() => {
    try {
      return localStorage.getItem('vault:addr') || '';
    } catch {
      return '';
    }
  });
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const look = useCallback(async (a) => {
    setErr('');
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(a)) return setErr('That doesn’t look like a Solana address.');
    try {
      localStorage.setItem('vault:addr', a);
    } catch {
      /* private mode */
    }
    try {
      setData(await api(`/api/holder/${a}`));
    } catch {
      setErr('Vault API is not reachable yet. It opens at launch.');
    }
  }, []);
  useEffect(() => {
    if (me?.wallet) {
      setAddr(me.wallet);
      look(me.wallet);
    } else if (addr) look(addr);
  }, [me?.wallet]); // eslint-disable-line react-hooks/exhaustive-deps

  const rs = rewardSym(cfg);
  const mine = me && data && data.wallet === me.wallet;
  const link = me?.username ? inviteLink(me.username) : window.location.origin;
  return (
    <section className="section">
      <SectionHead icon="wallet" tone="pay" title={'My vault'} right={<span className="muted small">signing in is free and never sends a transaction</span>} />
      <div className="lookup">
        <input value={addr} onChange={(e) => setAddr(e.target.value.trim())} placeholder="Paste any Solana wallet address" spellCheck="false" />
        <button className="btn" onClick={() => look(addr)}>
          Check
        </button>
        {!me && (
          <button className="btn btn-ghost" onClick={() => setOpen(true)}>
            Connect wallet
          </button>
        )}
      </div>
      {err && <div className="err">{err}</div>}
      {data && !data.error && (
        <>
          <div className="stats stats-4 card">
            <StatTile tone="trade" icon="wallet" label="Holding" hint={`$${brand.ticker}`}>
              {fmtNum(data.balance)}
            </StatTile>
            <StatTile tone="people" icon="pie" label="Share of vault" hint={data.eligible ? 'eligible' : 'not in last snapshot'}>
              {data.sharePct.toFixed(4)}%
            </StatTile>
            <StatTile tone="pay" icon="coins" label="Received" hint={rs}>
              {fmtNum(data.paid, 4)}
            </StatTile>
            <StatTile tone="vault" icon="clock" label="Pending" hint="sent in the next payouts">
              {fmtNum(data.owed, 4)}
            </StatTile>
          </div>
          {mine && (
            <div className="share-row">
              <button
                className="btn"
                onClick={() =>
                  shareOnX(
                    Number(data.paid) > 0
                      ? `I've been paid ${fmtNum(data.paid, 2)} ${rs} by the ${brand.name} vault just for holding $${brand.ticker}. No staking, no KYC. Every payout is on Solana:`
                      : `I'm holding $${brand.ticker}. The ${brand.name} vault pays holders every ${cfg?.cycleMinutes || 5} minutes from real trading fees. No staking, no KYC:`,
                    link,
                  )
                }
              >
                Share on X
              </button>
              {me.username ? (
                <InviteCopy username={me.username} recruits={me.recruits} />
              ) : (
                <button className="btn btn-ghost" onClick={() => setOpen(true)}>
                  Pick a name to get an invite link
                </button>
              )}
            </div>
          )}
          {data.payouts.length ? (
            <ul className="log card">
              {data.payouts.map((p) => (
                <li key={p.sig} className="log-row k-payout">
                  <span className="log-ts">{new Date(p.ts).toISOString().slice(11, 19)}</span>
                  <span className="log-tag pixel">PAID</span>
                  <span className="log-text">
                    {fmtNum(p.amount, 4)} {rs}
                  </span>
                  <span className="log-link">
                    {mine && (
                      <button className="linkbtn" onClick={() => shareOnX(`Just got paid ${fmtNum(p.amount, 2)} ${rs} for holding $${brand.ticker}. Proof on Solana:`, solscanTx(p.sig))}>
                        share
                      </button>
                    )}{' '}
                    <a href={solscanTx(p.sig)} target="_blank" rel="noreferrer">
                      {ago(p.ts)} ↗
                    </a>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="empty">
              {data.eligible ? 'You’re in. Your first payout lands with the next cycle that has rewards.' : `Hold at least ${fmtNum(cfg?.minHoldTokens || 0)} $${brand.ticker} to be included in the next snapshot.`}
            </div>
          )}
        </>
      )}
      <Estimator stats={stats?.data} start={data?.balance} />
    </section>
  );
}

// What a balance would have earned over the last 24 hours, from real payouts.
function Estimator({ stats: s, start }) {
  const [amt, setAmt] = useState(() => String(Math.round(Number(start) || 1000000)));
  useEffect(() => {
    if (Number(start) > 0) setAmt(String(Math.round(Number(start))));
  }, [start]);
  const total = Number(s?.holdersTotal || 0);
  const paid = Number(s?.rewardsPaid24h || 0);
  const n = Math.max(0, Number(amt) || 0);
  const est = total > 0 ? (paid * n) / Math.max(total, n) : 0;
  const rs = rewardSym(s?.config);
  return (
    <div className="estimator card">
      <div>
        <span className="pixel muted">earnings estimator</span>
        <h3>What would {fmtNum(n)} ${brand.ticker} have earned?</h3>
        <p className="muted small">Uses the real payouts of the last 24 hours and the real total held. Volume changes every day, so this looks back. It is not a promise.</p>
      </div>
      <div className="est-io">
        <input type="number" min="0" value={amt} onChange={(e) => setAmt(e.target.value)} aria-label={`Amount of $${brand.ticker}`} />
        <div className="est-out">
          <b className="mono">{total > 0 && paid > 0 ? fmtNum(est, 4) : '—'}</b>
          <span className="muted small">{total > 0 && paid > 0 ? `${rs} in the last 24h` : 'fills in after the first payouts'}</span>
        </div>
      </div>
    </div>
  );
}

function Buy({ cfg }) {
  const mint = cfg?.tokenMint;
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!mint) return;
    navigator.clipboard?.writeText(mint).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };
  const venues = [
    ['Pump.fun', 'Bonding curve or PumpSwap', mint && `https://pump.fun/coin/${mint}`, 'pay'],
    ['Jupiter', 'Best route across Solana', mint && `https://jup.ag/swap/SOL-${mint}`, 'trade'],
    ['DexScreener', 'Chart, pairs and volume', mint && `https://dexscreener.com/solana/${mint}`, 'vault'],
  ];
  const steps = [
    ['Get a Solana wallet', 'Phantom, Solflare or Backpack. Free, takes a minute, and you keep the keys.', 'people'],
    ['Add some SOL', 'Buy SOL on any exchange and send it to your wallet address.', 'vault'],
    [`Swap for $${brand.ticker}`, 'Use the swap above at 0%, or any venue below.', 'trade'],
    ['Just hold', `Your wallet is picked up in the next snapshot and paid every ${cfg?.cycleMinutes || 5} minutes.`, 'pay'],
  ];
  return (
    <section className="section buy11">
      <SectionHead icon="swap" tone="trade" title={<>How to buy <span className="w-pay">${brand.ticker}</span></>} />
      <ol className="b11-steps">
        {steps.map(([t, d, tone], i) => (
          <li key={t} className={`b11-step tone-${tone}`} style={{ '--i': i }}>
            <span className="b11-n mono">0{i + 1}</span>
            <b>{t}</b>
            <span>{d}</span>
          </li>
        ))}
      </ol>
      <div className={`b11-ca ${mint ? 'is-live' : ''}`}>
        <span className="b11-ca-k pixel">contract</span>
        <span className="b11-ca-v mono">{mint || 'Revealed here the minute it launches'}</span>
        {mint ? (
          <button className="btn btn-ghost b11-copy" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        ) : (
          <a className="btn btn-ghost b11-copy" href={`https://x.com/${brand.xHandle}`} target="_blank" rel="noreferrer">
            Follow @{brand.xHandle}
          </a>
        )}
      </div>
      <div className="b11-venues">
        {venues.map(([name, sub, href, tone]) =>
          href ? (
            <a key={name} className={`b11-venue tone-${tone}`} href={href} target="_blank" rel="noreferrer">
              <b>{name}</b>
              <span>{sub}</span>
              <i aria-hidden="true">↗</i>
            </a>
          ) : (
            <div key={name} className={`b11-venue tone-${tone} is-off`}>
              <b>{name}</b>
              <span>{sub}</span>
              <i className="pixel">at launch</i>
            </div>
          ),
        )}
      </div>
    </section>
  );
}

function Footer({ page }) {
  return (
    <footer className="footer">
      <div className="foot-row">
        <div>
          <b>{brand.name}</b> · a hold-to-earn vault on Solana. Not affiliated with the {brand.key === 'zec' ? 'Zcash' : 'Monero'} project.
          <div className="muted small">Memecoins are volatile and can go to zero. Rewards depend on volume and are not guaranteed. Not financial advice.</div>
        </div>
        <div className="foot-links pixel">
          {PAGES.map((p) => (
            <Link key={p.key} to={p.to} className={`tone-${p.tone} ${page === p.key ? 'on' : ''}`}>
              {p.label}
            </Link>
          ))}
          <Link to="/how#faq" className="tone-people">
            FAQ
          </Link>
          <Link to="/app" className="tone-pay">
            My vault
          </Link>
          <a href={`https://x.com/${brand.xHandle}`} target="_blank" rel="noreferrer">
            x / @{brand.xHandle}
          </a>
        </div>
      </div>
      <div className="foot-wm" aria-hidden="true">
        {brand.name}
      </div>
    </footer>
  );
}

// Operator panel. The key is kept only in this tab's session storage and sent
// as a header, never in the URL.
function Admin() {
  const [key, setKey] = useState(() => {
    try {
      return sessionStorage.getItem('vault:admin') || '';
    } catch {
      return '';
    }
  });
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState('');
  const call = useCallback(
    async (path, body) => {
      setMsg('');
      try {
        sessionStorage.setItem('vault:admin', key);
      } catch {
        /* ignore */
      }
      const res = await fetch(brand.apiUrl + path, {
        method: body ? 'POST' : 'GET',
        headers: { 'x-admin-key': key, 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || 'HTTP ' + res.status);
      return j;
    },
    [key],
  );
  const load = async () => {
    try {
      setStatus(await call('/api/admin/status'));
    } catch (e) {
      setMsg(e.message);
    }
  };
  const act = async (path, body, label) => {
    try {
      setMsg(label + '…');
      const r = await call(path, body);
      setMsg(r.ok === false ? r.error : label + ' done' + (r.lastError ? ': ' + r.lastError : ''));
      load();
    } catch (e) {
      setMsg(e.message);
    }
  };
  const st = status?.stats;
  const [topup, setTopup] = useState('');
  return (
    <main className="app">
      <section className="section">
        <SectionHead icon="lock" tone="vault" title={"Operator"} right={<span className="muted small">needs the ADMIN_KEY you set in Cloudflare</span>} />
        <div className="lookup">
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Admin key" />
          <button className="btn" onClick={load}>
            Load status
          </button>
        </div>
        {msg && <div className="err">{msg}</div>}
        {st && (
          <>
            <div className="lookup">
              <button className="btn" onClick={() => act('/api/admin/run', {}, 'Run cycle now')}>
                Run cycle now
              </button>
              <button className="btn btn-ghost" onClick={() => act('/api/admin/pause', { paused: !st.config.paused }, st.config.paused ? 'Resume' : 'Pause')}>
                {st.config.paused ? 'Resume payouts' : 'Pause payouts'}
              </button>
            </div>
            <div className="lookup">
              <input inputMode="decimal" value={topup} onChange={(e) => setTopup(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="SOL you sent to the vault wallet" />
              <button className="btn" disabled={!(Number(topup) > 0)} onClick={() => act('/api/admin/topup', { sol: Number(topup) }, `Book ${topup} SOL for holders`)}>
                Add to holder rewards
              </button>
              <button className="btn btn-ghost" disabled={!(Number(topup) > 0)} onClick={() => act('/api/admin/topup', { sol: Number(topup), to: 'burn' }, `Book ${topup} SOL for burn`)}>
                Add to burn
              </button>
            </div>
            <dl className="spec card">
              <Row k="Live" v={st.config.live ? 'yes' : 'no (check TOKEN_MINT, TREASURY_SECRET_KEY, SOLANA_RPC_URL)'} />
              <Row k="Vault wallet" v={st.config.treasury || 'not set'} />
              <Row k="Token" v={st.config.tokenMint || 'not set'} />
              <Row k="Reward" v={st.config.rewardIsOwnToken ? 'buyback of own token' : st.config.rewardMint} />
              <Row k="Fees claimed" v={`${st.feesTotalSol} SOL`} />
              <Row k="Holders budget" v={`${st.pendingBudgetSol} SOL waiting to be spent`} />
              <Row k="Ops share" v={`${st.opsSol} SOL booked for ops (yours to withdraw)`} />
              <Row k="Rewards paid" v={`${st.rewardsPaid} (${st.paidWallets} wallets)`} />
              <Row k="Undistributed" v={st.rewardPool} />
              <Row k="Last cycle" v={st.lastCycleAt ? new Date(st.lastCycleAt).toLocaleString() : 'never'} />
              <Row k="Waiting on" v={status.pending ? `${status.pending.kind} transaction ${status.pending.sig.slice(0, 12)}… (settles automatically)` : 'nothing'} />
              <Row k="Bought, not yet burned" v={status.burnOwed && status.burnOwed !== '0' ? `${status.burnOwed} raw units (burn retries every cycle)` : 'none'} />
              <Row k="Last dropped" v={status.lastDropped || 'none'} />
              <Row k="Last error" v={status.lastError || 'none'} />
              <Row k="Last claim note" v={status.lastClaimError || 'none'} />
              <Row k="Last feed error" v={status.lastFeedError || 'none'} />
            </dl>
          </>
        )}
      </section>
    </main>
  );
}
