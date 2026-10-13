import * as THREE from 'three';
import {
  EVENTS,
  SURFACES,
  DRIFT_LEVELS,
  GRAVITY,
  BASE_MAX_SPEED,
  ENGINE_CLASSES,
  MAX_COINS,
  COIN_SPEED_BONUS,
} from '../core/constants.js';
import { buildKartInstance, disposeKartInstance } from './KartModel.js';

/**
 * Arcade kart: physics (one fixed step per `update`) + per-frame visuals.
 * See ARCHITECTURE.md §2 for the public contract.
 *
 * Model: planar velocity (x/z) + vertical velocity. While grounded the horizontal velocity is
 * decomposed every step into `speed` (along the heading) and `slip` (sideways); grip rotates the
 * velocity with the heading and bleeds slip away. Vertical motion is ballistic with the ground as a
 * one-sided constraint, which gives natural airtime over sharp crests.
 */

/** Tuning (exported for sandboxes; physics reads it live). */
export const KART_TUNING = {
  accelLow: 10.5, // launch acceleration (m/s²) for accel stat 1
  accelHigh: 16.5, // ... for accel stat 5
  accelKnee: 0.62, // fraction of top speed where the accel curve starts to taper
  accelTaperExp: 0.8,
  coastDecel: 5.5,
  coastDrag: 0.1,
  brakeDecel: 30,
  reverseAccel: 12,
  reverseMax: 9,
  overSpeedDecay: 1.5, // 1/s exponential bleed of speed above the cap (road)
  overSpeedDecayOffroad: 3.4,
  turnRate: 2.05, // rad/s at medium speed for handling 3
  turnRateTop: 0.74, // fraction kept at top speed
  turnFullSpeed: 8, // m/s at which full turn rate is available
  steerRise: 7.5, // steering smoothing (keyboard is digital)
  steerFall: 12,
  yawResponse: 13,
  gripFollow: 0.9, // fraction of heading change the velocity follows instantly
  slipDecay: 9, // 1/s
  hopVel: 4.4,
  hopTurn: 0.5, // turn-rate multiplier while hopping (picks a direction without over-rotating)
  driftMinSpeed: 9,
  driftKeepSpeed: 6,
  driftRadiusIn: 13, // drift arc radius (m) steering into the drift
  driftRadiusNeutral: 24,
  driftRadiusOut: 80, // ... counter-steering (wide arc)
  driftSlip: 2.6, // outward slide while drifting (m/s)
  driftSlipDecay: 5,
  driftChargeIn: 1.35,
  driftChargeNeutral: 1.0,
  driftChargeOut: 0.55,
  driftChargeOffroad: 0.25,
  driftVisualAngle: 0.42,
  boostTopMul: 0.35,
  boostAccel: 44,
  boostKick: 2.5,
  offroadCapLow: 0.47,
  offroadCapHigh: 0.64,
  offroadDrag: 2.5,
  starTopMul: 0.12,
  shrinkTopMul: 0.8,
  airControl: 0.4,
  slopeGravity: 0.3,
  separationVel: 1.3, // m/s of upward relative speed needed to leave the ground
  wallBounce: 0.3,
  wallScrub: 0.45,
  spinDecel: 22,
  hopTrickWindow: 0.35,
};

const T = KART_TUNING;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const statLerp = (s, a, b) => a + ((clamp(s ?? 3, 1, 5) - 1) / 4) * (b - a);
const smooth01 = (x) => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeInOut = (t) => {
  t = clamp(t, 0, 1);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
};

// scratch
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _left = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _frame = { position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), distance: 0 };
const _color = new THREE.Color();

function makeTrackQuery() {
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
    wallOffset: 18,
    groundHeight: 0,
    groundNormal: new THREE.Vector3(0, 1, 0),
    surface: SURFACES.ROAD,
    rampBoost: 0,
  };
}

/** Second-order spring helper (value, velocity) — juicy, slightly under-damped. */
class Spring {
  constructor(freq = 8, zeta = 0.5) {
    this.x = 0;
    this.v = 0;
    this.freq = freq;
    this.zeta = zeta;
  }
  update(target, dt) {
    const w = this.freq * Math.PI * 2;
    // semi-implicit Euler with substeps for stability
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      const a = w * w * (target - this.x) - 2 * this.zeta * w * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    return this.x;
  }
  reset(x = 0) {
    this.x = x;
    this.v = 0;
  }
}

export class Kart {
  /**
   * @param {{ character: object, index: number, isPlayer?: boolean, bus?: import('../core/EventBus.js').EventBus, engineClass?: number }} opts
   */
  constructor({ character, index = 0, isPlayer = false, bus = null, engineClass = 150 }) {
    this.index = index;
    this.character = character;
    this.name = character.name;
    this.isPlayer = isPlayer;
    this.isAI = !isPlayer;
    this.bus = bus;
    this.engineClass = engineClass;

    const { root, rig } = buildKartInstance(character);
    this.rig = rig;
    this.mesh = new THREE.Group();
    this.mesh.name = 'Kart:' + character.id + ':' + index;
    this.mesh.add(root);
    this.mesh.userData.kart = this;
    this.anchors = rig.anchors;

    // stats → real numbers
    const st = character.stats || {};
    const ec = ENGINE_CLASSES[engineClass] || ENGINE_CLASSES[150];
    this.stats = {
      topSpeed: BASE_MAX_SPEED * (1 + ((st.speed ?? 3) - 3) * 0.03) * ec.speedMul,
      accel: statLerp(st.accel, T.accelLow, T.accelHigh) * ec.accelMul,
      handling: statLerp(st.handling, 0.86, 1.14),
      weight: statLerp(st.weight, 0.75, 1.55),
      offroadCap: statLerp(st.offroad, T.offroadCapLow, T.offroadCapHigh),
      yawResponse: statLerp(st.weight, 1.15, 0.86),
    };
    this.baseRadius = 1.25;
    this.baseWeight = this.stats.weight;

    // physics state
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.heading = 0;
    this.quaternion = new THREE.Quaternion();
    this.forward = new THREE.Vector3(0, 0, 1);
    this.up = new THREE.Vector3(0, 1, 0);
    this.speed = 0;
    this.slip = 0;
    this.yawRate = 0;
    this.maxSpeed = this.stats.topSpeed;
    this.radius = this.baseRadius;
    this.weight = this.baseWeight;
    this.isAirborne = false;
    this.airTime = 0;
    this.surface = SURFACES.ROAD;
    this.isDrifting = false;
    this.driftDirection = 1;
    this.driftLevel = 0;
    this.driftCharge = 0;
    this.boostTimer = 0;
    this.boostPower = 0;
    this.boostSource = null;
    this.starTimer = 0;
    this.ghostTimer = 0;
    this.spinoutTimer = 0;
    this.shrinkTimer = 0;
    this.coins = 0;
    this.speedScale = 1;
    this.trackInfo = makeTrackQuery();
    this.trackHint = undefined;
    this.lastSafeDistance = NaN;
    this.frozen = false;
    this.controls = { throttle: 0, brake: 0, steer: 0, drift: false, item: false, itemPressed: false, lookBack: false };
    // extras (read-only for other modules)
    this.steerSmoothed = 0;
    this.rpm = 0; // 0..1 engine load for audio
    this.isFalling = false;
    this.isRespawning = false;
    this.lastHitCause = null;

    // race state (RaceManager)
    this.racePosition = index + 1;
    this.lap = 0;
    this.finished = false;
    this.finishTime = null;
    this.raceDistance = 0;

    this._resetInternal();
    this._initVisualState();
    this._syncMesh();
  }

