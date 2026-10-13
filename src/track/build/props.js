/**
 * Low-poly stylised prop geometry with baked vertex colours.
 * Every factory returns a single merged BufferGeometry (position, normal, color)
 * ready for InstancedMesh.
 */
import * as THREE from 'three';
import { createRng, createNoise2D } from '../util.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _n = new THREE.Vector3();

/** Deterministic 3D displacement noise (same for duplicated vertices). */
const noise2 = createNoise2D(4242);
function n3(x, y, z) {
  return (noise2(x * 0.9 + z * 0.37, y * 0.9 - z * 0.21) + noise2(y * 0.7 + 13.1, z * 0.8 - x * 0.3)) * 0.5;
}

export class PartsBuilder {
  constructor() {
    this.parts = [];
  }

  /**
   * @param {THREE.BufferGeometry} geo
   * @param {number|THREE.Color|function} color  hex, Color or (pos, normal, outColor) => void
   * @param {object} [t] { p:[x,y,z], r:[x,y,z], s:[x,y,z]|number }
   * @param {object} [o] { jitter, flat }
   */
  add(geo, color, t = {}, o = {}) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.deleteAttribute('uv');
    if (t.p || t.r || t.s) {
      const s = t.s === undefined ? 1 : t.s;
      _s.set(...(Array.isArray(s) ? s : [s, s, s]));
      _e.set(...(t.r || [0, 0, 0]));
      _q.setFromEuler(_e);
      _p.set(...(t.p || [0, 0, 0]));
      _m.compose(_p, _q, _s);
      g.applyMatrix4(_m);
    }
    if (o.jitter) {
      const pos = g.attributes.position;
      const amp = o.jitter;
      const f = o.jitterFreq || 1.3;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const y = pos.getY(i);
        const z = pos.getZ(i);
        const k = 1 + n3(x * f, y * f, z * f) * amp;
        const cx = o.center ? o.center[0] : 0;
        const cy = o.center ? o.center[1] : 0;
        const cz = o.center ? o.center[2] : 0;
        pos.setXYZ(i, cx + (x - cx) * k, cy + (y - cy) * k, cz + (z - cz) * k);
      }
    }
    if (o.flat !== false) g.computeVertexNormals();
    const pos = g.attributes.position;
    const nrm = g.attributes.normal;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      if (typeof color === 'function') {
        _p.fromBufferAttribute(pos, i);
        _n.fromBufferAttribute(nrm, i);
        color(_p, _n, _c);
      } else _c.set(color);
      col[i * 3] = _c.r;
      col[i * 3 + 1] = _c.g;
      col[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push(g);
    return this;
  }

  build() {
    let total = 0;
    for (const g of this.parts) total += g.attributes.position.count;
    const pos = new Float32Array(total * 3);
    const nrm = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    let o = 0;
    for (const g of this.parts) {
      pos.set(g.attributes.position.array, o * 3);
      nrm.set(g.attributes.normal.array, o * 3);
      col.set(g.attributes.color.array, o * 3);
      o += g.attributes.position.count;
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
}

const lerpColor = (a, b, t, out) => out.set(a).lerp(_tmpC.set(b), Math.max(0, Math.min(1, t)));
const _tmpC = new THREE.Color();

/** Foliage colouring: lighter on top / sun side, darker underneath. */
function foliageColor(dark, light, yMin, yMax, sat = 0) {
  return (p, n, out) => {
    const h = (p.y - yMin) / (yMax - yMin);
    const t = 0.25 + 0.45 * h + 0.3 * Math.max(0, n.y) + n3(p.x * 2, p.y * 2, p.z * 2) * 0.25;
    lerpColor(dark, light, t, out);
    if (sat) out.offsetHSL(0, sat, 0);
  };
}

// ---------------------------------------------------------------------------
// Trees
// ---------------------------------------------------------------------------
export function roundTree(seed = 1, { leaf = [0x2f7a2c, 0x8fd14f], trunk = 0x6e4628 } = {}) {
  const rng = createRng(seed);
  const b = new PartsBuilder();
  const h = 2.6 + rng() * 0.8;
  b.add(new THREE.CylinderGeometry(0.28, 0.45, h + 0.6, 7), trunk, { p: [0, (h + 0.6) / 2 - 0.3, 0] });
  // a couple of branches
  b.add(new THREE.CylinderGeometry(0.12, 0.2, 1.6, 5), trunk, { p: [0.5, h - 0.2, 0.1], r: [0, 0, -0.8] });
  const blobs = 3 + Math.floor(rng() * 2);
  const top = h + 2.0;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * Math.PI * 2 + rng();
    const r = i === 0 ? 0 : 1.1 + rng() * 0.5;
    const cy = i === 0 ? top + 0.6 : top - 0.2 + rng() * 0.8;
    const rad = i === 0 ? 2.3 + rng() * 0.4 : 1.6 + rng() * 0.5;
    b.add(new THREE.IcosahedronGeometry(rad, 1), foliageColor(leaf[0], leaf[1], h, top + 3), { p: [Math.cos(a) * r, cy, Math.sin(a) * r] }, { jitter: 0.22, center: [Math.cos(a) * r, cy, Math.sin(a) * r] });
  }
  return b.build();
}

