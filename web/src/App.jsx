import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { brand, fill } from './brand.js';
import { api, fmtNum, fmtUsd, short, solscanAcct, solscanTx, ago, useFeed, usePoll } from './api.js';
import { AsciiField, CopyChip, Countdown, Counter, Emblem, FeedTable, Marquee, Reveal, Scramble, Toasts, WalletLink, Win, Wordmark } from './components.jsx';
import { Px } from './pixel.jsx';
import { FloatingProof, PayoutPulse, UsageStrip } from './proof.jsx';
import { SAMPLE_STATS, useSampleFeed } from './sample.js';
import { BurnTracker, FlowStory, Hero5, LiveBoard, ProofBar, SwapSection } from './landing.jsx';
import { AccountButton, AuthProvider, InviteCopy, inviteLink, shareOnX, useAuth } from './auth.jsx';

const Hero3D = lazy(() => import('./Hero3D.jsx'));
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Client-side routes with a pixel-dissolve wipe between pages.
function useRoute() {
  const [path, setPath] = useState(window.location.pathname);
  const [wipe, setWipe] = useState('');
  useEffect(() => {
    const on = () => setPath(window.location.pathname);
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
  }, []);
  const go = useCallback((p) => {
    const swap = () => {
      window.history.pushState({}, '', p);
      setPath(p);
      window.scrollTo({ top: 0 });
    };
    if (reducedMotion()) return swap();
    setWipe('in');
    setTimeout(() => {
      swap();
      setWipe('out');
      setTimeout(() => setWipe(''), 520);
    }, 420);
  }, []);
  return [path, go, wipe];
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
  // Before launch the page runs on clearly labelled sample activity.
  const preview = !realEvents.length && !cfg?.live;
  const sampleTick = useRef(0);
  const sampleEvents = useSampleFeed(preview, (e) => {
    if (sampleTick.current++ % 3 === 2) pushToast(e);
  });
  const events = realEvents.length ? realEvents : sampleEvents;
  const isApp = path.startsWith('/app');
  const isAdmin = path.startsWith('/admin');
  const isSwap = path.startsWith('/swap');

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
    document.title = isApp ? `${brand.name} · vault` : `${brand.name} · ${brand.headline}`;
  }, [isApp]);

  const [notice, setNotice] = useState('');
  const notify = useCallback((m) => {
    setNotice(m);
    setTimeout(() => setNotice(''), 5000);
  }, []);

  return (
    <AuthProvider notify={notify}>
    <div className={`site v-${brand.key}`} style={{ "--n": brand.name.length }}>
      <div className="bg-grid" aria-hidden="true" />
      <StatusBar stats={stats.data} />
      <Nav go={go} isApp={isApp} cfg={cfg} />
      <Marquee events={events} cfg={cfg} />
      <div className="page" key={isAdmin ? 'admin' : isApp ? 'app' : isSwap ? 'swap' : 'home'}>
        {isAdmin ? <Admin /> : isSwap ? (
          <main>
            <SwapSection cfg={cfg} />
            <LiveBoard events={events} cfg={cfg} preview={preview} />
          </main>
        ) : isApp ? <VaultApp stats={stats} events={events} cfg={cfg} /> : <Landing go={go} stats={stats} events={events} cfg={cfg} preview={preview} />}
      </div>
      <Footer />
      <Toasts items={toasts} cfg={cfg} />
      <PixelWipe state={wipe} />
      {notice && <div className="notice pixel">{notice}</div>}
    </div>
    </AuthProvider>
  );
}

function useClock() {
  const [t, setT] = useState(() => new Date());
  useEffect(() => {
    const iv = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(iv);
  }, []);
  return t;
}