  // ------------------------------------------------------------------ getters
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
  get isStar() {
    return this.starTimer > 0;
  }

  _emit(name, payload) {
    if (this.bus) this.bus.emit(name, payload);
  }

  _resetInternal() {
    this._vy = 0;
    this._prevDrift = false;
    this._hopAir = false;
    this._rampAir = false;
    this._driftArmed = false;
    this._driftWindow = 0;
    this._hopSteerDir = 0;
    this._trickQueued = false;
    this._trickPending = false;
    this._trickTimer = 0;
    this._trickPressed = -1;
    this._rampArm = 0;
    this._prevSurface = SURFACES.ROAD;
    this._wallCooldown = 0;
    this._fallTimer = 0;
    this._respawnHang = 0;
    this._respawnTotal = 0.9;
    this._respawnTarget = new THREE.Vector3();
    this._stallTimer = 0;
    this._spinTotal = 1;
    this._spinCause = null;
    this._launchTimer = 0;
    this._hitPose = 0;
    this._accelLong = 0;
    this._lastSpeed = 0;
    this._landImpact = 0;
    this._countdown = null;
    this._startPress = null; // { count, time } of first throttle press during countdown
    this._countClock = 0;
    this._starWasOn = false;
    this._queriedOnce = false;
    this._countStamp = 0;
  }

  // ------------------------------------------------------------------ public API

  /** Place on the grid and reset all state. Accepts the objects from track.getStartGrid(). */
  placeAtStart({ position, heading = 0, distance } = {}) {
    if (position) this.position.copy(position);
    this.heading = heading;
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    this.slip = 0;
    this.yawRate = 0;
    this.isAirborne = false;
    this.airTime = 0;
    this.isDrifting = false;
    this.driftLevel = 0;
    this.driftCharge = 0;
    this.boostTimer = 0;
    this.boostPower = 0;
    this.starTimer = 0;
    this.ghostTimer = 0;
    this.spinoutTimer = 0;
    this.shrinkTimer = 0;
    this.coins = 0;
    this.speedScale = 1;
    this.isFalling = false;
    this.isRespawning = false;
    this.lap = 0;
    this.finished = false;
    this.finishTime = null;
    this.raceDistance = 0;
    this.steerSmoothed = 0;
    this.radius = this.baseRadius;
    this.weight = this.baseWeight;
    this.surface = SURFACES.ROAD;
    this.lastSafeDistance = distance ?? NaN;
    if (Number.isFinite(distance)) this.trackInfo.distance = distance;
    this.trackHint = undefined;
    this._resetInternal();
    this.up.set(0, 1, 0);
    this._updateOrientation(0, true);
    this._resetVisuals();
    this._syncMesh();
  }

  /** Boost: raises the speed cap ~35% (× power) and pushes hard. */
  applyBoost(duration, power = 1, source = 'mushroom') {
    if (this.isFalling) return;
    if (this.boostTimer <= 0) this.boostPower = power;
    else this.boostPower = Math.max(this.boostPower, power);
    this.boostTimer = Math.max(this.boostTimer, duration);
    this.boostSource = source;
    const cap = this._baseCap() * (1 + T.boostTopMul * this.boostPower);
    if (this.speed >= 0) this.speed = Math.min(cap, this.speed + T.boostKick * power);
    this._recompose();
    this._vis.boostKick = 1;
    this._emit(EVENTS.KART_BOOST, { kart: this, source, duration, power });
  }

  /** Spin out (banana, shell, star collision, squish...). Ignored while invincible. */
  spinOut(cause = 'banana', duration = 1.1) {
    if (this.isInvincible || this.isFalling || this.isRespawning) return false;
    if (this.spinoutTimer > 0.25 && cause !== 'squish') return false;
    this._endDrift(false);
    this.boostTimer = 0;
    this.spinoutTimer = duration;
    this._spinTotal = duration;
    this._spinCause = cause;
    this._hitPose = duration + 1.0;
    this.lastHitCause = cause;
    this._emit(EVENTS.KART_SPINOUT, { kart: this, cause });
    return true;
  }

  /** Big hit: tumble through the air (~1.6 s). */
  launch(cause = 'bomb') {
    if (this.isInvincible || this.isFalling || this.isRespawning) return false;
    this._endDrift(false);
    this.boostTimer = 0;
    this.spinoutTimer = 1.6;
    this._spinTotal = 1.6;
    this._spinCause = 'launch';
    this._launchTimer = 1.6;
    this._hitPose = 2.6;
    this.lastHitCause = cause;
    this.speed *= 0.3;
    this.slip *= 0.3;
    this._vy = Math.max(this._vy, 0) + 10.5;
    this.isAirborne = true;
    this._hopAir = false;
    this._rampAir = false;
    this.airTime = 0;
    this._recompose();
    this._emit(EVENTS.KART_LAUNCHED, { kart: this, cause });
    return true;
  }

  /** Lightning: shrink for `duration` seconds (star protects). */
  shrink(duration = 6) {
    if (this.starTimer > 0 || this.isFalling) return false;
    this.shrinkTimer = Math.max(this.shrinkTimer, duration);
    this._emit(EVENTS.KART_SHRINK, { kart: this, duration });
    return true;
  }

  startStar(duration = 7.5) {
    this.starTimer = Math.max(this.starTimer, duration);
    this.shrinkTimer = 0;
    this.spinoutTimer = 0;
    this._launchTimer = 0;
    this._starWasOn = true;
    this._emit(EVENTS.KART_STAR_START, { kart: this, duration });
  }

  addCoins(n = 1) {
    this.coins = clamp(this.coins + n, 0, MAX_COINS);
    return this.coins;
  }

  loseCoins(n = 1) {
    const before = this.coins;
    this.coins = clamp(this.coins - n, 0, MAX_COINS);
    return before - this.coins;
  }

