/**
 * Mock Track / Kart / RaceManager implementing the parts of the ARCHITECTURE.md
 * contracts that ItemSystem and AIDriver consume. Dev-only.
 */
import * as THREE from 'three';
import { EVENTS, SURFACES, DRIFT_LEVELS, MAX_COINS, COIN_SPEED_BONUS, GRAVITY, BASE_MAX_SPEED } from '../src/core/constants.js';

// --------------------------------------------------------------------- track

const LAYOUTS = {
  // control points (x, z, y)
  loop: [
    [0, 0, 0],
    [0, 160, 0],
    [20, 260, 2],
    [90, 300, 4],
    [170, 270, 5],
    [190, 190, 4],
    [150, 130, 3],
    [150, 80, 2],
    [210, 40, 2],
    [260, 60, 3],
    [300, 10, 2],
    [280, -80, 1],
    [200, -120, 0],
    [120, -100, 0],
    [60, -140, 0],
    [10, -110, 0],
  ],
};

export class MockTrack {
  constructor(id = 'loop') {
    this.id = id;
    this.name = 'Mock Loop';
    this.def = { id, name: this.name, laps: 3 };
    this.theme = {
      skyTop: 0x4aa3ff,
      skyBottom: 0xcfe9ff,
      fogColor: 0xcfe9ff,
      fogNear: 120,
      fogFar: 900,
      dustColor: 0xc8b48a,
      offroadColor: 0x6aa84f,
      sparkTint: 0xffffff,
      isNight: false,
    };
    const pts = LAYOUTS[id].map(([x, z, y]) => new THREE.Vector3(x, y, z));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const length = this.curve.getLength();
    const N = Math.round(length);
    this.length = length;
    const up = new THREE.Vector3(0, 1, 0);
    this.samples = [];
    for (let i = 0; i < N; i++) {
      const u = i / N;
      const position = this.curve.getPointAt(u);
      const tangent = this.curve.getTangentAt(u).normalize();
      const right = tangent.clone().cross(up).normalize();
      const d = i * (length / N);
      const halfWidth = 11 + Math.sin(u * Math.PI * 6) * 1.5;
      // void edges between 30% and 40% of the lap (a "sky bridge")
      const voidSection = u > 0.3 && u < 0.4;
      this.samples.push({
        index: i,
        distance: d,
        position,
        tangent,
        right,
        up: up.clone(),
        halfWidth,
        wallOffset: voidSection ? null : halfWidth + 4.5,
        curvature: 0,
        bank: 0,
      });
    }
    // curvature (+ = turning right)
    const n = this.samples.length;
    for (let i = 0; i < n; i++) {
      const a = this.samples[(i - 3 + n) % n];
      const b = this.samples[(i + 3) % n];
      const dT = b.tangent.clone().sub(a.tangent).divideScalar(6);
      this.samples[i].curvature = dT.dot(this.samples[i].right);
    }
    this.spacing = length / n;
    const frame = (d, lat = 0) => this.getFrameAtDistance(d, lat);
    this.itemBoxPositions = [];
    for (const d of [160, 560, 900]) {
      for (const lat of [-7.5, -2.5, 2.5, 7.5]) {
        const f = frame(d, lat);
        this.itemBoxPositions.push(f.position.clone().add(new THREE.Vector3(0, 1.3, 0)));
      }
    }
    this.coinPositions = [];
    for (const [d, lat] of [
      [70, 4],
      [300, -5],
      [470, 0],
      [700, 6],
      [1000, -3],
    ]) {
      for (let k = 0; k < 5; k++) {
        const f = frame(d + k * 3, lat);
        this.coinPositions.push(f.position.clone().add(new THREE.Vector3(0, 1.0, 0)));
      }
    }
    this.boostPads = [];
    for (const [d, lat] of [
      [250, 3],
      [760, -4],
    ]) {
      const f = frame(d, lat);
      this.boostPads.push({ position: f.position.clone(), tangent: f.tangent.clone(), width: 4, length: 6, distance: d, lateral: lat });
    }
    this.ramps = [];
    this.obstacles = [];
    for (const [d, lat, r] of [
      [430, 8.5, 1.3],
      [820, -9, 1.6],
      [640, 0, 1.4],
    ]) {
      const f = frame(d, lat);
      this.obstacles.push({ position: f.position.clone(), radius: r });
    }
    this.minimap = {
      path: this.samples.filter((_, i) => i % 5 === 0).map((s) => ({ x: s.position.x, z: s.position.z })),
      bounds: this._bounds(),
    };
    this.sunLight = null;
  }

