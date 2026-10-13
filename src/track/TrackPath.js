/**
 * TrackPath — the pure-math side of a track (no DOM, no meshes, Node-safe).
 *
 * control points -> closed centripetal Catmull-Rom (3D, y = elevation)
 *   -> arc-length resample at ~1 m -> per-sample frames (tangent / right / up)
 *   -> curvature (signed, + = turning right) -> banking -> halfWidth / wallOffset
 *   -> gameplay features (item rows, coins, boost pads, ramps, obstacles)
 *   -> fast queryPosition() with hint window + segment projection.
 *
 * Conventions (ARCHITECTURE.md): right = tangent x up, +lateral = right,
 * heading h: forward = (sin h, 0, cos h).
 */
import { Vector3, CatmullRomCurve3 } from 'three';
import { SURFACES } from '../core/constants.js';
import { clamp, smooth01, wrapAngle } from './util.js';

export const QUERY_WINDOW = 40;
const VOID_DEPTH = 1000; // groundHeight below the centre line reported over the void
const ITEM_BOX_HEIGHT = 1.3;
const COIN_HEIGHT = 1.0;

/** Normalised control point: { x, y, z, w, wall, bank } (wall: number | null). */
function normalisePoints(layout) {
  const def = { w: 12, wall: 19, bank: 1, ...(layout.defaults || {}) };
  let cur = { ...def };
  return layout.points.map((p) => {
    const [x, z, y = 0, opts] = Array.isArray(p) ? p : [p.x, p.z, p.y, p];
    if (opts) {
      if (opts.w !== undefined) cur.w = opts.w;
      if (opts.wall !== undefined) cur.wall = opts.wall;
      if (opts.bank !== undefined) cur.bank = opts.bank;
    }
    return { x, y, z, w: cur.w, wall: cur.wall, bank: cur.bank };
  });
}

function boxFilterCircular(src, radius, passes = 1) {
  const n = src.length;
  let a = Float64Array.from(src);
  let b = new Float64Array(n);
  for (let p = 0; p < passes; p++) {
    let sum = 0;
    for (let o = -radius; o <= radius; o++) sum += a[((o % n) + n) % n];
    const inv = 1 / (2 * radius + 1);
    for (let i = 0; i < n; i++) {
      b[i] = sum * inv;
      sum += a[(i + radius + 1) % n] - a[(((i - radius) % n) + n) % n];
    }
    const t = a;
    a = b;
    b = t;
  }
  return a;
}

