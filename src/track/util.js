/**
 * Small pure helpers shared by the track modules (no DOM, Node-safe).
 * Seeded RNG, value/simplex-ish noise, math helpers.
 */

/** Mulberry32 seeded PRNG -> function returning [0,1). */
export function createRng(seed = 1) {
  let a = seed >>> 0;
  const rng = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  rng.range = (lo, hi) => lo + (hi - lo) * rng();
  rng.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * rng());
  rng.pick = (arr) => arr[Math.floor(rng() * arr.length)];
  rng.sign = () => (rng() < 0.5 ? -1 : 1);
  return rng;
}

export function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const smooth01 = (t) => t * t * (3 - 2 * t);
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

// ---------------------------------------------------------------------------
// 2D gradient noise (Perlin-style) with a fixed permutation (seedable).
// ---------------------------------------------------------------------------
export function createNoise2D(seed = 1337) {
  const rng = createRng(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = p[i];
    p[i] = p[j];
    p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float32Array(256);
  const gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const a = (i / 256) * Math.PI * 2;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function noise(x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const g00 = perm[X + perm[Y]];
    const g10 = perm[X + 1 + perm[Y]];
    const g01 = perm[X + perm[Y + 1]];
    const g11 = perm[X + 1 + perm[Y + 1]];
    const n00 = gx[g00] * xf + gy[g00] * yf;
    const n10 = gx[g10] * (xf - 1) + gy[g10] * yf;
    const n01 = gx[g01] * xf + gy[g01] * (yf - 1);
    const n11 = gx[g11] * (xf - 1) + gy[g11] * (yf - 1);
    const u = fade(xf);
    const v = fade(yf);
    return (n00 + u * (n10 - n00) + v * (n01 - n00) + u * v * (n00 - n10 - n01 + n11)) * 1.4142;
  }
  /** Fractal brownian motion, returns roughly [-1,1]. */
  noise.fbm = (x, y, octaves = 4, lacunarity = 2, gain = 0.5) => {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += noise(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  };
  /** Ridged multifractal in [0,1] — sharp mountain crests. */
  noise.ridged = (x, y, octaves = 4) => {
    let amp = 0.5;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(noise(x * freq, y * freq));
      sum += n * n * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2.03;
    }
    return sum / norm;
  };
  return noise;
}

/** Yield to the event loop (keeps the page responsive during async builds). */
export const nextFrame = () =>
  new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function' && typeof document !== 'undefined' && !document.hidden) {
      // rAF can stall in background tabs; race it with a timeout.
      let done = false;
      const finish = () => {
        if (!done) {
          done = true;
          resolve();
        }
      };
      requestAnimationFrame(finish);
      setTimeout(finish, 30);
    } else setTimeout(resolve, 0);
  });
