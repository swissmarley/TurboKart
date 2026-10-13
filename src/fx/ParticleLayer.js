import * as THREE from 'three';
import { ATLAS_GRID } from './spriteAtlas.js';
import { rand } from './rng.js';

/**
 * One pooled particle layer = ONE draw call. Particles are camera-facing quads
 * drawn with an InstancedBufferGeometry; simulation runs on the CPU over a
 * single strided Float32Array (dead particles are swap-removed, so the live
 * set is always the contiguous range [0, count)).
 *
 * Render modes per particle:
 *   0 BILLBOARD  – screen-aligned, rotatable
 *   1 AXIAL      – stretched along its velocity (sparks, flames, bolts); head at
 *                  the particle position, tail trailing behind
 *   2 FLAT       – lies in the world XZ plane (shockwave / dust rings)
 */
export const MODE = { BILLBOARD: 0, AXIAL: 1, FLAT: 2 };

// --- CPU particle record layout -------------------------------------------
const STRIDE = 32;
const X = 0, Y = 1, Z = 2, VX = 3, VY = 4, VZ = 5, AGE = 6, LIFE = 7;
const SIZE0 = 8, SIZE1 = 9, R0 = 10, G0 = 11, B0 = 12, R1 = 13, G1 = 14, B1 = 15;
const ALPHA = 16, FIN = 17, FOUT = 18, GRAV = 19, DRAG = 20, ROT = 21, ROTV = 22;
const SPRITE = 23, PMODE = 24, STRETCH = 25, ASPECT = 26, FLOOR = 27, BOUNCE = 28, FLICKER = 29;
const AX = 30; // packed fixed axis index (0 = use velocity, 1 = world up)
const FOLLOW = 31; // 1 = translated by layer.followDelta every step (kart-relative particles)

// GPU instance layout (interleaved, 16 floats)
const GSTRIDE = 16;

/**
 * Reusable spawn description. Fill fields, then call `layer.spawn(spec)`.
 * `reset()` restores defaults so emitters never leak state into each other.
 */
export class ParticleSpec {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = 0; this.y = 0; this.z = 0;
    this.vx = 0; this.vy = 0; this.vz = 0;
    this.life = 1;
    this.size = 0.5; this.sizeEnd = -1; // -1 = same as size
    this.r = 1; this.g = 1; this.b = 1;
    this.r2 = -1; this.g2 = -1; this.b2 = -1; // -1 = same as start
    this.alpha = 1;
    this.fadeIn = 0; // fraction of life
    this.fadeOut = 0.5; // fraction of life where fading starts
    this.gravity = 0; // m/s^2 downwards
    this.drag = 0; // 1/s
    this.rot = 0; this.rotVel = 0;
    this.sprite = 0;
    this.mode = MODE.BILLBOARD;
    this.stretch = 0; // AXIAL: extra length per m/s
    this.aspect = 1; // AXIAL: base length / width
    this.floor = -1e9;
    this.bounce = 0;
    this.flicker = 0;
    this.upAxis = false; // AXIAL: orient along world up instead of velocity
    this.follow = false; // move with the layer's follow frame (e.g. finish confetti)
    return this;
  }

  pos(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  vel(x, y, z) { this.vx = x; this.vy = y; this.vz = z; return this; }
  color(r, g, b) { this.r = r; this.g = g; this.b = b; return this; }
  colorEnd(r, g, b) { this.r2 = r; this.g2 = g; this.b2 = b; return this; }
  hex(h, k = 1) {
    this.r = ((h >> 16) & 255) / 255 * k;
    this.g = ((h >> 8) & 255) / 255 * k;
    this.b = (h & 255) / 255 * k;
    return this;
  }
  hexEnd(h, k = 1) {
    this.r2 = ((h >> 16) & 255) / 255 * k;
    this.g2 = ((h >> 8) & 255) / 255 * k;
    this.b2 = (h & 255) / 255 * k;
    return this;
  }
}

