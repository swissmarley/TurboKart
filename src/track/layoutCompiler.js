/**
 * Turtle-graphics track authoring -> TrackPath layout (pure, Node-safe).
 *
 * A track is authored as a sequence of segments driven from the start line:
 *   { id?, s: 80 }                straight of 80 m
 *   { id?, r: 40, a: 90 }         arc of radius 40 m turning 90 deg (a > 0 = RIGHT, a < 0 = left)
 * optional per-segment attributes (sticky = carried to later segments):
 *   y     elevation (m) reached at the END of this segment (smooth Catmull interpolation)
 *   w     road half-width on this segment
 *   wall  wall offset on this segment (number) or null (no barrier -> void)
 *   bank  banking multiplier on this segment
 * Angles must sum to +-360. Small closure errors are distributed over straights.
 *
 * Feature references (`at`, `from`, `to`) are strings 'segId@0.5' (fraction of the
 * segment), 'segId+12' / 'segId-8' (metres from the segment start) or plain metres.
 */
import { wrapAngle } from './util.js';

const DEG = Math.PI / 180;

export function compileLayout(def) {
  const segs = solveAutoStraights(def);
  const start = def.start || { x: 0, z: 0, heading: 0 };
  const defaults = { w: 12, wall: 19, bank: 1, ...(def.defaults || {}) };

  // ---- walk the turtle ------------------------------------------------------
  const step = 0.5;
  let x = start.x;
  let z = start.z;
  let h = start.heading || 0;
  const dense = [{ x, z, s: 0, seg: 0 }];
  const segInfo = [];
  let s = 0;
  let turnSum = 0;
  segs.forEach((sg, si) => {
    const isArc = sg.s === undefined;
    const len = isArc ? Math.abs(sg.a) * DEG * sg.r : sg.s;
    const rate = isArc ? Math.sign(sg.a) / sg.r : 0; // rad/m, + = right (heading decreases)
    if (isArc) turnSum += sg.a;
    segInfo.push({ id: sg.id || `seg${si}`, start: s, len, end: s + len, isArc, r: sg.r || Infinity, def: sg });
    const n = Math.max(1, Math.ceil(len / step));
    const dl = len / n;
    for (let k = 0; k < n; k++) {
      const hm = h - rate * dl * 0.5;
      x += Math.sin(hm) * dl;
      z += Math.cos(hm) * dl;
      h -= rate * dl;
      s += dl;
      dense.push({ x, z, s, seg: si });
    }
  });
  const total = s;
  const headingErr = wrapAngle((start.heading || 0) - h);
  if (Math.abs(Math.abs(turnSum) - 360) > 1e-6 && typeof console !== 'undefined') {
    console.warn(`[track:${def.id}] turn angles sum to ${turnSum}, expected +-360`);
  }
  const ex = start.x - x;
  const ez = start.z - z;

  // distribute closure error, weighting straights much more than arcs
  const segW = segInfo.map((g) => (g.isArc ? 0.08 : 1) * g.len);
  const wTotal = segW.reduce((a, b) => a + b, 0);
  const cumW = [];
  {
    let acc = 0;
    for (let i = 0; i < segInfo.length; i++) {
      cumW.push(acc);
      acc += segW[i];
    }
  }
  const weightAt = (sv, si) => {
    const g = segInfo[si];
    const f = g.len > 0 ? (sv - g.start) / g.len : 0;
    return (cumW[si] + segW[si] * Math.min(1, Math.max(0, f))) / wTotal;
  };
  for (const p of dense) {
    const w = weightAt(p.s, p.seg);
    p.x += ex * w;
    p.z += ez * w;
  }

  // ---- attributes (sticky per segment) -------------------------------------
  const segAttr = [];
  {
    let cur = { ...defaults };
    for (const g of segInfo) {
      const d = g.def;
      if (d.w !== undefined) cur.w = d.w;
      if (d.wall !== undefined) cur.wall = d.wall;
      if (d.bank !== undefined) cur.bank = d.bank;
      segAttr.push({ ...cur });
    }
  }
  // elevation keyframes (closed loop)
  const keys = [{ s: 0, y: def.startY || 0 }];
  {
    for (let i = 0; i < segInfo.length; i++) {
      const d = segInfo[i].def;
      if (d.y !== undefined) keys.push({ s: segInfo[i].end, y: d.y });
    }
    if (keys[keys.length - 1].s >= total - 1e-6) keys.pop();
  }
  const elevation = makeLoopSpline(keys, total);

  // smooth w / bank / wall over a +-blend window (in dense steps)
  const blend = def.blend || 14;
  const segOfS = (sv) => {
    let lo = 0;
    let hi = segInfo.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (segInfo[mid].start <= sv) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  };
  const wrapS = (sv) => ((sv % total) + total) % total;
  const attrAt = (sv) => {
    // average over a window, smooth transitions
    const K = 9;
    let w = 0;
    let bank = 0;
    let wall = 0;
    let wallN = 0;
    for (let k = 0; k < K; k++) {
      const o = -blend + (2 * blend * k) / (K - 1);
      const a = segAttr[segOfS(wrapS(sv + o))];
      w += a.w;
      bank += a.bank;
      if (a.wall !== null) {
        wall += a.wall;
        wallN++;
      }
    }
    const own = segAttr[segOfS(wrapS(sv))];
    return {
      w: w / K,
      bank: bank / K,
      wall: own.wall === null ? null : wallN ? wall / wallN : own.wall,
    };
  };

  // ---- control points ---------------------------------------------------------
  const cps = []; // { s, x, z }
  const denseAt = (sv) => {
    // dense is sampled every `step` metres (approximately, per segment); binary search
    let lo = 0;
    let hi = dense.length - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (dense[mid].s <= sv) lo = mid;
      else hi = mid;
    }
    const a = dense[lo];
    const b = dense[hi];
    const f = b.s > a.s ? (sv - a.s) / (b.s - a.s) : 0;
    return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f };
  };
  const maxStraightStep = def.cpStep || 18;
  for (const g of segInfo) {
    const stepLen = g.isArc ? Math.min(maxStraightStep, Math.max(3, g.r * 0.22)) : maxStraightStep;
    const n = Math.max(1, Math.round(g.len / stepLen));
    for (let k = 0; k < n; k++) {
      const sv = g.start + (g.len * k) / n;
      cps.push({ s: sv, ...denseAt(sv) });
    }
  }
  const points = cps.map((c) => {
    const a = attrAt(c.s);
    return [c.x, c.z, elevation(c.s), { w: a.w, wall: a.wall, bank: a.bank }];
  });

  // turtle metres -> control point parameter
  const sToCp = (sv) => {
    sv = wrapS(sv);
    let lo = 0;
    let hi = cps.length - 1;
    if (sv >= cps[hi].s) {
      const f = (sv - cps[hi].s) / (total - cps[hi].s);
      return hi + f;
    }
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (cps[mid].s <= sv) lo = mid;
      else hi = mid;
    }
    return lo + (sv - cps[lo].s) / (cps[hi].s - cps[lo].s);
  };
  const segById = new Map(segInfo.map((g) => [g.id, g]));
  const refToS = (ref) => {
    if (typeof ref === 'number') return ref;
    const m = /^([\w-]+?)(?:@([\d.]+)|([+-][\d.]+))?$/.exec(ref);
    if (!m) throw new Error(`bad track ref ${ref}`);
    const g = segById.get(m[1]);
    if (!g) throw new Error(`unknown segment ${m[1]} in ${def.id}`);
    if (m[2] !== undefined) return g.start + g.len * parseFloat(m[2]);
    if (m[3] !== undefined) return g.start + parseFloat(m[3]);
    return g.start;
  };
  const at = (ref) => sToCp(refToS(ref));

  const out = {
    id: def.id,
    defaults,
    bankGain: def.bankGain,
    maxBank: def.maxBank,
    points,
    itemRows: (def.itemRows || []).map((r) => (typeof r === 'object' ? { ...r, at: at(r.at) } : at(r))),
    coins: (def.coins || []).map((c) => ({ ...c, from: at(c.from), to: at(c.to) })),
    boosts: (def.boosts || []).map((b) => ({ ...b, at: at(b.at) })),
    ramps: (def.ramps || []).map((r) => ({ ...r, at: at(r.at) })),
    obstacles: (def.obstacles || []).map((o) => ({ ...o, at: at(o.at) })),
    // for scenery builders
    segments: segInfo.map((g) => ({ id: g.id, from: sToCp(g.start), to: sToCp(g.end - 1e-6), isArc: g.isArc, r: g.r })),
    refToCp: at,
    closure: { ex, ez, headingErr, turtleLength: total, turnSum },
  };
  return out;
}

