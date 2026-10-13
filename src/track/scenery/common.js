/**
 * Scenery building blocks shared by the themes.
 */
import * as THREE from 'three';
import { createRng, createNoise2D, smoothstep, clamp } from '../util.js';
import { PartsBuilder, lerpColor } from '../build/props.js';
import { makeCrowd, makeBoardAtlas, makeChevronSign, canvasTexture, createCanvas } from '../build/textures.js';
import { findRuns } from '../build/road.js';

// ---------------------------------------------------------------------------
// Point inside the closed centre line (infield test)
// ---------------------------------------------------------------------------
export function makeInsideTest(ctx) {
  const poly = ctx.path.outline(256);
  return (x, z) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i];
      const b = poly[j];
      if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
  };
}

// ---------------------------------------------------------------------------
// Largest empty spot (for lakes etc.)
// ---------------------------------------------------------------------------
export function findOpenSpot(ctx, { minClear = 30, maxClear = 140, step = 12, inside = null, avoid = [], prefer = null } = {}) {
  const path = ctx.path;
  const b = path.bounds;
  let best = null;
  const loc = {};
  for (let x = b.minX - 150; x <= b.maxX + 150; x += step) {
    for (let z = b.minZ - 150; z <= b.maxZ + 150; z += step) {
      const l = path.locate(x, z, maxClear + path.maxExtent + 10, loc);
      if (!l) continue;
      const clear = l.absLateral - l.extent;
      if (clear < minClear) continue;
      let ok = true;
      for (const a of avoid) if ((x - a.x) ** 2 + (z - a.z) ** 2 < (a.r + clear) ** 2) ok = false;
      if (!ok) continue;
      const score = Math.min(clear, maxClear) + (prefer ? prefer(x, z) : 0);
      if (!best || score > best.score) best = { x, z, clear, score };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Irregular blob shape (lake / ice) helpers
// ---------------------------------------------------------------------------
export function makeBlob(x, z, r, seed = 1) {
  const rng = createRng(seed);
  const a = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
  const radiusAt = (ang) => r * (1 + 0.16 * Math.sin(3 * ang + a[0]) + 0.08 * Math.sin(5 * ang + a[1]) + 0.05 * Math.sin(7 * ang + a[2]));
  return {
    x,
    z,
    r,
    radiusAt,
    /** normalised radius: 1 on the shoreline */
    rel(px, pz) {
      const dx = px - x;
      const dz = pz - z;
      const ang = Math.atan2(dz, dx);
      return Math.hypot(dx, dz) / radiusAt(ang);
    },
  };
}

// ---------------------------------------------------------------------------
// Animated water / ice surface
// ---------------------------------------------------------------------------
const WATER_VERT = /* glsl */ `
attribute float aShore;
varying float vShore;
varying vec3 vWPos;
#include <fog_pars_vertex>
void main() {
  vShore = aShore;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWPos = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;
const WATER_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform vec3 uSky;
uniform vec3 uHorizon;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uIce;
varying float vShore;
varying vec3 vWPos;
#include <fog_pars_fragment>
float wh(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
float wn(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(wh(i), wh(i+vec2(1,0)), f.x), mix(wh(i+vec2(0,1)), wh(i+vec2(1,1)), f.x), f.y); }
void main() {
  vec2 p = vWPos.xz;
  float t = uTime * (1.0 - uIce);
  // procedural ripples (sum of travelling noise layers)
  float e = 0.35;
  float h0 = wn(p * 0.35 + vec2(t * 0.35, t * 0.2)) + 0.5 * wn(p * 0.9 - vec2(t * 0.5, -t * 0.3)) + 0.25 * wn(p * 2.3 + vec2(-t * 0.8, t * 0.6));
  float hx = wn((p + vec2(e, 0.0)) * 0.35 + vec2(t * 0.35, t * 0.2)) + 0.5 * wn((p + vec2(e, 0.0)) * 0.9 - vec2(t * 0.5, -t * 0.3)) + 0.25 * wn((p + vec2(e, 0.0)) * 2.3 + vec2(-t * 0.8, t * 0.6));
  float hz = wn((p + vec2(0.0, e)) * 0.35 + vec2(t * 0.35, t * 0.2)) + 0.5 * wn((p + vec2(0.0, e)) * 0.9 - vec2(t * 0.5, -t * 0.3)) + 0.25 * wn((p + vec2(0.0, e)) * 2.3 + vec2(-t * 0.8, t * 0.6));
  float strength = mix(0.55, 0.12, uIce);
  vec3 n = normalize(vec3(-(hx - h0) / e * strength, 1.0, -(hz - h0) / e * strength));
  vec3 v = normalize(cameraPosition - vWPos);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  vec3 r = reflect(-v, n);
  vec3 sky = mix(uHorizon, uSky, clamp(r.y * 1.6, 0.0, 1.0));
  vec3 body = mix(uShallow, uDeep, smoothstep(0.55, 0.95, 1.0 - vShore));
  vec3 col = mix(body, sky, clamp(0.12 + fres * 0.8, 0.0, 1.0));
  float spec = pow(max(dot(r, uSunDir), 0.0), mix(180.0, 60.0, uIce));
  col += uSunColor * spec * mix(2.2, 0.9, uIce);
  // shoreline foam / frost rim
  float foam = smoothstep(0.88, 0.98, vShore) * (0.6 + 0.4 * wn(p * 1.5 + t * 0.4));
  col = mix(col, vec3(1.0), foam * mix(0.65, 0.85, uIce));
  if (uIce > 0.5) {
    // cracks
    float c1 = abs(wn(p * 0.12) - 0.5);
    float c2 = abs(wn(p * 0.31 + 7.0) - 0.5);
    float crack = (1.0 - smoothstep(0.0, 0.02, c1)) * 0.6 + (1.0 - smoothstep(0.0, 0.015, c2)) * 0.4;
    col = mix(col, vec3(0.95, 0.98, 1.0), crack * 0.7);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

export function buildWater(ctx, blob, level, { deep = 0x1a6a8a, shallow = 0x4fc3c7, ice = false, segments = 72 } = {}) {
  const rings = 14;
  const pos = [];
  const shore = [];
  const idx = [];
  pos.push(blob.x, level, blob.z);
  shore.push(0);
  for (let r = 1; r <= rings; r++) {
    const t = (r / rings) * 1.18;
    for (let s = 0; s < segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const R = blob.radiusAt(a) * t;
      pos.push(blob.x + Math.cos(a) * R, level, blob.z + Math.sin(a) * R);
      shore.push(t);
    }
  }
  for (let s = 0; s < segments; s++) idx.push(0, 1 + ((s + 1) % segments), 1 + s);
  for (let r = 1; r < rings; r++) {
    const b0 = 1 + (r - 1) * segments;
    const b1 = 1 + r * segments;
    for (let s = 0; s < segments; s++) {
      const s1 = (s + 1) % segments;
      idx.push(b0 + s, b0 + s1, b1 + s, b0 + s1, b1 + s1, b1 + s);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aShore', new THREE.Float32BufferAttribute(shore, 1));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const sky = ctx.style.sky;
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(deep) },
      uShallow: { value: new THREE.Color(shallow) },
      uSky: { value: new THREE.Color(sky.zenith).lerp(new THREE.Color(sky.horizon), 0.35) },
      uHorizon: { value: new THREE.Color(sky.horizon) },
      uSunDir: { value: ctx.track.sunDirection.clone() },
      uSunColor: { value: new THREE.Color(ctx.style.sun.color) },
      uIce: { value: ice ? 1 : 0 },
    },
  ]);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: WATER_VERT, fragmentShader: WATER_FRAG, fog: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = ice ? 'Ice' : 'Water';
  mesh.receiveShadow = false;
  ctx.root.add(mesh);
  ctx.animators.push((dt, time) => {
    uniforms.uTime.value = time;
  });
  return mesh;
}

// ---------------------------------------------------------------------------
// Distant backdrop ring (mountains / hills / mesas). Rendered without fog but
// pre-hazed toward the horizon colour so silhouettes stay readable.
// ---------------------------------------------------------------------------
export function buildBackdrop(ctx, { radius = 1500, height = 160, base = -20, colorLow = 0x4f7a5a, colorHigh = 0x9fb8c0, haze = 0.55, seed = 3, segments = 220, rows = 6, shape = 'hills', snow = 0, snowColor = 0xf4f7ff } = {}) {
  const noise = createNoise2D(seed);
  const cx = (ctx.path.bounds.minX + ctx.path.bounds.maxX) / 2;
  const cz = (ctx.path.bounds.minZ + ctx.path.bounds.maxZ) / 2;
  const hz = new THREE.Color(ctx.style.sky.horizon);
  const fogC = new THREE.Color(ctx.theme.fogColor);
  const lo = new THREE.Color(colorLow);
  const hi = new THREE.Color(colorHigh);
  const sn = new THREE.Color(snowColor);
  const pos = [];
  const col = [];
  const idx = [];
  const c = new THREE.Color();
  const heightAt = (a) => {
    const u = a * 6;
    let h;
    if (shape === 'mesa') {
      const n = noise.fbm(u, 0.5, 3) * 0.5 + 0.5;
      const step = Math.floor(n * 4) / 4;
      h = smoothstep(0.35, 0.55, n) * (0.4 + step * 0.8);
    } else if (shape === 'peaks') {
      h = Math.pow(noise.ridged(u * 0.9, 3.3, 5), 1.6) * 1.25;
    } else {
      h = (noise.fbm(u, 1.7, 4) * 0.5 + 0.5) * 0.8 + 0.1;
    }
    return h;
  };
  const hts = [];
  for (let r = 0; r <= rows; r++) {
    const t = r / rows;
    for (let s = 0; s <= segments; s++) {
      const a = (s / segments) * Math.PI * 2;
      const hh = heightAt(a);
      const prof = shape === 'mesa' ? Math.min(1, t * 3.2) : Math.sin((t * Math.PI) / 2);
      const H = base + hh * height * prof;
      const R = radius + (shape === 'mesa' ? (t > 0.31 ? height * 0.6 * (t - 0.31) : 0) : t * height * 2.2);
      pos.push(cx + Math.cos(a) * R, H, cz + Math.sin(a) * R);
      hts.push(clamp((H - base) / height, 0, 1));
    }
  }
  const W = segments + 1;
  for (let r = 0; r < rows; r++) {
    for (let s = 0; s < segments; s++) {
      const a = r * W + s;
      const b = a + 1;
      const d = a + W;
      const e = d + 1;
      idx.push(a, d, b, b, d, e);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // bake simple sun shading so the unlit silhouettes still read as 3D shapes
  const nrm = geo.attributes.normal;
  const sunD = ctx.track.sunDirection;
  const hazeC = fogC.clone().lerp(hz, 0.5);
  for (let i = 0; i < hts.length; i++) {
    const ht = hts[i];
    c.copy(lo).lerp(hi, ht * 0.85);
    if (snow && ht > 1 - snow) c.lerp(sn, smoothstep(1 - snow, 1 - snow + 0.1, ht));
    // normals point inward (toward the track); flip for lighting from the sun side
    const ndl = -(nrm.getX(i) * sunD.x + nrm.getY(i) * sunD.y + nrm.getZ(i) * sunD.z);
    const up = Math.max(0, -nrm.getY(i));
    c.multiplyScalar(0.62 + 0.5 * Math.max(0, ndl) + 0.12 * up);
    c.lerp(hazeC, Math.min(0.92, haze + (1 - ht) * 0.12));
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'Backdrop';
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  ctx.root.add(mesh);
  return mesh;
}

// ---------------------------------------------------------------------------
// Grandstand with crowd, along the track at [d0, d1] on `side` (+1 right/-1 left)
// ---------------------------------------------------------------------------
export function buildGrandstand(ctx, { d0, d1, side = -1, gap = 4, tiers = 7, roofColor = 0xd8272a, frameColor = 0xe9e9ef, seed = 1 }) {
  const path = ctx.path;
  const group = new THREE.Group();
  group.name = 'Grandstand';
  const len = d1 - d0;
  const dm = (d0 + d1) / 2;
  const k = Math.floor(path.wrapDistance(dm) / path.spacing) % path.count;
  const wall = Number.isNaN(path.wall[k]) ? path.hw[k] + 2 : path.wall[k];
  ctx.placeOnTrack(group, dm, side * (wall + gap), 0);
  // local frame: +X = left, +Z = forward. Stand extends away from the track.
  const away = -side; // local x direction pointing away from the road
  const b = new PartsBuilder();
  const depthStep = 1.5;
  const rise = 0.95;
  for (let i = 0; i < tiers; i++) {
    b.add(new THREE.BoxGeometry(depthStep, rise * (i + 1), len), (p, n, out) => out.set(n.y > 0.5 ? 0x8b90a0 : 0x6a7080), { p: [away * (i * depthStep + depthStep / 2), (rise * (i + 1)) / 2, 0] });
  }
  // back wall + pillars + roof
  const backX = away * (tiers * depthStep + 0.3);
  b.add(new THREE.BoxGeometry(0.6, rise * tiers + 5, len), frameColor, { p: [backX, (rise * tiers + 5) / 2, 0] });
  const pillars = Math.max(2, Math.round(len / 12));
  for (let i = 0; i <= pillars; i++) {
    const z = -len / 2 + (len * i) / pillars;
    b.add(new THREE.BoxGeometry(0.45, rise * tiers + 4.6, 0.45), frameColor, { p: [away * 0.2, (rise * tiers + 4.6) / 2, z] });
  }
  b.add(new THREE.BoxGeometry(tiers * depthStep + 2.4, 0.4, len + 1.2), (p, n, out) => out.set(n.y > 0.5 ? roofColor : 0xf0f0f0), { p: [away * (tiers * depthStep * 0.5), rise * tiers + 4.8, 0], r: [0, 0, away * 0.08] });
  // front panel
  b.add(new THREE.BoxGeometry(0.3, 1.3, len), 0x2a3550, { p: [away * -0.15, 0.65, 0] });
  const geo = b.build();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  group.add(m);
  // crowd: one sloped plane over the tiers
  const crowdTex = makeCrowd({ seed });
  crowdTex.repeat.set(len / 30, 1);
  const slopeLen = Math.hypot(tiers * depthStep, tiers * rise);
  const crowdGeo = new THREE.PlaneGeometry(len, slopeLen);
  const crowdMat = new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 0.9 });
  const crowd = new THREE.Mesh(crowdGeo, crowdMat);
  // plane faces +Z; rotate so it faces the road (local -away x) and tilts up along the stand
  crowd.rotation.order = 'YXZ';
  crowd.rotation.y = away > 0 ? -Math.PI / 2 : Math.PI / 2;
  crowd.rotation.x = -(Math.PI / 2 - Math.atan2(tiers * rise, tiers * depthStep));
  crowd.position.set(away * (tiers * depthStep) / 2 + away * 0.05, (tiers * rise) / 2 + 0.55, 0);
  crowd.receiveShadow = true;
  group.add(crowd);
  ctx.root.add(group);
  ctx.animators.push((dt, time) => {
    crowdTex.offset.y = Math.abs(Math.sin(time * 7.0)) * 0.006;
  });
  return group;
}

// ---------------------------------------------------------------------------
// Waving flags (instanced). items: [{x,y,z,ry,color}]
// ---------------------------------------------------------------------------
export function buildFlags(ctx, items, { w = 2.6, h = 1.6, poleH = 7 } = {}) {
  if (!items.length) return null;
  const geo = new THREE.PlaneGeometry(w, h, 10, 4);
  geo.translate(w / 2, poleH - h / 2, 0);
  const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.8 });
  const uTime = { value: 0 };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float fx = clamp(transformed.x / ${w.toFixed(2)}, 0.0, 1.0);
        float ph = uTime * 6.0 + transformed.x * 1.6 + float(gl_InstanceID) * 1.7;
        transformed.z += sin(ph) * 0.35 * fx;
        transformed.y += cos(ph * 0.7) * 0.08 * fx;`,
      );
  };
  mat.customProgramCacheKey = () => 'flag';
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const pole = new THREE.CylinderGeometry(0.07, 0.09, poleH, 6);
  pole.translate(0, poleH / 2, 0);
  const poleMesh = new THREE.InstancedMesh(pole, new THREE.MeshStandardMaterial({ color: 0xe6e6ea, metalness: 0.6, roughness: 0.35 }), items.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  items.forEach((it, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.ry || 0);
    m4.compose(new THREE.Vector3(it.x, it.y, it.z), q, one);
    mesh.setMatrixAt(i, m4);
    poleMesh.setMatrixAt(i, m4);
    mesh.setColorAt(i, new THREE.Color(it.color ?? 0xff3b3b));
  });
  mesh.castShadow = true;
  poleMesh.castShadow = true;
  mesh.computeBoundingSphere();
  poleMesh.computeBoundingSphere();
  ctx.root.add(mesh, poleMesh);
  ctx.animators.push((dt, time) => {
    uTime.value = time;
  });
  return mesh;
}