export class TrackPath {
  /**
   * @param {object} layout  see layouts.js
   * @param {{spacing?: number}} opts
   */
  constructor(layout, { spacing = 1 } = {}) {
    this.layout = layout;
    this.cps = normalisePoints(layout);
    const n = this.cps.length;
    this.cpCount = n;

    // ---- 1. dense sampling of the centripetal Catmull-Rom spline ----------
    const curve = new CatmullRomCurve3(
      this.cps.map((c) => new Vector3(c.x, c.y, c.z)),
      true,
      'centripetal',
    );
    this.curve = curve;
    const D = n * 160;
    const cum = new Float64Array(D + 1);
    const tmp = new Vector3();
    const prev = curve.getPoint(0, new Vector3());
    for (let j = 1; j <= D; j++) {
      curve.getPoint(j / D, tmp);
      cum[j] = cum[j - 1] + tmp.distanceTo(prev);
      prev.copy(tmp);
    }
    const L = cum[D];

    // ---- 2. arc-length resample -------------------------------------------
    const N = Math.max(64, Math.round(L / spacing));
    const ds = L / N;
    this.count = N;
    this.length = L;
    this.spacing = ds;
    const px = (this.px = new Float64Array(N));
    const py = (this.py = new Float64Array(N));
    const pz = (this.pz = new Float64Array(N));
    const cpu = (this.cpu = new Float64Array(N)); // control-point parameter in [0,n)
    let j = 0;
    for (let k = 0; k < N; k++) {
      const s = k * ds;
      while (j < D - 1 && cum[j + 1] < s) j++;
      const segLen = cum[j + 1] - cum[j];
      const f = segLen > 1e-9 ? (s - cum[j]) / segLen : 0;
      const t = (j + f) / D;
      curve.getPoint(t, tmp);
      px[k] = tmp.x;
      py[k] = tmp.y;
      pz[k] = tmp.z;
      cpu[k] = t * n;
    }

    // ---- 3. tangents, curvature -------------------------------------------
    const tx = (this.tx = new Float64Array(N));
    const ty = (this.ty = new Float64Array(N));
    const tz = (this.tz = new Float64Array(N));
    for (let k = 0; k < N; k++) {
      const a = (k - 1 + N) % N;
      const b = (k + 1) % N;
      let x = px[b] - px[a];
      let y = py[b] - py[a];
      let z = pz[b] - pz[a];
      const l = Math.hypot(x, y, z) || 1;
      tx[k] = x / l;
      ty[k] = y / l;
      tz[k] = z / l;
    }
    const heading = new Float64Array(N);
    for (let k = 0; k < N; k++) heading[k] = Math.atan2(tx[k], tz[k]);
    const rawCurv = new Float64Array(N);
    const K = 3;
    for (let k = 0; k < N; k++) {
      const dh = wrapAngle(heading[(k + K) % N] - heading[(k - K + N) % N]);
      rawCurv[k] = -dh / (2 * K * ds);
    }
    const curv = (this.curvature = boxFilterCircular(rawCurv, 4, 2));

    // ---- 4. per-sample attributes from control points ----------------------
    const hw = (this.hw = new Float64Array(N));
    const wall = (this.wall = new Float64Array(N)); // NaN = null (no barrier)
    const bankMul = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      const u = cpu[k];
      const i0 = Math.floor(u) % n;
      const i1 = (i0 + 1) % n;
      const f = smooth01(u - Math.floor(u));
      const c0 = this.cps[i0];
      const c1 = this.cps[i1];
      hw[k] = c0.w + (c1.w - c0.w) * f;
      bankMul[k] = c0.bank + (c1.bank - c0.bank) * f;
      if (c0.wall === null) wall[k] = NaN;
      else if (c1.wall === null) wall[k] = c0.wall;
      else wall[k] = c0.wall + (c1.wall - c0.wall) * f;
    }

    // ---- 5. banking ---------------------------------------------------------
    const bankGain = layout.bankGain ?? 4.5;
    const maxBank = layout.maxBank ?? 0.2;
    const bankTarget = new Float64Array(N);
    for (let k = 0; k < N; k++) {
      bankTarget[k] = clamp(curv[k] * bankGain * bankMul[k], -maxBank * Math.max(1, bankMul[k]), maxBank * Math.max(1, bankMul[k]));
    }
    const bank = (this.bank = boxFilterCircular(bankTarget, 10, 3));

    // ---- 6. clamp wall offsets on tight inner corners (avoid folding) ------
    {
      const lim = new Float64Array(N);
      for (let k = 0; k < N; k++) {
        const r = 1 / Math.max(Math.abs(curv[k]), Math.abs(rawCurv[k]), 1e-5);
        lim[k] = Math.max(hw[k] + 2.2, r * 0.8);
      }
      // min filter (+-10) then box filter (+-6) -> smooth, never above limit
      const minL = new Float64Array(N);
      for (let k = 0; k < N; k++) {
        let m = Infinity;
        for (let o = -12; o <= 12; o++) m = Math.min(m, lim[(k + o + N) % N]);
        minL[k] = m;
      }
      const smoothL = boxFilterCircular(minL, 6, 2);
      for (let k = 0; k < N; k++) {
        if (!Number.isNaN(wall[k])) wall[k] = Math.max(hw[k] + 1.5, Math.min(wall[k], smoothL[k]));
      }
    }