/** Closed-loop Catmull-Rom (non-uniform) through elevation keyframes. */
function makeLoopSpline(keys, total) {
  const n = keys.length;
  if (n === 1) return () => keys[0].y;
  const S = keys.map((k) => k.s);
  const Y = keys.map((k) => k.y);
  const get = (i) => {
    const w = Math.floor(i / n);
    const j = ((i % n) + n) % n;
    return { s: S[j] + w * total, y: Y[j] };
  };
  return (sv) => {
    sv = ((sv % total) + total) % total;
    let i = n - 1;
    for (let k = 0; k < n; k++) {
      if (S[k] > sv) {
        i = k - 1;
        break;
      }
    }
    const p0 = get(i - 1);
    const p1 = get(i);
    const p2 = get(i + 1);
    const p3 = get(i + 2);
    if (i < 0) {
      // sv before first key (cannot happen since key 0 is at s=0)
    }
    const h = p2.s - p1.s;
    const t = (sv - p1.s) / h;
    const m1 = ((p2.y - p0.y) / (p2.s - p0.s)) * h;
    const m2 = ((p3.y - p1.y) / (p3.s - p1.s)) * h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * p1.y + (t3 - 2 * t2 + t) * m1 + (-2 * t3 + 3 * t2) * p2.y + (t3 - t2) * m2;
  };
}