  _bounds() {
    const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
    for (const s of this.samples) {
      b.minX = Math.min(b.minX, s.position.x);
      b.maxX = Math.max(b.maxX, s.position.x);
      b.minZ = Math.min(b.minZ, s.position.z);
      b.maxZ = Math.max(b.maxZ, s.position.z);
    }
    return b;
  }

  async build(scene) {
    this.scene = scene;
    const group = new THREE.Group();
    this.group = group;
    const n = this.samples.length;
    const road = [];
    const grassL = [];
    const grassR = [];
    const idx = [];
    const v = new THREE.Vector3();
    for (let i = 0; i <= n; i++) {
      const s = this.samples[i % n];
      const outer = s.wallOffset ?? s.halfWidth + 0.5;
      v.copy(s.position).addScaledVector(s.right, -s.halfWidth);
      road.push(v.x, v.y + 0.01, v.z);
      v.copy(s.position).addScaledVector(s.right, s.halfWidth);
      road.push(v.x, v.y + 0.01, v.z);
      v.copy(s.position).addScaledVector(s.right, -outer);
      grassL.push(v.x, v.y, v.z);
      v.copy(s.position).addScaledVector(s.right, -s.halfWidth);
      grassL.push(v.x, v.y, v.z);
      v.copy(s.position).addScaledVector(s.right, s.halfWidth);
      grassR.push(v.x, v.y, v.z);
      v.copy(s.position).addScaledVector(s.right, outer);
      grassR.push(v.x, v.y, v.z);
      if (i < n) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const strip = (arr, color) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide }));
      m.receiveShadow = true;
      group.add(m);
      return m;
    };
    strip(road, 0x6b6f78);
    strip(grassL, 0x5fa346);
    strip(grassR, 0x5fa346);
    // centre dashes + start line
    const dashGeo = new THREE.PlaneGeometry(0.4, 3);
    dashGeo.rotateX(-Math.PI / 2);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const dashes = new THREE.InstancedMesh(dashGeo, dashMat, Math.ceil(n / 12));
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    let c = 0;
    for (let i = 0; i < n; i += 12) {
      const s = this.samples[i];
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.tangent.clone().setY(0).normalize());
      m4.compose(s.position.clone().add(new THREE.Vector3(0, 0.03, 0)), q, new THREE.Vector3(1, 1, 1));
      dashes.setMatrixAt(c++, m4);
    }
    group.add(dashes);
    const line = new THREE.Mesh(new THREE.PlaneGeometry(this.samples[0].halfWidth * 2, 2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    line.rotation.x = -Math.PI / 2;
    line.rotation.z = Math.atan2(this.samples[0].tangent.x, this.samples[0].tangent.z);
    line.position.copy(this.samples[0].position).add(new THREE.Vector3(0, 0.04, 0));
    group.add(line);
    // walls
    const wallGeo = new THREE.BoxGeometry(0.6, 1.0, 1.2);
    const wallCount = n * 2;
    const walls = new THREE.InstancedMesh(wallGeo, new THREE.MeshStandardMaterial({ color: 0xffffff }), wallCount);
    walls.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(wallCount * 3), 3);
    c = 0;
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const s = this.samples[i];
      if (s.wallOffset === null) continue;
      q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), s.tangent.clone().setY(0).normalize());
      for (const side of [-1, 1]) {
        v.copy(s.position).addScaledVector(s.right, side * (s.wallOffset + 0.3));
        v.y += 0.5;
        m4.compose(v, q, new THREE.Vector3(1, 1, 1));
        walls.setMatrixAt(c, m4);
        col.set(Math.floor(i / 4) % 2 ? 0xe23b3b : 0xffffff);
        walls.setColorAt(c, col);
        c++;
      }
    }
    walls.count = c;
    walls.castShadow = true;
    group.add(walls);
    // boost pads
    for (const p of this.boostPads) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(p.width, p.length), new THREE.MeshBasicMaterial({ color: 0xff8a1f }));
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = Math.atan2(p.tangent.x, p.tangent.z);
      m.position.copy(p.position).add(new THREE.Vector3(0, 0.05, 0));
      group.add(m);
    }
    for (const o of this.obstacles) {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(o.radius, o.radius, 4, 20),
        new THREE.MeshStandardMaterial({ color: 0x8a7a6a }),
      );
      m.position.copy(o.position).add(new THREE.Vector3(0, 2, 0));
      m.castShadow = true;
      group.add(m);
    }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: 0x3d6b4a }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -30;
    group.add(ground);
    scene.add(group);
  }

  _nearest(position, hint) {
    const n = this.samples.length;
    let best = -1;
    let bestD = Infinity;
    if (hint !== undefined && hint !== null && hint >= 0) {
      for (let k = -40; k <= 40; k++) {
        const i = (((hint + k) % n) + n) % n;
        const p = this.samples[i].position;
        const dx = p.x - position.x;
        const dz = p.z - position.z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (bestD < 40 * 40) return best;
    }
    for (let i = 0; i < n; i++) {
      const p = this.samples[i].position;
      const dx = p.x - position.x;
      const dz = p.z - position.z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  queryPosition(position, hintIndex, out = {}) {
    const n = this.samples.length;
    const i = this._nearest(position, hintIndex);
    const s = this.samples[i];
    // along-track offset relative to sample (project on tangent)
    const dx = position.x - s.position.x;
    const dz = position.z - s.position.z;
    const along = dx * s.tangent.x + dz * s.tangent.z;
    const lateral = dx * s.right.x + dz * s.right.z;
    let distance = s.distance + along;
    distance = ((distance % this.length) + this.length) % this.length;
    // interpolate height
    const j = along >= 0 ? (i + 1) % n : (i - 1 + n) % n;
    const t = Math.min(1, Math.abs(along) / this.spacing);
    const gy = s.position.y + (this.samples[j].position.y - s.position.y) * t;
    out.index = i;
    out.distance = distance;
    out.progress = distance / this.length;
    out.lateral = lateral;
    (out.center ||= new THREE.Vector3()).copy(s.position);
    (out.tangent ||= new THREE.Vector3()).copy(s.tangent);
    (out.right ||= new THREE.Vector3()).copy(s.right);
    (out.up ||= new THREE.Vector3()).set(0, 1, 0);
    out.halfWidth = s.halfWidth;
    out.wallOffset = s.wallOffset;
    out.groundHeight = gy;
    (out.groundNormal ||= new THREE.Vector3()).set(0, 1, 0);
    const al = Math.abs(lateral);
    let surface = SURFACES.ROAD;
    if (al > s.halfWidth) surface = SURFACES.OFFROAD;
    if (s.wallOffset === null && al > s.halfWidth + 1) surface = SURFACES.VOID;
    if (surface === SURFACES.ROAD) {
      for (const p of this.boostPads) {
        let dd = distance - p.distance;
        if (dd > this.length / 2) dd -= this.length;
        if (dd < -this.length / 2) dd += this.length;
        if (Math.abs(dd) < p.length / 2 && Math.abs(lateral - p.lateral) < p.width / 2) surface = SURFACES.BOOST;
      }
    }
    out.surface = surface;
    out.rampBoost = 0;
    return out;
  }

  getFrameAtDistance(distance, lateral = 0, out = {}) {
    const L = this.length;
    const d = ((distance % L) + L) % L;
    const f = d / this.spacing;
    const n = this.samples.length;
    const i0 = Math.floor(f) % n;
    const i1 = (i0 + 1) % n;
    const t = f - Math.floor(f);
    const a = this.samples[i0];
    const b = this.samples[i1];
    (out.position ||= new THREE.Vector3()).lerpVectors(a.position, b.position, t);
    (out.tangent ||= new THREE.Vector3()).lerpVectors(a.tangent, b.tangent, t).normalize();
    (out.right ||= new THREE.Vector3()).lerpVectors(a.right, b.right, t).normalize();
    (out.up ||= new THREE.Vector3()).set(0, 1, 0);
    out.position.addScaledVector(out.right, lateral);
    out.distance = d;
    return out;
  }

  getStartGrid(count) {
    const res = [];
    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / 2);
      const side = i % 2 === 0 ? -1 : 1;
      const d = this.length - (6 + row * 6 + (i % 2) * 3);
      const f = this.getFrameAtDistance(d, side * 3.5);
      res.push({ position: f.position.clone(), heading: Math.atan2(f.tangent.x, f.tangent.z), distance: d });
    }
    return res;
  }

  update() {}

  dispose() {
    if (this.group) this.scene.remove(this.group);
  }
}

