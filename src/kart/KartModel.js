import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  getFallbackEnvMap,
  getTreadTextures,
  getPlateTexture,
  getWingTexture,
  getEmblemTexture,
  getLiveryTexture,
} from './textures.js';

/**
 * Procedural kart + chibi driver models.
 *
 * Local space: kart faces +Z, +Y up, ground contact at y = 0, the kart's LEFT side is +X.
 *
 * Hierarchy (names are used by Kart.updateVisuals):
 *   root
 *    └ visual                (spin-out / tumble / drift yaw / shrink scale / squash)
 *       ├ bodyPivot (y=.25)  (suspension bob, roll, pitch)
 *       │  └ bodyOffset (y=-.25)
 *       │     ├ chassis meshes, anchors (exhaustL/R, itemHold, body)
 *       │     ├ steerWheel → steerWheelSpin
 *       │     └ driver → torso meshes, head → (eyes, earL, earR, antenna), armL, armR, tail, flag
 *       ├ wheel_FL → steer_FL → spin_FL     (and FR, RL, RR)
 *       └ anchor_wheelFL ... (ground contact points, non rotating)
 *
 * Geometry is merged per material per rigid sub-assembly and cached per character; every
 * instance gets its own material clones (star shimmer, ghost flicker are per-kart).
 */

const PI = Math.PI;
const TAU = PI * 2;

// --------------------------------------------------------------------------------------------
// geometry helpers
// --------------------------------------------------------------------------------------------

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

