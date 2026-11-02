import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { brand, fill } from './brand.js';
import { api, fmtNum, fmtUsd, short, solscanAcct, solscanTx, ago, useFeed, usePoll } from './api.js';
import { AsciiField, CopyChip, Countdown, Counter, Emblem, FeedTable, Marquee, Reveal, Scramble, Toasts, WalletLink, Win, Wordmark } from './components.jsx';
import { Px } from './pixel.jsx';

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
  const events = useFeed(pushToast);
  const cfg = stats.data?.config || null;
  const isApp = path.startsWith('/app');
  const isAdmin = path.startsWith('/admin');

  useEffect(() => {
    const r = document.documentElement;
    r.dataset.theme = brand.theme;
    r.dataset.vault = brand.key;
    r.style.setProperty('--accent', brand.accent);
    r.style.setProperty('--accent2', brand.accent2);
    r.style.setProperty('--accent-deep', brand.accentDeep);
    r.style.setProperty('--accent-text', brand.accentText);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', brand.theme === 'light' ? '#f1ece0' : '#0c0b0a');
    document.title = isApp ? `${brand.name} · vault` : `${brand.name} · ${brand.headline}`;
  }, [isApp]);

  return (
    <div className={`site v-${brand.key}`} style={{ "--n": brand.name.length }}>
      <div className="bg-grid" aria-hidden="true" />
      <StatusBar stats={stats.data} />
      <Nav go={go} isApp={isApp} cfg={cfg} />
      <Marquee events={events} cfg={cfg} />
      <div className="page" key={isAdmin ? 'admin' : isApp ? 'app' : 'home'}>
        {isAdmin ? <Admin /> : isApp ? <VaultApp stats={stats} events={events} cfg={cfg} /> : <Landing go={go} stats={stats} events={events} cfg={cfg} />}
      </div>
      <Footer />
      <Toasts items={toasts} cfg={cfg} />
      <PixelWipe state={wipe} />
    </div>
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
            <a href="#how">how</a>
            <a href="#live">live</a>
            <a href="#token">token</a>
            <a href="#faq">faq</a>
          </>
        )}
        {cfg?.tokenMint && (
          <a className="hide-sm" href={`https://pump.fun/coin/${cfg.tokenMint}`} target="_blank" rel="noreferrer">
            buy ${brand.ticker}
          </a>
        )}
        <a href={isApp ? '/' : '/app'} className="btn btn-sm" onClick={(e) => link(e, isApp ? '/' : '/app')}>
          {isApp ? 'Home' : 'Open vault'}
        </a>
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

