/**
 * Procedural canvas textures (asphalt, grass, sand, snow, rock, banners, crowd...).
 * Everything is drawn at runtime — no external assets.
 */
import * as THREE from 'three';
import { createRng } from '../util.js';

export function createCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Tileable fractal value noise in [0,1]. */
export function tileNoise(size, period = 4, octaves = 4, seed = 1, gain = 0.5) {
  const out = new Float32Array(size * size);
  const rng = createRng(seed);
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = period << o;
    const lat = new Float32Array(cells * cells);
    for (let i = 0; i < lat.length; i++) lat[i] = rng();
    const scale = cells / size;
    for (let y = 0; y < size; y++) {
      const fy = y * scale;
      const y0 = Math.floor(fy);
      let ty = fy - y0;
      ty = ty * ty * ty * (ty * (ty * 6 - 15) + 10);
      const r0 = (y0 % cells) * cells;
      const r1 = ((y0 + 1) % cells) * cells;
      for (let x = 0; x < size; x++) {
        const fx = x * scale;
        const x0 = Math.floor(fx);
        let tx = fx - x0;
        tx = tx * tx * tx * (tx * (tx * 6 - 15) + 10);
        const c0 = x0 % cells;
        const c1 = (x0 + 1) % cells;
        const a = lat[r0 + c0] + (lat[r0 + c1] - lat[r0 + c0]) * tx;
        const b = lat[r1 + c0] + (lat[r1 + c1] - lat[r1 + c0]) * tx;
        out[y * size + x] += (a + (b - a) * ty) * amp;
      }
    }
    norm += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

/** Height array (size x size, tileable) -> normal map canvas. */
export function heightToNormalCanvas(h, size, strength = 2) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    const ym = ((y - 1 + size) % size) * size;
    const yp = ((y + 1) % size) * size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size;
      const xp = (x + 1) % size;
      const dx = (h[y * size + xp] - h[y * size + xm]) * strength;
      const dy = (h[yp + x] - h[ym + x]) * strength;
      let nx = -dx;
      let ny = dy;
      let nz = 1;
      const l = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      d[i] = ((nx / l) * 0.5 + 0.5) * 255;
      d[i + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      d[i + 2] = ((nz / l) * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function canvasTexture(canvas, { srgb = true, repeat = true, anisotropy = 8, mipmaps = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = anisotropy;
  t.generateMipmaps = mipmaps;
  t.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

const hexToRgb = (hex) => {
  const c = new THREE.Color(hex);
  return [c.r * 255, c.g * 255, c.b * 255];
};
// note: THREE.Color(hex) converts sRGB->linear; use raw parsing for canvas work
const parseCss = (css) => {
  const s = css.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
};
void hexToRgb;

// ---------------------------------------------------------------------------
// Asphalt road: u across the road (0..1 = -hw..+hw), v along (1 repeat = texLen)
// ---------------------------------------------------------------------------
export function makeAsphalt(style, { size = 1024, seed = 7, anisotropy = 8 } = {}) {
  const W = size;
  const H = size;
  const rng = createRng(seed);
  const low = tileNoise(W, 3, 4, seed + 1);
  const mid = tileNoise(W, 24, 3, seed + 2);
  const hi = tileNoise(W, 160, 2, seed + 3);
  const base = parseCss(style.base);
  const light = parseCss(style.light);
  const line = parseCss(style.lines);
  const edgeTint = style.edgeTint ? parseCss(style.edgeTint) : null;
  const c = createCanvas(W, H);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(W, H);
  const d = img.data;
  const height = new Float32Array(W * H);
  const wear = style.wear ?? 0.15;
  const lineW = 0.016;
  const edgeA = 0.058;
  for (let y = 0; y < H; y++) {
    const v = y / H;
    for (let x = 0; x < W; x++) {
      const u = x / W;
      const i = y * W + x;
      const n1 = low[i];
      const n2 = mid[i];
      const n3 = hi[i];
      const sp = rng();
      let t = 0.5 + (n1 - 0.5) * 0.55 + (n2 - 0.5) * 0.45;
      let r = base[0] + (light[0] - base[0]) * t;
      let g = base[1] + (light[1] - base[1]) * t;
      let b = base[2] + (light[2] - base[2]) * t;
      let k = 0.86 + n3 * 0.28;
      let hgt = n3 * 0.6 + n2 * 0.4;
      if (sp > 0.991) {
        k *= 1.13;
        hgt += 0.6;
      } else if (sp < 0.01) {
        k *= 0.78;
        hgt -= 0.4;
      }
      // tyre wear on the two racing lines (slightly darker, smoother)
      const wu = Math.min(Math.abs(u - 0.32), Math.abs(u - 0.68));
      const wf = Math.exp(-(wu * wu) / 0.004) * wear * (0.6 + 0.8 * n2);
      k *= 1 - wf;
      // subtle patch repairs
      if (n1 > 0.76) k *= 0.94;
      r *= k;
      g *= k;
      b *= k;
      // edge tint (sand / snow blown onto the edges)
      if (edgeTint) {
        const e = Math.max(0, 1 - Math.min(u, 1 - u) / 0.07);
        const m = Math.min(1, e * e * (0.5 + n2 * 1.2) * (0.6 + n1));
        r += (edgeTint[0] - r) * m;
        g += (edgeTint[1] - g) * m;
        b += (edgeTint[2] - b) * m;
      }
      // painted lines
      let paint = 0;
      if ((u > edgeA && u < edgeA + lineW) || (u > 1 - edgeA - lineW && u < 1 - edgeA)) paint = 1;
      if (style.centerLine && Math.abs(u - 0.5) < 0.006 && (v * 4) % 1 < 0.5) paint = 1;
      if (paint) {
        const worn = 0.82 + n3 * 0.18 - (sp < 0.04 ? 0.35 : 0);
        r += (line[0] - r) * worn;
        g += (line[1] - g) * worn;
        b += (line[2] - b) * worn;
        hgt += 0.3;
      }
      const o = i * 4;
      d[o] = r;
      d[o + 1] = g;
      d[o + 2] = b;
      d[o + 3] = 255;
      height[i] = hgt;
    }
  }
  ctx.putImageData(img, 0, 0);
  const map = canvasTexture(c, { anisotropy });
  const normalMap = canvasTexture(heightToNormalCanvas(height, W, 1.6), { srgb: false, anisotropy });
  return { map, normalMap };
}

// ---------------------------------------------------------------------------
// Ground textures (tileable, world-space UVs)
// ---------------------------------------------------------------------------
export function makeGround(kind, { size = 512, seed = 11, anisotropy = 8 } = {}) {
  const S = size;
  const rng = createRng(seed);
  const c = createCanvas(S, S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const n1 = tileNoise(S, 4, 4, seed + 1);
  const n2 = tileNoise(S, 32, 3, seed + 2);
  const n3 = tileNoise(S, 128, 2, seed + 3);
  const height = new Float32Array(S * S);
  let pal;
  if (kind === 'grass') pal = [[62, 132, 40], [104, 172, 58], [140, 186, 70]];
  else if (kind === 'sand') pal = [[214, 170, 112], [234, 196, 138], [246, 214, 160]];
  else pal = [[214, 226, 246], [236, 243, 255], [250, 252, 255]];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      let t = n1[i] * 0.55 + n2[i] * 0.45;
      if (kind === 'sand') {
        // tileable wind ripples (integer wave vector) warped by noise
        const rip = Math.sin(((x * 5 + y * 11) / S) * Math.PI * 2 + n1[i] * 9 + n2[i] * 2.5);
        t += rip * 0.09;
        height[i] = rip * 0.5 + n3[i] * 0.4;
      } else if (kind === 'snow') {
        const rip = Math.sin(((x * 3 + y * 7) / S) * Math.PI * 2 + n1[i] * 7);
        t += rip * 0.04;
        height[i] = n2[i] * 0.6 + rip * 0.25 + n3[i] * 0.3;
      } else {
        height[i] = n3[i] * 0.7 + n2[i] * 0.3;
      }
      t = Math.max(0, Math.min(1, t));
      const a = t < 0.5 ? pal[0] : pal[1];
      const b = t < 0.5 ? pal[1] : pal[2];
      const f = t < 0.5 ? t * 2 : (t - 0.5) * 2;
      const k = 0.9 + n3[i] * 0.2;
      const o = i * 4;
      d[o] = (a[0] + (b[0] - a[0]) * f) * k;
      d[o + 1] = (a[1] + (b[1] - a[1]) * f) * k;
      d[o + 2] = (a[2] + (b[2] - a[2]) * f) * k;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // detail strokes, drawn wrapped so the tile stays seamless
  const wrapped = (fn) => {
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) fn(ox, oy);
  };
  if (kind === 'grass') {
    ctx.lineCap = 'round';
    for (let k = 0; k < 9000; k++) {
      const x = rng() * S;
      const y = rng() * S;
      const len = 3 + rng() * 7;
      const ang = -Math.PI / 2 + (rng() - 0.5) * 1.1;
      const shade = rng();
      const col =
        shade < 0.45
          ? `rgba(${40 + rng() * 30},${95 + rng() * 40},${25 + rng() * 20},0.55)`
          : shade < 0.9
            ? `rgba(${120 + rng() * 50},${180 + rng() * 40},${60 + rng() * 30},0.5)`
            : `rgba(${190 + rng() * 40},${205 + rng() * 30},${90 + rng() * 40},0.55)`;
      ctx.strokeStyle = col;
      ctx.lineWidth = 0.8 + rng() * 1.2;
      wrapped((ox, oy) => {
        if (x + ox < -12 || x + ox > S + 12 || y + oy < -12 || y + oy > S + 12) return;
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.lineTo(x + ox + Math.cos(ang) * len, y + oy + Math.sin(ang) * len);
        ctx.stroke();
      });
    }
    // tiny clover / daisies
    for (let k = 0; k < 160; k++) {
      const x = rng() * S;
      const y = rng() * S;
      ctx.fillStyle = rng() < 0.6 ? 'rgba(255,255,245,0.9)' : 'rgba(255,224,90,0.9)';
      wrapped((ox, oy) => {
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, 1.1 + rng() * 0.8, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  } else if (kind === 'sand') {
    for (let k = 0; k < 7000; k++) {
      const x = rng() * S;
      const y = rng() * S;
      const v = rng();
      ctx.fillStyle = v < 0.5 ? `rgba(160,110,60,${0.25 + rng() * 0.3})` : `rgba(255,240,210,${0.3 + rng() * 0.4})`;
      ctx.fillRect(x, y, 1 + rng(), 1 + rng());
    }
  } else {
    for (let k = 0; k < 2500; k++) {
      const x = rng() * S;
      const y = rng() * S;
      ctx.fillStyle = rng() < 0.7 ? 'rgba(255,255,255,0.95)' : 'rgba(170,190,230,0.5)';
      ctx.fillRect(x, y, 1, 1);
    }
  }
  const map = canvasTexture(c, { anisotropy });
  const normalMap = canvasTexture(heightToNormalCanvas(height, S, kind === 'sand' ? 3 : 2), { srgb: false, anisotropy });
  return { map, normalMap };
}

/** Grey-ish tileable rock (for triplanar cliff shading). */
export function makeRock({ size = 512, seed = 21, anisotropy = 8, tint = [128, 124, 118] } = {}) {
  const S = size;
  const c = createCanvas(S, S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const n1 = tileNoise(S, 4, 5, seed + 1);
  const n2 = tileNoise(S, 16, 3, seed + 2);
  const n3 = tileNoise(S, 64, 2, seed + 3);
  const height = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    // ridged cracks
    const cr = 1 - Math.abs(n2[i] * 2 - 1);
    const crack = Math.pow(cr, 12);
    const v = 0.55 + (n1[i] - 0.5) * 0.7 + (n3[i] - 0.5) * 0.35 - crack * 0.45;
    const o = i * 4;
    d[o] = tint[0] * v * 1.7;
    d[o + 1] = tint[1] * v * 1.7;
    d[o + 2] = tint[2] * v * 1.7;
    d[o + 3] = 255;
    height[i] = n1[i] * 0.6 + n3[i] * 0.3 - crack * 0.6;
  }
  ctx.putImageData(img, 0, 0);
  return {
    map: canvasTexture(c, { anisotropy }),
    normalMap: canvasTexture(heightToNormalCanvas(height, S, 4), { srgb: false, anisotropy }),
  };
}

/** Horizontal sediment bands (1 x 256), sampled by world height. */
export function makeStrata(colors, seed = 5) {
  const H = 256;
  const c = createCanvas(4, H);
  const ctx = c.getContext('2d');
  const rng = createRng(seed);
  let y = 0;
  while (y < H) {
    const h = 3 + Math.floor(rng() * 14);
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    ctx.fillRect(0, y, 4, h);
    // thin dark seam
    if (rng() < 0.5) {
      ctx.fillStyle = 'rgba(60,30,20,0.25)';
      ctx.fillRect(0, y, 4, 1);
    }
    y += h;
  }
  const t = canvasTexture(c, { anisotropy: 1 });
  t.wrapS = THREE.ClampToEdgeWrapping;
  return t;
}

export function makeChecker({ cols = 16, rows = 2, size = 64, colors = ['#111', '#f5f5f5'] } = {}) {
  const c = createCanvas(cols * size, rows * size);
  const ctx = c.getContext('2d');
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      ctx.fillStyle = colors[(x + y) % 2];
      ctx.fillRect(x * size, y * size, size, size);
    }
  }
  return canvasTexture(c, { repeat: false, anisotropy: 8 });
}

/** Big event banner with outlined lettering. */
export function makeBanner(text, { w = 1024, h = 192, bg = '#d81e2b', bg2 = '#a3121d', fg = '#ffffff', stroke = '#1a1a2a', checker = true, font = 'Lilita One, Impact, Arial Black, sans-serif', italic = true } = {}) {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, bg);
  g.addColorStop(1, bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (checker) {
    const s = h / 8;
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < w / s; x++) {
        ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff';
        ctx.fillRect(x * s, y * s, s, s);
        ctx.fillRect(x * s, h - (2 - y) * s, s, s);
      }
    }
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fs = Math.floor(h * (checker ? 0.5 : 0.66));
  ctx.font = `${italic ? 'italic ' : ''}900 ${fs}px ${font}`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = fs * 0.16;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, w / 2, h / 2 + fs * 0.04);
  ctx.fillStyle = fg;
  ctx.fillText(text, w / 2, h / 2 + fs * 0.04);
  return canvasTexture(c, { repeat: false, anisotropy: 8 });
}

/** Atlas of sponsor-style (fictional) trackside boards: returns texture + uv rects. */
export function makeBoardAtlas(entries, { w = 1024, rowH = 128 } = {}) {
  const h = rowH * entries.length;
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  entries.forEach((e, i) => {
    const y = i * rowH;
    const g = ctx.createLinearGradient(0, y, 0, y + rowH);
    g.addColorStop(0, e.bg);
    g.addColorStop(1, e.bg2 || e.bg);
    ctx.fillStyle = g;
    ctx.fillRect(0, y, w, rowH);
    ctx.fillStyle = e.stripe || 'rgba(255,255,255,0.18)';
    ctx.fillRect(0, y + rowH * 0.08, w, rowH * 0.06);
    ctx.fillRect(0, y + rowH * 0.86, w, rowH * 0.06);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = rowH * 0.56;
    ctx.font = `italic 900 ${fs}px Lilita One, Impact, Arial Black, sans-serif`;
    ctx.lineWidth = fs * 0.14;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = e.stroke || '#14141f';
    ctx.strokeText(e.text, w / 2, y + rowH / 2 + 3);
    ctx.fillStyle = e.fg || '#fff';
    ctx.fillText(e.text, w / 2, y + rowH / 2 + 3);
  });
  const tex = canvasTexture(c, { repeat: false, anisotropy: 8 });
  return { texture: tex, rows: entries.length };
}

/** Grandstand crowd: rows of colourful little spectators. */
export function makeCrowd({ w = 1024, h = 512, seed = 3 } = {}) {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  const rng = createRng(seed);
  ctx.fillStyle = '#3b3f4f';
  ctx.fillRect(0, 0, w, h);
  const rows = 7;
  const rh = h / rows;
  const shirts = ['#ff4d4d', '#ffd23f', '#3fa7ff', '#5be37d', '#ff8c2e', '#c76bff', '#ffffff', '#ff6fb5', '#1fd1c1'];
  const skins = ['#f5d0a9', '#e0ac7e', '#c58c5c', '#8d5a3b', '#ffe0c2'];
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    ctx.fillStyle = r % 2 ? '#4a5064' : '#41475a';
    ctx.fillRect(0, y + rh * 0.72, w, rh * 0.28);
    for (let x = 2; x < w; x += 17 + rng() * 8) {
      if (rng() < 0.08) continue;
      const bw = 13 + rng() * 5;
      ctx.fillStyle = shirts[Math.floor(rng() * shirts.length)];
      ctx.fillRect(x, y + rh * 0.38, bw, rh * 0.42);
      ctx.fillStyle = skins[Math.floor(rng() * skins.length)];
      ctx.beginPath();
      ctx.arc(x + bw / 2, y + rh * 0.28, bw * 0.38, 0, Math.PI * 2);
      ctx.fill();
      if (rng() < 0.25) {
        // raised arms / flag
        ctx.fillStyle = shirts[Math.floor(rng() * shirts.length)];
        ctx.fillRect(x + bw * 0.8, y + rh * 0.02, 2, rh * 0.36);
      }
    }
  }
  return canvasTexture(c, { repeat: true, anisotropy: 8 });
}

/** Corner chevron sign (arrow pointing right; mirror via UV for left). */
export function makeChevronSign({ w = 256, h = 128, bg = '#ffcc1a', fg = '#141414' } = {}) {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  for (let i = 0; i < 3; i++) {
    const x0 = 30 + i * 70;
    ctx.beginPath();
    ctx.moveTo(x0, 14);
    ctx.lineTo(x0 + 34, 14);
    ctx.lineTo(x0 + 64, h / 2);
    ctx.lineTo(x0 + 34, h - 14);
    ctx.lineTo(x0, h - 14);
    ctx.lineTo(x0 + 30, h / 2);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = fg;
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, w - 8, h - 8);
  return canvasTexture(c, { repeat: false, anisotropy: 8 });
}

/** Ramp top: hazard chevrons pointing forward (+v). */
export function makeRampTexture({ a = '#ffd21f', b = '#1b1b1b', glow = false } = {}) {
  const w = 256;
  const h = 256;
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = b;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = a;
  for (let i = -1; i < 3; i++) {
    const y0 = i * 96 + 40;
    ctx.beginPath();
    ctx.moveTo(0, y0 + 60);
    ctx.lineTo(w / 2, y0);
    ctx.lineTo(w, y0 + 60);
    ctx.lineTo(w, y0 + 100);
    ctx.lineTo(w / 2, y0 + 40);
    ctx.lineTo(0, y0 + 100);
    ctx.closePath();
    ctx.fill();
  }
  if (glow) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, 0, w, h);
  }
  return canvasTexture(c, { anisotropy: 8 });
}

/** Wooden planks (bridges, docks, cabins). */
export function makeWood({ size = 256, seed = 9, base = [150, 98, 58] } = {}) {
  const S = size;
  const c = createCanvas(S, S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  const n = tileNoise(S, 2, 4, seed);
  const rng = createRng(seed);
  const plank = S / 8;
  const shades = Array.from({ length: 8 }, () => 0.8 + rng() * 0.35);
  for (let y = 0; y < S; y++) {
    const p = Math.floor(y / plank);
    const edge = y % plank < 2 ? 0.55 : 1;
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const grain = 0.85 + 0.15 * Math.sin((x / S) * Math.PI * 2 * 3 + n[i] * 14);
      const k = shades[p] * grain * edge;
      const o = i * 4;
      d[o] = base[0] * k;
      d[o + 1] = base[1] * k;
      d[o + 2] = base[2] * k;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvasTexture(c, { anisotropy: 8 });
}

/** Window lights for buildings (night or cabins). */
export function makeWindows({ w = 256, h = 512, seed = 4, lit = 0.6, colors = ['#ffd68a', '#9fe8ff', '#ff9ff3'] } = {}) {
  const c = createCanvas(w, h);
  const ctx = c.getContext('2d');
  const rng = createRng(seed);
  ctx.fillStyle = '#0b0b18';
  ctx.fillRect(0, 0, w, h);
  const cw = w / 8;
  const ch = h / 24;
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 8; x++) {
      if (rng() > lit) continue;
      ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
      ctx.globalAlpha = 0.5 + rng() * 0.5;
      ctx.fillRect(x * cw + cw * 0.18, y * ch + ch * 0.2, cw * 0.64, ch * 0.55);
    }
  }
  ctx.globalAlpha = 1;
  return canvasTexture(c, { anisotropy: 4 });
}

/** Soft round sprite (snowflakes, sparkles, glows). */
export function makeSoftDot({ size = 64, inner = 0.0, color = '255,255,255' } = {}) {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, size * inner * 0.5, size / 2, size / 2, size / 2);
  g.addColorStop(0, `rgba(${color},1)`);
  g.addColorStop(0.35, `rgba(${color},0.75)`);
  g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return canvasTexture(c, { repeat: false, anisotropy: 1 });
}

