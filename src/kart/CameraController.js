import * as THREE from 'three';
import { EVENTS, SURFACES } from '../core/constants.js';

/**
 * Chase / intro / finish / orbit camera for a target kart.
 *
 * Chase: the camera rides rigidly with the kart in XZ (no positional lag → no swimming), while the
 * yaw, slope pitch and height are critically damped so turns swing nicely and bumps/jumps are smooth.
 */

const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const damp = (rate, dt) => 1 - Math.exp(-rate * dt);
const wrapAngle = (a) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};
const easeInOut = (t) => {
  t = clamp(t, 0, 1);
  return t * t * t * (t * (t * 6 - 15) + 10);
};

/** Critically damped scalar smoother (Unity SmoothDamp). */
function smoothDamp(state, target, smoothTime, dt) {
  const omega = 2 / Math.max(1e-4, smoothTime);
  const x = omega * dt;
  const exp = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = state.x - target;
  const temp = (state.v + omega * change) * dt;
  state.v = (state.v - omega * temp) * exp;
  state.x = target + (change + temp) * exp;
  return state.x;
}

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _look = new THREE.Vector3();
const _frame = { position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), distance: 0 };

export class CameraController {
  /**
   * @param {THREE.PerspectiveCamera} camera
   * @param {{ bus?: import('../core/EventBus.js').EventBus }} opts
   */
  constructor(camera, { bus = null } = {}) {
    this.camera = camera;
    this.bus = bus;
    this.target = null;
    this.track = null;
    this.mode = 'chase';
    this.shakeEnabled = true;

    // tunables
    this.distance = 4.7;
    this.height = 1.9;
    this.lookHeight = 0.95;
    this.baseFov = 70;
    this.maxFov = 84;
    this.introDuration = 4.2;

    this.position = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3();
    this._yaw = { x: 0, v: 0 };
    this._slope = { x: 0, v: 0 };
    this._baseY = { x: 0, v: 0 };
    this._dist = { x: this.distance, v: 0 };
    this._lat = { x: 0, v: 0 };
    this._roll = { x: 0, v: 0 };
    this._fov = this.baseFov;
    this._lookBack = false;
    this._trauma = 0;
    this._traumaDecay = 1;
    this._shakeTime = 0;
    this._hint = undefined;
    this._query = null;
    this._introT = 0;
    this.introDone = true;
    this._intro = null;
    this._orbitAngle = 0;
    this._orbitPos = new THREE.Vector3();
    this._snapNext = true;
    this._blend = null;

    this._offs = [];
    if (bus) this._subscribe(bus);
  }

  _subscribe(bus) {
    const isT = (k) => k && k === this.target;
    const on = (ev, fn) => this._offs.push(bus.on(ev, fn));
    on(EVENTS.KART_WALL_HIT, (p) => isT(p.kart) && this.shake(clamp(p.impact / 22, 0.1, 0.6), 0.3));
    on(EVENTS.KART_SPINOUT, (p) => isT(p.kart) && this.shake(0.35, 0.45));
    on(EVENTS.KART_LAUNCHED, (p) => isT(p.kart) && this.shake(0.75, 0.7));
    on(EVENTS.KART_LAND, (p) => isT(p.kart) && p.impact > 5 && this.shake(clamp(p.impact / 26, 0.08, 0.45), 0.25));
    on(EVENTS.KART_BUMP, (p) => (isT(p.kartA) || isT(p.kartB)) && this.shake(clamp(p.impact / 18, 0.1, 0.45), 0.22));
    on(EVENTS.ITEM_HIT, (p) => isT(p.kart) && this.shake(0.4, 0.35));
    on(EVENTS.ITEM_LIGHTNING, () => this.shake(0.3, 0.35));
    on(EVENTS.KART_START_STALL, (p) => isT(p.kart) && this.shake(0.15, 0.4));
    on(EVENTS.KART_BOOST, (p) => {
      if (!isT(p.kart)) return;
      this._fov = Math.min(this.maxFov + 2, this._fov + 3 * (p.power || 1));
      if (p.source !== 'miniturbo' || p.duration > 1.2) this.shake(0.12, 0.2);
    });
    on(EVENTS.ITEM_EXPLOSION, (p) => {
      if (!this.target || !p.position) return;
      const d = p.position.distanceTo(this.target.position);
      if (d < 28) this.shake(0.85 * (1 - d / 28), 0.55);
    });
    on(EVENTS.UI_SETTINGS, (p) => {
      if (p && p.settings && 'cameraShake' in p.settings) this.shakeEnabled = !!p.settings.cameraShake;
    });
  }

  setTarget(kart) {
    const first = !this.target;
    this.target = kart;
    if (first) this._snapNext = true;
  }

  setTrack(track) {
    this.track = track;
    this._hint = undefined;
    this._query = null;
  }

