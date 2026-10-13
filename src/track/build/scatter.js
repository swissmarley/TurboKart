/**
 * Placement helpers: rejection-sampled scattering around the track and
 * InstancedMesh creation from transform lists.
 */
import * as THREE from 'three';

/**
 * Scatter points over the terrain, keeping clear of the road corridor.
 * @param {object} ctx
 * @param {object} o
 *   count, spacing (min distance between points), minClear (metres beyond the
 *   wall/extent), maxDist (max distance from the centre line, Infinity = anywhere
 *   in bounds), bounds {minX,maxX,minZ,maxZ}, accept(x,z,info) -> bool, tries,
 *   avoid: [{x,z,r}], within: [{x,z,r}] (if given, points must be inside one)
 */
export function scatter(ctx, o) {
  const rng = o.rng || ctx.rng;
  const path = ctx.path;
  const b = o.bounds || ctx.scatterBounds;
  const spacing = o.spacing ?? 6;
  const cell = Math.max(1, spacing);
  const grid = new Map();
  const out = [];
  const tries = o.tries ?? o.count * 30;
  const minClear = o.minClear ?? 4;
  const maxDist = o.maxDist ?? Infinity;
  const searchR = Number.isFinite(maxDist) ? maxDist + path.maxExtent + 5 : path.maxExtent + minClear + 60;
  const loc = {};
  const avoid = [...(ctx.avoidZones || []), ...(o.avoid || [])];
  for (let t = 0; t < tries && out.length < o.count; t++) {
    let x;
    let z;
    if (o.within && o.within.length) {
      const w = o.within[Math.floor(rng() * o.within.length)];
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(rng()) * w.r;
      x = w.x + Math.cos(a) * r;
      z = w.z + Math.sin(a) * r;
    } else if (o.nearTrack) {
      // sample along the track at a random lateral band (faster for roadside props)
      const d = rng() * path.length;
      const k = Math.floor(d / path.spacing) % path.count;
      const ext = Number.isNaN(path.wall[k]) ? path.hw[k] + 1 : path.wall[k];
      const side = rng() < 0.5 ? -1 : 1;
      const lat = side * (ext + minClear + rng() * (o.nearTrack - minClear));
      x = path.px[k] + path.rx[k] * lat;
      z = path.pz[k] + path.rz[k] * lat;
    } else {
      x = b.minX + rng() * (b.maxX - b.minX);
      z = b.minZ + rng() * (b.maxZ - b.minZ);
    }
    // corridor clearance
    const l = path.locate(x, z, searchR, loc);
    let clear = Infinity;
    if (l) clear = l.absLateral - l.extent;
    if (clear < minClear) continue;
    if (Number.isFinite(maxDist) && (!l || clear > maxDist)) continue;
    // avoid zones
    let bad = false;
    for (const a of avoid) {
      if ((x - a.x) ** 2 + (z - a.z) ** 2 < a.r * a.r) {
        bad = true;
        break;
      }
    }
    if (bad) continue;
    // spacing
    const cx = Math.floor(x / cell);
    const cz = Math.floor(z / cell);
    let close = false;
    for (let i = -1; i <= 1 && !close; i++) {
      for (let j = -1; j <= 1 && !close; j++) {
        const arr = grid.get((cx + i) * 73856093 + (cz + j) * 19349663);
        if (!arr) continue;
        for (const p of arr) {
          if ((p.x - x) ** 2 + (p.z - z) ** 2 < spacing * spacing) {
            close = true;
            break;
          }
        }
      }
    }
    if (close) continue;
    const info = { clear, distance: l ? l.distance : -1, lateral: l ? l.lateral : 0 };
    if (o.accept && !o.accept(x, z, info, rng)) continue;
    const y = ctx.heightAt(x, z);
    if (o.maxSlope !== undefined && ctx.slopeAt(x, z) > o.maxSlope) continue;
    const p = { x, y, z, clear, distance: info.distance, lateral: info.lateral };
    out.push(p);
    const key = cx * 73856093 + cz * 19349663;
    let arr = grid.get(key);
    if (!arr) grid.set(key, (arr = []));
    arr.push(p);
  }
  return out;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();
const _up = new THREE.Vector3(0, 1, 0);
const _n = new THREE.Vector3();
const _q2 = new THREE.Quaternion();

/**
 * @param {Array<{x,y,z,ry?,s?,sx?,sy?,sz?,tilt?,normal?,color?}>} items
 */
export function makeInstanced(ctx, geometry, material, items, { castShadow = true, receiveShadow = true, name = 'Instanced', colors = null, alignToNormal = 0 } = {}) {
  if (!items.length) {
    geometry.dispose();
    return null;
  }
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  mesh.name = name;
  items.forEach((it, i) => {
    const s = it.s ?? 1;
    _s.set(it.sx ?? s, it.sy ?? s, it.sz ?? s);
    _e.set(it.rx || 0, it.ry || 0, it.rz || 0, 'YXZ');
    _q.setFromEuler(_e);
    if (alignToNormal && it.normal) {
      _n.copy(_up).lerp(it.normal, alignToNormal).normalize();
      _q2.setFromUnitVectors(_up, _n);
      _q.premultiply(_q2);
    }
    _p.set(it.x, it.y, it.z);
    _m.compose(_p, _q, _s);
    mesh.setMatrixAt(i, _m);
    const c = it.color ?? (colors ? colors[i % colors.length] : null);
    if (c !== null && c !== undefined) mesh.setColorAt(i, c instanceof THREE.Color ? c : new THREE.Color(c));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  mesh.computeBoundingSphere();
  ctx.root.add(mesh);
  return mesh;
}
