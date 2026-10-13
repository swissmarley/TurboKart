/**
 * Terrain heightfield around the track.
 *  - tensor grid: fine spacing over the track area, growing toward the edges
 *  - inside the road corridor the ground sits just under the road plane (the
 *    off-road ribbon covers it), then blends to the theme's natural height
 *  - chunked meshes for frustum culling, normals from the global grid (seamless)
 *  - exact heightAt(x,z) (same triangulation as the mesh) for prop placement
 */
import * as THREE from 'three';
import { clamp, smoothstep } from '../util.js';

function makeAxis(min, max, innerMin, innerMax, fine, coarse) {
  const xs = [];
  // inner uniform
  const n = Math.max(1, Math.ceil((innerMax - innerMin) / fine));
  const inner = [];
  for (let i = 0; i <= n; i++) inner.push(innerMin + ((innerMax - innerMin) * i) / n);
  // outer growing spacing
  const grow = (from, to, dir) => {
    const pts = [];
    let x = from;
    let s = fine;
    while (dir > 0 ? x < to : x > to) {
      s = Math.min(coarse, s * 1.12);
      x += dir * s;
      pts.push(dir > 0 ? Math.min(x, to) : Math.max(x, to));
    }
    return pts;
  };
  const left = grow(innerMin, min, -1).reverse();
  const right = grow(innerMax, max, 1);
  xs.push(...left, ...inner, ...right);
  return Float64Array.from(xs);
}