/** Matrix from position, YXZ euler rotation (yaw, then pitch, then roll) and scale. */
function M(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

/** Matrix that places a +Y-aligned primitive between points a and b. */
function between(a, b, sx = 1, sz = sx) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  dir.normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  return { m: new THREE.Matrix4().compose(mid, q, new THREE.Vector3(sx, 1, sz)), len };
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const GEO = {
  sph: new THREE.SphereGeometry(1, 26, 16),
  sphMd: new THREE.SphereGeometry(1, 16, 12),
  sphLo: new THREE.SphereGeometry(1, 10, 8),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 24, 1),
  cylLo: new THREE.CylinderGeometry(1, 1, 1, 12, 1),
  cone: new THREE.ConeGeometry(1, 1, 20, 1),
  coneLo: new THREE.ConeGeometry(1, 1, 10, 1),
  plane: new THREE.PlaneGeometry(1, 1),
};
const _rbCache = new Map();
function rbox(w, h, d, r = 0.04, seg = 2) {
  const k = [w, h, d, r, seg].map((v) => v.toFixed(3)).join(',');
  if (!_rbCache.has(k)) _rbCache.set(k, new RoundedBoxGeometry(w, h, d, seg, r));
  return _rbCache.get(k);
}
function capsule(r, len) {
  return new THREE.CapsuleGeometry(r, Math.max(0.001, len), 4, 12);
}
function torus(R, tube, arc = TAU, radial = 8, tubular = 32) {
  return new THREE.TorusGeometry(R, tube, radial, tubular, arc);
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

/**
 * Smooth hull lofted along +Z through superellipse sections
 * { z, x=0, y, w (half width), ht (half height above y), hb (below), n (squareness, 2=ellipse) }.
 * UV: u = arc length around (0 = bottom, .25 = +X side, .5 = top), v = (z - zMin) / length.
 */
function loft(sections, { radial = 28, sub = 5, caps = true } = {}) {
  const keys = ['z', 'x', 'y', 'w', 'ht', 'hb', 'n'];
  const S = sections.map((s) => ({ x: 0, n: 3, ...s }));
  const rings = [];
  for (let i = 0; i < S.length - 1; i++) {
    const p0 = S[Math.max(0, i - 1)];
    const p1 = S[i];
    const p2 = S[i + 1];
    const p3 = S[Math.min(S.length - 1, i + 2)];
    for (let k = 0; k < sub; k++) {
      const t = k / sub;
      const r = {};
      for (const key of keys) r[key] = catmull(p0[key], p1[key], p2[key], p3[key], t);
      if (key0(r)) rings.push(r);
    }
  }
  rings.push({ ...S[S.length - 1] });
  function key0(r) {
    r.w = Math.max(0.002, r.w);
    r.ht = Math.max(0.002, r.ht);
    r.hb = Math.max(0.002, r.hb);
    r.n = Math.max(1.6, r.n);
    return true;
  }
  const zMin = rings[0].z;
  const zMax = rings[rings.length - 1].z;
  const pos = [];
  const uv = [];
  const idx = [];
  const ringPts = [];
  for (let s = 0; s < rings.length; s++) {
    const R = rings[s];
    const pts = [];
    const e = 2 / R.n;
    for (let i = 0; i <= radial; i++) {
      const t = -PI / 2 + (i / radial) * TAU;
      const c = Math.cos(t);
      const sn = Math.sin(t);
      const px = R.x + R.w * Math.sign(c) * Math.pow(Math.abs(c), e);
      const py = R.y + (sn > 0 ? R.ht : R.hb) * Math.sign(sn) * Math.pow(Math.abs(sn), e);
      pts.push([px, py, R.z]);
    }
    // arc-length u
    let total = 0;
    const acc = [0];
    for (let i = 1; i <= radial; i++) {
      total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      acc.push(total);
    }
    for (let i = 0; i <= radial; i++) {
      pos.push(pts[i][0], pts[i][1], pts[i][2]);
      uv.push(total > 0 ? acc[i] / total : i / radial, (R.z - zMin) / Math.max(1e-6, zMax - zMin));
    }
    ringPts.push(pts);
  }
  const RW = radial + 1;
  for (let s = 0; s < rings.length - 1; s++) {
    for (let i = 0; i < radial; i++) {
      const a = s * RW + i;
      const b = a + 1;
      const d = a + RW;
      const c = d + 1;
      idx.push(a, b, d, b, c, d);
    }
  }
  const sideCount = pos.length / 3;
  if (caps) {
    for (const end of [0, rings.length - 1]) {
      const R = rings[end];
      const base = pos.length / 3;
      pos.push(R.x, R.y, R.z);
      uv.push(0.5, end === 0 ? 0 : 1);
      for (let i = 0; i <= radial; i++) {
        const p = ringPts[end][i];
        pos.push(p[0], p[1], p[2]);
        uv.push(0.5, end === 0 ? 0 : 1);
      }
      for (let i = 0; i < radial; i++) {
        if (end === 0) idx.push(base, base + 2 + i, base + 1 + i);
        else idx.push(base, base + 1 + i, base + 2 + i);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // weld seam normals
  const n = g.attributes.normal;
  for (let s = 0; s < rings.length; s++) {
    const a = s * RW;
    const b = a + radial;
    const nx = n.getX(a) + n.getX(b);
    const ny = n.getY(a) + n.getY(b);
    const nz = n.getZ(a) + n.getZ(b);
    const l = Math.hypot(nx, ny, nz) || 1;
    n.setXYZ(a, nx / l, ny / l, nz / l);
    n.setXYZ(b, nx / l, ny / l, nz / l);
  }
  void sideCount;
  return g;
}

/** Tapered tube along a Catmull-Rom curve through `points`; radius(t) for t in [t0, t1]. */
function taperTube(points, radius, { segs = 28, radial = 16, t0 = 0, t1 = 1, flatten = 1 } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, false, 'centripetal');
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const P = new THREE.Vector3();
  const N = new THREE.Vector3();
  const B = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const tt = i / segs;
    const t = Math.min(1, Math.max(0, t0 + (t1 - t0) * tt));
    curve.getPointAt(t, P);
    const fi = Math.round(t * segs);
    N.copy(frames.normals[fi]);
    B.copy(frames.binormals[fi]);
    const r = radius(t);
    for (let j = 0; j <= radial; j++) {
      const v = (j / radial) * TAU;
      const sin = Math.sin(v);
      const cos = -Math.cos(v);
      const nx = cos * N.x + sin * B.x * flatten;
      const ny = cos * N.y + sin * B.y * flatten;
      const nz = cos * N.z + sin * B.z * flatten;
      pos.push(P.x + r * nx, P.y + r * ny, P.z + r * nz);
      const l = Math.hypot(nx, ny, nz) || 1;
      nor.push(nx / l, ny / l, nz / l);
      uv.push(tt, j / radial);
    }
  }
  for (let j = 1; j <= segs; j++) {
    for (let i = 1; i <= radial; i++) {
      const a = (radial + 1) * (j - 1) + (i - 1);
      const b = (radial + 1) * j + (i - 1);
      const c = (radial + 1) * j + i;
      const d = (radial + 1) * (j - 1) + i;
      idx.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function tube(points, r, { segs = 32, radial = 10, closed = false } = {}) {
  const curve = new THREE.CatmullRomCurve3(points, closed, 'centripetal');
  return new THREE.TubeGeometry(curve, segs, r, radial, closed);
}

/** Chunky tyre with rounded shoulders; axis = X. */
function tyreGeometry(r, w, ri) {
  const pts = [];
  const rs = Math.min(w * 0.32, r * 0.26);
  pts.push(new THREE.Vector2(ri, -w / 2));
  pts.push(new THREE.Vector2(r - rs, -w / 2));
  for (let i = 1; i <= 6; i++) {
    const a = -PI / 2 + (i / 6) * (PI / 2);
    pts.push(new THREE.Vector2(r - rs + Math.cos(a) * rs, -w / 2 + rs + Math.sin(a) * rs));
  }
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (PI / 2);
    pts.push(new THREE.Vector2(r - rs + Math.cos(a) * rs, w / 2 - rs + Math.sin(a) * rs));
  }
  pts.push(new THREE.Vector2(ri, w / 2));
  const g = new THREE.LatheGeometry(pts, 36);
  g.rotateZ(-PI / 2);
  return g;
}

/** Collects geometry per material key (with a transform stack) and emits merged meshes. */
class Parts {
  constructor() {
    this.buckets = new Map();
    this.stack = [new THREE.Matrix4()];
  }
  push(m) {
    this.stack.push(this.stack[this.stack.length - 1].clone().multiply(m));
    return this;
  }
  pop() {
    this.stack.pop();
    return this;
  }
  add(key, geo, m) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const top = this.stack[this.stack.length - 1];
    g.applyMatrix4(m ? top.clone().multiply(m) : top);
    for (const k of Object.keys(g.attributes)) {
      if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    }
    if (!g.attributes.uv) {
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    if (!g.attributes.normal) g.computeVertexNormals();
    g.morphAttributes = {};
    g.clearGroups();
    if (!this.buckets.has(key)) this.buckets.set(key, []);
    this.buckets.get(key).push(g);
    return this;
  }
  /** ellipsoid */
  ell(key, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0, lo = false) {
    const size = Math.max(sx, sy, sz);
    const geo = lo || size < 0.05 ? GEO.sphLo : size < 0.16 ? GEO.sphMd : GEO.sph;
    return this.add(key, geo, M(x, y, z, rx, ry, rz, sx, sy, sz));
  }
  cyl(key, a, b, r, lo = false) {
    const { m, len } = between(a, b, r);
    m.multiply(new THREE.Matrix4().makeScale(1, len, 1));
    return this.add(key, lo ? GEO.cylLo : GEO.cyl, m);
  }
  cap(key, a, b, r) {
    const { m, len } = between(a, b);
    return this.add(key, capsule(r, len), m);
  }
  /** cone with base at `a`, tip at `b` */
  cone(key, a, b, r, flat = 1, lo = false) {
    const { m, len } = between(a, b, 1, flat);
    m.multiply(new THREE.Matrix4().makeScale(r, len, r));
    return this.add(key, lo ? GEO.coneLo : GEO.cone, m);
  }
  /** translate everything collected so far */
  offset(x, y, z) {
    for (const list of this.buckets.values()) for (const g of list) g.translate(x, y, z);
    return this;
  }
  build(mats, parent, { cast = true, receive = false } = {}) {
    for (const [key, list] of this.buckets) {
      const geo = list.length === 1 ? list[0] : mergeGeometries(list, false);
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, mats.get(key));
      // tiny parts do not need to be in the shadow pass
      mesh.castShadow = cast && geo.boundingSphere.radius > 0.09;
      mesh.receiveShadow = receive;
      mesh.name = 'm_' + key;
      parent.add(mesh);
    }
    this.buckets.clear();
    return parent;
  }
}

// --------------------------------------------------------------------------------------------
// materials
// --------------------------------------------------------------------------------------------

const SPECIES_FUR = {
  fox: { fur2: 0xfff6ea, fur3: 0x231612, fur4: 0xffd3a8 },
  bunny: { fur2: 0xffffff, fur3: 0xff8db4, fur4: 0xffd6e8 },
  penguin: { fur2: 0xfbfdff, fur3: 0x0d111c, fur4: 0xffa21a },
  redpanda: { fur2: 0xfff4e4, fur3: 0x2e140c, fur4: 0xe7975a },
  human: { fur2: 0xffffff, fur3: 0x6b3b1c, fur4: 0xffffff },
  robot: { fur2: 0xe7edf4, fur3: 0x262c36, fur4: 0xffffff },
  dino: { fur2: 0xf6eab4, fur3: 0x2e6b29, fur4: 0xffffff },
  bulldog: { fur2: 0xf7e6cf, fur3: 0x5d3a26, fur4: 0xffffff },
};

const LIVERY = {
  ember: 'stripes',
  jett: 'stripes',
  mochi: 'dots',
  pebble: 'waves',
  maple: 'leaves',
  torque: 'circuit',
  rumble: 'flames',
  bruno: 'checker',
};

class MatLib {
  constructor(ch) {
    this.ch = ch;
    this.map = new Map();
    this.fur = SPECIES_FUR[ch.species] || SPECIES_FUR.fox;
  }
  get(key) {
    if (!this.map.has(key)) {
      const m = this._create(key);
      m.name = key;
      this.map.set(key, m);
    }
    return this.map.get(key);
  }
  _paint(color, extra = {}) {
    return new THREE.MeshPhysicalMaterial({
      color,
      metalness: 0.12,
      roughness: 0.34,
      clearcoat: 1,
      clearcoatRoughness: 0.07,
      ...extra,
    });
  }
  _fur(color, sheen = 0.7) {
    const c = new THREE.Color(color);
    return new THREE.MeshPhysicalMaterial({
      color: c,
      roughness: 0.72,
      metalness: 0,
      sheen,
      sheenRoughness: 0.45,
      sheenColor: c.clone().lerp(new THREE.Color(0xffffff), 0.55),
    });
  }
  _create(key) {
    const ch = this.ch;
    const C = ch.colors;
    if (key.startsWith('#')) {
      return new THREE.MeshStandardMaterial({ color: parseInt(key.slice(1), 16), roughness: 0.5, metalness: 0.05 });
    }
    switch (key) {
      case 'livery': {
        const map = getLiveryTexture(ch, LIVERY[ch.id] || 'stripes', 0.62);
        return this._paint(map ? 0xffffff : C.primary, { map });
      }
      case 'paint':
        return this._paint(C.primary);
      case 'paint2':
        return this._paint(C.secondary);
      case 'accent':
        return this._paint(C.accent);
      case 'trim':
        return new THREE.MeshStandardMaterial({ color: 0x2a2d35, roughness: 0.5, metalness: 0.4 });
      case 'dark':
        return new THREE.MeshStandardMaterial({ color: 0x141519, roughness: 0.75, metalness: 0.1 });
      case 'chrome':
        return new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 0.13, metalness: 1 });
      case 'gunmetal':
        return new THREE.MeshStandardMaterial({ color: 0x8a909c, roughness: 0.3, metalness: 0.9 });
      case 'heat':
        return new THREE.MeshStandardMaterial({ color: 0x7a5a8a, roughness: 0.25, metalness: 1 });
      case 'rubber':
      case 'rubberK': {
        const t = getTreadTextures(key === 'rubberK');
        const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0 });
        if (t) {
          m.map = t.map.clone();
          m.map.repeat.set(2, 1);
          m.map.needsUpdate = true;
          m.bumpMap = t.bumpMap.clone();
          m.bumpMap.repeat.set(2, 1);
          m.bumpMap.needsUpdate = true;
          m.bumpScale = 3;
        } else m.color.set(0x26262b);
        return m;
      }
      case 'sidewall':
        return new THREE.MeshStandardMaterial({ color: 0x242428, roughness: 0.8 });
      case 'seat': {
        const c = new THREE.Color(C.secondary).lerp(new THREE.Color(0x15161c), 0.55);
        return new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.55, sheen: 0.4, sheenColor: 0x888888 });
      }
      case 'glass':
        return new THREE.MeshPhysicalMaterial({
          color: 0x0b1018,
          roughness: 0.04,
          metalness: 0.4,
          clearcoat: 1,
          clearcoatRoughness: 0.02,
        });
      case 'lens':
        return new THREE.MeshPhysicalMaterial({
          color: new THREE.Color(C.accent).multiplyScalar(0.55),
          roughness: 0.05,
          metalness: 0.7,
          clearcoat: 1,
          emissive: C.accent,
          emissiveIntensity: 0.12,
        });
      case 'lightW':
        return new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff1cc, emissiveIntensity: 2.2, roughness: 0.2 });
      case 'lightR':
        return new THREE.MeshStandardMaterial({ color: 0xff3040, emissive: 0xff1428, emissiveIntensity: 2.0, roughness: 0.3 });
      case 'glow':
        return new THREE.MeshStandardMaterial({ color: C.accent, emissive: C.accent, emissiveIntensity: 2.4, roughness: 0.3 });
      case 'glowEye':
        return new THREE.MeshStandardMaterial({ color: ch.eyeColor, emissive: ch.eyeColor, emissiveIntensity: 3.2, roughness: 0.2 });
      case 'plate': {
        const map = getPlateTexture(ch);
        return new THREE.MeshStandardMaterial({ color: map ? 0xffffff : 0xf3f3ea, map, roughness: 0.45, metalness: 0.1 });
      }
      case 'wingDecal': {
        const map = getWingTexture(ch);
        return new THREE.MeshPhysicalMaterial({
          color: map ? 0xffffff : C.secondary,
          map,
          roughness: 0.35,
          clearcoat: 1,
          clearcoatRoughness: 0.08,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        });
      }
      case 'emblem': {
        const map = getEmblemTexture(ch);
        return new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map,
          transparent: false,
          alphaTest: 0.5,
          roughness: 0.4,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        });
      }
      case 'fur':
        return this._fur(C.skin);
      case 'fur2':
        return this._fur(this.fur.fur2, 0.5);
      case 'fur3':
        return this._fur(this.fur.fur3, 0.4);
      case 'fur4':
        return this._fur(this.fur.fur4, 0.5);
      case 'skin':
        return new THREE.MeshPhysicalMaterial({ color: C.skin, roughness: 0.55, sheen: 0.3, sheenColor: 0xffd0c0 });
      case 'metalSkin':
        return new THREE.MeshPhysicalMaterial({
          color: C.skin,
          roughness: 0.26,
          metalness: 0.75,
          clearcoat: 0.6,
          clearcoatRoughness: 0.15,
        });
      case 'suit':
        return new THREE.MeshPhysicalMaterial({
          color: ch.suitColor,
          roughness: 0.62,
          sheen: 0.6,
          sheenRoughness: 0.5,
          sheenColor: new THREE.Color(ch.suitColor).lerp(new THREE.Color(0xffffff), 0.5),
        });
      case 'glove':
        return new THREE.MeshStandardMaterial({ color: ch.gloveColor, roughness: 0.48, metalness: 0.02 });
      case 'eyeWhite':
        return new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 });
      case 'iris':
        return new THREE.MeshPhysicalMaterial({ color: ch.eyeColor, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03 });
      case 'pupil':
        return new THREE.MeshStandardMaterial({ color: 0x07070a, roughness: 0.1 });
      case 'hilite':
        return new THREE.MeshBasicMaterial({ color: 0xffffff });
      case 'mouth':
        return new THREE.MeshStandardMaterial({ color: 0x4a1220, roughness: 0.6 });
      case 'tongue':
        return new THREE.MeshStandardMaterial({ color: 0xff6f8e, roughness: 0.5 });
      case 'teeth':
        return new THREE.MeshPhysicalMaterial({ color: 0xfffcf2, roughness: 0.25, clearcoat: 0.6 });
      case 'blush':
        return new THREE.MeshStandardMaterial({ color: 0xff8aa6, roughness: 0.8 });
      case 'nose':
        return new THREE.MeshPhysicalMaterial({ color: 0x1a1214, roughness: 0.2, clearcoat: 1 });
      case 'hair':
        return this._fur(0x6b3b1c, 0.4);
      case 'leaf':
        return new THREE.MeshStandardMaterial({ color: 0x5cc24a, roughness: 0.5 });
      case 'beak':
        return new THREE.MeshPhysicalMaterial({ color: 0xffa21a, roughness: 0.35, clearcoat: 0.6 });
      case 'knit':
        return this._fur(C.accent, 0.9);
      case 'knit2':
        return this._fur(0xffffff, 0.9);
      default:
        return new THREE.MeshStandardMaterial({ color: 0xff00ff });
    }
  }
}

// --------------------------------------------------------------------------------------------
// kart parts
// --------------------------------------------------------------------------------------------

const STYLE = {
  racer: {
    wf: { r: 0.27, w: 0.24, x: 0.71, z: 0.8 },
    wr: { r: 0.33, w: 0.32, x: 0.75, z: -0.72 },
    seatZ: -0.3,
    hipY: 0.36,
    sw: V(0, 0.62, 0.24),
  },
  bubble: {
    wf: { r: 0.25, w: 0.22, x: 0.67, z: 0.68 },
    wr: { r: 0.28, w: 0.26, x: 0.69, z: -0.62 },
    seatZ: -0.24,
    hipY: 0.38,
    sw: V(0, 0.64, 0.24),
  },
  buggy: {
    wf: { r: 0.33, w: 0.28, x: 0.79, z: 0.82 },
    wr: { r: 0.37, w: 0.33, x: 0.81, z: -0.74 },
    seatZ: -0.22,
    hipY: 0.44,
    sw: V(0, 0.72, 0.28),
    knobby: true,
  },
  muscle: {
    wf: { r: 0.3, w: 0.27, x: 0.8, z: 0.86 },
    wr: { r: 0.42, w: 0.42, x: 0.87, z: -0.76 },
    seatZ: -0.3,
    hipY: 0.4,
    sw: V(0, 0.66, 0.22),
  },
  mech: {
    wf: { r: 0.3, w: 0.28, x: 0.79, z: 0.84 },
    wr: { r: 0.36, w: 0.36, x: 0.83, z: -0.74 },
    seatZ: -0.3,
    hipY: 0.4,
    sw: V(0, 0.66, 0.22),
  },
};