export function poplarTree(seed = 1, { leaf = [0x2c6a2a, 0x6fbe45], trunk = 0x6a4428 } = {}) {
  const rng = createRng(seed);
  const b = new PartsBuilder();
  b.add(new THREE.CylinderGeometry(0.22, 0.35, 2.4, 6), trunk, { p: [0, 1.2, 0] });
  const hh = 4 + rng() * 1.2;
  b.add(new THREE.IcosahedronGeometry(1, 2), foliageColor(leaf[0], leaf[1], 1.5, 2 + hh * 2), { p: [0, 2 + hh, 0], s: [1.6, hh, 1.6] }, { jitter: 0.12, center: [0, 2 + hh, 0] });
  return b.build();
}

export function pineTree(seed = 1, { snowy = false, leaf = [0x1d4f2e, 0x3f8a46], trunk = 0x5a3a22, tiers = 4, height = 9 } = {}) {
  const rng = createRng(seed);
  const b = new PartsBuilder();
  b.add(new THREE.CylinderGeometry(0.2, 0.38, 2.2, 6), trunk, { p: [0, 1.1, 0] });
  const snowCol = new THREE.Color(0xf3f7ff);
  for (let i = 0; i < tiers; i++) {
    const t = i / (tiers - 1);
    const rad = (2.7 - t * 1.7) * (0.9 + rng() * 0.2);
    const h = 3.2 - t * 1.1;
    const y = 1.6 + t * (height - 4.2) + h / 2;
    const col = (p, n, out) => {
      const shade = 0.35 + 0.5 * ((p.y - y + h / 2) / h) + n3(p.x * 3, p.y * 3, p.z * 3) * 0.2;
      lerpColor(leaf[0], leaf[1], shade, out);
      if (snowy) {
        const rel = (p.y - y + h / 2) / h; // 0 bottom .. 1 tip of this tier
        const patch = n3(p.x * 1.7, p.y * 1.7, p.z * 1.7);
        let s = 0;
        if (n.y > 0.55 && (rel > 0.74 || patch > 0.3)) s = 0.92;
        else if (rel < 0.12 && n.y > 0.3) s = 0.85; // snow resting on the tier rim
        if (s) out.lerp(snowCol, s);
      }
    };
    b.add(new THREE.ConeGeometry(rad, h, 9, 1), col, { p: [0, y, 0], r: [0, rng() * 3, 0] }, { jitter: 0.08, center: [0, y, 0] });
  }
  return b.build();
}

export function bush(seed = 1, { leaf = [0x2e7a2e, 0x7cc64a] } = {}) {
  const rng = createRng(seed);
  const b = new PartsBuilder();
  const n = 3;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng();
    const r = 0.6;
    const rad = 0.8 + rng() * 0.4;
    b.add(new THREE.IcosahedronGeometry(rad, 1), foliageColor(leaf[0], leaf[1], 0, 2), { p: [Math.cos(a) * r, rad * 0.7, Math.sin(a) * r] }, { jitter: 0.2, center: [Math.cos(a) * r, rad * 0.7, Math.sin(a) * r] });
  }
  return b.build();
}