  /** "Lakitu": lift back onto the road at lastSafeDistance, then 1.5 s of ghost invincibility. */
  respawn(track) {
    if (!track) return;
    const len = track.length || 1;
    let d = Number.isFinite(this.lastSafeDistance) ? this.lastSafeDistance : this.trackInfo.distance || 0;
    d = ((d % len) + len) % len;
    const f = track.getFrameAtDistance(d, 0, _frame);
    this._respawnTarget.copy(f.position);
    this.heading = Math.atan2(f.tangent.x, f.tangent.z);
    this.velocity.set(0, 0, 0);
    this.speed = 0;
    this.slip = 0;
    this.yawRate = 0;
    this._vy = 0;
    this.isAirborne = true;
    this.isFalling = false;
    this.isRespawning = true;
    this._respawnHang = this._respawnTotal;
    this.spinoutTimer = 0;
    this._launchTimer = 0;
    this.boostTimer = 0;
    this._endDrift(false);
    this.ghostTimer = this._respawnTotal + 1.5;
    this._queriedOnce = false;
    this.position.copy(this._respawnTarget).addScaledVector(WORLD_UP, 3.5);
    if (track.samples && track.samples.length) {
      this.trackHint = Math.round((d / len) * track.samples.length) % track.samples.length;
    } else this.trackHint = undefined;
    this.up.copy(WORLD_UP);
    this._updateOrientation(0, true);
    this._syncMesh();
    this._emit(EVENTS.KART_RESPAWN, { kart: this });
  }