function addSeat(P, st, color = 'seat') {
  const z = st.seatZ - 0.24;
  P.add(color, rbox(0.5, 0.56, 0.12, 0.05), M(0, st.hipY + 0.2, z, -0.2));
  P.add(color, rbox(0.46, 0.1, 0.36, 0.04), M(0, st.hipY - 0.02, st.seatZ - 0.05));
  P.add('trim', rbox(0.5, 0.04, 0.13, 0.015), M(0, st.hipY + 0.49, z - 0.05, -0.2));
}

function addSteering(rig, mats, st) {
  const grp = new THREE.Group();
  grp.name = 'steerWheel';
  grp.position.copy(st.sw);
  grp.rotation.set(-2.45, 0, 0, 'YXZ');
  const spin = new THREE.Group();
  spin.name = 'steerWheelSpin';
  grp.add(spin);
  const P = new Parts();
  P.add('dark', torus(0.145, 0.026, TAU, 10, 36));
  for (let i = 0; i < 3; i++) {
    const a = -PI / 2 + i * (TAU / 3);
    P.cyl('chrome', V(0, 0, 0), V(Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0), 0.013, true);
  }
  P.add('paint', GEO.cyl, M(0, 0, 0.0, PI / 2, 0, 0, 0.045, 0.04, 0.045));
  P.add('accent', GEO.sphLo, M(0, 0, 0.02, 0, 0, 0, 0.03, 0.03, 0.015));
  P.build(mats, spin);
  // column (static)
  const C = new Parts();
  C.cyl('trim', V(0, 0, -0.02), V(0, 0, -0.32), 0.022, true);
  C.build(mats, grp);
  return grp;
}

/** Grip point on the steering wheel rim in kart space (side +1 = left hand). */
function gripPoint(st, side) {
  const m = M(st.sw.x, st.sw.y, st.sw.z, -2.45, 0, 0);
  return V(side * 0.12, 0.075, 0).applyMatrix4(m);
}

function buildWheel(mats, spec, side, front, style, ch) {
  const outer = new THREE.Group();
  outer.position.set(side * spec.x, spec.r, spec.z);
  const steer = new THREE.Group();
  const spin = new THREE.Group();
  outer.add(steer);
  steer.add(spin);
  const tag = (front ? 'F' : 'R') + (side > 0 ? 'L' : 'R');
  outer.name = 'wheel_' + tag;
  steer.name = 'steer_' + tag;
  spin.name = 'spin_' + tag;

  const r = spec.r;
  const w = spec.w;
  const ri = r * 0.6;
  const P = new Parts();
  // outer face toward +X for left wheels; rotate PI for right wheels
  P.push(M(0, 0, 0, 0, side > 0 ? 0 : PI, 0));
  P.add(style.knobby ? 'rubberK' : 'rubber', tyreGeometry(r, w, ri));
  // rim barrel + dish
  P.add('rimDish', GEO.cyl, M(w * 0.1, 0, 0, 0, 0, PI / 2, ri * 0.98, w * 0.7, ri * 0.98));
  P.add('chrome', torus(ri * 0.94, ri * 0.09, TAU, 10, 36), M(w * 0.44, 0, 0, 0, PI / 2, 0));
  const spokes = ch.kartStyle === 'mech' ? 6 : ch.kartStyle === 'buggy' ? 8 : 5;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU;
    P.add(
      'chrome',
      rbox(0.035, ri * 0.82, 0.05, 0.012, 1),
      M(w * 0.47, Math.cos(a) * ri * 0.45, Math.sin(a) * ri * 0.45, a, 0, 0),
    );
  }
  P.add('hub', GEO.sphMd, M(w * 0.5, 0, 0, 0, 0, 0, 0.035, ri * 0.32, ri * 0.32));
  P.add('chrome', GEO.sphLo, M(w * 0.53, 0, 0, 0, 0, 0, 0.02, ri * 0.1, ri * 0.1));
  P.pop();
  P.build(mats, spin);

  // brake caliper (does not spin)
  const B = new Parts();
  B.add('accent', rbox(0.07, ri * 0.55, ri * 0.4, 0.02, 2), M(side * (w * 0.2), ri * 0.55, -ri * 0.2, 0.5, 0, 0));
  B.build(mats, steer);
  return outer;
}

function addExhaust(P, rig, base, dir, r, len, name, key = 'chrome') {
  const tip = base.clone().addScaledVector(dir, len);
  P.cyl(key, base, tip, r);
  P.cyl('heat', tip.clone().addScaledVector(dir, -0.06), tip.clone().addScaledVector(dir, 0.012), r * 1.18);
  P.cyl('dark', tip.clone().addScaledVector(dir, -0.02), tip.clone().addScaledVector(dir, 0.016), r * 0.82, true);
  const a = new THREE.Object3D();
  a.name = name;
  a.position.copy(tip);
  a.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
  rig.anchorList.push(a);
}

function addWing(P, y, z, width, depth, opts = {}) {
  const tilt = opts.tilt ?? -0.1;
  P.add(opts.key || 'paint2', rbox(width, 0.055, depth, 0.025), M(0, y, z, tilt));
  // name decal on top
  P.add('wingDecal', GEO.plane, M(0, y + 0.029 * Math.cos(tilt), z + 0.029 * Math.sin(tilt), -PI / 2 + tilt, 0, PI, width * 0.86, depth * 0.78, 1));
  for (const s of [-1, 1]) {
    P.add(opts.plateKey || 'paint', rbox(0.04, 0.2, depth * 1.2, 0.018), M(s * (width / 2 + 0.01), y - 0.03, z - 0.01));
    P.cyl('trim', V(s * width * 0.22, y - 0.02, z + 0.02), V(s * width * 0.2, opts.strutBase ?? 0.5, z + 0.18), 0.022, true);
  }
}

function addTailLights(P, xs, y, z, size = 0.07) {
  for (const x of xs) {
    P.add('lightR', rbox(size * 1.6, size, 0.04, 0.015, 2), M(x, y, z));
    P.add('trim', rbox(size * 1.6 + 0.03, size + 0.03, 0.03, 0.015, 2), M(x, y, z + 0.012));
  }
}

function addRearPlate(P, y, z, w = 0.34) {
  P.add('trim', rbox(w + 0.04, w * 0.5 + 0.04, 0.03, 0.015, 2), M(0, y, z + 0.012));
  P.add('plate', GEO.plane, M(0, y, z - 0.004, 0, PI, 0, w, w * 0.5, 1));
}

function addSuspension(P, st, tubW) {
  for (const s of [-1, 1]) {
    const f = st.wf;
    const r = st.wr;
    P.cyl('trim', V(s * tubW.f, f.r + 0.04, f.z), V(s * (f.x - f.w * 0.3), f.r, f.z), 0.026, true);
    P.cyl('trim', V(s * tubW.f, f.r - 0.07, f.z + 0.06), V(s * (f.x - f.w * 0.3), f.r - 0.03, f.z), 0.02, true);
    P.cyl('gunmetal', V(s * tubW.r, r.r, r.z), V(s * (r.x - r.w * 0.3), r.r, r.z), 0.035, true);
  }
}

function addFloor(P, len, width, z = 0) {
  P.add('trim', rbox(width, 0.07, len, 0.03), M(0, 0.15, z));
}

function addHeadlight(P, x, y, z, r, tilt = 0) {
  P.add('chrome', torus(r, r * 0.22, TAU, 8, 24), M(x, y, z, tilt));
  P.add('lightW', GEO.sphLo, M(x, y, z - 0.01, tilt, 0, 0, r * 0.92, r * 0.92, r * 0.45));
}

// ---- body styles --------------------------------------------------------------------------

function bodyRacer(P, rig, st, ch) {
  P.add(
    'livery',
    loft([
      { z: -1.05, y: 0.37, w: 0.3, ht: 0.11, hb: 0.13, n: 3.2 },
      { z: -1.0, y: 0.37, w: 0.42, ht: 0.15, hb: 0.17, n: 3.4 },
      { z: -0.7, y: 0.37, w: 0.47, ht: 0.17, hb: 0.18, n: 3.4 },
      { z: -0.32, y: 0.35, w: 0.49, ht: 0.12, hb: 0.17, n: 3.4 },
      { z: 0.06, y: 0.35, w: 0.46, ht: 0.12, hb: 0.17, n: 3.2 },
      { z: 0.4, y: 0.37, w: 0.4, ht: 0.17, hb: 0.17, n: 3 },
      { z: 0.8, y: 0.31, w: 0.27, ht: 0.11, hb: 0.13, n: 2.8 },
      { z: 1.16, y: 0.25, w: 0.17, ht: 0.065, hb: 0.08, n: 2.6 },
      { z: 1.31, y: 0.235, w: 0.06, ht: 0.025, hb: 0.03, n: 2.4 },
    ]),
  );
  // side pods with intakes
  for (const s of [-1, 1]) {
    P.add(
      'paint2',
      loft([
        { z: -0.44, x: s * 0.5, y: 0.28, w: 0.03, ht: 0.03, hb: 0.03 },
        { z: -0.38, x: s * 0.52, y: 0.28, w: 0.12, ht: 0.1, hb: 0.09, n: 3 },
        { z: 0.05, x: s * 0.54, y: 0.28, w: 0.14, ht: 0.11, hb: 0.1, n: 3.2 },
        { z: 0.34, x: s * 0.52, y: 0.27, w: 0.13, ht: 0.1, hb: 0.09, n: 3 },
        { z: 0.38, x: s * 0.52, y: 0.27, w: 0.1, ht: 0.07, hb: 0.07, n: 3 },
      ]),
    );
    P.add('dark', GEO.sph, M(s * 0.52, 0.275, 0.375, 0, 0, 0, 0.09, 0.065, 0.02));
    P.add('accent', rbox(0.02, 0.04, 0.62, 0.01, 2), M(s * 0.665, 0.29, -0.03));
  }
  // front wing
  P.add('paint2', rbox(1.44, 0.05, 0.26, 0.022), M(0, 0.13, 1.17, 0.06));
  for (const s of [-1, 1]) P.add('paint', rbox(0.04, 0.14, 0.32, 0.018), M(s * 0.72, 0.17, 1.17));
  P.cyl('trim', V(0.12, 0.15, 1.15), V(0.12, 0.23, 1.12), 0.018, true);
  P.cyl('trim', V(-0.12, 0.15, 1.15), V(-0.12, 0.23, 1.12), 0.018, true);
  // rear deck: intake trumpets
  for (let i = 0; i < 4; i++) {
    const x = -0.15 + i * 0.1;
    P.cyl('chrome', V(x, 0.5, -0.8), V(x, 0.6, -0.8), 0.035, true);
    P.cyl('dark', V(x, 0.59, -0.8), V(x, 0.605, -0.8), 0.026, true);
  }
  P.add('gunmetal', rbox(0.46, 0.06, 0.2, 0.02), M(0, 0.51, -0.8));
  addWing(P, 0.86, -1.0, 1.28, 0.3, { strutBase: 0.48 });
  addTailLights(P, [-0.22, 0.22], 0.36, -1.065);
  addRearPlate(P, 0.36, -1.06, 0.26);
  addSuspension(P, st, { f: 0.2, r: 0.42 });
  addFloor(P, 2.1, 0.9, 0.05);
  addExhaust(P, rig, V(0.22, 0.45, -0.95), V(0, 0.42, -1).normalize(), 0.055, 0.26, 'exhaustL');
  addExhaust(P, rig, V(-0.22, 0.45, -0.95), V(0, 0.42, -1).normalize(), 0.055, 0.26, 'exhaustR');
}

