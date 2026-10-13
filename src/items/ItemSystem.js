import * as THREE from 'three';
import { EVENTS, ITEMS, GAME_MODES, MAX_COINS, SURFACES } from '../core/constants.js';
import { rollItem, ROULETTE_DISPLAY } from './distribution.js';
import { ItemBoxes } from './ItemBoxes.js';
import { CoinField } from './CoinField.js';
import { createItemModel, disposeItemModels, disposeItemModel } from './models.js';

// ----------------------------------------------------------------- tunables
const ROULETTE_TIME = 2.5;
const ROULETTE_TICK = 0.085;
const MUSHROOM_BOOST = 1.2;
const GOLDEN_TIME = 7.5;
const STAR_TIME = 7.5;
const COIN_ITEM_AMOUNT = 2;
const HIT_COIN_LOSS = 3;

const GREEN_SPEED = 46;
const GREEN_LIFE = 8;
const GREEN_BOUNCES = 5;
const RED_SPEED = 43;
const RED_LIFE = 14;
const RED_LOCK_DIST = 26;
const SPINY_SPEED = 64;
const SPINY_HEIGHT = 9;
const SPINY_BLAST = 6.5;
const SPINY_LIFE = 45;
const BOMB_FUSE = 3.0;
const BOMB_BLAST = 7;
const BANANA_LIFE = 100;
const MAX_GROUND_ITEMS = 40;
const ITEM_GRAVITY = 26;
const LIGHTNING_COOLDOWN = 22;

const SHELL_R = 0.6;
const BANANA_R = 0.55;
const BOMB_R = 0.6;
const ORBIT_RADIUS = 2.05;
const ORBIT_SPEED = 5.2;
const TRAIL_SPACING = 1.25;

const SINGLE_HOLDABLE = new Set([ITEMS.BANANA, ITEMS.GREEN_SHELL, ITEMS.RED_SHELL, ITEMS.BOMB]);
const TRIPLE_PROJECTILE = {
  [ITEMS.TRIPLE_BANANA]: ITEMS.BANANA,
  [ITEMS.TRIPLE_GREEN_SHELL]: ITEMS.GREEN_SHELL,
  [ITEMS.TRIPLE_RED_SHELL]: ITEMS.RED_SHELL,
};

// -------------------------------------------------------------- temporaries
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _right = new THREE.Vector3();
const _UP = new THREE.Vector3(0, 1, 0);