// ---------------------------------------------------------------------- kart

const KART_COLORS = [0xe8423a, 0x3a8ee8, 0x3ac46a, 0xf2c230, 0xa65ae8, 0xf28a30, 0x2ad1c9, 0xf25aa8];

export class MockKart {
  constructor({ character = null, index = 0, isPlayer = false, bus, engineClass = 150 } = {}) {
    this.index = index;
    this.character = character || { id: `mock${index}`, name: `Mock ${index}`, cssColor: '#fff' };
    this.name = this.character.name;
    this.isPlayer = isPlayer;
    this.isAI = !isPlayer;
    this.bus = bus;
    this.engineClass = engineClass;
    this.color = KART_COLORS[index % KART_COLORS.length];
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.heading = 0;
    this.quaternion = new THREE.Quaternion();
    this.forward = new THREE.Vector3(0, 0, 1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.speed = 0;
    this.baseMax = BASE_MAX_SPEED * (engineClass === 200 ? 1.18 : engineClass === 100 ? 0.89 : engineClass === 50 ? 0.78 : 1);
    this.maxSpeed = this.baseMax;
    this.radius = 1.25;
    this.weight = 1;
    this.isAirborne = false;
    this.surface = SURFACES.ROAD;
    this.isDrifting = false;
    this.driftDirection = 1;
    this.driftLevel = 0;
    this.driftCharge = 0;
    this.boostTimer = 0;
    this.starTimer = 0;
    this.ghostTimer = 0;
    this.spinoutTimer = 0;
    this.tumble = false;
    this.shrinkTimer = 0;
    this.coins = 0;
    this.speedScale = 1;
    this.trackInfo = {
      index: 0,
      distance: 0,
      progress: 0,
      lateral: 0,
      center: new THREE.Vector3(),
      tangent: new THREE.Vector3(0, 0, 1),
      right: new THREE.Vector3(-1, 0, 0),
      up: new THREE.Vector3(0, 1, 0),
      halfWidth: 12,
      wallOffset: null,
      groundHeight: 0,
      groundNormal: new THREE.Vector3(0, 1, 0),
      surface: SURFACES.ROAD,
      rampBoost: 0,
    };
    this._hasInfo = false;
    this.trackHint = -1;
    this.lastSafeDistance = 0;
    this.frozen = false;
    this.controls = { throttle: 0, brake: 0, steer: 0, drift: false, item: false, itemPressed: false, lookBack: false };
    this.racePosition = 1;
    this.lap = 0;
    this.finished = false;
    this.finishTime = null;
    this.raceDistance = 0;
    this._prevDrift = false;
    this._fallTimer = 0;
    this._vy = 0;
    this._spinAngle = 0;
    this.stats = { wallHits: 0, spins: 0, launches: 0, falls: 0 };
    this._buildMesh();
  }

  get isBoosting() {
    return this.boostTimer > 0;
  }
  get isInvincible() {
    return this.starTimer > 0 || this.ghostTimer > 0;
  }
  get isSpunOut() {
    return this.spinoutTimer > 0;
  }
  get isShrunk() {
    return this.shrinkTimer > 0;
  }

  _buildMesh() {
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);
    const mat = new THREE.MeshStandardMaterial({ color: this.color, roughness: 0.4, metalness: 0.1 });
    this._bodyMat = mat;
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.45, 2.3), mat);
    chassis.position.y = 0.45;
    chassis.castShadow = true;
    body.add(chassis);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffe0c0 }));
    head.position.set(0, 1.15, -0.2);
    head.castShadow = true;
    body.add(head);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.41, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    helmet.position.copy(head.position);
    body.add(helmet);
    const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.3, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    const wm = new THREE.MeshStandardMaterial({ color: 0x222222 });
    this.anchors = {};
    for (const [n, x, z] of [
      ['wheelFL', 0.85, 0.8],
      ['wheelFR', -0.85, 0.8],
      ['wheelRL', 0.85, -0.8],
      ['wheelRR', -0.85, -0.8],
    ]) {
      const w = new THREE.Mesh(wheelGeo, wm);
      w.position.set(x, 0.33, z);
      w.castShadow = true;
      body.add(w);
      this.anchors[n] = w;
    }
    const hold = new THREE.Object3D();
    hold.position.set(0.55, 1.35, 0.35);
    body.add(hold);
    this.anchors.itemHold = hold;
    const ex = new THREE.Object3D();
    ex.position.set(0.3, 0.5, -1.2);
    body.add(ex);
    this.anchors.exhaustL = ex;
    this.anchors.exhaustR = ex;
    this.anchors.body = body;
    this.mesh = g;
    this._body = body;
  }

  placeAtStart({ position, heading }) {
    this.position.copy(position);
    this.heading = heading;
    this.speed = 0;
    this.velocity.set(0, 0, 0);
    this.spinoutTimer = 0;
    this.boostTimer = 0;
    this.starTimer = 0;
    this.shrinkTimer = 0;
    this.ghostTimer = 0;
    this.isDrifting = false;
    this.driftLevel = 0;
    this.driftCharge = 0;
    this.coins = 0;
    this.trackHint = -1;
    this.isAirborne = false;
    this._fallTimer = 0;
    this._updateBasis();
  }

  _updateBasis() {
    this.forward.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    this.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.heading);
  }

  update(dt, track) {
    const c = this.controls;
    if (this.frozen) {
      this.trackInfo = track.queryPosition(this.position, this.trackHint, this.trackInfo);
      this._hasInfo = true;
      this.trackHint = this.trackInfo.index;
      return;
    }
    this.boostTimer = Math.max(0, this.boostTimer - dt);
    this.starTimer = Math.max(0, this.starTimer - dt);
    this.ghostTimer = Math.max(0, this.ghostTimer - dt);
    this.shrinkTimer = Math.max(0, this.shrinkTimer - dt);
    this.radius = this.isShrunk ? 0.75 : 1.25;

    if (this._fallTimer > 0) {
      this._fallTimer -= dt;
      this._vy -= GRAVITY * dt;
      this.position.y += this._vy * dt;
      this.position.addScaledVector(this.velocity, dt);
      if (this._fallTimer <= 0) this.respawn(track);
      return;
    }

    // top speed
    let max = this.baseMax * (1 + this.coins * COIN_SPEED_BONUS) * this.speedScale;
    if (this.isShrunk) max *= 0.8;
    if (this.isBoosting) max *= 1.35;
    if (this.starTimer > 0) max *= 1.15;
    const q = this._hasInfo ? this.trackInfo : null;
    if (q && q.surface === SURFACES.OFFROAD && !this.isBoosting && this.starTimer <= 0) max *= 0.55;
    if (q && q.surface === SURFACES.BOOST) this.applyBoost(1, 1, 'pad');
    this.maxSpeed = max;

    const control = !this.isSpunOut;
    if (this.isSpunOut) {
      this.spinoutTimer -= dt;
      this.speed *= Math.max(0, 1 - 2.2 * dt);
      this._spinAngle += dt * (this.tumble ? 9 : 14);
    } else {
      this._spinAngle = 0;
    }
    const throttle = control ? c.throttle : 0;
    const brake = control ? c.brake : 0;
    if (this.isBoosting && control) {
      this.speed = Math.min(Math.max(this.speed, max), this.speed + 40 * dt);
    } else if (throttle > 0) {
      this.speed += 26 * dt * Math.max(0, 1 - Math.pow(Math.max(0, this.speed) / max, 2));
    }
    if (brake > 0) {
      if (this.speed > 0.5) this.speed -= 38 * dt * brake;
      else this.speed = Math.max(-9, this.speed - 14 * dt * brake);
    }
    if (!throttle && !brake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 5 * dt);
    if (this.speed > max) this.speed = Math.max(max, this.speed - 18 * dt);

    // drift
    const driftPressed = c.drift && !this._prevDrift;
    this._prevDrift = c.drift;
    if (control && driftPressed && Math.abs(c.steer) > 0.3 && this.speed > 10 && !this.isDrifting) {
      this.isDrifting = true;
      this.driftDirection = Math.sign(c.steer);
      this.driftCharge = 0;
      this.driftLevel = 0;
      this.bus?.emit(EVENTS.KART_HOP, { kart: this });
      this.bus?.emit(EVENTS.KART_DRIFT_START, { kart: this, direction: this.driftDirection });
    }
    if (this.isDrifting && (!c.drift || !control || this.speed < 6)) {
      const lvl = this.driftLevel;
      this.isDrifting = false;
      this.bus?.emit(EVENTS.KART_DRIFT_END, { kart: this, level: control ? lvl : 0 });
      if (control && lvl > 0) this.applyBoost(DRIFT_LEVELS[lvl].boostTime, 1, 'drift');
      this.driftLevel = 0;
      this.driftCharge = 0;
    }

    // steering
    const v = Math.abs(this.speed);
    let yawRate = 0;
    if (control) {
      const base = 2.1 * Math.min(1, v / 5) * (1 - 0.32 * Math.min(1, v / 36));
      if (this.isDrifting) {
        const into = c.steer * this.driftDirection; // -1..1
        yawRate = -this.driftDirection * base * (0.72 + 0.38 * into);
        this.driftCharge += dt * (into > 0.2 ? 1.25 : 0.75);
        let lvl = 0;
        for (const L of DRIFT_LEVELS) if (L.level > 0 && this.driftCharge >= L.chargeTime) lvl = L.level;
        if (lvl !== this.driftLevel) {
          this.driftLevel = lvl;
          this.bus?.emit(EVENTS.KART_DRIFT_LEVEL, { kart: this, level: lvl });
        }
      } else {
        yawRate = -c.steer * base * Math.sign(this.speed || 1);
      }
    }
    this.heading += yawRate * dt;
    this._updateBasis();

    this.velocity.copy(this.forward).multiplyScalar(this.speed);
    this.position.addScaledVector(this.velocity, dt);

    // track
    const info = track.queryPosition(this.position, this.trackHint, this.trackInfo);
    this._hasInfo = true;
    this.trackInfo = info;
    this.trackHint = info.index;
    const prevSurface = this.surface;
    this.surface = info.surface;
    if (prevSurface !== this.surface) this.bus?.emit(EVENTS.KART_SURFACE, { kart: this, surface: this.surface, previous: prevSurface });
    if (info.surface === SURFACES.VOID) {
      this._fallTimer = 1.2;
      this._vy = 0;
      this.isAirborne = true;
      this.stats.falls++;
      this.bus?.emit(EVENTS.KART_FALL, { kart: this });
      return;
    }
    if (info.surface === SURFACES.ROAD || info.surface === SURFACES.BOOST) this.lastSafeDistance = info.distance;
    this.position.y = info.groundHeight;
    if (info.wallOffset !== null) {
      const limit = info.wallOffset - this.radius;
      if (Math.abs(info.lateral) > limit) {
        const s = Math.sign(info.lateral);
        this.position.addScaledVector(info.right, -s * (Math.abs(info.lateral) - limit));
        // deflect heading along wall
        const th = Math.atan2(info.tangent.x, info.tangent.z);
        const dir = Math.cos(this.heading - th) >= 0 ? th : th + Math.PI;
        let diff = dir - this.heading;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        const impact = Math.abs(Math.sin(diff)) * Math.abs(this.speed);
        this.heading += diff * 0.35;
        this.speed *= 1 - Math.min(0.5, 0.06 + Math.abs(Math.sin(diff)) * 0.6);
        if (impact > 2) {
          this.stats.wallHits++;
          this.bus?.emit(EVENTS.KART_WALL_HIT, { kart: this, impact, point: this.position.clone() });
        }
      }
    }
    for (const o of track.obstacles) {
      const dx = this.position.x - o.position.x;
      const dz = this.position.z - o.position.z;
      const rr = o.radius + this.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 1;
        this.position.x = o.position.x + (dx / d) * rr;
        this.position.z = o.position.z + (dz / d) * rr;
        this.speed *= 0.6;
        this.stats.wallHits++;
        this.bus?.emit(EVENTS.KART_WALL_HIT, { kart: this, impact: 5, point: this.position.clone() });
      }
    }
  }

  updateVisuals(dt, time) {
    this.mesh.position.copy(this.position);
    this.mesh.rotation.set(0, this.heading, 0);
    if (this.isSpunOut) {
      if (this.tumble) this._body.rotation.set(this._spinAngle, 0, 0);
      else this._body.rotation.set(0, this._spinAngle, 0);
    } else this._body.rotation.set(0, this.isDrifting ? this.driftDirection * -0.3 : 0, 0);
    const s = this.isShrunk ? 0.55 : 1;
    this.mesh.scale.setScalar(s);
    if (this.starTimer > 0) this._bodyMat.color.setHSL((time * 2) % 1, 1, 0.55);
    else this._bodyMat.color.set(this.color);
    this.mesh.visible = !(this.ghostTimer > 0 && Math.floor(time * 12) % 2 === 0);
  }

  applyBoost(duration, power = 1, source = 'mushroom') {
    const fresh = this.boostTimer <= 0;
    this.boostTimer = Math.max(this.boostTimer, duration);
    if (source !== 'pad' || fresh) this.bus?.emit(EVENTS.KART_BOOST, { kart: this, source, duration, power });
  }
  spinOut(cause = 'banana', duration = 1.1) {
    if (this.isInvincible) return false;
    if (this.spinoutTimer > 0.25) return false;
    this.spinoutTimer = duration;
    this.tumble = false;
    this.isDrifting = false;
    this.boostTimer = 0;
    this.stats.spins++;
    this.bus?.emit(EVENTS.KART_SPINOUT, { kart: this, cause });
    return true;
  }
  launch(cause = 'bomb') {
    if (this.isInvincible) return false;
    this.spinoutTimer = 1.6;
    this.tumble = true;
    this.speed *= 0.3;
    this.isDrifting = false;
    this.stats.launches++;
    this.bus?.emit(EVENTS.KART_LAUNCHED, { kart: this, cause });
    return true;
  }
  shrink(duration = 6) {
    if (this.isInvincible) return;
    this.shrinkTimer = duration;
    this.bus?.emit(EVENTS.KART_SHRINK, { kart: this, duration });
  }
  startStar(duration = 7.5) {
    this.starTimer = duration;
    this.shrinkTimer = 0;
    this.bus?.emit(EVENTS.KART_STAR_START, { kart: this, duration });
  }
  addCoins(n) {
    this.coins = Math.min(MAX_COINS, this.coins + n);
  }
  loseCoins(n) {
    this.coins = Math.max(0, this.coins - n);
  }
  respawn(track) {
    const f = track.getFrameAtDistance(this.lastSafeDistance, 0, { position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3() });
    this.position.copy(f.position);
    this.heading = Math.atan2(f.tangent.x, f.tangent.z);
    this.speed = 0;
    this.velocity.set(0, 0, 0);
    this.ghostTimer = 1.5;
    this.spinoutTimer = 0;
    this.isAirborne = false;
    this._fallTimer = 0;
    this.trackHint = -1;
    this._updateBasis();
    this.bus?.emit(EVENTS.KART_RESPAWN, { kart: this });
  }
  onCountdown() {}
  onRaceStart() {}
  dispose() {
    this.mesh.removeFromParent();
  }
}

