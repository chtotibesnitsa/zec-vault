// Page links. Any component can open another page without prop drilling:
// App listens for the event and runs the page wipe.
export function navigate(to) {
  window.dispatchEvent(new CustomEvent('vault:nav', { detail: to }));
}

export function Link({ to, children, onClick, ...rest }) {
  return (
    <a
      href={to}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

// One color per kind of information, used everywhere on the site.
//   pay    = money paid to holders (gold)
//   burn   = buyback and burn (orange-red)
//   vault  = fees the vault collects and spends (cyan)
//   trade  = buys and swaps (green), sell = sells (red)
//   people = holders, names, invites, leaderboards (violet)
export const KIND_TONE = { payout: 'pay', burn: 'burn', claim: 'vault', buyback: 'vault', buy: 'trade', sell: 'sell', join: 'people' };
export const KIND_ICON = { payout: 'coins', burn: 'flame', claim: 'bolt', buyback: 'swap', buy: 'swap', sell: 'swap', join: 'eye' };