  /** Countdown tick (3, 2, 1). Tracks throttle timing for the rocket start. */
  onCountdown(count) {
    if (count <= 0) return;
    if (count === 2 && this._startPress === null && this.controls.throttle > 0.5) {
      // held since "3" → too early
      this._startPress = { count: 3, time: 0 };
    }
    this._countdown = count;
    this._countStamp = typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  _countTime() {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    return (now - this._countStamp) / 1000;
  }

  /** GO! Rocket start if throttle was pressed just after "2"; stall if pressed before. */
  onRaceStart() {
    this.frozen = false;
    const p = this._startPress;
    const holding = this.controls.throttle > 0.5;
    if (p && holding) {
      if (p.count >= 3) {
        this._stallTimer = 1.0;
        this._emit(EVENTS.KART_START_STALL, { kart: this });
      } else if (p.count === 2) {
        // the sooner after "2", the stronger (perfect window: first 0.6 s)
        const q = p.time < 0.6 ? 1 : clamp(1 - (p.time - 0.6) / 0.6, 0.35, 1);
        this.applyBoost(0.6 + 0.6 * q, 0.7 + 0.3 * q, 'start');
      }
    }
    this._countdown = null;
    this._startPress = null;
  }

  // ------------------------------------------------------------------ physics

  _baseCap() {
    let top = this.stats.topSpeed * this.speedScale * (1 + this.coins * COIN_SPEED_BONUS);
    if (this.shrinkTimer > 0) top *= T.shrinkTopMul;
    if (this.starTimer > 0) top *= 1 + T.starTopMul;
    return top;
  }

  _computeMaxSpeed(surface) {
    let top = this._baseCap();
    if (this.boostTimer > 0) top *= 1 + T.boostTopMul * this.boostPower;
    else if (surface === SURFACES.OFFROAD && this.starTimer <= 0) top *= this.stats.offroadCap;
    return top;
  }

  _recompose() {
    const s = Math.sin(this.heading);
    const c = Math.cos(this.heading);
    // forward (s,0,c), right (-c,0,s)
    this.velocity.x = s * this.speed - c * this.slip;
    this.velocity.z = c * this.speed + s * this.slip;
  }

  _decompose() {
    const s = Math.sin(this.heading);
    const c = Math.cos(this.heading);
    this.speed = this.velocity.x * s + this.velocity.z * c;
    this.slip = -this.velocity.x * c + this.velocity.z * s;
  }

  _query(track) {
    const hint = this.trackHint;
    const res = track.queryPosition(this.position, hint === undefined || hint === null || hint < 0 ? undefined : hint, this.trackInfo);
    if (res && res !== this.trackInfo) this.trackInfo = res;
    this.trackHint = this.trackInfo.index;
    return this.trackInfo;
  }

  _startDrift(dir) {
    this.isDrifting = true;
    this.driftDirection = dir >= 0 ? 1 : -1;
    this.driftCharge = 0;
    this.driftLevel = 0;
    this._driftArmed = false;
    this._driftWindow = 0;
    this._emit(EVENTS.KART_DRIFT_START, { kart: this, direction: this.driftDirection });
  }

  /** @param {boolean} reward give the mini-turbo of the reached level */
  _endDrift(reward) {
    if (!this.isDrifting) {
      this.driftCharge = 0;
      this.driftLevel = 0;
      return;
    }
    const level = this.driftLevel;
    this.isDrifting = false;
    this.driftCharge = 0;
    this.driftLevel = 0;
    this._emit(EVENTS.KART_DRIFT_END, { kart: this, level: reward ? level : 0 });
    if (reward && level > 0) {
      const lv = DRIFT_LEVELS[level];
      this.applyBoost(lv.boostTime, 0.78 + 0.08 * level, 'miniturbo');
    }
  }

  /** ONE fixed physics step. */
  update(dt, track) {
    this._track = track;
    const c = this.controls;
    const throttleIn = c.throttle || 0;

    // engine load for audio / revving visuals
    const rpmTarget = this.frozen
      ? throttleIn * (0.7 + 0.15 * Math.sin(performance.now() * 0.02))
      : clamp(Math.abs(this.speed) / Math.max(1, this.stats.topSpeed), 0, 1.3) * 0.75 + throttleIn * 0.25;
    this.rpm += (rpmTarget - this.rpm) * damp(8, dt);

    // timers
    this._wallCooldown = Math.max(0, this._wallCooldown - dt);
    this._hitPose = Math.max(0, this._hitPose - dt);
    this._trickTimer = Math.max(0, this._trickTimer - dt);
    if (this.boostTimer > 0) {
      this.boostTimer = Math.max(0, this.boostTimer - dt);
      if (this.boostTimer === 0) this.boostPower = 0;
    }
    if (this.starTimer > 0) {
      this.starTimer = Math.max(0, this.starTimer - dt);
      if (this.starTimer === 0 && this._starWasOn) {
        this._starWasOn = false;
        this._emit(EVENTS.KART_STAR_END, { kart: this });
      }
    }
    if (this.ghostTimer > 0) this.ghostTimer = Math.max(0, this.ghostTimer - dt);
    if (this.shrinkTimer > 0) this.shrinkTimer = Math.max(0, this.shrinkTimer - dt);
    if (this.spinoutTimer > 0) this.spinoutTimer = Math.max(0, this.spinoutTimer - dt);
    if (this._launchTimer > 0) this._launchTimer = Math.max(0, this._launchTimer - dt);
    if (this._stallTimer > 0) this._stallTimer = Math.max(0, this._stallTimer - dt);
    // smooth collision size changes
    const shrunk = this.shrinkTimer > 0;
    this.radius += ((shrunk ? 0.72 : this.baseRadius) - this.radius) * damp(6, dt);
    this.weight = this.starTimer > 0 ? this.baseWeight * 4 : shrunk ? this.baseWeight * 0.35 : this.baseWeight;

    // ---- frozen (intro / countdown): engine revving only
    if (this.frozen) {
      this._trackStartThrottle(throttleIn);
      this.velocity.set(0, 0, 0);
      this.speed = 0;
      this.slip = 0;
      this._vy = 0;
      this._prevDrift = !!c.drift;
      // keep trackInfo valid on the grid and sit the kart on the road
      if (track) {
        const info = this._query(track);
        this._queriedOnce = true;
        if (!Number.isFinite(this.lastSafeDistance)) this.lastSafeDistance = info.distance;
        if (info.surface !== SURFACES.VOID) this.position.y = info.groundHeight;
        this.isAirborne = false;
        this.surface = info.surface;
        this._prevSurface = info.surface;
        this.maxSpeed = this._computeMaxSpeed(info.surface);
      }
      this._updateOrientation(dt, false);
      this._syncMesh();
      return;
    }

    // ---- respawn: hanging from the sky
    if (this._respawnHang > 0) {
      this._respawnHang = Math.max(0, this._respawnHang - dt);
      const k = 1 - this._respawnHang / this._respawnTotal;
      this.position.copy(this._respawnTarget).addScaledVector(WORLD_UP, lerp(3.5, 0.45, easeOutCubic(k)));
      this.velocity.set(0, 0, 0);
      this.speed = 0;
      this._vy = 0;
      this.isAirborne = true;
      this._prevDrift = !!c.drift;
      if (this._respawnHang === 0) {
        this.isRespawning = false;
        this._hopAir = false;
        this._rampAir = false;
        this.airTime = 0;
      }
      this._updateOrientation(dt, false);
      this._syncMesh();
      return;
    }

    // ---- falling into the void
    if (this.isFalling) {
      this._fallTimer -= dt;
      this._vy -= GRAVITY * dt;
      this.velocity.x *= 1 - damp(1.2, dt);
      this.velocity.z *= 1 - damp(1.2, dt);
      this.position.x += this.velocity.x * dt;
      this.position.z += this.velocity.z * dt;
      this.position.y += this._vy * dt;
      this.velocity.y = this._vy;
      this._decompose();
      this._syncMesh();
      if (this._fallTimer <= 0) this.respawn(track);
      return;
    }

    let info = this.trackInfo;
    if (!this._queriedOnce) {
      info = this._query(track);
      this._queriedOnce = true;
      if (!Number.isFinite(this.lastSafeDistance)) this.lastSafeDistance = info.distance;
    }
    const surface = info.surface;
    const hasControl = this.spinoutTimer <= 0;
    const canDrive = hasControl && this._stallTimer <= 0;

    // ---- steering input (smoothed, response curve for analog sticks)
    const rawSteer = hasControl ? clamp(c.steer || 0, -1, 1) : 0;
    const shaped = Math.sign(rawSteer) * Math.pow(Math.abs(rawSteer), 1.35);
    const growing = Math.abs(shaped) > Math.abs(this.steerSmoothed) && Math.sign(shaped) === Math.sign(this.steerSmoothed || shaped);
    const sRate = (growing ? T.steerRise : T.steerFall) * dt;
    this.steerSmoothed += clamp(shaped - this.steerSmoothed, -sRate, sRate);

    const driftDown = !!c.drift;
    const driftPressed = driftDown && !this._prevDrift;
    this._prevDrift = driftDown;

    // ---- caps
    this.maxSpeed = this._computeMaxSpeed(this.isAirborne ? this._prevSurface : surface);
    const top = this.maxSpeed;

    // ---- hop / drift / trick input
    if (driftPressed && hasControl) {
      if (!this.isAirborne) {
        if (surface === SURFACES.RAMP) {
          this._trickQueued = true;
        } else {
          this._vy += T.hopVel;
          this.isAirborne = true;
          this._hopAir = true;
          this._rampAir = false;
          this.airTime = 0;
          this._driftArmed = true;
          this._hopSteerDir = Math.abs(rawSteer) > 0.3 ? Math.sign(rawSteer) : 0;
          this._vis.squashV += 2.4;
          this._emit(EVENTS.KART_HOP, { kart: this });
        }
      } else if (this._rampAir && this.airTime < T.hopTrickWindow && !this._trickPending) {
        this._doTrick();
      } else if (!this._hopAir) {
        this._driftArmed = true;
      }
    }
    if (this.isAirborne && this._hopAir && Math.abs(rawSteer) > 0.3) this._hopSteerDir = Math.sign(rawSteer);

    // drift maintenance
    if (this.isDrifting) {
      if (!driftDown || !hasControl || this.speed < T.driftKeepSpeed) {
        this._endDrift(driftDown === false && hasControl);
      }
    } else if (!this.isAirborne && driftDown && hasControl && this._driftWindow > 0) {
      this._driftWindow -= dt;
      if (Math.abs(rawSteer) > 0.35 && this.speed > T.driftMinSpeed) this._startDrift(Math.sign(rawSteer));
    }
    if (!driftDown) {
      this._driftArmed = false;
      this._driftWindow = 0;
    }

    // ---- yaw
    const v = Math.abs(this.speed);
    let turn;
    if (this.isDrifting) {
      // arc curvature: steering into the drift tightens it, counter-steer widens it
      const rel = this.steerSmoothed * this.driftDirection;
      const kN = 1 / T.driftRadiusNeutral;
      const kappa = rel >= 0 ? lerp(kN, 1 / T.driftRadiusIn, rel) : lerp(kN, 1 / T.driftRadiusOut, -rel);
      turn = this.driftDirection * Math.max(v, 9) * kappa * Math.sqrt(this.stats.handling);
    } else {
      // full steering from ~8 m/s; a little pivot when nearly stopped so karts never get stuck on walls
      const pedal = Math.max(c.throttle || 0, c.brake || 0);
      const sf = Math.max(smooth01(v / T.turnFullSpeed), v < 4 ? 0.32 * pedal : 0);
      const hi = lerp(1, T.turnRateTop, clamp((v - 12) / Math.max(1, this.stats.topSpeed - 12), 0, 1));
      turn = this.steerSmoothed * T.turnRate * this.stats.handling * sf * hi;
      const reversing = this.speed < -0.5 || (v < 1 && (c.brake || 0) > 0.1 && !((c.throttle || 0) > 0.1));
      if (reversing) turn = -turn;
    }
    if (this.isAirborne) turn *= this._hopAir ? T.hopTurn : T.airControl;
    const yawTarget = hasControl ? -turn : this.yawRate * 0.9;
    this.yawRate += (yawTarget - this.yawRate) * damp(T.yawResponse * this.stats.yawResponse, dt);
    const dYaw = this.yawRate * dt;

    // ---- decompose velocity in the old frame, rotate heading, apply grip
    this._decompose();
    this.heading += dYaw;
    let speed = this.speed;
    let slip = this.slip;
    const grounded = !this.isAirborne || this._hopAir;
    const follow = grounded ? (this.isDrifting ? 0.97 : T.gripFollow) : T.airControl * 0.5;
    slip += (1 - follow) * speed * Math.sin(dYaw);
    if (grounded) {
      if (this.isDrifting) {
        const target = -this.driftDirection * T.driftSlip * smooth01(v / 18);
        slip += (target - slip) * damp(T.driftSlipDecay, dt);
      } else {
        slip *= 1 - damp(T.slipDecay, dt);
      }
    }

    // ---- longitudinal
    let accel = 0;
    const throttle = canDrive ? throttleIn : 0;
    const brake = canDrive ? c.brake || 0 : 0;
    const onGround = !this.isAirborne;
    if (!hasControl) {
      accel = -Math.sign(speed) * Math.min(Math.abs(speed) / dt, T.spinDecel);
    } else if (onGround || this._hopAir) {
      if (throttle > 0.05 && !(brake > 0.05 && speed > 0.5)) {
        if (speed < -0.2) accel = T.brakeDecel;
        else if (speed < top) {
          const x = speed / top;
          const k = x < T.accelKnee ? 1 : Math.pow(Math.max(0, (1 - x) / (1 - T.accelKnee)), T.accelTaperExp);
          accel = throttle * this.stats.accel * k;
        }
      } else if (brake > 0.05) {
        if (speed > 0.3) accel = -T.brakeDecel * brake;
        else if (speed > -T.reverseMax) accel = -T.reverseAccel * brake;
      } else {
        const coast = T.coastDecel + T.coastDrag * Math.abs(speed);
        accel = -Math.sign(speed) * Math.min(Math.abs(speed) / dt, coast);
      }
      if (onGround && surface === SURFACES.OFFROAD && this.starTimer <= 0 && this.boostTimer <= 0) {
        accel -= Math.sign(speed) * Math.min(Math.abs(speed) / dt, T.offroadDrag);
      }
    }
    if (this.boostTimer > 0 && speed < top) accel = Math.max(accel, T.boostAccel * this.boostPower);
    if (this.starTimer > 0 && hasControl && speed < top) accel = Math.max(accel, this.stats.accel * 1.4);
    let newSpeed = speed + accel * dt;
    if (accel > 0 && speed <= top && newSpeed > top) newSpeed = top;
    if (newSpeed > top && speed > top - 0.01) {
      const rate = surface === SURFACES.OFFROAD && onGround ? T.overSpeedDecayOffroad : T.overSpeedDecay;
      newSpeed = top + (newSpeed - top) * Math.exp(-rate * dt) - 1.0 * dt;
      if (newSpeed < top) newSpeed = top;
    }
    // slopes
    if (onGround) newSpeed -= GRAVITY * this.forward.y * T.slopeGravity * dt;
    this._accelLong = (newSpeed - this._lastSpeed) / dt;
    this._lastSpeed = newSpeed;
    speed = newSpeed;
    this.speed = speed;
    this.slip = slip;
    this._recompose();

    // ---- drift charge
    if (this.isDrifting && onGround) {
      const rel = this.steerSmoothed * this.driftDirection;
      let rate = rel > 0.3 ? T.driftChargeIn : rel < -0.3 ? T.driftChargeOut : T.driftChargeNeutral;
      if (surface === SURFACES.OFFROAD && this.starTimer <= 0) rate *= T.driftChargeOffroad;
      this.driftCharge += rate * dt;
      let lvl = 0;
      for (let i = DRIFT_LEVELS.length - 1; i > 0; i--) {
        if (this.driftCharge >= DRIFT_LEVELS[i].chargeTime) {
          lvl = i;
          break;
        }
      }
      if (lvl > this.driftLevel) {
        this.driftLevel = lvl;
        this._emit(EVENTS.KART_DRIFT_LEVEL, { kart: this, level: lvl });
      }
    }

    // ---- integrate horizontal
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    // ---- query ground at the new position
    info = this._query(track);
    const surf = info.surface;
    const gY = info.groundHeight;
    const n = info.groundNormal;
    const ny = Math.max(0.2, n.y);
    const groundVy = -(n.x * this.velocity.x + n.z * this.velocity.z) / ny;

    // ---- vertical
    let landed = false;
    if (!this.isAirborne) {
      if (surf === SURFACES.VOID) {
        this.isAirborne = true;
        this._hopAir = false;
        this._rampAir = false;
        this.airTime = 0;
      } else {
        this._vy -= GRAVITY * dt;
        if (this._vy < groundVy) this._vy = groundVy;
        // ramp launch when leaving the ramp surface (lip) or separating while on it
        const leavingRamp = this._prevSurface === SURFACES.RAMP && surf !== SURFACES.RAMP && this.speed > 4;
        if (leavingRamp) {
          this._vy = Math.max(this._vy, this._rampArm || info.rampBoost || 9);
        }
        if (this._vy - groundVy > T.separationVel || leavingRamp) {
          this.isAirborne = true;
          this._hopAir = false;
          this._rampAir = leavingRamp || surf === SURFACES.RAMP;
          if (surf === SURFACES.RAMP) this._vy = Math.max(this._vy, info.rampBoost || 9);
          this.airTime = 0;
          this.position.y = Math.max(gY, this.position.y + this._vy * dt);
          if (this._rampAir && this._trickQueued) this._doTrick();
        } else {
          this.position.y = gY;
          if (surf !== SURFACES.RAMP) this._trickQueued = false;
        }
      }
    } else {
      this.airTime += dt;
      this._vy -= GRAVITY * dt;
      this.position.y += this._vy * dt;
      if (surf !== SURFACES.VOID && this.position.y <= gY) {
        landed = true;
      } else if (surf === SURFACES.VOID && this.position.y < gY - 1.2 && !this.isFalling) {
        this._startFall();
        this.velocity.y = this._vy;
        this._syncMesh();
        return;
      }
    }
    if (landed) this._land(gY, n, groundVy);
    if (surf === SURFACES.RAMP && !this.isAirborne) this._rampArm = info.rampBoost || this._rampArm;
    else if (!this.isAirborne) this._rampArm = 0;
    this.velocity.y = this.isAirborne ? this._vy : groundVy;

    // safety net
    if (this.position.y < gY - 30) {
      this._startFall();
      return;
    }

    // ---- barriers & obstacles
    this._collideWalls(info);
    if (track.obstacles && track.obstacles.length) this._collideObstacles(track.obstacles);

    // ---- surface effects
    if (!this.isAirborne) {
      if (surf === SURFACES.BOOST && (this._prevSurface !== SURFACES.BOOST || this.boostTimer < 0.35)) {
        this.applyBoost(1.0, 1, 'pad');
      }
      if ((surf === SURFACES.ROAD || surf === SURFACES.BOOST) && Math.abs(info.lateral) < info.halfWidth - 1.5) {
        this.lastSafeDistance = info.distance;
      }
    }
    if (surf !== this.surface) {
      const previous = this.surface;
      this.surface = surf;
      this._emit(EVENTS.KART_SURFACE, { kart: this, surface: surf, previous });
    }
    if (!this.isAirborne) this._prevSurface = surf;

    this._decompose();
    this._updateOrientation(dt, false);
    this._syncMesh();
  }

  _trackStartThrottle(throttleIn) {
    if (this._countdown === null) return;
    if (this._startPress === null && throttleIn > 0.5) {
      this._startPress = { count: this._countdown, time: this._countTime() };
    } else if (this._startPress && throttleIn < 0.5) {
      // released before GO: forgive and let the next press be judged on its own
      this._startPress = null;
    }
  }

  _doTrick() {
    this._trickQueued = false;
    this._trickPending = true;
    this._trickTimer = 0.55;
    this._vis.trickDir = Math.random() < 0.5 ? 1 : -1;
    this._vis.trickKind = (this._vis.trickKind + 1) % 2;
    this._emit(EVENTS.KART_TRICK, { kart: this });
  }

  _land(gY, n, groundVy) {
    const impact = Math.max(0, groundVy - this._vy);
    const air = this.airTime;
    this.position.y = gY;
    this._vy = groundVy;
    this.isAirborne = false;
    const wasHop = this._hopAir;
    this._hopAir = false;
    this._rampAir = false;
    this.airTime = 0;
    this._landImpact = impact;
    this._vis.squashV -= Math.min(6, impact * 0.55);
    this._vis.bobV -= Math.min(2.5, impact * 0.18);
    if (air > 0.12) this._emit(EVENTS.KART_LAND, { kart: this, impact });
    if (this._trickPending) {
      this._trickPending = false;
      this.applyBoost(0.75, 0.85, 'trick');
    }
    this._trickQueued = false;
    // drift start after a hop (or armed in the air)
    if (this.controls.drift && (this._driftArmed || wasHop) && !this.isDrifting && this.spinoutTimer <= 0) {
      const dir = Math.abs(this.controls.steer) > 0.25 ? Math.sign(this.controls.steer) : this._hopSteerDir;
      if (dir !== 0 && this.speed > T.driftMinSpeed) this._startDrift(dir);
      else this._driftWindow = 0.28;
    }
    this._hopSteerDir = 0;
  }

  _startFall() {
    if (this.isFalling) return;
    this._endDrift(false);
    this.isFalling = true;
    this.isAirborne = true;
    this._fallTimer = 1.2;
    this.boostTimer = 0;
    this._emit(EVENTS.KART_FALL, { kart: this });
  }

  _collideWalls(info) {
    const wo = info.wallOffset;
    if (wo === null || wo === undefined) return;
    const limit = wo - this.radius * 0.9;
    const lat = info.lateral;
    if (Math.abs(lat) <= limit) return;
    const side = Math.sign(lat);
    const pen = Math.abs(lat) - limit;
    // horizontal right vector
    _v1.set(info.right.x, 0, info.right.z);
    if (_v1.lengthSq() < 1e-6) return;
    _v1.normalize();
    this.position.x -= side * _v1.x * pen;
    this.position.z -= side * _v1.z * pen;
    // inward wall normal
    const nx = -side * _v1.x;
    const nz = -side * _v1.z;
    this._bounceOff(nx, nz, this.position.x - nx * this.radius, this.position.z - nz * this.radius, true);
  }

  _collideObstacles(obstacles) {
    for (let i = 0; i < obstacles.length; i++) {
      const o = obstacles[i];
      const dx = this.position.x - o.position.x;
      const dz = this.position.z - o.position.z;
      const rr = this.radius * 0.85 + o.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr || d2 < 1e-8) continue;
      if (o.height !== undefined && this.position.y > o.position.y + o.height) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d;
      const nz = dz / d;
      this.position.x += nx * (rr - d);
      this.position.z += nz * (rr - d);
      this._bounceOff(nx, nz, o.position.x + nx * o.radius, o.position.z + nz * o.radius, false);
    }
  }

