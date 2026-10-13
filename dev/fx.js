/**
 * FX sandbox. Mock karts drive in circles on a mock track; URL params force
 * states for screenshots:
 *   ?drift=0|1|2|3 &boost=1 &offroad=1 &star=1 &spin=1 &explode=1 &shatter=1
 *   &confetti=1 &lightning=1 &coin=1 &wall=1 &land=1 &bump=1 &trick=1 &mt=1|2|3
 *   &theme=meadow|desert|snow|neon &quality=low|medium|high &t=2 (simulate to t, freeze)
 *   &cam=chase|side|front|top &realkart=1 (use src/kart models if available)
 * Event params accept a number = age (s) of the effect at capture, e.g. explode=0.35.
 */
import * as THREE from 'three';
import { EventBus } from '../src/core/EventBus.js';
import { EVENTS, GAME_STATES, SURFACES, ITEMS } from '../src/core/constants.js';
import { Effects } from '../src/fx/index.js';

const params = new URLSearchParams(location.search);
const num = (k, d) => (params.has(k) ? Number(params.get(k)) || (params.get(k) === '0' ? 0 : 1) : d);
const flag = (k) => params.has(k) && params.get(k) !== '0';

const THEMES = {
  meadow: {
    skyTop: 0x2f7fd9, skyBottom: 0xcfeaff, fogColor: 0xcfe6ff, fogNear: 80, fogFar: 520,
    dustColor: 0x9a7b4f, offroadColor: 0x4f9e36, sparkTint: 0xffd36b, isNight: false,
    ground: '#4f9e36', road: '#55585f', sun: 3.2,
  },
  desert: {
    skyTop: 0x3c8fd8, skyBottom: 0xffe2b5, fogColor: 0xf3d7a6, fogNear: 80, fogFar: 520,
    dustColor: 0xe0b072, offroadColor: 0xd9a35a, sparkTint: 0xffc070, isNight: false,
    ground: '#d6a160', road: '#6d6258', sun: 3.4,
  },
  snow: {
    skyTop: 0x5a6fb8, skyBottom: 0xffc6a0, fogColor: 0xe9d9e6, fogNear: 70, fogFar: 460,
    dustColor: 0xf4f8ff, offroadColor: 0xeef4ff, sparkTint: 0xffe0b0, isNight: false,
    ground: '#e8eef8', road: '#5d6270', sun: 2.6,
  },
  neon: {
    skyTop: 0x05031a, skyBottom: 0x1d0b48, fogColor: 0x0b0624, fogNear: 60, fogFar: 420,
    dustColor: 0x7050ff, offroadColor: 0x150a30, sparkTint: 0x80f0ff, isNight: true,
    ground: '#120a2a', road: '#1a1440', sun: 0.6,
  },
};

const themeKey = THEMES[params.get('theme')] ? params.get('theme') : 'meadow';
const theme = THEMES[themeKey];
const quality = ['low', 'medium', 'high'].includes(params.get('quality')) ? params.get('quality') : 'high';
const FREEZE_T = params.has('t') ? Number(params.get('t')) : null;

// ---------------------------------------------------------------------------
// Renderer / scene (same settings as Game)
// ---------------------------------------------------------------------------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: FREEZE_T !== null });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.info.autoReset = false;
const pr = Math.min(window.devicePixelRatio, quality === 'high' ? 2 : quality === 'medium' ? 1.5 : 1);
renderer.setPixelRatio(pr);
renderer.setSize(window.innerWidth, window.innerHeight, false);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 3000);
scene.add(camera);
const THEME_TRACK = { meadow: 'sunny-meadows', desert: 'dune-drift', snow: 'frostbite-peaks', neon: 'neon-skyway' };
const REAL_TRACK = flag('realtrack') ? params.get('track') || THEME_TRACK[themeKey] : null;
if (!REAL_TRACK) scene.fog = new THREE.Fog(theme.fogColor, theme.fogNear, theme.fogFar);

function buildMockWorld() {
// gradient sky dome
{
  const geo = new THREE.SphereGeometry(1500, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color(theme.skyTop) }, bottom: { value: new THREE.Color(theme.skyBottom) } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = clamp(vP.y*1.6+0.1,0.0,1.0); gl_FragColor = vec4(mix(bottom, top, h),1.0); \n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
  });
  scene.add(new THREE.Mesh(geo, mat));
}

