import * as THREE from 'three';

/**
 * Procedural particle sprite atlas: a 4x4 grid of 128 px cells drawn to a
 * canvas. Every sprite is white (RGB carries only shading) so particles can be
 * tinted freely; the alpha channel holds the shape.
 */
export const SPRITE = {
  GLOW: 0,
  DOT: 1,
  STAR: 2,
  SPARK: 3, // vertical streak, head at the top (v = 1)
  SMOKE: 4,
  RING: 5,
  SHARD: 6,
  SQUARE: 7,
  FLAME: 8,
  SPARKLE: 9,
  FLAKE: 10,
  CHUNK: 11,
  BLADE: 12,
  SOFTRING: 13,
  SMOKE2: 14,
  COIN: 15,
};

export const ATLAS_GRID = 4;
const CELL = 128;

// Local deterministic noise so the atlas is identical every run.
let seedState = 1337;
function rnd() {
  seedState = (seedState * 16807) % 2147483647;
  return (seedState - 1) / 2147483646;
}

function cellOrigin(index) {
  return [(index % ATLAS_GRID) * CELL, Math.floor(index / ATLAS_GRID) * CELL];
}

function radial(ctx, cx, cy, r, stops) {
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  for (const [o, c] of stops) g.addColorStop(o, c);
  return g;
}

