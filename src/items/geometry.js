import * as THREE from 'three';

const _p = new THREE.Vector3();
const _t = new THREE.Vector3();
const _n = new THREE.Vector3();
const _b = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Color();

/**
 * Sweeps a (possibly elliptical, variable) cross-section along a curve.
 *
 * @param {THREE.Curve<THREE.Vector3>} curve
 * @param {object} o
 * @param {number} [o.tubular=48]  segments along the curve
 * @param {number} [o.radial=16]   segments around
 * @param {(t:number, a:number) => [number, number]} o.radius  returns [rN, rB] radii along normal / binormal
 * @param {(t:number, a:number, out:THREE.Color) => THREE.Color} [o.color]  vertex colour
 * @param {THREE.Vector3} [o.binormal]  fixed binormal (planar curves) instead of Frenet frames
 */
export function sweepGeometry(curve, o) {
  const tubular = o.tubular ?? 48;
  const radial = o.radial ?? 16;
  const positions = [];
  const normals = [];
  const colors = [];
  const uvs = [];
  const indices = [];

  let frames = null;
  if (!o.binormal) frames = curve.computeFrenetFrames(tubular, false);

  for (let i = 0; i <= tubular; i++) {
    const t = i / tubular;
    curve.getPointAt(t, _p);
    curve.getTangentAt(t, _t).normalize();
    if (o.binormal) {
      _b.copy(o.binormal).normalize();
      _n.crossVectors(_b, _t).normalize();
    } else {
      _n.copy(frames.normals[i]);
      _b.copy(frames.binormals[i]);
    }
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const [rn, rb] = o.radius(t, a);
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      _v.copy(_p).addScaledVector(_n, ca * rn).addScaledVector(_b, sa * rb);
      if (o.offset) {
        const [dn, db] = o.offset(t, a);
        _v.addScaledVector(_n, dn).addScaledVector(_b, db);
      }
      positions.push(_v.x, _v.y, _v.z);
      // ellipse normal
      _v.set(0, 0, 0)
        .addScaledVector(_n, ca * Math.max(rb, 1e-4))
        .addScaledVector(_b, sa * Math.max(rn, 1e-4))
        .normalize();
      normals.push(_v.x, _v.y, _v.z);
      uvs.push(t, j / radial);
      if (o.color) {
        o.color(t, a, _c);
        colors.push(_c.r, _c.g, _c.b);
      }
    }
  }
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j;
      const b = (i + 1) * (radial + 1) + j;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (o.color) g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  if (o.recomputeNormals) g.computeVertexNormals();
  return g;
}

/** Adds a constant vertex colour attribute so geometries can be merged with coloured ones. */
export function paint(geometry, color) {
  _c.set(color);
  const n = geometry.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = _c.r;
    arr[i * 3 + 1] = _c.g;
    arr[i * 3 + 2] = _c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geometry;
}

/** Smoothstep helper. */
export function smooth(e0, e1, x) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