function Landing({ go, stats, events, cfg }) {
  const s = stats.data;
  const shareBps = cfg?.rewardShareBps ?? 8000;
  const [feedTab, setFeedTab] = useState('all');
  const filtered = useMemo(() => {
    if (feedTab === 'trades') return events.filter((e) => e.kind === 'buy' || e.kind === 'sell');
    if (feedTab === 'payouts') return events.filter((e) => e.kind === 'payout');
    if (feedTab === 'vault') return events.filter((e) => e.kind === 'claim' || e.kind === 'buyback');
    return events;
  }, [events, feedTab]);
  const faq = useMemo(
    () => [
      ['Do I need to stake or claim?', 'No. Hold ${ticker} in any Solana wallet. The vault finds you in its snapshot and sends your share. Nothing to sign, nothing to lock.'],
      ['Where does the money come from?', 'Only from real trading. Pump.fun pays the coin creator a fee on every trade. The vault wallet is the creator, so those fees land there and get spent on rewards. Nothing is minted.'],
      ['How is my share worked out?', 'Your balance divided by the total held by all eligible wallets at each snapshot. Pools, bonding curves and the vault itself are excluded, so only people get paid.'],
      ['Can the team take the fees?', `${(shareBps / 100).toFixed(0)}% of every fee claimed is booked for holders and can only be spent buying rewards. The other ${(100 - shareBps / 100).toFixed(0)}% runs the project. Every claim, buy and payout is a public Solana transaction linked in the feed.`],
      ['Why no KYC?', 'Because there is nothing to sign up for. We never hold your coins and never ask who you are. You hold a token in your own wallet; the vault sends rewards to that address.'],
      ...brand.faqExtra,
      ['Is this safe?', 'Memecoins are volatile and can go to zero. Rewards depend on trading volume and are never guaranteed. Not financial advice.'],
    ],
    [shareBps],
  );
  const stepIcons = ['swap', 'flame', 'coins'];

  return (
    <main>
      <section className="hero">
        <div className="hero-mark">
          <div className="kicker pixel">
            <span className="rec" /> {brand.kicker}
          </div>
          <h1 className="hero-wm" aria-label={brand.name}>
            <Wordmark text={brand.name} />
          </h1>
        </div>
        <div className="hero-grid">
          <div className="hero-copy">
            <Scramble as="p" text={brand.headline} className="headline" />
            <p className="lede">{fill(brand.sub, cfg)}</p>
            <div className="hero-cta">
              <a href="/app" className="btn" onClick={(e) => (e.preventDefault(), go('/app'))}>
                Check my rewards
              </a>
              {cfg?.tokenMint ? (
                <a className="btn btn-ghost" href={`https://pump.fun/coin/${cfg.tokenMint}`} target="_blank" rel="noreferrer">
                  Buy ${brand.ticker}
                </a>
              ) : (
                <a className="btn btn-ghost" href={`https://x.com/${brand.xHandle}`} target="_blank" rel="noreferrer">
                  Follow for launch
                </a>
              )}
            </div>
            <CopyChip value={cfg?.tokenMint} />
            <ul className="hero-facts pixel">
              <li>
                <Px name="lock" size={16} /> no custody
              </li>
              <li>
                <Px name="eye" size={16} /> no kyc
              </li>
              <li>
                <Px name="clock" size={16} /> paid every {cfg?.cycleMinutes || 5} min
              </li>
            </ul>
          </div>
          <HeroViewport />
        </div>
      </section>

      <Reveal>
        <section className="section" id="stats">
          <SectionHead n={1} title="Vault, live" right={<span className="pixel muted">{s ? <><span className="rec" /> refresh 15s</> : brand.apiUrl ? 'connecting…' : 'opens at launch'}</span>} />
          <Win title={`${brand.key}-vault — stats`} right={<span className="pixel">{s?.config?.live ? 'online' : 'standby'}</span>}>
            <StatsGrid s={s} />
          </Win>
        </section>
      </Reveal>

      <Reveal>
        <section className="section" id="how">
          <SectionHead n={2} title="How it works" />
          <ol className="steps">
            {brand.steps.map(([t, d], i) => (
              <li key={i} className="step">
                <div className="step-art">
                  <Px name={stepIcons[i]} size={64} />
                  <span className="pixel step-n">step 0{i + 1}</span>
                </div>
                <h3>{fill(t, cfg)}</h3>
                <p>{fill(d, cfg)}</p>
              </li>
            ))}
          </ol>
        </section>
      </Reveal>

      <Reveal>
        <section className="section" id="fees">
          <SectionHead n={3} title="Where every fee goes" />
          <div className="fees card">
            <FeeBlocks pct={shareBps / 100} />
            <div className="fees-legend">
              <div>
                <b className="mono">{(shareBps / 100).toFixed(0)}%</b>
                <span>to holders as {rewardSym(cfg)}. Can only be spent on rewards.</span>
              </div>
              <div className="muted">
                <b className="mono">{(100 - shareBps / 100).toFixed(0)}%</b>
                <span>runs the project. Shown on-chain like everything else.</span>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="section" id="live">
          <SectionHead n={4} title="Every move, verifiable" right={<span className="muted small">each line links to its Solana transaction</span>} />
          <Win title={`${brand.key}-vault — tail -f`} tabs={['all', 'trades', 'payouts', 'vault']} tab={feedTab} onTab={setFeedTab}>
            <FeedTable events={filtered} cfg={cfg} empty="No activity yet. The first trade after launch shows up here within a minute." />
          </Win>
        </section>
      </Reveal>

      <Reveal>
        <TopEarners />
      </Reveal>

      <Reveal>
        <section className="section" id="token">
          <SectionHead n={6} title="The token" />
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
          <SectionHead n={7} title="FAQ" />
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
          <a href="/app" className="btn" onClick={(e) => (e.preventDefault(), go('/app'))}>
            Open the vault
          </a>
        </div>
      </section>
    </main>
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
  const { data } = usePoll('/api/leaderboard', 30000);
  const cfgState = usePoll('/api/config', 60000);
  const d = cfgState.data?.rewardDecimals ?? 6;
  const top = data?.top || [];
  return (
    <section className="section" id="earners">
      <SectionHead n={5} title="Top earners" right={<span className="pixel muted">all-time payouts</span>} />
      {top.length ? (
        <ol className="earners card">
          {top.slice(0, 10).map((r, i) => (
            <li key={r.wallet}>
              <span className={`rank pixel r${i + 1}`}>#{String(i + 1).padStart(2, '0')}</span>
              <WalletLink address={r.wallet} />
              <span className="mono earn-amt">{fmtNum(Number(BigInt(r.paid_raw)) / 10 ** d, 4)}</span>
              <span className="muted small">{r.payouts} payouts</span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="empty card">
          <Px name="users" size={28} /> Fills in after the first payout.
        </div>
      )}
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
      {tab === 'my vault' && <MyVault cfg={cfg} />}
      {tab === 'buy' && <Buy cfg={cfg} />}
    </main>
  );
}

function MyVault({ cfg }) {
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
    if (addr) look(addr);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    const p = window.phantom?.solana || window.solana || window.solflare;
    if (!p) return setErr('No Solana wallet found. Paste your address instead.');
    try {
      const r = await p.connect();
      const a = (r?.publicKey || p.publicKey).toString();
      setAddr(a);
      look(a);
    } catch {
      setErr('Wallet connection was cancelled.');
    }
  };
  const rs = rewardSym(cfg);
  return (
    <section className="section">
      <SectionHead n={3} title={"My vault"} right={<span className="muted small">read-only, we never ask you to sign anything</span>} />
      <div className="lookup">
        <input value={addr} onChange={(e) => setAddr(e.target.value.trim())} placeholder="Paste your Solana wallet address" spellCheck="false" />
        <button className="btn" onClick={() => look(addr)}>
          Check
        </button>
        <button className="btn btn-ghost" onClick={connect}>
          Use my wallet
        </button>
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
          {data.payouts.length ? (
            <ul className="log card">
              {data.payouts.map((p) => (
                <li key={p.sig} className="log-row k-payout">
                  <span className="log-ts">{new Date(p.ts).toISOString().slice(11, 19)}</span>
                  <span className="log-tag pixel">PAID</span>
                  <span className="log-text">
                    {fmtNum(p.amount, 4)} {rs}
                  </span>
                  <a className="log-link" href={solscanTx(p.sig)} target="_blank" rel="noreferrer">
                    {ago(p.ts)} {'↗'}
                  </a>
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
    </section>
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
