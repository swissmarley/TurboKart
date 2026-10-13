/**
 * Small DOM / formatting helpers shared by every UI component.
 */

let uidCounter = 0;
/** Unique id for SVG defs (gradients / clip paths must be unique per document). */
export function uid(prefix = 'tk') {
  uidCounter += 1;
  return `${prefix}${uidCounter}`;
}

/**
 * Hyperscript-style element factory.
 * h('div', { class: 'a b', style: { '--i': 2 }, onclick: fn, html: '<b>x</b>' }, child, 'text')
 */
export function h(tag, attrs = null, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const key in attrs) {
      const value = attrs[key];
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'html') el.innerHTML = value;
      else if (key === 'text') el.textContent = value;
      else if (key === 'style') {
        if (typeof value === 'string') el.style.cssText = value;
        else for (const k in value) el.style.setProperty(k, String(value[k]));
      } else if (key === 'dataset') {
        for (const k in value) el.dataset[k] = value[k];
      } else if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2), value);
      } else if (value === true) el.setAttribute(key, '');
      else el.setAttribute(key, String(value));
    }
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) appendChildren(el, child);
    else if (child instanceof Node) el.appendChild(child);
    else el.appendChild(document.createTextNode(String(child)));
  }
}

/** Parse an HTML/SVG string into a single element. */
export function fromHTML(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;

/** 83.456 -> 1'23"456 (classic kart-racer time format). */
export function formatTime(seconds, { empty = `-'--"---` } = {}) {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return empty;
  const totalMs = Math.round(seconds * 1000);
  const m = Math.floor(totalMs / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;
  return `${m}'${String(s).padStart(2, '0')}"${String(ms).padStart(3, '0')}`;
}

/** Signed delta, e.g. -0.532 -> "-0"532" */
export function formatDelta(seconds) {
  if (!Number.isFinite(seconds)) return '';
  const sign = seconds < 0 ? '−' : '+';
  const abs = Math.abs(seconds);
  const s = Math.floor(abs);
  const ms = Math.round((abs - s) * 1000);
  return `${sign}${s}"${String(ms).padStart(3, '0')}`;
}

export function ordinalSuffix(n) {
  const v = n % 100;
  if (v >= 11 && v <= 13) return 'th';
  switch (n % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

/** Accepts 0xRRGGBB numbers or '#rgb' / '#rrggbb' strings, returns '#rrggbb'. */
export function toCss(color, fallback = '#888888') {
  if (typeof color === 'number' && Number.isFinite(color)) return `#${(color & 0xffffff).toString(16).padStart(6, '0')}`;
  if (typeof color === 'string' && color.length) {
    if (/^#[0-9a-f]{3}$/i.test(color)) return `#${color[1]}${color[1]}${color[2]}${color[2]}${color[3]}${color[3]}`;
    return color;
  }
  return fallback;
}

function parseHex(css) {
  const c = toCss(css).replace('#', '');
  if (c.length !== 6) return [136, 136, 136];
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}

/** Mix a colour towards white (amt > 0) or black (amt < 0). amt in -1..1. */
export function shade(color, amt) {
  const [r, g, b] = parseHex(color);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const mix = (c) => Math.round(c + (t - c) * p);
  return `#${[mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function rgba(color, a) {
  const [r, g, b] = parseHex(color);
  return `rgba(${r},${g},${b},${a})`;
}

/** Relative luminance 0..1 (rough) — used to pick readable text colours. */
export function luminance(color) {
  const [r, g, b] = parseHex(color);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export function hashString(str) {
  let hsh = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    hsh ^= s.charCodeAt(i);
    hsh = Math.imul(hsh, 16777619);
  }
  return hsh >>> 0;
}

export function loadJSON(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function saveJSON(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable (private mode) */
  }
}

/** Restart a CSS animation class on an element. */
export function replayClass(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // force reflow
  el.classList.add(cls);
}

/** Escape text for innerHTML templates. */
export function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/**
 * Normalise a list of {x,z} points into an SVG path string fitted to a box
 * (keeps aspect ratio, centred). Returns { d, points } where points are fitted.
 */
export function fitPath(points, width, height, pad = 6) {
  if (!points || points.length < 2) return { d: '', points: [] };
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const w = Math.max(1e-6, maxX - minX);
  const hgt = Math.max(1e-6, maxZ - minZ);
  const scale = Math.min((width - pad * 2) / w, (height - pad * 2) / hgt);
  const ox = (width - w * scale) / 2;
  const oy = (height - hgt * scale) / 2;
  const fitted = points.map((p) => ({ x: ox + (p.x - minX) * scale, y: oy + (p.z - minZ) * scale }));
  let d = '';
  for (let i = 0; i < fitted.length; i++) d += `${i ? 'L' : 'M'}${fitted[i].x.toFixed(1)} ${fitted[i].y.toFixed(1)}`;
  return { d: `${d}Z`, points: fitted };
}
