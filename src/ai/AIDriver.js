import { EVENTS, ITEMS, MAX_COINS, SURFACES } from '../core/constants.js';
import { getRacingLine } from './RacingLine.js';

/**
 * AIDriver — writes `kart.controls` once per frame.
 *
 *  - follows a precomputed min-curvature racing line with speed-scaled
 *    look-ahead (pure pursuit) and a curvature/brake-aware speed profile
 *  - drifts through long corners for blue/orange mini-turbos
 *  - picks lateral offsets to overtake, dodge hazards/threats, hit boost
 *    pads and grab coin lines
 *  - uses items tactically (shields, aimed shells, mushrooms on straights...)
 *  - recovers when stuck (reverse + steer out, respawn as a last resort)
 *  - rubber-bands via `kart.speedScale` relative to the player (or the pack)
 *  - per-kart personality: aggression, line offset, reaction delay, mistakes
 */

const _s0 = {};
const _s1 = {};
const _s2 = {};

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}
function hashRng(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRE_FORWARD = new Set([ITEMS.GREEN_SHELL, ITEMS.RED_SHELL, ITEMS.BOMB]);

export class AIDriver {
  /**
   * @param {object} kart
   * @param {object} o
   * @param {object} o.track
   * @param {object} [o.itemSystem]
   * @param {number} [o.skill=0.9] 0..1
   * @param {object} [o.bus]
   * @param {object} [o.personality] { aggression, lineOffset, reaction, mistakeRate, driftChance, pace, patience }
   * @param {() => number} [o.rng]
   */
  constructor(kart, { track, itemSystem = null, skill = 0.9, bus = null, personality = null, rng = null } = {}) {
    this.kart = kart;
    this.track = track;
    this.itemSystem = itemSystem;
    this.skill = clamp(skill, 0, 1);
    this.bus = bus;
    this.rng = rng || hashRng((kart.index ?? 0) + 17 * Math.floor((track.length || 1000) % 997));
    this.personality = { ...this._makePersonality(), ...(personality || {}) };
    this.line = getRacingLine(track);

    this.time = 0;
    this.latShift = this.personality.lineOffset;
    this.steerOut = 0;
    this.prevAngle = 0;
    this.stuckTime = 0;
    this.recoverTime = 0;
    this.recoverCooldown = 0;
    this.recoverSteer = 0;
    this.stuckEpisodes = 0;
    this.stuckClock = 0;
    this.wrongWayTime = 0;
    this.drift = { active: false, corner: null, t: 0, dir: 0, failed: 0, cooldown: 0, skipCorner: null, plan: null, planFor: null, mode: null };
    // learned drift arc curvatures (1/m) for out / neutral / in steering
    this.driftModel = { kOut: 1 / 50, kNeutral: 1 / 22, kIn: 1 / 13 };
    this.item = { holding: false, holdTime: 0, decide: 0.5, lastUse: -10, releaseBrake: false, pressedType: null, nextShot: 0, hadType: null, typeTime: 0 };
    this.mistake = { t: 0, type: null, next: 12 + this.rng() * 25 };
    this.countdown = { count: null, t: 0, pressAt: 0.35, pressed: false };
    this.stats = { stuckEvents: 0, respawns: 0, itemsUsed: 0, drifts: 0, miniTurbos: 0 };
    // full-steer curvature per 6 m/s speed bucket (learned online from the kart's response)
    this._kmaxBuckets = new Float32Array(9);
    for (let i = 0; i < 9; i++) this._kmaxBuckets[i] = 1.7 / Math.max(5, i * 6);
    this._prevHeading = kart.heading || 0;
    this._lastSteer = 0;
    this._rampT = 0;
    this._tricked = false;
    this.debug = { targetX: 0, targetZ: 0, latTarget: 0, vt: 0, mode: 'race' };
    this._timers = [];
    this._unsub = [];
    if (bus) {
      this._unsub.push(bus.on(EVENTS.RACE_COUNTDOWN, (e) => this._onCountdown(e)));
      this._unsub.push(
        bus.on(EVENTS.KART_DRIFT_END, (e) => {
          if (e.kart === this.kart && e.level > 0) this.stats.miniTurbos++;
        }),
      );
    }
  }

  _makePersonality() {
    const r = this.rng;
    const s = this.skill;
    return {
      aggression: 0.35 + r() * 0.6,
      lineOffset: (r() - 0.5) * 1.6,
      reaction: (0.12 + r() * 0.3) * (1.35 - s * 0.6),
      mistakeRate: (0.4 + r() * 0.8) * (1 - s) * 1.6,
      driftChance: 0.7 + r() * 0.3,
      pace: (r() - 0.5) * 0.024,
      patience: 0.6 + r() * 0.9,
      cornerCommit: 0.96 + r() * 0.06,
    };
  }

  dispose() {
    for (const u of this._unsub) u();
    this._unsub.length = 0;
    for (const t of this._timers) clearTimeout(t);
    this._timers.length = 0;
  }

  // ------------------------------------------------------------ countdown

  _onCountdown({ count }) {
    const cd = this.countdown;
    cd.count = count;
    cd.t = 0;
    if (count === 2) {
      cd.pressed = false;
      // skilled drivers nail the rocket start; weaker ones are late (rarely early)
      const r = this.rng();
      if (r < 0.06 * (1 - this.skill)) cd.pressAt = -0.3; // too early -> stall
      else if (r < 0.25 + 0.65 * this.skill) cd.pressAt = 0.08 + this.rng() * 0.3;
      else cd.pressAt = 1.3 + this.rng() * 0.6; // after "1": no boost
      if (cd.pressAt < 0) {
        this.kart.controls.throttle = 1;
        cd.pressed = true;
      } else if (typeof setTimeout === 'function') {
        const id = setTimeout(() => {
          if (this.kart.frozen && cd.count !== null) {
            this.kart.controls.throttle = 1;
            cd.pressed = true;
          }
        }, cd.pressAt * 1000);
        this._timers.push(id);
      }
    } else if (count === 0) {
      cd.count = null;
    }
  }

  // ---------------------------------------------------------------- update

  update(dt, ctx = {}) {
    const k = this.kart;
    const c = k.controls;
    if (!c) return;
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    this.time += dt;
    c.itemPressed = false;
    c.lookBack = false;

    if (k.frozen) {
      const cd = this.countdown;
      cd.t += dt;
      if (cd.count === 2 && cd.t >= cd.pressAt) cd.pressed = true;
      if (cd.count === 1 && cd.pressAt > 1 && cd.t + 1 >= cd.pressAt) cd.pressed = true;
      c.throttle = cd.pressed ? 1 : 0;
      c.brake = 0;
      c.steer = 0;
      c.drift = false;
      c.item = false;
      return;
    }

    const karts = ctx.karts || this.itemSystem?.karts || [];
    const player = ctx.playerKart || null;
    const line = this.line;
    const info = k.trackInfo;
    if (!info) {
      c.throttle = 1;
      c.steer = 0;
      return;
    }
    const dist = info.distance;
    const speed = k.speed || 0;
    const absSpeed = Math.abs(speed);

    this._rubberBand(dt, karts, player);
    this._mistakes(dt);

    // ------------------------------------------------ lateral target
    let desired = this._chooseShift(dt, karts, dist, info);
    if (this._shiftPriority < 2) desired += this._driftShift(dist);
    const rate = (3.5 + 5 * this.skill) * dt;
    this.latShift += clamp(desired - this.latShift, -rate, rate);

    // ------------------------------------------------ look-ahead target
    const look = clamp(4 + absSpeed * (0.42 + 0.06 * (1 - this.skill)), 7, 22);
    const s = line.sample(dist + look, _s0);
    let lat = s.lat + this.latShift;
    if (this.mistake.type === 'wide') lat += this.mistake.side * 3.2;
    lat = clamp(lat, s.lo, s.hi);
    const tx = s.cx + s.rx * lat;
    const tz = s.cz + s.rz * lat;
    this.debug.targetX = tx;
    this.debug.targetZ = tz;
    this.debug.latTarget = lat;

    const fx = k.forward.x;
    const fz = k.forward.z;
    const rx = -fz;
    const rz = fx;
    const dx = tx - k.position.x;
    const dz = tz - k.position.z;
    const lx = dx * rx + dz * rz;
    const lz = dx * fx + dz * fz;
    const angle = Math.atan2(lx, lz); // + = target is to the right

    // wrong-way / big heading error
    const tdot = fx * info.tangent.x + fz * info.tangent.z;
    if (tdot < -0.2 && absSpeed > 1) this.wrongWayTime += dt;
    else this.wrongWayTime = Math.max(0, this.wrongWayTime - dt * 2);

    // ------------------------------------------------ steering (adaptive pure pursuit)
    this._learnSteering(dt, absSpeed);
    const v = Math.max(absSpeed, 4);
    const ld2 = Math.max(lx * lx + lz * lz, 4);
    const kappa = (2 * lx) / ld2; // desired path curvature, + = right
    let steer = kappa / this._kmax(v);
    if (lz < 0.5) steer = lx >= 0 ? 1 : -1; // target behind us: full lock
    if (speed < -0.5) steer = -steer; // reversing flips the yaw response
    if (this.mistake.type === 'wobble') steer += Math.sin(this.time * 11) * 0.6;
    steer = clamp(steer, -1, 1);

    // ------------------------------------------------ speed target
    let vt = this._targetSpeed(dist, absSpeed, k.isDrifting);
    if (this.mistake.type === 'late-brake') vt += 8;
    // badly misaligned (not right after a drift, where the nose is still swung): slow to turn
    if (Math.abs(angle) > 0.75 && !this.drift.active && this.time - (this.drift.releasedAt || -9) > 0.6) vt = Math.min(vt, 20);
    if (this.wrongWayTime > 0.6) vt = Math.min(vt, 12);
    this.debug.vt = vt;

    let throttle = 1;
    let brake = 0;
    if (speed > vt + 1.5) {
      throttle = 0;
      if (speed > vt + 4) brake = clamp((speed - vt - 4) / 6, 0.25, 1);
    }

    // ------------------------------------------------ drift
    let drift = this._driftLogic(dt, dist, absSpeed, angle, info, steer);
    let forceSteer = false;
    if (this.drift.active && !k.isDrifting && this.drift.t < 0.5) {
      // hop: just enough steer to pick the drift direction without over-rotating
      steer = this.drift.dir * 0.5;
      forceSteer = true;
    } else if (this.drift.active && this.drift.mode === 'wide' && k.isDrifting) {
      // sweeper: hold the widest drift arc; it carries us across to the apex
      steer = -this.drift.dir;
    } else if (this.drift.active && k.isDrifting) {
      // invert the learned drift map: curvature -> steer relative to the drift
      const dm = this.driftModel;
      const kr = kappa * this.drift.dir;
      let rel;
      if (kr >= dm.kNeutral) rel = (kr - dm.kNeutral) / Math.max(1e-4, dm.kIn - dm.kNeutral);
      else rel = (kr - dm.kNeutral) / Math.max(1e-4, dm.kNeutral - dm.kOut);
      steer = this.drift.dir * clamp(rel * 1.15, -1, 1);
    }

    // ------------------------------------------------ stuck / recover
    const recovering = this._recover(dt, throttle, absSpeed, angle, info);
    if (recovering) {
      throttle = 0;
      brake = 1;
      steer = this.recoverSteer;
      drift = false;
      this.drift.active = false;
    }

    // spun out: keep the gas on so we pull away immediately
    if (k.isSpunOut) {
      throttle = 1;
      brake = 0;
      drift = false;
      this.drift.active = false;
    }

    // smooth steering (lower skill = slightly laggier hands)
    const resp = (8 + 10 * this.skill) * dt;
    this.steerOut += clamp(steer - this.steerOut, -resp, resp);
    if (recovering || forceSteer) this.steerOut = steer;
    this._lastSteer = this.steerOut;

    // ramp trick: tap drift on the ramp (or just after leaving it) for a landing boost
    if (!drift && !recovering && !k.isSpunOut) {
      const onRamp = info.surface === SURFACES.RAMP || (k.isAirborne && this._rampT > 0);
      if (info.surface === SURFACES.RAMP) this._rampT = 0.3;
      else if (this._rampT > 0) this._rampT -= dt;
      if (onRamp && !this._tricked && absSpeed > 12) {
        this._tricked = true;
        if (this.rng() < 0.5 + 0.5 * this.skill) drift = true; // one-frame press
      } else if (!onRamp && !k.isAirborne) this._tricked = false;
    }

    c.throttle = throttle;
    c.brake = brake;
    c.steer = clamp(this.steerOut, -1, 1);
    c.drift = drift;

    // ------------------------------------------------ items
    if (this.itemSystem) this._items(dt, karts, dist, info);
    this.debug.mode = recovering ? 'recover' : this.drift.active ? 'drift' : 'race';
  }

  // ------------------------------------------------- steering calibration

  /** Curvature (1/m) the kart achieves at full steer for speed v (learned online). */
  _kmax(v) {
    const b = this._kmaxBuckets;
    const x = Math.min(b.length - 1.001, v / 6);
    const i = Math.floor(x);
    const t = x - i;
    return b[i] + (b[i + 1] - b[i]) * t;
  }

  /** Highest speed at which |curvature| `kap` is drivable with steering headroom. */
  _cornerSpeed(kap) {
    const use = 0.74 + 0.08 * this.skill;
    if (kap < 1e-4) return 80;
    let lo = 4;
    let hi = 60;
    if (this._kmax(hi) * use >= kap) return hi;
    for (let i = 0; i < 12; i++) {
      const mid = 0.5 * (lo + hi);
      if (this._kmax(mid) * use >= kap) lo = mid;
      else hi = mid;
    }
    return lo;
  }

  /** Speed target: min over the braking window of corner speed + braking distance. */
  _targetSpeed(dist, v, drifting) {
    const line = this.line;
    const decel = 15 + 3 * this.skill;
    const window = 8 + (v * v) / (2 * decel) + v * 0.25;
    const step = 2;
    let best = 80;
    const commit = this.personality.cornerCommit;
    for (let a = 0; a <= window; a += step) {
      const kap = Math.abs(line.sample(dist + a, _s1).curv);
      let vc = this._cornerSpeed(kap) * commit;
      if (drifting) vc *= 1.12;
      const allowed = Math.sqrt(vc * vc + 2 * decel * Math.max(0, a - 3));
      if (allowed < best) best = allowed;
    }
    return best;
  }

  _learnSteering(dt, v) {
    const k = this.kart;
    let dh = k.heading - this._prevHeading;
    this._prevHeading = k.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    const st = this._lastSteer || 0;
    if (k.isDrifting && dt > 0 && v > 12 && !k.isSpunOut && !k.isAirborne) {
      // learn the drift arc curvature range for out / neutral / in steering
      const kd = ((-dh / dt) * (k.driftDirection || 1)) / v;
      const rel = st * (k.driftDirection || 1);
      const dm = this.driftModel;
      if (kd > 0.002 && kd < 0.3) {
        if (rel < -0.6) dm.kOut += (kd - dm.kOut) * 0.02;
        else if (rel > 0.6) dm.kIn += (kd - dm.kIn) * 0.02;
        else if (Math.abs(rel) < 0.3) dm.kNeutral += (kd - dm.kNeutral) * 0.02;
      }
    }
    if (dt <= 0 || v < 6 || Math.abs(st) < 0.3 || k.isDrifting || k.isSpunOut || k.isAirborne || (k.speed || 0) < 0) return;
    const kObs = -dh / (dt * v);
    const est = kObs / st;
    if (!(est > 0.004 && est < 0.6)) return;
    const b = this._kmaxBuckets;
    const x = Math.min(b.length - 1.001, v / 6);
    const i = Math.floor(x);
    const t = x - i;
    const rate = 0.03 * Math.min(1, Math.abs(st));
    b[i] += (est - b[i]) * rate * (1 - t);
    b[i + 1] += (est - b[i + 1]) * rate * t;
  }

  // --------------------------------------------------------- rubber band

  _rubberBand(dt, karts, player) {
    const k = this.kart;
    let target = 0.955 + 0.045 * this.skill + this.personality.pace;
    if (k.finished) {
      target = 0.88;
    } else if (player && player !== k) {
      const gap = (player.raceDistance || 0) - (k.raceDistance || 0); // + = AI behind the player
      if (gap > 0) target *= 1 + 0.12 * (0.35 + 0.65 * this.skill) * smoothstep(12, 230, gap);
      else target *= 1 - 0.08 * smoothstep(25, 280, -gap) * (1.15 - 0.45 * this.skill);
    } else if (!player && karts.length > 1) {
      // attract mode: keep the pack together
      let sum = 0;
      let n = 0;
      for (const o of karts) {
        if (o.finished) continue;
        sum += o.raceDistance || 0;
        n++;
      }
      if (n > 1) {
        const gap = sum / n - (k.raceDistance || 0);
        if (gap > 0) target *= 1 + 0.06 * smoothstep(10, 200, gap);
        else target *= 1 - 0.04 * smoothstep(10, 200, -gap);
      }
    }
    if (k === player) target = 1;
    const cur = k.speedScale ?? 1;
    k.speedScale = cur + (target - cur) * Math.min(1, dt * 0.9);
  }

  // ------------------------------------------------------------ mistakes

  _mistakes(dt) {
    const m = this.mistake;
    if (m.type) {
      m.t -= dt;
      if (m.t <= 0) m.type = null;
      return;
    }
    m.next -= dt * this.personality.mistakeRate;
    if (m.next > 0) return;
    m.next = 14 + this.rng() * 30;
    const r = this.rng();
    if (r < 0.35) {
      m.type = 'wide';
      m.side = this.rng() < 0.5 ? -1 : 1;
      m.t = 0.8 + this.rng() * 0.8;
    } else if (r < 0.6) {
      m.type = 'late-brake';
      m.t = 1.0;
    } else if (r < 0.8) {
      m.type = 'wobble';
      m.t = 0.5;
    } else {
      m.type = 'no-drift';
      m.t = 5;
    }
  }

  // --------------------------------------------------------- lateral pick

  _chooseShift(dt, karts, dist, info) {
    const k = this.kart;
    const line = this.line;
    let shift = this.personality.lineOffset * (0.6 + 0.4 * Math.cos(this.time * 0.13 + k.index));
    let priority = 0;
    const speed = Math.abs(k.speed || 0);

    const plannedLat = (ahead) => line.sample(dist + ahead, _s2).lat + this.latShift;
    const bounds = (ahead) => {
      const s = line.sample(dist + ahead, _s2);
      return [s.lo, s.hi, s.lat];
    };
    const pickSide = (ahead, obstacleLat, clearance) => {
      const [lo, hi, base] = bounds(ahead);
      const cur = base + this.latShift;
      const left = obstacleLat - clearance;
      const right = obstacleLat + clearance;
      const canL = left >= lo;
      const canR = right <= hi;
      let tgt;
      if (canL && canR) tgt = Math.abs(left - cur) < Math.abs(right - cur) ? left : right;
      else if (canL) tgt = left;
      else if (canR) tgt = right;
      else tgt = Math.abs(lo - obstacleLat) > Math.abs(hi - obstacleLat) ? lo : hi;
      return tgt - base;
    };

    // 0) static obstacles (pillars, rocks) — line already avoids them, this
    //    catches the case where we are off the line (overtaking, after a hit)
    for (const ob of line.obstacles) {
      const g = line.gap(dist, ob.distance);
      if (g < -2 || g > 12 + speed * 0.9) continue;
      const need = ob.radius + 2.3;
      if (Math.abs(ob.lateral - plannedLat(Math.max(g, 0))) > need) continue;
      shift = pickSide(Math.max(g, 0), ob.lateral, need + 0.3);
      priority = 4;
      break;
    }

    // 1) hazards (bananas, bombs, sliding shells, trailing bananas)
    if (this.itemSystem && priority < 4) {
      const hz = this.itemSystem.getHazards();
      let bestAhead = Infinity;
      for (const h of hz) {
        if (h.owner === k && h.moving) continue;
        const rel = this._toTrack(h.position, dist, info);
        if (!rel) continue;
        const [ahead, hlat] = rel;
        if (ahead < 2 || ahead > 18 + speed * 1.1) continue;
        const need = h.radius + 1.7 + (h.type === ITEMS.BOMB ? 0.5 : 0);
        if (Math.abs(hlat - plannedLat(ahead)) > need) continue;
        if (ahead < bestAhead) {
          bestAhead = ahead;
          shift = pickSide(ahead, hlat, need + 0.4);
          priority = 3;
        }
      }
      // incoming shells straight at us: side-step
      const threats = this.itemSystem.getThreats(k);
      for (const t of threats) {
        if (t.homing || priority >= 3) continue;
        const rel = this._toTrack(t.position, dist, info);
        if (!rel) continue;
        const [, tlat] = rel;
        const myLat = info.lateral;
        const dodge = myLat >= tlat ? 3.5 : -3.5;
        const [lo, hi, base] = bounds(8);
        shift = clamp(myLat + dodge, lo, hi) - base;
        priority = 3;
      }
    }

    // 2) overtaking slower karts ahead
    if (priority < 2) {
      let best = null;
      let bestGap = Infinity;
      for (const o of karts) {
        if (o === k || !o.trackInfo) continue;
        const g = line.gap(dist, o.trackInfo.distance);
        if (g < 2.5 || g > 26) continue;
        const closing = speed - Math.abs(o.speed || 0);
        if (closing < 0.5 && g > 8) continue;
        const pl = plannedLat(g);
        if (Math.abs(o.trackInfo.lateral - pl) > 2.9) continue;
        if (g < bestGap) {
          bestGap = g;
          best = o;
        }
      }
      if (best) {
        shift = pickSide(bestGap, best.trackInfo.lateral, 3.4);
        priority = 2;
      }
    }

    // 3) boost pads & coin lines when cheap
    if (priority < 1) {
      for (const pad of line.boostPads) {
        const g = line.gap(dist, pad.distance);
        if (g < 4 || g > 50) continue;
        const pl = plannedLat(g);
        if (Math.abs(pad.lateral - pl) < 5.5) {
          shift = pad.lateral - line.sample(dist + g, _s2).lat;
          priority = 1;
          break;
        }
      }
    }
    if (priority < 1 && (k.coins || 0) < MAX_COINS) {
      for (const cg of line.coinGroups) {
        const g0 = line.gap(dist, cg.start);
        const g1 = line.gap(dist, cg.end);
        if (g1 < 0 || g0 > 40) continue;
        const pl = plannedLat(Math.max(g0, 2));
        if (Math.abs(cg.lateral - pl) < 3.6) {
          shift = cg.lateral - line.sample(dist + Math.max(g0, 2), _s2).lat;
          priority = 1;
          break;
        }
      }
    }
    this._shiftPriority = priority;
    return shift;
  }

  /** Converts a world point to [aheadDistance, lateral] along the track near the kart. */
  _toTrack(p, dist, info) {
    const dx = p.x - info.center.x;
    const dz = p.z - info.center.z;
    let ahead = dx * info.tangent.x + dz * info.tangent.z;
    // refine with the sample at the estimated distance (handles bends)
    for (let it = 0; it < 2; it++) {
      const s = this.line.sample(dist + ahead, _s2);
      const ex = p.x - s.cx;
      const ez = p.z - s.cz;
      const along = ex * s.tx + ez * s.tz;
      ahead += along;
      if (Math.abs(along) < 0.5) break;
    }
    if (ahead < -30 || ahead > 120) return null;
    const s = this.line.sample(dist + ahead, _s2);
    const lat = (p.x - s.cx) * s.rx + (p.z - s.cz) * s.rz;
    if (Math.abs(lat) > s.halfWidth + 8) return null;
    return [ahead, lat];
  }

  // ---------------------------------------------------------------- drift

  /**
   * Decides how (and whether) to drift a corner given the learned drift
   * turn-rate range: 'normal' when the corner needs about the drift's neutral
   * rate, 'wide' for sweepers wider than the drift's minimum rate (enter on the
   * outside and let the drift carry us across the road), null otherwise.
   */
  _planCorner(c, speed) {
    const d = this.drift;
    if (d.planFor === c && Math.abs(d.planSpeed - speed) < 4) return d.plan;
    d.planFor = c;
    d.planSpeed = speed;
    d.plan = null;
    if (c.length < 26 || speed < 15) return null;
    if (this.rng() > this.personality.driftChance * (0.55 + 0.45 * this.skill)) return null;
    const dm = this.driftModel;
    const kc = c.turn / c.length;
    if (kc >= dm.kOut * 1.05 && c.peak <= dm.kIn * 0.95) {
      if (c.length / speed > 0.9) d.plan = 'normal';
    } else if (kc < dm.kOut * 1.05 && kc >= dm.kOut * 0.3 && c.peak <= dm.kIn * 0.9) {
      const s = this.line.sample(c.startDist + c.length * 0.5, _s1);
      const width = Math.max(1, s.hi - s.lo);
      const dk = Math.max(1e-4, dm.kOut - kc);
      const cross = Math.sqrt((2 * width) / dk);
      const dur = Math.min(c.length + 15, cross) / speed;
      if (dur > 1.5) d.plan = 'wide';
    }
    return d.plan;
  }

  _driftLogic(dt, dist, speed, angle, info, steerCmd) {
    const d = this.drift;
    const k = this.kart;
    if (d.cooldown > 0) d.cooldown -= dt;
    if (k.isSpunOut) {
      d.active = false;
      return false;
    }
    const line = this.line;
    const hw = info.halfWidth || 10;
    // lateral velocity across the road (+ = right) for predictive edge checks
    const vlat = k.velocity ? k.velocity.x * info.right.x + k.velocity.z * info.right.z : 0;
    const latPred = info.lateral + vlat * 0.4;
    if (d.active) {
      d.t += dt;
      const c = d.corner;
      const toEnd = line.gap(dist, c.endDist);
      if (steerCmd * d.dir < -0.55) d.mis += dt;
      else d.mis = Math.max(0, d.mis - dt * 0.5);
      const innerOver = d.dir > 0 ? latPred - (hw - 0.8) : -(hw - 0.8) - latPred;
      const outerOver = d.dir > 0 ? -(hw - 0.6) - latPred : latPred - (hw - 0.6);
      let release = false;
      if (toEnd < 3 + speed * 0.1 && !(d.mode === 'wide' && toEnd > -12 && k.driftLevel < 1 && k.driftCharge > 0.5)) release = true;
      if (d.mode === 'normal' && d.mis > 0.45 && innerOver > -2.5) release = true;
      if (innerOver > 0) release = true;
      if (outerOver > 0 && vlat * d.dir < 0) release = true;
      if (speed < 9) release = true;
      if (Math.abs(angle) > (d.mode === 'wide' ? 1.3 : 0.9)) release = true;
      if (d.t > 0.8 && !k.isDrifting) {
        d.failed++;
        release = true;
      }
      if (release) {
        d.active = false;
        d.releasedAt = this.time;
        d.cooldown = 0.5;
        d.skipCorner = c;
        return false;
      }
      return true;
    }
    if (d.cooldown > 0 || speed < 15 || this.mistake.type === 'no-drift') return false;
    if (d.failed > 6) return false;
    if (k.isAirborne) return false;
    for (const c of line.corners) {
      if (c === d.skipCorner) continue;
      const toStart = line.gap(dist, c.startDist);
      const toEnd = line.gap(dist, c.endDist);
      if (toStart > 4 || toStart < -c.length * 0.5) continue;
      if (toEnd < 14 + speed * 0.3) continue;
      if (Math.abs(angle) > 0.4) continue;
      const plan = this._planCorner(c, speed);
      if (!plan) continue;
      if (plan === 'wide') {
        // only start from the outside half of the road
        const outerSide = -c.dir * info.lateral;
        if (outerSide < hw * 0.2) continue;
      }
      d.active = true;
      d.corner = c;
      d.dir = c.dir;
      d.mode = plan;
      d.t = 0;
      d.mis = 0;
      this.stats.drifts++;
      return true;
    }
    return false;
  }

  /** Swing wide before / during a planned drift so the drift arc lands on the apex. */
  _driftShift(dist) {
    const d = this.drift;
    const line = this.line;
    if (d.active) {
      const c = d.corner;
      if (d.mode === 'wide') {
        // hold the outside: the drift's minimum turn rate carries us across
        const s = line.sample(dist + 8, _s1);
        const outer = c.dir > 0 ? s.lo + 0.4 : s.hi - 0.4;
        return outer - s.lat;
      }
      const prog = clamp(line.gap(c.startDist, dist) / Math.max(1, c.length), 0, 1);
      return -d.dir * 2.2 * (1 - prog);
    }
    const speed = this.kart.speed || 0;
    if (this.mistake.type === 'no-drift' || speed < 14) return 0;
    for (const c of line.corners) {
      const toStart = line.gap(dist, c.startDist);
      if (toStart > 70 || toStart < -c.length * 0.5) continue;
      if (c === d.skipCorner) continue;
      const plan = this._planCorner(c, speed);
      if (!plan) continue;
      if (toStart < 0 && plan !== 'wide') continue;
      if (plan === 'wide') {
        const s = line.sample(dist + 8, _s1);
        const outer = c.dir > 0 ? s.lo + 0.4 : s.hi - 0.4;
        return (outer - s.lat) * smoothstep(70, 25, toStart);
      }
      return -c.dir * 2.2 * smoothstep(35, 8, toStart);
    }
    return 0;
  }

  // -------------------------------------------------------------- recover

  _recover(dt, throttle, speed, angle, info) {
    const k = this.kart;
    if (this.recoverCooldown > 0) this.recoverCooldown -= dt;
    if (this.recoverTime > 0) {
      this.recoverTime -= dt;
      return this.recoverTime > 0;
    }
    if (k.isSpunOut || k.isAirborne || k.frozen) {
      this.stuckTime = 0;
      return false;
    }
    if (throttle > 0 && speed < 2.2) this.stuckTime += dt;
    else this.stuckTime = Math.max(0, this.stuckTime - dt * 1.5);
    this.stuckClock = Math.max(0, this.stuckClock - dt * 0.15);
    if (this.stuckTime > 1.1 && this.recoverCooldown <= 0) {
      this.stats.stuckEvents++;
      this.stuckEpisodes++;
      this.stuckClock += 1;
      this.stuckTime = 0;
      this.recoverTime = 0.9 + this.rng() * 0.4;
      this.recoverCooldown = 1.4;
      // reversing flips the yaw response: steer away from where we want to go
      const want = angle !== 0 ? Math.sign(angle) : info.lateral > 0 ? -1 : 1;
      this.recoverSteer = -want;
      if (this.stuckClock > 3.5 && typeof k.respawn === 'function') {
        // repeatedly wedged: ask the kart to put us back on track
        k.respawn(this.track);
        this.stats.respawns++;
        this.stuckClock = 0;
        this.recoverTime = 0;
        return false;
      }
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- items

  _press(c, back = false) {
    c.itemPressed = true;
    c.item = true;
    if (back) c.brake = Math.max(c.brake, 1);
    this.item.lastUse = this.time;
    this.stats.itemsUsed++;
  }

  _items(dt, karts, dist, info) {
    const k = this.kart;
    const c = k.controls;
    const it = this.item;
    const st = this.itemSystem.getItemState(k);
    if (k.finished) {
      c.item = false;
      it.holding = false;
      return;
    }
    if (st.roulette || !st.type) {
      it.holding = false;
      it.hadType = null;
      c.item = false;
      return;
    }
    if (it.hadType !== st.type) {
      it.hadType = st.type;
      it.typeTime = 0;
      it.decide = this.personality.reaction + this.rng() * 0.4;
    }
    it.typeTime += dt;
    // keep holding a dragged item
    if (it.holding) {
      if (!st.holding && it.typeTime > 0.3) it.holding = false;
      c.item = true;
    } else c.item = false;

    it.decide -= dt;
    if (it.decide > 0) return;
    it.decide = 0.12 + this.personality.reaction * 0.5;
    if (k.isSpunOut) return;

    const type = st.type;
    const pos = k.racePosition || 1;
    const n = karts.length || 1;
    const speed = Math.abs(k.speed || 0);
    const aggr = this.personality.aggression;
    const threats = this.itemSystem.getThreats(k);
    const homingThreat = threats.some((t) => t.homing && t.target === k);
    const straight = this.line.maxCurv(dist, dist + 25 + speed * 1.6) < 1 / 110;
    const since = this.time - it.lastUse;

    const ahead = this._kartInCone(karts, 50, false);
    const behind = this._kartBehind(karts, 14);

    switch (type) {
      case ITEMS.MUSHROOM:
      case ITEMS.TRIPLE_MUSHROOM: {
        const gap = type === ITEMS.TRIPLE_MUSHROOM ? 0.9 : 0;
        if (since < gap) break;
        if ((straight && speed > 10 && !k.isBoosting) || (speed < 9 && it.typeTime > 1.5) || (pos === n && it.typeTime > 3)) {
          this._press(c);
          c.item = false;
        }
        break;
      }
      case ITEMS.GOLDEN_MUSHROOM: {
        if (since > 0.42 && speed > 6 && (st.golden > 0 || straight || it.typeTime > 2)) {
          this._press(c);
          c.item = false;
        }
        break;
      }
      case ITEMS.STAR: {
        if (pos > 2 || homingThreat || it.typeTime > 4 * this.personality.patience) {
          this._press(c);
          c.item = false;
        }
        break;
      }
      case ITEMS.LIGHTNING:
      case ITEMS.SPINY_SHELL: {
        if (it.typeTime > 0.8 + this.personality.patience) {
          this._press(c);
          c.item = false;
        }
        break;
      }
      case ITEMS.COIN: {
        if ((k.coins || 0) <= MAX_COINS - 2 || it.typeTime > 6) {
          this._press(c);
          c.item = false;
        }
        break;
      }
      case ITEMS.BANANA:
      case ITEMS.GREEN_SHELL:
      case ITEMS.RED_SHELL:
      case ITEMS.BOMB: {
        if (!st.holding && !it.holding) {
          // grab it and drag it behind as a shield first
          this._press(c);
          it.holding = true;
          it.holdTime = 0;
          break;
        }
        it.holdTime += dt + 0.12;
        let fire = false;
        let back = false;
        if (homingThreat && type !== ITEMS.BOMB) break; // keep the shield up
        if (type === ITEMS.GREEN_SHELL) {
          if (ahead && this.rng() < 0.35 + aggr * 0.6) fire = true;
          else if (behind && behind.dist < 9 && aggr > 0.55 && this.rng() < 0.3) {
            fire = true;
            back = true;
          } else if (it.holdTime > 22 * this.personality.patience) fire = true;
        } else if (type === ITEMS.RED_SHELL) {
          if (pos > 1) {
            const tgt = this._kartAheadByPosition(karts, pos - 1);
            const g = tgt && tgt.trackInfo ? this.line.gap(dist, tgt.trackInfo.distance) : 999;
            if ((g > 0 && g < 130) || it.holdTime > 6 * this.personality.patience) fire = true;
          } else if (behind && behind.dist < 10 && this.rng() < 0.25) {
            fire = true;
            back = true;
          }
        } else if (type === ITEMS.BANANA) {
          if (behind && behind.dist < 12 && behind.aligned) fire = true;
          else if (it.holdTime > 18 * this.personality.patience && this.line.maxCurv(dist, dist + 10) > 1 / 70) fire = true;
          else if (ahead && ahead.dist > 18 && ahead.dist < 30 && aggr > 0.75 && this.rng() < 0.15) {
            fire = true;
            back = true; // brake = lob forward
          }
        } else if (type === ITEMS.BOMB) {
          const cluster = this._kartInCone(karts, 38, true);
          if (cluster && cluster.dist > 12) fire = true;
          else if (behind && behind.dist < 10) {
            fire = true;
            back = true;
          } else if (it.holdTime > 12 * this.personality.patience) fire = true;
        }
        if (fire) {
          it.holding = false;
          c.item = false;
          if (back) c.brake = Math.max(c.brake, 1);
          this.stats.itemsUsed++;
          it.lastUse = this.time;
        }
        break;
      }
      case ITEMS.TRIPLE_GREEN_SHELL: {
        if (since > 0.6 && ahead && this.rng() < 0.3 + aggr * 0.6) this._press(c);
        else if (since > 0.6 && behind && behind.dist < 7 && this.rng() < aggr * 0.4) this._press(c, true);
        else if (it.typeTime > 30 * this.personality.patience && since > 1) this._press(c);
        c.item = c.itemPressed;
        break;
      }
      case ITEMS.TRIPLE_RED_SHELL: {
        if (homingThreat) break;
        if (pos > 1 && since > 1.3 + this.rng()) this._press(c);
        else if (pos === 1 && behind && behind.dist < 9 && since > 1) this._press(c, true);
        c.item = c.itemPressed;
        break;
      }
      case ITEMS.TRIPLE_BANANA: {
        if (since > 0.5 && behind && behind.dist < 13 && behind.aligned) this._press(c);
        else if (since > 7 * this.personality.patience && this.line.maxCurv(dist, dist + 10) > 1 / 70) this._press(c);
        c.item = c.itemPressed;
        break;
      }
      default:
        break;
    }
  }

  _kartAheadByPosition(karts, position) {
    for (const o of karts) if ((o.racePosition || 0) === position) return o;
    return null;
  }

  /** Nearest kart ahead inside a narrow forward cone (straight shot), or within `range` when `loose`. */
  _kartInCone(karts, range, loose) {
    const k = this.kart;
    const fx = k.forward.x;
    const fz = k.forward.z;
    let best = null;
    let bestD = Infinity;
    for (const o of karts) {
      if (o === k || o.finished) continue;
      const dx = o.position.x - k.position.x;
      const dz = o.position.z - k.position.z;
      const z = dx * fx + dz * fz;
      if (z < 4 || z > range) continue;
      const x = dx * -fz + dz * fx;
      const cone = loose ? 4 + z * 0.12 : 1.1 + z * 0.035;
      if (Math.abs(x) > cone) continue;
      if (Math.abs(o.position.y - k.position.y) > 3) continue;
      if (z < bestD) {
        bestD = z;
        best = o;
      }
    }
    if (!best) return null;
    if (!loose) {
      // the shot must not hit a wall first: require a fairly straight road
      const dist = k.trackInfo ? k.trackInfo.distance : 0;
      if (this.line.maxCurv(dist, dist + bestD) > 1 / 45) return null;
    }
    return { kart: best, dist: bestD };
  }

  _kartBehind(karts, range) {
    const k = this.kart;
    const fx = k.forward.x;
    const fz = k.forward.z;
    let best = null;
    let bestD = Infinity;
    let aligned = false;
    for (const o of karts) {
      if (o === k) continue;
      const dx = o.position.x - k.position.x;
      const dz = o.position.z - k.position.z;
      const z = -(dx * fx + dz * fz);
      if (z < 1.5 || z > range) continue;
      const x = dx * -fz + dz * fx;
      if (Math.abs(x) > 6) continue;
      if (z < bestD) {
        bestD = z;
        best = o;
        aligned = Math.abs(x) < 2.8;
      }
    }
    return best ? { kart: best, dist: bestD, aligned } : null;
  }
}
