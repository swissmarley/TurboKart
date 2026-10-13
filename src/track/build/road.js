/**
 * Road surface, off-road strips, curbs, barriers, start/finish gantry, boost pads, ramps.
 * All geometry is built directly from TrackPath frames so it matches queryPosition().
 */
import * as THREE from 'three';
import { makeChecker, makeBanner, makeRampTexture } from './textures.js';

const _v = new THREE.Vector3();

/** Position of sample k at lateral `lat`, raised `up` along the sample's up vector. */
function samplePoint(path, k, lat, up, out) {
  out[0] = path.px[k] + path.rx[k] * lat + path.ux[k] * up;
  out[1] = path.py[k] + path.ry[k] * lat + path.uy[k] * up;
  out[2] = path.pz[k] + path.rz[k] * lat + path.uz[k] * up;
  return out;
}

/** Runs of consecutive samples satisfying pred (closed loop aware). */
export function findRuns(N, pred) {
  const flags = new Array(N);
  for (let k = 0; k < N; k++) flags[k] = !!pred(k);
  if (flags.every(Boolean)) return [{ start: 0, end: N, closed: true }];
  const runs = [];
  // start scanning from a false sample
  let s0 = flags.indexOf(false);
  let k = 0;
  while (k < N) {
    const i = (s0 + k) % N;
    if (flags[i]) {
      const start = i;
      let len = 0;
      while (k < N && flags[(s0 + k) % N]) {
        k++;
        len++;
      }
      runs.push({ start, end: start + len, closed: false }); // end exclusive, may exceed N (wrap)
    } else k++;
  }
  return runs;
}