  setMode(mode) {
    const prev = this.mode;
    this.mode = mode;
    if (prev !== mode && this.target) {
      // ease from the current shot into the new mode (snap() cancels this)
      this._blend = {
        t: 0,
        dur: prev === 'intro' && this.introDone ? 0.3 : 0.9,
        pos: this.camera.position.clone(),
        look: this.lookTarget.clone(),
        fov: this.camera.fov,
      };
    }
    if (mode === 'intro') {
      this._introT = 0;
      this.introDone = false;
      this._buildIntro();
    } else if (mode === 'finish' || mode === 'orbit') {
      if (this.target) {
        _v1.subVectors(this.camera.position, this.target.position);
        this._orbitAngle = Math.atan2(_v1.x, _v1.z);
      }
      this._orbitPos.copy(this.camera.position);
    } else if (mode === 'chase' && prev !== 'chase' && prev !== 'intro') {
      this._snapNext = true;
    }
  }

  /** Trauma-style shake. intensity 0..1, duration seconds. */
  shake(intensity = 0.3, duration = 0.3) {
    if (!this.shakeEnabled) return;
    this._trauma = clamp(Math.max(this._trauma, intensity), 0, 1);
    this._traumaDecay = Math.max(0.1, this._trauma / Math.max(0.05, duration));
  }

  /** Teleport to the desired pose of the current mode (no smoothing). */
  snap() {
    this._snapNext = true;
    this._blend = null;
    this.update(0);
  }

  // -------------------------------------------------------------------------------------------

  _groundAt(p) {
    const t = this.track;
    if (!t || !t.queryPosition) return null;
    try {
      const q = t.queryPosition(p, this._hint, this._query || undefined);
      if (q) {
        this._query = q;
        this._hint = q.index;
        // only trust the ground inside the drivable corridor (+ margin)
        const lim = (q.wallOffset ?? q.halfWidth + 1) + 3;
        if (Math.abs(q.lateral) < lim && q.surface !== SURFACES.VOID) return q.groundHeight;
      }
    } catch (e) {
      /* track not ready */
    }
    return null;
  }

  _chaseDesired(dt, snap) {
    const k = this.target;
    const speed = k.speed || 0;
    const absSpeed = Math.abs(speed);
    const boosting = k.boostTimer > 0;

    // yaw follows the kart's travel heading
    const yawTarget = k.heading;
    if (snap) {
      this._yaw.x = yawTarget;
      this._yaw.v = 0;
    } else {
      // unwrap target near current
      const t = this._yaw.x + wrapAngle(yawTarget - this._yaw.x);
      smoothDamp(this._yaw, t, k.isDrifting ? 0.2 : 0.13, dt);
    }
    const fy = k.forward ? clamp(k.forward.y, -0.6, 0.6) : 0;
    const groundY = k.position.y;
    if (snap) {
      this._slope.x = fy;
      this._baseY.x = groundY;
      this._slope.v = this._baseY.v = 0;
    } else {
      smoothDamp(this._slope, k.isAirborne ? this._slope.x * 0.98 : fy, 0.35, dt);
      smoothDamp(this._baseY, groundY, k.isAirborne ? 0.22 : 0.07, dt);
    }
    const distT = this.distance + clamp((absSpeed - 12) / 20, 0, 1) * 0.7 + (boosting ? 0.55 : 0);
    const latT = k.isDrifting ? k.driftDirection * 0.75 : 0;
    const rollT = k.isDrifting ? -k.driftDirection * 0.035 : 0;
    if (snap) {
      this._dist.x = distT;
      this._lat.x = latT;
      this._roll.x = rollT;
    } else {
      smoothDamp(this._dist, distT, 0.35, dt);
      smoothDamp(this._lat, latT, 0.45, dt);
      smoothDamp(this._roll, rollT, 0.35, dt);
    }

    const yaw = this._yaw.x;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    // left = up × forward = (fz, 0, -fx)
    const lx = fz;
    const lz = -fx;
    const dist = this._dist.x;
    const back = this._lookBack ? -1 : 1;
    const pos = this.position;
    pos.set(
      k.position.x - fx * dist * back + lx * this._lat.x,
      this._baseY.x + this.height - this._slope.x * dist * back * 0.9,
      k.position.z - fz * dist * back + lz * this._lat.x,
    );
    const ahead = (this._lookBack ? 6 : clamp(2.5 + absSpeed * 0.12, 2.5, 6.5)) * back;
    this.lookTarget.set(
      k.position.x + fx * ahead,
      this._baseY.x + this.lookHeight + this._slope.x * ahead * 0.6,
      k.position.z + fz * ahead,
    );
    // FOV with speed and boost
    const fovT = clamp(this.baseFov + clamp((absSpeed - 8) / 24, 0, 1) * 9 + (boosting ? 5 : 0), this.baseFov, this.maxFov);
    this._fov = snap ? fovT : this._fov + (fovT - this._fov) * damp(fovT > this._fov ? 4 : 2, dt);
    return this._roll.x;
  }

