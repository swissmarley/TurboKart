/**
 * Hand-drawn inline SVG icons: every item in ITEMS plus menu / HUD glyphs.
 * All icons use a 64×64 viewBox and a chunky dark outline so they read at
 * any size over any background.
 */
import { ITEMS } from '../core/constants.js';
import { uid } from './util.js';

const INK = '#1d0f2e';
const G = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

function mushroom(cap = '#ff3b3b', spot = '#ffffff', under = '#c51d3c', extra = '') {
  return `<g ${G}>
    <path d="M21 37 C19 50 21 58.5 32 58.5 C43 58.5 45 50 43 37 Z" fill="#fff1d6"/>
    <path d="M24.5 53 C28 55.5 36 55.5 39.5 53" fill="none" stroke="#e2c79c" stroke-width="2.4"/>
    <ellipse cx="28" cy="45.5" rx="2.4" ry="3.9" fill="${INK}" stroke="none"/>
    <ellipse cx="36" cy="45.5" rx="2.4" ry="3.9" fill="${INK}" stroke="none"/>
    <path d="M5 35 C5 17 17 5.5 32 5.5 C47 5.5 59 17 59 35 C59 40 55 41.5 50 40.5 C40 38.5 24 38.5 14 40.5 C9 41.5 5 40 5 35 Z" fill="${cap}"/>
    <path d="M10 36.5 C21 34 43 34 54 36.5" fill="none" stroke="${under}" stroke-width="2.6"/>
    <circle cx="32" cy="17" r="6.6" fill="${spot}" stroke="none"/>
    <ellipse cx="14.8" cy="27.5" rx="4.6" ry="6.4" fill="${spot}" stroke="none" transform="rotate(-20 14.8 27.5)"/>
    <ellipse cx="49.2" cy="27.5" rx="4.6" ry="6.4" fill="${spot}" stroke="none" transform="rotate(20 49.2 27.5)"/>
    <path d="M12.5 18.5 C15.5 12.5 20.5 9.5 25 8.8" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2.6"/>
    ${extra}
  </g>`;
}

