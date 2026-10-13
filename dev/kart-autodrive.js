import { EVENTS, SURFACES, DRIFT_LEVELS } from '../src/core/constants.js';
import { KART_TUNING as KT } from '../src/kart/Kart.js';

/**
 * Scripted driver for physics verification: follows the centreline with speed-scaled look-ahead,
 * drifts through long corners (holding for mini-turbos), aims for boost pads, hits ramps with a
 * trick, and records telemetry from the bus.
 */
export class AutoDriver {
  constructor(kart, track, bus, { digital = false, drift = true, lateral = 0, name = 'auto' } = {}) {
    this.kart = kart;
    this.track = track;
    this.digital = digital;
    this.useDrift = drift;
    this.baseLateral = lateral;
    this.name = name;
    this.time = 0;
    this._driftHeld = false;
    this._driftDir = 0;
    this._driftHold = 0;
    this._trickArmed = false;
    this.tel = {
      topSpeed: 0,
      driftLevels: [0, 0, 0, 0],
      drifts: 0,
      boosts: {},
      wallHits: 0,
      maxWallImpact: 0,
      hops: 0,
      tricks: 0,
      lands: 0,
      maxAirtime: 0,
      airtime: 0,
      falls: 0,
      respawns: 0,
      offroadTime: 0,
      lapTimes: [],
      maxLateral: 0,
      timeTo70: null,
      timeToTop: null,
    };
    this._lapStart = 0;
    this._lastDist = null;
    this._curAir = 0;
    const t = this.tel;
    const mine = (p) => p.kart === kart;
    this._offs = [
      bus.on(EVENTS.KART_DRIFT_END, (p) => mine(p) && (t.driftLevels[p.level]++, t.drifts++)),
      bus.on(EVENTS.KART_BOOST, (p) => mine(p) && (t.boosts[p.source] = (t.boosts[p.source] || 0) + 1)),
      bus.on(EVENTS.KART_WALL_HIT, (p) => {
        if (!mine(p)) return;
        t.wallHits++;
        t.maxWallImpact = Math.max(t.maxWallImpact, p.impact);
      }),
      bus.on(EVENTS.KART_HOP, (p) => mine(p) && t.hops++),
      bus.on(EVENTS.KART_TRICK, (p) => mine(p) && t.tricks++),
      bus.on(EVENTS.KART_LAND, (p) => mine(p) && t.lands++),
      bus.on(EVENTS.KART_FALL, (p) => mine(p) && t.falls++),
      bus.on(EVENTS.KART_RESPAWN, (p) => mine(p) && t.respawns++),
    ];
  }

  _curvatureAhead(d0, span) {
    const tr = this.track;
    const N = tr.samples.length;
    const sp = tr.length / N;
    let sum = 0;
    let n = 0;
    for (let s = 0; s <= span; s += 2) {
      const i = Math.floor((((d0 + s) % tr.length) + tr.length) % tr.length / sp) % N;
      sum += tr.samples[i].curvature;
      n++;
    }
    return sum / n;
  }