export function rock(seed = 1, { colors = [0x6f7176, 0xa9abb0], detail = 1, squash = 0.7 } = {}) {
  const b = new PartsBuilder();
  const col = (p, n, out) => lerpColor(colors[0], colors[1], 0.35 + n.y * 0.45 + n3(p.x * 2, p.y * 2, p.z * 2) * 0.3, out);
  b.add(new THREE.DodecahedronGeometry(1, detail), col, { p: [0, 0.35, 0], s: [1.2, squash, 1], r: [seed, seed * 2, 0] }, { jitter: 0.32, jitterFreq: 1.1 + (seed % 5) * 0.2, center: [0, 0.35, 0] });
  return b.build();
}

// ---------------------------------------------------------------------------
// Desert
// ---------------------------------------------------------------------------
export function saguaro(seed = 1) {
  const rng = createRng(seed);
  const b = new PartsBuilder();
  const green = (p, n, out) => {
    // vertical ribs: alternate shade by angle
    const ang = Math.atan2(p.z, p.x);
    const rib = Math.sin(ang * 14) * 0.5 + 0.5;
    lerpColor(0x2f6b2f, 0x5fa24a, 0.3 + rib * 0.4 + Math.max(0, n.y) * 0.2, out);
  };
  const H = 5 + rng() * 2.5;
  b.add(new THREE.CylinderGeometry(0.42, 0.5, H, 14, 4), green, { p: [0, H / 2, 0] }, { flat: false });
  b.add(new THREE.SphereGeometry(0.42, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), green, { p: [0, H, 0] }, { flat: false });
  const arms = 1 + Math.floor(rng() * 2.2);
  for (let i = 0; i < arms; i++) {
    const side = i % 2 ? -1 : 1;
    const ay = H * (0.35 + rng() * 0.25);
    const out = 1.0 + rng() * 0.3;
    const up = 1.4 + rng() * 1.4;
    const rot = rng() * Math.PI;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const X = (x, z) => [x * c - z * s, x * s + z * c];
    const [hx, hz] = X(side * out * 0.5, 0);
    b.add(new THREE.CylinderGeometry(0.3, 0.3, out, 10), green, { p: [hx, ay, hz], r: [0, -rot, Math.PI / 2] }, { flat: false });
    const [vx, vz] = X(side * out, 0);
    b.add(new THREE.CylinderGeometry(0.3, 0.32, up, 10), green, { p: [vx, ay + up / 2, vz] }, { flat: false });
    b.add(new THREE.SphereGeometry(0.3, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), green, { p: [vx, ay + up, vz] }, { flat: false });
    b.add(new THREE.SphereGeometry(0.31, 10, 6), green, { p: [vx, ay, vz] }, { flat: false });
  }
  return b.build();
}

export function barrelCactus(seed = 1) {
  const b = new PartsBuilder();
  const green = (p, n, out) => {
    const ang = Math.atan2(p.z, p.x);
    lerpColor(0x3a7a32, 0x6db352, 0.4 + Math.sin(ang * 10) * 0.25 + n.y * 0.2, out);
  };
  b.add(new THREE.SphereGeometry(0.7, 14, 10), green, { p: [0, 0.55, 0], s: [1, 1.15, 1] }, { flat: false });
  // pink flowers on top
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    b.add(new THREE.OctahedronGeometry(0.16, 0), 0xff5fa2, { p: [Math.cos(a) * 0.25, 1.33, Math.sin(a) * 0.25] });
  }
  return b.build();
}

export function deadShrub(seed = 1) {
  const rng = createRng(seed);
  const b = new PartsBuilder();
  for (let i = 0; i < 7; i++) {
    const a = rng() * Math.PI * 2;
    const tilt = 0.5 + rng() * 0.6;
    b.add(new THREE.CylinderGeometry(0.03, 0.06, 1.3, 4), 0x8a6a45, { p: [Math.cos(a) * 0.3, 0.5, Math.sin(a) * 0.3], r: [Math.sin(a) * tilt, 0, Math.cos(a) * tilt] });
  }
  b.add(new THREE.IcosahedronGeometry(0.55, 0), 0x9a8656, { p: [0, 0.45, 0], s: [1, 0.6, 1] }, { jitter: 0.3 });
  return b.build();
}