/** Neon road emissive map: grid + bright edges + centre dashes (black = no glow). */
export function makeNeonGrid({ size = 1024, cells = 8, edge = 0.035 } = {}) {
  const c = createCanvas(size, size);
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, size, size);
  const step = size / cells;
  // soft glow lines (draw wide dim + thin bright)
  const line = (x0, y0, x1, y1, w, a) => {
    g.strokeStyle = `rgba(255,255,255,${a})`;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  };
  for (let i = 0; i <= cells; i++) {
    const p = i * step;
    line(p, 0, p, size, 10, 0.06);
    line(p, 0, p, size, 3, 0.35);
    line(0, p, size, p, 10, 0.06);
    line(0, p, size, p, 3, 0.35);
  }
  // edges
  for (const u of [edge, 1 - edge]) {
    line(u * size, 0, u * size, size, 26, 0.25);
    line(u * size, 0, u * size, size, 9, 1);
  }
  // centre dashes
  for (let y = 0; y < size; y += size / 4) {
    line(size / 2, y + size * 0.03, size / 2, y + size / 8, 14, 0.25);
    line(size / 2, y + size * 0.03, size / 2, y + size / 8, 5, 0.95);
  }
  return canvasTexture(c, { srgb: true, anisotropy: 8 });
}

/** Gas giant / rocky planet surface (equirectangular). */
export function makePlanetTexture({ w = 512, h = 256, seed = 1, colors = ['#ff9a5a', '#ffd38a', '#c8643a', '#7a3a5a'], bands = true } = {}) {
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  const n = tileNoise(w, 4, 5, seed);
  const img = g.createImageData(w, h);
  const d = img.data;
  const cols = colors.map((s) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nv = n[(y % w) * w + x];
      let t = bands ? (y / h) * 5 + nv * 1.6 : nv * 2.2;
      t = ((t % 1) + 1) % 1;
      const f = t * (cols.length - 1);
      const i0 = Math.floor(f);
      const fr = f - i0;
      const a = cols[i0];
      const b = cols[Math.min(cols.length - 1, i0 + 1)];
      const o = (y * w + x) * 4;
      d[o] = a[0] + (b[0] - a[0]) * fr;
      d[o + 1] = a[1] + (b[1] - a[1]) * fr;
      d[o + 2] = a[2] + (b[2] - a[2]) * fr;
      d[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return canvasTexture(c, { anisotropy: 4 });
}
