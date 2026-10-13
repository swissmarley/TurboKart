/**
 * Procedural character portraits / emblems (inline SVG) built from a
 * character's colours, weight class and initial. Each character gets a
 * distinct helmet stripe, eyewear and ear/horn/antenna silhouette that is
 * guessed from keywords in its id/name/tagline, falling back to a stable hash.
 */
import { toCss, shade, hashString, uid, esc, luminance } from './util.js';

const INK = '#1d0f2e';

const EAR_KEYWORDS = [
  [/bunny|rabbit|hare|bun\b/i, 'bunny'],
  [/cat|fox|wolf|kitsune|lynx|tiger|husky|jackal/i, 'cat'],
  [/bear|panda|mouse|hamster|koala|monkey|raccoon|otter|ted/i, 'round'],
  [/robot|bot\b|droid|mech|android|cyber/i, 'antenna'],
  [/dino|rex|lizard|croc|gator/i, 'spikes'],
  [/dragon|bull\b|devil|goat|demon|viking|ram\b|imp\b|horn/i, 'horns'],
  [/dog|pup|bulldog|hound|beagle/i, 'floppy'],
];
const EAR_TYPES = ['none', 'round', 'cat', 'bunny', 'horns', 'antenna', 'spikes', 'floppy'];

/** Explicit mapping for the `species` field (src/kart/characters.js extra field). */
const SPECIES_EARS = {
  fox: 'cat', cat: 'cat', wolf: 'cat', tiger: 'cat',
  bunny: 'bunny', rabbit: 'bunny',
  redpanda: 'round', panda: 'round', bear: 'round', mouse: 'round', hamster: 'round', koala: 'round',
  robot: 'antenna',
  dino: 'spikes', lizard: 'spikes',
  dragon: 'horns', goat: 'horns',
  bulldog: 'floppy', dog: 'floppy',
  human: 'none', penguin: 'none', bird: 'none', frog: 'none',
};

function pickEars(character, hsh) {
  const sp = String(character.species || '').toLowerCase();
  if (sp && SPECIES_EARS[sp]) return SPECIES_EARS[sp];
  const text = `${sp} ${character.id || ''} ${character.name || ''} ${character.tagline || ''}`;
  for (const [re, type] of EAR_KEYWORDS) if (re.test(text)) return type;
  return EAR_TYPES[hsh % EAR_TYPES.length];
}

export function characterPalette(character) {
  const c = (character && character.colors) || {};
  const primary = toCss(c.primary ?? character?.cssColor ?? '#ff4d4d');
  return {
    primary,
    secondary: toCss(c.secondary ?? shade(primary, -0.45)),
    accent: toCss(c.accent ?? '#ffd23f'),
    skin: toCss(c.skin ?? '#ffd2a8'),
    css: toCss(character?.cssColor ?? primary),
  };
}

/**
 * @param {object} character  CHARACTERS entry (or { id, name, cssColor } for minimal data)
 * @returns {string} SVG markup (viewBox 0 0 100 100, fills its container)
 */