// Thin system bar. Every value on it is real: vault state, payout timer, UTC clock.
function StatusBar({ stats }) {
  const now = useClock();
  const live = stats?.config?.live;
  const paused = stats?.config?.paused;
  const state = !brand.apiUrl ? 'pre-launch' : !stats ? 'connecting' : paused ? 'paused' : live ? 'online' : 'pre-launch';
  return (
    <div className="statusbar pixel">
      <span>
        <span className={`led ${state === 'online' ? 'on' : ''}`} /> vault {state}
      </span>
      <span className="hide-sm">no kyc · no custody · no sign-up</span>
      <span className="hide-sm">
        next payout {live ? <Countdown to={stats?.nextCycleAt} /> : '--:--'}
      </span>
      <span>
        {now.toISOString().slice(11, 19)} utc
      </span>
    </div>
  );
}

function Nav({ go, isApp, cfg }) {
  const link = (e, p) => {
    e.preventDefault();
    go(p);
  };
  return (
    <header className="nav">
      <a href="/" className="logo" onClick={(e) => link(e, '/')} aria-label={`${brand.name} home`}>
        <Px name={brand.key === 'zec' ? 'shield' : 'eye'} size={26} className="logo-px" />
        <Wordmark text={brand.name} className="wm-sm" />
      </a>
      <nav className="nav-links">
        {!isApp && (
          <>
            <a href="#live">live</a>
            <a href="#swap">swap</a>
            <a href="#flow">how</a>
            <a href="#burn">burn</a>
            <a href="#faq" className="hide-sm">faq</a>
          </>
        )}
        {cfg?.tokenMint && (
          <a className="hide-sm" href={`https://pump.fun/coin/${cfg.tokenMint}`} target="_blank" rel="noreferrer">
            buy ${brand.ticker}
          </a>
        )}
        <a href={isApp ? '/' : '/app'} className="btn btn-sm hide-xs" onClick={(e) => link(e, isApp ? '/' : '/app')}>
          {isApp ? 'Home' : 'Open vault'}
        </a>
        <AccountButton />
      </nav>
    </header>
  );
}

function StatTile({ label, children, hint, icon, big }) {
  return (
    <div className={`stat ${big ? 'stat-big' : ''}`}>
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
      <StatTile big label="paid to holders" hint={rs} icon="coins">
        <Counter value={s?.rewardsPaid || 0} />
      </StatTile>
      <StatTile big label="next payout" hint={live ? `every ${s.config.cycleMinutes} min, automatic` : 'starts at launch'} icon="clock">
        {live ? <Countdown to={s?.nextCycleAt} /> : '--:--'}
      </StatTile>
      <StatTile label="paid last 24h" hint={rs} icon="bolt">
        <Counter value={s?.rewardsPaid24h || 0} />
      </StatTile>
      <StatTile icon="users" label="wallets earning" hint={s?.config ? `hold ${fmtNum(s.config.minHoldTokens)}+ to qualify` : 'every holder above the minimum'}>
        <Counter value={s?.holders || 0} format={(v) => Math.round(v).toLocaleString()} />
      </StatTile>
      <StatTile label="fees collected" hint="SOL, all time" icon="flame">
        <Counter value={s?.feesTotalSol || 0} format={(v) => v.toFixed(3)} />
      </StatTile>
      <StatTile label="trades 24h" hint="real swaps, on-chain" icon="swap">
        <Counter value={s?.trades24h || 0} format={(v) => Math.round(v).toLocaleString()} />
      </StatTile>
      <StatTile icon="chart" label="price" hint={m ? `${m.change24h >= 0 ? '+' : ''}${m.change24h}% 24h` : 'from dexscreener'}>
        {fmtUsd(m?.priceUsd)}
      </StatTile>
      <StatTile icon="pie" label="market cap" hint={m ? `vol 24h ${fmtUsd(m.volume24h)}` : 'from dexscreener'}>
        {fmtUsd(m?.marketCap)}
      </StatTile>
    </div>
  );
}

function SectionHead({ n, title, right }) {
  return (
    <div className="shead">
      <span className="pixel shead-n">[{String(n).padStart(2, '0')}]</span>
      <h2>{title}</h2>
      {right && <span className="shead-r">{right}</span>}
    </div>
  );
}

