/**
 * Racing line + target-speed profile precomputed from `track.samples`.
 * Shared by every AIDriver on the same track (cached per Track object).
 *
 * The line is a minimum-curvature "elastic band" solution: each point is
 * repeatedly pulled toward the midpoint of its neighbours (at decreasing
 * scales) while being clamped inside the road (with a safety margin that is
 * larger next to void edges) and pushed away from static obstacles. This
 * naturally produces outside-inside-outside corner lines that clip apexes.
 */

const cache = new WeakMap();

/** Conservative defaults; AIDriver may rescale speeds per kart. */
export const LINE_DEFAULTS = {
  wallMargin: 2.35, // kart centre stays >= this far inside the road edge (kart half-width 0.8 + 1.5 m)
  voidMargin: 3.6, // ...and further from edges without barriers
  lateralAccel: 26, // m/s^2 cornering budget used for the speed profile
  brakeDecel: 20, // m/s^2 used for the braking look-ahead
  maxProfileSpeed: 80,
};

export function getRacingLine(track, opts) {
  let line = cache.get(track);
  if (!line) {
    line = new RacingLine(track, opts);
    cache.set(track, line);
  }
  return line;
}

function wrapIndex(i, n) {
  return ((i % n) + n) % n;
}

export class RacingLine {
  constructor(track, opts = {}) {
    const o = { ...LINE_DEFAULTS, ...opts };
    this.opts = o;
    this.track = track;
    const S = track.samples;
    const n = S.length;
    this.n = n;
    this.length = track.length || (S[n - 1].distance + (S[1].distance - S[0].distance));
    this.spacing = this.length / n;

    this.cx = new Float32Array(n);
    this.cy = new Float32Array(n);
    this.cz = new Float32Array(n);
    this.rx = new Float32Array(n);
    this.rz = new Float32Array(n);
    this.tx = new Float32Array(n);
    this.tz = new Float32Array(n);
    this.hw = new Float32Array(n);
    this.voidEdge = new Uint8Array(n);
    this.lo = new Float32Array(n);
    this.hi = new Float32Array(n);
    this.lat = new Float32Array(n);
    this.px = new Float32Array(n);
    this.pz = new Float32Array(n);
    this.curv = new Float32Array(n);
    this.trackCurv = new Float32Array(n);
    this.vmax = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const s = S[i];
      this.cx[i] = s.position.x;
      this.cy[i] = s.position.y;
      this.cz[i] = s.position.z;
      let rx = s.right.x;
      let rz = s.right.z;
      const rl = Math.hypot(rx, rz) || 1;
      rx /= rl;
      rz /= rl;
      this.rx[i] = rx;
      this.rz[i] = rz;
      this.tx[i] = s.tangent.x;
      this.tz[i] = s.tangent.z;
      this.hw[i] = s.halfWidth;
      const isVoid = s.wallOffset === null || s.wallOffset === undefined;
      this.voidEdge[i] = isVoid ? 1 : 0;
      this.trackCurv[i] = s.curvature || 0;
    }
    // void margins spread a few metres along the track so the line eases away early
    const voidNear = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (!this.voidEdge[i]) continue;
      for (let k = -12; k <= 12; k++) voidNear[wrapIndex(i + k, n)] = 1;
    }
    for (let i = 0; i < n; i++) {
      const margin = voidNear[i] ? o.voidMargin : o.wallMargin;
      // walls closer than the road edge (narrow sections) also bound us
      let w = this.hw[i];
      const wo = S[i].wallOffset;
      if (wo !== null && wo !== undefined) w = Math.min(w, wo - 0.2);
      const lim = Math.max(0.8, w - margin);
      this.lo[i] = -lim;
      this.hi[i] = lim;
    }

    this._prepareObstacles(track);
    this._solve();
    this._computeCurvature();
    this._computeSpeeds(o.lateralAccel, o.brakeDecel);
    this._findCorners();
    this._collectFeatures(track);
  }

  _prepareObstacles(track) {
    this.obstacles = [];
    const obs = track.obstacles || [];
    for (const ob of obs) {
      let q;
      try {
        q = track.queryPosition(ob.position);
      } catch {
        continue;
      }
      if (!q) continue;
      const i = q.index;
      if (Math.abs(q.lateral) > this.hw[i] + 4) continue;
      this.obstacles.push({ index: i, lateral: q.lateral, radius: ob.radius, distance: q.distance });
    }
  }

  _applyObstacles(i) {
    const n = this.n;
    for (const ob of this.obstacles) {
      let di = i - ob.index;
      if (di > n / 2) di -= n;
      if (di < -n / 2) di += n;
      const span = (ob.radius + 7) / this.spacing;
      if (Math.abs(di) > span) continue;
      const fall = 1 - Math.abs(di) / span; // 1 at the obstacle, 0 at the ends
      const clear = (ob.radius + 3.0) * (0.35 + 0.65 * Math.sqrt(fall));
      const d = this.lat[i] - ob.lateral;
      if (Math.abs(d) < clear) {
        const left = ob.lateral - clear;
        const right = ob.lateral + clear;
        const canL = left >= this.lo[i];
        const canR = right <= this.hi[i];
        if (canL && (!canR || d < 0)) this.lat[i] = left;
        else if (canR) this.lat[i] = right;
      }
    }
  }

  _solve() {
    const n = this.n;
    const { cx, cz, rx, rz, lat, lo, hi } = this;
    const sp = this.spacing;
    const passes = [
      [Math.round(45 / sp), 50],
      [Math.round(24 / sp), 70],
      [Math.round(12 / sp), 90],
      [Math.round(6 / sp), 90],
      [Math.round(3 / sp), 60],
    ];
    for (const [kRaw, iters] of passes) {
      const k = Math.max(1, kRaw);
      for (let it = 0; it < iters; it++) {
        for (let i = 0; i < n; i++) {
          const a = wrapIndex(i - k, n);
          const b = wrapIndex(i + k, n);
          const mx = 0.5 * (cx[a] + rx[a] * lat[a] + cx[b] + rx[b] * lat[b]);
          const mz = 0.5 * (cz[a] + rz[a] * lat[a] + cz[b] + rz[b] * lat[b]);
          const t = (mx - cx[i]) * rx[i] + (mz - cz[i]) * rz[i];
          let v = lat[i] + (t - lat[i]) * 0.65;
          if (v < lo[i]) v = lo[i];
          if (v > hi[i]) v = hi[i];
          lat[i] = v;
          if (this.obstacles.length) this._applyObstacles(i);
        }
      }
    }
    // light smoothing so the line has no kinks from clamping
    const tmp = new Float32Array(n);
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < n; i++) {
        let s = 0;
        for (let k = -2; k <= 2; k++) s += lat[wrapIndex(i + k, n)];
        tmp[i] = Math.min(hi[i], Math.max(lo[i], s / 5));
      }
      lat.set(tmp);
      if (this.obstacles.length) for (let i = 0; i < n; i++) this._applyObstacles(i);
    }
    for (let i = 0; i < n; i++) {
      this.px[i] = cx[i] + rx[i] * lat[i];
      this.pz[i] = cz[i] + rz[i] * lat[i];
    }
  }

  _computeCurvature() {
    const n = this.n;
    const k = Math.max(2, Math.round(5 / this.spacing));
    const raw = new Float32Array(n);
    const { px, pz } = this;
    for (let i = 0; i < n; i++) {
      const a = wrapIndex(i - k, n);
      const c = wrapIndex(i + k, n);
      const abx = px[i] - px[a];
      const abz = pz[i] - pz[a];
      const bcx = px[c] - px[i];
      const bcz = pz[c] - pz[i];
      const acx = px[c] - px[a];
      const acz = pz[c] - pz[a];
      const cross = abx * acz - abz * acx; // + = turning right (see ARCHITECTURE conventions)
      const den = Math.hypot(abx, abz) * Math.hypot(bcx, bcz) * Math.hypot(acx, acz);
      raw[i] = den > 1e-6 ? (2 * cross) / den : 0;
    }
    // smooth
    const w = Math.max(1, Math.round(4 / this.spacing));
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = -w; j <= w; j++) s += raw[wrapIndex(i + j, n)];
      this.curv[i] = s / (2 * w + 1);
    }
  }

  _computeSpeeds(aLat, decel) {
    const n = this.n;
    const v = this.vmax;
    const cap = this.opts.maxProfileSpeed;
    for (let i = 0; i < n; i++) {
      const k = Math.abs(this.curv[i]);
      v[i] = k > 1e-5 ? Math.min(cap, Math.sqrt(aLat / k)) : cap;
    }
    // braking look-back (two passes around the loop for wrap-around)
    const ds = this.spacing;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = n - 1; i >= 0; i--) {
        const next = v[(i + 1) % n];
        const lim = Math.sqrt(next * next + 2 * decel * ds);
        if (v[i] > lim) v[i] = lim;
      }
    }
  }

  _findCorners() {
    const n = this.n;
    const thr = 1 / 60;
    const corners = [];
    let i0 = -1;
    // start scanning at a straight-ish sample so runs don't wrap mid-corner
    let start = 0;
    for (let i = 0; i < n; i++) {
      if (Math.abs(this.curv[i]) < thr * 0.5) {
        start = i;
        break;
      }
    }
    let dir = 0;
    for (let s = 0; s <= n; s++) {
      const i = (start + s) % n;
      const c = this.curv[i];
      const inCorner = Math.abs(c) > thr && s < n;
      const d = Math.sign(c);
      if (inCorner && i0 < 0) {
        i0 = s;
        dir = d;
      } else if (i0 >= 0 && (!inCorner || d !== dir)) {
        const len = (s - i0) * this.spacing;
        let turn = 0;
        for (let t = i0; t < s; t++) turn += this.curv[(start + t) % n] * this.spacing;
        corners.push({ s0: i0, s1: s, dir, len, turn: Math.abs(turn) });
        i0 = inCorner ? s : -1;
        dir = d;
      }
    }
    // merge same-direction corners separated by short gaps
    const merged = [];
    for (const c of corners) {
      const last = merged[merged.length - 1];
      if (last && last.dir === c.dir && (c.s0 - last.s1) * this.spacing < 10) {
        last.s1 = c.s1;
        last.len += c.len;
        last.turn += c.turn;
      } else merged.push({ ...c });
    }
    this.corners = merged
      .filter((c) => c.len >= 20 && c.turn >= 0.55)
      .map((c) => {
        const startIdx = (start + c.s0) % n;
        const endIdx = (start + c.s1) % n;
        let peak = 0;
        for (let t = c.s0; t < c.s1; t++) peak = Math.max(peak, Math.abs(this.curv[(start + t) % n]));
        return {
          startDist: startIdx * this.spacing,
          endDist: endIdx * this.spacing,
          length: c.len,
          dir: c.dir, // +1 right, -1 left
          turn: c.turn,
          peak,
        };
      });
  }

  _collectFeatures(track) {
    this.boostPads = [];
    for (const pad of track.boostPads || []) {
      let q;
      try {
        q = track.queryPosition(pad.position);
      } catch {
        continue;
      }
      this.boostPads.push({ distance: q.distance, lateral: q.lateral, width: pad.width || 4, length: pad.length || 6 });
    }
    // coin groups: cluster by track distance
    const coins = [];
    for (const p of track.coinPositions || []) {
      let q;
      try {
        q = track.queryPosition(p);
      } catch {
        continue;
      }
      coins.push({ distance: q.distance, lateral: q.lateral });
    }
    coins.sort((a, b) => a.distance - b.distance);
    this.coinGroups = [];
    for (const c of coins) {
      const g = this.coinGroups[this.coinGroups.length - 1];
      if (g && c.distance - g.end < 6 && Math.abs(c.lateral - g.lateral) < 3) {
        g.end = c.distance;
        g.lateral = (g.lateral * g.count + c.lateral) / (g.count + 1);
        g.count++;
      } else this.coinGroups.push({ start: c.distance, end: c.distance, lateral: c.lateral, count: 1 });
    }
    this.ramps = (track.ramps || []).map((r) => ({ distance: r.distance }));
  }

  // ------------------------------------------------------------- queries

  wrap(d) {
    const L = this.length;
    return ((d % L) + L) % L;
  }

  /** Signed forward gap from distance a to b in (-L/2, L/2]. */
  gap(a, b) {
    const L = this.length;
    let g = (b - a) % L;
    if (g > L / 2) g -= L;
    if (g <= -L / 2) g += L;
    return g;
  }

  /**
   * Interpolated line data at track distance `d` into `out`:
   * { cx, cy, cz, rx, rz, tx, tz, lat, lo, hi, vmax, curv, halfWidth }.
   */
  sample(d, out) {
    const n = this.n;
    const f = this.wrap(d) / this.spacing;
    const i0 = Math.floor(f) % n;
    const i1 = (i0 + 1) % n;
    const t = f - Math.floor(f);
    const L = (a) => a[i0] + (a[i1] - a[i0]) * t;
    out.cx = L(this.cx);
    out.cy = L(this.cy);
    out.cz = L(this.cz);
    out.rx = L(this.rx);
    out.rz = L(this.rz);
    out.tx = L(this.tx);
    out.tz = L(this.tz);
    out.lat = L(this.lat);
    out.lo = L(this.lo);
    out.hi = L(this.hi);
    out.vmax = L(this.vmax);
    out.curv = L(this.curv);
    out.halfWidth = L(this.hw);
    out.index = i0;
    return out;
  }

  /** Minimum profile speed over [d0, d1]. */
  minSpeed(d0, d1) {
    const n = this.n;
    const i0 = Math.floor(this.wrap(d0) / this.spacing);
    const steps = Math.max(1, Math.ceil((d1 - d0) / this.spacing));
    let m = Infinity;
    for (let s = 0; s <= steps; s++) {
      const v = this.vmax[(i0 + s) % n];
      if (v < m) m = v;
    }
    return m;
  }

  /** Max |curvature| over [d0, d1]. */
  maxCurv(d0, d1) {
    const n = this.n;
    const i0 = Math.floor(this.wrap(d0) / this.spacing);
    const steps = Math.max(1, Math.ceil((d1 - d0) / this.spacing));
    let m = 0;
    for (let s = 0; s <= steps; s += 2) {
      const v = Math.abs(this.curv[(i0 + s) % n]);
      if (v > m) m = v;
    }
    return m;
  }
}
