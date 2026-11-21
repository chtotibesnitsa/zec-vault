// The five public pages: Home, Live, Swap, How it works, Leaderboards.
import { useEffect, useRef, useState } from 'react';
import { brand, caOf } from '../brand.js';
import { fmtNum, short, solscanAcct, usePoll } from '../api.js';
import { SwapCard } from '../swap.jsx';
import { shareOnX } from '../auth.jsx';
import { Link } from '../nav.jsx';
import { Icon } from './icons.jsx';
import { AsciiRain, VaultFlow } from './ascii.jsx';
import { useCycles, useHolders, SAMPLE } from './data.js';
import { CopyCA, CycleHistory, EarnCheck, FeeBand, HolderGrid, HoldersTable, LiveFeed, PageHead, SecHead, StatStrip, TICK, TopHolders, ZClock, rewardSym } from './parts.jsx';

const int = (v) => Math.round(Number(v) || 0).toLocaleString('en-US');

// ---------- home ----------
export function ZHome({ s, cfg, events }) {
  const holders = useHolders(500);
  const cycles = useCycles(48);
  const cm = cfg?.cycleMinutes || 5;
  const hold = Math.round((cfg?.rewardShareBps ?? 8000) / 100);
  const burn = Math.round((cfg?.burnBps ?? 2000) / 100);
  return (
    <main className="zx-main">
      <section className="zh">
        <div className="zh-copy">
          <div className="zh-tag">
            <span className="zx-pixel">zcash meta · on solana</span>
            <span className={`zh-state ${cfg?.live ? 'on' : ''}`}>{cfg?.live ? 'live' : 'pre-launch'}</span>
          </div>
          <h1 className="zh-t">
            <span className="zh-t1">Hold {TICK}.</span>
            <span className="zh-t2">
              Get paid every <span className="zh-hl">{cm} min</span>.
            </span>
          </h1>
          <dl className="zh-spec">
            <div>
              <dt>fees to holders</dt>
              <dd>{hold}%</dd>
              <dd>paid in {rewardSym(cfg)}</dd>
            </div>
            <div>
              <dt>buyback + burn</dt>
              <dd>{burn}%</dd>
              <dd>supply only drops</dd>
            </div>
            <div>
              <dt>payout cycle</dt>
              <dd>{cm} MIN</dd>
              <dd>automatic, no claim</dd>
            </div>
            <div>
              <dt>min. hold</dt>
              <dd>{fmtNum(cfg?.minHoldTokens || 100000, 0)}</dd>
              <dd>any Solana wallet</dd>
            </div>
          </dl>
          <div className="zh-cta">
            <Link className="zb zb-gold zb-lg" to="/swap">
              Buy {TICK} at 0% fee
              <Icon name="arrow" size={18} />
            </Link>
            <Link className="zb zb-line zb-lg" to="/how">
              How payouts work
            </Link>
            <CopyCA mint={caOf(cfg)} />
          </div>
        </div>
        <div className="zh-clock">
          <ZClock s={s} cfg={cfg} />
        </div>
      </section>

      <EarnCheck cfg={cfg} />
      <StatStrip s={s} cfg={cfg} />

      <section className="zsec">
        <SecHead k="01 / holders" title="Every holder is a dot." right={<Link to="/boards">full board →</Link>} />
        <div className="zhold">
          <HolderGrid data={holders} cfg={cfg} />
          <aside className="zhold-top">
            <span className="zx-pixel zhold-k">top five</span>
            <TopHolders data={holders} cfg={cfg} />
          </aside>
        </div>
      </section>

      <FlowScroll cfg={cfg} />
      <FeeBand cfg={cfg} />

      <section className="zsec zduo">
        <div>
          <SecHead k="02 / live from solana" title="Happening right now" right={<Link to="/live">all activity →</Link>} />
          <LiveFeed events={events} cfg={cfg} s={s} rows={8} />
        </div>
        <div>
          <SecHead k="03 / every 5 minutes" title="Payout history" right={cycles.cycles.length ? `${cycles.cycles.length} cycles` : null} />
          <CycleHistory data={cycles} cfg={cfg} rows={6} />
        </div>
      </section>

      <Closer cfg={cfg} />
    </main>
  );
}