function bodyBubble(P, rig, st, ch) {
  P.add(
    'livery',
    loft([
      { z: -0.9, y: 0.44, w: 0.28, ht: 0.15, hb: 0.16, n: 2.6 },
      { z: -0.84, y: 0.44, w: 0.44, ht: 0.22, hb: 0.23, n: 2.8 },
      { z: -0.56, y: 0.44, w: 0.52, ht: 0.27, hb: 0.25, n: 2.9 },
      { z: -0.2, y: 0.42, w: 0.53, ht: 0.17, hb: 0.24, n: 2.9 },
      { z: 0.22, y: 0.43, w: 0.52, ht: 0.22, hb: 0.25, n: 2.9 },
      { z: 0.62, y: 0.41, w: 0.46, ht: 0.2, hb: 0.23, n: 2.8 },
      { z: 0.92, y: 0.37, w: 0.32, ht: 0.13, hb: 0.17, n: 2.6 },
      { z: 1.02, y: 0.36, w: 0.12, ht: 0.05, hb: 0.06, n: 2.4 },
    ]),
  );
  // soft bumpers front & back (bumper-car style)
  const bump = (z, dir) => {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const a = -PI / 2 + (i / 8) * PI;
      pts.push(V(Math.sin(a) * 0.5, 0.24, z + dir * Math.cos(a) * 0.16));
    }
    P.add('paint2', tube(pts, 0.065, { segs: 24, radial: 12 }));
  };
  bump(0.88, 1);
  bump(-0.86, -1);
  // cute round headlights ("eyes")
  addHeadlight(P, 0.2, 0.6, 0.72, 0.075, -0.5);
  addHeadlight(P, -0.2, 0.6, 0.72, 0.075, -0.5);
  // ducktail spoiler
  addWing(P, 0.8, -0.84, 0.96, 0.24, { strutBase: 0.62, tilt: -0.18 });
  addTailLights(P, [-0.24, 0.24], 0.48, -0.955, 0.06);
  addRearPlate(P, 0.34, -0.95, 0.24);
  addSuspension(P, st, { f: 0.3, r: 0.4 });
  addFloor(P, 1.8, 0.86, 0.02);
  addExhaust(P, rig, V(0.2, 0.26, -0.82), V(0, 0.18, -1).normalize(), 0.045, 0.2, 'exhaustL');
  addExhaust(P, rig, V(-0.2, 0.26, -0.82), V(0, 0.18, -1).normalize(), 0.045, 0.2, 'exhaustR');
  // whip antenna with pennant (animated group added separately)
  rig.flag = { base: V(-0.36, 0.62, -0.74) };
}

function bodyBuggy(P, rig, st, ch) {
  P.add(
    'livery',
    loft([
      { z: -0.9, y: 0.5, w: 0.34, ht: 0.12, hb: 0.14, n: 4 },
      { z: -0.85, y: 0.5, w: 0.44, ht: 0.16, hb: 0.19, n: 4.2 },
      { z: -0.42, y: 0.49, w: 0.48, ht: 0.13, hb: 0.21, n: 4.4 },
      { z: 0.15, y: 0.49, w: 0.46, ht: 0.15, hb: 0.21, n: 4.2 },
      { z: 0.66, y: 0.47, w: 0.4, ht: 0.14, hb: 0.19, n: 3.8 },
      { z: 0.98, y: 0.43, w: 0.32, ht: 0.08, hb: 0.15, n: 3.4 },
      { z: 1.04, y: 0.42, w: 0.24, ht: 0.04, hb: 0.08, n: 3 },
    ]),
  );
  // skid plate
  P.add('gunmetal', rbox(0.6, 0.05, 0.42, 0.02), M(0, 0.2, 1.0, -0.5));
  // bull bar
  P.add(
    'accent',
    tube([V(-0.4, 0.22, 1.04), V(-0.42, 0.5, 1.12), V(-0.2, 0.62, 1.16), V(0.2, 0.62, 1.16), V(0.42, 0.5, 1.12), V(0.4, 0.22, 1.04)], 0.035, { segs: 40 }),
  );
  P.cyl('accent', V(-0.38, 0.42, 1.11), V(0.38, 0.42, 1.11), 0.028, true);
  // roll cage
  const hoop = [V(-0.44, 0.58, -0.6), V(-0.42, 1.05, -0.64), V(-0.3, 1.36, -0.68), V(0.3, 1.36, -0.68), V(0.42, 1.05, -0.64), V(0.44, 0.58, -0.6)];
  P.add('accent', tube(hoop, 0.04, { segs: 48 }));
  for (const s of [-1, 1]) P.cyl('accent', V(s * 0.32, 1.33, -0.69), V(s * 0.38, 0.62, -0.92), 0.032, true);
  // light bar on the cage
  P.add('dark', rbox(0.6, 0.09, 0.09, 0.03), M(0, 1.43, -0.66));
  for (let i = 0; i < 4; i++) addHeadlight(P, -0.21 + i * 0.14, 1.43, -0.61, 0.035);
  // fenders over rear wheels
  for (const s of [-1, 1]) {
    P.add('paint', torus(st.wr.r + 0.06, 0.03, PI * 0.62, 8, 24), M(s * st.wr.x, st.wr.r, st.wr.z, 0, PI / 2, PI * 0.19, 1, 1, 4.2));
    P.add('paint', torus(st.wf.r + 0.05, 0.028, PI * 0.6, 8, 24), M(s * st.wf.x, st.wf.r, st.wf.z, 0, PI / 2, PI * 0.2, 1, 1, 3.8));
  }
  // coil-overs (front)
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const a = t * TAU * 6;
      const c = V(s * (0.44 + t * 0.18), 0.66 - t * 0.28, 0.8);
      pts.push(c.add(V(Math.cos(a) * 0.04, 0, Math.sin(a) * 0.04)));
    }
    P.add('chrome', tube(pts, 0.011, { segs: 120, radial: 5 }));
    P.cyl('trim', V(s * 0.44, 0.66, 0.8), V(s * 0.62, 0.38, 0.8), 0.018, true);
  }
  // spare tyre on the back
  P.push(M(0, 0.62, -0.97, 0, PI / 2, 0));
  P.add('rubberK', tyreGeometry(0.26, 0.16, 0.15));
  P.add('rimDish', GEO.cyl, M(0, 0, 0, 0, 0, PI / 2, 0.15, 0.14, 0.15));
  P.add('hub', GEO.sph, M(-0.08, 0, 0, 0, 0, 0, 0.03, 0.06, 0.06));
  P.pop();
  P.cyl('trim', V(0, 0.62, -0.9), V(0, 0.62, -0.97), 0.03, true);
  addTailLights(P, [-0.3, 0.3], 0.46, -0.915, 0.06);
  addRearPlate(P, 0.32, -0.915, 0.24);
  addSuspension(P, st, { f: 0.28, r: 0.42 });
  addFloor(P, 1.9, 0.9, 0.05);
  addExhaust(P, rig, V(0.36, 0.55, -0.82), V(0, 1, -0.55).normalize(), 0.045, 0.34, 'exhaustL');
  addExhaust(P, rig, V(-0.36, 0.55, -0.82), V(0, 1, -0.55).normalize(), 0.045, 0.34, 'exhaustR');
}

function bodyMuscle(P, rig, st, ch) {
  P.add(
    'livery',
    loft([
      { z: -1.1, y: 0.42, w: 0.42, ht: 0.12, hb: 0.15, n: 3.6 },
      { z: -1.05, y: 0.43, w: 0.55, ht: 0.18, hb: 0.22, n: 3.6 },
      { z: -0.72, y: 0.43, w: 0.61, ht: 0.2, hb: 0.24, n: 3.8 },
      { z: -0.25, y: 0.41, w: 0.63, ht: 0.14, hb: 0.23, n: 3.8 },
      { z: 0.25, y: 0.44, w: 0.61, ht: 0.2, hb: 0.24, n: 3.6 },
      { z: 0.85, y: 0.41, w: 0.55, ht: 0.17, hb: 0.21, n: 3.4 },
      { z: 1.18, y: 0.36, w: 0.45, ht: 0.1, hb: 0.15, n: 3.2 },
      { z: 1.25, y: 0.35, w: 0.3, ht: 0.04, hb: 0.08, n: 3 },
    ]),
  );
  // chrome bumpers
  P.add('chrome', tube([V(-0.55, 0.24, 1.12), V(-0.4, 0.22, 1.3), V(0, 0.22, 1.34), V(0.4, 0.22, 1.3), V(0.55, 0.24, 1.12)], 0.05, { segs: 40 }));
  P.add('chrome', tube([V(-0.58, 0.26, -1.0), V(-0.42, 0.24, -1.16), V(0.42, 0.24, -1.16), V(0.58, 0.26, -1.0)], 0.05, { segs: 40 }));
  // supercharger blower poking through the hood
  P.add('chrome', rbox(0.28, 0.15, 0.26, 0.045), M(0, 0.64, 0.78));
  for (let i = 0; i < 4; i++) P.add('gunmetal', rbox(0.3, 0.014, 0.27, 0.006, 1), M(0, 0.6 + i * 0.03, 0.78));
  P.add('dark', rbox(0.22, 0.08, 0.16, 0.035), M(0, 0.74, 0.8));
  P.add('accent', rbox(0.24, 0.03, 0.18, 0.012), M(0, 0.79, 0.8));
  P.add('dark', rbox(0.05, 0.14, 0.28, 0.02), M(0, 0.6, 0.93));
  // side pipes
  for (const s of [-1, 1]) {
    P.add('chrome', tube([V(s * 0.6, 0.2, 0.58), V(s * 0.68, 0.18, 0.3), V(s * 0.68, 0.18, -0.2), V(s * 0.6, 0.22, -0.38)], 0.045, { segs: 30 }));
    P.add('accent', rbox(0.03, 0.05, 0.9, 0.012, 2), M(s * 0.645, 0.43, 0.1));
  }
  addHeadlight(P, 0.32, 0.4, 1.17, 0.07, 0);
  addHeadlight(P, -0.32, 0.4, 1.17, 0.07, 0);
  if (ch.id === 'bruno') {
    // zoomie headers + ducktail
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const base = V(s * 0.6, 0.5, 0.1 - i * 0.16);
        const dir = V(s * 0.45, 0.9, -0.7).normalize();
        addExhaust(P, rig, base, dir, 0.04, 0.24, i === 2 ? (s > 0 ? 'exhaustL' : 'exhaustR') : 'exhaustX');
      }
    }
    P.add('paint2', rbox(1.0, 0.07, 0.26, 0.03), M(0, 0.66, -0.98, -0.3));
    P.add('wingDecal', GEO.plane, M(0, 0.66 + 0.036 * Math.cos(-0.3), -0.98 + 0.036 * Math.sin(-0.3), -PI / 2 - 0.3, 0, PI, 0.86, 0.2, 1));
  } else {
    addWing(P, 0.92, -1.0, 1.42, 0.34, { strutBase: 0.6, tilt: -0.12 });
    addExhaust(P, rig, V(0.3, 0.34, -1.04), V(0, 0.1, -1).normalize(), 0.075, 0.16, 'exhaustL');
    addExhaust(P, rig, V(-0.3, 0.34, -1.04), V(0, 0.1, -1).normalize(), 0.075, 0.16, 'exhaustR');
  }
  addTailLights(P, [-0.42, 0.42], 0.48, -1.065, 0.07);
  addRearPlate(P, 0.44, -1.105, 0.26);
  addSuspension(P, st, { f: 0.4, r: 0.55 });
  addFloor(P, 2.2, 1.0, 0.05);
}