    // ---- 7. frames ----------------------------------------------------------
    const rx = (this.rx = new Float64Array(N));
    const ry = (this.ry = new Float64Array(N));
    const rz = (this.rz = new Float64Array(N));
    const ux = (this.ux = new Float64Array(N));
    const uy = (this.uy = new Float64Array(N));
    const uz = (this.uz = new Float64Array(N));
    for (let k = 0; k < N; k++) {
      const Tx = tx[k];
      const Ty = ty[k];
      const Tz = tz[k];
      // R0 = normalize(T x Y) = (-Tz, 0, Tx)/|..|
      const hl = Math.hypot(Tx, Tz) || 1;
      const r0x = -Tz / hl;
      const r0z = Tx / hl;
      // U0 = R0 x T
      const u0x = 0 * Tz - r0z * Ty;
      const u0y = r0z * Tx - r0x * Tz;
      const u0z = r0x * Ty - 0 * Tx;
      const cb = Math.cos(bank[k]);
      const sb = Math.sin(bank[k]);
      let Rx = r0x * cb - u0x * sb;
      let Ry = 0 * cb - u0y * sb;
      let Rz = r0z * cb - u0z * sb;
      const rl = Math.hypot(Rx, Ry, Rz) || 1;
      Rx /= rl;
      Ry /= rl;
      Rz /= rl;
      // U = R x T
      let Ux = Ry * Tz - Rz * Ty;
      let Uy = Rz * Tx - Rx * Tz;
      let Uz = Rx * Ty - Ry * Tx;
      const ul = Math.hypot(Ux, Uy, Uz) || 1;
      rx[k] = Rx;
      ry[k] = Ry;
      rz[k] = Rz;
      ux[k] = Ux / ul;
      uy[k] = Uy / ul;
      uz[k] = Uz / ul;
    }

    // distance of every integer control point (for authoring features)
    this.cpDist = new Float64Array(n + 1);
    {
      let k = 0;
      for (let i = 0; i < n; i++) {
        while (k < N && cpu[k] < i) k++;
        // interpolate between k-1 and k
        if (k === 0) this.cpDist[i] = 0;
        else {
          const a = cpu[k - 1];
          const b = k < N ? cpu[k] : n;
          const f = b > a ? (i - a) / (b - a) : 0;
          this.cpDist[i] = ((k - 1) + f) * ds;
        }
      }
      this.cpDist[n] = L;
    }

    // bounds & max lateral extent
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let maxExt = 0;
    for (let k = 0; k < N; k++) {
      minX = Math.min(minX, px[k]);
      maxX = Math.max(maxX, px[k]);
      minZ = Math.min(minZ, pz[k]);
      maxZ = Math.max(maxZ, pz[k]);
      minY = Math.min(minY, py[k]);
      maxY = Math.max(maxY, py[k]);
      maxExt = Math.max(maxExt, Number.isNaN(wall[k]) ? hw[k] + 1 : wall[k]);
    }
    this.bounds = { minX, maxX, minZ, maxZ, minY, maxY };
    this.maxExtent = maxExt;