// ---------------------------------------------------------------------------
// Meadow structures
// ---------------------------------------------------------------------------
export function windmillTower() {
  const b = new PartsBuilder();
  const wall = (p, n, out) => lerpColor(0xd9d2c3, 0xfffaf0, 0.5 + n.y * 0.3 + n3(p.x * 4, p.y * 4, p.z * 4) * 0.2, out);
  b.add(new THREE.CylinderGeometry(2.4, 3.6, 13, 8), wall, { p: [0, 6.5, 0] });
  b.add(new THREE.CylinderGeometry(3.9, 3.9, 0.5, 8), 0x8a5a36, { p: [0, 9.5, 0] }); // balcony
  b.add(new THREE.ConeGeometry(3.0, 4.2, 8), (p, n, out) => lerpColor(0x8e2a22, 0xd8473a, 0.4 + n.y * 0.4, out), { p: [0, 15.1, 0] });
  b.add(new THREE.BoxGeometry(1.4, 2.4, 0.4), 0x5b3a22, { p: [0, 1.2, 3.35] }); // door
  for (const y of [5.5, 11]) {
    for (const a of [0.9, -0.9, Math.PI]) {
      const r = y < 8 ? 3.05 : 2.6;
      b.add(new THREE.BoxGeometry(0.8, 1.1, 0.3), 0x2b3550, { p: [Math.sin(a) * r, y, Math.cos(a) * r], r: [0, a, 0] });
    }
  }
  b.add(new THREE.CylinderGeometry(0.5, 0.5, 2.4, 8), 0x4a3424, { p: [0, 13.6, 2.6], r: [Math.PI / 2, 0, 0] }); // axle
  return b.build();
}

/** Blades centred on the hub at origin, spinning about +Z. */
export function windmillBlades() {
  const b = new PartsBuilder();
  b.add(new THREE.CylinderGeometry(0.75, 0.75, 0.8, 10), 0x3d2a1c, { r: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const at = (r, off) => [c * r - s * off, s * r + c * off, 0.2];
    b.add(new THREE.BoxGeometry(0.28, 9.5, 0.22), 0x6b4a2e, { p: at(5, 0), r: [0, 0, a - Math.PI / 2] });
    // lattice sail panel
    b.add(new THREE.BoxGeometry(1.9, 7.2, 0.08), i % 2 ? 0xf3ece0 : 0xd8463b, { p: at(5.9, 1.05), r: [0, 0, a - Math.PI / 2] });
    for (let j = 0; j < 5; j++) b.add(new THREE.BoxGeometry(2.1, 0.12, 0.14), 0x6b4a2e, { p: at(2.8 + j * 1.6, 1.05), r: [0, 0, a - Math.PI / 2] });
  }
  return b.build();
}

export function balloon(seed = 1, colors = [0xff4b4b, 0xffd23f]) {
  const b = new PartsBuilder();
  const pts = [];
  const prof = [
    [0.9, 0],
    [1.6, 1.2],
    [3.8, 3.6],
    [5.6, 6.4],
    [6.2, 8.6],
    [5.9, 10.6],
    [4.8, 12.4],
    [3.0, 13.6],
    [0.01, 14.1],
  ];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r, y));
  const lathe = new THREE.LatheGeometry(pts, 24);
  const ca = new THREE.Color(colors[0]);
  const cb = new THREE.Color(colors[1]);
  const env = (p, n, out) => {
    const ang = Math.atan2(p.z, p.x) + Math.PI;
    const gore = Math.floor((ang / (Math.PI * 2)) * 12 + 0.0001) % 2;
    out.copy(gore ? ca : cb);
    if (p.y > 3.2 && p.y < 4.2) out.set(0xffffff);
    out.multiplyScalar(0.85 + 0.15 * Math.max(0, n.y + 0.5));
  };
  b.add(lathe, env, { p: [0, 3.2, 0] }, { flat: true });
  b.add(new THREE.BoxGeometry(1.3, 1.0, 1.3), 0x8a5a2e, { p: [0, 0.5, 0] });
  b.add(new THREE.BoxGeometry(1.4, 0.15, 1.4), 0x5a3a1e, { p: [0, 1.0, 0] });
  for (const [x, z] of [[0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]]) {
    b.add(new THREE.CylinderGeometry(0.03, 0.03, 2.6, 3), 0x3a2a1a, { p: [x * 1.1, 2.2, z * 1.1], r: [z * 0.25, 0, -x * 0.25] });
  }
  b.add(new THREE.ConeGeometry(0.35, 0.9, 6), 0xffa21a, { p: [0, 2.0, 0] });
  return b.build();
}