/** Smooth large-scale "track height" field (inverse-distance weighted). */
function makeBaseField(path, minX, maxX, minZ, maxZ) {
  const step = 25;
  const nx = Math.ceil((maxX - minX) / step) + 1;
  const nz = Math.ceil((maxZ - minZ) / step) + 1;
  const pts = [];
  for (let k = 0; k < path.count; k += 8) pts.push([path.px[k], path.pz[k], path.py[k]]);
  const field = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = minX + i * step;
      const z = minZ + j * step;
      let ws = 0;
      let hs = 0;
      for (const p of pts) {
        const d2 = (p[0] - x) ** 2 + (p[1] - z) ** 2;
        const w = 1 / Math.pow(d2 + 900, 1.6);
        ws += w;
        hs += w * p[2];
      }
      field[j * nx + i] = hs / ws;
    }
  }
  return (x, z) => {
    const fx = clamp((x - minX) / step, 0, nx - 1.001);
    const fz = clamp((z - minZ) / step, 0, nz - 1.001);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const a = field[j * nx + i];
    const b = field[j * nx + i + 1];
    const c = field[(j + 1) * nx + i];
    const d = field[(j + 1) * nx + i + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
}

/**
 * @param {object} ctx  world context
 * @param {object} cfg  { natural(x,z,base,loc), color(x,z,h,ny,loc,out), material,
 *                        margin, fine, coarse, blend, apron, lower, noCorridor(d) }
 */
export async function buildTerrain(ctx, cfg) {
  const path = ctx.path;
  const b = path.bounds;
  const margin = cfg.margin ?? 480;
  const fine = cfg.fine ?? 3;
  const coarse = cfg.coarse ?? 16;
  const blend = cfg.blend ?? 22;
  const apron = cfg.apron ?? ctx.apron;
  const lower = cfg.lower ?? 0.32;
  const pad = path.maxExtent + 40;
  const minX = b.minX - margin;
  const maxX = b.maxX + margin;
  const minZ = b.minZ - margin;
  const maxZ = b.maxZ + margin;
  const xs = makeAxis(minX, maxX, b.minX - pad, b.maxX + pad, fine, coarse);
  const zs = makeAxis(minZ, maxZ, b.minZ - pad, b.maxZ + pad, fine, coarse);
  const NX = xs.length;
  const NZ = zs.length;
  const base = makeBaseField(path, minX, maxX, minZ, maxZ);
  ctx.baseHeight = base;
  if (cfg.onBase) cfg.onBase(base);
  const searchR = path.maxExtent + apron + blend + 6;
  const loc = {};
  const H = new Float32Array(NX * NZ);
  const NEAR = new Float32Array(NX * NZ); // signed: |lateral| - extent (m), large if far
  const noCorr = cfg.noCorridor;

  const heightFn = (x, z, info) => {
    const l = path.locate(x, z, searchR, loc);
    const nat = cfg.natural(x, z, base(x, z), l);
    if (!l) {
      if (info) info.near = 999;
      return nat;
    }
    const edge = l.extent + apron;
    const latC = clamp(l.lateral, -edge, edge);
    const ry = (l.planeHeight - l.centerY) / (Math.abs(l.lateral) > 1e-6 ? l.lateral : 1);
    const hc = l.centerY + ry * latC - lower;
    let t = smoothstep(edge + 0.6, edge + 0.6 + blend, l.absLateral);
    let n2 = nat;
    if (noCorr) {
      const nc = noCorr(l.distance, l.lateral);
      if (nc > 0) {
        // bridge: open the corridor, but never let the ground rise into the deck
        const under = hc - 4 - 8 * nc;
        const lat = 1 - smoothstep(edge + blend, edge + blend * 2.5, l.absLateral);
        n2 = Math.min(nat, nat + (under - nat) * lat);
        n2 = Math.min(n2, hc - 3 + 30 * (1 - lat));
        t = Math.max(t, nc);
      }
    }
    if (info) info.near = l.absLateral - l.extent;
    return hc + (n2 - hc) * t;
  };
  ctx.terrainHeightFn = heightFn;

  const info = { near: 0 };
  let row = 0;
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      H[k] = heightFn(xs[i], zs[j], info);
      NEAR[k] = info.near;
    }
    if (++row % 60 === 0) await ctx.yield();
  }
  if (cfg.postProcess) cfg.postProcess(H, xs, zs, NX, NZ);

  // normals from the global grid
  const NRM = new Float32Array(NX * NZ * 3);
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const i0 = Math.max(0, i - 1);
      const i1 = Math.min(NX - 1, i + 1);
      const j0 = Math.max(0, j - 1);
      const j1 = Math.min(NZ - 1, j + 1);
      const dhdx = (H[j * NX + i1] - H[j * NX + i0]) / (xs[i1] - xs[i0]);
      const dhdz = (H[j1 * NX + i] - H[j0 * NX + i]) / (zs[j1] - zs[j0]);
      const l = Math.hypot(dhdx, 1, dhdz);
      const k = (j * NX + i) * 3;
      NRM[k] = -dhdx / l;
      NRM[k + 1] = 1 / l;
      NRM[k + 2] = -dhdz / l;
    }
  }

  // colours
  const COL = new Float32Array(NX * NZ * 3);
  const c3 = [0, 0, 0];
  for (let j = 0; j < NZ; j++) {
    for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      cfg.color(xs[i], zs[j], H[k], NRM[k * 3 + 1], NEAR[k], c3);
      COL[k * 3] = c3[0];
      COL[k * 3 + 1] = c3[1];
      COL[k * 3 + 2] = c3[2];
    }
  }
  await ctx.yield();

  // chunked meshes
  const CH = cfg.chunk ?? 56;
  const group = new THREE.Group();
  group.name = 'Terrain';
  const tile = cfg.uvTile ?? ctx.groundTile;
  for (let cj = 0; cj < NZ - 1; cj += CH) {
    for (let ci = 0; ci < NX - 1; ci += CH) {
      const i1 = Math.min(NX - 1, ci + CH);
      const j1 = Math.min(NZ - 1, cj + CH);
      const w = i1 - ci + 1;
      const h = j1 - cj + 1;
      const pos = new Float32Array(w * h * 3);
      const nrm = new Float32Array(w * h * 3);
      const col = new Float32Array(w * h * 3);
      const uv = new Float32Array(w * h * 2);
      let p = 0;
      for (let j = cj; j <= j1; j++) {
        for (let i = ci; i <= i1; i++) {
          const k = j * NX + i;
          pos[p * 3] = xs[i];
          pos[p * 3 + 1] = H[k];
          pos[p * 3 + 2] = zs[j];
          nrm[p * 3] = NRM[k * 3];
          nrm[p * 3 + 1] = NRM[k * 3 + 1];
          nrm[p * 3 + 2] = NRM[k * 3 + 2];
          col[p * 3] = COL[k * 3];
          col[p * 3 + 1] = COL[k * 3 + 1];
          col[p * 3 + 2] = COL[k * 3 + 2];
          uv[p * 2] = xs[i] / tile;
          uv[p * 2 + 1] = zs[j] / tile;
          p++;
        }
      }
      const idx = [];
      for (let y = 0; y < h - 1; y++) {
        for (let x = 0; x < w - 1; x++) {
          const a = y * w + x;
          const bq = a + 1;
          const c = a + w;
          const d = c + 1;
          // a=(i,j) b=(i+1,j) c=(i,j+1) d=(i+1,j+1); diagonal c-b (matches heightAt)
          idx.push(a, c, bq, c, d, bq);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setIndex(w * h > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      const mesh = new THREE.Mesh(geo, cfg.material);
      mesh.receiveShadow = true;
      mesh.castShadow = !!cfg.castShadow;
      mesh.name = `TerrainChunk_${ci}_${cj}`;
      group.add(mesh);
    }
  }
  ctx.root.add(group);

  // exact height lookup (same triangulation)
  const findCell = (arr, v) => {
    let lo = 0;
    let hi = arr.length - 1;
    if (v <= arr[0]) return 0;
    if (v >= arr[hi]) return hi - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (arr[m] <= v) lo = m;
      else hi = m;
    }
    return lo;
  };
  const heightAt = (x, z) => {
    const i = findCell(xs, x);
    const j = findCell(zs, z);
    const u = clamp((x - xs[i]) / (xs[i + 1] - xs[i]), 0, 1);
    const v = clamp((z - zs[j]) / (zs[j + 1] - zs[j]), 0, 1);
    const a = H[j * NX + i];
    const bq = H[j * NX + i + 1];
    const c = H[(j + 1) * NX + i];
    const d = H[(j + 1) * NX + i + 1];
    if (u + v <= 1) return a + (bq - a) * u + (c - a) * v;
    return d + (c - d) * (1 - u) + (bq - d) * (1 - v);
  };
  const normalAt = (x, z, out) => {
    const e = 1.5;
    const hx = heightAt(x + e, z) - heightAt(x - e, z);
    const hz = heightAt(x, z + e) - heightAt(x, z - e);
    return out.set(-hx, 2 * e, -hz).normalize();
  };
  return { group, heightAt, normalAt, bounds: { minX, maxX, minZ, maxZ } };
}

/**
 * Terrain material: vertex colours x tiled ground texture, plus slope-based
 * triplanar rock (optionally with sediment strata) on steep faces.
 */
export function createTerrainMaterial({ map, normalMap, rockMap, rockNormal, strata, rockTint = 0xffffff, rockStart = 0.35, rockEnd = 0.6, strataScale = 0.08, roughness = 0.95, snowCap = 0 }) {
  const mat = new THREE.MeshStandardMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    vertexColors: true,
    roughness,
    metalness: 0,
  });
  const uniforms = {
    uRock: { value: rockMap || null },
    uStrata: { value: strata || null },
    uRockTint: { value: new THREE.Color(rockTint) },
    uRockStart: { value: rockStart },
    uRockEnd: { value: rockEnd },
    uStrataScale: { value: strataScale },
    uSnowCap: { value: snowCap },
  };
  mat.userData.uniforms = uniforms;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * objectNormal);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWPos;