/** Mock of src/kart/collisions.js: push apart, star karts spin others, full-size karts squish shrunk ones. */
export function resolveMockCollisions(karts) {
  for (let i = 0; i < karts.length; i++) {
    for (let j = i + 1; j < karts.length; j++) {
      const a = karts[i];
      const b = karts[j];
      const dx = b.position.x - a.position.x;
      const dz = b.position.z - a.position.z;
      const rr = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 > rr * rr || Math.abs(a.position.y - b.position.y) > 2) continue;
      const d = Math.sqrt(d2) || 1e-3;
      const push = (rr - d) / 2;
      a.position.x -= (dx / d) * push;
      a.position.z -= (dz / d) * push;
      b.position.x += (dx / d) * push;
      b.position.z += (dz / d) * push;
      const aStar = a.starTimer > 0;
      const bStar = b.starTimer > 0;
      if (aStar && !bStar) b.spinOut('star', 1.0);
      else if (bStar && !aStar) a.spinOut('star', 1.0);
      else if (!aStar && !bStar) {
        if (b.isShrunk && !a.isShrunk) b.spinOut('squish', 1.5);
        else if (a.isShrunk && !b.isShrunk) a.spinOut('squish', 1.5);
      }
    }
  }
}

// ------------------------------------------------------------- race manager