export function hayBale() {
  const b = new PartsBuilder();
  const col = (p, n, out) => lerpColor(0xc99a3a, 0xf2d27a, 0.4 + Math.abs(n.x) * 0.0 + n3(p.x * 6, p.y * 6, p.z * 6) * 0.4 + (Math.abs(n.z) > 0.9 ? -0.15 : 0.1), out);
  b.add(new THREE.CylinderGeometry(0.8, 0.8, 1.5, 14), col, { p: [0, 0.8, 0], r: [Math.PI / 2, 0, 0] });
  return b.build();
}

export function tireStack(rows = 3) {
  const b = new PartsBuilder();
  for (let i = 0; i < rows; i++) {
    b.add(new THREE.TorusGeometry(0.42, 0.2, 6, 12), i % 2 ? 0x18181c : 0x2a2a30, { p: [0, 0.2 + i * 0.36, 0], r: [Math.PI / 2, 0, 0] });
  }
  b.add(new THREE.TorusGeometry(0.42, 0.205, 6, 12), 0xf2f2f2, { p: [0, 0.2 + rows * 0.36 - 0.36, 0], r: [Math.PI / 2, 0, 0], s: [1.0, 1.0, 0.35] });
  return b.build();
}

export function barn() {
  const b = new PartsBuilder();
  const red = (p, n, out) => lerpColor(0x8a1f18, 0xc23a2c, 0.5 + n.y * 0.2 + n3(p.x, p.y * 3, p.z) * 0.2, out);
  b.add(new THREE.BoxGeometry(12, 7, 18), red, { p: [0, 3.5, 0] });
  // gable roof as a triangular prism
  const shape = new THREE.Shape();
  shape.moveTo(-6.8, 0);
  shape.lineTo(0, 5);
  shape.lineTo(6.8, 0);
  shape.lineTo(-6.8, 0);
  const roof = new THREE.ExtrudeGeometry(shape, { depth: 19, bevelEnabled: false });
  b.add(roof, (p, n, out) => out.set(n.y > 0.2 ? 0x4a4f5a : 0xb2321f), { p: [0, 7, -9.5] });
  b.add(new THREE.BoxGeometry(5, 5, 0.3), 0xf4efe6, { p: [0, 2.5, 9.05] });
  b.add(new THREE.BoxGeometry(4.4, 4.4, 0.35), 0x7a1c14, { p: [0, 2.5, 9.1] });
  return b.build();
}

export function silo() {
  const b = new PartsBuilder();
  b.add(new THREE.CylinderGeometry(3, 3, 14, 14), (p, n, out) => lerpColor(0xb8b8bc, 0xe8e8ec, 0.5 + Math.sin(p.y * 2.2) * 0.2, out), { p: [0, 7, 0] }, { flat: false });
  b.add(new THREE.SphereGeometry(3, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), 0xb53a2a, { p: [0, 14, 0] }, { flat: false });
  return b.build();
}

export function fenceSegment(len = 4) {
  const b = new PartsBuilder();
  const wood = 0xa77a4e;
  b.add(new THREE.BoxGeometry(0.18, 1.3, 0.18), wood, { p: [0, 0.65, 0] });
  b.add(new THREE.BoxGeometry(len, 0.14, 0.08), 0xc79864, { p: [len / 2, 0.95, 0] });
  b.add(new THREE.BoxGeometry(len, 0.14, 0.08), 0xc79864, { p: [len / 2, 0.5, 0] });
  return b.build();
}

export function flagPole(h = 8) {
  const b = new PartsBuilder();
  b.add(new THREE.CylinderGeometry(0.08, 0.1, h, 6), 0xdddddd, { p: [0, h / 2, 0] });
  b.add(new THREE.SphereGeometry(0.16, 8, 6), 0xffd23f, { p: [0, h, 0] });
  return b.build();
}

