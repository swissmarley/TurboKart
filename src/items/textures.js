import * as THREE from 'three';

/**
 * Procedural canvas textures for items. Every texture is created lazily once
 * and cached; `disposeItemTextures()` frees them (called by ItemSystem.dispose).
 */

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function cached(key, make) {
  let t = cache.get(key);
  if (!t) {
    t = make();
    cache.set(key, t);
  }
  return t;
}

export function disposeItemTextures() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}

/**
 * Small equirectangular "photo studio" environment so metal / clear-coat item
 * materials look glossy regardless of the scene's lighting setup.
 */
export function getStudioEnvMap() {
  return cached('env', () => {
    const w = 512;
    const h = 256;
    const c = canvas(w, h);
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#dfeeff');
    grad.addColorStop(0.35, '#9fc2ea');
    grad.addColorStop(0.5, '#fff6e8');
    grad.addColorStop(0.56, '#8a8378');
    grad.addColorStop(1, '#2a2622');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // soft boxes
    const box = (x, y, bw, bh, a) => {
      const rg = g.createRadialGradient(x, y, 0, x, y, Math.max(bw, bh));
      rg.addColorStop(0, `rgba(255,255,255,${a})`);
      rg.addColorStop(0.45, `rgba(255,255,255,${a * 0.7})`);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.save();
      g.translate(x, y);
      g.scale(bw / Math.max(bw, bh), bh / Math.max(bw, bh));
      g.translate(-x, -y);
      g.fillRect(x - Math.max(bw, bh), y - Math.max(bw, bh), Math.max(bw, bh) * 2, Math.max(bw, bh) * 2);
      g.restore();
    };
    box(128, 50, 70, 28, 1);
    box(330, 40, 90, 22, 0.95);
    box(450, 95, 30, 40, 0.8);
    box(30, 100, 26, 36, 0.7);
    box(250, 112, 160, 10, 0.55);
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Radial white glow for additive sprites (star halo, fuse spark core). */
export function getGlowTexture() {
  return cached('glow', () => {
    const s = 128;
    const c = canvas(s, s);
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    rg.addColorStop(0, 'rgba(255,255,255,1)');
    rg.addColorStop(0.18, 'rgba(255,255,255,0.75)');
    rg.addColorStop(0.45, 'rgba(255,255,255,0.22)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.fillRect(0, 0, s, s);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/** Four-point sparkle used for the bomb fuse and star twinkles. */
export function getSparkTexture() {
  return cached('spark', () => {
    const s = 128;
    const c = canvas(s, s);
    const g = c.getContext('2d');
    g.translate(s / 2, s / 2);
    const rg = g.createRadialGradient(0, 0, 0, 0, 0, s / 2);
    rg.addColorStop(0, 'rgba(255,255,240,1)');
    rg.addColorStop(0.25, 'rgba(255,220,120,0.6)');
    rg.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(0, 0, s / 2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,230,0.95)';
    for (let i = 0; i < 4; i++) {
      g.save();
      g.rotate((i * Math.PI) / 2);
      g.beginPath();
      g.moveTo(0, -s * 0.48);
      g.quadraticCurveTo(s * 0.035, -s * 0.06, 0, 0);
      g.quadraticCurveTo(-s * 0.035, -s * 0.06, 0, -s * 0.48);
      g.fill();
      g.restore();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

/**
 * Shell plate pattern in lathe-UV space (u around, v from rim (0) to top (1)).
 * Returned as { map, bump } — map is a soft grey-scale shade multiplied with
 * the material colour, bump carves the grooves between plates.
 */
export function getShellTextures(kind = 'plain') {
  return cached(`shell-${kind}`, () => {
    const w = 1024;
    const h = 512;
    const mapC = canvas(w, h);
    const bumpC = canvas(w, h);
    const m = mapC.getContext('2d');
    const b = bumpC.getContext('2d');
    // v=1 is top -> canvas y = 0 (flipY true maps image top to v=1)
    const yOf = (v) => (1 - v) * h;
    const TOP_V = 0.7;
    const RING_V = 0.34;
    const N = 6;

    m.fillStyle = '#ffffff';
    m.fillRect(0, 0, w, h);
    b.fillStyle = '#ffffff';
    b.fillRect(0, 0, w, h);

    // per-plate soft shading (plates bulge: darker toward the seams)
    const plate = (cx, cy, rx, ry) => {
      const rg = m.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
      rg.addColorStop(0, 'rgba(255,255,255,0)');
      rg.addColorStop(0.55, 'rgba(0,0,0,0.06)');
      rg.addColorStop(1, 'rgba(0,0,0,0.4)');
      m.fillStyle = rg;
      m.save();
      m.translate(cx, cy);
      m.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry));
      m.translate(-cx, -cy);
      m.beginPath();
      m.arc(cx, cy, Math.max(rx, ry), 0, Math.PI * 2);
      m.fill();
      m.restore();
      // bump: plates slightly domed
      const bg = b.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
      bg.addColorStop(0, 'rgba(255,255,255,1)');
      bg.addColorStop(1, 'rgba(200,200,200,1)');
      b.fillStyle = bg;
      b.save();
      b.translate(cx, cy);
      b.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry));
      b.translate(-cx, -cy);
      b.beginPath();
      b.arc(cx, cy, Math.max(rx, ry), 0, Math.PI * 2);
      b.fill();
      b.restore();
    };
    // top cap plate (the region v>TOP_V maps to a disc at the top)
    m.fillStyle = 'rgba(255,255,255,1)';
    for (let i = 0; i <= N; i++) {
      plate(((i + 0.5) / N) * w, yOf(0.5 * (TOP_V + RING_V)), w / N / 2, (TOP_V - RING_V) * h * 0.55);
      plate((i / N) * w, yOf(RING_V * 0.55), w / N / 2, RING_V * h * 0.6);
    }
    {
      const gTop = m.createLinearGradient(0, yOf(1), 0, yOf(TOP_V));
      gTop.addColorStop(0, 'rgba(255,255,255,0)');
      gTop.addColorStop(1, 'rgba(0,0,0,0.16)');
      m.fillStyle = gTop;
      m.fillRect(0, yOf(1), w, (1 - TOP_V) * h);
    }

    const seam = (ctx, color, width) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(0, yOf(TOP_V));
      ctx.lineTo(w, yOf(TOP_V));
      ctx.moveTo(0, yOf(RING_V));
      ctx.lineTo(w, yOf(RING_V));
      for (let i = 0; i <= N; i++) {
        const x = (i / N) * w;
        ctx.moveTo(x, yOf(TOP_V));
        ctx.lineTo(x, yOf(RING_V));
        const x2 = ((i + 0.5) / N) * w;
        ctx.moveTo(x2, yOf(RING_V));
        ctx.lineTo(x2, yOf(0.02));
      }
      ctx.stroke();
    };
    seam(m, 'rgba(0,0,0,0.75)', 11);
    seam(m, 'rgba(255,255,255,0.3)', 3);
    seam(b, 'rgba(0,0,0,1)', 14);
    seam(b, 'rgba(60,60,60,1)', 8);

    // tiny highlight specks on the plates for a toy-plastic look
    if (kind === 'plain') {
      m.fillStyle = 'rgba(255,255,255,0.12)';
      for (let i = 0; i < N; i++) {
        m.beginPath();
        m.ellipse(((i + 0.3) / N) * w, yOf(0.58), 18, 10, 0, 0, Math.PI * 2);
        m.fill();
      }
    }

    const map = new THREE.CanvasTexture(mapC);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    const bump = new THREE.CanvasTexture(bumpC);
    bump.anisotropy = 4;
    return {
      map,
      bump,
      dispose() {
        map.dispose();
        bump.dispose();
      },
    };
  });
}

/** Coin face: embossed star emblem with a ring (bump) + subtle colour shading (map). */
export function getCoinFaceTextures() {
  return cached('coin', () => {
    const s = 256;
    const mapC = canvas(s, s);
    const bumpC = canvas(s, s);
    const m = mapC.getContext('2d');
    const b = bumpC.getContext('2d');
    const cx = s / 2;
    const cy = s / 2;

    // map: soft radial shade + engraved emblem tint
    const rg = m.createRadialGradient(cx * 0.8, cy * 0.75, 0, cx, cy, s * 0.55);
    rg.addColorStop(0, '#ffffff');
    rg.addColorStop(1, '#e8dcc0');
    m.fillStyle = rg;
    m.fillRect(0, 0, s, s);

    b.fillStyle = '#5a5a5a';
    b.fillRect(0, 0, s, s);

    const starPath = (ctx, r1, r2, rot = -Math.PI / 2) => {
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? r1 : r2;
        const a = rot + (i * Math.PI) / 5;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    };
    // inner ring (raised)
    b.strokeStyle = '#d8d8d8';
    b.lineWidth = 10;
    b.beginPath();
    b.arc(cx, cy, s * 0.4, 0, Math.PI * 2);
    b.stroke();
    // star (raised, with soft edges for a rounded emboss)
    b.filter = 'blur(3px)';
    b.fillStyle = '#ffffff';
    starPath(b, s * 0.3, s * 0.13);
    b.fill();
    b.filter = 'none';
    // star eyes engraved
    b.fillStyle = '#9a9a9a';
    b.beginPath();
    b.ellipse(cx - 11, cy + 2, 4.5, 11, 0, 0, Math.PI * 2);
    b.ellipse(cx + 11, cy + 2, 4.5, 11, 0, 0, Math.PI * 2);
    b.fill();

    m.fillStyle = 'rgba(255,250,220,0.55)';
    starPath(m, s * 0.3, s * 0.13);
    m.fill();
    m.strokeStyle = 'rgba(150,100,10,0.35)';
    m.lineWidth = 3;
    m.beginPath();
    m.arc(cx, cy, s * 0.4 + 6, 0, Math.PI * 2);
    m.stroke();
    m.fillStyle = 'rgba(120,80,10,0.5)';
    m.beginPath();
    m.ellipse(cx - 11, cy + 2, 4, 10, 0, 0, Math.PI * 2);
    m.ellipse(cx + 11, cy + 2, 4, 10, 0, 0, Math.PI * 2);
    m.fill();

    const map = new THREE.CanvasTexture(mapC);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    const bump = new THREE.CanvasTexture(bumpC);
    bump.anisotropy = 4;
    return {
      map,
      bump,
      dispose() {
        map.dispose();
        bump.dispose();
      },
    };
  });
}