  /** Writes kart.controls. Call once per physics step (or per frame). */
  update(dt) {
    const k = this.kart;
    const tr = this.track;
    const info = k.trackInfo;
    const c = k.controls;
    this.time += dt;
    const t = this.tel;
    const v = k.speed;
    t.topSpeed = Math.max(t.topSpeed, v);
    if (t.timeTo70 === null && v >= 0.7 * k.stats.topSpeed) t.timeTo70 = this.time;
    if (t.timeToTop === null && v >= 0.97 * k.stats.topSpeed) t.timeToTop = this.time;
    if (k.isAirborne && !k.isFalling) {
      this._curAir += dt;
      t.airtime += dt;
      t.maxAirtime = Math.max(t.maxAirtime, this._curAir);
    } else this._curAir = 0;
    if (!k.isAirborne && k.surface === SURFACES.OFFROAD) t.offroadTime += dt;
    t.maxLateral = Math.max(t.maxLateral, Math.abs(info.lateral || 0));

    // laps
    const d = info.distance || 0;
    if (this._lastDist !== null && this._lastDist > tr.length * 0.8 && d < tr.length * 0.2) {
      t.lapTimes.push(+(this.time - this._lapStart).toFixed(2));
      this._lapStart = this.time;
    }
    this._lastDist = d;

    // target lateral: simple racing line (outside before a corner, inside while drifting through it)
    let lat = this.baseLateral;
    const cFar = this._curvatureAhead(d + 20, 40);
    if (this._driftHeld && k.isDrifting) lat = this._driftDir * 1.5;
    else if (Math.abs(cFar) > 1 / 160) lat = -Math.sign(cFar) * 7;
    for (const pad of tr.boostPads || []) {
      const ahead = (((pad.distance - d) % tr.length) + tr.length) % tr.length;
      if (ahead < 70) {
        const f = tr.queryPosition(pad.position, undefined);
        lat = f.lateral;
      }
    }
    let nearRamp = false;
    for (const r of tr.ramps || []) {
      const ahead = (((r.distance - d) % tr.length) + tr.length) % tr.length;
      if (ahead < 60 || (ahead > tr.length - 10)) {
        lat = 0;
        nearRamp = true;
      }
    }

    // dodge static obstacles in the driving line
    for (const o of tr.obstacles || []) {
      const r = tr.queryPosition(o.position, undefined);
      const ahead = (((r.distance - d) % tr.length) + tr.length) % tr.length;
      if (ahead < 45 && Math.abs(r.lateral - lat) < o.radius + 2.5) lat = r.lateral + Math.sign(lat - r.lateral || 1) * (o.radius + 3.5);
    }

    // look-ahead steering
    const look = 7 + Math.abs(v) * 0.42;
    const f = tr.getFrameAtDistance(d + look, lat);
    const dx = f.position.x - k.position.x;
    const dz = f.position.z - k.position.z;
    const fx = Math.sin(k.heading);
    const fz = Math.cos(k.heading);
    const cross = fz * dx - fx * dz; // + = target to the left (yaw increase)
    const dot = fx * dx + fz * dz;
    const ang = Math.atan2(cross, dot);
    // pure pursuit: curvature needed to reach the look-ahead point (+ = right turn)
    const Ld = Math.max(4, Math.hypot(dx, dz));
    const kappa = (-2 * Math.sin(ang)) / Ld;
    const vAbs = Math.max(6, Math.abs(v));
    const hi = 1 + (KT.turnRateTop - 1) * Math.min(1, Math.max(0, (vAbs - 12) / Math.max(1, k.stats.topSpeed - 12)));
    const wMax = KT.turnRate * k.stats.handling * hi;
    let steer = Math.max(-1, Math.min(1, (kappa * vAbs) / wMax));
    const curv = this._curvatureAhead(d + 4, 30);

    // drift on sustained corners
    let drift = false;
    if (this.useDrift && !k.isSpunOut) {
      const need = Math.abs(curv) > 1 / 70 && v > 16 && !nearRamp;
      if (!this._driftHeld && need) {
        this._driftHeld = true;
        this._driftDir = Math.sign(curv);
        this._driftHold = 0;
      }
      if (this._driftHeld) {
        this._driftHold += dt;
        const keep = Math.abs(curv) > 1 / 140 && Math.sign(curv) === this._driftDir;
        // bail out when the drift has carried us too far to the inside of the line
        const inside = ((info.lateral || 0) - lat) * this._driftDir;
        if ((!keep && this._driftHold > 0.6) || this._driftHold > 9 || (k.isDrifting === false && this._driftHold > 0.8) || inside > 4) {
          this._driftHeld = false;
        }
      }
      drift = this._driftHeld;
      if (drift) {
        if (!k.isDrifting) steer = this._driftDir * 0.45;
        else {
          // map desired curvature onto the drift arcs: in (tight) .. neutral .. out (wide)
          const kd = kappa * this._driftDir;
          const kN = 1 / KT.driftRadiusNeutral;
          const kIn = 1 / KT.driftRadiusIn;
          const kOut = 1 / KT.driftRadiusOut;
          const rel = kd >= kN ? (kd - kN) / (kIn - kN) : -(kN - kd) / (kN - kOut);
          steer = this._driftDir * Math.max(-1, Math.min(1, rel));
        }
      }
    }
    // trick at the ramp lip
    if (k.surface === SURFACES.RAMP && !k.isAirborne) this._trickArmed = true;
    if (this._trickArmed && k.isAirborne) {
      drift = true;
      this._trickArmed = false;
      this._trickFrame = 2;
    }
    if (this._trickFrame > 0) {
      this._trickFrame--;
      drift = this._trickFrame === 1 ? false : true;
    }

    // brake for very sharp turns when not drifting
    let throttle = 1;
    let brake = 0;
    if (!drift && Math.abs(curv) > 1 / 22 && v > 20) {
      throttle = 0;
      brake = 0.6;
    }
    if (this.digital) steer = Math.abs(steer) < 0.25 ? 0 : Math.sign(steer);
    c.throttle = throttle;
    c.brake = brake;
    c.steer = steer;
    c.drift = drift;
    c.item = false;
    c.itemPressed = false;
  }

  report() {
    const t = this.tel;
    return {
      name: this.name,
      top: +t.topSpeed.toFixed(2),
      t70: t.timeTo70 && +t.timeTo70.toFixed(2),
      tTop: t.timeToTop && +t.timeToTop.toFixed(2),
      laps: t.lapTimes,
      drifts: t.drifts,
      levels: t.driftLevels.map((n, i) => `${DRIFT_LEVELS[i].name}:${n}`).join(' '),
      boosts: t.boosts,
      walls: t.wallHits,
      maxWall: +t.maxWallImpact.toFixed(1),
      hops: t.hops,
      tricks: t.tricks,
      maxAir: +t.maxAirtime.toFixed(2),
      air: +t.airtime.toFixed(2),
      offroad: +t.offroadTime.toFixed(2),
      falls: t.falls,
      respawns: t.respawns,
      maxLat: +t.maxLateral.toFixed(1),
    };
  }

  dispose() {
    for (const off of this._offs) off();
  }
}