const VERT = /* glsl */ `
attribute vec4 iPosSize;
attribute vec4 iColor;
attribute vec4 iAxis;
attribute vec4 iMisc;
uniform float uGrid;
varying vec2 vUv;
varying vec4 vColor;
varying float vFogDepth;

void main() {
  vec2 corner = position.xy;
  vec3 center = iPosSize.xyz;
  float size = iPosSize.w;
  float rot = iMisc.x;
  float sprite = iMisc.y;
  float mode = iMisc.z;
  vec4 mvPos;
  if (mode < 0.5) {
    float c = cos(rot), s = sin(rot);
    vec2 rc = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y);
    mvPos = viewMatrix * vec4(center, 1.0);
    mvPos.xy += rc * size;
  } else if (mode < 1.5) {
    vec3 axis = iAxis.xyz;
    float len = length(axis);
    axis = len > 1e-5 ? axis / len : vec3(0.0, 1.0, 0.0);
    vec3 toCam = normalize(cameraPosition - center);
    vec3 side = cross(axis, toCam);
    float sl = length(side);
    side = sl > 1e-4 ? side / sl : normalize(cross(axis, vec3(0.0, 1.0, 0.001)));
    float L = size * iAxis.w;
    vec3 wp = center + axis * (corner.y - 0.5) * L + side * corner.x * size;
    mvPos = viewMatrix * vec4(wp, 1.0);
  } else {
    float c = cos(rot), s = sin(rot);
    vec2 rc = vec2(c * corner.x - s * corner.y, s * corner.x + c * corner.y);
    vec3 wp = center + vec3(rc.x, 0.0, rc.y) * size;
    mvPos = viewMatrix * vec4(wp, 1.0);
  }
  gl_Position = projectionMatrix * mvPos;
  float cx = mod(sprite, uGrid);
  float cy = floor(sprite / uGrid);
  vec2 local = (corner + 0.5) * 0.984 + 0.008;
  vUv = (vec2(cx, uGrid - 1.0 - cy) + local) / uGrid;
  vColor = iColor;
  vFogDepth = -mvPos.z;
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFogDensity;
uniform float uAdditive;
varying vec2 vUv;
varying vec4 vColor;
varying float vFogDepth;

void main() {
  vec4 tex = texture2D(uMap, vUv);
  float a = tex.a * vColor.a;
  vec3 col = tex.rgb * vColor.rgb;
  float fog = 0.0;
  if (uFogDensity > 0.0) {
    fog = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
  } else if (uFogFar > 0.0) {
    fog = smoothstep(uFogNear, uFogFar, vFogDepth);
  }
  if (uAdditive > 0.5) {
    a *= 1.0 - fog;
  } else {
    col = mix(col, uFogColor, fog);
  }
  if (a < 0.002) discard;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export class ParticleLayer {
  /**
   * @param {{ capacity: number, additive: boolean, texture: THREE.Texture, name?: string, renderOrder?: number }} o
   */
  constructor({ capacity, additive, texture, name = 'particles', renderOrder = 10 }) {
    this.capacity = capacity;
    this.additive = additive;
    this.count = 0;
    this.data = new Float32Array(capacity * STRIDE);
    this.gpu = new Float32Array(capacity * GSTRIDE);

    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.BufferAttribute(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0]), 3),
    );
    geo.setIndex([0, 1, 2, 0, 2, 3]);
    this.ibuf = new THREE.InstancedInterleavedBuffer(this.gpu, GSTRIDE, 1);
    this.ibuf.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('iPosSize', new THREE.InterleavedBufferAttribute(this.ibuf, 4, 0));
    geo.setAttribute('iColor', new THREE.InterleavedBufferAttribute(this.ibuf, 4, 4));
    geo.setAttribute('iAxis', new THREE.InterleavedBufferAttribute(this.ibuf, 4, 8));
    geo.setAttribute('iMisc', new THREE.InterleavedBufferAttribute(this.ibuf, 4, 12));
    geo.instanceCount = 0;
    this.geometry = geo;

    this.material = new THREE.ShaderMaterial({
      name: `TurboKart.${name}`,
      uniforms: {
        uMap: { value: texture },
        uGrid: { value: ATLAS_GRID },
        uFogColor: { value: new THREE.Color(0xffffff) },
        uFogNear: { value: 0 },
        uFogFar: { value: 0 },
        uFogDensity: { value: 0 },
        uAdditive: { value: additive ? 1 : 0 },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });

    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.name = `TurboKart.${name}`;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.visible = false;
    /** Translation applied to `follow` particles on the next simulate(). */
    this.followDelta = { x: 0, y: 0, z: 0 };
  }

  /** Copies scene fog parameters into the shader (call once per frame). */
  setFog(fog) {
    const u = this.material.uniforms;
    if (!fog) {
      u.uFogFar.value = 0;
      u.uFogDensity.value = 0;
      return;
    }
    u.uFogColor.value.copy(fog.color);
    if (fog.isFogExp2) {
      u.uFogDensity.value = fog.density;
      u.uFogFar.value = 0;
    } else {
      u.uFogDensity.value = 0;
      u.uFogNear.value = fog.near;
      u.uFogFar.value = fog.far;
    }
  }

  get free() {
    return this.capacity - this.count;
  }

  /** Adds one particle; returns false when the pool is full. */
  spawn(s) {
    if (this.count >= this.capacity) return false;
    const d = this.data;
    const o = this.count * STRIDE;
    this.count++;
    d[o + X] = s.x; d[o + Y] = s.y; d[o + Z] = s.z;
    d[o + VX] = s.vx; d[o + VY] = s.vy; d[o + VZ] = s.vz;
    d[o + AGE] = 0;
    d[o + LIFE] = Math.max(1e-4, s.life);
    d[o + SIZE0] = s.size;
    d[o + SIZE1] = s.sizeEnd < 0 ? s.size : s.sizeEnd;
    d[o + R0] = s.r; d[o + G0] = s.g; d[o + B0] = s.b;
    d[o + R1] = s.r2 < 0 ? s.r : s.r2;
    d[o + G1] = s.g2 < 0 ? s.g : s.g2;
    d[o + B1] = s.b2 < 0 ? s.b : s.b2;
    d[o + ALPHA] = s.alpha;
    d[o + FIN] = s.fadeIn;
    d[o + FOUT] = Math.min(0.999, Math.max(0, s.fadeOut));
    d[o + GRAV] = s.gravity;
    d[o + DRAG] = s.drag;
    d[o + ROT] = s.rot;
    d[o + ROTV] = s.rotVel;
    d[o + SPRITE] = s.sprite;
    d[o + PMODE] = s.mode;
    d[o + STRETCH] = s.stretch;
    d[o + ASPECT] = s.aspect;
    d[o + FLOOR] = s.floor;
    d[o + BOUNCE] = s.bounce;
    d[o + FLICKER] = s.flicker;
    d[o + AX] = s.upAxis ? 1 : 0;
    d[o + FOLLOW] = s.follow ? 1 : 0;
    return true;
  }

  /** Advances the simulation and kills expired particles. */
  simulate(dt) {
    const d = this.data;
    let n = this.count;
    let i = 0;
    const fdx = this.followDelta.x, fdy = this.followDelta.y, fdz = this.followDelta.z;
    const hasFollow = fdx !== 0 || fdy !== 0 || fdz !== 0;
    while (i < n) {
      const o = i * STRIDE;
      const age = d[o + AGE] + dt;
      if (age >= d[o + LIFE]) {
        n--;
        if (i !== n) d.copyWithin(o, n * STRIDE, n * STRIDE + STRIDE);
        continue;
      }
      d[o + AGE] = age;
      if (dt > 0) {
        d[o + VY] -= d[o + GRAV] * dt;
        const drag = d[o + DRAG];
        if (drag > 0) {
          const k = 1 / (1 + drag * dt);
          d[o + VX] *= k;
          d[o + VY] *= k;
          d[o + VZ] *= k;
        }
        d[o + X] += d[o + VX] * dt;
        d[o + Y] += d[o + VY] * dt;
        d[o + Z] += d[o + VZ] * dt;
        if (hasFollow && d[o + FOLLOW] > 0.5) {
          d[o + X] += fdx;
          d[o + Y] += fdy;
          d[o + Z] += fdz;
          d[o + FLOOR] += fdy;
        }
        d[o + ROT] += d[o + ROTV] * dt;
        const fl = d[o + FLOOR];
        if (d[o + Y] < fl) {
          d[o + Y] = fl;
          const b = d[o + BOUNCE];
          if (b > 0 && d[o + VY] < -1) {
            d[o + VY] = -d[o + VY] * b;
            d[o + VX] *= 0.7;
            d[o + VZ] *= 0.7;
            d[o + ROTV] *= 0.6;
          } else {
            d[o + VY] = 0;
            d[o + VX] *= 0.85;
            d[o + VZ] *= 0.85;
            d[o + ROTV] *= 0.8;
          }
        }
      }
      i++;
    }
    this.count = n;
  }

  /** Writes the live particles into the GPU buffer. */
  upload() {
    const d = this.data;
    const g = this.gpu;
    const n = this.count;
    for (let i = 0; i < n; i++) {
      const o = i * STRIDE;
      const q = i * GSTRIDE;
      const t = d[o + AGE] / d[o + LIFE];
      const fin = d[o + FIN];
      const fout = d[o + FOUT];
      let a = d[o + ALPHA];
      if (fin > 0 && t < fin) a *= t / fin;
      if (t > fout) a *= 1 - (t - fout) / (1 - fout);
      const fl = d[o + FLICKER];
      if (fl > 0) a *= 1 - fl * rand();
      const e = 1 - (1 - t) * (1 - t);
      g[q] = d[o + X];
      g[q + 1] = d[o + Y];
      g[q + 2] = d[o + Z];
      g[q + 3] = d[o + SIZE0] + (d[o + SIZE1] - d[o + SIZE0]) * e;
      g[q + 4] = d[o + R0] + (d[o + R1] - d[o + R0]) * t;
      g[q + 5] = d[o + G0] + (d[o + G1] - d[o + G0]) * t;
      g[q + 6] = d[o + B0] + (d[o + B1] - d[o + B0]) * t;
      g[q + 7] = a;
      if (d[o + AX] > 0.5) {
        g[q + 8] = 0;
        g[q + 9] = 1;
        g[q + 10] = 0;
        g[q + 11] = d[o + ASPECT];
      } else {
        const vx = d[o + VX], vy = d[o + VY], vz = d[o + VZ];
        g[q + 8] = vx;
        g[q + 9] = vy;
        g[q + 10] = vz;
        g[q + 11] = d[o + ASPECT] + d[o + STRETCH] * Math.sqrt(vx * vx + vy * vy + vz * vz);
      }
      g[q + 12] = d[o + ROT];
      g[q + 13] = d[o + SPRITE];
      g[q + 14] = d[o + PMODE];
      g[q + 15] = 0;
    }
    this.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n > 0) {
      this.ibuf.clearUpdateRanges();
      this.ibuf.addUpdateRange(0, n * GSTRIDE);
      this.ibuf.needsUpdate = true;
    }
  }

  clear() {
    this.count = 0;
    this.geometry.instanceCount = 0;
    this.mesh.visible = false;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}