function bodyMech(P, rig, st, ch) {
  P.add(
    'livery',
    loft([
      { z: -1.06, y: 0.43, w: 0.42, ht: 0.14, hb: 0.14, n: 6 },
      { z: -1.0, y: 0.43, w: 0.54, ht: 0.2, hb: 0.2, n: 6 },
      { z: -0.5, y: 0.42, w: 0.6, ht: 0.18, hb: 0.22, n: 6 },
      { z: 0.1, y: 0.42, w: 0.58, ht: 0.16, hb: 0.22, n: 6 },
      { z: 0.7, y: 0.4, w: 0.5, ht: 0.16, hb: 0.2, n: 5 },
      { z: 1.12, y: 0.34, w: 0.4, ht: 0.08, hb: 0.14, n: 5 },
      { z: 1.18, y: 0.33, w: 0.3, ht: 0.04, hb: 0.08, n: 4 },
    ], { radial: 40 }),
  );
  // armour plates
  for (const s of [-1, 1]) {
    P.add('paint2', rbox(0.08, 0.2, 0.7, 0.03), M(s * 0.6, 0.38, -0.1, 0, 0, s * 0.18));
    P.add('glow', rbox(0.02, 0.025, 0.66, 0.008, 1), M(s * 0.645, 0.36, -0.1));
    P.add('dark', rbox(0.035, 0.03, 0.3, 0.01, 1), M(s * 0.08, 0.64, 0.6, 0.22, 0, 0));
  }
  P.add('paint2', rbox(0.34, 0.1, 0.5, 0.04), M(0, 0.6, 0.6, 0.22, 0, 0));
  // light bar (glowing visor across the nose)
  P.add('dark', rbox(0.72, 0.08, 0.06, 0.03), M(0, 0.42, 1.14, 0.3));
  P.add('glowEye', rbox(0.64, 0.035, 0.03, 0.012, 2), M(0, 0.425, 1.165, 0.3));
  // twin rear thrusters
  for (const s of [-1, 1]) {
    const base = V(s * 0.3, 0.46, -0.9);
    const dir = V(0, 0.06, -1).normalize();
    P.cyl('gunmetal', base, base.clone().addScaledVector(dir, 0.24), 0.12);
    P.add('chrome', torus(0.12, 0.025, TAU, 8, 24), M(s * 0.3, 0.475, -1.14, 0.06));
    P.cyl('glowEye', base.clone().addScaledVector(dir, 0.2), base.clone().addScaledVector(dir, 0.235), 0.09);
    const a = new THREE.Object3D();
    a.name = s > 0 ? 'exhaustL' : 'exhaustR';
    a.position.copy(base).addScaledVector(dir, 0.25);
    rig.anchorList.push(a);
  }
  // split wing on a pylon
  P.add('trim', rbox(0.08, 0.36, 0.16, 0.03), M(0, 0.72, -0.86, 0.25));
  P.add('paint', rbox(1.36, 0.06, 0.3, 0.02), M(0, 0.92, -0.92, -0.08));
  P.add('wingDecal', GEO.plane, M(0, 0.92 + 0.031 * Math.cos(-0.08), -0.92 + 0.031 * Math.sin(-0.08), -PI / 2 - 0.08, 0, PI, 1.18, 0.24, 1));
  for (const s of [-1, 1]) P.add('paint2', rbox(0.05, 0.28, 0.4, 0.02), M(s * 0.69, 0.88, -0.94, 0, 0, s * -0.12));
  addTailLights(P, [-0.42, 0.42], 0.5, -1.03, 0.06);
  addRearPlate(P, 0.3, -1.075, 0.24);
  addSuspension(P, st, { f: 0.36, r: 0.55 });
  addFloor(P, 2.1, 0.96, 0.05);
}

const BODY = { racer: bodyRacer, bubble: bodyBubble, buggy: bodyBuggy, muscle: bodyMuscle, mech: bodyMech };

// --------------------------------------------------------------------------------------------
// drivers
// --------------------------------------------------------------------------------------------

/**
 * Cartoon eyes. `c` = sphere centre the eyes sit on, R its radius. yaw = half angle between eyes.
 * Built in the "eyes" group (blink = scale y), whose origin is at eye height.
 */