/**
 * Straights declared `s: 'auto'` (exactly two, non-parallel) get their lengths
 * solved so that the loop closes exactly.
 */
function solveAutoStraights(def) {
  const segs = def.segs.map((g) => ({ ...g }));
  const autos = segs.map((g, i) => (g.s === 'auto' ? i : -1)).filter((i) => i >= 0);
  if (autos.length === 0) return segs;
  if (autos.length !== 2) throw new Error(`[track:${def.id}] need exactly 2 auto straights`);
  const start = def.start || { x: 0, z: 0, heading: 0 };
  let x = start.x;
  let z = start.z;
  let h = start.heading || 0;
  const dirs = [];
  for (const g of segs) {
    if (g.s === 'auto') {
      dirs.push({ x: Math.sin(h), z: Math.cos(h) });
      continue;
    }
    const isArc = g.s === undefined;
    const len = isArc ? Math.abs(g.a) * DEG * g.r : g.s;
    const rate = isArc ? Math.sign(g.a) / g.r : 0;
    const n = Math.max(1, Math.ceil(len / 0.25));
    const dl = len / n;
    for (let k = 0; k < n; k++) {
      const hm = h - rate * dl * 0.5;
      x += Math.sin(hm) * dl;
      z += Math.cos(hm) * dl;
      h -= rate * dl;
    }
  }
  const ex = start.x - x;
  const ez = start.z - z;
  const [a, b] = dirs;
  const det = a.x * b.z - a.z * b.x;
  if (Math.abs(det) < 1e-3) throw new Error(`[track:${def.id}] auto straights are parallel`);
  const L1 = (ex * b.z - ez * b.x) / det;
  const L2 = (a.x * ez - a.z * ex) / det;
  if (L1 < 5 || L2 < 5) {
    throw new Error(`[track:${def.id}] auto straights solved to negative/short lengths: ${L1.toFixed(1)}, ${L2.toFixed(1)}`);
  }
  segs[autos[0]].s = L1;
  segs[autos[1]].s = L2;
  segs[autos[0]].autoLen = L1;
  segs[autos[1]].autoLen = L2;
  return segs;
}
