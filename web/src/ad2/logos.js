// Brand marks used in the ad, redrawn as simple inline SVGs so the page needs
// no downloads. To use official artwork instead, replace a string here with
// the brand's own SVG markup.
const u = (() => {
  let i = 0;
  return () => 'lg' + i++;
})();

export function solana(size = 40) {
  const g = u();
  return `<svg class="logo" width="${size}" height="${size * 0.8}" viewBox="0 0 100 80"><defs><linearGradient id="${g}" x1="100" y1="0" x2="0" y2="80" gradientUnits="userSpaceOnUse"><stop stop-color="#00FFA3"/><stop offset="1" stop-color="#DC1FFF"/></linearGradient></defs><g fill="url(#${g})"><path d="M20 0H100L80 18H0Z"/><path d="M0 31H80L100 49H20Z"/><path d="M20 62H100L80 80H0Z"/></g></svg>`;
}

export function x(size = 28, color = '#fff') {
  return `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 24 24"><path fill="${color}" d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>`;
}

export function phantom(size = 40) {
  return `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#AB9FF2"/><path fill="#FFFDF8" d="M8 23.5C8 15.6 13.6 9.5 21 9.5S33 15 33 21.4c0 5.7-3.9 9.6-8.4 9.6-1.8 0-2.6-1-3.6-1-1.2 0-2.4 1.6-4.4 1.6C12.4 31.6 8 28.6 8 23.5Z"/><ellipse cx="20.2" cy="18.6" rx="1.6" ry="2.6" fill="#3C315B"/><ellipse cx="26" cy="18.6" rx="1.6" ry="2.6" fill="#3C315B"/></svg>`;
}

export function solflare(size = 40) {
  const g = u();
  return `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 40 40"><defs><linearGradient id="${g}" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse"><stop stop-color="#FFEF46"/><stop offset="1" stop-color="#FC7227"/></linearGradient></defs><rect width="40" height="40" rx="10" fill="#02050A"/><circle cx="20" cy="20" r="11" fill="url(#${g})"/><path d="M14 22c3-1 5-4 12-3-3 1-5 4-12 3Z" fill="#02050A"/></svg>`;
}

export function backpack(size = 40) {
  return `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#E33E3F"/><path d="M16 9.5h8a3 3 0 0 1 3 3v1.2h-14v-1.2a3 3 0 0 1 3-3Z" fill="#fff" opacity=".85"/><rect x="11" y="14.5" width="18" height="17" rx="4.5" fill="#fff"/><rect x="11" y="21" width="18" height="4.5" fill="#E33E3F" opacity=".35"/></svg>`;
}

export function metamask(size = 40) {
  return `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#1C1407"/><path d="M8 8l10 7.5h4L32 8l-2.2 9.5 1.7 7.5-4.8 7H13.3l-4.8-7 1.7-7.5Z" fill="#F6851B"/><path d="M13.3 32l3.4-4.6h6.6l3.4 4.6Z" fill="#C0AD9E"/><path d="M15 20.5l3 1.2-3.4 1.2Zm10 0l-3 1.2 3.4 1.2Z" fill="#233447"/><path d="M8 8l10 7.5-6.8.3Zm24 0l-10 7.5 6.8.3Z" fill="#E2761B"/></svg>`;
}

export function pumpfun(size = 40) {
  return `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 40 40"><g transform="rotate(-45 20 20)"><rect x="5" y="12.5" width="30" height="15" rx="7.5" fill="#fff" stroke="#0E1A12" stroke-width="2"/><path d="M20 12.5h7.5a7.5 7.5 0 0 1 0 15H20Z" fill="#53D38C" stroke="#0E1A12" stroke-width="2"/><rect x="9" y="15.5" width="6" height="2.2" rx="1.1" fill="#fff" opacity=".9"/></g></svg>`;
}

export function jupiter(size = 40) {
  const g = u();
  return `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 40 40"><defs><linearGradient id="${g}" x1="8" y1="32" x2="32" y2="8" gradientUnits="userSpaceOnUse"><stop stop-color="#C7F284"/><stop offset=".5" stop-color="#00BEF0"/><stop offset="1" stop-color="#FFC43D"/></linearGradient></defs><circle cx="20" cy="20" r="19" fill="#141726"/><g fill="none" stroke="url(#${g})" stroke-width="2.4" stroke-linecap="round"><path d="M9 25c6-1 13-6 17-14"/><path d="M11 29c7-1.5 14-7 19-15"/><path d="M8 20.5c4.5-1 9-4.5 11.5-9"/></g></svg>`;
}

export function solscan(size = 28) {
  return `<svg class="logo" width="${size}" height="${size}" viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="none" stroke="#c7f0ff" stroke-width="2.4"/><circle cx="14" cy="14" r="5.5" fill="#38c6e6"/></svg>`;
}

// The site's own mark: the pixel shield from the nav, in gold.
const SHIELD = ['#########', '#+++++++#', '#+++++++#', '#+++++#+#', '#++++#++#', '#+#+#+++#', '.#+#+++#.', '..#+++#..', '...###...'];
export function zatoshi(size = 40, ink = '#f6d48e', acc = '#e3a83a') {
  let r = '';
  SHIELD.forEach((row, y) => {
    for (let i = 0; i < row.length; i++) {
      if (row[i] === '#') r += `<rect x="${i}" y="${y}" width="1.02" height="1.02" fill="${ink}"/>`;
      else if (row[i] === '+') r += `<rect x="${i}" y="${y}" width="1.02" height="1.02" fill="${acc}"/>`;
    }
  });
  return `<svg class="logo zlogo" width="${size}" height="${size}" viewBox="0 0 9 9" shape-rendering="crispEdges">${r}</svg>`;
}