  _buildIntro() {
    const k = this.target;
    const t = this.track;
    if (!k || !t || !t.getFrameAtDistance) {
      this._intro = null;
      return;
    }
    const len = t.length || 1000;
    const d0 = (k.trackInfo && Number.isFinite(k.trackInfo.distance) ? k.trackInfo.distance : 0) % len;
    const at = (d, lat, h) => {
      const f = t.getFrameAtDistance((((d0 + d) % len) + len) % len, lat, _frame);
      return f.position.clone().addScaledVector(f.up, h);
    };
    const fx = Math.sin(k.heading);
    const fz = Math.cos(k.heading);
    const kp = k.position;
    const P = [
      at(170, 26, 42),
      at(110, -18, 26),
      at(55, 14, 13),
      at(16, -9, 5.5),
      new THREE.Vector3(kp.x + fx * 4 + fz * 6.5, kp.y + 2.4, kp.z + fz * 4 - fx * 6.5),
      new THREE.Vector3(kp.x - fx * 2 + fz * 5.5, kp.y + 2.3, kp.z - fz * 2 - fx * 5.5),
      new THREE.Vector3(kp.x - fx * this.distance, kp.y + this.height, kp.z - fz * this.distance),
    ];
    const L = [at(110, 0, 0), at(60, 0, 0), at(20, 0, 0), at(2, 0, 1), kp.clone().setY(kp.y + 0.8), kp.clone().setY(kp.y + 0.9), _v1.set(kp.x + fx * 3, kp.y + this.lookHeight, kp.z + fz * 3).clone()];
    this._intro = {
      pos: new THREE.CatmullRomCurve3(P, false, 'centripetal'),
      look: new THREE.CatmullRomCurve3(L, false, 'centripetal'),
    };
  }

  update(dt) {
    const cam = this.camera;
    const k = this.target;
    if (!k) return;
    const snap = this._snapNext;
    this._snapNext = false;
    dt = Math.min(dt, 0.1);
    let roll = 0;

    const lb = !!(k.controls && k.controls.lookBack) && this.mode === 'chase';
    let lbSnap = false;
    if (lb !== this._lookBack) {
      this._lookBack = lb;
      lbSnap = true;
    }

    if (this.mode === 'intro' && this._intro && !this.introDone) {
      this._introT += dt / this.introDuration;
      const u = easeInOut(this._introT);
      this._intro.pos.getPointAt(clamp(u, 0, 1), this.position);
      this._intro.look.getPointAt(clamp(u, 0, 1), this.lookTarget);
      this._fov = lerp(55, this.baseFov, u);
      if (this._introT >= 1) {
        this.introDone = true;
        this._snapNext = true;
      }
      // keep chase smoothing primed for a seamless hand-off
      this._chaseDesired(dt, true);
      this._intro.pos.getPointAt(clamp(u, 0, 1), this.position);
      this._intro.look.getPointAt(clamp(u, 0, 1), this.lookTarget);
      this._fov = lerp(55, this.baseFov, u);
    } else if (this.mode === 'finish' || this.mode === 'orbit') {
      const radius = this.mode === 'finish' ? 6.5 : 8.5;
      const h = this.mode === 'finish' ? 2.0 : 3.2;
      this._orbitAngle += dt * (this.mode === 'finish' ? 0.32 : 0.22);
      _v1.set(k.position.x + Math.sin(this._orbitAngle) * radius, k.position.y + h, k.position.z + Math.cos(this._orbitAngle) * radius);
      if (snap) this._orbitPos.copy(_v1);
      else this._orbitPos.lerp(_v1, damp(2.5, dt));
      this.position.copy(this._orbitPos);
      this.lookTarget.set(k.position.x, k.position.y + 0.8, k.position.z);
      this._fov += (62 - this._fov) * damp(2, dt);
    } else {
      roll = this._chaseDesired(dt, snap || lbSnap);
    }

    // blend between modes
    if (this._blend) {
      const b = this._blend;
      b.t += dt;
      const k = easeInOut(b.t / b.dur);
      this.position.lerpVectors(b.pos, this.position, k);
      this.lookTarget.lerpVectors(b.look, this.lookTarget, k);
      if (b.t >= b.dur) this._blend = null;
    }

    // never go under the road
    const g = this._groundAt(this.position);
    if (g !== null && this.position.y < g + 0.75) this.position.y = g + 0.75;

    cam.position.copy(this.position);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.lookTarget);
    if (roll) cam.rotateZ(roll);

    // shake
    if (this._trauma > 0 && this.shakeEnabled) {
      this._shakeTime += dt;
      const s = this._trauma * this._trauma;
      const t = this._shakeTime * 32;
      const nx = Math.sin(t * 1.13) + Math.sin(t * 2.71 + 1.3) * 0.5;
      const ny = Math.sin(t * 1.37 + 2.1) + Math.sin(t * 3.07) * 0.5;
      const nr = Math.sin(t * 0.91 + 0.7) + Math.sin(t * 2.33) * 0.4;
      cam.translateX(nx * 0.16 * s);
      cam.translateY(ny * 0.12 * s);
      cam.rotateZ(nr * 0.035 * s);
      cam.rotateX(ny * 0.012 * s);
      this._trauma = Math.max(0, this._trauma - this._traumaDecay * dt);
    }

    if (Math.abs(cam.fov - this._fov) > 0.01) {
      cam.fov = this._fov;
      cam.updateProjectionMatrix();
    }
  }

  dispose() {
    for (const off of this._offs) off();
    this._offs.length = 0;
    this.target = null;
    this.track = null;
  }
}