  /** Reflect/scrub the velocity off a surface with horizontal normal (nx, nz). */
  _bounceOff(nx, nz, px, pz, alongWall) {
    const vx = this.velocity.x;
    const vz = this.velocity.z;
    const vn = vx * nx + vz * nz;
    if (vn >= 0) return;
    const impact = -vn;
    const sp = Math.hypot(vx, vz) || 1;
    const sinA = clamp(impact / sp, 0, 1);
    // tangential part keeps most of its speed on glancing hits
    let tx = vx - vn * nx;
    let tz = vz - vn * nz;
    const scrub = 1 - T.wallScrub * sinA;
    tx *= scrub;
    tz *= scrub;
    const bounce = T.wallBounce + 0.15 * sinA;
    // cap the rebound so head-on crashes knock the kart back a little instead of launching it in reverse
    const rebound = Math.min(impact * bounce, 3.5 + impact * 0.08);
    this.velocity.x = tx + nx * rebound;
    this.velocity.z = tz + nz * rebound;
    // deflect the heading along the wall on shallow hits so we don't grind
    if (alongWall && sinA < 0.75 && this.speed > 3) {
      const fx = Math.sin(this.heading);
      const fz = Math.cos(this.heading);
      const tl = Math.hypot(tx, tz);
      if (tl > 0.5) {
        const dx = tx / tl;
        const dz = tz / tl;
        const cross = fz * dx - fx * dz; // sign of rotation from f to d (around +Y)
        const dot = fx * dx + fz * dz;
        const ang = Math.atan2(cross, dot);
        this.heading += ang * (this.isDrifting ? 0.35 : 0.6);
      }
    }
    this._decompose();
    if (impact > 9 && this.isDrifting) this._endDrift(false);
    if (impact > 1.5 && this._wallCooldown <= 0) {
      this._wallCooldown = 0.25;
      this._vis.hitShake = Math.min(1, impact / 14);
      this._emit(EVENTS.KART_WALL_HIT, {
        kart: this,
        impact,
        point: new THREE.Vector3(px, this.position.y + 0.4, pz),
      });
    }
  }

