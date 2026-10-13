import { MODE } from './ParticleLayer.js';
import { SPRITE } from './spriteAtlas.js';
import { rand, range, spread, onSphere, irand } from './rng.js';

/**
 * Burst effects. Every function takes `fx` = { add, alpha, S, q } where `add`
 * and `alpha` are ParticleLayers (additive / normal blending), `S` is the
 * shared ParticleSpec scratch object and `q` the quality multiplier for counts.
 * Colours on the additive layer are HDR (values > 1 bloom).
 */

const tmp = { x: 0, y: 0, z: 0 };

export function count(fx, n, scale = 1) {
  const c = n * fx.q * scale;
  const whole = Math.floor(c);
  return whole + (rand() < c - whole ? 1 : 0);
}

/** HSV (h in [0,1)) → writes r,g,b into spec start colour, scaled by k. */
export function hueToSpec(S, h, k = 1, sat = 1) {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = 1 - sat;
  const q = 1 - f * sat;
  const t = 1 - (1 - f) * sat;
  let r, g, b;
  switch (((i % 6) + 6) % 6) {
    case 0: r = 1; g = t; b = p; break;
    case 1: r = q; g = 1; b = p; break;
    case 2: r = p; g = 1; b = t; break;
    case 3: r = p; g = q; b = 1; break;
    case 4: r = t; g = p; b = 1; break;
    default: r = 1; g = p; b = q; break;
  }
  S.r = r * k;
  S.g = g * k;
  S.b = b * k;
  return S;
}