// ---------------------------------------------------------------------------
// Road ribbon
// ---------------------------------------------------------------------------
export function buildRoadMesh(ctx, material, { texLen = 26, cols = [-1, -0.94, -0.6, -0.25, 0, 0.25, 0.6, 0.94, 1], lift = 0 } = {}) {
  const path = ctx.path;
  const N = path.count;
  const L = path.length;
  const reps = Math.max(1, Math.round(L / texLen));
  const vScale = reps / L;
  const C = cols.length;
  const pos = new Float32Array((N + 1) * C * 3);
  const nrm = new Float32Array((N + 1) * C * 3);
  const uv = new Float32Array((N + 1) * C * 2);
  const p = [0, 0, 0];
  for (let r = 0; r <= N; r++) {
    const k = r % N;
    const hw = path.hw[k];
    const v = r * path.spacing * vScale;
    for (let c = 0; c < C; c++) {
      const i = r * C + c;
      samplePoint(path, k, cols[c] * hw, lift, p);
      pos.set(p, i * 3);
      nrm[i * 3] = path.ux[k];
      nrm[i * 3 + 1] = path.uy[k];
      nrm[i * 3 + 2] = path.uz[k];
      uv[i * 2] = (cols[c] + 1) / 2;
      uv[i * 2 + 1] = v;
    }
  }
  const idx = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < C - 1; c++) {
      const a = r * C + c;
      const b = a + 1;
      const cc = a + C;
      const d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'Road';
  mesh.receiveShadow = true;
  ctx.root.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// Off-road strips (hw -> wall + apron, then a short skirt down into the terrain)
// ---------------------------------------------------------------------------
export function buildOffroad(ctx, material, { skip = null, skirtDrop = 1.4, skirtWidth = 2.5 } = {}) {
  const path = ctx.path;
  const N = path.count;
  const apron = ctx.apron;
  const tile = ctx.groundTile;
  const runs = findRuns(N, (k) => !Number.isNaN(path.wall[k]) && !(skip && skip(k * path.spacing)));
  const pos = [];
  const col = [];
  const uv = [];
  const idx = [];
  const p = [0, 0, 0];
  const c3 = [0, 0, 0];
  let base = 0;
  for (const run of runs) {
    for (const side of [-1, 1]) {
      const rows = run.closed ? N + 1 : run.end - run.start + 1;
      const offs = (k) => {
        const hw = path.hw[k];
        const w = path.wall[k];
        return [
          [hw, 0],
          [hw + 0.7, 0],
          [Math.max(hw + 1.4, (hw + w) / 2), 0],
          [w, 0],
          [w + apron, 0],
          [w + apron + skirtWidth, -skirtDrop],
        ];
      };
      const C = 6;
      for (let r = 0; r < rows; r++) {
        const k = (run.start + r) % N;
        const o = offs(k);
        for (let c = 0; c < C; c++) {
          samplePoint(path, k, side * o[c][0], o[c][1], p);
          pos.push(p[0], p[1], p[2]);
          ctx.groundColor(p[0], p[2], c3, c === 0 ? 1 : c === 1 ? 0.5 : 0, -1);
          col.push(c3[0], c3[1], c3[2]);
          uv.push(p[0] / tile, p[2] / tile);
        }
      }
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < C - 1; c++) {
          const a = base + r * C + c;
          const b = a + 1;
          const cc = a + C;
          const d = cc + 1;
          if (side > 0) idx.push(a, b, cc, b, d, cc);
          else idx.push(a, cc, b, b, cc, d);
        }
      }
      base += rows * C;
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'Offroad';
  mesh.receiveShadow = true;
  ctx.root.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// Curbs (red/white rumble strips on the inside & outside of corners)
// ---------------------------------------------------------------------------
export function buildCurbs(ctx, { colors = [0xd8272a, 0xf6f4ee], minCurv = 1 / 95, stripe = 2.2, width = 1.25, height = 0.07, emissive = false } = {}) {
  const path = ctx.path;
  const N = path.count;
  // corner mask, dilated
  const mask = new Uint8Array(N);
  for (let k = 0; k < N; k++) if (Math.abs(path.curvature[k]) > minCurv) mask[k] = 1;
  const dil = new Uint8Array(N);
  for (let k = 0; k < N; k++) {
    if (!mask[k]) continue;
    for (let o = -10; o <= 10; o++) dil[(k + o + N) % N] = 1;
  }
  const runs = findRuns(N, (k) => dil[k] && !(ctx.noCurb && ctx.noCurb(k * path.spacing))).filter((r) => r.end - r.start >= 14);
  const pos = [];
  const col = [];
  const nrm = [];
  const ca = new THREE.Color(colors[0]);
  const cb = new THREE.Color(colors[1]);
  const p0 = [0, 0, 0];
  const p1 = [0, 0, 0];
  const p2 = [0, 0, 0];
  const p3 = [0, 0, 0];
  // profile: lateral offset from the road edge (negative = inward), height
  const prof = [
    [-width, 0.012],
    [-width + 0.22, height],
    [-0.08, height],
    [0, 0.012],
  ];
  const tmpN = new THREE.Vector3();
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  for (const run of runs) {
    for (const side of [-1, 1]) {
      for (let r = run.start; r < run.end; r++) {
        const k = r % N;
        const k1 = (r + 1) % N;
        // fade ends: taper height in the first/last 4 samples
        const ta = Math.min(1, (r - run.start) / 4, (run.end - r) / 4);
        const tb = Math.min(1, (r + 1 - run.start) / 4, (run.end - r - 1) / 4);
        const stripeIdx = Math.floor((k * path.spacing + 0.5) / stripe);
        const c = stripeIdx % 2 ? cb : ca;
        for (let e = 0; e < prof.length - 1; e++) {
          const la = path.hw[k] + prof[e][0];
          const lb = path.hw[k] + prof[e + 1][0];
          const la1 = path.hw[k1] + prof[e][0];
          const lb1 = path.hw[k1] + prof[e + 1][0];
          samplePoint(path, k, side * la, prof[e][1] * ta + 0.015, p0);
          samplePoint(path, k, side * lb, prof[e + 1][1] * ta + 0.015, p1);
          samplePoint(path, k1, side * la1, prof[e][1] * tb + 0.015, p2);
          samplePoint(path, k1, side * lb1, prof[e + 1][1] * tb + 0.015, p3);
          // triangles (p0,p1,p2),(p1,p3,p2) face up when side=+1 (lateral increasing to the right)
          const tris = side > 0 ? [p0, p1, p2, p1, p3, p2] : [p0, p2, p1, p1, p2, p3];
          e1.set(tris[1][0] - tris[0][0], tris[1][1] - tris[0][1], tris[1][2] - tris[0][2]);
          e2.set(tris[2][0] - tris[0][0], tris[2][1] - tris[0][1], tris[2][2] - tris[0][2]);
          tmpN.crossVectors(e1, e2).normalize();
          for (const t of tris) {
            pos.push(t[0], t[1], t[2]);
            col.push(c.r, c.g, c.b);
            nrm.push(tmpN.x, tmpN.y, tmpN.z);
          }
        }
      }
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const mat = emissive
    ? new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })
    : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'Curbs';
  mesh.receiveShadow = true;
  ctx.root.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// Barriers: a cross-section profile extruded along the wall line on both sides.
// profile: [[outward, up], ...] starting at the inner face (outward = 0).
// colorFn(distance, edgeIndex, side) -> THREE.Color
// ---------------------------------------------------------------------------
export function buildBarriers(ctx, { profile, colorFn, material, name = 'Barriers', step = 1, castShadow = true, skip = null }) {
  const path = ctx.path;
  const N = path.count;
  const runs = findRuns(N, (k) => !Number.isNaN(path.wall[k]) && !(skip && skip(k * path.spacing)));
  const pos = [];
  const col = [];
  const nrm = [];
  const uvs = [];
  const P = profile.length;
  const a0 = [0, 0, 0];
  const a1 = [0, 0, 0];
  const b0 = [0, 0, 0];
  const b1 = [0, 0, 0];
  const n = new THREE.Vector3();
  const t = new THREE.Vector3();
  const e = new THREE.Vector3();
  // accumulated profile length for uv.u
  const plen = [0];
  for (let i = 1; i < P; i++) plen.push(plen[i - 1] + Math.hypot(profile[i][0] - profile[i - 1][0], profile[i][1] - profile[i - 1][1]));
  const segNormal = (k, side, ei, out) => {
    // tangent x profile-edge direction, oriented outward from the road for side=+1
    t.set(path.tx[k], path.ty[k], path.tz[k]);
    const o = profile[ei + 1][0] - profile[ei][0];
    const u = profile[ei + 1][1] - profile[ei][1];
    e.set(path.rx[k] * side * o + path.ux[k] * u, path.ry[k] * side * o + path.uy[k] * u, path.rz[k] * side * o + path.uz[k] * u);
    out.crossVectors(e, t).multiplyScalar(side).normalize();
    return out;
  };
  for (const run of runs) {
    const count = run.closed ? N : run.end - run.start;
    for (const side of [-1, 1]) {
      for (let r = 0; r < count; r += step) {
        const k = (run.start + r) % N;
        const rr = Math.min(count, r + step);
        const k1 = (run.start + rr) % N;
        if (!run.closed && rr > count) break;
        const w0 = path.wall[k];
        const w1 = Number.isNaN(path.wall[k1]) ? w0 : path.wall[k1];
        const d = k * path.spacing;
        for (let ei = 0; ei < P - 1; ei++) {
          samplePoint(path, k, side * (w0 + profile[ei][0]), profile[ei][1], a0);
          samplePoint(path, k, side * (w0 + profile[ei + 1][0]), profile[ei + 1][1], a1);
          samplePoint(path, k1, side * (w1 + profile[ei][0]), profile[ei][1], b0);
          samplePoint(path, k1, side * (w1 + profile[ei + 1][0]), profile[ei + 1][1], b1);
          const c = colorFn(d, ei, side);
          const nA = segNormal(k, side, ei, new THREE.Vector3());
          const nB = segNormal(k1, side, ei, new THREE.Vector3());
          const quad = side < 0 ? [[a0, nA, 0, ei], [b0, nB, 1, ei], [a1, nA, 0, ei + 1], [a1, nA, 0, ei + 1], [b0, nB, 1, ei], [b1, nB, 1, ei + 1]]
            : [[a0, nA, 0, ei], [a1, nA, 0, ei + 1], [b0, nB, 1, ei], [a1, nA, 0, ei + 1], [b1, nB, 1, ei + 1], [b0, nB, 1, ei]];
          for (const [pt, nn, along, pi] of quad) {
            pos.push(pt[0], pt[1], pt[2]);
            nrm.push(nn.x, nn.y, nn.z);
            col.push(c.r, c.g, c.b);
            uvs.push(plen[pi] / 2, (d + along * step * path.spacing) / 4);
          }
        }
      }
      // end caps for open runs
      if (!run.closed) {
        for (const end of [0, 1]) {
          const k = end ? (run.end - 1) % N : run.start % N;
          const w = path.wall[k];
          const dir = end ? 1 : -1;
          n.set(path.tx[k] * dir, path.ty[k] * dir, path.tz[k] * dir);
          const c = colorFn(k * path.spacing, 0, side);
          const ring = profile.map((pr) => samplePoint(path, k, side * (w + pr[0]), pr[1], [0, 0, 0]));
          for (let i = 1; i < P - 1; i++) {
            const tri = (side > 0) === (end === 1) ? [ring[0], ring[i], ring[i + 1]] : [ring[0], ring[i + 1], ring[i]];
            for (const pt of tri) {
              pos.push(pt[0], pt[1], pt[2]);
              nrm.push(n.x, n.y, n.z);
              col.push(c.r, c.g, c.b);
              uvs.push(0, 0);
            }
          }
        }
      }
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = name;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  ctx.root.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// Start / finish: checkered line + gantry with banner and start lights
// ---------------------------------------------------------------------------
export function buildStartLine(ctx, { style = 'classic', frameColor = 0xe8e8ee, accent = 0xd81e2b, neon = false } = {}) {
  const path = ctx.path;
  const group = new THREE.Group();
  group.name = 'StartFinish';
  // checkered decal across the road
  {
    const hw = path.hw[0];
    const rows = 7;
    const len = 3.2;
    const cols = 2;
    const pos = [];
    const uv = [];
    const idx = [];
    const f = { position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), distance: 0 };
    for (let r = 0; r < rows; r++) {
      const d = -len / 2 + (len * r) / (rows - 1);
      for (let c = 0; c < cols; c++) {
        const lat = c === 0 ? -hw : hw;
        path.frameAt(d, lat, f);
        f.position.addScaledVector(f.up, 0.02);
        pos.push(f.position.x, f.position.y, f.position.z);
        uv.push(c, r / (rows - 1));
      }
    }
    for (let r = 0; r < rows - 1; r++) {
      const a = r * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const tex = makeChecker({ cols: Math.round((hw * 2) / 1.6), rows: 2 });
    const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const m = new THREE.Mesh(geo, mat);
    m.receiveShadow = true;
    m.name = 'CheckerLine';
    group.add(m);
  }
  // gantry
  {
    const w0 = path.wall[0];
    const span = (Number.isNaN(w0) ? path.hw[0] + 3 : w0) + 1.6;
    const H = 9.5;
    const g = new THREE.Group();
    ctx.placeOnTrack(g, 0, 0, 0);
    const frameMat = neon
      ? new THREE.MeshStandardMaterial({ color: 0x15102a, emissive: frameColor, emissiveIntensity: 1.4, roughness: 0.4, metalness: 0.6 })
      : new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.45, metalness: 0.55 });
    const accentMat = neon
      ? new THREE.MeshBasicMaterial({ color: accent })
      : new THREE.MeshStandardMaterial({ color: accent, roughness: 0.5, metalness: 0.2 });
    const pillarGeo = new THREE.BoxGeometry(1.1, H, 1.1);
    for (const s of [-1, 1]) {
      const pl = new THREE.Mesh(pillarGeo, frameMat);
      pl.position.set(s * span, H / 2 - 0.5, 0);
      pl.castShadow = true;
      g.add(pl);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(2, 0.8, 2), accentMat);
      foot.position.set(s * span, -0.1, 0);
      g.add(foot);
      // pillar stripes
      for (let i = 0; i < 4; i++) {
        const st = new THREE.Mesh(new THREE.BoxGeometry(1.16, 0.45, 1.16), accentMat);
        st.position.set(s * span, 1.5 + i * 2, 0);
        g.add(st);
      }
    }
    // truss beam
    const beamLen = span * 2 + 1.1;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(beamLen, 0.35, 1.3), frameMat);
    beam.position.set(0, H - 0.2, 0);
    beam.castShadow = true;
    g.add(beam);
    const beam2 = beam.clone();
    beam2.position.y = H - 3.1;
    g.add(beam2);
    // banner both sides
    const bannerTex = makeBanner('TURBOKART', neon ? { bg: '#1a0b3a', bg2: '#0c0420', fg: '#ff5fe0', stroke: '#35f3ff' } : {});
    const bannerMat = neon
      ? new THREE.MeshBasicMaterial({ map: bannerTex, toneMapped: true })
      : new THREE.MeshStandardMaterial({ map: bannerTex, roughness: 0.65, emissive: 0xffffff, emissiveMap: bannerTex, emissiveIntensity: 0.12 });
    const bw = Math.min(beamLen - 2, 26);
    const bannerGeo = new THREE.PlaneGeometry(bw, bw * 0.1875);
    for (const s of [-1, 1]) {
      const b = new THREE.Mesh(bannerGeo, bannerMat);
      b.position.set(0, H - 1.65, s * 0.67);
      if (s < 0) b.rotation.y = Math.PI;
      g.add(b);
    }
    // start lights (decorative, 5 lamps) on top
    const lampGeo = new THREE.SphereGeometry(0.42, 16, 10);
    const housing = new THREE.Mesh(new THREE.BoxGeometry(6, 1.3, 1.0), new THREE.MeshStandardMaterial({ color: 0x15151c, roughness: 0.4, metalness: 0.4 }));
    housing.position.set(0, H + 0.75, 0);
    g.add(housing);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2a1a, emissiveIntensity: 0.6, roughness: 0.3 });
    for (let i = 0; i < 5; i++) {
      const l = new THREE.Mesh(lampGeo, lampMat);
      l.position.set(-2.4 + i * 1.2, H + 0.75, -0.42);
      g.add(l);
    }
    group.add(g);
    // flags on top of pillars
    ctx.gantry = g;
    ctx.gantrySpan = span;
    ctx.gantryHeight = H;
  }
  ctx.root.add(group);
  return group;
}