export function portraitSVG(character, cls = '') {
  const ch = character || { id: '?', name: '?' };
  const pal = characterPalette(ch);
  const { primary, secondary, accent, skin } = pal;
  const weight = ch.weightClass || 'medium';
  const hsh = hashString(ch.id || ch.name || '?');
  const ears = pickEars(ch, hsh);
  const species = String(ch.species || '').toLowerCase();
  const eyewear = (hsh >>> 4) % 3; // 0 goggles, 1 visor band, 2 cap brim
  const stripe = (hsh >>> 7) % 3; // 0 centre stripe, 1 twin stripes, 2 zigzag
  const id = uid('pt');
  const hr = weight === 'heavy' ? 22.5 : weight === 'light' ? 18 : 20.2;
  const cx = 50;
  const cy = weight === 'light' ? 58 : 56;
  const sw = weight === 'heavy' ? 41 : weight === 'light' ? 29 : 34;
  const initial = esc(((ch.name || ch.id || '?').trim()[0] || '?').toUpperCase());
  const emblemText = luminance(primary) > 0.72 ? shade(primary, -0.6) : primary;

  // --- ears / horns / antenna (drawn behind the helmet) -------------------
  let back = '';
  if (ears === 'round') {
    for (const s of [-1, 1]) {
      back += `<circle cx="${cx + s * hr * 0.86}" cy="${cy - hr * 0.86}" r="${hr * 0.4}" fill="${skin}" stroke="${INK}" stroke-width="2.6"/>
               <circle cx="${cx + s * hr * 0.86}" cy="${cy - hr * 0.86}" r="${hr * 0.2}" fill="${shade(skin, -0.25)}"/>`;
    }
  } else if (ears === 'cat') {
    for (const s of [-1, 1]) {
      const bx = cx + s * hr * 0.88;
      back += `<path d="M${cx + s * hr * 0.25} ${cy - hr * 0.86} L${bx + s * hr * 0.18} ${cy - hr * 1.72} L${bx + s * hr * 0.05} ${cy - hr * 0.3} Z" fill="${skin}" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>
               <path d="M${cx + s * hr * 0.5} ${cy - hr * 0.9} L${bx + s * hr * 0.12} ${cy - hr * 1.45} L${bx} ${cy - hr * 0.7} Z" fill="${shade(skin, -0.22)}"/>`;
    }
  } else if (ears === 'bunny') {
    for (const s of [-1, 1]) {
      const ex = cx + s * hr * 0.45;
      const ey = cy - hr * 1.5;
      back += `<ellipse cx="${ex}" cy="${ey}" rx="${hr * 0.27}" ry="${hr * 0.78}" fill="${skin}" stroke="${INK}" stroke-width="2.6" transform="rotate(${s * 14} ${ex} ${ey})"/>
               <ellipse cx="${ex}" cy="${ey + 2}" rx="${hr * 0.12}" ry="${hr * 0.55}" fill="#ff9fb8" transform="rotate(${s * 14} ${ex} ${ey})"/>`;
    }
  } else if (ears === 'horns') {
    for (const s of [-1, 1]) {
      const x0 = cx + s * hr * 0.55;
      const y0 = cy - hr * 0.75;
      back += `<path d="M${x0 - s * 4} ${y0} C${x0 + s * hr * 0.35} ${y0 - hr * 0.6} ${x0 + s * hr * 0.75} ${y0 - hr * 0.55} ${x0 + s * hr * 0.85} ${y0 - hr * 1.05} C${x0 + s * hr * 0.5} ${y0 - hr * 0.95} ${x0 + s * hr * 0.15} ${y0 - hr * 0.55} ${x0 + s * 5} ${y0 + 2} Z" fill="#fff4dc" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`;
    }
  } else if (ears === 'antenna') {
    back += `<path d="M${cx + 2} ${cy - hr * 1.0} L${cx + hr * 0.42} ${cy - hr * 1.78}" stroke="${INK}" stroke-width="2.8" stroke-linecap="round"/>
             <circle cx="${cx + hr * 0.42}" cy="${cy - hr * 1.78}" r="${hr * 0.2}" fill="${accent}" stroke="${INK}" stroke-width="2.4"/>`;
  } else if (ears === 'spikes') {
    const spike = shade(skin, -0.28);
    [[-0.55, 1.28], [0, 1.6], [0.55, 1.28]].forEach(([dx, hgt]) => {
      const x = cx + dx * hr;
      back += `<path d="M${x - hr * 0.26} ${cy - hr * 0.8} L${x} ${cy - hr * hgt} L${x + hr * 0.26} ${cy - hr * 0.8} Z" fill="${spike}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`;
    });
  } else if (ears === 'floppy') {
    for (const s of [-1, 1]) {
      const ex = cx + s * hr * 0.98;
      const ey = cy + hr * 0.05;
      back += `<ellipse cx="${ex}" cy="${ey}" rx="${hr * 0.3}" ry="${hr * 0.58}" fill="${shade(skin, -0.22)}" stroke="${INK}" stroke-width="2.6" transform="rotate(${s * -18} ${ex} ${ey})"/>`;
    }
  } else if (species !== 'penguin' && species !== 'bird') {
    for (const s of [-1, 1]) {
      back += `<circle cx="${cx + s * hr * 0.98}" cy="${cy + hr * 0.12}" r="${hr * 0.22}" fill="${skin}" stroke="${INK}" stroke-width="2.4"/>`;
    }
  }

  // --- helmet ---------------------------------------------------------------
  const hx0 = cx - hr - 2.6;
  const hx1 = cx + hr + 2.6;
  const edgeY = cy + 3.5;
  const helmet = `M${hx0} ${edgeY} A${hr + 2.6} ${hr + 7.4} 0 0 1 ${hx1} ${edgeY} Q${cx} ${cy - hr * 0.62} ${hx0} ${edgeY} Z`;
  let stripes = '';
  if (stripe === 0) {
    stripes = `<rect x="${cx - hr * 0.2}" y="${cy - hr * 1.3}" width="${hr * 0.4}" height="${hr * 1.4}" fill="${accent}"/>`;
  } else if (stripe === 1) {
    stripes = `<rect x="${cx - hr * 0.62}" y="${cy - hr * 1.3}" width="${hr * 0.17}" height="${hr * 1.5}" fill="${accent}" transform="rotate(-8 ${cx} ${cy})"/>
               <rect x="${cx + hr * 0.45}" y="${cy - hr * 1.3}" width="${hr * 0.17}" height="${hr * 1.5}" fill="${accent}" transform="rotate(8 ${cx} ${cy})"/>`;
  } else {
    stripes = `<path d="M${hx0} ${cy - hr * 0.35} L${cx - hr * 0.5} ${cy - hr * 0.62} L${cx} ${cy - hr * 0.38} L${cx + hr * 0.5} ${cy - hr * 0.62} L${hx1} ${cy - hr * 0.35}" fill="none" stroke="${accent}" stroke-width="${hr * 0.2}" stroke-linejoin="round"/>`;
  }

  let eyewearSvg = '';
  if (eyewear === 0) {
    const gy = cy - hr * 0.36;
    eyewearSvg = `<rect x="${hx0 + 1}" y="${gy - hr * 0.1}" width="${hx1 - hx0 - 2}" height="${hr * 0.2}" fill="${INK}"/>
      ${[-1, 1]
        .map(
          (s) => `<circle cx="${cx + s * hr * 0.42}" cy="${gy}" r="${hr * 0.3}" fill="${accent}" stroke="${INK}" stroke-width="2.6"/>
                  <circle cx="${cx + s * hr * 0.42}" cy="${gy}" r="${hr * 0.18}" fill="#bff3ff" stroke="${INK}" stroke-width="1.4"/>
                  <circle cx="${cx + s * hr * 0.42 - hr * 0.07}" cy="${gy - hr * 0.07}" r="${hr * 0.06}" fill="#fff"/>`,
        )
        .join('')}`;
  } else if (eyewear === 1) {
    const vy = cy - hr * 0.42;
    eyewearSvg = `<path d="M${cx - hr * 0.95} ${vy + hr * 0.12} Q${cx} ${vy - hr * 0.22} ${cx + hr * 0.95} ${vy + hr * 0.12} L${cx + hr * 0.9} ${vy + hr * 0.36} Q${cx} ${vy + hr * 0.04} ${cx - hr * 0.9} ${vy + hr * 0.36} Z" fill="${shade(accent, -0.1)}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M${cx - hr * 0.6} ${vy + hr * 0.06} Q${cx - hr * 0.2} ${vy - hr * 0.06} ${cx} ${vy - hr * 0.05}" stroke="#fff" stroke-opacity=".85" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  } else {
    eyewearSvg = `<path d="M${cx - hr * 0.2} ${edgeY - hr * 0.62} Q${cx + hr * 0.9} ${edgeY - hr * 0.75} ${cx + hr * 1.55} ${edgeY - hr * 0.35} Q${cx + hr * 0.9} ${edgeY - hr * 0.22} ${cx - hr * 0.1} ${edgeY - hr * 0.34} Z" fill="${secondary}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>`;
  }

  const emblemY = cy - hr * 0.95;
  const emblemR = hr * 0.3;

  // --- face -----------------------------------------------------------------
  const eyeY = cy + hr * 0.2;
  const ex = hr * 0.36;
  const brows =
    weight === 'heavy'
      ? `<path d="M${cx - ex - hr * 0.18} ${eyeY - hr * 0.34} L${cx - ex + hr * 0.16} ${eyeY - hr * 0.24}" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>
         <path d="M${cx + ex + hr * 0.18} ${eyeY - hr * 0.34} L${cx + ex - hr * 0.16} ${eyeY - hr * 0.24}" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`
      : '';
  const mouth =
    species === 'penguin' || species === 'bird'
      ? `<path d="M${cx - hr * 0.24} ${cy + hr * 0.42} Q${cx} ${cy + hr * 0.3} ${cx + hr * 0.24} ${cy + hr * 0.42} L${cx} ${cy + hr * 0.7} Z" fill="#ffa21f" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`
      : species === 'dino'
        ? `<path d="M${cx - hr * 0.3} ${cy + hr * 0.48} Q${cx} ${cy + hr * 0.78} ${cx + hr * 0.3} ${cy + hr * 0.48} Z" fill="#7a1530" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
           <path d="M${cx - hr * 0.2} ${cy + hr * 0.5} L${cx - hr * 0.12} ${cy + hr * 0.6} L${cx - hr * 0.04} ${cy + hr * 0.52} M${cx + hr * 0.04} ${cy + hr * 0.52} L${cx + hr * 0.12} ${cy + hr * 0.6} L${cx + hr * 0.2} ${cy + hr * 0.5}" fill="#fff" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>`
        : species === 'bulldog'
          ? `<ellipse cx="${cx}" cy="${cy + hr * 0.5}" rx="${hr * 0.42}" ry="${hr * 0.26}" fill="${shade(skin, 0.25)}" stroke="${INK}" stroke-width="2.2"/>
             <ellipse cx="${cx}" cy="${cy + hr * 0.4}" rx="${hr * 0.13}" ry="${hr * 0.09}" fill="${INK}"/>
             <path d="M${cx - hr * 0.2} ${cy + hr * 0.6} Q${cx} ${cy + hr * 0.7} ${cx + hr * 0.2} ${cy + hr * 0.6}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`
          : species === 'fox' || species === 'cat'
            ? `<ellipse cx="${cx}" cy="${cy + hr * 0.42}" rx="${hr * 0.1}" ry="${hr * 0.07}" fill="${INK}"/>
               <path d="M${cx - hr * 0.22} ${cy + hr * 0.55} Q${cx - hr * 0.11} ${cy + hr * 0.68} ${cx} ${cy + hr * 0.5} Q${cx + hr * 0.11} ${cy + hr * 0.68} ${cx + hr * 0.22} ${cy + hr * 0.55}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`
            : weight === 'light'
      ? `<path d="M${cx - hr * 0.2} ${cy + hr * 0.5} Q${cx} ${cy + hr * 0.8} ${cx + hr * 0.2} ${cy + hr * 0.5} Z" fill="#7a1530" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`
      : `<path d="M${cx - hr * 0.26} ${cy + hr * 0.52} Q${cx} ${cy + hr * 0.74} ${cx + hr * 0.26} ${cy + hr * 0.52}" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round"/>`;

  return `<svg class="tk-portrait ${cls}" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <radialGradient id="${id}bg" cx="50%" cy="38%" r="72%">
      <stop offset="0" stop-color="${shade(primary, 0.32)}"/>
      <stop offset=".6" stop-color="${primary}"/>
      <stop offset="1" stop-color="${shade(primary, -0.5)}"/>
    </radialGradient>
    <linearGradient id="${id}hm" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${shade(primary, 0.25)}"/>
      <stop offset="1" stop-color="${shade(primary, -0.18)}"/>
    </linearGradient>
    <clipPath id="${id}hc"><path d="${helmet}"/></clipPath>
  </defs>
  <rect width="100" height="100" fill="url(#${id}bg)"/>
  <g opacity=".22" stroke="${shade(secondary, 0.1)}" stroke-width="7">
    <path d="M-10 30 L30 -10 M-10 55 L55 -10 M-10 80 L80 -10 M-10 105 L105 -10 M15 110 L110 15 M40 110 L110 40 M65 110 L110 65"/>
  </g>
  <circle cx="${cx}" cy="${cy - 4}" r="${hr * 1.75}" fill="#fff" opacity=".12"/>
  <path d="M${cx - sw} 104 C${cx - sw} ${cy + hr + 9} ${cx - sw * 0.5} ${cy + hr + 3} ${cx} ${cy + hr + 3} C${cx + sw * 0.5} ${cy + hr + 3} ${cx + sw} ${cy + hr + 9} ${cx + sw} 104 Z" fill="${secondary}" stroke="${INK}" stroke-width="2.8"/>
  <path d="M${cx - 9} ${cy + hr + 3.4} L${cx} ${cy + hr + 13} L${cx + 9} ${cy + hr + 3.4}" fill="${accent}" stroke="${INK}" stroke-width="2.4" stroke-linejoin="round"/>
  ${back}
  <circle cx="${cx}" cy="${cy}" r="${hr}" fill="${skin}" stroke="${INK}" stroke-width="2.8"/>
  <circle cx="${cx - hr * 0.62}" cy="${cy + hr * 0.44}" r="${hr * 0.15}" fill="#ff6f8f" opacity=".4"/>
  <circle cx="${cx + hr * 0.62}" cy="${cy + hr * 0.44}" r="${hr * 0.15}" fill="#ff6f8f" opacity=".4"/>
  <ellipse cx="${cx - ex}" cy="${eyeY}" rx="${hr * 0.12}" ry="${hr * 0.2}" fill="${INK}"/>
  <ellipse cx="${cx + ex}" cy="${eyeY}" rx="${hr * 0.12}" ry="${hr * 0.2}" fill="${INK}"/>
  <circle cx="${cx - ex + hr * 0.04}" cy="${eyeY - hr * 0.08}" r="${hr * 0.05}" fill="#fff"/>
  <circle cx="${cx + ex + hr * 0.04}" cy="${eyeY - hr * 0.08}" r="${hr * 0.05}" fill="#fff"/>
  ${brows}
  ${mouth}
  <path d="${helmet}" fill="url(#${id}hm)"/>
  <g clip-path="url(#${id}hc)">${stripes}
    <ellipse cx="${cx - hr * 0.45}" cy="${cy - hr * 0.85}" rx="${hr * 0.38}" ry="${hr * 0.2}" fill="#fff" opacity=".45" transform="rotate(-30 ${cx - hr * 0.45} ${cy - hr * 0.85})"/>
  </g>
  <path d="${helmet}" fill="none" stroke="${INK}" stroke-width="2.8" stroke-linejoin="round"/>
  ${eyewearSvg}
  <circle cx="${cx}" cy="${emblemY}" r="${emblemR}" fill="#fff" stroke="${INK}" stroke-width="2.2"/>
  <text x="${cx}" y="${emblemY + emblemR * 0.52}" text-anchor="middle" font-family="Lilita One, Arial Black, sans-serif" font-size="${emblemR * 1.45}" fill="${emblemText}">${initial}</text>
</svg>`;
}
