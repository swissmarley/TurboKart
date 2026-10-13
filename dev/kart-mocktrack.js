import * as THREE from 'three';
import { SURFACES } from '../src/core/constants.js';

/**
 * Mock implementation of the Track contract (ARCHITECTURE.md §1) for kart/camera testing.
 * Teardrop loop (~1 km): main straight with boost pad and a sharp hill crest, a banked 200° sweeper
 * with obstacles and a wide off-road strip, a back straight with an S-bend, a wall-less bridge over
 * a void, a ramp, and a tight hairpin. Driving direction: all right-hand turns.
 * Works headless (no DOM needed unless build() is called).
 */

const HALF_WIDTH = 12;
const WALL = 18;

function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class MockTrack {
  constructor() {
    this.id = 'mock';
    this.name = 'Mock Raceway';
    this.def = { id: 'mock', name: 'Mock Raceway', laps: 3 };
    this.theme = {
      skyTop: 0x4f8fe0,
      skyBottom: 0xcfe6ff,
      fogColor: 0xbfdcff,
      fogNear: 120,
      fogFar: 900,
      dustColor: 0xa08860,
      offroadColor: 0x5a9a3a,
      sparkTint: 0xffffff,
      isNight: false,
    };
    this._generate();
  }

  _generate() {
    const r1 = 24;
    const r2 = 70;
    const D = 320;
    const nz = -(r2 - r1) / D;
    const a = Math.atan2(nz, Math.sqrt(1 - nz * nz)); // right-side tangent angle (≈ -0.144)
    const dense = [];
    const marks = {};
    const push = (x, z) => dense.push(new THREE.Vector2(x, z));
    const step = 0.25;
    // 1. right straight (hairpin exit → sweeper)
    const A0 = new THREE.Vector2(r1 * Math.cos(a), r1 * Math.sin(a));
    const A1 = new THREE.Vector2(r2 * Math.cos(a), D + r2 * Math.sin(a));
    marks.rightStraight = 0;
    let L = A0.distanceTo(A1);
    for (let s = 0; s < L; s += step) push(A0.x + ((A1.x - A0.x) * s) / L, A0.y + ((A1.y - A0.y) * s) / L);
    // 2. sweeper arc
    marks.sweeper = dense.length;
    const span2 = Math.PI - 2 * a;
    for (let s = 0; s < span2 * r2; s += step) {
      const t = a + s / r2;
      push(r2 * Math.cos(t), D + r2 * Math.sin(t));
    }
    // 3. left straight with an S-bend
    marks.leftStraight = dense.length;
    const B0 = new THREE.Vector2(r2 * Math.cos(Math.PI - a), D + r2 * Math.sin(Math.PI - a));
    const B1 = new THREE.Vector2(r1 * Math.cos(Math.PI - a), r1 * Math.sin(Math.PI - a));
    L = B0.distanceTo(B1);
    const dir = B1.clone().sub(B0).normalize();
    const perp = new THREE.Vector2(-dir.y, dir.x);
    for (let s = 0; s < L; s += step) {
      const off = s > 40 && s < 160 ? 8 * Math.sin((2 * Math.PI * (s - 40)) / 120) : 0;
      push(B0.x + dir.x * s + perp.x * off, B0.y + dir.y * s + perp.y * off);
    }
    // 4. hairpin arc
    marks.hairpin = dense.length;
    const span4 = Math.PI + 2 * a;
    for (let s = 0; s < span4 * r1; s += step) {
      const t = Math.PI - a + s / r1;
      push(r1 * Math.cos(t), r1 * Math.sin(t));
    }
    // cumulative distance
    const cum = [0];
    for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + dense[i].distanceTo(dense[i - 1]));
    const total = cum[cum.length - 1] + dense[dense.length - 1].distanceTo(dense[0]);
    const startOffset = 70; // start line 70 m into the right straight
    const secStart = {};
    for (const k in marks) secStart[k] = (cum[marks[k]] - startOffset + total) % total;
    this.sections = secStart;

    // resample uniformly (1 sample ≈ 1 m)
    const N = Math.round(total);
    this.length = total;
    const spacing = total / N;
    this.spacing = spacing;
    const pts = [];
    let j = 0;
    for (let i = 0; i < N; i++) {
      const d = (i * spacing + startOffset) % total;
      // find segment
      while (!(cum[j] <= d && (j + 1 >= cum.length ? total : cum[j + 1]) > d)) j = (j + 1) % cum.length;
      const d0 = cum[j];
      const d1 = j + 1 >= cum.length ? total : cum[j + 1];
      const p0 = dense[j];
      const p1 = dense[(j + 1) % dense.length];
      const t = (d - d0) / (d1 - d0);
      pts.push(new THREE.Vector2(p0.x + (p1.x - p0.x) * t, p0.y + (p1.y - p0.y) * t));
    }

    // features in race distance
    const S = this.sections;
    const wrap = (d) => ((d % total) + total) % total;
    this.features = {
      crest: { center: wrap(S.rightStraight + 205), half: 26, amp: 7.5 },
      boost: { d0: wrap(40), d1: wrap(48), lat0: -9, lat1: -2 },
      voidZone: { d0: wrap(S.leftStraight + 170), d1: wrap(S.leftStraight + 240) },
      ramp: { d0: wrap(S.leftStraight + 255), d1: wrap(S.leftStraight + 265), lat: 6, rise: 1.4, boost: 9 },
      sweeper: { d0: S.sweeper, d1: S.leftStraight },
      hairpin: { d0: S.hairpin, d1: wrap(S.hairpin + span4 * r1) },
    };
    const F = this.features;
    const inRange = (d, a0, a1) => (a0 <= a1 ? d >= a0 && d < a1 : d >= a0 || d < a1);
    const elev = (d) => {
      let e = 0;
      const x = d - F.crest.center;
      if (Math.abs(x) < F.crest.half) e += F.crest.amp * Math.pow(Math.cos((Math.PI * x) / (F.crest.half * 2)), 2);
      e += 4 * (smoothstep(S.sweeper - 30, S.sweeper + 120, d) - smoothstep(S.leftStraight + 60, S.leftStraight + 180, d));
      return e;
    };
    this._inRange = inRange;

    // frames
    const samples = [];
    for (let i = 0; i < N; i++) {
      const d = i * spacing;
      samples.push({
        index: i,
        distance: d,
        position: new THREE.Vector3(pts[i].x, elev(d), pts[i].y),
        tangent: new THREE.Vector3(),
        right: new THREE.Vector3(),
        up: new THREE.Vector3(),
        halfWidth: HALF_WIDTH,
        wallOffset: WALL,
        curvature: 0,
        bank: 0,
      });
    }
    const up0 = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < N; i++) {
      const s = samples[i];
      const p = samples[(i - 1 + N) % N].position;
      const n = samples[(i + 1) % N].position;
      s.tangent.subVectors(n, p).normalize();
    }
    for (let i = 0; i < N; i++) {
      const s = samples[i];
      const p = samples[(i - 1 + N) % N];
      const n = samples[(i + 1) % N];
      const h0 = Math.atan2(p.tangent.x, p.tangent.z);
      const h1 = Math.atan2(n.tangent.x, n.tangent.z);
      let dh = h1 - h0;
      while (dh > Math.PI) dh -= Math.PI * 2;
      while (dh < -Math.PI) dh += Math.PI * 2;
      s.curvature = -dh / (2 * spacing);
      const d = s.distance;
      let bank = 0;
      if (inRange(d, F.sweeper.d0, F.sweeper.d1)) bank = 0.16 * smoothstep(0, 30, d - F.sweeper.d0) * smoothstep(0, 30, F.sweeper.d1 - d);
      if (inRange(d, F.hairpin.d0, F.hairpin.d1)) bank = 0.1;
      s.bank = bank;
      if (inRange(d, F.sweeper.d0, F.sweeper.d1)) s.wallOffset = 22;
      if (inRange(d, F.voidZone.d0, F.voidZone.d1)) s.wallOffset = null;
      const right = new THREE.Vector3().crossVectors(s.tangent, up0).normalize();
      const up = new THREE.Vector3().crossVectors(right, s.tangent).normalize();
      s.right.copy(right).multiplyScalar(Math.cos(bank)).addScaledVector(up, -Math.sin(bank)).normalize();
      s.up.copy(up).multiplyScalar(Math.cos(bank)).addScaledVector(right, Math.sin(bank)).normalize();
    }
    this.samples = samples;

    // gameplay objects
    const fr = (d, lat) => this.getFrameAtDistance(d, lat);
    const bp = fr((F.boost.d0 + F.boost.d1) / 2, (F.boost.lat0 + F.boost.lat1) / 2);
    this.boostPads = [{ position: bp.position.clone(), tangent: bp.tangent.clone(), width: F.boost.lat1 - F.boost.lat0, length: F.boost.d1 - F.boost.d0, distance: F.boost.d0 }];
    const rp = fr(F.ramp.d1, 0);
    this.ramps = [{ distance: F.ramp.d0, position: rp.position.clone(), tangent: rp.tangent.clone() }];
    this.obstacles = [
      { position: fr(S.sweeper + 25, 16).position.clone(), radius: 1.3 },
      { position: fr(S.sweeper + 130, -8).position.clone(), radius: 1.6 },
      { position: fr(S.sweeper + 190, 16).position.clone(), radius: 1.4 },
      { position: fr(S.hairpin - 50, -16).position.clone(), radius: 1.2 },
    ];
    this.itemBoxPositions = [];
    for (const lat of [-6, -2, 2, 6]) this.itemBoxPositions.push(fr(S.sweeper - 60, lat).position.clone().add(new THREE.Vector3(0, 1.3, 0)));
    this.coinPositions = [];
    for (let k = 0; k < 6; k++) this.coinPositions.push(fr(110 + k * 4, 5).position.clone().add(new THREE.Vector3(0, 1, 0)));
    this.minimap = { path: samples.filter((_, i) => i % 5 === 0).map((s) => ({ x: s.position.x, z: s.position.z })), bounds: null };
    const xs = samples.map((s) => s.position.x);
    const zs = samples.map((s) => s.position.z);
    this.minimap.bounds = { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) };
  }

  /** @returns {object} TrackQuery */
  queryPosition(position, hintIndex, out) {
    const samples = this.samples;
    const N = samples.length;
    out = out || {
      center: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      right: new THREE.Vector3(),
      up: new THREE.Vector3(),
      groundNormal: new THREE.Vector3(),
    };
    if (!out.center) out.center = new THREE.Vector3();
    if (!out.tangent) out.tangent = new THREE.Vector3();
    if (!out.right) out.right = new THREE.Vector3();
    if (!out.up) out.up = new THREE.Vector3();
    if (!out.groundNormal) out.groundNormal = new THREE.Vector3();
    let best = -1;
    let bestD = Infinity;
    const px = position.x;
    const pz = position.z;
    if (hintIndex !== undefined && hintIndex !== null && hintIndex >= 0) {
      for (let k = -40; k <= 40; k++) {
        const i = (((hintIndex + k) % N) + N) % N;
        const s = samples[i].position;
        const d = (s.x - px) ** 2 + (s.z - pz) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    if (best < 0 || bestD > 40 * 40) {
      for (let i = 0; i < N; i++) {
        const s = samples[i].position;
        const d = (s.x - px) ** 2 + (s.z - pz) ** 2;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    // pick segment (best, best+1) or (best-1, best)
    const s0 = samples[best];
    const sn = samples[(best + 1) % N];
    const sp = samples[(best - 1 + N) % N];
    let a = s0;
    let b = sn;
    let t = this._proj(px, pz, s0.position, sn.position);
    if (t <= 0) {
      a = sp;
      b = s0;
      t = this._proj(px, pz, sp.position, s0.position);
    }
    t = Math.min(1, Math.max(0, t));
    out.index = best;
    out.center.lerpVectors(a.position, b.position, t);
    out.tangent.lerpVectors(a.tangent, b.tangent, t).normalize();
    out.right.lerpVectors(a.right, b.right, t).normalize();
    out.up.lerpVectors(a.up, b.up, t).normalize();
    let dist = a.distance + t * this.spacing;
    if (b.index === 0 && a.index === N - 1) dist = a.distance + t * (this.length - a.distance);
    out.distance = dist % this.length;
    out.progress = out.distance / this.length;
    const rx = out.right.x;
    const rz = out.right.z;
    const rl2 = rx * rx + rz * rz;
    const lateral = ((px - out.center.x) * rx + (pz - out.center.z) * rz) / rl2;
    out.lateral = lateral;
    out.halfWidth = t < 0.5 ? a.halfWidth : b.halfWidth;
    out.wallOffset = a.wallOffset === null || b.wallOffset === null ? null : t < 0.5 ? a.wallOffset : b.wallOffset;
    out.groundHeight = out.center.y + out.right.y * lateral;
    out.groundNormal.copy(out.up);
    out.rampBoost = 0;
    const F = this.features;
    const d = out.distance;
    const al = Math.abs(lateral);
    let surface = SURFACES.ROAD;
    if (out.wallOffset === null && al > out.halfWidth + 1) surface = SURFACES.VOID;
    else if (al > out.halfWidth) surface = SURFACES.OFFROAD;
    else if (this._inRange(d, F.boost.d0, F.boost.d1) && lateral >= F.boost.lat0 && lateral <= F.boost.lat1) surface = SURFACES.BOOST;
    else if (this._inRange(d, F.ramp.d0, F.ramp.d1) && al < F.ramp.lat) {
      surface = SURFACES.RAMP;
      const k = (d - F.ramp.d0) / (F.ramp.d1 - F.ramp.d0);
      out.groundHeight += F.ramp.rise * k;
      const slope = F.ramp.rise / (F.ramp.d1 - F.ramp.d0);
      out.groundNormal.copy(out.up).addScaledVector(out.tangent, -slope).normalize();
      out.rampBoost = F.ramp.boost;
    }
    out.surface = surface;
    return out;
  }

  _proj(px, pz, a, b) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const l2 = dx * dx + dz * dz || 1;
    return ((px - a.x) * dx + (pz - a.z) * dz) / l2;
  }

  getFrameAtDistance(distance, lateral = 0, out) {
    out = out || { position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), distance: 0 };
    const N = this.samples.length;
    const d = ((distance % this.length) + this.length) % this.length;
    const f = d / this.spacing;
    const i = Math.floor(f) % N;
    const t = f - Math.floor(f);
    const a = this.samples[i];
    const b = this.samples[(i + 1) % N];
    out.tangent.lerpVectors(a.tangent, b.tangent, t).normalize();
    out.right.lerpVectors(a.right, b.right, t).normalize();
    out.up.lerpVectors(a.up, b.up, t).normalize();
    out.position.lerpVectors(a.position, b.position, t).addScaledVector(out.right, lateral);
    out.distance = d;
    return out;
  }

  getStartGrid(count) {
    const grid = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const d = this.length - 5 - row * 6 - col * 3;
      const f = this.getFrameAtDistance(d, col ? 3.5 : -3.5);
      grid.push({ position: f.position.clone(), heading: Math.atan2(f.tangent.x, f.tangent.z), distance: d });
    }
    return grid;
  }

  // ------------------------------------------------------------------------- visuals

  async build(scene, renderer, onProgress) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'MockTrack';
    scene.add(this.group);
    scene.background = new THREE.Color(this.theme.skyBottom);
    scene.fog = new THREE.Fog(this.theme.fogColor, this.theme.fogNear, this.theme.fogFar);

    const hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a6b3a, 1.0);
    this.group.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -45;
    sc.right = 45;
    sc.top = 45;
    sc.bottom = -45;
    sc.near = 1;
    sc.far = 200;
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.03;
    this.sunOffset = new THREE.Vector3(40, 70, 25);
    this.group.add(sun);
    this.group.add(sun.target);
    this.sunLight = sun;

    const N = this.samples.length;
    const ribbon = (latA, latB, yA, yB, filter, mat, uScale = 1) => {
      const pos = [];
      const uv = [];
      const idx = [];
      let vcount = 0;
      let prevOk = false;
      for (let i = 0; i <= N; i++) {
        const s = this.samples[i % N];
        const ok = filter(s);
        const pa = s.position.clone().addScaledVector(s.right, typeof latA === 'function' ? latA(s) : latA);
        const pb = s.position.clone().addScaledVector(s.right, typeof latB === 'function' ? latB(s) : latB);
        pa.y += yA;
        pb.y += yB;
        pos.push(pa.x, pa.y, pa.z, pb.x, pb.y, pb.z);
        const v = (i * this.spacing) / 8;
        uv.push(0, v, uScale, v);
        if (i > 0 && ok && prevOk) {
          const a = vcount - 2;
          const b = vcount - 1;
          const c = vcount;
          const d = vcount + 1;
          idx.push(a, b, c, b, d, c);
        }
        prevOk = ok;
        vcount += 2;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      this.group.add(m);
      return m;
    };
    const canvasTex = (w, h, draw, repeat = true) => {
      if (typeof document === 'undefined') return null;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      draw(c.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
      return t;
    };
    const roadTex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#4a4d55';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2500; i++) {
        g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},${Math.random() * 0.08})`;
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      g.fillStyle = '#f2f2f2';
      g.fillRect(6, 0, 6, h);
      g.fillRect(w - 12, 0, 6, h);
      g.fillStyle = '#ffd34a';
      g.fillRect(w / 2 - 3, 0, 6, h / 2);
    });
    const grassTex = canvasTex(128, 128, (g, w, h) => {
      g.fillStyle = '#5c9a3c';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1400; i++) {
        g.fillStyle = `rgba(${30 + Math.random() * 60},${90 + Math.random() * 80},${20 + Math.random() * 30},0.5)`;
        g.fillRect(Math.random() * w, Math.random() * h, 2, 3);
      }
    });
    const kerbTex = canvasTex(16, 64, (g, w, h) => {
      g.fillStyle = '#e8322e';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h / 2);
    });
    const wallTex = canvasTex(64, 64, (g, w, h) => {
      g.fillStyle = '#d8dde6';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#2f6bff';
      g.fillRect(0, h * 0.35, w, h * 0.3);
    });
    const all = () => true;
    const road = ribbon(-HALF_WIDTH, HALF_WIDTH, 0, 0, all, new THREE.MeshStandardMaterial({ map: roadTex, color: roadTex ? 0xffffff : 0x4a4d55, roughness: 0.85 }));
    road.name = 'road';
    ribbon(-HALF_WIDTH - 0.8, -HALF_WIDTH, 0.03, 0.03, all, new THREE.MeshStandardMaterial({ map: kerbTex, color: kerbTex ? 0xffffff : 0xe8322e, roughness: 0.6 }));
    ribbon(HALF_WIDTH, HALF_WIDTH + 0.8, 0.03, 0.03, all, new THREE.MeshStandardMaterial({ map: kerbTex, color: kerbTex ? 0xffffff : 0xe8322e, roughness: 0.6 }));
    const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, color: grassTex ? 0xffffff : 0x5c9a3c, roughness: 1 });
    const hasWall = (s) => s.wallOffset !== null;
    ribbon((s) => -(s.wallOffset ?? HALF_WIDTH + 1), -HALF_WIDTH, -0.02, -0.02, all, grassMat, 4);
    ribbon(HALF_WIDTH, (s) => s.wallOffset ?? HALF_WIDTH + 1, -0.02, -0.02, all, grassMat, 4);
    // walls
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, color: wallTex ? 0xffffff : 0xd8dde6, roughness: 0.5, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const pos = [];
      const uv = [];
      const idx = [];
      let vc = 0;
      for (let i = 0; i <= N; i++) {
        const s = this.samples[i % N];
        const wo = s.wallOffset ?? WALL;
        const p = s.position.clone().addScaledVector(s.right, side * wo);
        pos.push(p.x, p.y - 0.3, p.z, p.x, p.y + 1.1, p.z);
        uv.push(i * 0.25, 0, i * 0.25, 1);
        const sPrev = this.samples[(i - 1 + N) % N];
        if (i > 0 && hasWall(s) && hasWall(sPrev)) idx.push(vc - 2, vc, vc - 1, vc - 1, vc, vc + 1);
        vc += 2;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, wallMat);
      m.castShadow = true;
      m.receiveShadow = true;
      this.group.add(m);
    }
    // terrain skirts (mesa) outside the walls
    const dirtMat = new THREE.MeshStandardMaterial({ color: 0x6f9a4a, roughness: 1 });
    ribbon((s) => -(s.wallOffset ?? WALL) - 70, (s) => -(s.wallOffset ?? WALL), -26, 0, hasWall, dirtMat);
    ribbon((s) => s.wallOffset ?? WALL, (s) => (s.wallOffset ?? WALL) + 70, 0, -26, hasWall, dirtMat);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(900, 48), new THREE.MeshStandardMaterial({ color: 0x3c6b38, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -26;
    ground.receiveShadow = true;
    this.group.add(ground);

    // boost pad
    const F = this.features;
    const padTex = canvasTex(64, 128, (g, w, h) => {
      g.fillStyle = '#ff7a00';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffe14a';
      for (let k = 0; k < 3; k++) {
        g.beginPath();
        const y = 10 + k * 40;
        g.moveTo(6, y + 30);
        g.lineTo(w / 2, y);
        g.lineTo(w - 6, y + 30);
        g.lineTo(w - 6, y + 40);
        g.lineTo(w / 2, y + 12);
        g.lineTo(6, y + 40);
        g.fill();
      }
    });
    {
      const bp = this.boostPads[0];
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(bp.width, bp.length),
        new THREE.MeshStandardMaterial({ map: padTex, color: 0xffffff, emissive: 0xff8a00, emissiveIntensity: 0.6, emissiveMap: padTex }),
      );
      m.position.copy(bp.position).add(new THREE.Vector3(0, 0.05, 0));
      m.rotation.order = 'YXZ';
      m.rotation.set(-Math.PI / 2, Math.atan2(bp.tangent.x, bp.tangent.z) + Math.PI, 0);
      this.group.add(m);
    }
    // ramp wedge (matches the query: rises F.ramp.rise over its length)
    {
      const pos = [];
      const idx = [];
      const steps = 10;
      for (let k = 0; k <= steps; k++) {
        const d = F.ramp.d0 + ((F.ramp.d1 - F.ramp.d0) * k) / steps;
        const h = (F.ramp.rise * k) / steps;
        for (const lat of [-F.ramp.lat, F.ramp.lat]) {
          const f = this.getFrameAtDistance(d, lat);
          pos.push(f.position.x, f.position.y + h + 0.01, f.position.z);
          pos.push(f.position.x, f.position.y, f.position.z);
        }
      }
      for (let k = 0; k < steps; k++) {
        const a = k * 4;
        const b = (k + 1) * 4;
        idx.push(a, b + 2, a + 2, a, b, b + 2); // top
        idx.push(a + 1, a, b, a + 1, b, b + 1); // side L
        idx.push(a + 3, b + 3, b + 2, a + 3, b + 2, a + 2); // side R
      }
      const e = steps * 4;
      idx.push(e, e + 1, e + 3, e, e + 3, e + 2); // lip face
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xffb020, roughness: 0.5, side: THREE.DoubleSide }));
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    }
    // obstacles
    for (const o of this.obstacles) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(o.radius, o.radius * 1.15, 3.5, 16), new THREE.MeshStandardMaterial({ color: 0x8a7f74, roughness: 0.9 }));
      m.position.copy(o.position).add(new THREE.Vector3(0, 1.6, 0));
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
    }
    // start line
    const chk = canvasTex(64, 16, (g, w, h) => {
      for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
        g.fillStyle = (x + y) % 2 ? '#111' : '#fff';
        g.fillRect(x * 4, y * 4, 4, 4);
      }
    }, false);
    {
      const f = this.getFrameAtDistance(0, 0);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(HALF_WIDTH * 2, 3), new THREE.MeshStandardMaterial({ map: chk, color: 0xffffff }));
      m.position.copy(f.position).add(new THREE.Vector3(0, 0.04, 0));
      m.rotation.order = 'YXZ';
      m.rotation.set(-Math.PI / 2, Math.atan2(f.tangent.x, f.tangent.z), 0);
      this.group.add(m);
    }
    // item boxes (just markers)
    for (const p of this.itemBoxPositions) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), new THREE.MeshStandardMaterial({ color: 0x55ccff, emissive: 0x2266ff, emissiveIntensity: 0.4, transparent: true, opacity: 0.7 }));
      m.position.copy(p);
      this.group.add(m);
    }
    if (onProgress) onProgress(1);
  }

  update(dt, time, focusPosition) {
    if (this.sunLight && focusPosition) {
      this.sunLight.target.position.copy(focusPosition);
      this.sunLight.position.copy(focusPosition).add(this.sunOffset);
      this.sunLight.target.updateMatrixWorld();
    }
  }

  dispose() {
    if (this.group) {
      this.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
      this.group.removeFromParent();
    }
  }
}