export function cabin(seed = 1) {
  const rng = createRng(seed);
  const b = new PartsBuilder();
  const W = 6 + rng() * 2;
  const D = 7 + rng() * 2;
  const H = 3.4;
  const log = (p, n, out) => lerpColor(0x5a3420, 0x8a5634, 0.5 + Math.sin(p.y * 9) * 0.3 + n3(p.x, p.y, p.z) * 0.15, out);
  b.add(new THREE.BoxGeometry(W, H, D), log, { p: [0, H / 2, 0] });
  const shape = new THREE.Shape();
  shape.moveTo(-W / 2 - 0.7, 0);
  shape.lineTo(0, 2.8);
  shape.lineTo(W / 2 + 0.7, 0);
  shape.lineTo(-W / 2 - 0.7, 0);
  const roof = new THREE.ExtrudeGeometry(shape, { depth: D + 1.2, bevelEnabled: false });
  b.add(roof, (p, n, out) => out.set(n.y > 0.3 ? 0xf6f9ff : 0x6a3a22), { p: [0, H, -D / 2 - 0.6] });
  // snow lip
  b.add(new THREE.BoxGeometry(W + 1.6, 0.35, D + 1.3), 0xf6f9ff, { p: [0, H + 0.05, 0] });
  // glowing windows
  for (const sx of [-1, 1]) b.add(new THREE.BoxGeometry(1.1, 1.0, 0.15), 0xffc66a, { p: [sx * W * 0.25, 1.8, D / 2 + 0.05] });
  b.add(new THREE.BoxGeometry(1.0, 2.0, 0.15), 0x3a2416, { p: [0, 1.0, -D / 2 - 0.05] });
  b.add(new THREE.BoxGeometry(0.9, 2.4, 0.9), 0x6e6e74, { p: [W * 0.28, H + 2.0, -D * 0.2] }); // chimney
  return b.build();
}

export function crystal(seed = 1) {
  const b = new PartsBuilder();
  const rng = createRng(seed);
  b.add(new THREE.OctahedronGeometry(1, 0), 0xffffff, { s: [0.6 + rng() * 0.3, 1.6 + rng(), 0.6 + rng() * 0.3] });
  return b.build();
}

export function cloudPuff(seed = 1) {
  const rng = createRng(seed);
  const b = new PartsBuilder();
  for (let i = 0; i < 6; i++) {
    const x = (rng() - 0.5) * 10;
    const r = 2.5 + rng() * 2.5;
    b.add(new THREE.IcosahedronGeometry(r, 1), (p, n, out) => lerpColor(0xc9d6ea, 0xffffff, 0.5 + n.y * 0.5, out), { p: [x, r * 0.4, (rng() - 0.5) * 4] }, { jitter: 0.15, center: [x, r * 0.4, 0] });
  }
  return b.build();
}

export { lerpColor, n3 };

export function palmTree(seed = 1) {
  const rng = createRng(seed);
  const b = new PartsBuilder();
  const H = 7 + rng() * 3;
  const lean = (rng() - 0.5) * 0.5;
  const segs = 7;
  let x = 0;
  let y = 0;
  for (let i = 0; i < segs; i++) {
    const t = i / segs;
    const h = H / segs;
    const dx = Math.sin(lean) * h * (0.4 + t);
    b.add(new THREE.CylinderGeometry(0.26 - t * 0.08, 0.32 - t * 0.08, h * 1.08, 7), i % 2 ? 0x8a6a44 : 0xa5835a, { p: [x + dx / 2, y + h / 2, 0], r: [0, 0, -Math.atan2(dx, h)] });
    x += dx;
    y += h;
  }
  const fronds = 8;
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2 + rng() * 0.3;
    const g = new THREE.BoxGeometry(0.9, 0.06, 4.6, 1, 1, 8);
    const pos = g.attributes.position;
    for (let v = 0; v < pos.count; v++) {
      const zz = pos.getZ(v) + 2.3; // 0..4.6
      const w = Math.sin((zz / 4.6) * Math.PI) * 0.9 + 0.15;
      pos.setX(v, pos.getX(v) * w);
      pos.setY(v, pos.getY(v) - (zz * zz) * 0.09 + zz * 0.25);
      pos.setZ(v, zz);
    }
    b.add(g, (p, n, out) => lerpColor(0x2f7a2a, 0x7cc64a, 0.3 + Math.abs(n.y) * 0.5, out), { p: [x, y, 0], r: [0, a, 0] });
  }
  b.add(new THREE.SphereGeometry(0.45, 8, 6), 0x6a4a2a, { p: [x, y - 0.1, 0] });
  return b.build();
}

