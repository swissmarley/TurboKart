/**
 * Small seeded PRNG (mulberry32) used by every effect so the dev sandbox can
 * reproduce a frame exactly (`?t=2`). Effects never call Math.random().
 */
let state = 0x9e3779b9;

export function seed(n) {
  state = (n >>> 0) || 1;
}

/** Uniform float in [0, 1). */
export function rand() {
  state = (state + 0x6d2b79f5) | 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Uniform float in [a, b). */
export function range(a, b) {
  return a + (b - a) * rand();
}

/** Uniform float in [-a, a). */
export function spread(a) {
  return (rand() * 2 - 1) * a;
}

/** Random point on the unit sphere written into `out` ({x,y,z}). */
export function onSphere(out) {
  const u = rand() * 2 - 1;
  const th = rand() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  out.x = r * Math.cos(th);
  out.y = u;
  out.z = r * Math.sin(th);
  return out;
}

/** Integer in [0, n). */
export function irand(n) {
  return Math.floor(rand() * n);
}
