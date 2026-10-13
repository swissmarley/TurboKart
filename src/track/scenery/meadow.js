/**
 * Sunny Meadows: rolling green hills, flower fields, varied trees, a lake,
 * windmills, hot-air balloons, grandstands, banners.
 */
import * as THREE from 'three';
import { createNoise2D, createRng, smoothstep, clamp } from '../util.js';
import { makeAsphalt, makeGround, makeRock } from '../build/textures.js';
import { buildTerrain, createTerrainMaterial } from '../build/terrain.js';
import { buildRoadMesh, buildOffroad, buildCurbs, buildBarriers, buildStartLine, buildBoostPads, buildRamps } from '../build/road.js';
import { scatter, makeInstanced } from '../build/scatter.js';
import * as P from '../build/props.js';
import { findOpenSpot, makeInsideTest, makeBlob, buildWater, buildBackdrop, buildGrandstand, buildFlags, buildBoards, buildChevrons } from './common.js';

export async function build(ctx) {
  const { path, style, density } = ctx;
  const noise = createNoise2D(101);
  const noiseB = createNoise2D(202);
  const rng = createRng(77);

  // ---- textures & materials ---------------------------------------------------
  const asphalt = makeAsphalt(style.asphalt, { anisotropy: ctx.anisotropy });
  const grass = makeGround('grass', { anisotropy: ctx.anisotropy });
  const rockTex = makeRock({ anisotropy: ctx.anisotropy, tint: [120, 118, 112] });
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt.map, normalMap: asphalt.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.88, metalness: 0 });
  const groundMat = createTerrainMaterial({ map: grass.map, normalMap: grass.normalMap, rockMap: rockTex.map, rockTint: 0xb9b4a8, rockStart: 0.42, rockEnd: 0.62 });
  await ctx.yield(0.14);

  // ---- lake location ---------------------------------------------------------------
  const inside = makeInsideTest(ctx);
  const spot = findOpenSpot(ctx, { minClear: 34, maxClear: 70, prefer: (x, z) => (inside(x, z) ? 40 : 0) });
  const lake = spot ? makeBlob(spot.x, spot.z, Math.min(62, spot.clear - 12), 9) : null;
  if (lake) ctx.avoidZones.push({ x: lake.x, z: lake.z, r: lake.r * 1.35 });

  // ---- ground colour (shared by terrain + off-road strip so they blend) -------
  const cA = new THREE.Color(0xffffff);
  const tmp = new THREE.Color();
  const FIELD_TINTS = [
    new THREE.Color(1.3, 1.12, 0.45), // wheat
    null,
    new THREE.Color(0.7, 0.95, 0.55), // dark crop
    new THREE.Color(1.15, 1.2, 0.7), // light meadow
    null,
    new THREE.Color(1.05, 0.82, 0.6), // ploughed
    new THREE.Color(1.25, 1.0, 1.05), // lavender-ish clover
    null,
  ];
  const flowerTints = [new THREE.Color(1.15, 1.05, 0.55), new THREE.Color(1.2, 0.9, 1.05), new THREE.Color(1.15, 1.15, 1.15)];
  const groundColor = (x, z, out, edge = 0, near = -1) => {
    const n1 = noise.fbm(x / 90, z / 90, 3);
    const n2 = noiseB.fbm(x / 23, z / 23, 2);
    // base: lush green variations (multiplies the grass texture)
    cA.setRGB(1, 1, 1);
    const dry = smoothstep(0.1, 0.55, n1);
    tmp.setRGB(1.22, 1.12, 0.6); // dry yellowish meadow
    cA.lerp(tmp, dry * 0.6);
    const lush = smoothstep(-0.05, -0.5, n1);
    tmp.setRGB(0.62, 0.9, 0.62);
    cA.lerp(tmp, lush * 0.7);
    cA.multiplyScalar(0.9 + n2 * 0.2);
    // patchwork farm fields further out
    const fieldAmt = smoothstep(45, 90, near);
    if (fieldAmt > 0) {
      const a = 0.5;
      const u = (x * Math.cos(a) + z * Math.sin(a)) / 85 + noise(x / 300, z / 300) * 0.6;
      const v = (-x * Math.sin(a) + z * Math.cos(a)) / 65 + noiseB(x / 280, z / 280) * 0.6;
      const id = (Math.floor(u) * 73 + Math.floor(v) * 151) & 7;
      const fc = FIELD_TINTS[id];
      if (fc) cA.lerp(fc, fieldAmt * 0.75);
    }
    // mown stripes close to the circuit
    const stripeAmt = 1 - smoothstep(18, 42, near);
    if (stripeAmt > 0) {
      const st = Math.sin(((x * 0.8 + z * 0.6) / 7) * Math.PI) > 0 ? 1.1 : 0.86;
      cA.multiplyScalar(1 + (st - 1) * stripeAmt);
    }
    // flower meadow tint patches
    const fp = noiseB.fbm(x / 60 + 40, z / 60 - 17, 3);
    if (fp > 0.32) cA.lerp(flowerTints[Math.floor((fp * 97) % 3)], smoothstep(0.32, 0.5, fp) * 0.35);
    // worn grass near the road edge
    if (edge > 0) {
      tmp.setRGB(0.95, 0.85, 0.62);
      cA.lerp(tmp, 0.35 * edge);
    }
    out[0] = cA.r;
    out[1] = cA.g;
    out[2] = cA.b;
    return out;
  };
  ctx.groundColor = groundColor;

  // ---- terrain --------------------------------------------------------------------
  const cx = (path.bounds.minX + path.bounds.maxX) / 2;
  const cz = (path.bounds.minZ + path.bounds.maxZ) / 2;
  let waterLevel = 0;
  const natural = (x, z, base) => {
    const dc = Math.hypot(x - cx, z - cz);
    const far = smoothstep(250, 700, dc);
    let h = base - 0.5;
    h += noise.fbm(x / 210, z / 210, 4) * (9 + far * 34);
    h += noise.ridged(x / 520 + 3, z / 520, 3) * far * 70;
    h += noiseB.fbm(x / 45, z / 45, 2) * 1.2;
    if (lake) {
      const r = lake.rel(x, z);
      if (r < 1.45) {
        const bank = smoothstep(1.0, 1.45, r);
        const bed = waterLevel - 3.5 * (1 - smoothstep(0.55, 1.0, r)) - 0.35;
        const shore = waterLevel + 0.4;
        const target = r < 1 ? bed : shore;
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
    blend: 26,
    onBase: (base) => {
      if (lake) waterLevel = base(lake.x, lake.z) - 1.2;
    },
    natural,
    color: (x, z, h, ny, near, out) => {
      groundColor(x, z, out, 0, near);
      // darker in valleys, lighter on crests
      const k = 0.94 + clamp(ny, 0, 1) * 0.08;
      out[0] *= k;
      out[1] *= k;
      out[2] *= k;
      if (lake) {
        const r = lake.rel(x, z);
        if (r < 1.12) {
          // sandy shoreline
          const s = smoothstep(1.12, 0.98, r);
          out[0] += (1.25 - out[0]) * s;
          out[1] += (1.05 - out[1]) * s;
          out[2] += (0.7 - out[2]) * s;
        }
      }
    },
  });
  ctx.heightAt = terrain.heightAt;
  ctx.terrain = terrain;
  await ctx.yield(0.4);

  // ---- road --------------------------------------------------------------------------
  buildRoadMesh(ctx, roadMat, { texLen: path.hw[0] * 2 });
  buildOffroad(ctx, groundMat);
  buildCurbs(ctx, { colors: style.curb });
  const wallRed = new THREE.Color(0xd42a2a);
  const wallWhite = new THREE.Color(0xf4f2ec);
  const wallTop = new THREE.Color(0x2f9a3a);
  const wallMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });
  buildBarriers(ctx, {
    material: wallMat,
    profile: [
      [0, 0],
      [0, 0.85],
      [0.12, 1.0],
      [0.5, 1.0],
      [0.62, 0.85],
      [0.62, 0],
    ],
    colorFn: (d, ei) => (ei === 2 ? wallTop : Math.floor(d / 4) % 2 ? wallWhite : wallRed),
  });
  buildStartLine(ctx, { frameColor: 0xf2f2f6, accent: 0xd8272a });
  buildBoostPads(ctx);
  buildRamps(ctx, {});
  await ctx.yield(0.5);

  // ---- lake ---------------------------------------------------------------------------
  if (lake) {
    buildWater(ctx, lake, waterLevel, { deep: 0x0b4f78, shallow: 0x2aa6b8 });
    // lily pads
    const pads = [];
    for (let i = 0; i < 40 * density; i++) {
      const a = rng() * Math.PI * 2;
      const r = (0.55 + rng() * 0.38) * lake.radiusAt(a);
      pads.push({ x: lake.x + Math.cos(a) * r, y: waterLevel + 0.04, z: lake.z + Math.sin(a) * r, ry: rng() * 6, s: 0.6 + rng() * 0.8 });
    }
    const padGeo = new P.PartsBuilder().add(new THREE.CylinderGeometry(0.9, 0.9, 0.05, 10, 1, false, 0.3, Math.PI * 1.85), 0x3f9a3a).add(new THREE.SphereGeometry(0.16, 6, 4), 0xff8fc8, { p: [0.2, 0.1, 0.1] }).build();
    makeInstanced(ctx, padGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), pads, { castShadow: false, name: 'LilyPads' });
    // little wooden dock
    const a = Math.atan2(cz - lake.z, cx - lake.x);
    const R = lake.radiusAt(a);
    const dock = new P.PartsBuilder();
    for (let i = 0; i < 6; i++) dock.add(new THREE.BoxGeometry(2.4, 0.18, 1.0), i % 2 ? 0xa0703f : 0x8a5f34, { p: [0, 0.6, i * 1.05] });
    for (const px of [-1.1, 1.1]) for (let i = 0; i < 3; i++) dock.add(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 6), 0x5a3a22, { p: [px, -0.2, i * 2.4] });
    const dockMesh = new THREE.Mesh(dock.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
    dockMesh.position.set(lake.x + Math.cos(a) * (R - 3), waterLevel, lake.z + Math.sin(a) * (R - 3));
    dockMesh.rotation.y = -a - Math.PI / 2;
    dockMesh.castShadow = true;
    ctx.root.add(dockMesh);
  }
  await ctx.yield(0.55);

  // ---- vegetation -------------------------------------------------------------------
  const vegMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  const forest = (x, z) => noise.fbm(x / 140 + 11, z / 140 - 5, 3);
  const treePts = scatter(ctx, {
    count: Math.round(900 * density),
    spacing: 6.5,
    minClear: 6,
    maxDist: 200,
    tries: 40000,
    accept: (x, z, info, r) => {
      const f = forest(x, z);
      const p = 0.12 + smoothstep(-0.05, 0.35, f) * 0.88;
      return r() < p;
    },
    maxSlope: 0.6,
  });
  const variants = [
    { geo: P.roundTree(1), w: 0.34 },
    { geo: P.roundTree(7, { leaf: [0x3b8a2a, 0xa6d84f] }), w: 0.26 },
    { geo: P.poplarTree(3), w: 0.18 },
    { geo: P.pineTree(5, { leaf: [0x1f5a32, 0x4a9a4c] }), w: 0.22 },
  ];
  const buckets = variants.map(() => []);
  for (const p of treePts) {
    let r = rng();
    let vi = 0;
    for (; vi < variants.length - 1; vi++) {
      if (r < variants[vi].w) break;
      r -= variants[vi].w;
    }
    const s = 0.8 + rng() * 0.55;
    const tint = new THREE.Color().setHSL(0.27 + rng() * 0.06, 0.25 + rng() * 0.2, 0.5 + rng() * 0.1);
    tint.multiplyScalar(1.6);
    buckets[vi].push({ x: p.x, y: p.y - 0.2, z: p.z, ry: rng() * 6.28, s, color: tint });
  }
  variants.forEach((v, i) => makeInstanced(ctx, v.geo, vegMat, buckets[i], { name: `Trees${i}` }));
  // far forests: cheap low-detail trees
  {
    const farPts = scatter(ctx, {
      count: Math.round(1400 * density),
      spacing: 9,
      minClear: 180,
      tries: 30000,
      accept: (x, z, info, r) => r() < smoothstep(-0.15, 0.25, forest(x, z)),
    });
    const farGeo = new P.PartsBuilder()
      .add(new THREE.CylinderGeometry(0.35, 0.5, 3.5, 5), 0x6e4628, { p: [0, 1.75, 0] })
      .add(new THREE.IcosahedronGeometry(2.8, 0), (p, n, out) => P.lerpColor(0x2a6a28, 0x7cc64a, 0.4 + n.y * 0.5, out), { p: [0, 5.2, 0], s: [1, 1.15, 1] })
      .build();
    makeInstanced(ctx, farGeo, vegMat, farPts.map((p) => ({ x: p.x, y: p.y - 0.3, z: p.z, ry: rng() * 6, s: 0.9 + rng() * 0.7, color: new THREE.Color().setHSL(0.26 + rng() * 0.07, 0.3, 0.5).multiplyScalar(1.6) })), { name: 'FarTrees', castShadow: false });
  }
  await ctx.yield(0.65);

  // bushes hugging the barriers
  const bushPts = scatter(ctx, { count: Math.round(260 * density), spacing: 4, minClear: 1.2, nearTrack: 9, tries: 6000 });
  makeInstanced(
    ctx,
    P.bush(2),
    vegMat,
    bushPts.map((p) => ({ x: p.x, y: p.y - 0.1, z: p.z, ry: rng() * 6, s: 0.7 + rng() * 0.7, color: new THREE.Color().setHSL(0.25 + rng() * 0.08, 0.3, 0.55).multiplyScalar(1.7) })),
    { name: 'Bushes' },
  );
  // rocks
  const rockPts = scatter(ctx, { count: Math.round(90 * density), spacing: 10, minClear: 3, tries: 4000 });
  makeInstanced(ctx, P.rock(3), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), rockPts.map((p) => ({ x: p.x, y: p.y - 0.25, z: p.z, ry: rng() * 6, s: 0.6 + rng() * 1.4, sy: 0.5 + rng() * 0.8 })), { name: 'Rocks' });

  // flower clumps in patches
  {
    const flowerGeo = new P.PartsBuilder();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.28;
      const r = i === 0 ? 0 : 0.3;
      flowerGeo.add(new THREE.OctahedronGeometry(0.17, 0), 0xffffff, { p: [Math.cos(a) * r, 0.36 + (i % 2) * 0.1, Math.sin(a) * r] });
    }
    // a single green leaf tuft under the blossoms
    flowerGeo.add(new THREE.ConeGeometry(0.32, 0.4, 5), 0x4f9a35, { p: [0, 0.2, 0] });
    const fg = flowerGeo.build();
    const cols = [0xff4f6a, 0xffd23f, 0xffffff, 0xb36bff, 0xff8a2e, 0x5fb8ff];
    const pts = [];
    const patches = scatter(ctx, { count: Math.round(34 * density) + 6, spacing: 40, minClear: 4, maxDist: 160, tries: 3000 });
    for (const pc of patches) {
      const col = new THREE.Color(cols[Math.floor(rng() * cols.length)]);
      const n = Math.round((70 + rng() * 100) * density);
      const R = 7 + rng() * 12;
      for (let i = 0; i < n; i++) {
        const a = rng() * 6.28;
        const r = Math.sqrt(rng()) * R;
        const x = pc.x + Math.cos(a) * r;
        const z = pc.z + Math.sin(a) * r;
        const l = path.locate(x, z, path.maxExtent + 10, {});
        if (l && l.absLateral < l.extent + 2.5) continue;
        if (lake && lake.rel(x, z) < 1.15) continue;
        pts.push({ x, y: terrain.heightAt(x, z) - 0.05, z, ry: rng() * 6, s: 0.8 + rng() * 0.6, color: col });
      }
    }
    makeInstanced(ctx, fg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }), pts, { castShadow: false, name: 'Flowers' });
  }
  // grass tufts near the road
  {
    const tuft = new P.PartsBuilder();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.28;
      tuft.add(new THREE.ConeGeometry(0.07, 0.75 + (i % 3) * 0.18, 3), (p, n, out) => P.lerpColor(0x3a7a26, 0x9ad04f, p.y * 1.3, out), { p: [Math.cos(a) * 0.15, 0.35, Math.sin(a) * 0.15], r: [Math.sin(a) * 0.35, 0, Math.cos(a) * 0.35] });
    }
    const pts = scatter(ctx, { count: Math.round(2400 * density), spacing: 1.6, minClear: 0.5, nearTrack: 40, tries: 9000 });
    makeInstanced(ctx, tuft.build(), vegMat, pts.map((p) => ({ x: p.x, y: p.y - 0.05, z: p.z, ry: rng() * 6, s: 0.8 + rng() * 0.8 })), { castShadow: false, name: 'Tufts' });
  }
  await ctx.yield(0.72);

  // ---- windmills on the hills ------------------------------------------------------
  {
    const spots = scatter(ctx, {
      count: 5,
      spacing: 120,
      minClear: 30,
      maxDist: 200,
      tries: 4000,
      accept: (x, z) => natural(x, z, ctx.baseHeight(x, z)) - ctx.baseHeight(x, z) > 2.5,
    });
    const towers = [];
    const blades = [];
    for (const s of spots) {
      // face the nearest piece of track
      const l = path.locate(s.x, s.z, 400, {});
      const f = path.frameAt(l ? l.distance : 0, 0);
      const yaw = Math.atan2(f.position.x - s.x, f.position.z - s.z);
      towers.push({ x: s.x, y: s.y - 0.5, z: s.z, ry: yaw, s: 1.15 });
      blades.push({ x: s.x, y: s.y, z: s.z, yaw, phase: rng() * 6, speed: 0.6 + rng() * 0.5 });
    }
    makeInstanced(ctx, P.windmillTower(), vegMat, towers, { name: 'Windmills' });
    const bladeMesh = new THREE.InstancedMesh(P.windmillBlades(), vegMat, Math.max(1, blades.length));
    bladeMesh.count = blades.length;
    bladeMesh.castShadow = true;
    bladeMesh.name = 'WindmillBlades';
    ctx.root.add(bladeMesh);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const q2 = new THREE.Quaternion();
    const sc = new THREE.Vector3(1.15, 1.15, 1.15);
    const pos = new THREE.Vector3();
    const zAxis = new THREE.Vector3(0, 0, 1);
    const yAxis = new THREE.Vector3(0, 1, 0);
    const setBlades = (time) => {
      blades.forEach((b, i) => {
        q.setFromAxisAngle(yAxis, b.yaw);
        q2.setFromAxisAngle(zAxis, b.phase + time * b.speed);
        q.multiply(q2);
        // hub position: tower local (0, 13.6, 3.9) * scale
        pos.set(0, 13.6 * 1.15 - 0.5, 3.9 * 1.15).applyAxisAngle(yAxis, b.yaw);
        pos.x += b.x;
        pos.y += b.y;
        pos.z += b.z;
        m.compose(pos, q, sc);
        bladeMesh.setMatrixAt(i, m);
      });
      bladeMesh.instanceMatrix.needsUpdate = true;
    };
    setBlades(0);
    bladeMesh.computeBoundingSphere();
    bladeMesh.frustumCulled = false;
    ctx.animators.push((dt, time) => setBlades(time));
  }

  // ---- farm --------------------------------------------------------------------------
  {
    const farm = findOpenSpot(ctx, { minClear: 45, maxClear: 120, avoid: lake ? [{ x: lake.x, z: lake.z, r: lake.r * 1.5 }] : [] });
    if (farm) {
      const fy = terrain.heightAt(farm.x, farm.z);
      const l = path.locate(farm.x, farm.z, 400, {});
      const f = path.frameAt(l ? l.distance : 0, 0);
      const yaw = Math.atan2(f.position.x - farm.x, f.position.z - farm.z);
      makeInstanced(ctx, P.barn(), vegMat, [{ x: farm.x, y: fy - 0.3, z: farm.z, ry: yaw }], { name: 'Barn' });
      const sx = farm.x + Math.cos(yaw) * 11;
      const sz = farm.z - Math.sin(yaw) * 11;
      makeInstanced(ctx, P.silo(), vegMat, [{ x: sx, y: terrain.heightAt(sx, sz) - 0.3, z: sz }], { name: 'Silo' });
      ctx.avoidZones.push({ x: farm.x, z: farm.z, r: 22 });
      const bales = [];
      for (let i = 0; i < 9; i++) {
        const a = rng() * 6.28;
        const r = 16 + rng() * 16;
        const x = farm.x + Math.cos(a) * r;
        const z = farm.z + Math.sin(a) * r;
        bales.push({ x, y: terrain.heightAt(x, z) - 0.05, z, ry: rng() * 6 });
      }
      makeInstanced(ctx, P.hayBale(), vegMat, bales, { name: 'HayBales' });
    }
  }

  // ---- hot-air balloons ---------------------------------------------------------------
  {
    const pairs = [
      [0xff4b4b, 0xffd23f],
      [0x3fa7ff, 0xffffff],
      [0x7c4dff, 0xff7ad9],
      [0x2fd07a, 0xfff36b],
      [0xff8a2e, 0x2b6bff],
      [0xff3fa0, 0x3ff0ff],
    ];
    const n = Math.max(3, Math.round(6 * density));
    const b = path.bounds;
    for (let i = 0; i < n; i++) {
      const geo = P.balloon(i, pairs[i % pairs.length]);
      const mesh = new THREE.Mesh(geo, vegMat);
      mesh.castShadow = true;
      const ang = (i / n) * Math.PI * 2 + rng();
      const rad = Math.max(b.maxX - b.minX, b.maxZ - b.minZ) * (0.45 + rng() * 0.35);
      const bx = cx + Math.cos(ang) * rad;
      const bz = cz + Math.sin(ang) * rad;
      const by = 55 + rng() * 60;
      const ph = rng() * 6;
      const s = 1.2 + rng() * 0.5;
      mesh.scale.setScalar(s);
      ctx.root.add(mesh);
      ctx.animators.push((dt, time) => {
        mesh.position.set(bx + Math.sin(time * 0.03 + ph) * 25, by + Math.sin(time * 0.4 + ph) * 2.5, bz + Math.cos(time * 0.025 + ph) * 25);
        mesh.rotation.y = time * 0.05 + ph;
      });
      mesh.position.set(bx, by, bz);
    }
  }
  await ctx.yield(0.8);

  // ---- grandstands, flags, boards --------------------------------------------------------
  buildGrandstand(ctx, { d0: 18, d1: 78, side: -1, gap: 5, seed: 1, roofColor: 0xd8272a });
  buildGrandstand(ctx, { d0: path.length - 70, d1: path.length - 25, side: 1, gap: 5, seed: 2, roofColor: 0x2b6bff, tiers: 5 });
  {
    const flags = [];
    const cols = [0xff3b3b, 0xffd23f, 0x3fa7ff, 0x2fd07a, 0xffffff, 0xff7ad9];
    for (let d = -90; d < 110; d += 12) {
      for (const side of [-1, 1]) {
        const k = Math.floor(path.wrapDistance(d) / path.spacing) % path.count;
        const lat = side * (path.wall[k] + 1.6);
        const f = path.frameAt(d, lat);
        flags.push({ x: f.position.x, y: f.position.y, z: f.position.z, ry: Math.atan2(f.tangent.x, f.tangent.z) + Math.PI / 2, color: cols[(Math.floor(d / 12) + (side > 0 ? 3 : 0) + 60) % cols.length] });
      }
    }
    buildFlags(ctx, flags, { poleH: 7.5 });
  }
  buildBoards(ctx, [
    { text: 'TURBOKART', bg: '#d81e2b', bg2: '#a3121d' },
    { text: 'SUNNY CUP', bg: '#2b6bff', bg2: '#1a46b8' },
    { text: 'GO GO GO!', bg: '#ffd23f', bg2: '#f0a800', fg: '#1a1a2a', stroke: '#fff' },
    { text: 'MEADOW FM', bg: '#2fae4a', bg2: '#1d7a31' },
    { text: 'DRIFT!', bg: '#7c4dff', bg2: '#4a22c8' },
  ], { every: 55 });
  buildChevrons(ctx, { minCurv: 1 / 48 });
  // tyre stacks on the outside of the hairpin
  {
    const items = [];
    for (let k = 0; k < path.count; k += 3) {
      if (Math.abs(path.curvature[k]) < 1 / 30) continue;
      const side = path.curvature[k] > 0 ? -1 : 1;
      const f = path.frameAt(k * path.spacing, side * (path.wall[k] + 1.5));
      items.push({ x: f.position.x, y: f.position.y, z: f.position.z, ry: rng() * 6 });
    }
    // gameplay obstacles from the layout (tyre walls inside the off-road)
    for (const o of path.obstacles) {
      if (o.kind !== 'tyres') continue;
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        items.push({ x: o.position.x + Math.cos(a) * o.radius * 0.45, y: o.position.y, z: o.position.z + Math.sin(a) * o.radius * 0.45, ry: rng() * 6 });
      }
    }
    makeInstanced(ctx, P.tireStack(3), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), items, { name: 'Tyres' });
  }

  // ---- distant hills ----------------------------------------------------------------------
  const bspan = Math.max(path.bounds.maxX - path.bounds.minX, path.bounds.maxZ - path.bounds.minZ);
  buildBackdrop(ctx, { radius: bspan / 2 + 1250, height: 330, base: -30, colorLow: 0x6f8fb0, colorHigh: 0xa9c0d8, haze: 0.5, shape: 'peaks', seed: 9, snow: 0.28, segments: 260 });
  buildBackdrop(ctx, { radius: bspan / 2 + 850, height: 150, base: -25, colorLow: 0x3f7a40, colorHigh: 0x7fae5a, haze: 0.38, shape: 'hills', seed: 5 });
  await ctx.yield(0.95);
}