/** Stepped pyramid (base edge `w`, height `h`). */
export function pyramid(w = 100, h = 65, steps = 12) {
  const b = new PartsBuilder();
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    const s = w * (1 - t);
    const sh = h / steps;
    b.add(new THREE.BoxGeometry(s, sh, s), (p, n, out) => lerpColor(0xc99a5c, 0xf0cf94, 0.45 + n.y * 0.3 + (i % 2) * 0.1, out), { p: [0, sh * i + sh / 2, 0] });
  }
  return b.build();
}

/**
 * Natural rock arch spanning `span` metres, `height` tall; legs at x = +-span/2,
 * arch in the local XY plane (thickness along Z).
 */
export function rockArch(span = 54, height = 22, seed = 3) {
  const segs = 28;
  const ring = 10;
  const pos = [];
  const idx = [];
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = Math.PI * (1 - t);
    pts.push(new THREE.Vector3(Math.cos(a) * span * 0.5, Math.sin(a) * height, 0));
  }
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const c = pts[i];
    const tan = pts[Math.min(segs, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    const nrm = new THREE.Vector3(-tan.y, tan.x, 0); // in-plane normal
    const bin = new THREE.Vector3(0, 0, 1);
    const r = 3.0 + 3.2 * Math.pow(1 - Math.sin(Math.PI * t), 1.5);
    for (let j = 0; j < ring; j++) {
      const a = (j / ring) * Math.PI * 2;
      const k = 1 + n3(c.x * 0.2 + j, c.y * 0.2, seed) * 0.35;
      const p = c.clone().addScaledVector(nrm, Math.cos(a) * r * k).addScaledVector(bin, Math.sin(a) * r * 1.3 * k);
      pos.push(p.x, p.y, p.z);
    }
  }
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j;
      const b2 = i * ring + ((j + 1) % ring);
      const c = (i + 1) * ring + j;
      const d = (i + 1) * ring + ((j + 1) % ring);
      idx.push(a, c, b2, b2, c, d);
    }
  }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g = g.toNonIndexed();
  g.computeVertexNormals();
  // legs extend below ground
  const b = new PartsBuilder();
  b.add(g, 0xffffff);
  for (const sx of [-1, 1]) b.add(new THREE.CylinderGeometry(5.5, 7.5, 8, 9), 0xffffff, { p: [sx * span * 0.5, -3, 0] }, { jitter: 0.2 });
  return b.build();
}

export function tumbleweed(seed = 1) {
  const rng = createRng(seed);
  const b = new PartsBuilder();
  for (let i = 0; i < 14; i++) {
    b.add(new THREE.TorusGeometry(0.5 + rng() * 0.2, 0.025, 3, 10), 0xa98a5a, { r: [rng() * 6, rng() * 6, rng() * 6] });
  }
  return b.build();
}

export function snowman() {
  const b = new PartsBuilder();
  b.add(new THREE.SphereGeometry(1.0, 14, 10), 0xf4f7ff, { p: [0, 0.9, 0] }, { flat: false });
  b.add(new THREE.SphereGeometry(0.72, 14, 10), 0xf4f7ff, { p: [0, 2.2, 0] }, { flat: false });
  b.add(new THREE.SphereGeometry(0.5, 14, 10), 0xf4f7ff, { p: [0, 3.2, 0] }, { flat: false });
  b.add(new THREE.ConeGeometry(0.1, 0.55, 8), 0xff7a1a, { p: [0, 3.2, 0.7], r: [Math.PI / 2, 0, 0] });
  b.add(new THREE.CylinderGeometry(0.42, 0.42, 0.55, 12), 0x22222a, { p: [0, 3.75, 0] });
  b.add(new THREE.CylinderGeometry(0.6, 0.6, 0.06, 12), 0x22222a, { p: [0, 3.5, 0] });
  b.add(new THREE.TorusGeometry(0.62, 0.12, 6, 14), 0xd8272a, { p: [0, 2.75, 0], r: [Math.PI / 2, 0, 0] });
  return b.build();
}

export function lampPost(h = 5, color = 0xffd27a) {
  const b = new PartsBuilder();
  b.add(new THREE.CylinderGeometry(0.09, 0.13, h, 6), 0x2a2a30, { p: [0, h / 2, 0] });
  b.add(new THREE.BoxGeometry(0.6, 0.12, 0.6), 0x2a2a30, { p: [0, h + 0.05, 0] });
  b.add(new THREE.SphereGeometry(0.28, 10, 8), color, { p: [0, h - 0.25, 0] });
  return b.build();
}