  _updateOrientation(dt, snap) {
    const info = this.trackInfo;
    const target = !this.isAirborne && info && info.groundNormal ? info.groundNormal : WORLD_UP;
    if (snap) this.up.copy(target);
    else this.up.lerp(target, damp(this.isAirborne ? 2.5 : 14, dt));
    this.up.normalize();
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    _v2.set(fx, 0, fz);
    this.forward.copy(_v2).addScaledVector(this.up, -_v2.dot(this.up)).normalize();
    _left.crossVectors(this.up, this.forward).normalize();
    _m4.makeBasis(_left, this.up, this.forward);
    this.quaternion.setFromRotationMatrix(_m4);
  }

  _syncMesh() {
    this.mesh.position.copy(this.position);
    this.mesh.quaternion.copy(this.quaternion);
  }

  // ------------------------------------------------------------------ visuals

  _initVisualState() {
    this._vis = {
      time: 0,
      wheelAngle: 0,
      steerVis: 0,
      driftYaw: 0,
      pitch: new Spring(2.2, 0.35),
      roll: new Spring(2.0, 0.35),
      bob: 0,
      bobV: 0,
      squash: 0,
      squashV: 0,
      lean: 0,
      headYaw: 0,
      blink: 2 + Math.random() * 2,
      scale: 1,
      scaleV: 0,
      headScale: 1,
      spinAngle: 0,
      tumble: 0,
      trickDir: 1,
      trickKind: 0,
      hitShake: 0,
      boostKick: 0,
      shimmer: false,
      celebrate: 0,
      frustrate: 0,
      earLag: 0,
      tailWag: 0,
      flagLag: 0,
      prevYawRate: 0,
    };
  }