function makeQuery() {
  return {
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
}

function makeFrame() {
  return {
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(0, 0, 1),
    right: new THREE.Vector3(-1, 0, 0),
    up: new THREE.Vector3(0, 1, 0),
    distance: 0,
  };
}

/** Kart right vector (forward x up), ignores roll. */
function kartRight(kart, out) {
  const f = kart.forward;
  return out.set(-f.z, 0, f.x).normalize();
}

let _nextId = 1;

class Projectile {
  constructor() {
    this.id = _nextId++;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.model = null;
    this.reset();
  }

  reset() {
    this.type = null;
    this.state = 'dead';
    this.owner = null;
    this.target = null;
    this.radius = 0.6;
    this.hint = -1;
    this.age = 0;
    this.life = 10;
    this.bounces = 0;
    this.ownerImmune = 0;
    this.fuse = 0;
    this.locked = false;
    this.homing = false;
    this.trackDist = 0;
    this.lateral = 0;
    this.phaseT = 0;
    this.hoverFrom = null;
    this.slot = -1;
    this.spin = 0;
    this.yaw = 0;
    this.groundY = 0;
    this.trackLat = 0;
    this.trackDistKnown = false;
    this.velocity.set(0, 0, 0);
  }

  get active() {
    return this.state !== 'dead';
  }

  get attached() {
    return this.state === 'held' || this.state === 'orbit' || this.state === 'trail';
  }
}

/**
 * ItemSystem — item boxes, coins, the roulette, every item behaviour,
 * projectiles, held/orbiting items, and all kart-vs-item interactions.
 * See ARCHITECTURE.md §3 for the public contract.
 */
export class ItemSystem {
  /**
   * @param {object} o
   * @param {THREE.Scene} o.scene
   * @param {import('../track/Track.js').Track} o.track
   * @param {Array} o.karts
   * @param {import('../core/EventBus.js').EventBus} o.bus
   * @param {string} [o.mode] GAME_MODES.*
   * @param {() => number} [o.rng] optional deterministic random source
   */
  constructor({ scene, track, karts, bus, mode = GAME_MODES.VS, rng = Math.random }) {
    this.scene = scene;
    this.track = track;
    this.karts = karts;
    this.bus = bus;
    this.mode = mode;
    this.rng = rng;
    this.time = 0;
    this.root = new THREE.Group();
    this.root.name = 'ItemSystem';
    this.boxes = null;
    this.coins = null;
    this.projectiles = [];
    this.pool = [];
    this.modelPool = new Map();
    this.kartStates = new Map();
    this.lightningCooldown = 0;
    this._q = makeQuery();
    this._q2 = makeQuery();
    this._frame = makeFrame();
    this._threats = [];
    this._threatPool = [];
    this._hazards = [];
    this._hazardPool = [];
    this._hazardFrame = -1;
    this._markers = [];
    this._markerPool = [];
    this._frameNo = 0;
    this._built = false;
    this._inHit = false;
    for (const k of karts) this._stateOf(k);
    // kart<->kart contact (star ram, squishing a shrunk kart) is resolved by the
    // kart collision module; we add the item-side consequences (coins, items, event).
    this._unsub = [bus.on(EVENTS.KART_SPINOUT, (e) => this._onKartSpinout(e))];
  }

  // ================================================================= public

  build() {
    if (this._built) return;
    this._built = true;
    this.scene.add(this.root);
    const isTT = this.mode === GAME_MODES.TIME_TRIAL;
    const boxPositions = isTT ? [] : this.track.itemBoxPositions || [];
    this.boxes = new ItemBoxes(this.root, boxPositions, this.rng);
    this.coins = new CoinField(this.root, this.track.coinPositions || [], this.rng);
    if (isTT) for (const k of this.karts) this.giveItem(k, ITEMS.TRIPLE_MUSHROOM);
  }

  update(dt, time) {
    if (!this._built) this.build();
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 0.1);
    this.time = time;
    this._frameNo++;
    if (this.lightningCooldown > 0) this.lightningCooldown -= dt;

    for (const k of this.karts) {
      const ks = this._stateOf(k);
      this._updateRoulette(ks, dt);
      this._handleInput(ks, dt);
      if (ks.goldenTimer > 0) {
        ks.goldenTimer -= dt;
        if (ks.goldenTimer <= 0) this._clearItem(ks);
      }
      this._updateAttached(ks, dt);
      this._pickups(ks);
    }

    this._updateProjectiles(dt);
    this._projectileVsProjectile();
    this._projectileVsKarts();

    this.boxes.update(dt, time);
    this.coins.update(dt, time);
    this._updateVisuals(dt, time);
  }

  /** @returns {{ type: string|null, count: number, roulette: boolean, golden: number, holding: boolean }} */
  getItemState(kart) {
    const ks = this._stateOf(kart);
    const o = ks.public;
    if (ks.roulette) {
      o.type = ks.rouletteDisplay;
      o.count = 1;
      o.roulette = true;
    } else {
      o.type = ks.type;
      o.count = ks.type ? ks.count : 0;
      o.roulette = false;
    }
    o.golden = Math.max(0, ks.goldenTimer);
    o.holding = !!ks.held;
    return o;
  }

  giveItem(kart, type) {
    const ks = this._stateOf(kart);
    ks.roulette = false;
    this._clearItem(ks);
    if (type) this._setItem(ks, type);
  }

  /**
   * Incoming projectiles for `kart` (AI dodging / shielding). The returned
   * array and objects are reused — read them immediately.
   * @returns {Array<{ type, position, velocity, target, distance, homing }>}
   */
  getThreats(kart) {
    const out = this._threats;
    out.length = 0;
    let n = 0;
    for (const p of this.projectiles) {
      if (!p.active || p.attached || p.state === 'fall') continue;
      let include = false;
      const dx = p.position.x - kart.position.x;
      const dz = p.position.z - kart.position.z;
      const d2 = dx * dx + dz * dz;
      if ((p.type === ITEMS.RED_SHELL && p.homing) || p.type === ITEMS.SPINY_SHELL) {
        include = p.target === kart;
      } else if (p.type === ITEMS.GREEN_SHELL || p.type === ITEMS.RED_SHELL) {
        if (d2 < 55 * 55 && p.owner !== kart) {
          // closing in?
          const vx = p.velocity.x - (kart.velocity ? kart.velocity.x : 0);
          const vz = p.velocity.z - (kart.velocity ? kart.velocity.z : 0);
          const closing = -(dx * vx + dz * vz);
          if (closing > 0) {
            const vv = vx * vx + vz * vz || 1;
            const tc = closing / vv;
            const mx = dx + vx * tc;
            const mz = dz + vz * tc;
            include = mx * mx + mz * mz < 4.5 * 4.5 && tc < 2.5;
          }
        }
      }
      if (!include) continue;
      let t = this._threatPool[n];
      if (!t) {
        t = { type: null, position: new THREE.Vector3(), velocity: new THREE.Vector3(), target: null, distance: 0, homing: false };
        this._threatPool[n] = t;
      }
      t.type = p.type;
      t.position.copy(p.position);
      t.velocity.copy(p.velocity);
      t.target = p.target;
      t.distance = Math.sqrt(d2);
      t.homing = p.homing || p.type === ITEMS.SPINY_SHELL;
      t.state = p.state;
      out.push(t);
      n++;
    }
    return out;
  }

  /**
   * Static / slow dangers on the road (bananas, bombs, trailing bananas).
   * Reused array — read immediately. Computed at most once per update.
   * @returns {Array<{ type, position, radius, owner }>}
   */
  getHazards() {
    if (this._hazardFrame === this._frameNo) return this._hazards;
    this._hazardFrame = this._frameNo;
    const out = this._hazards;
    out.length = 0;
    let n = 0;
    for (const p of this.projectiles) {
      if (!p.active || p.state === 'fall') continue;
      let radius = 0;
      if (p.type === ITEMS.BANANA && (p.state === 'rest' || p.state === 'air' || p.attached)) radius = 1.0;
      else if (p.type === ITEMS.BOMB && !p.attached) radius = p.fuse < 1.2 ? BOMB_BLAST : 3.2;
      else if (p.type === ITEMS.GREEN_SHELL && p.state === 'slide') radius = 1.2;
      if (!radius) continue;
      let h = this._hazardPool[n];
      if (!h) {
        h = { type: null, position: new THREE.Vector3(), radius: 0, owner: null, moving: false, velocity: new THREE.Vector3() };
        this._hazardPool[n] = h;
      }
      h.type = p.type;
      h.position.copy(p.position);
      h.radius = radius;
      h.owner = p.owner;
      h.moving = p.state === 'slide' || p.attached;
      h.velocity.copy(p.velocity);
      out.push(h);
      n++;
    }
    return out;
  }

  /** @returns {Array<{ x, z, type }>} reused array */
  getMinimapMarkers() {
    const out = this._markers;
    out.length = 0;
    let n = 0;
    for (const p of this.projectiles) {
      if (!p.active || p.state === 'fall') continue;
      let m = this._markerPool[n];
      if (!m) {
        m = { x: 0, z: 0, type: null };
        this._markerPool[n] = m;
      }
      m.x = p.position.x;
      m.z = p.position.z;
      m.type = p.type;
      out.push(m);
      n++;
    }
    return out;
  }

  reset() {
    for (const p of this.projectiles) this._kill(p, false);
    this.projectiles.length = 0;
    for (const ks of this.kartStates.values()) {
      ks.roulette = false;
      ks.rouletteTimer = 0;
      this._clearItem(ks);
    }
    this.lightningCooldown = 0;
    this.boxes?.reset();
    this.coins?.reset();
    if (this.mode === GAME_MODES.TIME_TRIAL) for (const k of this.karts) this.giveItem(k, ITEMS.TRIPLE_MUSHROOM);
  }

  dispose() {
    for (const u of this._unsub) u();
    this._unsub.length = 0;
    for (const p of this.projectiles) this._kill(p, false);
    this.projectiles.length = 0;
    for (const list of this.modelPool.values()) for (const m of list) disposeItemModel(m);
    this.modelPool.clear();
    for (const p of this.pool) if (p.model) disposeItemModel(p.model);
    this.boxes?.dispose();
    this.coins?.dispose();
    this.scene.remove(this.root);
    disposeItemModels();
    this._built = false;
  }

  // ============================================================ kart state

  _stateOf(kart) {
    let ks = this.kartStates.get(kart);
    if (!ks) {
      ks = {
        kart,
        type: null,
        count: 0,
        roulette: false,
        rouletteTimer: 0,
        rouletteResult: null,
        rouletteDisplay: null,
        rouletteTick: 0,
        rouletteIdx: 0,
        goldenTimer: 0,
        held: null,
        heldTime: 0,
        heldBrake: false,
        attached: [],
        hint: -1,
        public: { type: null, count: 0, roulette: false, golden: 0, holding: false },
      };
      this.kartStates.set(kart, ks);
    }
    return ks;
  }

  _setItem(ks, type) {
    ks.type = type;
    const tripleOf = TRIPLE_PROJECTILE[type];
    if (type === ITEMS.TRIPLE_MUSHROOM || tripleOf) ks.count = 3;
    else ks.count = 1;
    ks.goldenTimer = 0;
    if (tripleOf) {
      for (let i = 0; i < 3; i++) {
        const p = this._spawn(tripleOf, ks.kart);
        p.state = tripleOf === ITEMS.BANANA ? 'trail' : 'orbit';
        p.slot = i;
        this._placeBehind(ks.kart, p.position, 1.8 + i * TRAIL_SPACING);
        ks.attached.push(p);
      }
    }
  }

  _clearItem(ks) {
    ks.type = null;
    ks.count = 0;
    ks.goldenTimer = 0;
    if (ks.held) {
      this._kill(ks.held, false);
      ks.held = null;
    }
    for (const p of ks.attached) this._kill(p, false);
    ks.attached.length = 0;
  }

  /** Called when an attached item (held/orbit/trail) is consumed by a block or hit. */
  _consumeAttached(ks, p) {
    if (ks.held === p) {
      ks.held = null;
      ks.type = null;
      ks.count = 0;
    } else {
      const i = ks.attached.indexOf(p);
      if (i >= 0) ks.attached.splice(i, 1);
      ks.count = Math.max(0, ks.count - 1);
      if (ks.count === 0 || ks.attached.length === 0) {
        ks.type = null;
        ks.count = 0;
      }
    }
  }

  _rollFor(kart) {
    let leaderDist = -Infinity;
    for (const k of this.karts) leaderDist = Math.max(leaderDist, k.raceDistance || 0);
    let spinyActive = false;
    for (const p of this.projectiles) if (p.active && p.type === ITEMS.SPINY_SHELL) spinyActive = true;
    return rollItem(kart.racePosition || 1, this.karts.length, {
      rng: this.rng,
      mode: this.mode,
      distanceToLeader: leaderDist - (kart.raceDistance || 0),
      spinyActive,
      lightningBlocked: this.lightningCooldown > 0,
    });
  }

  _updateRoulette(ks, dt) {
    if (!ks.roulette) return;
    ks.rouletteTimer += dt;
    ks.rouletteTick -= dt;
    if (ks.rouletteTick <= 0) {
      ks.rouletteTick = ROULETTE_TICK * (1 + (ks.rouletteTimer / ROULETTE_TIME) * 1.6);
      ks.rouletteIdx = (ks.rouletteIdx + 1 + Math.floor(this.rng() * 3)) % ROULETTE_DISPLAY.length;
      ks.rouletteDisplay = ROULETTE_DISPLAY[ks.rouletteIdx];
    }
    if (ks.rouletteTimer >= ROULETTE_TIME) {
      ks.roulette = false;
      const type = ks.rouletteResult;
      this._setItem(ks, type);
      this.bus.emit(EVENTS.ITEM_ROULETTE_STOP, { kart: ks.kart, type });
    }
  }

  _startRoulette(ks) {
    ks.roulette = true;
    ks.rouletteTimer = 0;
    ks.rouletteTick = 0;
    ks.rouletteIdx = Math.floor(this.rng() * ROULETTE_DISPLAY.length);
    ks.rouletteDisplay = ROULETTE_DISPLAY[ks.rouletteIdx];
    ks.rouletteResult = this._rollFor(ks.kart);
    this.bus.emit(EVENTS.ITEM_ROULETTE_START, { kart: ks.kart });
  }

  // ================================================================= input

  _handleInput(ks, dt) {
    const kart = ks.kart;
    const c = kart.controls;
    if (!c) return;
    const holding = !!c.item;
    if (ks.held) ks.heldTime += dt;
    if (ks.held && !holding) this._releaseHeld(ks, c);
    if (!c.itemPressed || ks.roulette || !ks.type) return;
    if (kart.isSpunOut || kart.frozen) return;
    if (ks.held) return;
    const type = ks.type;
    const pos = kart.position;
    const back = (c.brake || 0) > 0 || !!c.lookBack;

    switch (type) {
      case ITEMS.MUSHROOM:
      case ITEMS.TRIPLE_MUSHROOM: {
        kart.applyBoost(MUSHROOM_BOOST, 1, 'mushroom');
        this._emitUse(kart, ITEMS.MUSHROOM, type);
        ks.count--;
        if (ks.count <= 0) this._clearItem(ks);
        break;
      }
      case ITEMS.GOLDEN_MUSHROOM: {
        if (ks.goldenTimer <= 0) ks.goldenTimer = GOLDEN_TIME;
        kart.applyBoost(MUSHROOM_BOOST, 1, 'golden');
        this._emitUse(kart, ITEMS.GOLDEN_MUSHROOM, type);
        break;
      }
      case ITEMS.STAR: {
        kart.startStar(STAR_TIME);
        this._emitUse(kart, ITEMS.STAR, type);
        this._clearItem(ks);
        break;
      }
      case ITEMS.LIGHTNING: {
        this._emitUse(kart, ITEMS.LIGHTNING, type);
        this._clearItem(ks);
        this._lightning(kart);
        break;
      }
      case ITEMS.COIN: {
        this._emitUse(kart, ITEMS.COIN, type);
        this._clearItem(ks);
        const before = kart.coins || 0;
        const add = Math.min(COIN_ITEM_AMOUNT, MAX_COINS - before);
        if (add > 0) kart.addCoins(add);
        this.bus.emit(EVENTS.COIN_PICKUP, { kart, coins: kart.coins, amount: COIN_ITEM_AMOUNT, position: pos.clone() });
        break;
      }
      case ITEMS.SPINY_SHELL: {
        this._emitUse(kart, ITEMS.SPINY_SHELL, type);
        this._clearItem(ks);
        this._launchSpiny(kart);
        break;
      }
      case ITEMS.BANANA:
      case ITEMS.GREEN_SHELL:
      case ITEMS.RED_SHELL:
      case ITEMS.BOMB: {
        const p = this._spawn(type, kart);
        p.state = 'held';
        this._placeBehind(kart, p.position, kart.radius + 0.95);
        ks.held = p;
        ks.heldTime = 0;
        ks.heldBrake = back;
        if (!c.item) this._releaseHeld(ks, c);
        break;
      }
      case ITEMS.TRIPLE_BANANA:
      case ITEMS.TRIPLE_GREEN_SHELL:
      case ITEMS.TRIPLE_RED_SHELL: {
        const p = ks.attached.shift();
        if (!p) {
          this._clearItem(ks);
          break;
        }
        const single = TRIPLE_PROJECTILE[type];
        this._throw(kart, p, single, back, (c.brake || 0) > 0);
        this._emitUse(kart, single, type);
        ks.count = ks.attached.length;
        if (ks.count <= 0) this._clearItem(ks);
        break;
      }
      default:
        break;
    }
  }

  _releaseHeld(ks, c) {
    const p = ks.held;
    ks.held = null;
    const kart = ks.kart;
    const brakeNow = (c.brake || 0) > 0;
    const brake = brakeNow || (ks.heldBrake && ks.heldTime < 0.3);
    const back = brake || !!c.lookBack;
    this._throw(kart, p, p.type, back, brake);
    this._emitUse(kart, p.type, ks.type);
    ks.type = null;
    ks.count = 0;
  }

  _emitUse(kart, type, slotType) {
    this.bus.emit(EVENTS.ITEM_USE, { kart, type, slotType, position: kart.position.clone() });
  }

  /**
   * Launches an (attached or fresh) projectile.
   * Shells/bombs: forward by default, backward when `back`. Bananas: dropped
   * behind by default, lobbed forward when `brake` is held.
   */
  _throw(kart, p, type, back, brake) {
    const f = kart.forward;
    const speed = Math.max(0, kart.speed || 0);
    p.age = 0;
    p.hint = kart.trackHint ?? -1;
    p.yaw = Math.atan2(f.x, f.z);
    if (type === ITEMS.BANANA) {
      if (brake) {
        p.position.copy(kart.position).addScaledVector(f, kart.radius + 1.2);
        p.position.y += 1.0;
        p.velocity.copy(f).multiplyScalar(speed + 19);
        p.velocity.y = 9;
        p.state = 'air';
        p.ownerImmune = 0.6;
      } else {
        this._placeBehind(kart, p.position, kart.radius + 1.0);
        p.velocity.set(0, 0, 0);
        p.state = 'rest';
        p.ownerImmune = 0.8;
      }
      p.life = BANANA_LIFE;
    } else if (type === ITEMS.BOMB) {
      if (back) {
        this._placeBehind(kart, p.position, kart.radius + 1.0);
        p.velocity.copy(f).multiplyScalar(-4);
        p.state = 'rest';
      } else {
        p.position.copy(kart.position).addScaledVector(f, kart.radius + 1.2);
        p.position.y += 1.0;
        p.velocity.copy(f).multiplyScalar(speed + 15);
        p.velocity.y = 10.5;
        p.state = 'air';
      }
      p.fuse = BOMB_FUSE;
      p.ownerImmune = 0.9;
      p.life = 30;
    } else {
      // shells
      const dir = back ? -1 : 1;
      p.position.copy(kart.position).addScaledVector(f, dir * (kart.radius + 1.1));
      const sp = type === ITEMS.RED_SHELL ? RED_SPEED : GREEN_SPEED;
      p.velocity.set(f.x, 0, f.z).normalize().multiplyScalar(dir * sp + (back ? 0 : speed * 0.15));
      p.state = 'slide';
      p.bounces = 0;
      p.ownerImmune = type === ITEMS.RED_SHELL ? 1.0 : 0.55;
      p.life = type === ITEMS.RED_SHELL ? RED_LIFE : GREEN_LIFE;
      p.homing = false;
      p.target = null;
      p.locked = false;
      if (type === ITEMS.RED_SHELL && !back) {
        p.homing = true;
        p.target = this._kartAhead(kart);
      }
      // ground snap
      const q = this.track.queryPosition(p.position, p.hint >= 0 ? p.hint : undefined, this._q);
      p.hint = q.index;
      p.position.y = q.groundHeight;
    }
    this._trimGroundItems();
  }

  _kartAhead(kart) {
    const pos = kart.racePosition || 1;
    if (pos <= 1) return null;
    let best = null;
    for (const k of this.karts) {
      if (k === kart) continue;
      if ((k.racePosition || 0) === pos - 1) return k;
      if ((k.raceDistance || 0) > (kart.raceDistance || 0)) {
        if (!best || k.raceDistance < best.raceDistance) best = k;
      }
    }
    return best;
  }

  _leader() {
    let best = null;
    for (const k of this.karts) {
      if (k.finished) continue;
      if (!best || (k.racePosition || 99) < (best.racePosition || 99)) best = k;
    }
    return best;
  }

  _lightning(user) {
    this.lightningCooldown = LIGHTNING_COOLDOWN;
    this.bus.emit(EVENTS.ITEM_LIGHTNING, { kart: user });
    const n = this.karts.length;
    for (const k of this.karts) {
      if (k === user || k.finished) continue;
      if (k.isInvincible) continue;
      const t = n > 1 ? ((k.racePosition || n) - 1) / (n - 1) : 1;
      const duration = 8 - 4 * t; // leaders stay small longer
      k.shrink(duration);
      k.spinOut(ITEMS.LIGHTNING, 0.9);
      const ks = this._stateOf(k);
      ks.roulette = false;
      this._clearItem(ks);
    }
  }

  _launchSpiny(kart) {
    const p = this._spawn(ITEMS.SPINY_SHELL, kart);
    p.position.copy(kart.position);
    p.position.y += 1.5;
    p.state = 'fly';
    p.life = SPINY_LIFE;
    p.ownerImmune = 0;
    const q = this.track.queryPosition(kart.position, kart.trackHint ?? undefined, this._q);
    p.trackDist = q.distance + 4;
    p.lateral = q.lateral;
    p.hint = q.index;
    p.homing = true;
    p.target = this._leader();
    p.phaseT = 0;
    if (p.target) this.bus.emit(EVENTS.ITEM_SPINY_WARNING, { target: p.target });
  }

  // ============================================================ pickups

  _pickups(ks) {
    const kart = ks.kart;
    if (kart.frozen) return;
    _v1.copy(kart.position);
    _v1.y += 0.7;
    // item boxes
    if (this.boxes && this.boxes.count) {
      const i = this.boxes.findHit(_v1, (kart.radius || 1.25) + 0.95);
      if (i >= 0) {
        const pos = this.boxes.boxes[i].position.clone();
        this.boxes.smash(i);
        this.bus.emit(EVENTS.ITEM_BOX_HIT, { kart, position: pos });
        if (!ks.type && !ks.roulette && !ks.held && ks.attached.length === 0) this._startRoulette(ks);
      }
    }
    // coins
    if (this.coins && this.coins.count) {
      const i = this.coins.findHit(_v1, (kart.radius || 1.25) + 0.55);
      if (i >= 0) {
        this.coins.collect(i);
        if ((kart.coins || 0) < MAX_COINS) kart.addCoins(1);
        this.bus.emit(EVENTS.COIN_PICKUP, {
          kart,
          coins: kart.coins,
          amount: 1,
          position: this.coins.coins[i].base.clone(),
        });
      }
    }
  }

  // ========================================================== projectiles

  _acquireModel(type) {
    const key = type === ITEMS.BANANA ? 'banana_peel' : type;
    const list = this.modelPool.get(key);
    let m = list && list.pop();
    if (!m) {
      m = createItemModel(key);
      m.userData.poolKey = key;
    }
    this.root.add(m);
    m.visible = true;
    m.scale.setScalar(1);
    m.rotation.set(0, 0, 0);
    return m;
  }

  _releaseModel(m) {
    if (!m) return;
    this.root.remove(m);
    const key = m.userData.poolKey;
    if (!this.modelPool.has(key)) this.modelPool.set(key, []);
    this.modelPool.get(key).push(m);
  }

  _spawn(type, owner) {
    const p = this.pool.pop() || new Projectile();
    p.reset();
    p.type = type;
    p.owner = owner;
    p.state = 'held';
    p.radius = type === ITEMS.BANANA ? BANANA_R : type === ITEMS.BOMB ? BOMB_R : SHELL_R;
    p.model = this._acquireModel(type);
    p.yaw = this.rng() * Math.PI * 2;
    p.hint = owner?.trackHint ?? -1;
    if (owner) p.position.copy(owner.position);
    this.projectiles.push(p);
    return p;
  }

  /** Removes a projectile. `emit` → ITEM_DESTROYED event. */
  _kill(p, emit = true) {
    if (!p.active) return;
    if (emit) this.bus.emit(EVENTS.ITEM_DESTROYED, { type: p.type, position: p.position.clone() });
    // detach from owner state
    if (p.attached && p.owner) {
      const ks = this.kartStates.get(p.owner);
      if (ks) {
        if (ks.held === p) ks.held = null;
        const i = ks.attached.indexOf(p);
        if (i >= 0) ks.attached.splice(i, 1);
      }
    }
    p.state = 'dead';
    this._releaseModel(p.model);
    p.model = null;
  }

  _trimGroundItems() {
    let n = 0;
    for (const p of this.projectiles) if (p.active && p.state === 'rest') n++;
    if (n <= MAX_GROUND_ITEMS) return;
    for (const p of this.projectiles) {
      if (p.active && p.state === 'rest') {
        this._kill(p, true);
        n--;
        if (n <= MAX_GROUND_ITEMS) break;
      }
    }
  }

  /** Ground point `dist` metres behind the kart. */
  _placeBehind(kart, out, dist) {
    out.copy(kart.position).addScaledVector(kart.forward, -dist);
    const q = this.track.queryPosition(out, kart.trackHint ?? undefined, this._q2);
    if (q.surface !== SURFACES.VOID) out.y = Math.max(q.groundHeight, Math.min(out.y, q.groundHeight + 3));
    return out;
  }

  _updateAttached(ks, dt) {
    const kart = ks.kart;
    const right = kartRight(kart, _right);
    const f = kart.forward;
    // single held: dragged behind on a short rope
    let anchorX = kart.position.x - f.x * (kart.radius * 0.6);
    let anchorZ = kart.position.z - f.z * (kart.radius * 0.6);
    let anchorY = kart.position.y;
    const ropeItems = [];
    if (ks.held) ropeItems.push(ks.held);
    for (const p of ks.attached) if (p.state === 'trail') ropeItems.push(p);
    let first = true;
    for (const p of ropeItems) {
      const spacing = first ? kart.radius * 0.6 + 1.15 : TRAIL_SPACING;
      first = false;
      let dx = p.position.x - anchorX;
      let dz = p.position.z - anchorZ;
      let d = Math.hypot(dx, dz);
      if (d < 1e-3) {
        dx = -f.x;
        dz = -f.z;
        d = 1;
      }
      // keep the chain behind the kart even when reversing / spinning
      p.position.x = anchorX + (dx / d) * spacing;
      p.position.z = anchorZ + (dz / d) * spacing;
      const q = this.track.queryPosition(p.position, p.hint >= 0 ? p.hint : undefined, this._q);
      p.hint = q.index;
      const gy = q.surface === SURFACES.VOID ? anchorY : q.groundHeight;
      p.position.y = kart.isAirborne ? Math.max(gy, anchorY - 0.4) : gy;
      p.velocity.copy(kart.velocity || _v3.set(0, 0, 0));
      anchorX = p.position.x;
      anchorZ = p.position.z;
      anchorY = p.position.y;
    }
    // orbiting shells
    let i = 0;
    const count = ks.attached.length;
    for (const p of ks.attached) {
      if (p.state !== 'orbit') continue;
      const a = this.time * ORBIT_SPEED + (i / Math.max(1, count)) * Math.PI * 2;
      const cx = Math.cos(a) * ORBIT_RADIUS;
      const cz = Math.sin(a) * ORBIT_RADIUS;
      p.position.copy(kart.position).addScaledVector(right, cx).addScaledVector(f, cz);
      p.position.y = kart.position.y + 0.15;
      if (kart.up) p.position.addScaledVector(kart.up, 0.05);
      p.velocity.copy(kart.velocity || _v3.set(0, 0, 0));
      i++;
    }
  }

  _updateProjectiles(dt) {
    const list = this.projectiles;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (!p.active) continue;
      p.age += dt;
      if (p.ownerImmune > 0) p.ownerImmune -= dt;
      if (p.attached) continue;
      if (p.age > p.life) {
        if (p.type === ITEMS.BOMB || p.type === ITEMS.SPINY_SHELL) this._explode(p);
        else this._kill(p, true);
        continue;
      }
      switch (p.state) {
        case 'slide':
          this._moveShell(p, dt);
          break;
        case 'air':
          this._moveAir(p, dt);
          break;
        case 'rest':
          this._moveRest(p, dt);
          break;
        case 'fall':
          p.velocity.y -= ITEM_GRAVITY * dt;
          p.position.addScaledVector(p.velocity, dt);
          if (p.age > 2.5 || p.phaseT > 2.0) this._kill(p, false);
          p.phaseT += dt;
          break;
        case 'fly':
        case 'hover':
        case 'dive':
          this._moveSpiny(p, dt);
          break;
        default:
          break;
      }
      if (p.active && p.type === ITEMS.BOMB && (p.state === 'rest' || p.state === 'air')) {
        p.fuse -= dt;
        if (p.fuse <= 0) this._explode(p);
      }
    }
    // compact
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.active) list[w++] = p;
      else {
        p.owner = null;
        p.target = null;
        this.pool.push(p);
      }
    }
    list.length = w;
  }

  _startFall(p) {
    p.state = 'fall';
    p.phaseT = 0;
    p.velocity.y = Math.min(p.velocity.y, 0);
    p.velocity.x *= 0.5;
    p.velocity.z *= 0.5;
  }

  _wallAndObstacles(p, q, bounce) {
    let hit = false;
    if (q.wallOffset !== null && q.wallOffset !== undefined) {
      const limit = q.wallOffset - p.radius;
      const lat = q.lateral;
      if (Math.abs(lat) > limit) {
        const s = Math.sign(lat);
        _v1.copy(q.right).multiplyScalar(s);
        _v1.y = 0;
        _v1.normalize();
        p.position.addScaledVector(_v1, -(Math.abs(lat) - limit));
        const vn = p.velocity.x * _v1.x + p.velocity.z * _v1.z;
        if (vn > 0) {
          if (bounce) {
            p.velocity.x -= 2 * vn * _v1.x;
            p.velocity.z -= 2 * vn * _v1.z;
          } else {
            p.velocity.x -= vn * _v1.x;
            p.velocity.z -= vn * _v1.z;
          }
          hit = true;
        }
      }
    }
    const obs = this.track.obstacles;
    if (obs && obs.length) {
      for (const o of obs) {
        const dx = p.position.x - o.position.x;
        const dz = p.position.z - o.position.z;
        const rr = o.radius + p.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && Math.abs(p.position.y - o.position.y) < 8) {
          const d = Math.sqrt(d2) || 1e-3;
          const nx = dx / d;
          const nz = dz / d;
          p.position.x = o.position.x + nx * rr;
          p.position.z = o.position.z + nz * rr;
          const vn = p.velocity.x * nx + p.velocity.z * nz;
          if (vn < 0) {
            if (bounce) {
              p.velocity.x -= 2 * vn * nx;
              p.velocity.z -= 2 * vn * nz;
            } else {
              p.velocity.x -= vn * nx;
              p.velocity.z -= vn * nz;
            }
            hit = 'obstacle';
          }
        }
      }
    }
    return hit;
  }

  _moveShell(p, dt) {
    const speed = Math.hypot(p.velocity.x, p.velocity.z) || 1;
    const steps = Math.max(1, Math.ceil((speed * dt) / 0.8));
    const h = dt / steps;
    for (let s = 0; s < steps && p.active; s++) {
      if (p.homing) this._steerRed(p, h);
      p.position.x += p.velocity.x * h;
      p.position.z += p.velocity.z * h;
      const q = this.track.queryPosition(p.position, p.hint >= 0 ? p.hint : undefined, this._q);
      p.hint = q.index;
      p.trackDist = q.distance;
      p.trackLat = q.lateral;
      p.trackDistKnown = true;
      if (q.surface === SURFACES.VOID) {
        this._startFall(p);
        return;
      }
      const isGreen = !p.homing;
      const hit = this._wallAndObstacles(p, q, isGreen);
      if (hit) {
        if (isGreen) {
          p.bounces++;
          this.bus.emit(EVENTS.ITEM_SHELL_BOUNCE, { position: p.position.clone() });
          if (p.bounces > GREEN_BOUNCES) {
            this._kill(p, true);
            return;
          }
          if (p.ownerImmune > 0.15) p.ownerImmune = 0.15; // can now hit its owner
        } else if (hit === 'obstacle' || p.locked) {
          this._kill(p, true);
          return;
        }
      }
      // keep constant speed, horizontal
      const sp = p.homing ? p.speedTarget || RED_SPEED : GREEN_SPEED;
      const cur = Math.hypot(p.velocity.x, p.velocity.z) || 1;
      p.velocity.x *= sp / cur;
      p.velocity.z *= sp / cur;
      const ny = q.groundHeight;
      p.velocity.y = (ny - p.position.y) / Math.max(h, 1e-3);
      p.position.y = ny;
    }
  }

  _steerRed(p, h) {
    const t = p.target;
    const track = this.track;
    let aimX;
    let aimZ;
    let turnRate;
    p.speedTarget = Math.max(RED_SPEED, (t ? Math.abs(t.speed || 0) : 0) + 9);
    if (t && !p.locked) {
      const dx = t.position.x - p.position.x;
      const dz = t.position.z - p.position.z;
      const d = Math.hypot(dx, dz);
      let gap = 0;
      if (p.trackDistKnown && t.trackInfo) {
        gap = (t.trackInfo.distance - p.trackDist + track.length) % track.length;
        if (gap > track.length * 0.85) gap -= track.length;
      }
      if (d < RED_LOCK_DIST && gap < 32 && gap > -12 && Math.abs(t.position.y - p.position.y) < 4) p.locked = true;
    }
    if (t && p.locked) {
      aimX = t.position.x + (t.velocity ? t.velocity.x * 0.05 : 0);
      aimZ = t.position.z + (t.velocity ? t.velocity.z * 0.05 : 0);
      turnRate = 10;
    } else {
      let lat = p.trackLat;
      if (t && t.trackInfo && p.trackDistKnown) {
        let gap = (t.trackInfo.distance - p.trackDist + track.length) % track.length;
        const k = Math.max(0, Math.min(1, 1 - gap / 90));
        lat = lat + (t.trackInfo.lateral - lat) * (0.25 + 0.75 * k);
      } else {
        lat *= 0.98;
      }
      // keep inside the road
      if (p.trackDistKnown) {
        const f = track.getFrameAtDistance(p.trackDist + 11, 0, this._frame);
        const hw = (this._q.halfWidth || 10) - 1.2;
        lat = Math.max(-hw, Math.min(hw, lat));
        aimX = f.position.x + f.right.x * lat;
        aimZ = f.position.z + f.right.z * lat;
      } else {
        aimX = p.position.x + p.velocity.x;
        aimZ = p.position.z + p.velocity.z;
      }
      turnRate = 7;
    }
    const desired = Math.atan2(aimX - p.position.x, aimZ - p.position.z);
    const cur = Math.atan2(p.velocity.x, p.velocity.z);
    let diff = desired - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxTurn = turnRate * h;
    const ang = cur + Math.max(-maxTurn, Math.min(maxTurn, diff));
    const sp = Math.hypot(p.velocity.x, p.velocity.z) || p.speedTarget;
    p.velocity.x = Math.sin(ang) * sp;
    p.velocity.z = Math.cos(ang) * sp;
  }

  _moveAir(p, dt) {
    const steps = Math.max(1, Math.ceil((Math.hypot(p.velocity.x, p.velocity.z) * dt) / 0.9));
    const h = dt / steps;
    for (let s = 0; s < steps && p.state === 'air'; s++) {
      p.velocity.y -= ITEM_GRAVITY * h;
      p.position.addScaledVector(p.velocity, h);
      const q = this.track.queryPosition(p.position, p.hint >= 0 ? p.hint : undefined, this._q);
      p.hint = q.index;
      this._wallAndObstacles(p, q, false);
      if (q.surface === SURFACES.VOID) {
        if (p.position.y < q.groundHeight - 0.5) this._startFall(p);
        continue;
      }
      if (p.position.y <= q.groundHeight && p.velocity.y <= 0) {
        p.position.y = q.groundHeight;
        p.velocity.y = 0;
        p.velocity.x *= p.type === ITEMS.BOMB ? 0.35 : 0.1;
        p.velocity.z *= p.type === ITEMS.BOMB ? 0.35 : 0.1;
        p.state = 'rest';
      }
    }
  }

  _moveRest(p, dt) {
    const sp = Math.hypot(p.velocity.x, p.velocity.z);
    if (sp > 0.01) {
      const ns = Math.max(0, sp - 9 * dt);
      p.velocity.x *= ns / sp;
      p.velocity.z *= ns / sp;
      p.position.x += p.velocity.x * dt;
      p.position.z += p.velocity.z * dt;
    } else if (p.groundSettled) {
      return;
    }
    const q = this.track.queryPosition(p.position, p.hint >= 0 ? p.hint : undefined, this._q);
    p.hint = q.index;
    this._wallAndObstacles(p, q, false);
    if (q.surface === SURFACES.VOID) {
      this._startFall(p);
      return;
    }
    p.position.y = q.groundHeight;
    p.groundSettled = sp <= 0.01;
  }

  _moveSpiny(p, dt) {
    const track = this.track;
    // retarget the current leader
    const leader = this._leader();
    if (leader && leader !== p.target && p.state === 'fly') {
      p.target = leader;
      this.bus.emit(EVENTS.ITEM_SPINY_WARNING, { target: leader });
    }
    const t = p.target;
    if (!t) {
      this._explode(p);
      return;
    }
    p.phaseT += dt;
    if (p.state === 'fly') {
      p.trackDist = (p.trackDist + SPINY_SPEED * dt) % track.length;
      p.lateral *= Math.max(0, 1 - dt * 1.5);
      const f = track.getFrameAtDistance(p.trackDist, p.lateral, this._frame);
      const rise = Math.min(1, p.phaseT / 0.6);
      _v1.copy(f.position).addScaledVector(_UP, SPINY_HEIGHT * rise + 1.5 * (1 - rise));
      if (p.phaseT < 0.6) p.position.lerp(_v1, Math.min(1, dt * 10));
      else p.position.copy(_v1);
      p.velocity.copy(f.tangent).multiplyScalar(SPINY_SPEED);
      const td = t.trackInfo ? t.trackInfo.distance : 0;
      const gap = (td - p.trackDist + track.length) % track.length;
      if (gap < 22 || gap > track.length - 3) {
        p.state = 'hover';
        p.phaseT = 0;
      }
    } else if (p.state === 'hover') {
      _v1.copy(t.position).addScaledVector(_UP, 5.5 - p.phaseT * 1.5);
      p.position.lerp(_v1, Math.min(1, dt * 7));
      p.velocity.copy(t.velocity || _v3.set(0, 0, 0));
      if (p.phaseT > 0.85) {
        p.state = 'dive';
        p.phaseT = 0;
      }
    } else if (p.state === 'dive') {
      _v1.copy(t.position);
      _v1.y += 0.4;
      const k = Math.min(1, p.phaseT / 0.28);
      p.position.lerp(_v1, Math.min(1, k * k + dt * 6));
      if (k >= 1) {
        p.position.copy(t.position);
        this._explode(p);
      }
    }
  }

  _explode(p) {
    if (!p.active) return;
    const radius = p.type === ITEMS.SPINY_SHELL ? SPINY_BLAST : BOMB_BLAST;
    const pos = p.position.clone();
    const type = p.type;
    const owner = p.owner;
    if (p.attached && owner) this._consumeAttached(this._stateOf(owner), p);
    this._kill(p, false);
    this.bus.emit(EVENTS.ITEM_EXPLOSION, { position: pos, radius, type });
    for (const k of this.karts) {
      const dx = k.position.x - pos.x;
      const dy = k.position.y + 0.5 - pos.y;
      const dz = k.position.z - pos.z;
      if (dx * dx + dy * dy + dz * dz < radius * radius) this._hitKart(k, type, owner, k.position, 'launch');
    }
    for (const q of this.projectiles) {
      if (!q.active || q === p || q.type === ITEMS.SPINY_SHELL || q.attached) continue;
      if (q.position.distanceToSquared(pos) < radius * radius) {
        if (q.type === ITEMS.BOMB) q.fuse = Math.min(q.fuse, 0.12);
        else this._kill(q, true);
      }
    }
  }

  // ============================================================ collisions

  _contactKart(p, k) {
    const dx = p.position.x - k.position.x;
    const dz = p.position.z - k.position.z;
    const rr = (k.radius || 1.25) + p.radius;
    if (dx * dx + dz * dz > rr * rr) return false;
    const dy = p.position.y + 0.3 - (k.position.y + 0.6);
    return Math.abs(dy) < 1.7;
  }

  _projectileVsKarts() {
    for (const p of this.projectiles) {
      if (!p.active || p.state === 'fall' || p.type === ITEMS.SPINY_SHELL) continue;
      for (const k of this.karts) {
        if (!p.active) break;
        if (k === p.owner && (p.attached || p.ownerImmune > 0)) continue;
        // a kart that is already spinning / tumbling is briefly untouchable: items pass through
        if (k.isSpunOut && p.type !== ITEMS.BOMB) continue;
        if (!this._contactKart(p, k)) continue;
        this._onContact(p, k);
      }
    }
  }

  _onContact(p, k) {
    const ownerState = p.attached && p.owner ? this._stateOf(p.owner) : null;
    if (k.isInvincible) {
      if (ownerState) this._consumeAttached(ownerState, p);
      if (p.type === ITEMS.BOMB) this._explode(p);
      else this._kill(p, true);
      return;
    }
    if (p.type === ITEMS.BOMB) {
      this._explode(p);
      return;
    }
    if (this._tryBlock(k, p)) {
      if (ownerState) this._consumeAttached(ownerState, p);
      this._kill(p, true);
      return;
    }
    if (ownerState) this._consumeAttached(ownerState, p);
    const pos = p.position.clone();
    const type = p.type;
    const owner = p.owner;
    this._kill(p, false);
    this._hitKart(k, type, owner, pos, 'spin');
  }

  /** A kart's own attached items absorb an incoming item. */
  _tryBlock(kart, p) {
    const ks = this._stateOf(kart);
    // orbiting shells: any direction
    let shield = null;
    for (const a of ks.attached) if (a.state === 'orbit') shield = a;
    if (!shield) {
      const dx = p.position.x - kart.position.x;
      const dz = p.position.z - kart.position.z;
      const fromBehind = dx * kart.forward.x + dz * kart.forward.z < 0;
      if (fromBehind) {
        if (ks.held) shield = ks.held;
        else for (const a of ks.attached) if (a.state === 'trail') shield = a;
      }
    }
    if (!shield) return false;
    this.bus.emit(EVENTS.ITEM_BLOCKED, { kart, type: p.type, position: shield.position.clone() });
    this._consumeAttached(ks, shield);
    if (shield.type === ITEMS.BOMB) this._explode(shield);
    else this._kill(shield, true);
    return true;
  }

  _hitKart(k, type, attacker, position, kind) {
    if (k.isInvincible) return false;
    if (k.isSpunOut && kind !== 'launch') return false;
    this._inHit = true;
    let applied;
    try {
      if (kind === 'launch') applied = k.launch(type);
      else applied = k.spinOut(type, type === ITEMS.BANANA ? 1.1 : 1.35);
    } finally {
      this._inHit = false;
    }
    if (applied === false) return false;
    this._afterHit(k, type, attacker, position);
    return true;
  }

  /** Item-side consequences of any hit: drop attached items, lose coins, ITEM_HIT event. */
  _afterHit(k, type, attacker, position) {
    const ks = this._stateOf(k);
    // lose held / orbiting items
    if (ks.held || ks.attached.length) {
      for (const a of [...ks.attached]) this._kill(a, true);
      if (ks.held) this._kill(ks.held, true);
      ks.held = null;
      ks.attached.length = 0;
      if (ks.type && (SINGLE_HOLDABLE.has(ks.type) || TRIPLE_PROJECTILE[ks.type])) {
        ks.type = null;
        ks.count = 0;
      }
    }
    const lost = Math.min(HIT_COIN_LOSS, k.coins || 0);
    if (lost > 0) {
      k.loseCoins(lost);
      this.bus.emit(EVENTS.COIN_LOST, { kart: k, amount: lost, position: k.position.clone() });
      this.coins?.burst(k.position, lost, k.position.y);
    }
    this.bus.emit(EVENTS.ITEM_HIT, { kart: k, type, attacker: attacker || null, position: position.clone() });
  }

  _onKartSpinout({ kart, cause }) {
    if (this._inHit || !kart || !this.kartStates.has(kart)) return;
    if (cause !== 'star' && cause !== 'squish' && cause !== 'squash') return;
    // contact hits can re-trigger every physics step while karts overlap: one consequence per 1.2 s
    const ks = this._stateOf(kart);
    if (this.time - (ks.lastContactHit ?? -9) < 1.2) return;
    ks.lastContactHit = this.time;
    // find the culprit: nearest star kart (ram) or nearest full-size kart (squish)
    let best = null;
    let bestD = Infinity;
    for (const o of this.karts) {
      if (o === kart) continue;
      if (cause === 'star' ? !((o.starTimer || 0) > 0) : o.isShrunk) continue;
      const d = o.position.distanceToSquared(kart.position);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    this._afterHit(kart, cause === 'star' ? ITEMS.STAR : 'squish', best, kart.position);
  }

  _projectileVsProjectile() {
    const list = this.projectiles;
    const n = list.length;
    for (let i = 0; i < n; i++) {
      const a = list[i];
      if (!a.active || a.state === 'fall' || a.type === ITEMS.SPINY_SHELL) continue;
      const aMoving = a.state === 'slide' || a.attached;
      for (let j = i + 1; j < n; j++) {
        const b = list[j];
        if (!a.active) break;
        if (!b.active || b.state === 'fall' || b.type === ITEMS.SPINY_SHELL) continue;
        const bMoving = b.state === 'slide' || b.attached;
        if (!aMoving && !bMoving) continue; // two resting items never interact
        if (a.attached && b.attached) {
          if (a.owner === b.owner) continue;
        }
        if (a.owner === b.owner && (a.ownerImmune > 0 || b.ownerImmune > 0)) continue;
        if (a.attached && b.state === 'air') continue;
        if (b.attached && a.state === 'air') continue;
        const rr = a.radius + b.radius;
        if (a.position.distanceToSquared(b.position) > rr * rr) continue;
        this._clash(a, b);
      }
    }
  }

  _clash(a, b) {
    for (const p of [a, b]) {
      if (!p.active) continue;
      if (p.attached && p.owner) {
        const other = p === a ? b : a;
        const ks = this._stateOf(p.owner);
        this.bus.emit(EVENTS.ITEM_BLOCKED, { kart: p.owner, type: other.type, position: p.position.clone() });
        this._consumeAttached(ks, p);
      }
    }
    for (const p of [a, b]) {
      if (!p.active) continue;
      if (p.type === ITEMS.BOMB) this._explode(p);
      else this._kill(p, true);
    }
  }

  // ================================================================ visuals

  _updateVisuals(dt, time) {
    for (const p of this.projectiles) {
      const m = p.model;
      if (!p.active || !m) continue;
      m.position.copy(p.position);
      const sp = Math.hypot(p.velocity.x, p.velocity.z);
      switch (p.type) {
        case ITEMS.BANANA:
          m.rotation.set(0, p.yaw, 0);
          if (p.state === 'air') m.rotation.x = p.age * 9;
          if (p.state === 'fall') m.rotation.z = p.phaseT * 4;
          m.userData.tick?.(time, dt);
          break;
        case ITEMS.BOMB: {
          if (sp > 0.5) p.yaw = Math.atan2(p.velocity.x, p.velocity.z);
          m.rotation.set(0, p.yaw, 0);
          const walking = p.attached || sp > 1 ? 1 : 0.15;
          m.userData.fuse = p.attached ? 1 : Math.max(0, p.fuse / BOMB_FUSE);
          m.userData.tick?.(time, dt, walking);
          if (!p.attached && p.fuse < 1.2) {
            const f = 1 - p.fuse / 1.2;
            m.scale.setScalar(1 + Math.max(0, Math.sin(time * (14 + f * 30))) * 0.12 * f);
          } else m.scale.setScalar(1);
          break;
        }
        case ITEMS.SPINY_SHELL:
          if (sp > 0.5) m.rotation.y = Math.atan2(p.velocity.x, p.velocity.z);
          m.userData.tick?.(time, dt);
          m.scale.setScalar(1.15);
          break;
        default:
          m.userData.tick?.(time + p.id, dt);
          break;
      }
    }
  }
}