export function hexRGB(h) {
  return [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
}

/** Bright short-lived glow (flash) — additive. */
export function flash(fx, p, size, r, g, b, life = 0.16) {
  const S = fx.S.reset();
  S.pos(p);
  S.size = size * 0.6;
  S.sizeEnd = size;
  S.color(r, g, b);
  S.alpha = 1;
  S.fadeOut = 0.15;
  S.life = life;
  S.sprite = SPRITE.GLOW;
  fx.add.spawn(S);
}

/** Generic radial spark spray (AXIAL streaks with gravity). */
export function sparks(fx, p, n, o = {}) {
  const {
    speed = 9, speedVar = 0.6, up = 0.4, nx = 0, ny = 0, nz = 0, cone = 1,
    r = 3.2, g = 2.0, b = 0.7, r2 = 2.2, g2 = 0.6, b2 = 0.12,
    life = 0.35, size = 0.07, gravity = 16, drag = 1.2, stretch = 0.035,
    vx = 0, vy = 0, vz = 0, floor = -1e9,
  } = o;
  const S = fx.S;
  const c = count(fx, n);
  for (let i = 0; i < c; i++) {
    S.reset();
    onSphere(tmp);
    // bias towards the normal (cone ~ 0 = tight, 1 = full sphere)
    let dx = tmp.x * cone + nx;
    let dy = Math.abs(tmp.y) * cone * up + ny + up * 0.5;
    let dz = tmp.z * cone + nz;
    const l = Math.hypot(dx, dy, dz) || 1;
    const sp = speed * (1 - speedVar * 0.5 + rand() * speedVar);
    S.x = p.x; S.y = p.y; S.z = p.z;
    S.vx = (dx / l) * sp + vx;
    S.vy = (dy / l) * sp + vy;
    S.vz = (dz / l) * sp + vz;
    S.life = life * range(0.6, 1.3);
    S.size = size * range(0.7, 1.3);
    S.color(r, g, b);
    S.colorEnd(r2, g2, b2);
    S.fadeOut = 0.55;
    S.gravity = gravity;
    S.drag = drag;
    S.sprite = SPRITE.SPARK;
    S.mode = MODE.AXIAL;
    S.aspect = 1.5;
    S.stretch = stretch / S.size;
    S.floor = floor;
    S.bounce = 0.35;
    fx.add.spawn(S);
  }
}

/** Cartoon star sprites bursting outwards (hits, bumps). */
export function starBurst(fx, p, n, o = {}) {
  const { speed = 5, size = 0.35, life = 0.6, r = 3, g = 2.6, b = 0.6, up = 2 } = o;
  const S = fx.S;
  const c = count(fx, n, 0.8) + 1;
  for (let i = 0; i < c; i++) {
    S.reset();
    const a = (i / c) * Math.PI * 2 + rand() * 0.5;
    S.pos(p);
    S.vx = Math.cos(a) * speed * range(0.7, 1.2);
    S.vz = Math.sin(a) * speed * range(0.7, 1.2);
    S.vy = up + rand() * 2;
    S.gravity = 9;
    S.drag = 2.5;
    S.life = life * range(0.8, 1.2);
    S.size = size * range(0.8, 1.2);
    S.sizeEnd = size * 0.4;
    S.rot = rand() * 6;
    S.rotVel = spread(9);
    S.color(r, g, b);
    S.fadeOut = 0.6;
    S.sprite = SPRITE.STAR;
    fx.add.spawn(S);
  }
}

/** Expanding ring. flat = lies on the ground; otherwise camera facing. */
export function ring(fx, p, size0, size1, life, r, g, b, o = {}) {
  const { flat = true, alpha = 0.9, soft = false, layer = 'add' } = o;
  const S = fx.S.reset();
  S.pos(p);
  S.size = size0;
  S.sizeEnd = size1;
  S.life = life;
  S.color(r, g, b);
  S.alpha = alpha;
  S.fadeOut = 0.25;
  S.sprite = soft ? SPRITE.SOFTRING : SPRITE.RING;
  S.mode = flat ? MODE.FLAT : MODE.BILLBOARD;
  S.rot = rand() * 6.28;
  (layer === 'add' ? fx.add : fx.alpha).spawn(S);
}

/** Soft dust / smoke puffs (alpha layer). */
export function puffs(fx, p, n, o = {}) {
  const {
    r = 0.8, g = 0.78, b = 0.74, r2 = -1, g2 = -1, b2 = -1, alpha = 0.55,
    size = 0.5, sizeEnd = 1.8, life = 0.9, speed = 2, up = 1, spreadPos = 0.2,
    gravity = -0.4, drag = 2.5, vx = 0, vy = 0, vz = 0, radial = false, sprite = -1,
  } = o;
  const S = fx.S;
  const c = count(fx, n);
  for (let i = 0; i < c; i++) {
    S.reset();
    let dx, dz;
    if (radial) {
      const a = (i / c) * Math.PI * 2 + rand() * 0.4;
      dx = Math.cos(a);
      dz = Math.sin(a);
    } else {
      onSphere(tmp);
      dx = tmp.x;
      dz = tmp.z;
    }
    S.x = p.x + dx * spreadPos;
    S.y = p.y + rand() * spreadPos * 0.5;
    S.z = p.z + dz * spreadPos;
    const sp = speed * range(0.6, 1.2);
    S.vx = dx * sp + vx;
    S.vy = up * range(0.5, 1.3) + vy;
    S.vz = dz * sp + vz;
    S.size = size * range(0.8, 1.2);
    S.sizeEnd = sizeEnd * range(0.8, 1.25);
    S.life = life * range(0.75, 1.25);
    S.color(r, g, b);
    if (r2 >= 0) S.colorEnd(r2, g2, b2);
    S.alpha = alpha;
    S.fadeIn = 0.06;
    S.fadeOut = 0.35;
    S.gravity = gravity;
    S.drag = drag;
    S.rot = rand() * 6.28;
    S.rotVel = spread(1.2);
    S.sprite = sprite >= 0 ? sprite : rand() < 0.5 ? SPRITE.SMOKE : SPRITE.SMOKE2;
    fx.alpha.spawn(S);
  }
}

/** Explosion: flash, fireball, smoke, shockwave, embers, debris. */
export function explosion(fx, p, radius = 7, o = {}) {
  const { blue = false, groundY = p.y } = o;
  const S = fx.S;
  const R = Math.max(2.5, radius);
  // flash
  if (blue) flash(fx, p, R * 1.3, 1.2, 1.6, 3.2, 0.14);
  else flash(fx, p, R * 1.3, 3.0, 2.0, 1.0, 0.14);
  // fireball: solid cartoon puffs (alpha layer, HDR colours bloom)
  const nf = count(fx, 36);
  for (let i = 0; i < nf; i++) {
    S.reset();
    onSphere(tmp);
    tmp.y = Math.abs(tmp.y) * 0.8 + 0.15;
    const sp = R * range(1.0, 2.8);
    S.x = p.x + tmp.x * 0.6;
    S.y = p.y + 0.6 + tmp.y * 0.4;
    S.z = p.z + tmp.z * 0.6;
    S.vx = tmp.x * sp;
    S.vy = tmp.y * sp;
    S.vz = tmp.z * sp;
    S.drag = 4.2;
    S.gravity = -3;
    S.life = range(0.55, 0.95);
    S.size = R * range(0.32, 0.48);
    S.sizeEnd = R * range(0.65, 0.95);
    if (blue) {
      S.color(1.4, 2.2, 4.0);
      S.colorEnd(0.08, 0.12, 0.45);
    } else {
      const hot = rand();
      S.color(1.1 + hot * 0.9, 0.32 + hot * 0.45, 0.03 + hot * 0.06);
      S.colorEnd(0.22, 0.04, 0.015);
    }
    S.alpha = 0.95;
    S.fadeOut = 0.4;
    S.rot = rand() * 6.28;
    S.rotVel = spread(2.5);
    S.sprite = rand() < 0.5 ? SPRITE.SMOKE : SPRITE.SMOKE2;
    fx.alpha.spawn(S);
  }
  // hot core glow puffs (additive, short)
  const nc = count(fx, 8);
  for (let i = 0; i < nc; i++) {
    S.reset();
    onSphere(tmp);
    S.x = p.x + tmp.x * R * 0.25;
    S.y = p.y + 0.8 + Math.abs(tmp.y) * R * 0.25;
    S.z = p.z + tmp.z * R * 0.25;
    S.vx = tmp.x * R;
    S.vy = Math.abs(tmp.y) * R;
    S.vz = tmp.z * R;
    S.drag = 5;
    S.life = range(0.2, 0.35);
    S.size = R * 0.35;
    S.sizeEnd = R * 0.6;
    if (blue) S.color(0.6, 1.0, 2.2);
    else S.color(1.6, 0.85, 0.25);
    S.alpha = 0.8;
    S.fadeOut = 0.2;
    S.sprite = SPRITE.GLOW;
    fx.add.spawn(S);
  }
  // smoke (alpha layer, rises and lingers)
  const ns = count(fx, 20);
  for (let i = 0; i < ns; i++) {
    S.reset();
    onSphere(tmp);
    tmp.y = Math.abs(tmp.y) * 0.7 + 0.2;
    const sp = R * range(0.4, 1.2);
    S.x = p.x + tmp.x;
    S.y = p.y + 0.8 + tmp.y;
    S.z = p.z + tmp.z;
    S.vx = tmp.x * sp;
    S.vy = tmp.y * sp + 1;
    S.vz = tmp.z * sp;
    S.drag = 2.6;
    S.gravity = -1.6;
    S.life = range(1.6, 2.8);
    S.size = R * 0.3;
    S.sizeEnd = R * range(0.75, 1.05);
    const k = range(0.12, 0.22);
    S.color(k, k * 0.95, k * 0.9);
    S.colorEnd(0.38, 0.37, 0.36);
    S.alpha = 0.8;
    S.fadeIn = 0.12;
    S.fadeOut = 0.45;
    S.rot = rand() * 6.28;
    S.rotVel = spread(0.6);
    S.sprite = rand() < 0.5 ? SPRITE.SMOKE : SPRITE.SMOKE2;
    fx.alpha.spawn(S);
  }
  // shockwave on the ground + air ring
  tmp.x = p.x; tmp.y = groundY + 0.2; tmp.z = p.z;
  if (blue) ring(fx, tmp, 1, R * 3.4, 0.5, 0.8, 1.2, 2.6);
  else ring(fx, tmp, 1, R * 3.4, 0.5, 2.0, 1.3, 0.6);
  ring(fx, p, 1, R * 2.4, 0.22, 0.7, 0.6, 0.5, { flat: false, soft: true, alpha: 0.25 });
  // embers
  sparks(fx, p, 34, {
    speed: R * 2.6, up: 1.2, cone: 1, life: 0.9, size: 0.09, gravity: 14, drag: 0.9,
    r: blue ? 1.2 : 3.2, g: blue ? 2 : 1.9, b: blue ? 4 : 0.6, r2: blue ? 0.3 : 2.0, g2: blue ? 0.6 : 0.4, b2: blue ? 2 : 0.08,
    floor: groundY + 0.05,
  });
  // debris chunks (alpha layer, bounce on the ground)
  const nd = count(fx, 14);
  for (let i = 0; i < nd; i++) {
    S.reset();
    onSphere(tmp);
    tmp.y = Math.abs(tmp.y) + 0.4;
    const sp = R * range(1.0, 2.2);
    S.pos(p);
    S.y += 0.5;
    S.vx = tmp.x * sp;
    S.vy = tmp.y * sp;
    S.vz = tmp.z * sp;
    S.gravity = 24;
    S.drag = 0.4;
    S.life = range(1.1, 1.8);
    S.size = range(0.16, 0.34);
    const k = range(0.1, 0.25);
    S.color(k * 1.2, k, k * 0.85);
    S.alpha = 1;
    S.fadeOut = 0.7;
    S.rot = rand() * 6.28;
    S.rotVel = spread(14);
    S.sprite = SPRITE.CHUNK;
    S.floor = groundY + 0.08;
    S.bounce = 0.38;
    fx.alpha.spawn(S);
  }
}

/** Item box shatter: rainbow glass shards + sparkles + flash. */
export function itemBoxShatter(fx, p, groundY = p.y - 1.3) {
  const S = fx.S;
  flash(fx, p, 3.0, 1.5, 1.5, 1.6, 0.14);
  const n = count(fx, 38);
  const hue0 = rand();
  for (let i = 0; i < n; i++) {
    S.reset();
    onSphere(tmp);
    tmp.y = tmp.y * 0.6 + 0.45;
    const sp = range(4.5, 10.5);
    S.x = p.x + tmp.x * 0.4;
    S.y = p.y + tmp.y * 0.4;
    S.z = p.z + tmp.z * 0.4;
    S.vx = tmp.x * sp;
    S.vy = tmp.y * sp;
    S.vz = tmp.z * sp;
    S.gravity = 15;
    S.drag = 0.9;
    S.life = range(0.7, 1.15);
    S.size = range(0.26, 0.46);
    S.sizeEnd = S.size * 0.7;
    hueToSpec(S, (hue0 + i / n) % 1, 1.0, 0.95);
    S.alpha = 0.95;
    S.fadeOut = 0.6;
    S.rot = rand() * 6.28;
    S.rotVel = spread(16);
    S.sprite = SPRITE.SHARD;
    S.floor = groundY + 0.05;
    S.bounce = 0.3;
    S.flicker = 0.25;
    fx.add.spawn(S);
  }
  const ns = count(fx, 18);
  for (let i = 0; i < ns; i++) {
    S.reset();
    onSphere(tmp);
    const sp = range(1.5, 4.5);
    S.pos(p);
    S.vx = tmp.x * sp;
    S.vy = tmp.y * sp + 1.5;
    S.vz = tmp.z * sp;
    S.drag = 2.2;
    S.gravity = 2;
    S.life = range(0.45, 0.8);
    S.size = range(0.25, 0.45);
    S.sizeEnd = 0.05;
    S.color(2.2, 2.2, 2.2);
    S.fadeOut = 0.5;
    S.flicker = 0.5;
    S.rot = rand() * 6.28;
    S.sprite = SPRITE.SPARKLE;
    fx.add.spawn(S);
  }
}

/** Gold sparkle pop for coin pickups. */
export function coinSparkle(fx, p) {
  const S = fx.S;
  flash(fx, p, 1.6, 3.2, 2.5, 0.8, 0.14);
  ring(fx, p, 0.3, 1.8, 0.25, 2.6, 2.0, 0.6, { flat: false, soft: true, alpha: 0.8 });
  const n = count(fx, 12) + 2;
  for (let i = 0; i < n; i++) {
    S.reset();
    const a = (i / n) * Math.PI * 2;
    const sp = range(2, 4.2);
    S.pos(p);
    S.vx = Math.cos(a) * sp;
    S.vz = Math.sin(a) * sp;
    S.vy = range(1, 3.5);
    S.drag = 3;
    S.gravity = 3;
    S.life = range(0.35, 0.6);
    S.size = range(0.2, 0.32);
    S.sizeEnd = 0.04;
    S.color(3.2, 2.5, 0.9);
    S.fadeOut = 0.4;
    S.flicker = 0.4;
    S.sprite = SPRITE.SPARKLE;
    fx.add.spawn(S);
  }
}

/** Coins spilling out of a hit kart. */
export function coinSpill(fx, p, amount, groundY) {
  const S = fx.S;
  const n = Math.min(10, Math.max(1, amount));
  for (let i = 0; i < n; i++) {
    S.reset();
    const a = (i / n) * Math.PI * 2 + rand();
    S.pos(p);
    S.y += 1;
    const sp = range(2.5, 4.5);
    S.vx = Math.cos(a) * sp;
    S.vz = Math.sin(a) * sp;
    S.vy = range(6, 9);
    S.gravity = 24;
    S.life = range(1.0, 1.3);
    S.size = 0.42;
    S.color(1.0, 0.78, 0.16);
    S.fadeOut = 0.75;
    S.rot = 0;
    S.rotVel = spread(10);
    S.sprite = SPRITE.COIN;
    S.floor = groundY + 0.2;
    S.bounce = 0.45;
    fx.alpha.spawn(S);
  }
}

/** Jagged lightning bolt from `top` to `bottom` (additive streak segments). */
export function lightningBolt(fx, top, bottom, o = {}) {
  const { segments = 11, width = 0.45, life = 0.32, jitter = 2.2 } = o;
  const S = fx.S;
  let px = top.x, py = top.y, pz = top.z;
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    const j = i === segments ? 0 : jitter * (1 - t * 0.6);
    const nx = top.x + (bottom.x - top.x) * t + spread(j);
    const ny = top.y + (bottom.y - top.y) * t;
    const nz = top.z + (bottom.z - top.z) * t + spread(j);
    const dx = nx - px, dy = ny - py, dz = nz - pz;
    const len = Math.hypot(dx, dy, dz) || 1;
    for (let pass = 0; pass < 2; pass++) {
      S.reset();
      S.x = nx; S.y = ny; S.z = nz;
      // tiny velocity just to carry the segment direction
      S.vx = (dx / len) * 1e-3;
      S.vy = (dy / len) * 1e-3;
      S.vz = (dz / len) * 1e-3;
      const w = pass === 0 ? width : width * 4.5;
      S.size = w;
      S.aspect = (len + w * 0.6) / w;
      S.mode = MODE.AXIAL;
      S.sprite = SPRITE.GLOW;
      if (pass === 0) S.color(3.5, 3.8, 6.0);
      else S.color(0.9, 1.1, 2.6);
      S.alpha = pass === 0 ? 1 : 0.45;
      S.life = life;
      S.fadeOut = 0.3;
      S.flicker = 0.55;
      fx.add.spawn(S);
    }
    // occasional side branch
    if (i > 1 && i < segments - 1 && rand() < 0.3) {
      S.reset();
      const bl = range(1.5, 3.5);
      const bx = spread(1), bz = spread(1), by = -range(0.4, 1);
      const bn = Math.hypot(bx, by, bz) || 1;
      S.x = nx + (bx / bn) * bl; S.y = ny + (by / bn) * bl; S.z = nz + (bz / bn) * bl;
      S.vx = (bx / bn) * 1e-3; S.vy = (by / bn) * 1e-3; S.vz = (bz / bn) * 1e-3;
      S.size = width * 0.6;
      S.aspect = bl / S.size;
      S.mode = MODE.AXIAL;
      S.sprite = SPRITE.GLOW;
      S.color(2.4, 2.7, 5);
      S.life = life * 0.7;
      S.flicker = 0.6;
      fx.add.spawn(S);
    }
    px = nx; py = ny; pz = nz;
  }
  flash(fx, bottom, 4, 2.5, 3, 5.5, 0.25);
  sparks(fx, bottom, 18, { speed: 8, r: 2.5, g: 3, b: 5, r2: 0.6, g2: 0.9, b2: 3, life: 0.4 });
}