function addEyes(E, c, R, { yaw = 0.36, pitch = 0.02, w = 0.085, h = 0.105, d = 0.05, irisScale = 0.64, inset = 0.25 } = {}) {
  for (const s of [-1, 1]) {
    const dir = V(s * Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const base = c.clone().addScaledVector(dir, R - d * inset);
    const ry = s * yaw;
    const rx = -pitch;
    E.ell('eyeWhite', base.x, base.y, base.z, w, h, d, rx, ry, 0);
    const ip = base.clone().addScaledVector(dir, d * 0.62);
    E.ell('iris', ip.x, ip.y - h * 0.06, ip.z, w * irisScale, h * irisScale * 1.02, d * 0.5, rx, ry, 0);
    const pp = base.clone().addScaledVector(dir, d * 0.82);
    E.ell('pupil', pp.x, pp.y - h * 0.08, pp.z, w * irisScale * 0.52, h * irisScale * 0.56, d * 0.4, rx, ry, 0, true);
    const hp = base.clone().addScaledVector(dir, d * 1.0);
    E.ell('hilite', hp.x + w * 0.22, hp.y + h * 0.18, hp.z, w * 0.2, h * 0.2, d * 0.2, rx, ry, 0, true);
    E.ell('hilite', hp.x - w * 0.18, hp.y - h * 0.32, hp.z - 0.002, w * 0.09, h * 0.09, d * 0.1, rx, ry, 0, true);
  }
}

function smile(P, key, x, y, z, r, tube = 0.012, rx = 0, open = 0.55) {
  P.add(key, torus(r, tube, PI * open, 6, 16), M(x, y, z, rx, 0, PI + (PI * (1 - open)) / 2));
}

/** Builds the head into `H` (head-pivot space, pivot at neck) and eyes into `E`. */
const HEADS = {
  fox(H, E, rig) {
    const c = V(0, 0.28, 0.0);
    H.ell('fur', c.x, c.y, c.z, 0.305, 0.275, 0.29);
    // cheek fluff
    for (const s of [-1, 1]) {
      H.ell('fur2', s * 0.17, 0.2, 0.12, 0.15, 0.1, 0.13, 0, 0, s * 0.35);
      H.cone('fur2', V(s * 0.25, 0.19, 0.04), V(s * 0.37, 0.12, 0.0), 0.075, 0.6);
    }
    // snout
    H.ell('fur2', 0, 0.19, 0.24, 0.12, 0.085, 0.14);
    H.ell('fur', 0, 0.25, 0.2, 0.1, 0.07, 0.12, -0.35);
    H.ell('nose', 0, 0.225, 0.375, 0.045, 0.034, 0.034);
    H.ell('hilite', 0.012, 0.24, 0.402, 0.012, 0.008, 0.006, 0, 0, 0, true);
    smile(H, 'mouth', 0, 0.165, 0.33, 0.045, 0.01, -0.2);
    // ears (separate groups)
    rig.ears = [];
    for (const s of [-1, 1]) {
      const Ep = new Parts();
      Ep.cone('fur', V(0, 0, 0), V(s * 0.04, 0.26, 0), 0.11, 0.5);
      Ep.cone('fur4', V(0, 0.01, 0.03), V(s * 0.035, 0.2, 0.035), 0.07, 0.3);
      Ep.cone('fur3', V(s * 0.03, 0.17, 0), V(s * 0.04, 0.265, 0), 0.042, 0.55);
      rig.ears.push({ parts: Ep, pos: V(s * 0.15, 0.49, -0.02), rot: [0, 0, -s * 0.3], side: s });
    }
    // goggles on forehead
    H.add('trim', torus(1, 0.08, TAU, 8, 40), M(0, 0.445, -0.03, -PI / 2 - 0.3, 0, 0, 0.262, 0.252, 0.26));
    for (const s of [-1, 1]) {
      H.add('accent', torus(0.068, 0.024, TAU, 10, 28), M(s * 0.092, 0.5, 0.17, -1.0, s * 0.28, 0));
      H.add('lens', GEO.sphMd, M(s * 0.092, 0.5, 0.17, -1.0, s * 0.28, 0, 0.062, 0.062, 0.024));
    }
    H.add('trim', rbox(0.05, 0.03, 0.03, 0.01, 1), M(0, 0.51, 0.19, -1.0, 0, 0));
    // hair tuft
    H.cone('fur', V(0, 0.52, 0.08), V(0.02, 0.62, 0.2), 0.05, 0.6, true);
    H.cone('fur', V(0.04, 0.52, 0.06), V(0.09, 0.6, 0.17), 0.04, 0.6, true);
    addEyes(E, c, 0.29, { yaw: 0.36, pitch: 0.03, w: 0.082, h: 0.1 });
  },

  bunny(H, E, rig) {
    const c = V(0, 0.27, 0);
    H.ell('fur', c.x, c.y, c.z, 0.3, 0.275, 0.285);
    H.ell('fur', 0, 0.18, 0.06, 0.24, 0.17, 0.22);
    for (const s of [-1, 1]) H.ell('blush', s * 0.17, 0.17, 0.225, 0.055, 0.032, 0.02, 0, s * 0.6, 0, true);
    H.ell('fur2', 0, 0.165, 0.245, 0.085, 0.06, 0.07);
    H.ell('fur3', 0, 0.205, 0.305, 0.034, 0.024, 0.022);
    for (const s of [-1, 1]) H.add('teeth', rbox(0.028, 0.035, 0.012, 0.006, 1), M(s * 0.015, 0.125, 0.29));
    smile(H, 'mouth', 0, 0.15, 0.3, 0.025, 0.007, -0.2);
    // fluffy fringe
    H.ell('fur', 0.0, 0.5, 0.12, 0.07, 0.05, 0.06, 0, 0, 0, true);
    H.ell('fur', 0.06, 0.49, 0.1, 0.06, 0.045, 0.055, 0, 0, 0, true);
    H.ell('fur', -0.06, 0.49, 0.1, 0.06, 0.045, 0.055, 0, 0, 0, true);
    rig.ears = [];
    for (const s of [-1, 1]) {
      const Ep = new Parts();
      const flop = s < 0;
      if (flop) {
        Ep.cap('fur', V(0, 0, 0), V(0, 0.2, -0.01), 0.068);
        Ep.cap('fur', V(0, 0.2, -0.01), V(-0.2, 0.3, -0.04), 0.066);
        Ep.cap('fur3', V(0, 0.03, 0.035), V(0, 0.18, 0.03), 0.04);
      } else {
        Ep.cap('fur', V(0, 0, 0), V(0.03, 0.42, -0.04), 0.07);
        Ep.cap('fur3', V(0.0, 0.05, 0.035), V(0.03, 0.38, -0.005), 0.042);
        // bow
        Ep.cone('accent', V(0.0, 0.08, 0.0), V(0.13, 0.12, 0.02), 0.06, 0.4);
        Ep.cone('accent', V(0.0, 0.08, 0.0), V(-0.11, 0.03, 0.02), 0.06, 0.4);
        Ep.ell('accent', 0, 0.08, 0.02, 0.035, 0.035, 0.035, 0, 0, 0, true);
      }
      rig.ears.push({ parts: Ep, pos: V(s * 0.12, 0.49, -0.04), rot: [0, 0, -s * 0.12], side: s, flatten: 0.55 });
    }
    addEyes(E, c, 0.285, { yaw: 0.37, pitch: 0.02, w: 0.088, h: 0.11 });
  },

  penguin(H, E, rig) {
    const c = V(0, 0.29, 0);
    H.ell('fur', c.x, c.y, c.z, 0.31, 0.295, 0.3);
    for (const s of [-1, 1]) H.ell('fur2', s * 0.09, 0.25, 0.155, 0.16, 0.18, 0.15);
    H.ell('fur2', 0, 0.17, 0.17, 0.17, 0.11, 0.13);
    // beak
    H.push(M(0, 0.2, 0.3, 0.12, 0, 0));
    H.cone('beak', V(0, 0, -0.03), V(0, 0, 0.13), 0.07, 0.62);
    H.cone('beak', V(0, -0.03, -0.03), V(0, -0.035, 0.08), 0.05, 0.5);
    H.pop();
    for (const s of [-1, 1]) H.ell('blush', s * 0.19, 0.17, 0.22, 0.045, 0.03, 0.02, 0, s * 0.7, 0, true);
    // beanie with pom-pom
    H.push(M(0, 0.29, -0.01, -0.22, 0, 0));
    H.add('knit', new THREE.SphereGeometry(0.32, 28, 12, 0, TAU, 0, PI * 0.43));
    for (let i = 0; i < 4; i++) {
      const h = 0.13 + i * 0.045;
      H.add('knit2', torus(Math.sqrt(0.32 * 0.32 - h * h) + 0.002, 0.01, TAU, 6, 40), M(0, h, 0, PI / 2, 0, 0));
    }
    H.add('knit2', torus(0.3, 0.045, TAU, 10, 40), M(0, 0.07, 0, PI / 2, 0, 0));
    H.ell('knit2', 0, 0.34, 0, 0.085, 0.085, 0.085);
    H.pop();
    addEyes(E, c, 0.3, { yaw: 0.34, pitch: 0.05, w: 0.08, h: 0.1 });
  },

  redpanda(H, E, rig) {
    const c = V(0, 0.27, 0);
    H.ell('fur', c.x, c.y, c.z, 0.315, 0.27, 0.285);
    H.ell('fur2', 0, 0.175, 0.2, 0.15, 0.095, 0.13);
    for (const s of [-1, 1]) {
      H.ell('fur2', s * 0.2, 0.21, 0.14, 0.11, 0.1, 0.1);
      H.ell('fur2', s * 0.11, 0.38, 0.23, 0.05, 0.034, 0.03, -0.2, s * 0.3, 0, true);
      H.ell('fur3', s * 0.125, 0.18, 0.225, 0.035, 0.07, 0.03, 0.1, s * 0.4, s * 0.35, true);
    }
    H.ell('nose', 0, 0.215, 0.325, 0.042, 0.03, 0.03);
    smile(H, 'mouth', 0, 0.16, 0.31, 0.04, 0.009, -0.2);
    // leaf on head
    H.ell('leaf', 0.06, 0.55, 0.02, 0.09, 0.012, 0.045, 0.2, 0.6, 0.2);
    H.cyl('fur3', V(0.0, 0.54, 0.0), V(-0.02, 0.6, -0.02), 0.008, true);
    rig.ears = [];
    for (const s of [-1, 1]) {
      const Ep = new Parts();
      Ep.ell('fur3', 0, 0.06, 0, 0.11, 0.11, 0.05);
      Ep.ell('fur2', 0, 0.06, 0.025, 0.08, 0.08, 0.035);
      Ep.ell('fur', 0, 0.06, -0.02, 0.1, 0.1, 0.035);
      rig.ears.push({ parts: Ep, pos: V(s * 0.2, 0.44, -0.02), rot: [0, 0, -s * 0.5], side: s });
    }
    addEyes(E, c, 0.285, { yaw: 0.36, pitch: 0.02, w: 0.082, h: 0.1 });
  },

  human(H, E, rig) {
    const hc = V(0, 0.3, -0.02);
    const hs = V(0.335, 0.325, 0.345);
    const open = 0.98; // half-width of the face opening (phi)
    const th0 = PI * 0.33;
    const th1 = PI * 0.8;
    const shell = (phi0, phiLen, t0, tLen, key = 'paint', k = 1) =>
      H.add(key, new THREE.SphereGeometry(1, 30, 20, phi0, phiLen, t0, tLen), M(hc.x, hc.y, hc.z, 0, 0, 0, hs.x * k, hs.y * k, hs.z * k));
    // back + sides, forehead cap and chin bar (leaves an open face window)
    shell(PI / 2 + open, TAU - 2 * open, 0, PI);
    shell(PI / 2 - open, 2 * open, 0, th0);
    shell(PI / 2 - open, 2 * open, th1, PI - th1);
    // inner lining so the window edges never look hollow
    H.add('dark', GEO.sph, M(hc.x, hc.y, hc.z - 0.01, 0, 0, 0, hs.x * 0.96, hs.y * 0.96, hs.z * 0.93));
    const onShell = (phi, th, k = 1.0) =>
      V(-Math.cos(phi) * Math.sin(th) * hs.x * k + hc.x, Math.cos(th) * hs.y * k + hc.y, Math.sin(phi) * Math.sin(th) * hs.z * k + hc.z);
    // padded rim around the window
    const rim = [];
    for (let i = 0; i <= 10; i++) rim.push(onShell(PI / 2 - open + (2 * open * i) / 10, th0, 1.0));
    for (let i = 1; i <= 8; i++) rim.push(onShell(PI / 2 + open, th0 + ((th1 - th0) * i) / 8, 1.0));
    for (let i = 1; i <= 10; i++) rim.push(onShell(PI / 2 + open - (2 * open * i) / 10, th1, 1.0));
    for (let i = 1; i < 8; i++) rim.push(onShell(PI / 2 - open, th1 - ((th1 - th0) * i) / 8, 1.0));
    H.add('trim', tube(rim, 0.017, { segs: 90, radial: 8, closed: true }));
    // racing stripes from the forehead over the top to the nape
    for (const off of [-0.075, 0, 0.075]) {
      const pts = [];
      for (let i = 0; i <= 16; i++) {
        const a = -0.95 + (i / 16) * 2.75; // angle from +Y toward -Z
        const y = Math.cos(a);
        const z = -Math.sin(a);
        const r = Math.sqrt(Math.max(0, 1 - (off / hs.x) ** 2));
        pts.push(V(off, hc.y + y * hs.y * r * 1.012, hc.z + z * hs.z * r * 1.012));
      }
      H.add(off === 0 ? 'paint2' : 'accent', tube(pts, off === 0 ? 0.018 : 0.026, { segs: 40, radial: 6 }));
    }
    // visor flipped up over the forehead
    H.add('lens', new THREE.SphereGeometry(1, 28, 6, PI / 2 - 1.05, 2.1, PI * 0.12, PI * 0.2), M(hc.x, hc.y, hc.z, 0, 0, 0, hs.x * 1.05, hs.y * 1.05, hs.z * 1.05));
    for (const s of [-1, 1]) H.add('chrome', GEO.cyl, M(s * hs.x * 1.0, hc.y + 0.06, hc.z + 0.12, 0, 0, PI / 2, 0.035, 0.03, 0.035));
    // number emblems on helmet sides
    for (const s of [-1, 1]) H.add('emblem', GEO.plane, M(s * 0.34, 0.27, -0.06, 0, s * PI / 2, 0, 0.15, 0.15, 1));
    // face
    H.ell('skin', 0, 0.255, 0.075, 0.26, 0.235, 0.27);
    H.cone('hair', V(-0.07, 0.4, 0.27), V(-0.04, 0.33, 0.33), 0.055, 0.6, true);
    H.cone('hair', V(0.02, 0.41, 0.28), V(0.04, 0.34, 0.335), 0.05, 0.6, true);
    H.cone('hair', V(0.1, 0.39, 0.26), V(0.12, 0.33, 0.31), 0.045, 0.6, true);
    for (const s of [-1, 1]) H.ell('blush', s * 0.135, 0.19, 0.29, 0.04, 0.024, 0.014, 0, s * 0.45, 0, true);
    H.ell('skin', 0, 0.23, 0.345, 0.028, 0.024, 0.024, 0, 0, 0, true);
    smile(H, 'mouth', 0, 0.175, 0.315, 0.045, 0.01, -0.3, 0.62);
    addEyes(E, V(0, 0.255, 0.075), 0.27, { yaw: 0.33, pitch: 0.1, w: 0.075, h: 0.092, d: 0.042 });
  },

  robot(H, E, rig) {
    H.add('metalSkin', rbox(0.58, 0.46, 0.5, 0.13, 4), M(0, 0.29, 0));
    H.add('glass', rbox(0.48, 0.32, 0.06, 0.06, 3), M(0, 0.29, 0.225));
    // LED eyes + mouth (emissive)
    for (const s of [-1, 1]) E.add('glowEye', capsule(0.042, 0.06), M(s * 0.1, 0.33, 0.258));
    smile(H, 'glowEye', 0, 0.22, 0.258, 0.06, 0.012, 0, 0.5);
    // ear discs
    for (const s of [-1, 1]) {
      H.add('paint', GEO.cyl, M(s * 0.3, 0.29, 0, 0, 0, PI / 2, 0.11, 0.07, 0.11));
      H.add('chrome', GEO.cyl, M(s * 0.34, 0.29, 0, 0, 0, PI / 2, 0.05, 0.03, 0.05));
    }
    // back vents (seen from the chase cam)
    for (let i = 0; i < 3; i++) H.add('dark', rbox(0.34, 0.035, 0.03, 0.012, 1), M(0, 0.2 + i * 0.07, -0.25));
    H.add('paint', rbox(0.08, 0.06, 0.4, 0.03), M(0, 0.53, 0));
    // antenna group
    const A = new Parts();
    A.cyl('chrome', V(0, 0, 0), V(0, 0.2, 0), 0.012, true);
    A.ell('glow', 0, 0.23, 0, 0.045, 0.045, 0.045);
    rig.antenna = { parts: A, pos: V(0.0, 0.55, -0.05) };
    rig.eyeY = 0.33;
  },

  dino(H, E, rig) {
    const c = V(0, 0.29, 0.0);
    H.ell('fur', c.x, c.y, c.z, 0.3, 0.28, 0.29);
    H.ell('fur', 0, 0.22, 0.17, 0.25, 0.17, 0.24);
    H.ell('fur2', 0, 0.13, 0.15, 0.21, 0.085, 0.21);
    for (const s of [-1, 1]) {
      H.ell('fur3', s * 0.065, 0.31, 0.385, 0.022, 0.016, 0.016, 0, 0, 0, true);
      // brow ridge
      H.ell('fur', s * 0.13, 0.43, 0.15, 0.1, 0.05, 0.08, -0.3, s * 0.3, s * -0.2);
    }
    // toothy grin
    H.add('mouth', torus(0.235, 0.014, 1.9, 6, 30), M(0, 0.175, 0.165, PI / 2, 0, PI / 2 - 0.95, 1, 0.97, 1));
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const a = i * 0.24;
      const x = Math.sin(a) * 0.232;
      const z = 0.165 + Math.cos(a) * 0.225;
      H.cone('teeth', V(x, 0.18, z), V(x, 0.14, z + 0.004), 0.022, 1, true);
    }
    // spikes along the head
    for (let i = 0; i < 5; i++) {
      const a = 0.25 + i * 0.36;
      const dir = V(0, Math.cos(a - 0.3), -Math.sin(a - 0.3) + 0.15).normalize();
      const base = V(0, 0.29, -0.02).addScaledVector(dir, 0.27);
      H.cone('accent', base, base.clone().addScaledVector(dir, 0.13 - i * 0.012), 0.055, 0.45);
    }
    addEyes(E, c, 0.29, { yaw: 0.42, pitch: 0.2, w: 0.08, h: 0.095 });
  },

  bulldog(H, E, rig) {
    const c = V(0, 0.28, 0);
    H.ell('fur', c.x, c.y, c.z, 0.355, 0.295, 0.3);
    H.ell('fur2', 0, 0.18, 0.2, 0.22, 0.13, 0.14);
    for (const s of [-1, 1]) {
      H.ell('fur2', s * 0.11, 0.15, 0.235, 0.12, 0.1, 0.1);
      H.cone('teeth', V(s * 0.07, 0.115, 0.3), V(s * 0.075, 0.175, 0.31), 0.022, 1, true);
      // gruff brows
      H.ell('fur3', s * 0.11, 0.395, 0.24, 0.1, 0.028, 0.035, 0, s * 0.35, s * 0.3);
    }
    H.ell('fur', 0, 0.1, 0.21, 0.14, 0.065, 0.1);
    H.ell('nose', 0, 0.255, 0.335, 0.085, 0.052, 0.05);
    H.ell('hilite', 0.03, 0.275, 0.375, 0.02, 0.01, 0.008, 0, 0, 0, true);
    // backwards cap
    H.push(M(0, 0.29, 0, -0.12, 0, 0));
    H.add('accent', new THREE.SphereGeometry(0.335, 28, 10, 0, TAU, 0, PI * 0.36));
    H.add('accent', rbox(0.3, 0.025, 0.2, 0.01, 2), M(0, 0.15, -0.37, -0.15, 0, 0));
    H.ell('paint2', 0, 0.335, 0, 0.035, 0.02, 0.035, 0, 0, 0, true);
    H.pop();
    rig.ears = [];
    for (const s of [-1, 1]) {
      const Ep = new Parts();
      Ep.ell('fur3', s * 0.03, -0.04, 0.02, 0.12, 0.07, 0.1, 0, 0, s * 0.3);
      rig.ears.push({ parts: Ep, pos: V(s * 0.3, 0.42, -0.02), rot: [0, 0, -s * 0.5], side: s });
    }
    addEyes(E, c, 0.3, { yaw: 0.33, pitch: 0.07, w: 0.072, h: 0.082 });
  },
};