const hemi = new THREE.HemisphereLight(theme.isNight ? 0x5040a0 : 0xdfefff, theme.isNight ? 0x100820 : 0x6a7a50, theme.isNight ? 0.7 : 1.1);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2dd, theme.sun);
sun.position.set(60, 90, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
sun.shadow.camera.far = 300;
scene.add(sun);

function canvasTex(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

// ground
{
  const tex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = theme.ground;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1800; i++) {
      const v = Math.random() * 30 - 15;
      g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 300})`;
      g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
  }, 60);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
}

// circular road (radius 26..38) with kerbs
const ROAD_IN = 25;
const ROAD_OUT = 39;
{
  const tex = canvasTex(64, 512, (g, w, h) => {
    g.fillStyle = theme.road;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 600; i++) {
      g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    g.fillStyle = theme.isNight ? '#40f0ff' : '#f2f2f2';
    for (let y = 0; y < h; y += 64) g.fillRect(w / 2 - 2, y, 4, 32);
  });
  tex.repeat.set(1, 1);
  const geo = new THREE.RingGeometry(ROAD_IN, ROAD_OUT, 160, 1);
  // remap uvs: u across road, v around
  const pos = geo.attributes.position;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const r = Math.hypot(x, y);
    const a = Math.atan2(y, x);
    uv.setXY(i, (r - ROAD_IN) / (ROAD_OUT - ROAD_IN), (a / (Math.PI * 2)) * 24);
  }
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });
  if (theme.isNight) {
    mat.emissive = new THREE.Color(0x221060);
    mat.emissiveIntensity = 0.6;
  }
  const road = new THREE.Mesh(geo, mat);
  road.rotation.x = -Math.PI / 2;
  road.position.y = 0.02;
  road.receiveShadow = true;
  scene.add(road);
  // kerbs / neon edges
  for (const r of [ROAD_IN, ROAD_OUT]) {
    const k = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.25, 6, 160),
      theme.isNight
        ? new THREE.MeshStandardMaterial({ color: 0x000000, emissive: r === ROAD_IN ? 0xff3cf0 : 0x40f0ff, emissiveIntensity: 1.6 })
        : new THREE.MeshStandardMaterial({ color: 0xd83030, roughness: 0.6 }),
    );
    k.rotation.x = -Math.PI / 2;
    k.position.y = 0.05;
    scene.add(k);
  }
}

// scenery
{
  const trunk = new THREE.MeshStandardMaterial({ color: 0x6b4a2b });
  const leaf = new THREE.MeshStandardMaterial({ color: themeKey === 'snow' ? 0x2d5a44 : 0x2f8a3a, flatShading: true });
  const rock = new THREE.MeshStandardMaterial({ color: themeKey === 'desert' ? 0xc0773f : 0x8a8a8f, flatShading: true });
  let s = 7;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2;
    const r = rnd() < 0.35 ? 8 + rnd() * 12 : 48 + rnd() * 90;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (themeKey === 'neon') {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(1 + rnd() * 2), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color().setHSL(rnd(), 1, 0.5), emissiveIntensity: 2.5 }));
      m.position.set(x, 3 + rnd() * 8, z);
      scene.add(m);
      continue;
    }
    if (themeKey === 'desert' && rnd() < 0.6) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(2 + rnd() * 4), rock);
      m.position.set(x, 1, z);
      m.castShadow = true;
      scene.add(m);
      continue;
    }
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 2.5), trunk);
    t.position.y = 1.25;
    const l = new THREE.Mesh(new THREE.ConeGeometry(2.2, 5, 7), leaf);
    l.position.y = 4.5;
    t.castShadow = l.castShadow = true;
    g.add(t, l);
    g.position.set(x, 0, z);
    g.scale.setScalar(0.8 + rnd() * 0.8);
    scene.add(g);
  }
}

}
if (!REAL_TRACK) buildMockWorld();

// ---------------------------------------------------------------------------
// Mock karts (contract fields + anchors)
// ---------------------------------------------------------------------------
const COLORS = [0xe8402f, 0x2f7de8, 0x3cc35a, 0xf2c230, 0xb050e0, 0xff8a1f, 0x30d0d0, 0xf060a0];

class MockKart {
  constructor(index, isPlayer) {
    this.index = index;
    this.isPlayer = isPlayer;
    this.isAI = !isPlayer;
    this.name = `Mock ${index}`;
    this.character = { id: `mock${index}`, name: `Mock ${index}`, cssColor: '#fff' };
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.forward = new THREE.Vector3(0, 0, 1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.quaternion = new THREE.Quaternion();
    this.heading = 0;
    this.speed = 0;
    this.maxSpeed = 30;
    this.isAirborne = false;
    this.surface = SURFACES.ROAD;
    this.isDrifting = false;
    this.driftDirection = 1;
    this.driftLevel = 0;
    this.driftCharge = 0;
    this.boostTimer = 0;
    this.starTimer = 0;
    this.spinoutTimer = 0;
    this.frozen = false;
    this.controls = { throttle: 1, brake: 0, steer: 0, drift: false, item: false, itemPressed: false, lookBack: false };
    this.mesh = this._buildMesh(COLORS[index % COLORS.length]);
    this.angle = 0;
    this.radius = 32;
    this.cruise = 22;
  }

  get isBoosting() { return this.boostTimer > 0; }
  get isInvincible() { return this.starTimer > 0; }
  get isSpunOut() { return this.spinoutTimer > 0; }

  _buildMesh(color) {
    const g = new THREE.Group();
    const body = new THREE.Group();
    g.add(body);
    const paint = new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x222228, roughness: 0.7 });
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 2.2), paint);
    chassis.position.y = 0.45;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.25, 0.6), paint);
    nose.position.set(0, 0.42, 1.25);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.4), dark);
    seat.position.set(0, 0.85, -0.45);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.33, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffd0a8 }));
    head.position.set(0, 1.35, -0.2);
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), paint);
    helmet.position.copy(head.position);
    body.add(chassis, nose, seat, head, helmet);
    for (const m of [chassis, nose, seat, head, helmet]) m.castShadow = true;
    const anchors = {};
    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.3, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const [name, x, z] of [['wheelFL', 0.78, 0.8], ['wheelFR', -0.78, 0.8], ['wheelRL', 0.8, -0.8], ['wheelRR', -0.8, -0.8]]) {
      const w = new THREE.Mesh(wheelGeo, dark);
      w.position.set(x, 0.32, z);
      w.castShadow = true;
      g.add(w);
      anchors[name] = w;
    }
    const pipeGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.4, 10);
    pipeGeo.rotateX(Math.PI / 2);
    for (const [name, x] of [['exhaustL', 0.3], ['exhaustR', -0.3]]) {
      const p = new THREE.Mesh(pipeGeo, new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.8, roughness: 0.3 }));
      p.position.set(x, 0.5, -1.2);
      body.add(p);
      const a = new THREE.Object3D();
      a.position.set(x, 0.5, -1.42);
      body.add(a);
      anchors[name] = a;
    }
    anchors.itemHold = new THREE.Object3D();
    anchors.itemHold.position.set(0, 0.6, -1.6);
    anchors.body = new THREE.Object3D();
    anchors.body.position.set(0, 0.8, 0);
    body.add(anchors.itemHold, anchors.body);
    this.anchors = anchors;
    this.bodyGroup = body;
    return g;
  }

  step(dt, time) {
    if (this.boostTimer > 0 && !this.forceBoost) this.boostTimer = Math.max(0, this.boostTimer - dt);
    if (this.starTimer > 0 && !this.forceStar) this.starTimer = Math.max(0, this.starTimer - dt);
    if (this.spinoutTimer > 0 && !this.forceSpin) this.spinoutTimer = Math.max(0, this.spinoutTimer - dt);
    const target = this.cruise * (this.isBoosting ? 1.3 : 1) * (this.surface === SURFACES.OFFROAD && !this.isBoosting ? 0.75 : 1);
    this.speed += (target - this.speed) * Math.min(1, dt * 2);
    if (this.frozen) this.speed = 0;
    if (this.track) {
      this.dist += this.speed * dt;
      if (!this._frame) {
        this._frame = { position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), distance: 0 };
      }
      const fr = this.track.getFrameAtDistance(this.dist, this.lateral, this._frame);
      this.position.copy(fr.position);
      this.forward.copy(fr.tangent).normalize();
      this.up.copy(fr.up || this.up);
      this.heading = Math.atan2(this.forward.x, this.forward.z);
    } else {
      this.angle += (this.speed / this.radius) * dt;
      const a = this.angle;
      this.position.set(Math.cos(a) * this.radius, 0, Math.sin(a) * this.radius);
      this.heading = -a;
      this.forward.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    }
    this.velocity.copy(this.forward).multiplyScalar(this.speed);
    this.mesh.position.copy(this.position);
    let yaw = this.heading;
    if (this.isDrifting) yaw += 0.35 * this.driftDirection * -1 * -1;
    if (this.isSpunOut) yaw += time * 14;
    this.mesh.rotation.set(0, yaw, 0);
    this.bodyGroup.rotation.z = this.isDrifting ? -0.06 * this.driftDirection : 0;
    this.quaternion.copy(this.mesh.quaternion);
    this.mesh.updateMatrixWorld(true);
  }
}

const bus = new EventBus();
const effects = new Effects({ renderer, scene, camera, bus, quality });
let realTrack = null;
if (REAL_TRACK) {
  try {
    const path = '/src/track/index.js';
    const mod = await import(/* @vite-ignore */ path);
    realTrack = new mod.Track(REAL_TRACK, { quality });
    await realTrack.build(scene, renderer);
    effects.setTrack(realTrack);
    console.log(`[fx-sandbox] real track ${REAL_TRACK} built, length=${realTrack.length.toFixed(0)}m`);
  } catch (err) {
    console.warn('[fx-sandbox] real track failed:', err);
    realTrack = null;
  }
}
const mockTrack = { id: `mock-${themeKey}`, def: { musicTheme: themeKey }, theme };
if (!realTrack) effects.setTrack(mockTrack);
effects.setSize(window.innerWidth, window.innerHeight, pr);

const karts = [];
const player = new MockKart(0, true);
karts.push(player);
for (let i = 1; i < 6; i++) {
  const k = new MockKart(i, false);
  k.angle = 0.18 * i + 0.25;
  k.radius = 28 + (i % 3) * 4;
  k.cruise = 20 + (i % 3);
  karts.push(k);
}
for (const k of karts) scene.add(k.mesh);
if (realTrack) {
  const startD = Number(params.get('dist') || 120);
  karts.forEach((k, i) => {
    k.track = realTrack;
    k.dist = i === 0 ? startD : startD + 6 + i * 7;
    k.lateral = i === 0 ? 0 : ((i % 3) - 1) * 4;
  });
}

// forced player states
const driftLevel = params.has('drift') ? Number(params.get('drift')) : null;
if (driftLevel !== null && Number.isFinite(driftLevel)) {
  player.isDrifting = true;
  player.driftLevel = Math.max(0, Math.min(3, driftLevel));
  player.driftDirection = 1;
}
if (flag('boost')) {
  player.forceBoost = true;
  player.boostTimer = 99;
}
if (flag('offroad')) {
  player.surface = SURFACES.OFFROAD;
  player.radius = 44;
  player.lateral = realTrack ? 14 : 0;
}
if (flag('star')) {
  player.forceStar = true;
  player.starTimer = 99;
}
if (flag('spin')) {
  player.forceSpin = true;
  player.spinoutTimer = 99;
}
if (flag('frozen')) {
  player.frozen = true;
}
// AI karts doing stuff too
karts[1].isDrifting = true;
karts[1].driftLevel = 2;
karts[2].boostTimer = 99;
karts[2].forceBoost = true;

// ---------------------------------------------------------------------------
// Scheduled events
// ---------------------------------------------------------------------------
const schedule = [];
function at(time, fn) {
  schedule.push({ time, fn, done: false });
}
function ahead(dist, up = 0, side = 0) {
  const r = new THREE.Vector3().copy(player.forward).cross(player.up);
  return player.position.clone().addScaledVector(player.forward, dist).addScaledVector(player.up, up).addScaledVector(r, side);
}
const baseT = FREEZE_T ?? 1.5;
function eventTime(key, defAge) {
  const v = params.get(key);
  const age = v && v !== '1' && Number.isFinite(Number(v)) ? Number(v) : defAge;
  return Math.max(0.05, baseT - age);
}
if (flag('explode')) at(eventTime('explode', 0.35), () => {
  const p = ahead(14, 0.5, -2);
  bus.emit(EVENTS.ITEM_EXPLOSION, { position: p, radius: 7, type: params.get('etype') === 'spiny' ? ITEMS.SPINY_SHELL : ITEMS.BOMB });
});
if (flag('shatter')) at(eventTime('shatter', 0.25), () => bus.emit(EVENTS.ITEM_BOX_HIT, { kart: player, position: ahead(4.5, 1.3) }));
if (flag('confetti')) at(eventTime('confetti', 2.2), () => bus.emit(EVENTS.RACE_FINISH, { kart: player, position: 1, time: 90 }));
if (flag('lightning')) at(eventTime('lightning', 0.06), () => bus.emit(EVENTS.ITEM_LIGHTNING, { kart: karts[5] }));
if (flag('coin')) at(eventTime('coin', 0.15), () => bus.emit(EVENTS.COIN_PICKUP, { kart: player, coins: 3, position: ahead(2, 1) }));
if (flag('coinlost')) at(eventTime('coinlost', 0.3), () => bus.emit(EVENTS.COIN_LOST, { kart: player, amount: 3, position: player.position.clone() }));
if (flag('wall')) at(eventTime('wall', 0.12), () => bus.emit(EVENTS.KART_WALL_HIT, { kart: player, impact: 16, point: ahead(0.6, 0.4, -0.9) }));
if (flag('land')) at(eventTime('land', 0.2), () => bus.emit(EVENTS.KART_LAND, { kart: player, impact: 12 }));
if (flag('bump')) at(eventTime('bump', 0.12), () => bus.emit(EVENTS.KART_BUMP, { kartA: player, kartB: karts[1], impact: 10, point: ahead(0.5, 0.6, 1) }));
if (flag('trick')) at(eventTime('trick', 0.2), () => bus.emit(EVENTS.KART_TRICK, { kart: player }));
if (flag('hit')) at(eventTime('hit', 0.15), () => bus.emit(EVENTS.ITEM_HIT, { kart: player, type: ITEMS.GREEN_SHELL, position: ahead(0, 0.8) }));
if (flag('mt')) at(eventTime('mtage', 0.1), () => bus.emit(EVENTS.KART_DRIFT_END, { kart: player, level: Number(params.get('mt')) || 3 }));
if (flag('pad')) at(eventTime('padage', 0.1), () => bus.emit(EVENTS.KART_BOOST, { kart: player, source: 'pad', duration: 1, power: 1 }));
if (flag('respawn')) at(eventTime('respawn', 0.3), () => bus.emit(EVENTS.KART_RESPAWN, { kart: player }));
if (flag('stall')) at(eventTime('stall', 0.3), () => bus.emit(EVENTS.KART_START_STALL, { kart: player }));
if (flag('levelup')) at(eventTime('levelup', 0.08), () => bus.emit(EVENTS.KART_DRIFT_LEVEL, { kart: player, level: Number(params.get('levelup')) || 2 }));

// realtime demo loop: repeat events every few seconds when not frozen
const demo = FREEZE_T === null && flag('demo');

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------
const camMode = params.get('cam') || 'chase';
const camPos = new THREE.Vector3();
const lookAt = new THREE.Vector3();
function updateCamera() {
  const p = player.position;
  const f = player.forward;
  if (camMode === 'side') {
    const r = new THREE.Vector3().copy(f).cross(player.up);
    camPos.copy(p).addScaledVector(r, -7).addScaledVector(f, -1.5).add(new THREE.Vector3(0, 2.2, 0));
    lookAt.copy(p).add(new THREE.Vector3(0, 0.7, 0)).addScaledVector(f, -1);
  } else if (camMode === 'front') {
    camPos.copy(p).addScaledVector(f, 7).add(new THREE.Vector3(0, 2.0, 0));
    lookAt.copy(p).add(new THREE.Vector3(0, 0.7, 0));
  } else if (camMode === 'top') {
    camPos.copy(p).addScaledVector(f, -12).add(new THREE.Vector3(0, 18, 0));
    lookAt.copy(p).addScaledVector(f, 6);
  } else {
    camPos.copy(p).addScaledVector(f, -6.2).add(new THREE.Vector3(0, 2.5, 0));
    lookAt.copy(p).addScaledVector(f, 4).add(new THREE.Vector3(0, 1.0, 0));
    if (realTrack) {
      // smooth the chase cam a little on real geometry
      camPos.y = Math.max(camPos.y, p.y + 2.2);
    }
  }
  camera.position.copy(camPos);
  camera.lookAt(lookAt);
  camera.fov = 70 + (player.isBoosting ? 8 : 0);
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
let simTime = 0;
const QSWITCH = flag('qswitch') ? ['low', 'medium', 'high', 'low', quality] : null;
function step(dt) {
  simTime += dt;
  if (QSWITCH) {
    const idx = Math.floor(simTime / 0.4);
    if (idx < QSWITCH.length && effects.quality !== QSWITCH[idx]) {
      effects.setQuality(QSWITCH[idx]);
      renderer.info.reset();
      effects.render();
      console.log(`[fx-sandbox] switched quality -> ${QSWITCH[idx]}`);
    }
  }
  for (const ev of schedule) {
    if (!ev.done && simTime >= ev.time) {
      ev.done = true;
      ev.fn();
    }
  }
  if (demo) {
    const cyc = simTime % 6;
    if (cyc < dt) bus.emit(EVENTS.ITEM_BOX_HIT, { kart: player, position: ahead(5, 1.3) });
    if (Math.abs(cyc - 2) < dt / 2 + 1e-6) bus.emit(EVENTS.ITEM_EXPLOSION, { position: ahead(16, 0.5, -3), radius: 7, type: ITEMS.BOMB });
  }
  for (const k of karts) k.step(dt, simTime);
  updateCamera();
  if (realTrack) realTrack.update(dt, simTime, player.position);
  effects.update(dt, { karts, playerKart: player, camera, time: simTime, state: GAME_STATES.RACING });
}
function renderFrame() {
  renderer.info.reset();
  effects.render();
}

const hud = document.getElementById('hud');
if (flag('nohud')) hud.classList.add('hidden');
function updateHud(fps) {
  hud.textContent = [
    `FX sandbox  theme=${themeKey}  quality=${effects.quality}`,
    `t=${simTime.toFixed(2)}  particles add=${effects.add.count}/${effects.add.capacity} alpha=${effects.alpha.count}/${effects.alpha.capacity}`,
    `draw calls=${renderer.info.render.calls}  tris=${renderer.info.render.triangles}${fps ? `  fps=${fps}` : ''}`,
    `player: drift=${player.isDrifting ? player.driftLevel : '-'} boost=${player.isBoosting} star=${player.isInvincible} surface=${player.surface}`,
  ].join('\n');
}

// interactive buttons (realtime mode)
const buttons = document.getElementById('buttons');
function btn(label, fn) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = fn;
  buttons.appendChild(b);
  return b;
}
if (!flag('nohud')) {
  btn('drift', () => {
    player.isDrifting = !player.isDrifting;
    player.driftLevel = 0;
  });
  btn('lvl+', () => {
    player.isDrifting = true;
    player.driftLevel = Math.min(3, player.driftLevel + 1);
    bus.emit(EVENTS.KART_DRIFT_LEVEL, { kart: player, level: player.driftLevel });
  });
  btn('release', () => {
    const lvl = player.driftLevel;
    player.isDrifting = false;
    player.driftLevel = 0;
    bus.emit(EVENTS.KART_DRIFT_END, { kart: player, level: lvl });
    if (lvl > 0) {
      player.boostTimer = 0.5 + lvl * 0.4;
      bus.emit(EVENTS.KART_BOOST, { kart: player, source: 'miniturbo', duration: 1, power: 1 });
    }
  });
  btn('mushroom', () => {
    player.boostTimer = 1.2;
    bus.emit(EVENTS.KART_BOOST, { kart: player, source: 'mushroom', duration: 1.2, power: 1 });
  });
  btn('pad', () => {
    player.boostTimer = 1;
    bus.emit(EVENTS.KART_BOOST, { kart: player, source: 'pad', duration: 1, power: 1 });
  });
  btn('star', () => {
    player.starTimer = 7.5;
    bus.emit(EVENTS.KART_STAR_START, { kart: player, duration: 7.5 });
  });
  btn('offroad', () => {
    const off = player.surface !== SURFACES.OFFROAD;
    player.surface = off ? SURFACES.OFFROAD : SURFACES.ROAD;
    player.radius = off ? 44 : 32;
  });
  btn('spin', () => {
    player.spinoutTimer = 1.2;
    bus.emit(EVENTS.KART_SPINOUT, { kart: player, cause: 'banana' });
  });
  btn('box', () => bus.emit(EVENTS.ITEM_BOX_HIT, { kart: player, position: ahead(4.5, 1.3) }));
  btn('boom', () => bus.emit(EVENTS.ITEM_EXPLOSION, { position: ahead(14, 0.5, -2), radius: 7, type: ITEMS.BOMB }));
  btn('spiny', () => bus.emit(EVENTS.ITEM_EXPLOSION, { position: ahead(8, 0.5, 0), radius: 7, type: ITEMS.SPINY_SHELL }));
  btn('lightning', () => bus.emit(EVENTS.ITEM_LIGHTNING, { kart: karts[5] }));
  btn('coin', () => bus.emit(EVENTS.COIN_PICKUP, { kart: player, coins: 3, position: ahead(2, 1) }));
  btn('hit', () => {
    bus.emit(EVENTS.ITEM_HIT, { kart: player, type: ITEMS.GREEN_SHELL, position: ahead(0, 0.8) });
    bus.emit(EVENTS.COIN_LOST, { kart: player, amount: 3, position: player.position.clone() });
    player.spinoutTimer = 1.1;
  });
  btn('wall', () => bus.emit(EVENTS.KART_WALL_HIT, { kart: player, impact: 16, point: ahead(0.6, 0.4, -0.9) }));
  btn('land', () => bus.emit(EVENTS.KART_LAND, { kart: player, impact: 12 }));
  btn('bump', () => bus.emit(EVENTS.KART_BUMP, { kartA: player, kartB: karts[1], impact: 10, point: ahead(0.5, 0.6, 1) }));
  btn('trick', () => bus.emit(EVENTS.KART_TRICK, { kart: player }));
  btn('finish', () => bus.emit(EVENTS.RACE_FINISH, { kart: player, position: 1, time: 90 }));
  for (const q of ['low', 'medium', 'high']) btn(q, () => effects.setQuality(q));
}

window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  effects.setSize(window.innerWidth, window.innerHeight, pr);
});

// optional: real kart models from src/kart
async function tryRealKarts() {
  if (!flag('realkart')) return;
  try {
    const path = '/src/kart/index.js';
    const mod = await import(/* @vite-ignore */ path);
    const { Kart, CHARACTERS } = mod;
    for (let i = 0; i < karts.length; i++) {
      const mk = karts[i];
      const real = new Kart({ character: CHARACTERS[i % CHARACTERS.length], index: i, isPlayer: i === 0, bus });
      scene.remove(mk.mesh);
      scene.add(real.mesh);
      mk.mesh = real.mesh;
      mk.anchors = real.anchors;
      mk.bodyGroup = new THREE.Object3D();
      mk.real = real;
    }
    console.log('[fx-sandbox] using real Kart models');
  } catch (err) {
    console.warn('[fx-sandbox] real karts unavailable:', err.message);
  }
}

await tryRealKarts();

if (FREEZE_T !== null) {
  const dt = 1 / 60;
  const steps = Math.round(FREEZE_T / dt);
  for (let i = 0; i < steps; i++) step(dt);
  effects.lastDt = dt;
  renderFrame();
  updateHud();
  console.log(`[fx-sandbox] frozen at t=${simTime.toFixed(2)} add=${effects.add.count} alpha=${effects.alpha.count} calls=${renderer.info.render.calls}`);
  // present the same frame a couple more times, then idle (keeps headless capture fast)
  let holds = 0;
  const hold = () => {
    effects.lastDt = 0;
    renderFrame();
    holds++;
    requestAnimationFrame(hold);
  };
  requestAnimationFrame(hold);
} else {
  let last = performance.now();
  let frames = 0, acc = 0, fps = 0;
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    step(dt);
    renderFrame();
    frames++;
    acc += dt;
    if (acc > 0.5) {
      fps = Math.round(frames / acc);
      frames = 0;
      acc = 0;
    }
    updateHud(fps);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
window.__fx = { effects, karts, player, bus, scene, camera, renderer };
