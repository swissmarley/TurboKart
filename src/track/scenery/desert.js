/**
 * Dune Drift: red-rock canyon, mesas & terraces, a tunnel through a mesa,
 * a natural rock arch, cacti, oasis palms, pyramids on the horizon, tumbleweeds.
 */
import * as THREE from 'three';
import { createNoise2D, createRng, smoothstep, clamp } from '../util.js';
import { makeAsphalt, makeGround, makeRock, makeStrata } from '../build/textures.js';
import { buildTerrain, createTerrainMaterial } from '../build/terrain.js';
import { buildRoadMesh, buildOffroad, buildCurbs, buildBarriers, buildStartLine, buildBoostPads, buildRamps } from '../build/road.js';
import { scatter, makeInstanced } from '../build/scatter.js';
import * as P from '../build/props.js';
import { findOpenSpot, makeInsideTest, makeBlob, buildWater, buildBackdrop, buildGrandstand, buildFlags, buildBoards, buildChevrons, buildTunnel, makeFarMesh } from './common.js';

export async function build(ctx) {
  const { path, style, density, layout } = ctx;
  const noise = createNoise2D(303);
  const noiseB = createNoise2D(404);
  const rng = createRng(88);
  const L = path.length;
  const ref = (r) => path.cpToDistance(layout.refToCp(r));

  // ---- textures & materials ------------------------------------------------------
  const asphalt = makeAsphalt(style.asphalt, { anisotropy: ctx.anisotropy, seed: 17 });
  const sand = makeGround('sand', { anisotropy: ctx.anisotropy, seed: 23 });
  const rockTex = makeRock({ anisotropy: ctx.anisotropy, tint: [150, 112, 86], seed: 31 });
  const strata = makeStrata(['#b4562f', '#c4663a', '#cf7845', '#d98d55', '#e0a468', '#a84a2c', '#c26a3e', '#d48a5a', '#9a4428', '#dba070']);
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt.map, normalMap: asphalt.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.9 });
  const groundMat = createTerrainMaterial({ map: sand.map, normalMap: sand.normalMap, rockMap: rockTex.map, strata, rockStart: 0.26, rockEnd: 0.56, strataScale: 0.028 });
  await ctx.yield(0.14);

  // ---- canyon / tunnel ranges ----------------------------------------------------------
  const tunnelD0 = ref('tunnel+16');
  const tunnelD1 = ref('tunnel+104');
  const canyonRanges = [
    [ref('t1@0.6'), ref('kink@1'), 30],
    [ref('t4@0.4'), ref('chiB@0.9'), 31],
    [ref('t3@0.2'), ref('t3@0.9'), 16],
  ];
  const canyonAt = (d) => {
    let h = 0;
    for (const [a, b, H] of canyonRanges) {
      let x = d;
      if (b < a && x < a) x += L;
      const bb = b < a ? b + L : b;
      const t = smoothstep(a - 30, a + 10, x) * (1 - smoothstep(bb - 10, bb + 30, x));
      h = Math.max(h, t * H);
    }
    return h;
  };
  const inTunnel = (d) => d >= tunnelD0 - 2 && d <= tunnelD1 + 2;
  // coarse canyon-height field: plateau beside the canyon sections, sloping away outward
  const canyonField = (() => {
    const b = path.bounds;
    const cell = 8;
    const x0 = b.minX - 180;
    const z0 = b.minZ - 180;
    const nx = Math.ceil((b.maxX - b.minX + 360) / cell) + 1;
    const nz = Math.ceil((b.maxZ - b.minZ + 360) / cell) + 1;
    const f = new Float32Array(nx * nz);
    const tmp = {};
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const l = path.locate(x0 + i * cell, z0 + j * cell, 190, tmp);
        if (!l) continue;
        const H = canyonAt(l.distance);
        if (H <= 0) continue;
        const beyond = l.absLateral - l.extent;
        f[j * nx + i] = H * (1 - smoothstep(50, 125, beyond));
      }
    }
    return (x, z) => {
      const fx = clamp((x - x0) / cell, 0, nx - 1.001);
      const fz = clamp((z - z0) / cell, 0, nz - 1.001);
      const i = Math.floor(fx);
      const j = Math.floor(fz);
      const u = fx - i;
      const v = fz - j;
      const a = f[j * nx + i];
      const b2 = f[j * nx + i + 1];
      const c2 = f[(j + 1) * nx + i];
      const d = f[(j + 1) * nx + i + 1];
      return a + (b2 - a) * u + (c2 - a) * v + (a - b2 - c2 + d) * u * v;
    };
  })();

  // ---- oasis -----------------------------------------------------------------------------
  const inside = makeInsideTest(ctx);
  const oasisSpot = findOpenSpot(ctx, { minClear: 26, maxClear: 46, prefer: (x, z) => (inside(x, z) ? 30 : 0) - Math.hypot(x - path.px[0], z - path.pz[0]) * 0.05 });
  const oasis = oasisSpot ? makeBlob(oasisSpot.x, oasisSpot.z, Math.min(26, oasisSpot.clear - 10), 4) : null;
  if (oasis) ctx.avoidZones.push({ x: oasis.x, z: oasis.z, r: oasis.r * 1.2 });

  // ---- ground colour ----------------------------------------------------------------------
  const c = new THREE.Color();
  const t2 = new THREE.Color();
  const groundColor = (x, z, out, edge = 0) => {
    const n1 = noise.fbm(x / 110, z / 110, 3);
    const n2 = noiseB.fbm(x / 26, z / 26, 2);
    c.setRGB(1, 1, 1);
    t2.setRGB(1.08, 0.86, 0.7); // reddish sand
    c.lerp(t2, smoothstep(-0.1, 0.45, n1) * 0.7);
    t2.setRGB(1.06, 1.04, 0.95); // pale dune crests
    c.lerp(t2, smoothstep(0.0, -0.4, n1) * 0.5);
    c.multiplyScalar(0.93 + n2 * 0.14);
    if (edge > 0) {
      t2.setRGB(0.86, 0.78, 0.7);
      c.lerp(t2, 0.3 * edge);
    }
    out[0] = c.r;
    out[1] = c.g;
    out[2] = c.b;
    return out;
  };
  ctx.groundColor = groundColor;

  // ---- terrain ------------------------------------------------------------------------------
  const cx = (path.bounds.minX + path.bounds.maxX) / 2;
  const cz = (path.bounds.minZ + path.bounds.maxZ) / 2;
  let oasisLevel = 0;
  const natural = (x, z, base, loc) => {
    const dc = Math.hypot(x - cx, z - cz);
    const far = smoothstep(220, 600, dc);
    // dunes
    let h = base - 0.6;
    h += noise.fbm(x / 150, z / 150, 3) * 5;
    const ridge = 1 - Math.abs(noiseB(x / 55 + z / 160, z / 70));
    h += ridge * ridge * 3.2 * (0.4 + far);
    // terraced mesas
    const m = noise.fbm(x / 330 + 7.3, z / 330 - 2.1, 4) * 0.5 + 0.5;
    const mt = smoothstep(0.56, 0.6, m) * 34 + smoothstep(0.68, 0.71, m) * 22 + smoothstep(0.78, 0.8, m) * 18;
    h += mt * (0.35 + 0.65 * smoothstep(120, 260, dc + (loc ? 0 : 200)));
    // canyon walls / plateaus beside chosen sections
    const H = canyonField(x, z);
    if (H > 0.05) {
      const rough = noiseB.fbm(x / 14, z / 14, 3) * 0.1 + noise.fbm(x / 40, z / 40, 2) * 0.08;
      const step = smoothstep(0.35, 0.45, noise.fbm(x / 70 + 3, z / 70, 2) * 0.5 + 0.5) * 7;
      h = Math.max(h, base + H * (1 + rough) + (H > 20 ? step : 0));
    }
    if (oasis) {
      const r = oasis.rel(x, z);
      if (r < 1.5) {
        const bank = smoothstep(1.0, 1.5, r);
        const target = r < 1 ? oasisLevel - 2.5 * (1 - smoothstep(0.5, 1, r)) - 0.3 : oasisLevel + 0.35;
        h = target + (h - target) * bank;
      }
    }
    return h;
  };
  const terrain = await buildTerrain(ctx, {
    material: groundMat,
    margin: 520,
    fine: ctx.quality === 'low' ? 5 : ctx.quality === 'medium' ? 4 : 3,
    coarse: 18,
    blend: 14,
    castShadow: true,
    onBase: (base) => {
      if (oasis) oasisLevel = base(oasis.x, oasis.z) - 1.0;
    },
    natural,
    color: (x, z, h, ny, near, out) => {
      groundColor(x, z, out, 0);
      if (oasis) {
        const r = oasis.rel(x, z);
        if (r < 1.6) {
          // green oasis grass around the water
          const g = smoothstep(1.6, 1.15, r);
          out[0] += (0.55 - out[0]) * g;
          out[1] += (0.95 - out[1]) * g;
          out[2] += (0.45 - out[2]) * g;
        }
      }
    },
  });
  ctx.heightAt = terrain.heightAt;
  await ctx.yield(0.4);

  // ---- road ------------------------------------------------------------------------------------
  buildRoadMesh(ctx, roadMat, { texLen: path.hw[0] * 2 });
  buildOffroad(ctx, groundMat);
  ctx.noCurb = inTunnel;
  buildCurbs(ctx, { colors: style.curb });
  const orange = new THREE.Color(0xe2622b);
  const cream = new THREE.Color(0xf6efe2);
  const stone = new THREE.Color(0xc98d5a);
  const wallMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  buildBarriers(ctx, {
    material: wallMat,
    skip: inTunnel,
    profile: [
      [0, 0],
      [0, 0.95],
      [0.1, 1.06],
      [0.7, 1.06],
      [0.8, 0.95],
      [0.8, 0],
    ],
    colorFn: (d, ei) => (ei === 2 ? stone : ei === 0 ? (Math.floor(d / 4) % 2 ? cream : orange) : stone),
  });
  buildStartLine(ctx, { frameColor: 0xf3e6cf, accent: 0xe2622b });
  buildBoostPads(ctx);
  buildRamps(ctx, { topColors: { a: '#ffcf1f', b: '#2a2018' }, sideColor: 0x5a4632 });
  await ctx.yield(0.5);

  // ---- tunnel through the mesa -----------------------------------------------------------------
  const tunnel = buildTunnel(ctx, tunnelD0, tunnelD1, { wallH: 4.5, archH: 9, topH: 25, outer: 17, material: groundMat });
  {
    // warm lamps along the tunnel walls + light strip on the ceiling
    const lamps = [];
    for (let d = tunnelD0 + 6; d < tunnelD1 - 3; d += 10) {
      for (const side of [-1, 1]) {
        const f = path.frameAt(d, side * (tunnel.wall - 0.25));
        lamps.push({ x: f.position.x, y: f.position.y + 3.6, z: f.position.z, ry: Math.atan2(f.tangent.x, f.tangent.z) });
      }
    }
    const lampGeo = new THREE.BoxGeometry(0.5, 0.5, 1.6);
    makeInstanced(ctx, lampGeo, new THREE.MeshBasicMaterial({ color: 0xffc46a }), lamps, { castShadow: false, name: 'TunnelLamps' });
    // wooden portal frames
    const beam = new P.PartsBuilder();
    const w = tunnel.wall;
    for (const sx of [-1, 1]) beam.add(new THREE.BoxGeometry(1.2, 6, 1.2), 0x7a5232, { p: [sx * (w - 0.6), 3, 0] });
    beam.add(new THREE.BoxGeometry(w * 2, 1.0, 1.3), 0x6a4528, { p: [0, 4.9, 0] });
    const beamGeo = beam.build();
    for (const [d, yaw] of [
      [tunnelD0 - 0.4, 0],
      [tunnelD1 + 0.4, Math.PI],
    ]) {
      const m = new THREE.Mesh(beamGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
      ctx.placeOnTrack(m, d, 0, 0, { yaw });
      m.castShadow = true;
      ctx.root.add(m);
    }
  }
  await ctx.yield(0.56);

  // ---- rock arch over the canyon straight ----------------------------------------------------------
  {
    const d = ref('canyon@0.55');
    const k = Math.floor(d / path.spacing) % path.count;
    const span = (path.wall[k] + 9) * 2;
    const arch = new THREE.Mesh(P.rockArch(span, 24, 5), groundMat);
    // the arch uses the terrain material (strata on steep faces); add uv attribute
    const g = arch.geometry;
    const pos = g.attributes.position;
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(pos.count * 2), 2));
    ctx.placeOnTrack(arch, d, 0, -1.0);
    arch.rotateY(Math.PI / 2);
    arch.rotateY(-Math.PI / 2);
    // arch is built in local XY (span along X = left/right of the road)
    arch.castShadow = true;
    arch.receiveShadow = true;
    ctx.root.add(arch);
  }

  // ---- oasis -----------------------------------------------------------------------------------------
  const vegMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  if (oasis) {
    buildWater(ctx, oasis, oasisLevel, { deep: 0x0d5a72, shallow: 0x37c0b5 });
    const palms = [];
    for (let i = 0; i < 16; i++) {
      const a = rng() * Math.PI * 2;
      const r = oasis.radiusAt(a) * (1.08 + rng() * 0.35);
      const x = oasis.x + Math.cos(a) * r;
      const z = oasis.z + Math.sin(a) * r;
      palms.push({ x, y: terrain.heightAt(x, z) - 0.2, z, ry: rng() * 6.28, s: 0.9 + rng() * 0.4 });
    }
    makeInstanced(ctx, P.palmTree(3), vegMat, palms.filter((_, i) => i % 2 === 0), { name: 'Palms1' });
    makeInstanced(ctx, P.palmTree(8), vegMat, palms.filter((_, i) => i % 2 === 1), { name: 'Palms2' });
  }
  // palms along the start straight
  {
    const items = [];
    for (let d = -60; d <= 80; d += 16) {
      for (const side of [-1, 1]) {
        const k = Math.floor(path.wrapDistance(d) / path.spacing) % path.count;
        const f = path.frameAt(d, side * (path.wall[k] + 4.5));
        items.push({ x: f.position.x, y: terrain.heightAt(f.position.x, f.position.z) - 0.2, z: f.position.z, ry: rng() * 6, s: 0.95 + rng() * 0.2 });
      }
    }
    makeInstanced(ctx, P.palmTree(5), vegMat, items, { name: 'PalmsStart' });
  }

  // ---- desert vegetation ----------------------------------------------------------------------------
  const sag = scatter(ctx, { count: Math.round(260 * density), spacing: 10, minClear: 4, maxDist: 260, tries: 9000, maxSlope: 0.35 });
  makeInstanced(ctx, P.saguaro(2), vegMat, sag.filter((_, i) => i % 2 === 0).map((p) => ({ x: p.x, y: p.y - 0.2, z: p.z, ry: rng() * 6, s: 0.8 + rng() * 0.5 })), { name: 'Saguaro1' });
  makeInstanced(ctx, P.saguaro(9), vegMat, sag.filter((_, i) => i % 2 === 1).map((p) => ({ x: p.x, y: p.y - 0.2, z: p.z, ry: rng() * 6, s: 0.8 + rng() * 0.5 })), { name: 'Saguaro2' });
  const barrels = scatter(ctx, { count: Math.round(220 * density), spacing: 4, minClear: 1.5, nearTrack: 40, tries: 6000, maxSlope: 0.4 });
  makeInstanced(ctx, P.barrelCactus(1), vegMat, barrels.map((p) => ({ x: p.x, y: p.y - 0.1, z: p.z, ry: rng() * 6, s: 0.7 + rng() * 0.6 })), { name: 'Barrels' });
  const shrubs = scatter(ctx, { count: Math.round(420 * density), spacing: 5, minClear: 1, maxDist: 220, tries: 8000 });
  makeInstanced(ctx, P.deadShrub(4), vegMat, shrubs.map((p) => ({ x: p.x, y: p.y - 0.05, z: p.z, ry: rng() * 6, s: 0.8 + rng() * 0.9 })), { name: 'Shrubs', castShadow: false });
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 });
  const rocks = scatter(ctx, { count: Math.round(160 * density), spacing: 8, minClear: 2, maxDist: 240, tries: 6000 });
  makeInstanced(ctx, P.rock(7, { colors: [0x8a4a2e, 0xd08a58] }), rockMat, rocks.map((p) => ({ x: p.x, y: p.y - 0.3, z: p.z, ry: rng() * 6, s: 0.8 + rng() * 2.2, sy: 0.5 + rng() * 0.9 })), { name: 'Rocks' });
  // obstacles defined by the layout (in the sand off-road)
  {
    const cact = path.obstacles.filter((o) => o.kind === 'cactus').map((o) => ({ x: o.position.x, y: o.position.y - 0.2, z: o.position.z, ry: rng() * 6, s: 0.85 }));
    const rk = path.obstacles.filter((o) => o.kind === 'rock').map((o) => ({ x: o.position.x, y: o.position.y - 0.4, z: o.position.z, ry: rng() * 6, s: o.radius * 1.05, sy: 1.1 }));
    makeInstanced(ctx, P.saguaro(5), vegMat, cact, { name: 'ObstacleCacti' });
    makeInstanced(ctx, P.rock(11, { colors: [0x8a4a2e, 0xd08a58] }), rockMat, rk, { name: 'ObstacleRocks' });
  }
  await ctx.yield(0.7);

  // ---- tumbleweeds (rolling across the open sand) ------------------------------------------------
  {
    const n = Math.round(8 * density) + 2;
    const tw = new THREE.InstancedMesh(P.tumbleweed(2), vegMat, n);
    tw.castShadow = true;
    tw.frustumCulled = false;
    const weeds = [];
    const spots = scatter(ctx, { count: n, spacing: 40, minClear: 25, maxDist: 160, tries: 2000 });
    for (let i = 0; i < n; i++) {
      const s = spots[i % Math.max(1, spots.length)] || { x: cx, z: cz };
      const a = rng() * Math.PI * 2;
      weeds.push({ x: s.x, z: s.z, dx: Math.cos(a), dz: Math.sin(a), ph: rng() * 100, speed: 2 + rng() * 2 });
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const update = (time) => {
      weeds.forEach((w, i) => {
        const t = ((time * w.speed + w.ph) % 60) - 30;
        const x = w.x + w.dx * t;
        const z = w.z + w.dz * t;
        const hop = Math.abs(Math.sin(time * 3 + w.ph)) * 0.6;
        v.set(x, terrain.heightAt(x, z) + 0.55 + hop, z);
        e.set(time * 2 * w.dz, 0, -time * 2 * w.dx);
        q.setFromEuler(e);
        m.compose(v, q, one);
        tw.setMatrixAt(i, m);
      });
      tw.instanceMatrix.needsUpdate = true;
    };
    update(0);
    ctx.root.add(tw);
    ctx.animators.push((dt, time) => update(time));
  }

  // ---- grandstand, flags, boards, chevrons --------------------------------------------------------
  buildGrandstand(ctx, { d0: 12, d1: 62, side: -1, gap: 7, seed: 5, roofColor: 0xe2622b, frameColor: 0xf3e6cf });
  {
    const flags = [];
    const cols = [0xe2622b, 0xffd23f, 0x2b9bd8, 0xffffff];
    for (let d = -50; d < 70; d += 14) {
      for (const side of [-1, 1]) {
        const k = Math.floor(path.wrapDistance(d) / path.spacing) % path.count;
        const f = path.frameAt(d, side * (path.wall[k] + 1.6));
        flags.push({ x: f.position.x, y: f.position.y, z: f.position.z, ry: Math.atan2(f.tangent.x, f.tangent.z) + Math.PI / 2, color: cols[(Math.floor(d / 14) + 40 + (side > 0 ? 2 : 0)) % cols.length] });
      }
    }
    buildFlags(ctx, flags, { poleH: 7.5 });
  }
  buildBoards(ctx, [
    { text: 'DUNE DRIFT', bg: '#e2622b', bg2: '#b8441a' },
    { text: 'SANDSTORM', bg: '#2b9bd8', bg2: '#1a6ea0' },
    { text: 'TURBOKART', bg: '#d81e2b', bg2: '#a3121d' },
    { text: 'BIG AIR!', bg: '#ffd23f', bg2: '#f0a800', fg: '#2a1a0a', stroke: '#fff' },
    { text: 'CACTUS COLA', bg: '#2fae4a', bg2: '#1d7a31' },
  ], { every: 60 });
  buildChevrons(ctx, { minCurv: 1 / 50 });
  // "JUMP" warning sign before the ramp
  for (const rp of path.ramps) {
    const items = [];
    for (const side of [-1, 1]) {
      const k = Math.floor(path.wrapDistance(rp.startDistance - 25) / path.spacing) % path.count;
      const f = path.frameAt(rp.startDistance - 25, side * (path.wall[k] + 0.6));
      items.push({ x: f.position.x, y: f.position.y, z: f.position.z, ry: Math.atan2(f.tangent.x, f.tangent.z) + Math.PI, color: 0xffd23f });
    }
    buildFlags(ctx, items, { poleH: 5, w: 3, h: 1.8 });
  }
  await ctx.yield(0.8);

  // ---- horizon: pyramids + mesa ring -----------------------------------------------------------------
  {
    const bspan = Math.max(path.bounds.maxX - path.bounds.minX, path.bounds.maxZ - path.bounds.minZ);
    const R = bspan / 2 + 700;
    const dir = Math.atan2(path.pz[0] - cz, path.px[0] - cx) + 0.9;
    const pyrs = [
      [0, 140, 95],
      [0.16, 100, 70],
      [-0.13, 80, 55],
    ];
    for (const [da, w, h] of pyrs) {
      const g = P.pyramid(w, h, 14);
      const m = makeFarMesh(ctx, g, { haze: 0.42 });
      const a = dir + da;
      const r = R + w;
      m.position.set(cx + Math.cos(a) * r, -6, cz + Math.sin(a) * r);
      m.rotation.y = a + 0.4;
    }
    buildBackdrop(ctx, { radius: bspan / 2 + 1100, height: 160, base: -20, colorLow: 0xb0603a, colorHigh: 0xe0a070, haze: 0.42, shape: 'mesa', seed: 12, segments: 300 });
    buildBackdrop(ctx, { radius: bspan / 2 + 1500, height: 260, base: -30, colorLow: 0xb57a5e, colorHigh: 0xd8a888, haze: 0.62, shape: 'peaks', seed: 13 });
  }
  await ctx.yield(0.95);
}