// ---------------------------------------------------------------------------
// Trackside boards (atlas) on top of the barriers and chevron signs at corners
// ---------------------------------------------------------------------------
export function buildBoards(ctx, entries, { every = 70, minCurv = 0, height = 1.15, boardH = 1.6, boardW = 8, sideFilter = 0, offset = 0.3 } = {}) {
  const path = ctx.path;
  const atlas = makeBoardAtlas(entries);
  const rowsN = entries.length;
  const items = [];
  const N = path.count;
  for (let d = 20; d < path.length - 20; d += every) {
    const k = Math.floor(d / path.spacing) % N;
    if (Number.isNaN(path.wall[k])) continue;
    const c = path.curvature[k];
    if (Math.abs(c) < minCurv) continue;
    // boards on the outside of the bend (or both sides on straights)
    const sides = Math.abs(c) > 1 / 200 ? [c > 0 ? -1 : 1] : [-1, 1];
    for (const side of sides) {
      if (sideFilter && side !== sideFilter) continue;
      items.push({ d, side, row: items.length % rowsN });
    }
  }
  if (!items.length) return null;
  const geo = new THREE.PlaneGeometry(boardW, boardH);
  const rowAttr = new Float32Array(items.length);
  const mat = new THREE.MeshStandardMaterial({ map: atlas.texture, roughness: 0.6, emissive: 0xffffff, emissiveMap: atlas.texture, emissiveIntensity: 0.08 });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float aRow;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>\n#ifdef USE_MAP\n vMapUv = vec2(uv.x, (uv.y + ${rowsN - 1}.0 - aRow) / ${rowsN}.0);\n#endif\n#ifdef USE_EMISSIVEMAP\n vEmissiveMapUv = vMapUv;\n#endif`);
  };
  mat.customProgramCacheKey = () => `boards-${rowsN}`;
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const o = new THREE.Object3D();
  items.forEach((it, i) => {
    const k = Math.floor(it.d / path.spacing) % N;
    ctx.placeOnTrack(o, it.d, it.side * (path.wall[k] + offset), height + boardH / 2);
    // face the road: plane normal (+Z local) should point toward the track centre
    o.rotateY(it.side > 0 ? Math.PI / 2 : -Math.PI / 2);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    rowAttr[i] = it.row;
  });
  geo.setAttribute('aRow', new THREE.InstancedBufferAttribute(rowAttr, 1));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.computeBoundingSphere();
  mesh.name = 'Boards';
  ctx.root.add(mesh);
  // backs
  const backMat = new THREE.MeshStandardMaterial({ color: 0x30333d, roughness: 0.7 });
  const back = new THREE.InstancedMesh(new THREE.BoxGeometry(boardW + 0.3, boardH + 0.3, 0.2), backMat, items.length);
  items.forEach((it, i) => {
    const k = Math.floor(it.d / path.spacing) % N;
    ctx.placeOnTrack(o, it.d, it.side * (path.wall[k] + offset + 0.12), height + boardH / 2);
    o.rotateY(it.side > 0 ? Math.PI / 2 : -Math.PI / 2);
    o.updateMatrix();
    back.setMatrixAt(i, o.matrix);
  });
  back.castShadow = true;
  back.computeBoundingSphere();
  ctx.root.add(back);
  return mesh;
}

