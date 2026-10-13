// Node test for the pure track math (no DOM).  Run:  node dev/track-test.mjs
// Checks every track: self-overlap, road folding, queryPosition robustness &
// continuity (with/without hints, moving probes through sharp corners),
// ground height/normal consistency, start grid, item/coin/pad/ramp placement.
import { Vector3 } from 'three';
import { SURFACES } from '../src/core/constants.js';
import { TRACKS, getTrackPreviewPath } from '../src/track/TrackDefinitions.js';
import { Track } from '../src/track/Track.js';
import { createRng } from '../src/track/util.js';

let failures = 0;
const fail = (id, msg) => {
  failures++;
  console.log(`  \x1b[31mFAIL\x1b[0m [${id}] ${msg}`);
};
const ok = (msg) => console.log(`  \x1b[32mok\x1b[0m   ${msg}`);
const circDist = (a, b, L) => {
  let d = Math.abs(a - b) % L;
  return d > L / 2 ? L - d : d;
};

for (const def of TRACKS) {
  const id = def.id;
  const t0 = performance.now();
  const track = new Track(id, { quality: 'high' });
  const tBuild = performance.now() - t0;
  const S = track.samples;
  const N = S.length;
  const L = track.length;
  console.log(`\n=== ${id} (${def.name}) ===`);

  // ---------------------------------------------------------------- stats
  let minR = Infinity;
  let minRAt = 0;
  let maxGrade = 0;
  let maxBank = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  let voidLen = 0;
  for (let k = 0; k < N; k++) {
    const s = S[k];
    const r = 1 / Math.max(1e-6, Math.abs(s.curvature));
    if (r < minR) {
      minR = r;
      minRAt = s.distance;
    }
    maxGrade = Math.max(maxGrade, Math.abs(s.tangent.y) / Math.hypot(s.tangent.x, s.tangent.z));
    maxBank = Math.max(maxBank, Math.abs(s.bank));
    minY = Math.min(minY, s.position.y);
    maxY = Math.max(maxY, s.position.y);
    if (s.wallOffset === null) voidLen += track.length / N;
  }
  console.log(
    `  length ${L.toFixed(1)} m, samples ${N}, min radius ${minR.toFixed(1)} m @${minRAt.toFixed(0)}, ` +
      `elevation ${minY.toFixed(1)}..${maxY.toFixed(1)} m, max grade ${(maxGrade * 100).toFixed(1)}%, ` +
      `max bank ${((maxBank * 180) / Math.PI).toFixed(1)} deg, no-wall ${voidLen.toFixed(0)} m`,
  );
  console.log(
    `  items ${track.itemBoxPositions.length} (${track.itemBoxPositions.length && track.path.itemRows.length} rows), coins ${track.coinPositions.length}, ` +
      `boost pads ${track.boostPads.length}, ramps ${track.ramps.length}, obstacles ${track.obstacles.length}  (math ${tBuild.toFixed(0)} ms)`,
  );
  if (L < 900 || L > 1600) fail(id, `lap length ${L.toFixed(0)} outside 900..1600`);
  else ok('lap length within 900..1600 m');

  // spacing ~1 m
  {
    let maxSp = 0;
    let minSp = Infinity;
    for (let k = 0; k < N; k++) {
      const d = S[k].position.distanceTo(S[(k + 1) % N].position);
      maxSp = Math.max(maxSp, d);
      minSp = Math.min(minSp, d);
    }
    if (maxSp > 1.1 || minSp < 0.9) fail(id, `sample spacing ${minSp.toFixed(3)}..${maxSp.toFixed(3)}`);
    else ok(`sample spacing ${minSp.toFixed(3)}..${maxSp.toFixed(3)} m`);
  }

  // frames orthonormal & right = tangent x up
  {
    let worst = 0;
    const c = new Vector3();
    for (const s of S) {
      c.crossVectors(s.tangent, s.up);
      worst = Math.max(worst, c.distanceTo(s.right), Math.abs(s.tangent.dot(s.up)), Math.abs(s.right.dot(s.up)));
    }
    if (worst > 1e-3) fail(id, `frame not orthonormal / right != tangent x up (err ${worst})`);
    else ok('frames orthonormal, right = tangent x up');
  }

  // ---------------------------------------------------------- overlap tests
  {
    let minRoad = Infinity;
    let worstCorr = Infinity;
    let worstPair = null;
    for (let i = 0; i < N; i++) {
      const a = S[i];
      const extA = a.wallOffset ?? a.halfWidth + 1;
      for (let j = i + 1; j < N; j++) {
        const sep = circDist(a.distance, S[j].distance, L);
        const b = S[j];
        const roadW = a.halfWidth + b.halfWidth;
        if (sep < Math.max(60, 2.6 * roadW)) continue;
        const dx = a.position.x - b.position.x;
        const dz = a.position.z - b.position.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        minRoad = Math.min(minRoad, d - roadW);
        const extB = b.wallOffset ?? b.halfWidth + 1;
        const margin = d - (extA + extB);
        if (margin < worstCorr) {
          worstCorr = margin;
          worstPair = [i, j, d];
        }
      }
    }
    if (minRoad <= 0) fail(id, `centre line self-overlap: min distance - road width = ${minRoad.toFixed(1)} m`);
    else ok(`no self-overlap (min clearance between non-adjacent road ${minRoad.toFixed(1)} m beyond road width)`);
    if (worstCorr < -0.5)
      fail(id, `wall corridors overlap by ${(-worstCorr).toFixed(1)} m at samples ${worstPair[0]}/${worstPair[1]} (d=${worstPair[2].toFixed(1)})`);
    else ok(`wall corridors clear (min margin ${worstCorr.toFixed(1)} m)`);
  }
  {
    let worst = Infinity;
    let at = 0;
    for (const s of S) {
      const r = 1 / Math.max(1e-6, Math.abs(s.curvature));
      const m = r - s.halfWidth;
      if (m < worst) {
        worst = m;
        at = s.distance;
      }
    }
    if (worst < 2) fail(id, `road inner edge folds (radius - halfWidth = ${worst.toFixed(1)} @${at.toFixed(0)})`);
    else ok(`inner road edge radius >= ${worst.toFixed(1)} m`);
  }

  // ------------------------------------------------------- query robustness
  const rng = createRng(1234);
  const q = Track.createQuery ? Track.createQuery() : undefined;
  const f = { position: new Vector3(), tangent: new Vector3(), right: new Vector3(), up: new Vector3(), distance: 0 };
  const f2 = { position: new Vector3(), tangent: new Vector3(), right: new Vector3(), up: new Vector3(), distance: 0 };
  {
    let bad = 0;
    let worstD = 0;
    let worstLat = 0;
    let worstH = 0;
    let worstN = 0;
    const P = new Vector3();
    for (let it = 0; it < 6000; it++) {
      const d = rng() * L;
      const k = Math.floor(d / (L / N)) % N;
      const s = S[k];
      const sA = S[(k + 1) % N];
      const sB = S[(k + N - 1) % N];
      if ((s.wallOffset === null) !== (sA.wallOffset === null) || (s.wallOffset === null) !== (sB.wallOffset === null)) continue;
      const ext = s.wallOffset ?? s.halfWidth + 0.9;
      const lat = (rng() * 2 - 1) * ext * 0.98;
      track.getFrameAtDistance(d, lat, f);
      P.copy(f.position);
      const useHint = it % 3;
      const hint = useHint === 0 ? undefined : useHint === 1 ? (k + Math.round((rng() * 2 - 1) * 30) + N) % N : (k + N / 2) % N | 0;
      const r = track.queryPosition(P, hint, q);
      // round trip: (distance, lateral) must map back onto the queried point.
      const back = track.getFrameAtDistance(r.distance, r.lateral, f2).position;
      const ed = Math.hypot(back.x - P.x, back.z - P.z);
      const el = Math.abs(r.lateral - lat) * (circDist(r.distance, d, L) < 0.3 ? 1 : 0);
      // ground height of the exact plane (ignoring ramps)
      const eh = r.surface === SURFACES.RAMP ? 0 : Math.abs(r.groundHeight - P.y);
      const en = r.surface === SURFACES.RAMP ? 0 : 1 - r.groundNormal.dot(f.up);
      worstD = Math.max(worstD, ed);
      worstLat = Math.max(worstLat, el);
      worstH = Math.max(worstH, eh);
      worstN = Math.max(worstN, en);
      if (ed > 0.05 || el > 0.1 || eh > 0.05) bad++;
    }
    if (bad) fail(id, `${bad}/6000 random queries off (worst round-trip ${worstD.toFixed(2)}, lat ${worstLat.toFixed(2)}, height ${worstH.toFixed(3)})`);
    else
      ok(
        `random queries (none/near/stale hints): worst round-trip err ${worstD.toFixed(4)} m, lateral ${worstLat.toFixed(4)} m, ` +
          `height ${worstH.toFixed(4)} m, normal ${worstN.toExponential(1)}`,
      );
  }

  // moving probes: weave across the full corridor including the inside of hairpins
  {
    const P = new Vector3();
    let worstStep = 0;
    let worstLatJump = 0;
    let worstH = 0;
    let errs = 0;
    for (const mode of ['center', 'weave', 'inside', 'outside']) {
      let hint = track.queryPosition(track.getFrameAtDistance(0, 0, f).position, undefined, q).index;
      let prevD = null;
      let prevLat = null;
      const step = 0.25; // 30 m/s at 120 Hz
      const steps = Math.floor((L * 1.02) / step);
      for (let i = 0; i < steps; i++) {
        const d = i * step;
        const k = Math.floor(track.path.wrapDistance(d) / (L / N)) % N;
        const s = S[k];
        const ext = (s.wallOffset ?? s.halfWidth + 0.9) - 0.3;
        let lat = 0;
        if (mode === 'weave') lat = Math.sin(d / 23) * (s.halfWidth + 0.5);
        else if (mode === 'inside') lat = Math.sign(s.curvature || 1) * ext;
        else if (mode === 'outside') lat = -Math.sign(s.curvature || 1) * ext;
        track.getFrameAtDistance(d, lat, f);
        P.copy(f.position);
        const r = track.queryPosition(P, hint, q);
        hint = r.index;
        const back = track.getFrameAtDistance(r.distance, r.lateral, f2).position;
        const e = Math.hypot(back.x - P.x, back.z - P.z);
        if (e > 0.05) errs++;
        if (prevD !== null) {
          let st = r.distance - prevD;
          if (st < -L / 2) st += L;
          worstStep = Math.max(worstStep, Math.abs(st));
          if (mode !== 'inside' && mode !== 'outside') worstLatJump = Math.max(worstLatJump, Math.abs(r.lateral - prevLat));
        }
        if (r.surface !== SURFACES.RAMP && r.surface !== SURFACES.VOID) worstH = Math.max(worstH, Math.abs(r.groundHeight - P.y));
        prevD = r.distance;
        prevLat = r.lateral;
      }
    }
    if (errs || worstStep > 1.5) fail(id, `moving probe lost track (${errs} errors, worst step ${worstStep.toFixed(2)} m)`);
    else
      ok(
        `moving probes (centre/weave/inside/outside corridor): max distance step ${worstStep.toFixed(2)} m, ` +
          `max lateral step ${worstLatJump.toFixed(3)} m, height err ${worstH.toFixed(4)} m`,
      );
  }

  // surfaces
  {
    const P = new Vector3();
    let wrong = 0;
    for (let it = 0; it < 2000; it++) {
      const d = rng() * L;
      const k = Math.floor(d / (L / N)) % N;
      const s = S[k];
      const ext = s.wallOffset ?? s.halfWidth + 1;
      const s2 = S[(k + 1) % N];
      const s0 = S[(k - 1 + N) % N];
      if ((s.wallOffset === null) !== (s2.wallOffset === null) || (s.wallOffset === null) !== (s0.wallOffset === null)) continue;
      // offroad sample
      if (s.wallOffset !== null) {
        const lat = (s.halfWidth + 0.3 + rng() * (ext - s.halfWidth - 0.6)) * (rng() < 0.5 ? -1 : 1);
        track.getFrameAtDistance(d, lat, f);
        const r = track.queryPosition(f.position, k, q);
        if (r.surface !== SURFACES.OFFROAD) wrong++;
      } else {
        const lat = (s.halfWidth + 2 + rng() * 10) * (rng() < 0.5 ? -1 : 1);
        track.getFrameAtDistance(d, lat, f);
        P.copy(f.position);
        const r = track.queryPosition(P, k, q);
        if (r.surface !== SURFACES.VOID) wrong++;
      }
    }
    if (wrong) fail(id, `${wrong} off-road/void surface misclassifications`);
    else ok('off-road / void surfaces classified correctly');
  }

  // teleport robustness (respawn with stale hint)
  {
    let errs = 0;
    for (let it = 0; it < 500; it++) {
      const d = rng() * L;
      track.getFrameAtDistance(d, 0, f);
      const stale = Math.floor(rng() * N);
      const r = track.queryPosition(f.position, stale, q);
      if (circDist(r.distance, d, L) > 0.6) errs++;
    }
    if (errs) fail(id, `${errs}/500 teleport queries with stale hints wrong`);
    else ok('teleports with stale hints recover (full-search fallback)');
  }

  // performance
  {
    const P = new Vector3();
    const t1 = performance.now();
    let hint = 0;
    const M = 200000;
    for (let i = 0; i < M; i++) {
      const d = (i * 0.25) % L;
      track.getFrameAtDistance(d, Math.sin(i * 0.01) * 6, f);
      P.copy(f.position);
      hint = track.queryPosition(P, hint, q).index;
    }
    const us = ((performance.now() - t1) * 1000) / M;
    ok(`queryPosition + getFrameAtDistance: ${us.toFixed(2)} us per call`);
  }

  // ------------------------------------------------------------- start grid
  {
    const grid = track.getStartGrid(8);
    let errs = [];
    grid.forEach((g, i) => {
      const r = track.queryPosition(g.position, undefined, q);
      const behind = L - r.distance;
      if (!(r.distance > L - 80 && r.distance < L - 1)) errs.push(`slot ${i} not behind line (distance ${r.distance.toFixed(1)})`);
      if (r.surface !== SURFACES.ROAD) errs.push(`slot ${i} surface ${r.surface}`);
      if (Math.abs(r.lateral) > r.halfWidth - 1.5) errs.push(`slot ${i} too close to edge`);
      const fwd = new Vector3(Math.sin(g.heading), 0, Math.cos(g.heading));
      const tf = new Vector3(r.tangent.x, 0, r.tangent.z).normalize();
      if (fwd.dot(tf) < 0.995) errs.push(`slot ${i} heading not along tangent`);
      if (i >= 2) {
        const dz = grid[i - 2].distance - g.distance;
        if (Math.abs(dz - 6) > 0.01) errs.push(`row spacing ${dz}`);
      }
      void behind;
    });
    if (errs.length) fail(id, `start grid: ${errs.join('; ')}`);
    else ok(`start grid: 8 slots behind the line on the road (last at ${(L - grid[7].distance).toFixed(1)} m back)`);
  }

  // --------------------------------------------------------------- features
  {
    let errs = [];
    for (const p of track.itemBoxPositions) {
      const r = track.queryPosition(p, undefined, q);
      if (r.surface === SURFACES.OFFROAD || r.surface === SURFACES.VOID) errs.push('item box off road');
      const h = p.y - r.groundHeight;
      if (h < 0.9 || h > 1.8) errs.push(`item box height ${h.toFixed(2)}`);
    }
    for (const p of track.coinPositions) {
      const r = track.queryPosition(p, undefined, q);
      if (r.surface === SURFACES.VOID) errs.push('coin over void');
      const h = p.y - r.groundHeight;
      if (h < 0.6 || h > 1.6) errs.push(`coin height ${h.toFixed(2)}`);
    }
    for (const b of track.boostPads) {
      const r = track.queryPosition(b.position, undefined, q);
      if (r.surface !== SURFACES.BOOST) errs.push(`boost pad centre reads ${r.surface}`);
      if (Math.abs(b.lateral) + b.width / 2 > r.halfWidth) errs.push('boost pad sticks out of road');
    }
    for (const rp of track.ramps) {
      const P = track.getFrameAtDistance(rp.distance - rp.length * 0.5, rp.lateral, f).position;
      const r = track.queryPosition(P, undefined, q);
      if (r.surface !== SURFACES.RAMP || !(r.rampBoost > 0)) errs.push(`ramp mid reads ${r.surface}`);
      if (Math.abs(rp.lateral) + rp.width / 2 > r.halfWidth + 0.01) errs.push('ramp sticks out of road');
    }
    for (const o of track.obstacles) {
      const r = track.queryPosition(o.position, undefined, q);
      const a = Math.abs(r.lateral);
      if (a - o.radius < r.halfWidth + 0.5) errs.push(`obstacle ${o.kind} intrudes on road (lat ${r.lateral.toFixed(1)})`);
      if (r.wallOffset !== null && a + o.radius > r.wallOffset + 0.01 && a - o.radius < r.wallOffset)
        errs.push(`obstacle ${o.kind} straddles wall`);
    }
    if (errs.length) fail(id, `features: ${[...new Set(errs)].join('; ')}`);
    else ok('item boxes, coins, boost pads, ramps on the road; obstacles clear of the road');
  }

  // preview / minimap
  {
    const prev = getTrackPreviewPath(id, 200);
    if (prev.length !== 200 || !Number.isFinite(prev[0].x)) fail(id, 'getTrackPreviewPath');
    else ok(`getTrackPreviewPath -> ${prev.length} points; minimap ${track.minimap.path.length} points`);
  }
}

console.log(failures ? `\n\x1b[31m${failures} FAILURE(S)\x1b[0m` : '\n\x1b[32mALL TRACK TESTS PASSED\x1b[0m');
process.exit(failures ? 1 : 0);