    this._buildGrid();
    this._buildSamples();
    this._buildFeatures();
  }

  // ------------------------------------------------------------------------
  // public sample objects (contract: TrackSample[])
  // ------------------------------------------------------------------------
  _buildSamples() {
    const N = this.count;
    const samples = new Array(N);
    for (let k = 0; k < N; k++) {
      samples[k] = {
        index: k,
        distance: k * this.spacing,
        position: new Vector3(this.px[k], this.py[k], this.pz[k]),
        tangent: new Vector3(this.tx[k], this.ty[k], this.tz[k]),
        right: new Vector3(this.rx[k], this.ry[k], this.rz[k]),
        up: new Vector3(this.ux[k], this.uy[k], this.uz[k]),
        halfWidth: this.hw[k],
        wallOffset: Number.isNaN(this.wall[k]) ? null : this.wall[k],
        curvature: this.curvature[k],
        bank: this.bank[k],
      };
    }
    this.samples = samples;
  }

  /** Distance along the lap for a (fractional) control-point parameter. */
  cpToDistance(u) {
    const n = this.cpCount;
    u = ((u % n) + n) % n;
    const i = Math.floor(u);
    const f = u - i;
    return this.cpDist[i] + (this.cpDist[i + 1] - this.cpDist[i]) * f;
  }

  wrapDistance(d) {
    const L = this.length;
    d %= L;
    return d < 0 ? d + L : d;
  }

  // ------------------------------------------------------------------------
  // interpolated frame at a distance
  // ------------------------------------------------------------------------
  frameAt(distance, lateral = 0, out) {
    out = out || { position: new Vector3(), tangent: new Vector3(), right: new Vector3(), up: new Vector3(), distance: 0 };
    const N = this.count;
    const d = this.wrapDistance(distance);
    const fk = d / this.spacing;
    const i = Math.floor(fk) % N;
    const j = (i + 1) % N;
    const u = fk - Math.floor(fk);
    this._lerpFrame(i, j, u, out.position, out.tangent, out.right, out.up);
    // offset along the linearly interpolated (un-normalised) cross-section, exactly
    // like the road mesh and queryPosition
    const v = 1 - u;
    out.position.x += (this.rx[i] * v + this.rx[j] * u) * lateral;
    out.position.y += (this.ry[i] * v + this.ry[j] * u) * lateral;
    out.position.z += (this.rz[i] * v + this.rz[j] * u) * lateral;
    out.distance = d;
    if ('halfWidth' in out || out.withAttributes) {
      out.halfWidth = this.hw[i] + (this.hw[j] - this.hw[i]) * u;
      out.wallOffset = this._lerpWall(i, j, u);
    }
    return out;
  }

  _lerpWall(i, j, u) {
    const a = this.wall[i];
    const b = this.wall[j];
    const na = Number.isNaN(a);
    const nb = Number.isNaN(b);
    if (!na && !nb) return a + (b - a) * u;
    if (na && nb) return null;
    return u < 0.5 ? (na ? null : a) : nb ? null : b;
  }

  _lerpFrame(i, j, u, P, T, R, U) {
    const v = 1 - u;
    P.set(this.px[i] * v + this.px[j] * u, this.py[i] * v + this.py[j] * u, this.pz[i] * v + this.pz[j] * u);
    T.set(this.tx[i] * v + this.tx[j] * u, this.ty[i] * v + this.ty[j] * u, this.tz[i] * v + this.tz[j] * u).normalize();
    R.set(this.rx[i] * v + this.rx[j] * u, this.ry[i] * v + this.ry[j] * u, this.rz[i] * v + this.rz[j] * u).normalize();
    U.set(this.ux[i] * v + this.ux[j] * u, this.uy[i] * v + this.uy[j] * u, this.uz[i] * v + this.uz[j] * u).normalize();
  }

  // ------------------------------------------------------------------------
  // queryPosition
  // ------------------------------------------------------------------------
  static createQuery() {
    return {
      index: 0,
      distance: 0,
      progress: 0,
      lateral: 0,
      center: new Vector3(),
      tangent: new Vector3(),
      right: new Vector3(),
      up: new Vector3(),
      halfWidth: 0,
      wallOffset: null,
      groundHeight: 0,
      groundNormal: new Vector3(0, 1, 0),
      surface: SURFACES.ROAD,
      rampBoost: 0,
    };
  }

  /** Index of the sample nearest to (x,z) — windowed around hint, full scan fallback. */
  nearestIndex(x, z, hint) {
    const N = this.count;
    const X = this.px;
    const Z = this.pz;
    let best = -1;
    let bestD = Infinity;
    if (hint !== undefined && hint !== null && hint >= 0 && hint < N && Number.isFinite(hint)) {
      const h = hint | 0;
      let bestO = 0;
      for (let o = -QUERY_WINDOW; o <= QUERY_WINDOW; o++) {
        let i = h + o;
        if (i < 0) i += N;
        else if (i >= N) i -= N;
        const dx = X[i] - x;
        const dz = Z[i] - z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = i;
          bestO = o;
        }
      }
      const lim = this.maxExtent + 12;
      if (bestO <= -QUERY_WINDOW + 1 || bestO >= QUERY_WINDOW - 1 || bestD > lim * lim) best = -1;
    }
    if (best < 0) {
      bestD = Infinity;
      best = 0; // NaN-safe fallback
      for (let i = 0; i < N; i++) {
        const dx = X[i] - x;
        const dz = Z[i] - z;
        const d = dx * dx + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    return best;
  }

  /**
   * @param {{x:number,y:number,z:number}} position
   * @param {number} [hintIndex]
   * @param {object} [out]
   */
  query(position, hintIndex, out) {
    out = out || TrackPath.createQuery();
    const N = this.count;
    const x = position.x;
    const z = position.z;
    const best = this.nearestIndex(x, z, hintIndex);
    const X = this.px;
    const Z = this.pz;

    // Find the segment [i, i+1] whose cross-section lines (C_k + R_k * l, the exact
    // lines the road mesh is built from) bracket the point, then solve for u exactly.
    const RX = this.rx;
    const RZ = this.rz;
    const side = (k) => (x - X[k]) * RZ[k] - (z - Z[k]) * RX[k]; // > 0: ahead of section k
    let i = best;
    let gi = side(i);
    if (gi >= 0) {
      for (let n = 0; n < 12; n++) {
        const j2 = i + 1 === N ? 0 : i + 1;
        const gj = side(j2);
        if (gj < 0) break;
        i = j2;
        gi = gj;
      }
    } else {
      for (let n = 0; n < 12; n++) {
        i = i === 0 ? N - 1 : i - 1;
        gi = side(i);
        if (gi >= 0) break;
      }
    }
    const j = i + 1 === N ? 0 : i + 1;
    let u;
    {
      // g(u) = cross(D0 - u dC, R_i + u dR) = c + b u + a u^2
      const d0x = x - X[i];
      const d0z = z - Z[i];
      const dcx = X[j] - X[i];
      const dcz = Z[j] - Z[i];
      const drx = RX[j] - RX[i];
      const drz = RZ[j] - RZ[i];
      const c = gi;
      const b = d0x * drz - d0z * drx - (dcx * RZ[i] - dcz * RX[i]);
      const a = -(dcx * drz - dcz * drx);
      if (Math.abs(a) < 1e-9) u = Math.abs(b) > 1e-12 ? -c / b : 0;
      else {
        const disc = b * b - 4 * a * c;
        if (disc < 0) u = -b / (2 * a);
        else {
          const sq = Math.sqrt(disc);
          const r1 = (-b + sq) / (2 * a);
          const r2 = (-b - sq) / (2 * a);
          const in1 = r1 >= -1e-6 && r1 <= 1 + 1e-6;
          const in2 = r2 >= -1e-6 && r2 <= 1 + 1e-6;
          u = in1 && in2 ? Math.min(r1, r2) : in1 ? r1 : in2 ? r2 : Math.abs(r1 - 0.5) < Math.abs(r2 - 0.5) ? r1 : r2;
        }
      }
      u = u < 0 ? 0 : u > 1 ? 1 : u;
    }
    const C = out.center;
    const T = out.tangent;
    const R = out.right;
    const U = out.up;
    this._lerpFrame(i, j, u, C, T, R, U);
    const L = this.length;
    let dist = (i + u) * this.spacing;
    if (dist >= L) dist -= L;
    out.index = u < 0.5 ? i : j;
    out.distance = dist;
    out.progress = dist / L;
    const hwv = this.hw[i] + (this.hw[j] - this.hw[i]) * u;
    const wall = this._lerpWall(i, j, u);
    out.halfWidth = hwv;
    out.wallOffset = wall;

    // lateral along the (linearly interpolated, mesh-consistent) cross-section line
    const v1 = 1 - u;
    const lrx = RX[i] * v1 + RX[j] * u;
    const lry = this.ry[i] * v1 + this.ry[j] * u;
    const lrz = RZ[i] * v1 + RZ[j] * u;
    const rxz2 = lrx * lrx + lrz * lrz || 1;
    const lat = ((x - C.x) * lrx + (z - C.z) * lrz) / rxz2;
    out.lateral = lat;
    let gh = C.y + lry * lat;
    out.groundNormal.copy(U);
    out.rampBoost = 0;
    const alat = lat < 0 ? -lat : lat;

    if (alat <= hwv) {
      out.surface = SURFACES.ROAD;
      // ramps
      const ramps = this.ramps;
      for (let r = 0; r < ramps.length; r++) {
        const rp = ramps[r];
        let along = dist - rp.startDistance;
        if (along < -L * 0.5) along += L;
        else if (along > L * 0.5) along -= L;
        if (along >= 0 && along <= rp.length && Math.abs(lat - rp.lateral) <= rp.width * 0.5) {
          out.surface = SURFACES.RAMP;
          out.rampBoost = rp.boost;
          const slope = rp.height / rp.length;
          gh += along * slope;
          const n = out.groundNormal;
          n.set(U.x - T.x * slope, U.y - T.y * slope, U.z - T.z * slope).normalize();
          break;
        }
      }
      if (out.surface === SURFACES.ROAD) {
        const pads = this.boostPads;
        for (let b = 0; b < pads.length; b++) {
          const p = pads[b];
          let along = dist - p.distance;
          if (along < -L * 0.5) along += L;
          else if (along > L * 0.5) along -= L;
          if (Math.abs(along) <= p.length * 0.5 && Math.abs(lat - p.lateral) <= p.width * 0.5) {
            out.surface = SURFACES.BOOST;
            break;
          }
        }
      }
    } else if (wall === null && alat > hwv + 1) {
      out.surface = SURFACES.VOID;
      gh = C.y - VOID_DEPTH;
    } else {
      out.surface = SURFACES.OFFROAD;
      // beyond the barrier apron the ground continues flat (don't extrapolate the bank)
      const lim = (wall === null ? hwv + 1 : wall) + 3;
      if (alat > lim) gh = C.y + lry * (lat < 0 ? -lim : lim);
    }
    out.groundHeight = gh;
    return out;
  }

  // ------------------------------------------------------------------------
  // spatial grid for build-time nearest lookups (terrain / scatter)
  // ------------------------------------------------------------------------
  _buildGrid() {
    const cs = 16;
    this.gridCell = cs;
    const map = new Map();
    for (let k = 0; k < this.count; k++) {
      const cx = Math.floor(this.px[k] / cs);
      const cz = Math.floor(this.pz[k] / cs);
      const key = cx * 65536 + cz;
      let arr = map.get(key);
      if (!arr) map.set(key, (arr = []));
      arr.push(k);
    }
    this.grid = map;
  }

  /**
   * Nearest sample within maxDist (XZ). Returns -1 if none.
   * @returns {number}
   */
  nearestWithin(x, z, maxDist = 200) {
    const cs = this.gridCell;
    const cx = Math.floor(x / cs);
    const cz = Math.floor(z / cs);
    const maxRing = Math.ceil(maxDist / cs) + 1;
    let best = -1;
    let bestD = maxDist * maxDist;
    for (let r = 0; r <= maxRing; r++) {
      if (best >= 0 && (r - 1) * cs > Math.sqrt(bestD)) break;
      for (let ix = -r; ix <= r; ix++) {
        for (let iz = -r; iz <= r; iz++) {
          if (Math.max(Math.abs(ix), Math.abs(iz)) !== r) continue;
          const arr = this.grid.get((cx + ix) * 65536 + (cz + iz));
          if (!arr) continue;
          for (let q = 0; q < arr.length; q++) {
            const k = arr[q];
            const dx = this.px[k] - x;
            const dz = this.pz[k] - z;
            const d = dx * dx + dz * dz;
            if (d < bestD) {
              bestD = d;
              best = k;
            }
          }
        }
      }
    }
    return best;
  }

  /**
   * Build-time helper: precise lateral info for an arbitrary XZ point.
   * Returns null if farther than maxDist from the centreline.
   */
  locate(x, z, maxDist = 200, out = {}) {
    const k = this.nearestWithin(x, z, maxDist);
    if (k < 0) return null;
    const q = this._locQ || (this._locQ = TrackPath.createQuery());
    const p = this._locP || (this._locP = new Vector3());
    p.set(x, 0, z);
    this.query(p, k, q);
    out.index = q.index;
    out.distance = q.distance;
    out.lateral = q.lateral;
    out.absLateral = Math.abs(q.lateral);
    out.halfWidth = q.halfWidth;
    out.wallOffset = q.wallOffset;
    out.extent = q.wallOffset === null ? q.halfWidth + 1 : q.wallOffset;
    out.planeHeight = q.center.y + q.right.y * q.lateral;
    out.centerY = q.center.y;
    return out;
  }

  // ------------------------------------------------------------------------
  // gameplay features
  // ------------------------------------------------------------------------
  _buildFeatures() {
    const lay = this.layout;
    const f = { position: new Vector3(), tangent: new Vector3(), right: new Vector3(), up: new Vector3(), distance: 0 };
    const L = this.length;

    // boost pads
    this.boostPads = (lay.boosts || []).map((b) => {
      const d = this.cpToDistance(b.at);
      const lat = b.lat || 0;
      this.frameAt(d, lat, f);
      return {
        position: f.position.clone(),
        tangent: f.tangent.clone(),
        right: f.right.clone(),
        up: f.up.clone(),
        width: b.w || 5,
        length: b.len || 7,
        distance: d,
        lateral: lat,
      };
    });

    // ramps (distance/position = the lip, where the launch happens)
    this.ramps = (lay.ramps || []).map((r) => {
      const lip = this.cpToDistance(r.at);
      const len = r.len || 10;
      const lat = r.lat || 0;
      this.frameAt(lip, lat, f);
      const hwHere = this.hw[Math.floor(this.wrapDistance(lip) / this.spacing) % this.count];
      const width = r.w || hwHere * 2 - 2;
      return {
        distance: lip,
        startDistance: this.wrapDistance(lip - len),
        position: f.position.clone(),
        tangent: f.tangent.clone(),
        right: f.right.clone(),
        up: f.up.clone(),
        length: len,
        width,
        lateral: lat,
        height: r.h ?? 1.3,
        boost: r.boost ?? 13,
      };
    });

    // item box rows
    const items = [];
    this.itemRows = [];
    for (const row of lay.itemRows || []) {
      const at = typeof row === 'number' ? row : row.at;
      const d = this.cpToDistance(at);
      const k = Math.floor(this.wrapDistance(d) / this.spacing) % this.count;
      const hwv = this.hw[k];
      const count = (typeof row === 'object' && row.count) || (hwv >= 12.5 ? 5 : 4);
      const spread = Math.min(hwv - 3, (count - 1) * 4.2 * 0.5 + 0.5);
      const shift = (typeof row === 'object' && row.lat) || 0;
      const rowItems = [];
      for (let c = 0; c < count; c++) {
        const lat = shift + (count === 1 ? 0 : -spread + (2 * spread * c) / (count - 1));
        this.frameAt(d, lat, f);
        const p = f.position.clone().addScaledVector(f.up, ITEM_BOX_HEIGHT + this.rampHeightAt(d, lat));
        items.push(p);
        rowItems.push(p);
      }
      this.itemRows.push({ distance: d, positions: rowItems });
    }
    this.itemBoxPositions = items;

    // coin trails
    const coins = [];
    for (const c of lay.coins || []) {
      const d0 = this.cpToDistance(c.from);
      let d1 = this.cpToDistance(c.to);
      if (d1 < d0) d1 += L;
      const spacing = c.spacing || 4;
      const cnt = c.count || Math.max(2, Math.floor((d1 - d0) / spacing) + 1);
      const lats = Array.isArray(c.lat) ? c.lat : [c.lat || 0, c.lat || 0];
      for (let q = 0; q < cnt; q++) {
        const t = cnt === 1 ? 0 : q / (cnt - 1);
        // piecewise smooth lateral through the given values
        const segs = lats.length - 1;
        const st = Math.min(segs - 1e-9, t * segs);
        const si = Math.floor(st);
        let lat = lats[si] + (lats[si + 1] - lats[si]) * smooth01(st - si);
        if (c.wave) lat += Math.sin(t * Math.PI * 2 * (c.waves || 1)) * c.wave;
        const dc = d0 + (d1 - d0) * t;
        this.frameAt(dc, lat, f);
        coins.push(f.position.clone().addScaledVector(f.up, COIN_HEIGHT + this.rampHeightAt(dc, lat)));
      }
    }
    this.coinPositions = coins;

    // obstacles (static cylinders inside the drivable corridor, e.g. in off-road)
    this.obstacles = (lay.obstacles || []).map((o) => {
      const d = this.cpToDistance(o.at);
      this.frameAt(d, o.lat, f);
      return { position: f.position.clone(), radius: o.r || 1, kind: o.kind || 'rock', distance: d, lateral: o.lat, scale: o.scale || 1 };
    });
  }

  /** Extra surface height of a ramp wedge at (distance, lateral), 0 if none. */
  rampHeightAt(distance, lateral) {
    const L = this.length;
    for (const rp of this.ramps || []) {
      let along = this.wrapDistance(distance) - rp.startDistance;
      if (along < -L * 0.5) along += L;
      else if (along > L * 0.5) along -= L;
      if (along >= 0 && along <= rp.length && Math.abs(lateral - rp.lateral) <= rp.width * 0.5) return (rp.height * along) / rp.length;
    }
    return 0;
  }

  /** Evenly spaced centreline outline (XZ) — used for previews/minimap. */
  outline(count = 200) {
    const pts = [];
    const f = { position: new Vector3(), tangent: new Vector3(), right: new Vector3(), up: new Vector3(), distance: 0 };
    for (let i = 0; i < count; i++) {
      this.frameAt((i / count) * this.length, 0, f);
      pts.push({ x: f.position.x, z: f.position.z });
    }
    return pts;
  }

  /** Start grid: 2 per row, staggered, rows ~6 m apart, all behind the line. */
  startGrid(count) {
    const f = { position: new Vector3(), tangent: new Vector3(), right: new Vector3(), up: new Vector3(), distance: 0 };
    const out = [];
    const hw0 = this.hw[0];
    const side = Math.min(5, hw0 * 0.42);
    for (let k = 0; k < count; k++) {
      const row = Math.floor(k / 2);
      const col = k % 2;
      const back = 5 + row * 6 + col * 3;
      const lat = col === 0 ? -side : side;
      const d = this.wrapDistance(-back);
      this.frameAt(d, lat, f);
      out.push({
        position: f.position.clone(),
        heading: Math.atan2(f.tangent.x, f.tangent.z),
        distance: d,
      });
    }
    return out;
  }
}