function sparkle(x, y, s = 1, fill = '#fff') {
  return `<path d="M${x} ${y - 6 * s} L${x + 1.6 * s} ${y - 1.6 * s} L${x + 6 * s} ${y} L${x + 1.6 * s} ${y + 1.6 * s} L${x} ${y + 6 * s} L${x - 1.6 * s} ${y + 1.6 * s} L${x - 6 * s} ${y} L${x - 1.6 * s} ${y - 1.6 * s} Z" fill="${fill}" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
}

function banana() {
  return `<g ${G}>
    <path d="M17 10 C10.5 29 18 49 44 56.5 C51 58.5 57.5 55.5 56.5 50.5 C55.8 47.5 52.5 47.2 49 47 C32 45 22.5 31.5 25 11.5 Z" fill="#ffe14a"/>
    <path d="M21.5 16 C20 32 28 45 46 51.5" fill="none" stroke="#e3ad12" stroke-width="2.6"/>
    <path d="M27.5 19 C28.5 30 33 37.5 40 42" fill="none" stroke="#fff7b0" stroke-width="2.6"/>
    <path d="M14.5 4.5 L24.5 6 L25 12.5 L16.5 12 Z" fill="#7a4a12"/>
    <circle cx="56.5" cy="50.5" r="2.2" fill="#5a3510"/>
  </g>`;
}

function shell(color, light, dark) {
  return `<g ${G}>
    <path d="M6 40.5 C6 47.5 18 53.5 32 53.5 C46 53.5 58 47.5 58 40.5 C58 36 6 36 6 40.5 Z" fill="#fffbe9"/>
    <path d="M8 40 C8 20 19 8.5 32 8.5 C45 8.5 56 20 56 40 C47 43.5 17 43.5 8 40 Z" fill="${color}"/>
    <path d="M32 15 L40.5 20 L40.5 30 L32 35 L23.5 30 L23.5 20 Z" fill="${light}" stroke="${dark}" stroke-width="2.4"/>
    <path d="M11 35.5 L13.5 25 L20.5 22.5 L20.5 31.5 L16.5 38.5 Z" fill="${light}" stroke="${dark}" stroke-width="2.4"/>
    <path d="M53 35.5 L50.5 25 L43.5 22.5 L43.5 31.5 L47.5 38.5 Z" fill="${light}" stroke="${dark}" stroke-width="2.4"/>
    <path d="M24 38.5 L27 34.5 L37 34.5 L40 38.5" fill="none" stroke="${dark}" stroke-width="2.4"/>
    <path d="M14.5 21 C17.5 15 22 12 26.5 11.2" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="2.6"/>
  </g>`;
}

function spiny() {
  return `<g ${G}>
    <path d="M12 33 C3 30 0.5 19 4 12 C8 19 13 21 18 23 Z" fill="#ffffff"/>
    <path d="M52 33 C61 30 63.5 19 60 12 C56 19 51 21 46 23 Z" fill="#ffffff"/>
    <path d="M6 42.5 C6 49.5 18 55.5 32 55.5 C46 55.5 58 49.5 58 42.5 C58 38 6 38 6 42.5 Z" fill="#fffbe9"/>
    <path d="M8 42 C8 23 19 12 32 12 C45 12 56 23 56 42 C47 45.5 17 45.5 8 42 Z" fill="#2f7bff"/>
    <path d="M26.5 15 L32 1.5 L37.5 15 Z" fill="#fff"/>
    <path d="M15 24 L10.5 10 L22.5 17 Z" fill="#fff"/>
    <path d="M49 24 L53.5 10 L41.5 17 Z" fill="#fff"/>
    <path d="M32 21 L39.5 25.5 L39.5 33.5 L32 38 L24.5 33.5 L24.5 25.5 Z" fill="#8fc0ff" stroke="#1546b8" stroke-width="2.4"/>
    <path d="M16 28 C18 23 21 20 24.5 18.5" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2.6"/>
  </g>`;
}

function starPath(cx, cy, R, r, points = 5) {
  let d = '';
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? R : r;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    d += `${i ? 'L' : 'M'}${(cx + Math.cos(a) * rad).toFixed(2)} ${(cy + Math.sin(a) * rad).toFixed(2)}`;
  }
  return `${d}Z`;
}

function star() {
  return `<g ${G}>
    <path d="${starPath(32, 34, 29.5, 14)}" fill="#ffe600"/>
    <path d="${starPath(32, 34, 20, 9.5)}" fill="#fff59a" stroke="none" opacity=".75"/>
    <ellipse cx="27" cy="33" rx="2.7" ry="5.2" fill="${INK}" stroke="none"/>
    <ellipse cx="37" cy="33" rx="2.7" ry="5.2" fill="${INK}" stroke="none"/>
    <circle cx="27.6" cy="31" r="1" fill="#fff" stroke="none"/>
    <circle cx="37.6" cy="31" r="1" fill="#fff" stroke="none"/>
  </g>`;
}

function lightning() {
  return `<g ${G}>
    <path d="M38 2.5 L12.5 36.5 L28 36.5 L21.5 61.5 L52 23.5 L35.5 23.5 L45.5 2.5 Z" fill="#ffd700"/>
    <path d="M37 9 L19.5 32.5 L29.5 32.5" fill="none" stroke="#fff8c2" stroke-width="2.6"/>
    <path d="M44 27.5 L31 44" fill="none" stroke="#e8a400" stroke-width="2.4"/>
  </g>`;
}

function bomb() {
  return `<g ${G}>
    <path d="M44 15 C48 10 51.5 9.5 54 6.5" fill="none" stroke="#8a6a3a" stroke-width="3"/>
    <rect x="35" y="11" width="11" height="9" rx="2" fill="#a9b2c6" transform="rotate(38 40.5 15.5)"/>
    <ellipse cx="20" cy="57" rx="7" ry="4" fill="#f2b33d"/>
    <ellipse cx="40" cy="57" rx="7" ry="4" fill="#f2b33d"/>
    <circle cx="30" cy="36" r="20.5" fill="#2b2547"/>
    <ellipse cx="21.5" cy="26.5" rx="6" ry="3.6" fill="#fff" opacity=".38" stroke="none" transform="rotate(-38 21.5 26.5)"/>
    <ellipse cx="25" cy="37" rx="3" ry="5.2" fill="#fff" stroke="none"/>
    <ellipse cx="35" cy="37" rx="3" ry="5.2" fill="#fff" stroke="none"/>
    <ellipse cx="25.6" cy="38" rx="1.4" ry="2.6" fill="${INK}" stroke="none"/>
    <ellipse cx="35.6" cy="38" rx="1.4" ry="2.6" fill="${INK}" stroke="none"/>
    <path d="${starPath(56, 6, 6.5, 2.8, 6)}" fill="#ffb020" stroke-width="1.8"/>
    <circle cx="56" cy="6" r="1.8" fill="#fff" stroke="none"/>
  </g>`;
}

function coin() {
  return `<g ${G}>
    <ellipse cx="32" cy="32" rx="22.5" ry="27" fill="#ffcc00"/>
    <ellipse cx="32" cy="32" rx="15.5" ry="20" fill="#ffd94a" stroke="#d98f00" stroke-width="2.6"/>
    <rect x="28.8" y="19" width="6.4" height="26" rx="3.2" fill="#fff3a0" stroke="#d98f00" stroke-width="2.2"/>
    <path d="M16 22 C18 15 22.5 10.5 27.5 8.5" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="2.6"/>
  </g>`;
}

const BASE = {
  [ITEMS.MUSHROOM]: () => mushroom(),
  [ITEMS.GOLDEN_MUSHROOM]: () =>
    mushroom('#ffc928', '#fff6c2', '#d18f00', `${sparkle(56, 9, 0.9)}${sparkle(7, 50, 0.7)}`),
  [ITEMS.BANANA]: banana,
  [ITEMS.GREEN_SHELL]: () => shell('#2fd85a', '#9ff5b2', '#128a33'),
  [ITEMS.RED_SHELL]: () => shell('#ff2d2d', '#ffb0a8', '#a3121c'),
  [ITEMS.SPINY_SHELL]: spiny,
  [ITEMS.STAR]: star,
  [ITEMS.LIGHTNING]: lightning,
  [ITEMS.BOMB]: bomb,
  [ITEMS.COIN]: coin,
};

const TRIPLE_OF = {
  [ITEMS.TRIPLE_MUSHROOM]: ITEMS.MUSHROOM,
  [ITEMS.TRIPLE_BANANA]: ITEMS.BANANA,
  [ITEMS.TRIPLE_GREEN_SHELL]: ITEMS.GREEN_SHELL,
  [ITEMS.TRIPLE_RED_SHELL]: ITEMS.RED_SHELL,
};

export function isTripleItem(type) {
  return type in TRIPLE_OF;
}

/** SVG markup for an item icon. Triple variants show three copies (classes c1..c3 for count-based hiding). */
export function itemIconSVG(type, cls = '') {
  if (TRIPLE_OF[type]) {
    const inner = BASE[TRIPLE_OF[type]]();
    return `<svg class="tk-icon tk-triple ${cls}" viewBox="0 0 64 64" aria-hidden="true">
      <g class="c3" transform="translate(26 1) scale(.58)">${inner}</g>
      <g class="c2" transform="translate(1 1) scale(.58)">${inner}</g>
      <g class="c1" transform="translate(12.5 24) scale(.62)">${inner}</g>
    </svg>`;
  }
  const fn = BASE[type];
  if (!fn) return questionIconSVG(cls);
  return `<svg class="tk-icon ${cls}" viewBox="0 0 64 64" aria-hidden="true">${fn()}</svg>`;
}

export function questionIconSVG(cls = '') {
  return `<svg class="tk-icon ${cls}" viewBox="0 0 64 64" aria-hidden="true"><text x="32" y="47" text-anchor="middle" font-family="Lilita One, sans-serif" font-size="44" fill="#fff" stroke="${INK}" stroke-width="3" paint-order="stroke">?</text></svg>`;
}

// ---------------------------------------------------------------------------
// Menu / HUD glyphs
// ---------------------------------------------------------------------------

export const ICONS = {
  trophy: () => `<svg class="tk-glyph" viewBox="0 0 64 64" aria-hidden="true"><g ${G}>
      <path d="M17 12 C6 12 5 30 21 33" fill="none" stroke-width="5"/>
      <path d="M47 12 C58 12 59 30 43 33" fill="none" stroke-width="5"/>
      <path d="M17 12 C6 12 5 30 21 33" fill="none" stroke="#ffd23f" stroke-width="2"/>
      <path d="M47 12 C58 12 59 30 43 33" fill="none" stroke="#ffd23f" stroke-width="2"/>
      <path d="M15 7 L49 7 C49 28 42 38 32 39 C22 38 15 28 15 7 Z" fill="#ffd23f"/>
      <path d="M21 11 C21 24 25 31 30 33.5" fill="none" stroke="#fff7c0" stroke-width="2.6"/>
      <rect x="27.5" y="38.5" width="9" height="8" fill="#e8a400"/>
      <path d="M18 57 L46 57 L43 46 L21 46 Z" fill="#ffd23f"/>
      <path d="${starPath(32, 20, 7, 3.2)}" fill="#fff" stroke-width="2"/>
    </g></svg>`,
  flags: () => {
    const c = uid('fl');
    const flag = 'M13 9 C24 3 35 14 55 8 L55 37 C35 43 24 32 13 38 Z';
    let squares = '';
    for (let r = 0; r < 4; r++) {
      for (let col = 0; col < 5; col++) {
        if ((r + col) % 2 === 0) squares += `<rect x="${13 + col * 8.4}" y="${2 + r * 10 + (col % 2) * 0}" width="8.4" height="10"/>`;
      }
    }
    return `<svg class="tk-glyph" viewBox="0 0 64 64" aria-hidden="true">
      <defs><clipPath id="${c}"><path d="${flag}"/></clipPath></defs>
      <g ${G}>
        <path d="M11 61 L11 5" fill="none" stroke-width="5"/>
        <circle cx="11" cy="5" r="3.5" fill="#ffd23f"/>
        <path d="${flag}" fill="#fff"/>
        <g clip-path="url(#${c})" fill="${INK}" stroke="none" transform="skewY(4)">${squares}</g>
        <path d="${flag}" fill="none"/>
      </g></svg>`;
  },
  stopwatch: () => `<svg class="tk-glyph" viewBox="0 0 64 64" aria-hidden="true"><g ${G}>
      <rect x="26" y="3" width="12" height="7" rx="2" fill="#ffd23f"/>
      <path d="M47 13 L52 8.5" fill="none" stroke-width="5"/>
      <circle cx="32" cy="36" r="23" fill="#fff"/>
      <circle cx="32" cy="36" r="17.5" fill="#e8f6ff" stroke="#6bb8ff" stroke-width="2.4"/>
      <path d="M32 36 L32 22" fill="none" stroke-width="4"/>
      <path d="M32 36 L42 41" fill="none" stroke="#ff3d6e" stroke-width="4"/>
      <circle cx="32" cy="36" r="3.4" fill="${INK}" stroke="none"/>
    </g></svg>`,
  gear: () => `<svg class="tk-glyph" viewBox="0 0 64 64" aria-hidden="true"><g ${G}>
      <path d="${gearPath(32, 32, 26, 19.5, 8)}" fill="#d9dcff"/>
      <circle cx="32" cy="32" r="9" fill="#7b6cff"/>
      <circle cx="32" cy="32" r="3.5" fill="#fff" stroke="none"/>
    </g></svg>`,
  back: () => `<svg class="tk-glyph" viewBox="0 0 64 64" aria-hidden="true"><path d="M40 10 L16 32 L40 54" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  chevron: () => `<svg class="tk-glyph" viewBox="0 0 64 64" aria-hidden="true"><path d="M22 10 L46 32 L22 54" fill="none" stroke="currentColor" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  star: (filled = true) => `<svg class="tk-glyph tk-star ${filled ? 'on' : 'off'}" viewBox="0 0 64 64" aria-hidden="true"><path d="${starPath(32, 34, 29, 13)}" ${G} /></svg>`,
  flame: () => `<svg class="tk-glyph" viewBox="0 0 64 64" aria-hidden="true"><g ${G}>
      <path d="M32 4 C36 16 50 22 50 40 C50 52 42 60 32 60 C22 60 14 52 14 40 C14 30 20 26 22 18 C26 24 27 28 27 32 C31 26 33 16 32 4 Z" fill="#ff5a1f"/>
      <path d="M32 30 C34 38 42 40 42 48 C42 54 37 57 32 57 C27 57 22 54 22 48 C22 43 26 41 27 36 C29 39 30 41 30 43 C32 39 33 35 32 30 Z" fill="#ffd23f" stroke-width="2.4"/>
    </g></svg>`,
  lap: () => `<svg class="tk-glyph" viewBox="0 0 64 64" aria-hidden="true"><g ${G}>
      <path d="M10 56 L10 8" fill="none" stroke-width="4"/>
      <path d="M11 9 L54 9 L54 34 L11 34 Z" fill="#fff"/>
      <path d="M11 9 H22 V17.3 H11 Z M33 9 H44 V17.3 H33 Z M22 17.3 H33 V25.6 H22 Z M44 17.3 H54 V25.6 H44 Z M11 25.6 H22 V34 H11 Z M33 25.6 H44 V34 H33 Z" fill="${INK}" stroke="none"/>
    </g></svg>`,
  warning: () => `<svg class="tk-glyph" viewBox="0 0 64 64" aria-hidden="true"><g ${G}>
      <path d="M32 5 L61 57 L3 57 Z" fill="#ffd23f"/>
      <path d="M32 22 L32 40" fill="none" stroke-width="7"/>
      <circle cx="32" cy="48.5" r="3.6" fill="${INK}"/>
    </g></svg>`,
  uturn: () => `<svg class="tk-glyph" viewBox="0 0 64 64" aria-hidden="true"><g ${G}>
      <path d="M18 58 L18 28 C18 14 46 14 46 28 L46 36" fill="none" stroke-width="13"/>
      <path d="M18 58 L18 28 C18 14 46 14 46 28 L46 36" fill="none" stroke="#fff" stroke-width="7"/>
      <path d="M34 34 L58 34 L46 52 Z" fill="#fff"/>
    </g></svg>`,
  cup: (color = '#ffd23f') => `<svg class="tk-glyph" viewBox="0 0 64 64" aria-hidden="true"><g ${G}>
      <path d="M14 10 C3 10 4 28 19 30" fill="none" stroke-width="5"/>
      <path d="M50 10 C61 10 60 28 45 30" fill="none" stroke-width="5"/>
      <path d="M12 6 L52 6 C52 28 44 38 32 39 C20 38 12 28 12 6 Z" fill="${color}"/>
      <path d="M19 10 C19 23 23 31 29 33" fill="none" stroke="#ffffff" stroke-opacity=".6" stroke-width="2.6"/>
      <rect x="27" y="38.5" width="10" height="8" fill="${color}"/>
      <path d="M16 58 L48 58 L44 46 L20 46 Z" fill="${color}"/>
      <path d="${starPath(32, 21, 8, 3.6)}" fill="#fff" stroke-width="2"/>
    </g></svg>`,
};

function gearPath(cx, cy, R, r, teeth) {
  let d = '';
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a0 = i * step;
    const pts = [
      [a0 - step * 0.2, r],
      [a0 - step * 0.13, R],
      [a0 + step * 0.13, R],
      [a0 + step * 0.2, r],
      [a0 + step * 0.5, r],
    ];
    for (let j = 0; j < pts.length; j++) {
      const [a, rad] = pts[j];
      d += `${i === 0 && j === 0 ? 'M' : 'L'}${(cx + Math.cos(a) * rad).toFixed(2)} ${(cy + Math.sin(a) * rad).toFixed(2)}`;
    }
  }
  return `${d}Z`;
}

const TROPHY_TIERS = {
  1: { a: '#fff6b0', b: '#ffd23f', c: '#e09200', d: '#9a5a00' },
  2: { a: '#ffffff', b: '#dfe6f2', c: '#9aa8c0', d: '#5d6880' },
  3: { a: '#ffd9b0', b: '#e59a5a', c: '#b0622a', d: '#6e3712' },
};

/** Big glossy trophy for the Grand Prix ceremony (1 gold, 2 silver, 3 bronze). */
export function trophySVG(place = 1) {
  const t = TROPHY_TIERS[place] || TROPHY_TIERS[1];
  const g = uid('tr');
  return `<svg class="tk-trophy-svg" viewBox="0 0 200 240" aria-hidden="true">
    <defs>
      <linearGradient id="${g}a" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${t.c}"/><stop offset=".28" stop-color="${t.a}"/><stop offset=".5" stop-color="${t.b}"/><stop offset="1" stop-color="${t.d}"/>
      </linearGradient>
      <linearGradient id="${g}b" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${t.b}"/><stop offset="1" stop-color="${t.d}"/>
      </linearGradient>
      <radialGradient id="${g}c" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    </defs>
    <g stroke="${INK}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">
      <path d="M52 40 C14 40 12 104 66 110" fill="none" stroke-width="16"/>
      <path d="M148 40 C186 40 188 104 134 110" fill="none" stroke-width="16"/>
      <path d="M52 40 C14 40 12 104 66 110" fill="none" stroke="${t.c}" stroke-width="7"/>
      <path d="M148 40 C186 40 188 104 134 110" fill="none" stroke="${t.c}" stroke-width="7"/>
      <path d="M40 22 L160 22 C160 98 136 128 100 132 C64 128 40 98 40 22 Z" fill="url(#${g}a)"/>
      <ellipse cx="100" cy="22" rx="60" ry="9" fill="${t.d}"/>
      <rect x="86" y="130" width="28" height="30" fill="url(#${g}b)"/>
      <path d="M70 160 L130 160 L134 176 L66 176 Z" fill="url(#${g}a)"/>
      <path d="M54 176 L146 176 L150 214 L50 214 Z" fill="#3a2a6a"/>
      <path d="M64 186 L136 186 L138 204 L62 204 Z" fill="url(#${g}a)" stroke-width="3"/>
      <path d="${starPath(100, 70, 26, 11)}" fill="#fff" stroke-width="5"/>
    </g>
    <path d="M58 34 C60 80 72 104 92 118" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="7" stroke-linecap="round"/>
    <circle cx="70" cy="44" r="16" fill="url(#${g}c)"/>
  </svg>`;
}

/** Stars for difficulty ratings. */
export function starsHTML(count, max = 3) {
  let out = '';
  for (let i = 0; i < max; i++) out += ICONS.star(i < count);
  return out;
}

export { starPath };