/** Torso, arms and extras. Driver space: origin at hips, +Z forward. */
function buildDriver(rig, mats, ch, st) {
  const species = ch.species;
  const driver = new THREE.Group();
  driver.name = 'driver';
  const scale = ch.weightClass === 'light' ? 0.96 : ch.weightClass === 'heavy' ? 1.07 : 1.01;
  driver.position.set(0, st.hipY, st.seatZ);
  driver.scale.setScalar(scale);

  const T = new Parts();
  const torsoKey = species === 'penguin' || species === 'dino' ? 'fur' : species === 'robot' ? 'suit' : 'suit';
  if (species === 'robot') {
    T.add('suit', rbox(0.42, 0.42, 0.32, 0.1, 3), M(0, 0.22, -0.02));
    T.add('paint', rbox(0.3, 0.2, 0.06, 0.04, 2), M(0, 0.26, 0.13));
    T.add('glowEye', GEO.cyl, M(0, 0.26, 0.165, PI / 2, 0, 0, 0.05, 0.02, 0.05));
    T.cyl('gunmetal', V(0, 0.4, -0.02), V(0, 0.48, -0.02), 0.07, true);
  } else {
    const prof = [
      [0.001, -0.02],
      [0.15, 0.0],
      [0.205, 0.08],
      [0.215, 0.18],
      [0.195, 0.3],
      [0.15, 0.4],
      [0.08, 0.455],
      [0.001, 0.47],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    T.add(torsoKey, new THREE.LatheGeometry(prof, 28), M(0, 0, -0.02, 0, 0, 0, 1, 1, 0.85));
  }
  if (species === 'penguin') {
    T.ell('fur2', 0, 0.17, 0.08, 0.15, 0.2, 0.1);
    T.add('accent', torus(0.15, 0.05, TAU, 10, 32), M(0, 0.42, -0.02, PI / 2 - 0.15, 0, 0, 1, 1, 0.9));
    T.add('accent', capsule(0.045, 0.22), M(0.1, 0.32, -0.16, 0.5, 0, 0.3));
  } else if (species === 'dino') {
    T.ell('fur2', 0, 0.17, 0.08, 0.15, 0.2, 0.1);
    for (let i = 0; i < 3; i++) T.cone('accent', V(0, 0.36 - i * 0.12, -0.17), V(0, 0.4 - i * 0.12, -0.27), 0.05, 0.45);
  } else if (species === 'human') {
    T.add('paint2', capsule(0.025, 0.36), M(0.07, 0.2, 0.15, 0.1, 0, 0));
    T.add('paint2', capsule(0.025, 0.36), M(-0.07, 0.2, 0.15, 0.1, 0, 0));
    T.add('paint2', torus(0.11, 0.035, TAU, 8, 28), M(0, 0.43, -0.02, PI / 2, 0, 0));
    T.add('emblem', GEO.plane, M(0, 0.25, -0.198, 0, PI, 0, 0.16, 0.16, 1));
  } else if (species === 'fox') {
    T.add('accent', torus(0.15, 0.055, TAU, 10, 32), M(0, 0.42, -0.02, PI / 2 - 0.1, 0, 0, 1, 1, 0.9));
  } else if (species === 'bunny') {
    T.add('fur2', torus(0.14, 0.06, TAU, 10, 32), M(0, 0.42, -0.02, PI / 2, 0, 0));
    T.ell('fur2', 0, 0.06, -0.19, 0.08, 0.08, 0.08);
  } else if (species === 'bulldog') {
    T.add('dark', torus(0.15, 0.04, TAU, 10, 32), M(0, 0.41, -0.02, PI / 2, 0, 0));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const p = V(Math.sin(a) * 0.18, 0.41, -0.02 + Math.cos(a) * 0.17);
      T.cone('chrome', p, p.clone().add(V(Math.sin(a) * 0.06, 0, Math.cos(a) * 0.06)), 0.022, 1, true);
    }
    T.add('fur', capsule(0.1, 0.0), M(0, 0.3, 0.09, 0, 0, 0, 1, 1, 0.5));
  } else if (species === 'redpanda') {
    T.add('fur2', torus(0.13, 0.04, TAU, 8, 28), M(0, 0.43, -0.02, PI / 2, 0, 0));
    T.add('accent', rbox(0.12, 0.1, 0.03, 0.02, 2), M(0.08, 0.27, 0.165, 0.1, 0.2, 0));
  }
  T.build(mats, driver);

  // head
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, species === 'robot' ? 0.46 : 0.42, 0.0);
  head.scale.setScalar(1.14);
  driver.add(head);
  const H = new Parts();
  const E = new Parts();
  const local = {};
  HEADS[species](H, E, local);
  H.build(mats, head);
  const eyes = new THREE.Group();
  eyes.name = 'eyes';
  // eyes are blinked around their own centre height
  const eyeY = local.eyeY ?? 0.3;
  eyes.position.set(0, eyeY, 0);
  E.offset(0, -eyeY, 0);
  E.build(mats, eyes, { cast: false });
  head.add(eyes);
  if (local.ears) {
    for (const ear of local.ears) {
      const g = new THREE.Group();
      g.name = ear.side > 0 ? 'earL' : 'earR';
      g.position.copy(ear.pos);
      g.rotation.set(ear.rot[0], ear.rot[1], ear.rot[2]);
      if (ear.flatten) g.scale.set(1, 1, ear.flatten);
      ear.parts.build(mats, g);
      head.add(g);
    }
  }
  if (local.antenna) {
    const g = new THREE.Group();
    g.name = 'antenna';
    g.position.copy(local.antenna.pos);
    local.antenna.parts.build(mats, g);
    head.add(g);
  }

  // arms reach for the steering wheel
  const shoulderY = species === 'robot' ? 0.36 : 0.34;
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.name = s > 0 ? 'armL' : 'armR';
    arm.rotation.order = 'ZXY'; // raise (X) first, then splay outward (Z)
    const shoulder = V(s * 0.175, shoulderY, -0.0);
    arm.position.copy(shoulder);
    driver.add(arm);
    const grip = gripPoint(st, s);
    // to driver-local (unscaled)
    const hand = grip.clone().sub(driver.position).divideScalar(scale).sub(shoulder);
    const A = new Parts();
    const sleeve =
      species === 'penguin' || species === 'dino'
        ? 'fur'
        : species === 'redpanda'
          ? 'fur3'
          : species === 'robot'
            ? 'gunmetal'
            : 'suit';
    const elbow = hand.clone().multiplyScalar(0.5).add(V(s * 0.06, -0.08, -0.02));
    if (species === 'penguin') {
      A.add('fur', capsule(0.05, hand.length() * 0.8), between(V(0, 0, 0), hand).m.multiply(new THREE.Matrix4().makeScale(1.25, 1, 0.55)));
    } else {
      A.cap(sleeve, V(0, 0, 0), elbow, species === 'robot' ? 0.045 : 0.052);
      A.cap(sleeve, elbow, hand, species === 'robot' ? 0.042 : 0.048);
      if (species === 'robot') A.ell('paint', 0, 0, 0, 0.075, 0.075, 0.075);
    }
    const glove = species === 'penguin' ? 'fur' : species === 'dino' ? 'fur' : species === 'redpanda' ? 'fur3' : 'glove';
    A.ell(glove, hand.x, hand.y, hand.z, 0.066, 0.06, 0.07);
    if (species === 'human' || species === 'fox') A.ell('glove', hand.x * 0.97, hand.y * 0.98, hand.z * 0.92, 0.06, 0.05, 0.05, 0, 0, 0, true);
    A.build(mats, arm);
    arm.userData.rest = { x: 0, y: 0, z: 0 };
  }

  // tails
  const tailDefs = {
    fox: { key: 'fur', tip: 'fur2', pts: [V(0, 0.08, -0.16), V(0.2, 0.16, -0.38), V(0.44, 0.42, -0.5), V(0.56, 0.8, -0.52)], r: (t) => 0.05 + 0.12 * Math.sin(Math.min(1, t * 1.2) * PI * 0.92), tipFrom: 0.76 },
    redpanda: { key: 'fur', ring: 'fur4', pts: [V(0, 0.08, -0.16), V(-0.2, 0.16, -0.38), V(-0.44, 0.42, -0.5), V(-0.54, 0.78, -0.5)], r: (t) => 0.05 + 0.11 * Math.sin(Math.min(1, t * 1.2) * PI * 0.9) },
    dino: { key: 'fur', spikes: true, pts: [V(0, 0.1, -0.16), V(0, 0.2, -0.5), V(0.06, 0.32, -0.82), V(0.14, 0.42, -1.05)], r: (t) => 0.14 * (1 - t) + 0.015 },
  };
  const td = tailDefs[species];
  if (td) {
    const tail = new THREE.Group();
    tail.name = 'tail';
    tail.position.set(0, 0.08, -0.12);
    driver.add(tail);
    const TP = new Parts();
    const pts = td.pts.map((p) => p.clone().sub(V(0, 0.08, -0.12)));
    if (td.ring) {
      const n = 6;
      for (let i = 0; i < n; i++) {
        TP.add(i % 2 ? td.ring : td.key, taperTube(pts, td.r, { t0: i / n, t1: (i + 1) / n + 0.01, segs: 8, radial: 18 }));
      }
    } else if (td.tip) {
      TP.add(td.key, taperTube(pts, td.r, { t0: 0, t1: td.tipFrom + 0.02, segs: 20, radial: 18 }));
      TP.add(td.tip, taperTube(pts, td.r, { t0: td.tipFrom, t1: 1, segs: 10, radial: 18 }));
    } else {
      TP.add(td.key, taperTube(pts, td.r, { segs: 20, radial: 16 }));
    }
    if (td.spikes) {
      const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
      for (let i = 1; i < 5; i++) {
        const t = i / 5.5;
        const p = curve.getPointAt(t);
        const r = td.r(t);
        TP.cone('accent', p.clone().add(V(0, r * 0.7, 0)), p.clone().add(V(0, r + 0.08 - i * 0.012, -0.02)), 0.04, 0.45, true);
      }
    }
    TP.build(mats, tail);
  }
  return driver;
}