// Sticky scroll story: the ASCII vault on one side, three short beats on the other.
const BEATS = [
  ['Someone trades', (c) => `Every buy and sell of ${TICK}, on any app, pays a small creator fee in SOL. It lands in the vault wallet.`],
  ['The vault splits it', (c) => `Every ${c?.cycleMinutes || 5} minutes the vault claims the fees. ${Math.round((c?.rewardShareBps ?? 8000) / 100)}% is for holders, ${Math.round((c?.burnBps ?? 2000) / 100)}% buys ${TICK} and burns it.`],
  ['Coins hop into your wallet', (c) => `The holder share is swapped into ${rewardSym(c)} and sent to every wallet by balance. You don't claim, stake or sign anything.`],
];
export function FlowScroll({ cfg }) {
  const ref = useRef(null);
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const el = ref.current;
    let f = 0;
    const on = () => {
      if (f) return;
      f = requestAnimationFrame(() => {
        f = 0;
        const r = el.getBoundingClientRect();
        const p = Math.min(0.999, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)));
        setPhase(Math.floor(p * 3));
      });
    };
    on();
    window.addEventListener('scroll', on, { passive: true });
    window.addEventListener('resize', on);
    return () => {
      window.removeEventListener('scroll', on);
      window.removeEventListener('resize', on);
      cancelAnimationFrame(f);
    };
  }, []);
  return (
    <section className="zflow" ref={ref} id="how">
      <div className="zflow-stick">
        <div className="zflow-copy">
          <SecHead k="how the vault pays" title="Hold. That's the whole job." />
          <ol className="zflow-steps">
            {BEATS.map(([t, b], i) => (
              <li key={t} className={i === phase ? 'on' : ''}>
                <span className="zflow-n zx-dot">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <h3>{t}</h3>
                  <p>{b(cfg)}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="zflow-prog" aria-hidden="true">
            {BEATS.map((_, i) => (
              <i key={i} className={i <= phase ? 'on' : ''} />
            ))}
          </div>
        </div>
        <div className="zflow-art">
          <VaultFlow phase={phase} />
          <span className="zflow-cap zx-pixel">diagram · not live data</span>
        </div>
      </div>
    </section>
  );
}

function Closer({ cfg }) {
  return (
    <section className="zclose">
      <AsciiRain className="zclose-bg" />
      <h2 className="zclose-t">
        <span>Hold it.</span>
        <span>Get paid every {cfg?.cycleMinutes || 5} minutes.</span>
      </h2>
      <div className="zh-cta center">
        <Link className="zb zb-gold zb-lg" to="/swap">
          Buy {TICK}
        </Link>
        <button className="zb zb-line zb-lg" onClick={() => shareOnX(`$${brand.ticker}: hold it and the vault pays you every ${cfg?.cycleMinutes || 5} minutes from real trading fees. 80% to holders, 20% bought and burned.`, window.location.origin)}>
          Share on X
        </button>
      </div>
    </section>
  );
}

// ---------- live ----------
export function ZLive({ s, cfg, events }) {
  const cycles = useCycles(96);
  const last = cycles.cycles[0];
  return (
    <main className="zx-main">
      <PageHead
        path="live"
        title="Live"
        meta={[
          ['status', cfg?.live ? (cfg.paused ? 'paused' : 'paying') : 'pre-launch'],
          ['holders', s ? int(s.holders) : '—'],
          ['last cycle', last ? `${fmtNum(last.paid)} to ${int(last.recipients)}` : '—'],
        ]}
      >
        Every trade, fee claim, burn and payout, straight from Solana. Each line links to its transaction.
      </PageHead>
      <StatStrip s={s} cfg={cfg} />
      <section className="zsec zduo zduo-wide">
        <div>
          <SecHead k="feed" title="Happening right now" />
          <LiveFeed events={events} cfg={cfg} s={s} rows={30} />
        </div>
        <div>
          <SecHead k="buyback + burn" title="Burn" />
          <dl className="zburn">
            <div>
              <dt>burned forever</dt>
              <dd className="zx-dot">{fmtNum(s?.burned || 0)}</dd>
              <dd>{TICK}</dd>
            </div>
            <div>
              <dt>of supply</dt>
              <dd className="zx-dot">{(((s?.burned || 0) / 1e9) * 100).toFixed(3)}%</dd>
              <dd>1B total</dd>
            </div>
            <div>
              <dt>SOL spent on burns</dt>
              <dd className="zx-dot">{(s?.burnSol || 0).toFixed(2)}</dd>
              <dd>{(s?.burnPendingSol || 0).toFixed(3)} SOL queued</dd>
            </div>
          </dl>
          <LiveFeed events={events} cfg={cfg} s={s} rows={6} kinds={['burn']} />
        </div>
      </section>
      <section className="zsec">
        <SecHead k="every 5 minutes" title="Payout history" right="paid out · wallets paid · holders in/out · burned" />
        <CycleHistory data={cycles} cfg={cfg} rows={30} />
      </section>
    </main>
  );
}

// ---------- swap ----------
export function ZSwap({ cfg }) {
  return (
    <main className="zx-main">
      <PageHead path="swap" title="Swap at 0%" meta={[['our fee', '0%'], ['router', 'Jupiter'], ['custody', 'none']]}>
        Best route across Solana, signed in your own wallet. We add nothing on top.
      </PageHead>
      <section className="zswap">
        <div className="zswap-card">
          <SwapCard cfg={cfg} />
        </div>
        <div className="zswap-side">
          <ul className="zswap-why">
            <li>
              <b className="zx-dot">0%</b>
              <span>No platform fee from us. You pay the pool and network fees only.</span>
            </li>
            <li>
              <b className="zx-dot">1</b>
              <span>One route. Jupiter checks every Solana DEX and splits the order for the best price.</span>
            </li>
            <li>
              <b className="zx-dot">0</b>
              <span>Funds held by us. Your wallet builds, signs and sends the swap.</span>
            </li>
          </ul>
          <table className="ztab zswap-cmp">
            <thead>
              <tr>
                <th>where you swap</th>
                <th className="r">extra fee per trade</th>
              </tr>
            </thead>
            <tbody>
              <tr className="hl">
                <td>{brand.name} swap</td>
                <td className="r">0%</td>
              </tr>
              <tr>
                <td>Typical Telegram trading bot</td>
                <td className="r">about 1%</td>
              </tr>
              <tr>
                <td>Typical in-wallet swap</td>
                <td className="r">up to 0.85%</td>
              </tr>
            </tbody>
          </table>
          <p className="zswap-note">Every {TICK} trade, here or anywhere, pays the Pump.fun creator fee that funds holder payouts.</p>
        </div>
      </section>
    </main>
  );
}

// ---------- how it works ----------
const FAQ = [
  ['Do I have to connect my wallet to get paid?', 'No. The vault reads every token account of the coin from the chain each cycle and sends payouts straight to each wallet. Connecting is only for the swap and for seeing your own numbers.'],
  ['Who can get paid?', 'Any normal Solana wallet holding the minimum at the snapshot. Pools, bonding curves and other program-owned accounts are skipped, and so is the vault itself.'],
  ['Is this real ZEC?', 'Zcash runs on its own chain, so native ZEC can’t be sent on Solana. So the vault pays in ZEC on Solana: ZEC bridged to Solana, which arrives in the same wallet that holds $ZATS and can be swapped or bridged back out to native ZEC. The ticker on this page always shows what is paid.'],
  ['Can the team take the fees?', 'The split is fixed in the vault’s settings: 80% to holders, 20% to buyback and burn, 0% to the team. Every claim, swap, burn and payout is a public transaction you can check on Solscan.'],
  ['What if a payout is tiny?', 'Amounts too small to be worth a transaction roll over to the next cycle and are added to your next payout. Nothing is lost.'],
  ['Why every 5 minutes?', 'Short cycles keep each payout close to the trading that paid for it, and you can watch the vault work in real time.'],
];
export function ZHow({ cfg, s }) {
  return (
    <main className="zx-main">
      <PageHead path="how" title="How it works" meta={[['payout', `every ${cfg?.cycleMinutes || 5} min`], ['split', `${Math.round((cfg?.rewardShareBps ?? 8000) / 100)} / ${Math.round((cfg?.burnBps ?? 2000) / 100)}`], ['you do', 'nothing']]}>
        Trading fees go into a vault. The vault pays holders and burns supply on a timer. All on-chain, all automatic.
      </PageHead>
      <FlowScroll cfg={cfg} />
      <FeeBand cfg={cfg} />
      <section className="zsec zduo">
        <div>
          <SecHead k="spec" title="The token" />
          <dl className="zspec">
            {[
              ['ticker', TICK],
              ['chain', 'Solana'],
              ['supply', '1,000,000,000, fixed'],
              ['launch', 'Pump.fun fair launch'],
              ['pays out in', rewardSym(cfg)],
              ['payout cycle', `${cfg?.cycleMinutes || 5} minutes`],
              ['min. hold', `${fmtNum(cfg?.minHoldTokens || 100000)} ${TICK}`],
              ['vault wallet', cfg?.treasury ? <a href={solscanAcct(cfg.treasury)} target="_blank" rel="noreferrer">{short(cfg.treasury)}</a> : 'published at launch'],
              ['contract', caOf(cfg) ? <a href={solscanAcct(caOf(cfg))} target="_blank" rel="noreferrer">{short(caOf(cfg))}</a> : 'published at launch'],
            ].map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div>
          <SecHead k="faq" title="Questions" />
          <div className="zfaq">
            {FAQ.map(([q, a]) => (
              <details key={q}>
                <summary>
                  {q}
                  <Icon name="down" size={16} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}

// ---------- leaderboards ----------
export function ZBoards({ cfg }) {
  const holders = useHolders(1000);
  const earners = usePoll(SAMPLE ? null : '/api/leaderboard', 30000).data;
  const d = cfg?.rewardDecimals ?? 6;
  const top = (earners?.top || []).slice(0, 10);
  return (
    <main className="zx-main">
      <PageHead path="boards" title="Leaderboards" meta={[['holders', holders.count ? int(holders.count) : '—'], ['joined', holders.ok ? '+' + holders.joined : '—'], ['left', holders.ok ? '−' + holders.left : '—']]}>
        Every wallet in the vault, ranked by bag. Dots move when ranks change. Hover one to see its numbers.
      </PageHead>
      <section className="zsec">
        <HolderGrid data={holders} cfg={cfg} big />
      </section>
      <section className="zsec zduo zduo-wide">
        <div>
          <SecHead k="by holding" title="Top 100 holders" />
          <HoldersTable data={holders} cfg={cfg} />
        </div>
        <div>
          <SecHead k="by payouts" title="Top earners" />
          {top.length ? (
            <ol className="zth">
              {top.map((r, i) => (
                <li key={r.wallet}>
                  <span className={`zth-r ${['t1', 't2', 't3', 't4', 't5'][i] || 'l3'}`}>{String(i + 1).padStart(2, '0')}</span>
                  <span className="zth-w">
                    <a href={solscanAcct(r.wallet)} target="_blank" rel="noreferrer">
                      {earners.profiles?.[r.wallet]?.u ? '@' + earners.profiles[r.wallet].u : short(r.wallet)}
                    </a>
                    <small>{r.payouts} payouts</small>
                  </span>
                  <span className="zth-a">
                    {fmtNum(Number(BigInt(r.paid_raw)) / 10 ** d, 4)}
                    <small>{rewardSym(cfg)}</small>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <TopHolders data={{ holders: [], sample: false }} n={5} />
          )}
          <p className="zswap-note">Fills in after the first payout. Hold through cycles to climb.</p>
        </div>
      </section>
    </main>
  );
}