function drawGlow(ctx, x, y) {
  const c = CELL / 2;
  ctx.fillStyle = radial(ctx, x + c, y + c, c, [
    [0, 'rgba(255,255,255,1)'],
    [0.12, 'rgba(255,255,255,0.85)'],
    [0.35, 'rgba(255,255,255,0.35)'],
    [0.65, 'rgba(255,255,255,0.08)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  ctx.fillRect(x, y, CELL, CELL);
}

function drawDot(ctx, x, y) {
  const c = CELL / 2;
  ctx.fillStyle = radial(ctx, x + c, y + c, c * 0.92, [
    [0, 'rgba(255,255,255,1)'],
    [0.55, 'rgba(255,255,255,0.9)'],
    [0.8, 'rgba(255,255,255,0.45)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  ctx.fillRect(x, y, CELL, CELL);
}

function starPath(ctx, cx, cy, points, outer, inner, rot = -Math.PI / 2) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = rot + (i * Math.PI) / points;
    const px = cx + Math.cos(a) * r;
    const py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawStar(ctx, x, y) {
  const c = CELL / 2;
  // soft halo
  ctx.fillStyle = radial(ctx, x + c, y + c, c, [
    [0, 'rgba(255,255,255,0.55)'],
    [0.5, 'rgba(255,255,255,0.12)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  ctx.fillRect(x, y, CELL, CELL);
  ctx.save();
  ctx.shadowColor = 'rgba(255,255,255,0.9)';
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#ffffff';
  starPath(ctx, x + c, y + c + 3, 5, c * 0.78, c * 0.34);
  ctx.fill();
  ctx.restore();
}

function drawSpark(ctx, x, y) {
  // Narrow streak, bright head at the top, tapering tail.
  const w = CELL;
  const h = CELL;
  const img = ctx.createImageData(w, h);
  for (let j = 0; j < h; j++) {
    const v = 1 - j / (h - 1); // 1 at top row
    const along = Math.pow(v, 1.6) * Math.min(1, (1 - v) * 14 + 0.15);
    for (let i = 0; i < w; i++) {
      const u = (i / (w - 1)) * 2 - 1;
      const width = 0.12 + 0.2 * v;
      const across = Math.exp(-(u * u) / (2 * width * width * 0.25));
      const core = Math.exp(-(u * u) / (2 * 0.04 * 0.04));
      const a = Math.min(1, along * (across * 0.75 + core * 0.6));
      const k = (j * w + i) * 4;
      img.data[k] = 255;
      img.data[k + 1] = 255;
      img.data[k + 2] = 255;
      img.data[k + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, x, y);
}

function drawSmoke(ctx, x, y, variant) {
  const c = CELL / 2;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, CELL, CELL);
  ctx.clip();
  const blobs = variant ? 9 : 12;
  for (let i = 0; i < blobs; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * c * 0.38;
    const bx = x + c + Math.cos(a) * d;
    const by = y + c + Math.sin(a) * d;
    const br = c * (0.32 + rnd() * 0.3);
    const shade = 200 + Math.round(55 * (1 - (by - y) / CELL)); // lighter on top
    ctx.fillStyle = radial(ctx, bx, by, br, [
      [0, `rgba(${shade},${shade},${shade},0.55)`],
      [0.6, `rgba(${shade},${shade},${shade},0.25)`],
      [1, `rgba(${shade},${shade},${shade},0)`],
    ]);
    ctx.fillRect(x, y, CELL, CELL);
  }
  ctx.restore();
  // Fade the outer rim so the puff never shows a square edge.
  const img = ctx.getImageData(x, y, CELL, CELL);
  for (let j = 0; j < CELL; j++) {
    for (let i = 0; i < CELL; i++) {
      const dx = (i - c) / c;
      const dy = (j - c) / c;
      const r = Math.sqrt(dx * dx + dy * dy);
      const f = Math.max(0, Math.min(1, (1 - r) * 3));
      const k = (j * CELL + i) * 4 + 3;
      img.data[k] = Math.round(img.data[k] * f);
    }
  }
  ctx.putImageData(img, x, y);
}

function drawRing(ctx, x, y, soft) {
  const c = CELL / 2;
  const img = ctx.createImageData(CELL, CELL);
  for (let j = 0; j < CELL; j++) {
    for (let i = 0; i < CELL; i++) {
      const dx = (i + 0.5 - c) / c;
      const dy = (j + 0.5 - c) / c;
      const r = Math.sqrt(dx * dx + dy * dy);
      let a;
      if (soft) {
        // thick soft donut, brighter on the outside edge
        a = Math.exp(-Math.pow((r - 0.72) / 0.2, 2)) * Math.min(1, (1 - r) * 8);
      } else {
        a = Math.exp(-Math.pow((r - 0.86) / 0.06, 2)) + 0.25 * Math.exp(-Math.pow((r - 0.8) / 0.16, 2));
        a *= Math.max(0, Math.min(1, (1 - r) * 12));
      }
      const k = (j * CELL + i) * 4;
      img.data[k] = 255;
      img.data[k + 1] = 255;
      img.data[k + 2] = 255;
      img.data[k + 3] = Math.round(Math.max(0, Math.min(1, a)) * 255);
    }
  }
  ctx.putImageData(img, x, y);
}

function drawShard(ctx, x, y) {
  const c = CELL / 2;
  ctx.save();
  ctx.translate(x + c, y + c);
  ctx.beginPath();
  ctx.moveTo(-c * 0.15, -c * 0.85);
  ctx.lineTo(c * 0.7, c * 0.55);
  ctx.lineTo(-c * 0.6, c * 0.75);
  ctx.closePath();
  const g = ctx.createLinearGradient(-c, -c, c, c);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.5, 'rgba(210,210,210,0.7)');
  g.addColorStop(1, 'rgba(255,255,255,0.9)');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.stroke();
  ctx.restore();
}

function drawSquare(ctx, x, y) {
  const m = 30;
  const g = ctx.createLinearGradient(x, y, x + CELL, y + CELL);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#cfcfcf');
  ctx.fillStyle = g;
  ctx.fillRect(x + m * 0.6, y + m, CELL - m * 1.2, CELL - m * 2);
}

function drawFlame(ctx, x, y) {
  // Teardrop: round hot core near the bottom, flicker tail to the top (head of streak = top).
  const img = ctx.createImageData(CELL, CELL);
  for (let j = 0; j < CELL; j++) {
    for (let i = 0; i < CELL; i++) {
      const u = ((i + 0.5) / CELL) * 2 - 1;
      const v = 1 - (j + 0.5) / CELL; // 0 bottom .. 1 top
      // width profile: wide at v~0.35, narrow towards the top
      const prof = Math.max(0.0001, Math.sin(Math.PI * Math.min(1, v * 1.05)) * (1.05 - v * 0.55));
      const d = Math.abs(u) / (prof * 0.9);
      let a = Math.max(0, 1 - d * d) * Math.min(1, v * 6);
      const core = Math.exp(-((u * u) / 0.05 + Math.pow((v - 0.35) / 0.25, 2)));
      a = Math.min(1, a * 0.8 + core * 0.6);
      const shade = Math.round(200 + 55 * core);
      const k = (j * CELL + i) * 4;
      img.data[k] = 255;
      img.data[k + 1] = shade;
      img.data[k + 2] = shade;
      img.data[k + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, x, y);
}

function drawSparkle(ctx, x, y) {
  const c = CELL / 2;
  const img = ctx.createImageData(CELL, CELL);
  for (let j = 0; j < CELL; j++) {
    for (let i = 0; i < CELL; i++) {
      const dx = (i + 0.5 - c) / c;
      const dy = (j + 0.5 - c) / c;
      const r = Math.sqrt(dx * dx + dy * dy);
      const cross = Math.exp(-Math.abs(dx) * 22) * Math.max(0, 1 - Math.abs(dy)) +
        Math.exp(-Math.abs(dy) * 22) * Math.max(0, 1 - Math.abs(dx));
      const diag = 0.35 * (Math.exp(-Math.abs(dx - dy) * 18) + Math.exp(-Math.abs(dx + dy) * 18)) * Math.max(0, 1 - r * 1.6);
      const core = Math.exp(-r * r * 40) + 0.35 * Math.exp(-r * r * 6);
      const a = Math.min(1, cross + diag + core);
      const k = (j * CELL + i) * 4;
      img.data[k] = 255;
      img.data[k + 1] = 255;
      img.data[k + 2] = 255;
      img.data[k + 3] = Math.round(a * 255);
    }
  }
  ctx.putImageData(img, x, y);
}

function drawFlake(ctx, x, y) {
  const c = CELL / 2;
  ctx.save();
  ctx.translate(x + c, y + c);
  ctx.fillStyle = radial(ctx, 0, 0, c * 0.6, [
    [0, 'rgba(255,255,255,0.8)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  ctx.fillRect(-c, -c, CELL, CELL);
  ctx.strokeStyle = 'rgba(255,255,255,1)';
  ctx.lineCap = 'round';
  ctx.lineWidth = 7;
  for (let k = 0; k < 6; k++) {
    ctx.save();
    ctx.rotate((k * Math.PI) / 3);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -c * 0.78);
    ctx.moveTo(0, -c * 0.45);
    ctx.lineTo(-c * 0.18, -c * 0.62);
    ctx.moveTo(0, -c * 0.45);
    ctx.lineTo(c * 0.18, -c * 0.62);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawChunk(ctx, x, y) {
  const c = CELL / 2;
  ctx.save();
  ctx.translate(x + c, y + c);
  ctx.beginPath();
  const n = 7;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2;
    const r = c * (0.5 + rnd() * 0.32);
    if (k === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
  const g = ctx.createLinearGradient(-c, -c, c, c);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, '#8a8a8a');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

function drawBlade(ctx, x, y) {
  const c = CELL / 2;
  ctx.save();
  ctx.translate(x + c, y + c);
  ctx.beginPath();
  ctx.moveTo(0, -c * 0.9);
  ctx.quadraticCurveTo(c * 0.28, 0, c * 0.08, c * 0.9);
  ctx.lineTo(-c * 0.08, c * 0.9);
  ctx.quadraticCurveTo(-c * 0.22, 0, 0, -c * 0.9);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.restore();
}

function drawCoin(ctx, x, y) {
  const c = CELL / 2;
  ctx.save();
  ctx.translate(x + c, y + c);
  ctx.beginPath();
  ctx.ellipse(0, 0, c * 0.62, c * 0.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#d8d8d8';
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0, c * 0.45, c * 0.62, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.fillStyle = '#bdbdbd';
  ctx.fillRect(-c * 0.08, -c * 0.38, c * 0.16, c * 0.76);
  ctx.restore();
}

let cached = null;

/** Returns the shared atlas texture (created once per page). */
export function getSpriteAtlas() {
  if (cached) return cached;
  seedState = 1337;
  const canvas = document.createElement('canvas');
  canvas.width = CELL * ATLAS_GRID;
  canvas.height = CELL * ATLAS_GRID;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const draw = [
    drawGlow,
    drawDot,
    drawStar,
    drawSpark,
    (c, x, y) => drawSmoke(c, x, y, 0),
    (c, x, y) => drawRing(c, x, y, false),
    drawShard,
    drawSquare,
    drawFlame,
    drawSparkle,
    drawFlake,
    drawChunk,
    drawBlade,
    (c, x, y) => drawRing(c, x, y, true),
    (c, x, y) => drawSmoke(c, x, y, 1),
    drawCoin,
  ];
  draw.forEach((fn, i) => {
    const [x, y] = cellOrigin(i);
    fn(ctx, x, y);
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace; // data-ish mask; tint colours are linear
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 1;
  tex.name = 'TurboKart.fxAtlas';
  cached = tex;
  return tex;
}

/** Frees the shared atlas (called by Effects.dispose()). */
export function disposeSpriteAtlas() {
  if (cached) {
    cached.dispose();
    cached = null;
  }
}