function buildFlag(mats, ch, base) {
  const g = new THREE.Group();
  g.name = 'flag';
  g.position.copy(base);
  const P = new Parts();
  P.cyl('trim', V(0, 0, 0), V(0, 0.9, 0), 0.01, true);
  P.ell('accent', 0, 0.92, 0, 0.025, 0.025, 0.025, 0, 0, 0, true);
  // pennant (thin triangle)
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(-0.0, 0.2);
  shape.lineTo(-0.34, 0.1);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.012, bevelEnabled: false });
  P.add(ch.id === 'mochi' ? 'accent' : 'paint', geo, M(0, 0.68, 0, 0, PI / 2, 0));
  P.build(mats, g);
  return g;
}

// --------------------------------------------------------------------------------------------
// template + instancing
// --------------------------------------------------------------------------------------------

const templates = new Map();

function buildTemplate(ch) {
  const mats = new MatLib(ch);
  // aliases
  mats.map.set('rimDish', mats.get(ch.kartStyle === 'muscle' || ch.kartStyle === 'mech' ? 'gunmetal' : 'paint2'));
  mats.map.set('hub', mats.get('accent'));
  const st = STYLE[ch.kartStyle] || STYLE.racer;
  const rig = { anchorList: [] };

  const root = new THREE.Group();
  root.name = 'kart_' + ch.id;
  const visual = new THREE.Group();
  visual.name = 'visual';
  root.add(visual);
  const bodyPivot = new THREE.Group();
  bodyPivot.name = 'bodyPivot';
  bodyPivot.position.y = 0.25;
  visual.add(bodyPivot);
  const body = new THREE.Group();
  body.name = 'bodyOffset';
  body.position.y = -0.25;
  bodyPivot.add(body);

  const P = new Parts();
  (BODY[ch.kartStyle] || bodyRacer)(P, rig, st, ch);
  addSeat(P, st);
  P.build(mats, body, { receive: true });

  body.add(addSteering(rig, mats, st));
  body.add(buildDriver(rig, mats, ch, st));
  if (rig.flag) body.add(buildFlag(mats, ch, rig.flag.base));

  // wheels
  for (const front of [true, false]) {
    for (const side of [1, -1]) {
      const spec = front ? st.wf : st.wr;
      visual.add(buildWheel(mats, spec, side, front, st, ch));
      const a = new THREE.Object3D();
      a.name = 'anchor_wheel' + (front ? 'F' : 'R') + (side > 0 ? 'L' : 'R');
      a.position.set(side * spec.x, 0, spec.z);
      visual.add(a);
    }
  }
  // anchors on the body
  for (const a of rig.anchorList) {
    if (a.name === 'exhaustX') continue;
    a.name = 'anchor_' + a.name;
    body.add(a);
  }
  const item = new THREE.Object3D();
  item.name = 'anchor_itemHold';
  item.position.set(0, 0.45, -1.55);
  body.add(item);
  const bodyA = new THREE.Object3D();
  bodyA.name = 'anchor_body';
  bodyA.position.set(0, 0.6, 0);
  body.add(bodyA);

  root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = o.castShadow !== false;
    }
  });
  root.userData.style = st;
  return root;
}

function getTemplate(ch) {
  if (!templates.has(ch.id)) templates.set(ch.id, buildTemplate(ch));
  return templates.get(ch.id);
}

/**
 * Creates an independent kart instance (geometry shared via cache, materials cloned).
 * Returns { root, rig } where rig holds references for animation.
 */
export function buildKartInstance(ch) {
  const tpl = getTemplate(ch);
  const root = tpl.clone(true);
  const matMap = new Map();
  const materials = [];
  root.traverse((o) => {
    if (o.isMesh) {
      if (!matMap.has(o.material)) {
        const m = o.material.clone();
        m.userData.baseEmissive = m.emissive ? m.emissive.clone() : null;
        m.userData.baseEmissiveIntensity = m.emissiveIntensity ?? 1;
        matMap.set(o.material, m);
        materials.push(m);
      }
      o.material = matMap.get(o.material);
    }
  });
  const get = (n) => root.getObjectByName(n) || null;
  const anchors = {
    exhaustL: get('anchor_exhaustL'),
    exhaustR: get('anchor_exhaustR'),
    wheelFL: get('anchor_wheelFL'),
    wheelFR: get('anchor_wheelFR'),
    wheelRL: get('anchor_wheelRL'),
    wheelRR: get('anchor_wheelRR'),
    itemHold: get('anchor_itemHold'),
    body: get('anchor_body'),
  };
  const st = tpl.userData.style;
  const rig = {
    root,
    visual: get('visual'),
    bodyPivot: get('bodyPivot'),
    driver: get('driver'),
    head: get('head'),
    eyes: get('eyes'),
    armL: get('armL'),
    armR: get('armR'),
    earL: get('earL'),
    earR: get('earR'),
    tail: get('tail'),
    antenna: get('antenna'),
    flag: get('flag'),
    steerWheel: get('steerWheelSpin'),
    wheels: ['FL', 'FR', 'RL', 'RR'].map((t) => ({
      tag: t,
      steer: get('steer_' + t),
      spin: get('spin_' + t),
      radius: t[0] === 'F' ? st.wf.r : st.wr.r,
      front: t[0] === 'F',
    })),
    anchors,
    materials,
    envMaterials: materials.filter((m) => m.isMeshStandardMaterial),
    envState: undefined,
    style: st,
  };
  rig.driverBase = rig.driver.position.clone();
  rig.driverScale = rig.driver.scale.x;
  rig.headBase = rig.head.scale.x;
  // swap in a fallback reflection environment when the scene has none
  const envMesh = rig.bodyPivot.children[0].children.find((o) => o.isMesh);
  if (envMesh) {
    envMesh.onBeforeRender = (renderer, scene) => {
      const want = scene && scene.environment ? null : getFallbackEnvMap();
      if (rig.envState !== want) {
        rig.envState = want;
        for (const m of rig.envMaterials) {
          m.envMap = want;
          m.envMapIntensity = want ? 0.85 : 1;
          m.needsUpdate = true;
        }
      }
    };
  }
  root.userData.rig = rig;
  return { root, rig };
}

/** Disposes per-instance materials (geometry/textures are cached and shared). */
export function disposeKartInstance(rig) {
  for (const m of rig.materials) m.dispose();
  rig.materials.length = 0;
}

/**
 * Standalone display model for menus. The group has `userData.tick(dt, time)` for an idle loop
 * (blinks, ear/tail sway, wheel shimmer) and `userData.dispose()`.
 */
export function createKartModel(character) {
  const { root, rig } = buildKartInstance(character);
  const group = new THREE.Group();
  group.name = 'showroom_' + character.id;
  group.add(root);
  let blink = 1.5 + Math.random() * 2;
  group.userData.rig = rig;
  group.userData.tick = (dt, time) => {
    blink -= dt;
    let eyeS = 1;
    if (blink < 0.12) eyeS = Math.max(0.1, Math.abs(blink - 0.06) / 0.06);
    if (blink < 0) blink = 2 + Math.random() * 3;
    if (rig.eyes) rig.eyes.scale.y = eyeS;
    if (rig.head) {
      rig.head.rotation.y = Math.sin(time * 0.7) * 0.25;
      rig.head.rotation.z = Math.sin(time * 1.1) * 0.05;
    }
    if (rig.tail) rig.tail.rotation.y = Math.sin(time * 2.2) * 0.25;
    if (rig.earL) rig.earL.rotation.x = Math.sin(time * 3.1) * 0.08;
    if (rig.earR) rig.earR.rotation.x = Math.sin(time * 2.7 + 1) * 0.08;
    if (rig.antenna) rig.antenna.rotation.z = Math.sin(time * 4) * 0.15;
    if (rig.flag) rig.flag.rotation.y = Math.sin(time * 3) * 0.3;
    rig.bodyPivot.position.y = 0.25 + Math.sin(time * 9) * 0.003;
  };
  group.userData.dispose = () => {
    disposeKartInstance(rig);
    group.removeFromParent();
  };
  return group;
}