export function buildChevrons(ctx, { minCurv = 1 / 45, spacing = 9, height = 1.1, colors } = {}) {
  const path = ctx.path;
  const N = path.count;
  const runs = findRuns(N, (k) => Math.abs(path.curvature[k]) > minCurv && !Number.isNaN(path.wall[k]));
  const items = [];
  for (const run of runs) {
    if (run.end - run.start < 10) continue;
    for (let r = run.start + 2; r < run.end - 2; r += spacing) {
      const k = r % N;
      const side = path.curvature[k] > 0 ? -1 : 1; // outside of the bend
      items.push({ k, side, dir: path.curvature[k] > 0 ? 1 : -1 });
    }
  }
  if (!items.length) return null;
  const tex = makeChevronSign(colors || {});
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, side: THREE.DoubleSide, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.15 });
  const geo = new THREE.PlaneGeometry(2.6, 1.3);
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const o = new THREE.Object3D();
  items.forEach((it, i) => {
    const d = it.k * path.spacing;
    ctx.placeOnTrack(o, d, it.side * (path.wall[it.k] + 0.4), height + 0.65);
    // face oncoming karts (-Z local), mirrored for left-hand bends
    o.rotateY(Math.PI);
    if (it.dir < 0) o.scale.set(-1, 1, 1);
    else o.scale.set(1, 1, 1);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  });
  mesh.castShadow = true;
  mesh.computeBoundingSphere();
  mesh.name = 'Chevrons';
  ctx.root.add(mesh);
  // posts
  const post = new THREE.CylinderGeometry(0.07, 0.07, height + 1.3, 5);
  post.translate(0, (height + 1.3) / 2, 0);
  const postMesh = new THREE.InstancedMesh(post, new THREE.MeshStandardMaterial({ color: 0x777a80, metalness: 0.6, roughness: 0.4 }), items.length * 2);
  let j = 0;
  items.forEach((it) => {
    const d = it.k * path.spacing;
    for (const off of [-1.0, 1.0]) {
      ctx.placeOnTrack(o, d + off, it.side * (path.wall[it.k] + 0.45), 0);
      o.scale.set(1, 1, 1);
      o.updateMatrix();
      postMesh.setMatrixAt(j++, o.matrix);
    }
  });
  postMesh.computeBoundingSphere();
  ctx.root.add(postMesh);
  return mesh;
}