/** Minimal race bookkeeping: laps, raceDistance, racePosition, finish. */
export class DevRaceManager {
  constructor({ karts, track, bus, laps = 3 }) {
    this.karts = karts;
    this.track = track;
    this.bus = bus;
    this.laps = laps;
    this.time = 0;
    this.state = new Map();
    for (const k of karts) this.state.set(k, { lapCount: 0, prevDist: null, lapStart: 0, lapTimes: [], wrongWay: 0 });
    this.finishedCount = 0;
  }

  update(dt) {
    this.time += dt;
    const L = this.track.length;
    for (const k of this.karts) {
      const s = this.state.get(k);
      const info = k.trackInfo;
      if (!info || k._hasInfo === false) continue;
      const d = info.distance;
      if (s.prevDist === null) {
        s.prevDist = d;
        s.lapCount = d > L / 2 ? 0 : 1;
      }
      const delta = d - s.prevDist;
      if (delta < -L / 2) {
        s.lapCount++;
        if (s.lapCount >= 2) {
          const lt = this.time - s.lapStart;
          s.lapTimes.push(lt);
          this.bus?.emit(EVENTS.RACE_LAP, { kart: k, lap: s.lapCount, totalLaps: this.laps, isFinalLap: s.lapCount === this.laps, lapTime: lt });
        }
        s.lapStart = this.time;
        if (s.lapCount > this.laps && !k.finished) {
          k.finished = true;
          k.finishTime = this.time;
          this.finishedCount++;
          this.bus?.emit(EVENTS.RACE_FINISH, { kart: k, position: this.finishedCount, time: this.time });
        }
      } else if (delta > L / 2) {
        s.lapCount--;
      }
      s.prevDist = d;
      k.lap = Math.max(1, Math.min(this.laps, s.lapCount));
      k.raceDistance = (s.lapCount - 1) * L + d;
    }
    const sorted = [...this.karts].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.raceDistance - a.raceDistance;
    });
    sorted.forEach((k, i) => {
      const np = i + 1;
      if (k.racePosition !== np) {
        const from = k.racePosition;
        k.racePosition = np;
        this.bus?.emit(EVENTS.RACE_POSITION_CHANGE, { kart: k, from, to: np });
      }
    });
  }

  lapTimes(k) {
    return this.state.get(k).lapTimes;
  }
}

/** Small deterministic PRNG (mulberry32). */
export function makeRng(seed = 1) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