varying vec3 vWNrm;
uniform sampler2D uRock;
uniform sampler2D uStrata;
uniform vec3 uRockTint;
uniform float uRockStart;
uniform float uRockEnd;
uniform float uStrataScale;
uniform float uSnowCap;
float tHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tNoise(vec2 p) { vec2 i = floor(p); vec2 f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(tHash(i), tHash(i+vec2(1,0)), f.x), mix(tHash(i+vec2(0,1)), tHash(i+vec2(1,1)), f.x), f.y); }
`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
{
  vec3 n = normalize(vWNrm);
  float slope = 1.0 - clamp(n.y, 0.0, 1.0);
  float wob = tNoise(vWPos.xz * 0.06) * 0.18 - 0.09;
  float rm = smoothstep(uRockStart, uRockEnd, slope + wob);
  if (rm > 0.001) {
    vec3 an = abs(n); an = an / (an.x + an.y + an.z);
    vec3 r = texture2D(uRock, vWPos.zy * 0.11).rgb * an.x + texture2D(uRock, vWPos.xz * 0.11).rgb * an.y + texture2D(uRock, vWPos.xy * 0.11).rgb * an.z;
    vec3 rc = r * uRockTint;
    #ifdef USE_STRATA
    float sy = vWPos.y * uStrataScale + tNoise(vWPos.xz * 0.012) * 0.45 + tNoise(vWPos.xz * 0.07) * 0.05;
    vec3 st = texture2D(uStrata, vec2(0.5, fract(sy))).rgb;
    float stMix = smoothstep(-0.75, -0.35, n.y); // plain rock only on overhangs (tunnel ceilings)
    rc = mix(rc * 1.25, st * (0.42 + 0.95 * r.g), stMix);
    #endif
    // snow settles on the flatter parts of rock faces
    float sc = uSnowCap * smoothstep(0.75, 0.45, slope + wob * 2.0);
    rc = mix(rc, vec3(0.92, 0.95, 1.0), sc);
    diffuseColor.rgb = mix(diffuseColor.rgb, rc, rm);
  }
}
`,
      );
    if (strata) shader.fragmentShader = '#define USE_STRATA\n' + shader.fragmentShader;
  };
  mat.customProgramCacheKey = () => `terrain-${!!strata}`;
  return mat;
}