const CONFETTI = [0xff0a3c, 0xffc400, 0x00c850, 0x0a5cff, 0xff5a00, 0x9a2cff, 0xff1fb4, 0x00d8ff, 0xffffff];

/** One confetti piece. */
export function confettiPiece(fx, x, y, z, vx, vy, vz, follow = true) {
  const S = fx.S.reset();
  S.follow = follow;
  S.x = x; S.y = y; S.z = z;
  S.vx = vx; S.vy = vy; S.vz = vz;
  const c = CONFETTI[irand(CONFETTI.length)];
  S.hex(c, c === 0xffffff ? 0.8 : 0.55);
  S.alpha = 1;
  S.size = range(0.2, 0.3);
  S.life = range(3.2, 4.8);
  S.fadeOut = 0.8;
  S.gravity = 5.5;
  S.drag = 2.0;
  S.rot = rand() * 6.28;
  S.rotVel = spread(12);
  S.flicker = 0.18; // fake tumbling shimmer
  S.sprite = SPRITE.SQUARE;
  S.floor = fx.groundY ?? -1e9;
  fx.alpha.spawn(S);
}

/** Confetti cannon burst centred on p. */
export function confettiBurst(fx, p, n = 150) {
  const c = count(fx, n);
  for (let i = 0; i < c; i++) {
    const a = rand() * Math.PI * 2;
    const sp = range(2, 7);
    confettiPiece(fx, p.x + spread(0.6), p.y + range(0.5, 2), p.z + spread(0.6),
      Math.cos(a) * sp, range(7, 15), Math.sin(a) * sp);
  }
}