// ---------------------------------------------------------------------------
// Boost pads: animated glowing chevrons
// ---------------------------------------------------------------------------
const PAD_VERT = /* glsl */ `
varying vec2 vUv;
#include <fog_pars_vertex>
void main() {
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const PAD_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uEdge;
uniform float uGlow;
varying vec2 vUv;
#include <fog_pars_fragment>
void main() {
  float x = abs(vUv.x - 0.5) * 2.0;
  float ph = vUv.y * 2.6 - x * 0.5 - uTime * 2.4;
  float ch = fract(ph);
  float m = smoothstep(0.0, 0.06, ch) * (1.0 - smoothstep(0.4, 0.48, ch));
  float pulse = 0.75 + 0.25 * sin(uTime * 8.0 - vUv.y * 6.0);
  vec3 col = mix(uColB * 0.25, uColA * pulse, m * smoothstep(1.0, 0.82, x));
  float edge = max(smoothstep(0.86, 0.92, x), max(1.0 - smoothstep(0.03, 0.07, vUv.y), smoothstep(0.93, 0.97, vUv.y)));
  col = mix(col, uEdge, edge);
  gl_FragColor = vec4(col * uGlow, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export function buildBoostPads(ctx, { colA = 0xffb21f, colB = 0xff5a00, edge = 0xfff3c4, glow = 1.8 } = {}) {
  const path = ctx.path;
  if (!path.boostPads.length) return null;
  const pos = [];
  const uv = [];
  const idx = [];
  const f = { position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), distance: 0 };
  let base = 0;
  for (const pad of path.boostPads) {
    const rows = Math.ceil(pad.length / 0.5) + 1;
    for (let r = 0; r < rows; r++) {
      const d = pad.distance - pad.length / 2 + (pad.length * r) / (rows - 1);
      for (const c of [0, 1]) {
        const lat = pad.lateral + (c ? 0.5 : -0.5) * pad.width;
        path.frameAt(d, lat, f);
        f.position.addScaledVector(f.up, 0.035);
        pos.push(f.position.x, f.position.y, f.position.z);
        uv.push(c, r / (rows - 1));
      }
    }
    for (let r = 0; r < rows - 1; r++) {
      const a = base + r * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    base += rows * 2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uColA: { value: new THREE.Color(colA) },
      uColB: { value: new THREE.Color(colB) },
      uEdge: { value: new THREE.Color(edge) },
      uGlow: { value: glow },
    },
  ]);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: PAD_VERT,
    fragmentShader: PAD_FRAG,
    fog: true,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'BoostPads';
  ctx.root.add(mesh);
  ctx.animators.push((dt, time) => {
    uniforms.uTime.value = time;
  });
  return mesh;
}

// ---------------------------------------------------------------------------
// Ramps: wedge following the road, rising to `height` at the lip
// ---------------------------------------------------------------------------
export function buildRamps(ctx, { topColors, sideColor = 0x3a3a44, emissive = false } = {}) {
  const path = ctx.path;
  if (!path.ramps.length) return null;
  const tex = makeRampTexture(topColors || {});
  const topMat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.55,
    metalness: 0.2,
    emissive: emissive ? 0xffffff : 0x000000,
    emissiveMap: emissive ? tex : null,
    emissiveIntensity: emissive ? 0.9 : 0,
  });
  const sideMat = new THREE.MeshStandardMaterial({ color: sideColor, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide });
  const group = new THREE.Group();
  group.name = 'Ramps';
  const f = { position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), distance: 0 };
  for (const rp of path.ramps) {
    const rows = Math.ceil(rp.length / 0.5) + 1;
    const top = [];
    const topUv = [];
    const topIdx = [];
    const side = [];
    const ringL = [];
    const ringR = [];
    for (let r = 0; r < rows; r++) {
      const t = r / (rows - 1);
      const d = rp.startDistance + rp.length * t;
      const h = rp.height * t + 0.02;
      const pts = [];
      for (const c of [-0.5, 0.5]) {
        path.frameAt(d, rp.lateral + c * rp.width, f);
        const b = f.position.clone().addScaledVector(f.up, 0.01);
        const tp = f.position.clone().addScaledVector(f.up, h);
        pts.push([b, tp]);
      }
      ringL.push(pts[0]);
      ringR.push(pts[1]);
      top.push(pts[0][1].x, pts[0][1].y, pts[0][1].z, pts[1][1].x, pts[1][1].y, pts[1][1].z);
      topUv.push(0, (t * rp.length) / rp.width, 1, (t * rp.length) / rp.width);
    }
    for (let r = 0; r < rows - 1; r++) {
      const a = r * 2;
      topIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', new THREE.Float32BufferAttribute(top, 3));
    tg.setAttribute('uv', new THREE.Float32BufferAttribute(topUv, 2));
    tg.setIndex(topIdx);
    tg.computeVertexNormals();
    const tm = new THREE.Mesh(tg, topMat);
    tm.castShadow = true;
    tm.receiveShadow = true;
    group.add(tm);
    // sides + lip
    const pushQuad = (a, b, c, d) => side.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z);
    for (let r = 0; r < rows - 1; r++) {
      // left side faces -right: (bottom r, top r, bottom r+1, top r+1)
      pushQuad(ringL[r][0], ringL[r + 1][0], ringL[r][1], ringL[r + 1][1]);
      pushQuad(ringR[r][0], ringR[r][1], ringR[r + 1][0], ringR[r + 1][1]);
    }
    const lastL = ringL[rows - 1];
    const lastR = ringR[rows - 1];
    pushQuad(lastL[0], lastR[0], lastL[1], lastR[1]);
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(side, 3));
    sg.computeVertexNormals();
    const sm = new THREE.Mesh(sg, sideMat);
    sm.castShadow = true;
    sm.receiveShadow = true;
    group.add(sm);
  }
  ctx.root.add(group);
  return group;
}