function HeroViewport() {
  const [ok, setOk] = useState(true);
  useEffect(() => {
    try {
      const c = document.createElement('canvas');
      if (!(c.getContext('webgl2') || c.getContext('webgl'))) setOk(false);
    } catch {
      setOk(false);
    }
  }, []);
  return (
    <div className="viewport">
      <span className="vp-corner tl" />
      <span className="vp-corner tr" />
      <span className="vp-corner bl" />
      <span className="vp-corner br" />
      <div className="vp-hud pixel">
        {brand.hud.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      <div className="vp-hud vp-hud-r pixel">
        <span>render  ascii/webgl</span>
        <span>
          state  <b>{brand.statusWord}</b>
        </span>
      </div>
      {ok ? (
        <Suspense fallback={<Emblem kind={brand.emblem} />}>
          <Hero3D kind={brand.emblem} accent={brand.accent} accent2={brand.accent2} />
        </Suspense>
      ) : (
        <Emblem kind={brand.emblem} />
      )}
      <div className="vp-scan" aria-hidden="true" />
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

function Landing({ go, stats, events, cfg, preview }) {
  const s = stats.data;
  const proof = preview ? { ...SAMPLE_STATS, ...(s || {}), community: SAMPLE_STATS.community, holders: SAMPLE_STATS.holders, burned: SAMPLE_STATS.burned, burnSol: SAMPLE_STATS.burnSol, rewardsPaid: SAMPLE_STATS.rewardsPaid, trades24h: SAMPLE_STATS.trades24h } : s;
  const shareBps = cfg?.rewardShareBps ?? 8000;
  const burnBps = cfg?.burnBps ?? 1000;
  const faq = useMemo(
    () => [
      ['Do I need to stake or claim?', 'No. Hold ${ticker} in any Solana wallet. The vault finds you in its snapshot and sends your share. Nothing to sign, nothing to lock.'],
      ['Where does the money come from?', 'Only from real trading. Pump.fun pays the coin creator a fee on every trade. The vault wallet is the creator, so those fees land there and get spent on rewards. Nothing is minted.'],
      ['How is my share worked out?', 'Your balance divided by the total held by all eligible wallets at each snapshot. Pools, bonding curves and the vault itself are excluded, so only people get paid.'],
      ['Can the team take the fees?', `${(shareBps / 100).toFixed(0)}% of every fee claimed is booked for holders and can only be spent buying rewards. ${(burnBps / 100).toFixed(0)}% buys $${brand.ticker} and burns it. The other ${(100 - shareBps / 100 - burnBps / 100).toFixed(0)}% runs the project. Every claim, buy, burn and payout is a public Solana transaction linked in the feed.`],
      ['Why swap on this site?', 'We add 0% on top. The swap is routed by Jupiter and signed in your own wallet, so you get the best price and the funds never pass through us.'],
      ['Why no KYC?', 'Because there is nothing to sign up for. We never hold your coins and never ask who you are. You hold a token in your own wallet; the vault sends rewards to that address.'],
      ...brand.faqExtra,
      ['Is this safe?', 'Memecoins are volatile and can go to zero. Rewards depend on trading volume and are never guaranteed. Not financial advice.'],
    ],
    [shareBps, burnBps],
  );

  return (
    <main>
      <Hero5
        cfg={cfg}
        s={proof}
        preview={preview}
        visual={<HeroViewport />}
        overlay={
          <>
            <FloatingProof events={events} cfg={cfg} />
            <PayoutPulse s={s} sample={preview} />
          </>
        }
      />
      <ProofBar s={proof} preview={preview} />

      <Reveal>
        <LiveBoard events={events} cfg={cfg} preview={preview} />
      </Reveal>

      <Reveal>
        <SwapSection cfg={cfg} />
      </Reveal>

      <FlowStory cfg={cfg} s={proof} />

      <Reveal>
        <BurnTracker s={proof} events={events} cfg={cfg} preview={preview} />
      </Reveal>

      <Reveal>
        <Starter go={go} cfg={cfg} />
      </Reveal>

      <Reveal>
        <section className="section" id="community">
          <SectionHead n={2} title="Every feature, in use" right={<span className="pixel muted">{preview ? 'sample counts' : 'live counts'}</span>} />
          <UsageStrip s={proof} sample={preview} />
        </section>
      </Reveal>

      <Reveal>
        <TopEarners />
      </Reveal>

      <Reveal>
        <section className="section" id="token">
          <SectionHead n={4} title="The token" />
          <dl className="spec card">
            <Row k="ticker" v={`$${brand.ticker}`} />
            <Row k="launch" v="Fair launch on Pump.fun, no presale" />
            <Row k="supply" v="1,000,000,000" />
            <Row k="reward paid" v={rewardSym(cfg)} />
            <Row k="payout timer" v={`every ${cfg?.cycleMinutes || 5} minutes`} />
            <Row k="contract" v={cfg?.tokenMint ? <a className="mono" href={solscanAcct(cfg.tokenMint)} target="_blank" rel="noreferrer">{cfg.tokenMint}</a> : 'revealed at launch'} />
            <Row k="vault wallet" v={cfg?.treasury ? <a className="mono" href={solscanAcct(cfg.treasury)} target="_blank" rel="noreferrer">{cfg.treasury}</a> : 'revealed at launch'} />
          </dl>
        </section>
      </Reveal>

      <Reveal>
        <section className="section" id="faq">
          <SectionHead n={5} title="FAQ" />
          <div className="faq">
            {faq.map(([q, a], i) => (
              <details key={i}>
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

      <section className="closer">
        <AsciiField className="closer-field" />
        <div className="closer-in">
          <Scramble as="h2" text={brand.closer} className="closer-h" />
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
      t: 'Just hold',
      d: `Keep ${fmtNum(cfg?.minHoldTokens || 100000)}+ in any wallet. Payouts land every ${cfg?.cycleMinutes || 5} min. Nothing to stake or claim.`,
      done: Boolean(h?.eligible),
      cta: null,
    },
    {
      ic: 'eye',
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
      ic: 'flame',
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
      <SectionHead n={1} title="Start in 30 seconds" right={<span className="pixel muted">{me ? `${done}/4 done` : 'no sign-up, no kyc'}</span>} />
      <div className="starter">
        <div className="st-bar">
          <i style={{ width: `${(done / 4) * 100}%` }} />
        </div>
        {steps.map((x, i) => (
          <div key={x.t} className={`st-step ${x.done ? 'done' : ''}`} style={{ '--i': i }}>
            <span className="st-n pixel">{x.done ? '✓' : '0' + (i + 1)}</span>
            <Px name={x.ic} size={40} />
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
      who: <WalletLink address={r.wallet} name={diamonds.profiles?.[r.wallet]} />,
      value: `${r.streak} payouts`,
      note: r.neverSold ? 'never sold' : 'since last sell',
    }));
  if (tab === 'recruiters')
    rows = (recruiters?.top || []).map((r) => ({
      key: r.username,
      who: r.wallet ? <WalletLink address={r.wallet} name={{ u: r.username, x: r.x }} /> : <span className="who">@{r.username}</span>,
      value: `${r.recruits}`,
      note: 'holders invited',
    }));
  const sampleMode = !cfgState.data?.live && !rows.length;
  if (sampleMode) {
    const names = ['night_owl', 'ghost_01', 'no_kyc', 'quiet_one', 'cipher', 'zero_trace', 'shade'];
    rows = names.map((u, i) => ({
      key: u,
      who: (
        <span className="who">
          @{u} {i % 2 === 0 && <span className="xbadge">𝕏</span>}
        </span>
      ),
      value: tab === 'earners' ? fmtNum(98000 / (i + 1.3), 2) : tab === 'diamond hands' ? `${60 - i * 7} payouts` : `${24 - i * 3}`,
      note: <span className="sample-tag pixel">sample</span>,
    }));
  }
  const empty = {
    earners: 'Fills in after the first payout.',
    'diamond hands': 'Wallets that keep getting paid without selling show up here.',
    recruiters: me?.username ? 'No invites yet. Share your link from My vault to top this board.' : 'Connect a wallet and pick a name to get your invite link.',
  }[tab];
  return (
    <section className="section" id="earners">
      <SectionHead n={3} title="Leaderboards" right={<span className="pixel muted">real payouts, real holders</span>} />
      <Win title={`${brand.key}-vault — boards`} tabs={['earners', 'diamond hands', 'recruiters']} tab={tab} onTab={setTab}>
        {rows.length ? (
          <ol className="earners">
            {rows.map((r, i) => (
              <li key={r.key}>
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
            <SectionHead n={1} title={"Overview"} right={<span className="muted small">{s?.config?.paused ? 'payouts paused' : s?.config?.live ? 'vault running' : 'opens at launch'}</span>} />
            <Win title={`${brand.key}-vault — stats`}>
              <StatsGrid s={s} />
            </Win>
          </section>
          <section className="section">
            <SectionHead n={2} title={"Last vault actions"} />
            <Win title={`${brand.key}-vault — actions`}>
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
      <SectionHead n={3} title={'My vault'} right={<span className="muted small">signing in is free and never sends a transaction</span>} />
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
            <StatTile icon="wallet" label="Holding" hint={`$${brand.ticker}`}>
              {fmtNum(data.balance)}
            </StatTile>
            <StatTile icon="pie" label="Share of vault" hint={data.eligible ? 'eligible' : 'not in last snapshot'}>
              {data.sharePct.toFixed(4)}%
            </StatTile>
            <StatTile icon="coins" label="Received" hint={rs}>
              {fmtNum(data.paid, 4)}
            </StatTile>
            <StatTile icon="clock" label="Pending" hint="sent in the next payouts">
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
  return (
    <section className="section">
      <SectionHead n={4} title={`Buy $${brand.ticker}`} />
      {mint ? (
        <div className="buy-grid">
          <a className="buy-card card" href={`https://pump.fun/coin/${mint}`} target="_blank" rel="noreferrer">
            <b>Pump.fun</b>
            <span>Bonding curve or PumpSwap</span>
          </a>
          <a className="buy-card card" href={`https://jup.ag/swap/SOL-${mint}`} target="_blank" rel="noreferrer">
            <b>Jupiter</b>
            <span>Best route across Solana</span>
          </a>
          <a className="buy-card card" href={`https://dexscreener.com/solana/${mint}`} target="_blank" rel="noreferrer">
            <b>DexScreener</b>
            <span>Chart and pairs</span>
          </a>
        </div>
      ) : (
        <div className="empty">The contract address goes live here at launch. Follow <a href={`https://x.com/${brand.xHandle}`}>@{brand.xHandle}</a> so you don’t miss it.</div>
      )}
      <p className="muted small">Then just hold. Your wallet is picked up in the next snapshot. {short(mint || '')}</p>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="foot-row">
        <div>
          <b>{brand.name}</b> · a hold-to-earn vault on Solana. Not affiliated with the {brand.key === 'zec' ? 'Zcash' : 'Monero'} project.
          <div className="muted small">Memecoins are volatile and can go to zero. Rewards depend on volume and are not guaranteed. Not financial advice.</div>
        </div>
        <div className="foot-links pixel">
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
      setMsg(label + ' done' + (r.lastError ? ': ' + r.lastError : ''));
      load();
    } catch (e) {
      setMsg(e.message);
    }
  };
  const st = status?.stats;
  return (
    <main className="app">
      <section className="section">
        <SectionHead n={9} title={"Operator"} right={<span className="muted small">needs the ADMIN_KEY you set in Cloudflare</span>} />
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