  _resetVisuals() {
    const v = this._vis;
    v.driftYaw = 0;
    v.pitch.reset();
    v.roll.reset();
    v.bob = v.bobV = v.squash = v.squashV = 0;
    v.scale = 1;
    v.scaleV = 0;
    v.spinAngle = v.tumble = 0;
    this.rig.visual.visible = true;
  }

  /** Per rendered frame: wheels, lean, squash, star rainbow, ghost flicker, poses. */
  updateVisuals(dt, time = 0) {
    const r = this.rig;
    const v = this._vis;
    v.time = time;
    dt = Math.min(dt, 0.05);

    // rocket-start tracking also works if physics isn't stepped during the countdown
    if (this.frozen) this._trackStartThrottle(this.controls.throttle || 0);

    // wheels
    v.wheelAngle += (this.speed / 0.3) * dt;
    const steerVis = (v.steerVis += (this.steerSmoothed - v.steerVis) * damp(14, dt));
    // drift body yaw (inward) with a little wobble
    const rel = this.isDrifting ? this.steerSmoothed * this.driftDirection : 0;
    const driftTarget = this.isDrifting ? -this.driftDirection * T.driftVisualAngle * (0.85 + 0.25 * rel) + Math.sin(time * 9) * 0.015 : 0;
    v.driftYaw += (driftTarget - v.driftYaw) * damp(this.isDrifting ? 9 : 7, dt);
    for (const w of r.wheels) {
      w.spin.rotation.x = v.wheelAngle * (0.3 / w.radius);
      if (w.front) {
        // counter-steer while drifting: wheels point along the travel direction
        w.steer.rotation.y = -steerVis * 0.42 - v.driftYaw * 0.8;
      }
    }
    if (r.steerWheel) r.steerWheel.rotation.z = steerVis * 1.5 + (this.isDrifting ? -this.driftDirection * 0.5 : 0);

    // suspension: pitch from longitudinal accel, roll from lateral accel
    const latAcc = this.isAirborne ? 0 : this.speed * this.yawRate;
    const pitchT = clamp(-this._accelLong * 0.0045, -0.07, 0.06) + (this.isAirborne ? clamp(-this.velocity.y * 0.012, -0.12, 0.12) : 0);
    const rollT = clamp(latAcc * 0.0065, -0.09, 0.09) + (this.isDrifting ? this.driftDirection * 0.05 : 0);
    let shake = 0;
    if (!this.isAirborne && Math.abs(this.speed) > 1) {
      const rough = this.surface === SURFACES.OFFROAD ? 0.022 : 0.004;
      shake = (Math.sin(time * 61.3 + this.index) + Math.sin(time * 37.1)) * rough * Math.min(1, Math.abs(this.speed) / 15);
    }
    if (this.frozen && this.rpm > 0.2) shake += Math.sin(time * 70) * 0.006 * this.rpm;
    if (this._stallTimer > 0) shake += Math.sin(time * 45) * 0.02;
    v.hitShake = Math.max(0, v.hitShake - dt * 3);
    if (v.boostKick > 0) {
      v.pitch.v -= 0.9 * v.boostKick;
      v.boostKick = 0;
    }
    const pitch = v.pitch.update(pitchT, dt);
    const roll = v.roll.update(rollT, dt);
    // vertical bob spring
    {
      const k = 260;
      const d = 14;
      v.bobV += (-k * v.bob - d * v.bobV) * dt;
      v.bob += v.bobV * dt;
      v.bob = clamp(v.bob, -0.12, 0.12);
    }
    r.bodyPivot.rotation.set(pitch + shake * 0.6, 0, roll + shake * 0.4 + Math.sin(time * 50) * v.hitShake * 0.05);
    r.bodyPivot.position.y = 0.25 + v.bob + shake * 0.3;

    // squash & stretch
    {
      const k = 300;
      const d = 16;
      v.squashV += (-k * v.squash - d * v.squashV) * dt;
      v.squash += v.squashV * dt;
      v.squash = clamp(v.squash, -0.35, 0.35);
    }
    // shrink / squish scale
    let scaleTarget = this.shrinkTimer > 0 ? 0.5 : 1;
    let squishY = 1;
    const spinProgress = this.spinoutTimer > 0 ? 1 - this.spinoutTimer / this._spinTotal : 1;
    if (this.spinoutTimer > 0 && this._spinCause === 'squish') squishY = lerp(0.25, 1, Math.pow(spinProgress, 3));
    {
      const k = 120;
      const d = 9;
      v.scaleV += (k * (scaleTarget - v.scale) - d * v.scaleV) * dt;
      v.scale += v.scaleV * dt;
    }
    const sq = v.squash;
    r.visual.scale.set(v.scale * (1 - sq * 0.5), v.scale * (1 + sq) * squishY, v.scale * (1 - sq * 0.5));
    const shrinkK = clamp((1 - v.scale) / 0.5, 0, 1);
    const headS = r.headBase * (1 + 0.28 * shrinkK);
    r.head.scale.setScalar(headS);

    // spin-out (two fast spins) / tumble (launch) / trick
    if (this.spinoutTimer > 0 && this._spinCause !== 'squish' && this._spinCause !== 'launch') {
      v.spinAngle = Math.PI * 4 * easeOutCubic(spinProgress) * (this.index % 2 ? 1 : -1);
    } else v.spinAngle *= 1 - damp(20, dt);
    if (this._launchTimer > 0) {
      const p = 1 - this._launchTimer / 1.6;
      v.tumble = -Math.PI * 2 * easeInOut(clamp(p / 0.8, 0, 1));
      v.spinAngle = Math.PI * 2 * easeOutCubic(p);
    } else v.tumble *= 1 - damp(20, dt);
    let trickRoll = 0;
    let trickPitch = 0;
    if (this._trickTimer > 0) {
      const p = easeInOut(1 - this._trickTimer / 0.55);
      if (v.trickKind === 0) trickRoll = Math.PI * 2 * p * v.trickDir;
      else trickPitch = -Math.PI * 2 * p;
    }
    r.visual.rotation.order = 'YXZ';
    r.visual.rotation.set(v.tumble + trickPitch, v.driftYaw + v.spinAngle, trickRoll);
    r.visual.position.y = this._launchTimer > 0 ? Math.sin(Math.PI * clamp(1 - this._launchTimer / 1.6, 0, 1)) * 0.4 : 0;

    // respawn dangle
    if (this.isRespawning) {
      r.visual.rotation.z += Math.sin(time * 5) * 0.12;
      r.visual.rotation.x += Math.sin(time * 3.7) * 0.06;
    }

    // ---- driver
    const celebrate = this.finished && this.racePosition <= 3;
    v.celebrate += ((celebrate ? 1 : 0) - v.celebrate) * damp(5, dt);
    v.frustrate += ((this._hitPose > 0 && !celebrate ? 1 : 0) - v.frustrate) * damp(8, dt);
    const lean = steerVis * 0.2 + (this.isDrifting ? this.driftDirection * 0.12 : 0);
    v.lean += (lean - v.lean) * damp(8, dt);
    r.driver.rotation.set(-0.05 * this.rpm + v.celebrate * Math.sin(time * 6) * 0.05, -v.driftYaw * 0.35, v.lean * (1 - v.celebrate));
    const headYawT = -steerVis * 0.5 + v.driftYaw * 0.4 + (this.controls.lookBack ? (this.index % 2 ? 1.6 : -1.6) : 0);
    v.headYaw += (headYawT - v.headYaw) * damp(10, dt);
    let headYaw = v.headYaw;
    let headTilt = -v.lean * 0.4;
    let headPitch = clamp(-this._accelLong * 0.004, -0.08, 0.08);
    if (v.frustrate > 0.01) {
      headYaw = lerp(headYaw, Math.sin(time * 22) * 0.35, v.frustrate);
      headPitch = lerp(headPitch, 0.18, v.frustrate);
    }
    if (v.celebrate > 0.01) {
      headTilt = lerp(headTilt, Math.sin(time * 5) * 0.2, v.celebrate);
      headPitch = lerp(headPitch, -0.15 + Math.sin(time * 10) * 0.08, v.celebrate);
    }
    r.head.rotation.set(headPitch, headYaw, headTilt);

    // arms: follow the wheel / celebrate / frustrated
    if (r.armL && r.armR) {
      const steerArm = steerVis * 0.25;
      const cel = v.celebrate;
      const fr = v.frustrate * (1 - cel);
      // the arm rests pointing forward/down to the wheel; -1.8 rad about X raises it straight up
      const wave = Math.sin(time * 9);
      const shake = Math.sin(time * 26) * 0.12;
      r.armL.rotation.set(
        lerp(lerp(-steerArm, -2.05 + shake, fr), -1.75 + wave * 0.2, cel),
        0,
        lerp(lerp(0, -0.8, fr), -0.6 - wave * 0.25, cel),
      );
      r.armR.rotation.set(
        lerp(lerp(steerArm, -2.05 - shake, fr), -1.75 - wave * 0.2, cel),
        0,
        lerp(lerp(0, 0.8, fr), 0.6 - wave * 0.25, cel),
      );
    }

    // blink
    v.blink -= dt;
    let eyeS = 1;
    if (v.blink < 0.13) eyeS = Math.max(0.08, Math.abs(v.blink - 0.065) / 0.065);
    if (v.blink < 0) v.blink = 1.8 + ((this.index * 1.37 + time) % 2.5);
    if (v.frustrate > 0.5) eyeS = Math.min(eyeS, 0.45);
    if (v.celebrate > 0.5) eyeS = Math.min(eyeS, 0.6 + Math.sin(time * 3) * 0.1);
    if (r.eyes) r.eyes.scale.y = eyeS;

    // secondary motion: ears, tail, antenna, flag
    const wind = clamp(Math.abs(this.speed) / 30, 0, 1.3);
    const yawAcc = (this.yawRate - v.prevYawRate) / Math.max(dt, 1e-3);
    v.prevYawRate = this.yawRate;
    v.earLag += (-(this.velocity.y || 0) * 0.02 - v.earLag) * damp(6, dt);
    if (r.earL) r.earL.rotation.x = -0.25 * wind + v.earLag + Math.sin(time * 13 + 1) * 0.03 * wind;
    if (r.earR) r.earR.rotation.x = -0.25 * wind + v.earLag + Math.sin(time * 12) * 0.03 * wind;
    v.tailWag += (clamp(this.yawRate * 0.35 + yawAcc * 0.01, -0.6, 0.6) - v.tailWag) * damp(5, dt);
    if (r.tail) {
      r.tail.rotation.y = v.tailWag + Math.sin(time * (3 + wind * 5)) * (0.08 + 0.05 * wind);
      r.tail.rotation.x = -0.15 * wind + v.earLag * 0.5;
    }
    if (r.antenna) {
      r.antenna.rotation.x = -0.3 * wind + Math.sin(time * 17) * 0.05 * wind - v.squash * 0.8;
      r.antenna.rotation.z = Math.sin(time * 9) * 0.06 + v.tailWag * 0.4;
    }
    if (r.flag) {
      r.flag.rotation.x = -0.35 * wind - v.squash * 0.6;
      r.flag.rotation.y = Math.sin(time * (6 + wind * 10)) * 0.25 + v.tailWag * 0.5;
    }

    // ---- star shimmer / ghost flicker
    const star = this.starTimer > 0;
    if (star) {
      const fade = this.starTimer < 1.2 ? 0.5 + 0.5 * Math.sin(time * 30) : 1;
      for (let i = 0; i < r.materials.length; i++) {
        const m = r.materials[i];
        if (!m.emissive) continue;
        _color.setHSL((time * 1.6 + i * 0.07) % 1, 1, 0.55);
        m.emissive.copy(_color);
        m.emissiveIntensity = (0.55 + 0.3 * Math.sin(time * 18 + i)) * fade;
      }
      v.shimmer = true;
    } else if (v.shimmer) {
      for (const m of r.materials) {
        if (!m.emissive) continue;
        if (m.userData.baseEmissive) m.emissive.copy(m.userData.baseEmissive);
        m.emissiveIntensity = m.userData.baseEmissiveIntensity;
      }
      v.shimmer = false;
    }
    const ghost = this.ghostTimer > 0 && !this.isFalling;
    r.visual.visible = ghost ? Math.floor(time * 16) % 2 === 0 || this.isRespawning : true;
  }

  dispose() {
    this.mesh.removeFromParent();
    disposeKartInstance(this.rig);
    this.bus = null;
  }
}
