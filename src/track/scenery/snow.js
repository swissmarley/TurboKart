/**
 * Frostbite Peaks: golden-hour mountain pass. Snowy pines, a timber bridge over a
 * ravine, a frozen lake, a cabin village, ice patches, falling snow.
 */
import * as THREE from 'three';
import { createNoise2D, createRng, smoothstep, clamp } from '../util.js';
import { makeAsphalt, makeGround, makeRock, makeWood, makeSoftDot, canvasTexture, createCanvas } from '../build/textures.js';
import { buildTerrain, createTerrainMaterial } from '../build/terrain.js';
import { buildRoadMesh, buildOffroad, buildCurbs, buildBarriers, buildStartLine, buildBoostPads, buildRamps, findRuns } from '../build/road.js';
import { scatter, makeInstanced } from '../build/scatter.js';
import * as P from '../build/props.js';
import { findOpenSpot, makeBlob, buildWater, buildBackdrop, buildFlags, buildBoards, buildChevrons, buildGrandstand } from './common.js';

export async function build(ctx) {
  const { path, style, density } = ctx;
  const noise = createNoise2D(505);
  const noiseB = createNoise2D(606);
  const rng = createRng(99);
  const L = path.length;

  // ---- textures & materials -------------------------------------------------------
  const asphalt = makeAsphalt(style.asphalt, { anisotropy: ctx.anisotropy, seed: 41 });
  const snowTex = makeGround('snow', { anisotropy: ctx.anisotropy, seed: 43 });
  const rockTex = makeRock({ anisotropy: ctx.anisotropy, tint: [96, 92, 100], seed: 47 });
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt.map, normalMap: asphalt.normalMap, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.8, metalness: 0.0 });
  const groundMat = createTerrainMaterial({ map: snowTex.map, normalMap: snowTex.normalMap, rockMap: rockTex.map, rockTint: 0x9a96a6, rockStart: 0.5, rockEnd: 0.72, snowCap: 0.85, roughness: 0.8 });
  await ctx.yield(0.14);

  // ---- bridge / ravine ------------------------------------------------------------------
  const b0 = ctx.ref('bridge+4');
  const b1 = ctx.ref('bridge@1') - 4;
  const bm = (b0 + b1) / 2;
  const bf = path.frameAt(bm, 0);
  const bT = new THREE.Vector3(bf.tangent.x, 0, bf.tangent.z).normalize();
  const bridgeLen = b1 - b0;
  const ravineFloor = bf.position.y - 24;
  const ravine = (x, z) => {
    // distance from the ravine axis (which runs across the track at the bridge)
    const dx = x - bf.position.x;
    const dz = z - bf.position.z;
    const along = dx * bT.x + dz * bT.z; // distance along the track direction
    const across = -dx * bT.z + dz * bT.x;
    const wob = noise(across / 60, 3.3) * 9;
    const dist = Math.abs(along - wob);
    return { dist, across };
  };
  const inBridge = (d) => d >= b0 - 1 && d <= b1 + 1;
  const noCorridor = (d) => {
    const e = 6;
    return smoothstep(b0 - e, b0 + e, d) * (1 - smoothstep(b1 - e, b1 + e, d));
  };

  // ---- frozen lake next to the 'lake' straight ---------------------------------------------
  const lakeRef = path.frameAt(ctx.ref('lake@0.5'), 0).position;
  const spot = findOpenSpot(ctx, { minClear: 28, maxClear: 60, prefer: (x, z) => -Math.hypot(x - lakeRef.x, z - lakeRef.z) * 0.4 });
  const lake = spot ? makeBlob(spot.x, spot.z, Math.min(55, spot.clear - 8), 21) : null;
  if (lake) ctx.avoidZones.push({ x: lake.x, z: lake.z, r: lake.r * 1.25 });
  let lakeLevel = 0;

  // ---- ground colour -------------------------------------------------------------------------
  const c = new THREE.Color();
  const tc = new THREE.Color();
  const groundColor = (x, z, out, edge = 0) => {
    const n1 = noise.fbm(x / 80, z / 80, 3);
    const n2 = noiseB.fbm(x / 20, z / 20, 2);
    c.setRGB(1, 1, 1);
    tc.setRGB(0.86, 0.9, 1.04); // bluish drifts
    c.lerp(tc, smoothstep(-0.05, 0.4, n1) * 0.6);
    tc.setRGB(1.04, 0.98, 0.98);
    c.lerp(tc, smoothstep(0.0, -0.4, n1) * 0.5);
    c.multiplyScalar(0.95 + n2 * 0.08);
    if (edge > 0) {
      tc.setRGB(0.78, 0.78, 0.82); // grey slush thrown off the road
      c.lerp(tc, 0.45 * edge);
    }
    out[0] = c.r;
    out[1] = c.g;
    out[2] = c.b;
    return out;
  };
  ctx.groundColor = groundColor;

  // ---- terrain -----------------------------------------------------------------------------------
  const cx = (path.bounds.minX + path.bounds.maxX) / 2;
  const cz = (path.bounds.minZ + path.bounds.maxZ) / 2;
  const natural = (x, z, base) => {
    const dc = Math.hypot(x - cx, z - cz);
    const far = smoothstep(200, 650, dc);
    let h = base - 1;
    h += noise.fbm(x / 160, z / 160, 4) * (10 + far * 30);
    h += Math.pow(noise.ridged(x / 420 + 2, z / 420 - 1, 5), 1.8) * (14 + far * 260);
    h += noiseB.fbm(x / 35, z / 35, 2) * 1.5;
    // ravine under the bridge
    const rv = ravine(x, z);
    if (rv.dist < 70) {
      const depthT = 1 - smoothstep(9, 34 + Math.abs(noiseB(rv.across / 40, 1.7)) * 10, rv.dist);
      const floor = ravineFloor + noiseB(rv.across / 30, 7) * 1.5 + Math.abs(rv.across) * 0.015;
      h = h + (Math.min(h, floor) - h) * depthT;
    }
    if (lake) {
      const r = lake.rel(x, z);
      if (r < 1.5) {
        const bank = smoothstep(1.0, 1.5, r);
        const target = r < 1 ? lakeLevel - 1.5 : lakeLevel + 0.4;
        h = target + (h - target) * bank;
      }
    }
    return h;
  };
  const terrain = await buildTerrain(ctx, {
    material: groundMat,
    margin: 560,
    fine: ctx.quality === 'low' ? 5 : ctx.quality === 'medium' ? 4 : 3,
    coarse: 20,
    blend: 18,
    noCorridor: (d) => noCorridor(d),
    onBase: (base) => {
      if (lake) lakeLevel = base(lake.x, lake.z) - 1.2;
    },
    natural,
    color: (x, z, h, ny, near, out) => {
      groundColor(x, z, out, 0);
      const rv = ravine(x, z);
      if (rv.dist < 9) {
        // frozen creek at the bottom of the ravine
        const t = smoothstep(9, 5, rv.dist);
        out[0] += (0.75 - out[0]) * t;
        out[1] += (0.9 - out[1]) * t;
        out[2] += (1.1 - out[2]) * t;
      }
    },
  });
  ctx.heightAt = terrain.heightAt;
  await ctx.yield(0.42);

  // ---- road ---------------------------------------------------------------------------------------
  buildRoadMesh(ctx, roadMat, { texLen: path.hw[0] * 2 });
  buildOffroad(ctx, groundMat, { skip: inBridge });
  buildCurbs(ctx, { colors: style.curb });
  const bankMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 });
  const snowW = new THREE.Color(0xf7f9ff);
  const snowB = new THREE.Color(0xdde6f6);
  const snowBank = buildBarriers(ctx, {
    material: bankMat,
    skip: inBridge,
    profile: [
      [0, -0.1],
      [0.02, 0.5],
      [0.25, 0.92],
      [0.75, 1.12],
      [1.35, 1.04],
      [1.95, 0.62],
      [2.5, 0.12],
      [2.8, -0.35],
    ],
    colorFn: (d, ei) => (ei < 2 ? snowB : snowW),
  });
  void snowBank;
  // red/white marker poles on the snow banks
  {
    const items = [];
    for (let d = 0; d < L; d += 14) {
      const k = Math.floor(d / path.spacing) % path.count;
      if (inBridge(d) || Number.isNaN(path.wall[k])) continue;
      for (const side of [-1, 1]) {
        const f = path.frameAt(d, side * (path.wall[k] + 0.4));
        items.push({ x: f.position.x, y: f.position.y, z: f.position.z });
      }
    }
    const pole = new P.PartsBuilder();
    for (let i = 0; i < 5; i++) pole.add(new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6), i % 2 ? 0xffffff : 0xe02a2a, { p: [0, 0.8 + i * 0.4, 0] });
    makeInstanced(ctx, pole.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 }), items, { name: 'MarkerPoles' });
  }
  buildStartLine(ctx, { frameColor: 0x2b4f9e, accent: 0xffffff });
  buildBoostPads(ctx, { colA: 0x6fe8ff, colB: 0x1f6bff, edge: 0xeaffff });
  buildRamps(ctx, { topColors: { a: '#7fe0ff', b: '#1d2a44' } });
  await ctx.yield(0.5);

  // ---- timber bridge -------------------------------------------------------------------------------
  {
    const wood = makeWood({ base: [138, 92, 58] });
    const deckMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.85, vertexColors: true });
    const pos = [];
    const uv = [];
    const col = [];
    const idx = [];
    const rows = Math.ceil(bridgeLen + 8) + 1;
    const d0 = b0 - 4;
    const f = { position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), distance: 0 };
    // cross-section: deck top (outside the asphalt), edge, underside
    const k0 = Math.floor(path.wrapDistance(bm) / path.spacing) % path.count;
    const W = path.wall[k0] + 1.0;
    const hw = path.hw[k0];
    const sec = [
      [-W, -0.02, 0],
      [-hw, -0.02, (W - hw) / 4],
      [-hw, -0.06, (W - hw) / 4],
      [hw, -0.06, (W - hw) / 4 + (2 * hw) / 4],
      [hw, -0.02, (W - hw) / 4 + (2 * hw) / 4],
      [W, -0.02, (2 * W) / 4],
      [W, -1.4, (2 * W) / 4 + 0.35],
      [-W, -1.4, (2 * W) / 4 + 0.35 + (2 * W) / 4],
      [-W, -0.02, (2 * W) / 4 + 0.7 + (2 * W) / 4],
    ];
    for (let r = 0; r < rows; r++) {
      const d = d0 + r;
      path.frameAt(d, 0, f);
      for (const [l, u, v] of sec) {
        const p = f.position.clone().addScaledVector(f.right, l).addScaledVector(f.up, u);
        pos.push(p.x, p.y, p.z);
        uv.push(v, d / 4);
        const dark = u < -0.5 ? 0.55 : 1;
        col.push(dark, dark, dark);
      }
    }
    const S = sec.length;
    for (let r = 0; r < rows - 1; r++) {
      for (let e = 0; e < S - 1; e++) {
        const a = r * S + e;
        const b = a + 1;
        const c2 = a + S;
        const d = c2 + 1;
        idx.push(a, b, c2, b, d, c2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const deck = new THREE.Mesh(g, deckMat);
    deck.castShadow = true;
    deck.receiveShadow = true;
    deck.name = 'BridgeDeck';
    ctx.root.add(deck);
    // timber railings (barrier profile) on the bridge
    const railCol = new THREE.Color(0x7a4e2e);
    const railTop = new THREE.Color(0xf4f7ff);
    buildBarriers(ctx, {
      material: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }),
      skip: (d) => !inBridge(d),
      profile: [
        [0, 0],
        [0, 1.15],
        [0.3, 1.25],
        [0.6, 1.15],
        [0.6, 0],
      ],
      colorFn: (d, ei) => (ei === 1 || ei === 2 ? railTop : railCol),
      name: 'BridgeRails',
    });
    // support trestles down to the ravine floor
    const legs = [];
    const beams = [];
    for (let d = b0 + 6; d < b1 - 4; d += 15) {
      for (const side of [-1, 1]) {
        const p = path.frameAt(d, side * (W - 1.5)).position;
        const gy = terrain.heightAt(p.x, p.z);
        const h = p.y - 1.3 - gy + 2;
        if (h < 1) continue;
        legs.push({ x: p.x, y: gy - 2, z: p.z, sy: h, s: 1 });
      }
      const p = path.frameAt(d, 0).position;
      const t = path.frameAt(d, 0).tangent;
      beams.push({ x: p.x, y: p.y - 1.6, z: p.z, ry: Math.atan2(t.x, t.z), sx: W * 2 + 1, sy: 0.6, sz: 0.8 });
    }
    const legGeo = new THREE.CylinderGeometry(0.55, 0.7, 1, 8);
    legGeo.translate(0, 0.5, 0);
    const timber = new THREE.MeshStandardMaterial({ color: 0x6a4428, roughness: 0.85 });
    makeInstanced(ctx, legGeo, timber, legs, { name: 'BridgeLegs' });
    makeInstanced(ctx, new THREE.BoxGeometry(1, 1, 1), timber, beams, { name: 'BridgeBeams' });
    // lanterns on the bridge
    const lanterns = [];
    for (let d = b0 + 2; d < b1; d += 18) {
      for (const side of [-1, 1]) {
        const p = path.frameAt(d, side * (W - 0.2)).position;
        lanterns.push({ x: p.x, y: p.y, z: p.z });
      }
    }
    makeInstanced(ctx, P.lampPost(3.2, 0xffc66a), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, emissive: 0xffa040, emissiveIntensity: 0.0 }), lanterns, { name: 'BridgeLanterns' });
  }
  await ctx.yield(0.56);

  // ---- frozen lake ---------------------------------------------------------------------------------
  if (lake) {
    buildWater(ctx, lake, lakeLevel, { deep: 0x8fc4e8, shallow: 0xd8f0ff, ice: true });
  }

  // ---- ice patches on the road (visual) -------------------------------------------------------------
  {
    const S = 256;
    const cv = createCanvas(S, S);
    const g = cv.getContext('2d');
    const rr = createRng(5);
    // blob outline from a few overlapping circles
    const blobs = [];
    for (let i = 0; i < 7; i++) blobs.push([S * (0.3 + rr() * 0.4), S * (0.3 + rr() * 0.4), S * (0.16 + rr() * 0.14)]);
    const img = g.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        let f = 0;
        for (const [bx, by, br] of blobs) f = Math.max(f, 1 - Math.hypot(x - bx, y - by) / br);
        const o = (y * S + x) * 4;
        if (f <= 0) {
          img.data[o + 3] = 0;
          continue;
        }
        const rim = 1 - Math.min(1, f / 0.18); // frosty white rim
        const c = 0.55 + rim * 0.45;
        img.data[o] = 150 + 105 * rim;
        img.data[o + 1] = 205 + 50 * rim;
        img.data[o + 2] = 255;
        img.data[o + 3] = Math.min(255, (0.55 + 0.4 * rim) * 255 * Math.min(1, f / 0.05)) * c + 0;
      }
    }
    g.putImageData(img, 0, 0);
    // cracks
    g.strokeStyle = 'rgba(255,255,255,0.85)';
    g.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      let x = S * (0.35 + rr() * 0.3);
      let y = S * (0.35 + rr() * 0.3);
      g.beginPath();
      g.moveTo(x, y);
      for (let j = 0; j < 5; j++) {
        x += (rr() - 0.5) * 40;
        y += (rr() - 0.5) * 40;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    const tex = canvasTexture(cv, { repeat: false });
    const iceMat = new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.08, metalness: 0.0, envMapIntensity: 1.4, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const spots = [
      ['ridge@0.4', 4],
      ['descent@0.3', -5],
      ['descent@0.75', 6],
      ['lake@0.4', -3],
      ['esB@0.4', 5],
      ['home@0.5', -6],
    ];
    for (const [r, lat] of spots) {
      const d = ctx.ref(r);
      const geo = new THREE.PlaneGeometry(9, 13, 2, 4);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, iceMat);
      ctx.placeOnTrack(m, d, lat, 0.03, { worldUp: false });
      m.receiveShadow = true;
      m.renderOrder = 1;
      ctx.root.add(m);
    }
  }

  // ---- pines -------------------------------------------------------------------------------------------
  const vegMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const forest = (x, z) => noise.fbm(x / 120 - 4, z / 120 + 9, 3);
  const pts = scatter(ctx, {
    count: Math.round(1300 * density),
    spacing: 5.5,
    minClear: 3,
    maxDist: 260,
    tries: 50000,
    maxSlope: 0.75,
    accept: (x, z, info, r) => r() < 0.12 + smoothstep(-0.1, 0.3, forest(x, z)) * 0.88,
  });
  const pineVars = [P.pineTree(2, { snowy: true }), P.pineTree(6, { snowy: true, tiers: 5, height: 11 }), P.pineTree(9, { snowy: true, tiers: 3, height: 7, leaf: [0x23503a, 0x4d8a5a] })];
  const pb = pineVars.map(() => []);
  for (const p of pts) {
    const i = Math.floor(rng() * pineVars.length);
    pb[i].push({ x: p.x, y: p.y - 0.4, z: p.z, ry: rng() * 6, s: 0.8 + rng() * 0.7 });
  }
  // gameplay obstacles from the layout (pines / snowmen in the off-road)
  for (const o of path.obstacles) {
    if (o.kind === 'pine') pb[0].push({ x: o.position.x, y: o.position.y - 0.3, z: o.position.z, ry: rng() * 6, s: 0.85 });
  }
  pineVars.forEach((g, i) => makeInstanced(ctx, g, vegMat, pb[i], { name: `Pines${i}` }));
  // far, cheap pines on the mountainsides
  {
    const far = scatter(ctx, { count: Math.round(1600 * density), spacing: 8, minClear: 250, tries: 26000, maxSlope: 0.7, accept: (x, z, i, r) => r() < smoothstep(-0.2, 0.2, forest(x, z)) });
    const g = new P.PartsBuilder()
      .add(new THREE.ConeGeometry(2.6, 9, 6), (p, n, out) => P.lerpColor(0x1d4630, 0x3c7a4c, 0.3 + p.y / 12, out).lerp(new THREE.Color(0xf2f6ff), n.y > 0.5 ? 0.6 : 0), { p: [0, 5.5, 0] })
      .add(new THREE.CylinderGeometry(0.3, 0.4, 2, 5), 0x4a3020, { p: [0, 1, 0] })
      .build();
    makeInstanced(ctx, g, vegMat, far.map((p) => ({ x: p.x, y: p.y - 0.4, z: p.z, ry: rng() * 6, s: 0.8 + rng() * 0.8 })), { name: 'FarPines', castShadow: false });
  }
  const rockPts = scatter(ctx, { count: Math.round(100 * density), spacing: 10, minClear: 2, maxDist: 200, tries: 4000 });
  makeInstanced(ctx, P.rock(13, { colors: [0x5a5866, 0x9a98a8] }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), rockPts.map((p) => ({ x: p.x, y: p.y - 0.3, z: p.z, ry: rng() * 6, s: 0.8 + rng() * 1.8, sy: 0.6 + rng() * 0.6 })), { name: 'Rocks' });
  await ctx.yield(0.7);

  // ---- cabin village ------------------------------------------------------------------------------------
  {
    const v0 = ctx.ref('esA@0');
    const v1 = ctx.ref('home@0.45');
    const inRange = (d) => (v1 > v0 ? d >= v0 && d <= v1 : d >= v0 || d <= v1);
    const spots = scatter(ctx, { count: 10, spacing: 16, minClear: 8, maxDist: 34, tries: 6000, maxSlope: 0.35, accept: (x, z, info) => inRange(info.distance) });
    const cabins = [];
    const cabins2 = [];
    for (const s of spots) {
      const f = path.frameAt(s.distance, 0);
      const yaw = Math.atan2(f.position.x - s.x, f.position.z - s.z);
      (cabins.length <= cabins2.length ? cabins : cabins2).push({ x: s.x, y: s.y - 0.3, z: s.z, ry: yaw + (rng() - 0.5) * 0.3 });
      ctx.avoidZones.push({ x: s.x, z: s.z, r: 7 });
    }
    const cabMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
    // emissive windows via onBeforeCompile: vertex colour pure warm yellow -> glow
    cabMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        #ifdef USE_COLOR
        if (vColor.r > 0.9 && vColor.g > 0.5 && vColor.b < 0.35) totalEmissiveRadiance += vColor.rgb * 2.2;
        #endif`,
      );
    };
    makeInstanced(ctx, P.cabin(3), cabMat, cabins, { name: 'Cabins1' });
    makeInstanced(ctx, P.cabin(8), cabMat, cabins2, { name: 'Cabins2' });
    // lamp posts + snowmen along the village road
    const lamps = [];
    for (let d = v0; d < v0 + (v1 > v0 ? v1 - v0 : v1 + L - v0); d += 22) {
      const k = Math.floor(path.wrapDistance(d) / path.spacing) % path.count;
      const side = Math.floor(d / 22) % 2 ? 1 : -1;
      const f = path.frameAt(d, side * (path.wall[k] + 3.5));
      lamps.push({ x: f.position.x, y: terrain.heightAt(f.position.x, f.position.z) - 0.1, z: f.position.z });
    }
    const lampMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });
    lampMat.onBeforeCompile = cabMat.onBeforeCompile;
    makeInstanced(ctx, P.lampPost(5, 0xffc66a), lampMat, lamps, { name: 'Lamps' });
    const sm = scatter(ctx, { count: 6, spacing: 20, minClear: 3, maxDist: 30, tries: 2000 }).map((p) => ({ x: p.x, y: p.y - 0.2, z: p.z, ry: rng() * 6, s: 0.9 + rng() * 0.3 }));
    for (const o of path.obstacles) {
      if (o.kind !== 'snowman') continue;
      const f = path.frameAt(o.distance, 0);
      sm.push({ x: o.position.x, y: o.position.y - 0.1, z: o.position.z, ry: Math.atan2(f.position.x - o.position.x, f.position.z - o.position.z), s: 1.1 });
    }
    makeInstanced(ctx, P.snowman(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), sm, { name: 'Snowmen' });
  }

  // ---- start area: grandstand, flags, boards, chevrons -------------------------------------------------
  buildGrandstand(ctx, { d0: 15, d1: 70, side: 1, gap: 5, seed: 7, roofColor: 0x2b4f9e, frameColor: 0xeef2fa });
  {
    const flags = [];
    const cols = [0x2b4f9e, 0xffffff, 0xd8272a, 0x7fd6ff];
    for (let d = -40; d < 80; d += 13) {
      for (const side of [-1, 1]) {
        const k = Math.floor(path.wrapDistance(d) / path.spacing) % path.count;
        const f = path.frameAt(d, side * (path.wall[k] + 2.9));
        flags.push({ x: f.position.x, y: terrain.heightAt(f.position.x, f.position.z), z: f.position.z, ry: Math.atan2(f.tangent.x, f.tangent.z) + Math.PI / 2, color: cols[(Math.floor(d / 13) + 20 + (side > 0 ? 1 : 0)) % cols.length] });
      }
    }
    buildFlags(ctx, flags, { poleH: 7.5 });
  }
  buildBoards(ctx, [
    { text: 'FROSTBITE', bg: '#2b4f9e', bg2: '#1a3270' },
    { text: 'TURBOKART', bg: '#d81e2b', bg2: '#a3121d' },
    { text: 'HOT COCOA', bg: '#7a4a2a', bg2: '#4a2a14' },
    { text: 'ICE ICE!', bg: '#7fd6ff', bg2: '#3aa0d8', fg: '#0a1a3a', stroke: '#fff' },
    { text: 'PEAK FM', bg: '#7c4dff', bg2: '#4a22c8' },
  ], { every: 70, offset: 2.2, height: 1.0 });
  buildChevrons(ctx, { minCurv: 1 / 50, colors: { bg: '#ff3b3b', fg: '#ffffff' } });
  await ctx.yield(0.8);

  // ---- falling snow -------------------------------------------------------------------------------------
  {
    const count = Math.round((ctx.quality === 'low' ? 900 : ctx.quality === 'medium' ? 1800 : 3200) * 1);
    const box = new THREE.Vector3(110, 46, 110);
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = rng() * box.x;
      arr[i * 3 + 1] = rng() * box.y;
      arr[i * 3 + 2] = rng() * box.z;
      seed[i] = rng();
    }
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const uniforms = {
      uTime: { value: 0 },
      uFocus: { value: new THREE.Vector3() },
      uBox: { value: box },
      uTex: { value: makeSoftDot({ size: 64 }) },
      uColor: { value: new THREE.Color(0xfff4ec) },
      uScale: { value: 1 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        uniform vec3 uFocus;
        uniform vec3 uBox;
        uniform float uScale;
        varying float vAlpha;
        void main() {
          vec3 p = position;
          p.y -= uTime * (1.6 + aSeed * 1.4);
          p.x += uTime * 1.2 + sin(uTime * 0.7 + aSeed * 40.0) * 1.5;
          p.z += sin(uTime * 0.5 + aSeed * 23.0) * 1.2;
          vec3 origin = uFocus - uBox * vec3(0.5, 0.25, 0.5);
          p = origin + mod(p - origin, uBox);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          gl_PointSize = clamp((0.13 + aSeed * 0.12) * 900.0 * uScale / max(d, 0.5), 1.0, 26.0);
          vAlpha = smoothstep(70.0, 25.0, d) * smoothstep(0.5, 3.0, d);
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D uTex;
        uniform vec3 uColor;
        varying float vAlpha;
        void main() {
          float a = texture2D(uTex, gl_PointCoord).a * vAlpha;
          if (a < 0.02) discard;
          gl_FragColor = vec4(uColor, a * 0.9);
          #include <colorspace_fragment>
        }`,
    });
    const pts2 = new THREE.Points(g, mat);
    pts2.frustumCulled = false;
    pts2.name = 'Snowfall';
    pts2.renderOrder = 5;
    ctx.root.add(pts2);
    ctx.animators.push((dt, time, focus) => {
      uniforms.uTime.value = time;
      if (focus) uniforms.uFocus.value.copy(focus);
      const h = ctx.renderer ? ctx.renderer.getDrawingBufferSize(_v2).y : 720;
      uniforms.uScale.value = h / 720;
    });
  }

  // ---- distant mountains ---------------------------------------------------------------------------------
  const bspan = Math.max(path.bounds.maxX - path.bounds.minX, path.bounds.maxZ - path.bounds.minZ);
  buildBackdrop(ctx, { radius: bspan / 2 + 1250, height: 520, base: -40, colorLow: 0x5a5a8a, colorHigh: 0xc8b8d8, haze: 0.42, shape: 'peaks', seed: 21, snow: 0.55, snowColor: 0xffe6da, segments: 300 });
  buildBackdrop(ctx, { radius: bspan / 2 + 900, height: 260, base: -30, colorLow: 0x3a4a6a, colorHigh: 0x8a9ac0, haze: 0.3, shape: 'peaks', seed: 22, snow: 0.4, snowColor: 0xfff0e6 });
  await ctx.yield(0.95);
  void clamp;
  void findRuns;
}

const _v2 = new THREE.Vector2();