/** Text label texture helper for one-off signs. */
export function makeSignTexture(text, { bg = '#1d3b8f', fg = '#fff', w = 512, h = 128 } = {}) {
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.strokeRect(6, 6, w - 12, h - 12);
  g.fillStyle = fg;
  g.font = `900 ${h * 0.5}px Lilita One, Impact, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  return canvasTexture(c, { repeat: false });
}

export { lerpColor };

// ---------------------------------------------------------------------------
// Tunnel shell (arch interior + flat-topped cap + portals) over [d0, d1]
// ---------------------------------------------------------------------------
export function buildTunnel(ctx, d0, d1, { wallH = 4.5, archH = 8.5, topH = 24, outer = 26, material, step = 1 } = {}) {
  const path = ctx.path;
  const tile = ctx.groundTile;
  const k0 = Math.floor(path.wrapDistance(d0) / path.spacing);
  const w = path.wall[k0];
  const section = [];
  section.push([-w, 0], [-w, wallH]);
  const AS = 14;
  for (let i = 1; i < AS; i++) {
    const a = Math.PI * (1 - i / AS);
    section.push([w * Math.cos(a), wallH + archH * Math.sin(a)]);
  }
  section.push([w, wallH], [w, 0], [w + outer, -2]);
  // rocky dome over the top (right -> left)
  const TOPN = 9;
  for (let i = 0; i <= TOPN; i++) {
    const t = i / TOPN; // 0 = right edge, 1 = left edge
    const x = (w + outer) * (1 - 2 * t);
    const dome = Math.sin(Math.PI * Math.min(1, Math.max(0, (t - 0.0) / 1.0)));
    const y = i === 0 || i === TOPN ? topH * 0.55 : topH * (0.8 + 0.2 * dome);
    section.push([x * (i === 0 || i === TOPN ? 1 : 0.97), y]);
  }
  section.push([-(w + outer), -2]);
  const S = section.length;
  const innerCount = AS + 3;
  const rows = [];
  for (let d = d0; d <= d1 + 1e-6; d += step) rows.push(d);
  const pos = [];
  const uv = [];
  const col = [];
  const f = { position: new THREE.Vector3(), tangent: new THREE.Vector3(), right: new THREE.Vector3(), up: new THREE.Vector3(), distance: 0 };
  const ringAt = (d) => {
    path.frameAt(d, 0, f);
    return section.map(([l, u]) => {
      const p = f.position.clone().addScaledVector(f.right, l).addScaledVector(f.up, u);
      return p;
    });
  };
  const nz = (p) => Math.sin(p.x * 0.21 + p.z * 0.13) * Math.cos(p.z * 0.17 - p.x * 0.07) + Math.sin(p.x * 0.53 - p.y * 0.4 + p.z * 0.31) * 0.5;
  const ringAtBase = ringAt;
  const ringAtRough = (d) =>
    ringAtBase(d).map((p, i) => {
      if (i < innerCount) return p;
      const n = nz(p);
      return p.clone().addScaledVector(f.up, n * 1.6).addScaledVector(f.right, Math.sign(section[i][0]) * n * 1.2);
    });
  let prev = ringAtRough(rows[0]);
  const push = (p) => {
    pos.push(p.x, p.y, p.z);
    uv.push(p.x / tile, p.z / tile);
    col.push(1, 1, 1);
  };
  for (let r = 1; r < rows.length; r++) {
    const cur = ringAtRough(rows[r]);
    for (let e = 0; e < S - 1; e++) {
      const a = prev[e];
      const b = prev[e + 1];
      const c = cur[e];
      const d = cur[e + 1];
      // inner surface faces inward; with lateral increasing left->right over the top,
      // (a, c, b) (b, c, d) faces toward the tunnel interior
      push(a);
      push(c);
      push(b);
      push(b);
      push(c);
      push(d);
    }
    prev = cur;
  }
  // portals
  const shape = new THREE.Shape();
  shape.moveTo(-(w + outer), -2);
  for (let i = innerCount; i < S; i++) shape.lineTo(section[i][0], section[i][1]);
  shape.lineTo(-(w + outer), -2);
  const hole = new THREE.Path();
  for (let i = 0; i < innerCount; i++) {
    const [l, u] = section[i];
    if (i === 0) hole.moveTo(l, u);
    else hole.lineTo(l, u);
  }
  hole.lineTo(-w, 0);
  shape.holes.push(hole);
  const sg = new THREE.ShapeGeometry(shape, 6).toNonIndexed();
  for (const [d, flip] of [
    [d0, false],
    [d1, true],
  ]) {
    path.frameAt(d, 0, f);
    const sp = sg.attributes.position;
    const tri = [];
    for (let i = 0; i < sp.count; i++) {
      tri.push(f.position.clone().addScaledVector(f.right, sp.getX(i)).addScaledVector(f.up, sp.getY(i)));
    }
    for (let i = 0; i < tri.length; i += 3) {
      if (flip) {
        push(tri[i]);
        push(tri[i + 2]);
        push(tri[i + 1]);
      } else {
        push(tri[i]);
        push(tri[i + 1]);
        push(tri[i + 2]);
      }
    }
  }
  sg.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'Tunnel';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  ctx.root.add(mesh);
  return { mesh, wall: w, section };
}

/**
 * Bake simple lighting + atmospheric haze into vertex colours of a far-away
 * prop and render it unlit/unfogged so it stays readable on the horizon.
 */
export function makeFarMesh(ctx, geo, { haze = 0.5, light = 1 } = {}) {
  const sunD = ctx.track.sunDirection;
  const hz = new THREE.Color(ctx.theme.fogColor).lerp(new THREE.Color(ctx.style.sky.horizon), 0.5);
  const col = geo.attributes.color;
  const nrm = geo.attributes.normal;
  const c = new THREE.Color();
  for (let i = 0; i < col.count; i++) {
    c.setRGB(col.getX(i), col.getY(i), col.getZ(i));
    const ndl = nrm.getX(i) * sunD.x + nrm.getY(i) * sunD.y + nrm.getZ(i) * sunD.z;
    c.multiplyScalar((0.55 + 0.6 * Math.max(0, ndl)) * light);
    c.lerp(hz, haze);
    col.setXYZ(i, c.r, c.g, c.b);
  }
  col.needsUpdate = true;
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
  m.renderOrder = -5;
  ctx.root.add(m);
  return m;
}