/** Firework shell explosion (spherical burst + glitter). */
export function fireworkBurst(fx, p, hue, follow = true) {
  const S = fx.S;
  hueToSpec(S, hue, 1, 0.85);
  const cr = S.r, cg = S.g, cb = S.b;
  S.reset();
  S.pos(p);
  S.size = 5;
  S.sizeEnd = 9;
  S.color(cr * 0.8 + 0.1, cg * 0.8 + 0.1, cb * 0.8 + 0.1);
  S.alpha = 0.9;
  S.fadeOut = 0.1;
  S.life = 0.25;
  S.sprite = SPRITE.GLOW;
  S.follow = follow;
  fx.add.spawn(S);
  const n = count(fx, 80);
  for (let i = 0; i < n; i++) {
    S.reset();
    onSphere(tmp);
    const sp = range(10, 13.5);
    S.pos(p);
    S.vx = tmp.x * sp;
    S.vy = tmp.y * sp;
    S.vz = tmp.z * sp;
    S.drag = 1.5;
    S.gravity = 4;
    S.life = range(1.3, 1.9);
    S.size = 0.2;
    S.sizeEnd = 0.1;
    S.color(cr * 2.4 + 0.2, cg * 2.4 + 0.2, cb * 2.4 + 0.2);
    S.colorEnd(cr * 1.1, cg * 1.1, cb * 1.1);
    S.fadeOut = 0.55;
    S.follow = follow;
    S.sprite = SPRITE.SPARK;
    S.mode = MODE.AXIAL;
    S.aspect = 2;
    S.stretch = 0.6;
    fx.add.spawn(S);
  }
  const ng = count(fx, 30);
  for (let i = 0; i < ng; i++) {
    S.reset();
    onSphere(tmp);
    const sp = range(3, 9);
    S.pos(p);
    S.vx = tmp.x * sp;
    S.vy = tmp.y * sp;
    S.vz = tmp.z * sp;
    S.drag = 1.8;
    S.gravity = 3;
    S.life = range(1.6, 2.4);
    S.size = 0.35;
    S.sizeEnd = 0.1;
    S.color(2.4, 2.2, 1.7);
    S.fadeIn = 0.25;
    S.fadeOut = 0.5;
    S.flicker = 0.85;
    S.follow = follow;
    S.sprite = SPRITE.SPARKLE;
    fx.add.spawn(S);
  }
}
