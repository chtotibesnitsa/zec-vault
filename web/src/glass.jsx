// Liquid glass + depth: the ambient light field behind every page, floating
// glass objects, cards that tilt toward the pointer, and sections that rise
// into place. All CSS transforms (GPU), no extra libraries. Everything here
// switches off for reduced motion, touch-only devices skip the tilt, and
// low-power devices get the "lite" mode (no blur, no floating objects).
import { useEffect } from 'react';

// Cards that tilt toward the pointer. Big panels tilt less (see maxDeg).
const TILT =
  '.pb-item, .st-step, .usage-item, .burn-card, .buy-card, .stat, .hm-step, .key-item, .estimator, .swapcard, .spec, .lpanel, .flow-viz, .swap, .holdcheck, .faq details, .earn-row, .glass-tilt';
// Blocks that rise into place the first time they scroll into view.
const REVEAL =
  '.pb-item, .st-step, .usage-item, .burn-card, .buy-card, .hm-step, .key-item, .lpanel, .spec, .faq details, .flow-viz, .swap, .earners, .s5-head, .phead';

const prefersReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

// Low-power devices get solid surfaces instead of live blur.
export function detectLite() {
  const n = navigator.hardwareConcurrency || 8;
  const mem = navigator.deviceMemory || 8;
  const lite = n <= 4 || mem <= 2 || prefersReduced();
  document.documentElement.classList.toggle('lite', lite);
  return lite;
}

export function useDepth(routeKey) {
  // Tilt + pointer light, one listener for the whole page.
  useEffect(() => {
    if (prefersReduced() || !finePointer()) return;
    let cur = null;
    let frame = 0;
    let last = null;
    const reset = (el) => {
      el.style.removeProperty('--rx');
      el.style.removeProperty('--ry');
      el.classList.remove('is-tilt');
    };
    const apply = () => {
      frame = 0;
      const e = last;
      const el = e.target.closest?.(TILT);
      if (cur && cur !== el) reset(cur);
      cur = el;
      if (!el || el.classList.contains('rv')) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      const maxDeg = Math.max(1.5, Math.min(8, 2600 / Math.max(r.width, r.height)));
      el.style.setProperty('--rx', `${(-py * maxDeg).toFixed(2)}deg`);
      el.style.setProperty('--ry', `${(px * maxDeg).toFixed(2)}deg`);
      el.classList.add('is-tilt');
    };
    const on = (e) => {
      last = e;
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const leave = () => cur && reset(cur);
    window.addEventListener('pointermove', on, { passive: true });
    document.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', on);
      document.removeEventListener('pointerleave', leave);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Scroll reveal, re-armed on every page change.
  useEffect(() => {
    if (prefersReduced() || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          const el = en.target;
          io.unobserve(el);
          el.classList.add('rv-in');
          // Hand the transform back to the tilt once the entrance is done.
          setTimeout(() => el.classList.remove('rv', 'rv-in'), 950);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    const t = setTimeout(() => {
      const fold = window.innerHeight * 0.92;
      document.querySelectorAll(REVEAL).forEach((el, i) => {
        if (el.getBoundingClientRect().top < fold) return; // already on screen: leave it alone
        el.classList.add('rv');
        el.style.setProperty('--rv-d', `${(i % 4) * 70}ms`);
        io.observe(el);
      });
    }, 60);
    return () => {
      clearTimeout(t);
      io.disconnect();
      document.querySelectorAll('.rv').forEach((el) => el.classList.remove('rv', 'rv-in'));
    };
  }, [routeKey]);
}

// Fixed light field behind the page: slow color orbs (the glass refracts
// them) and a few floating glass objects at the edges. Pure CSS animation.
export function Ambient({ page = 'home' }) {
  return (
    <div className={`ambient pg-${page}`} aria-hidden="true">
      <i className="stars" />
      <i className="page-glow" />
      <div className="horizon">
        <i />
      </div>
      <i className="orb o-pay" />
      <i className="orb o-vault" />
      <i className="orb o-people" />
      <i className="orb o-burn" />
      <div className="floaters3d">
        <GlassCube className="fc1" />
        <GlassCube className="fc2" />
        <GlassRing className="fr1" />
        <GlassRing className="fr2" />
        <GlassCoin className="fk1" />
      </div>
      <i className="vignette" />
      <i className="grain" />
    </div>
  );
}

function GlassCube({ className }) {
  return (
    <div className={`g3d gcube ${className}`}>
      <div className="g3d-spin">
        {['f', 'b', 'l', 'r', 't', 'u'].map((s) => (
          <i key={s} className={`face ${s}`} />
        ))}
      </div>
    </div>
  );
}

function GlassRing({ className }) {
  return (
    <div className={`g3d gring ${className}`}>
      <div className="g3d-spin">
        <i />
      </div>
    </div>
  );
}

// A coin built from stacked discs so it has a real edge when it turns.
function GlassCoin({ className }) {
  return (
    <div className={`g3d gcoin ${className}`}>
      <div className="g3d-spin">
        {Array.from({ length: 7 }, (_, i) => (
          <i key={i} style={{ '--z': `${(i - 3) * 2}px` }} className={i === 0 || i === 6 ? 'cap' : ''} />
        ))}
      </div>
    </div>
  );
}
