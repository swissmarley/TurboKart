import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { ITEMS } from '../core/constants.js';
import { sweepGeometry, smooth } from './geometry.js';
import {
  getStudioEnvMap,
  getGlowTexture,
  getSparkTexture,
  getShellTextures,
  getCoinFaceTextures,
  disposeItemTextures,
} from './textures.js';
import { createItemBoxMaterial } from './itemBoxMaterial.js';

/**
 * Procedural 3D models for every item. Geometries and materials are cached
 * and shared between instances; `disposeItemModels()` frees all of them.
 *
 * Every model's origin is the bottom centre (ground contact) and it faces +Z.
 * `group.userData.tick(time, dt)` animates idle details (fuse spark, wings,
 * wind-up key, glow pulse...). `group.userData.radius` is the collision radius.
 */

export const ITEM_BOX_SIZE = 1.5;

const geoCache = new Map();
const matCache = new Map();

function geo(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g;
}

function mat(key, make) {
  let m = matCache.get(key);
  if (!m) {
    m = make();
    matCache.set(key, m);
  }
  return m;
}

export function disposeItemModels() {
  for (const g of geoCache.values()) g.dispose();
  for (const m of matCache.values()) m.dispose();
  geoCache.clear();
  matCache.clear();
  disposeItemTextures();
}

function physical(params) {
  return new THREE.MeshPhysicalMaterial({ envMap: getStudioEnvMap(), envMapIntensity: 1.0, ...params });
}

function mesh(g, m, { cast = true, receive = false } = {}) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = cast;
  o.receiveShadow = receive;
  return o;
}

// ---------------------------------------------------------------- shared bits

function eyeMaterials() {
  return {
    black: mat('eye-black', () =>
      physical({ color: 0x101014, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 }),
    ),
    white: mat('eye-white', () =>
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
    ),
    sclera: mat('eye-sclera', () => physical({ color: 0xfbfbf6, roughness: 0.25, clearcoat: 0.8 })),
  };
}

function unitSphere() {
  return geo('sphere', () => new THREE.SphereGeometry(1, 28, 18));
}

/** Little cartoon eye (black oval + highlight) oriented along `normal`. */
function addEye(parent, pos, normal, { w = 0.045, h = 0.085, d = 0.03, highlight = true } = {}) {
  const em = eyeMaterials();
  const eye = new THREE.Group();
  eye.position.copy(pos);
  eye.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal.clone().normalize());
  const pupil = mesh(unitSphere(), em.black, { cast: false });
  pupil.scale.set(w, h, d);
  eye.add(pupil);
  if (highlight) {
    const hl = mesh(unitSphere(), em.white, { cast: false });
    hl.scale.setScalar(w * 0.38);
    hl.position.set(w * 0.3, h * 0.42, d * 0.75);
    eye.add(hl);
  }
  parent.add(eye);
  return eye;
}

function glowSprite(color, scale, opacity = 0.6) {
  const m = new THREE.SpriteMaterial({
    map: getGlowTexture(),
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(scale);
  s.userData.ownMaterial = true;
  return s;
}

// --------------------------------------------------------------------- shells

const SHELL_R = 0.52;
const SHELL_BASE = 0.19;
const SHELL_H = 0.47;

function shellDomeGeometry() {
  return geo('shell-dome', () => {
    const pts = [];
    const n = 24;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.max(0.0001, SHELL_R * Math.cos(a)), SHELL_BASE + SHELL_H * Math.sin(a)));
    }
    return new THREE.LatheGeometry(pts, 64);
  });
}

function shellRimGeometry() {
  return geo('shell-rim', () => {
    const g = new THREE.TorusGeometry(SHELL_R + 0.005, 0.07, 16, 64);
    g.rotateX(Math.PI / 2);
    g.translate(0, SHELL_BASE, 0);
    return g;
  });
}

function shellBellyGeometry() {
  return geo('shell-belly', () => {
    const pts = [
      new THREE.Vector2(0.0001, 0.03),
      new THREE.Vector2(0.25, 0.035),
      new THREE.Vector2(0.42, 0.06),
      new THREE.Vector2(0.5, 0.13),
      new THREE.Vector2(SHELL_R, SHELL_BASE),
    ];
    return new THREE.LatheGeometry(pts, 48);
  });
}

/** Point + outward normal on the shell dome for lathe-UV coords (u around, v rim->top). */
function shellSurface(u, v, outP, outN) {
  const a = v * (Math.PI / 2);
  const phi = u * Math.PI * 2;
  const r = SHELL_R * Math.cos(a);
  const y = SHELL_BASE + SHELL_H * Math.sin(a);
  outP.set(r * Math.sin(phi), y, r * Math.cos(phi));
  const nr = Math.cos(a) / SHELL_R;
  const ny = Math.sin(a) / SHELL_H;
  outN.set(nr * Math.sin(phi), ny, nr * Math.cos(phi)).normalize();
}

function shellMaterial(kind, color) {
  return mat(`shell-${kind}`, () => {
    const tex = getShellTextures('plain');
    return physical({
      color,
      map: tex.map,
      bumpMap: tex.bump,
      bumpScale: 2.2,
      roughness: 0.3,
      metalness: 0.0,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
      sheen: 0.3,
      sheenColor: new THREE.Color(color).multiplyScalar(0.5),
    });
  });
}

function buildShell(kind) {
  const color = kind === 'red' ? 0xf0262b : kind === 'spiny' ? 0x2a68ff : 0x22c24d;
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  body.add(mesh(shellDomeGeometry(), shellMaterial(kind, color)));
  body.add(
    mesh(
      shellRimGeometry(),
      mat('shell-rim', () => physical({ color: 0xfbf8ef, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 })),
    ),
  );
  body.add(
    mesh(
      shellBellyGeometry(),
      mat('shell-belly', () => physical({ color: 0xf2dca4, roughness: 0.55, clearcoat: 0.3 })),
    ),
  );
  g.userData.radius = 0.6;
  g.userData.spinner = body;

  if (kind === 'spiny') {
    const spikeGeo = geo('spike', () => {
      const c = new THREE.ConeGeometry(0.075, 0.24, 16, 1);
      c.translate(0, 0.1, 0);
      return c;
    });
    const spikeMat = mat('spike', () => physical({ color: 0xffffff, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 }));
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const spots = [[0, 1]];
    for (let i = 0; i < 6; i++) spots.push([(i + 0.5) / 6, 0.52]);
    for (let i = 0; i < 6; i++) spots.push([i / 6, 0.17]);
    for (const [u, v] of spots) {
      shellSurface(u, v, p, n);
      const s = mesh(spikeGeo, spikeMat);
      s.position.copy(p).addScaledVector(n, -0.01);
      s.quaternion.setFromUnitVectors(up, n);
      if (v < 0.3) s.scale.setScalar(0.75);
      body.add(s);
    }
    // wings (do not spin with the body)
    const wingGeo = geo('wing', () => {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0);
      sh.bezierCurveTo(0.05, 0.16, 0.18, 0.34, 0.42, 0.42);
      sh.bezierCurveTo(0.4, 0.34, 0.36, 0.32, 0.33, 0.3);
      sh.bezierCurveTo(0.38, 0.26, 0.36, 0.2, 0.3, 0.19);
      sh.bezierCurveTo(0.33, 0.13, 0.28, 0.08, 0.22, 0.09);
      sh.bezierCurveTo(0.2, 0.02, 0.12, -0.02, 0.0, 0.0);
      const e = new THREE.ExtrudeGeometry(sh, {
        depth: 0.02,
        bevelEnabled: true,
        bevelThickness: 0.012,
        bevelSize: 0.012,
        bevelSegments: 2,
        curveSegments: 10,
      });
      e.translate(0, 0, -0.01);
      return e;
    });
    const wingMat = mat('wing', () =>
      physical({ color: 0xffffff, roughness: 0.4, sheen: 1, sheenColor: new THREE.Color(0xbfe0ff), side: THREE.DoubleSide }),
    );
    const wings = [];
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.42, 0.42, -0.05);
      const w = mesh(wingGeo, wingMat);
      // wing plane: spans outward (x) and up (y)
      w.scale.set(side, 1, 1);
      w.rotation.y = side * 0.25;
      pivot.add(w);
      g.add(pivot);
      wings.push({ pivot, side });
    }
    g.userData.tick = (t) => {
      body.rotation.y = t * 2.2;
      for (const { pivot, side } of wings) pivot.rotation.z = side * (0.15 + Math.sin(t * 16) * 0.45);
    };
  } else {
    g.userData.tick = (t) => {
      body.rotation.y = t * 7;
    };
  }
  return g;
}

// --------------------------------------------------------------------- banana

const BANANA_YELLOW = new THREE.Color(0xffc20a);
const BANANA_LIGHT = new THREE.Color(0xffe04a);
const BANANA_GREEN = new THREE.Color(0x9fb526);
const BANANA_BROWN = new THREE.Color(0x3a2410);
const BANANA_STEM = new THREE.Color(0x7d6a2c);
const PEEL_INNER = new THREE.Color(0xfff0a8);

function bananaMaterial() {
  return mat('banana', () =>
    physical({ color: 0xffffff, vertexColors: true, roughness: 0.42, clearcoat: 0.45, clearcoatRoughness: 0.3 }),
  );
}

function bananaGeometry() {
  return geo('banana', () => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0.04, 0.06, 0),
      new THREE.Vector3(0.17, 0.25, 0),
      new THREE.Vector3(0.21, 0.48, 0),
      new THREE.Vector3(0.14, 0.72, 0),
      new THREE.Vector3(0.0, 0.88, 0),
      new THREE.Vector3(-0.07, 0.95, 0),
    ]);
    return sweepGeometry(curve, {
      tubular: 72,
      radial: 20,
      binormal: new THREE.Vector3(0, 0, 1),
      radius: (t, a) => {
        let r = 0.125 * Math.pow(smooth(0, 0.16, t), 0.55) * (1 - smooth(0.66, 0.86, t) * 0.74);
        r *= Math.sqrt(Math.min(1, (1 - t) / 0.025));
        r = Math.max(r, 0.0005);
        const ridge = 1 + 0.075 * Math.cos(5 * a);
        return [r * ridge, r * ridge * 0.96];
      },
      color: (t, a, out) => {
        const ridgeLight = Math.max(0, Math.cos(5 * a)) * 0.25;
        out.copy(BANANA_YELLOW).lerp(BANANA_LIGHT, ridgeLight);
        if (t < 0.12) out.lerp(BANANA_BROWN, 1 - smooth(0.04, 0.12, t));
        if (t > 0.72) out.lerp(BANANA_GREEN, smooth(0.72, 0.84, t) * 0.7);
        if (t > 0.84) out.lerp(BANANA_STEM, smooth(0.84, 0.9, t));
        if (t > 0.95) out.lerp(BANANA_BROWN, smooth(0.95, 0.99, t));
        return out;
      },
      recomputeNormals: true,
    });
  });
}

function bananaPeelGeometry() {
  return geo('banana-peel', () => {
    const parts = [];
    // neck (the remaining top of the banana) + stem
    const neck = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.3, 0),
      new THREE.Vector3(0.015, 0.45, 0),
      new THREE.Vector3(0.0, 0.6, 0),
      new THREE.Vector3(-0.05, 0.72, 0),
      new THREE.Vector3(-0.1, 0.78, 0),
    ]);
    parts.push(
      sweepGeometry(neck, {
        tubular: 40,
        radial: 18,
        binormal: new THREE.Vector3(0, 0, 1),
        radius: (t, a) => {
          let r = 0.11 * (1 - smooth(0.2, 0.62, t) * 0.68);
          r *= Math.sqrt(Math.min(1, (1 - t) / 0.03));
          r = Math.max(r, 0.0005);
          const ridge = 1 + 0.07 * Math.cos(5 * a);
          return [r * ridge, r * ridge];
        },
        color: (t, a, out) => {
          out.copy(BANANA_YELLOW).lerp(BANANA_LIGHT, Math.max(0, Math.cos(5 * a)) * 0.25);
          if (t > 0.4) out.lerp(BANANA_GREEN, smooth(0.4, 0.58, t) * 0.6);
          if (t > 0.58) out.lerp(BANANA_STEM, smooth(0.58, 0.66, t));
          if (t > 0.93) out.lerp(BANANA_BROWN, smooth(0.93, 0.99, t));
          return out;
        },
        recomputeNormals: true,
      }),
    );
    // fruit stub poking out of the peel
    {
      const s = new THREE.SphereGeometry(0.11, 20, 12);
      s.scale(1, 0.8, 1);
      s.translate(0, 0.31, 0);
      const c = new Float32Array(s.attributes.position.count * 3);
      const col = new THREE.Color(0xfff1c2);
      for (let i = 0; i < s.attributes.position.count; i++) c.set([col.r, col.g, col.b], i * 3);
      s.setAttribute('color', new THREE.BufferAttribute(c, 3));
      parts.push(s);
    }
    // flaps
    const nFlaps = 4;
    for (let k = 0; k < nFlaps; k++) {
      const phi = (k / nFlaps) * Math.PI * 2 + Math.PI / 4 + (k % 2) * 0.12;
      const R = new THREE.Vector3(Math.cos(phi), 0, Math.sin(phi));
      const T = new THREE.Vector3(-Math.sin(phi), 0, Math.cos(phi));
      const len = k % 2 === 0 ? 1 : 0.82;
      const prof = [
        [0.09, 0.4],
        [0.17, 0.38],
        [0.26, 0.29],
        [0.33 * len + 0.03, 0.15],
        [0.39 * len + 0.03, 0.05],
        [0.47 * len + 0.03, 0.025],
        [0.54 * len + 0.03, 0.06],
      ];
      const pts = prof.map(([r, y]) => R.clone().multiplyScalar(r).add(new THREE.Vector3(0, y, 0)));
      const curve = new THREE.CatmullRomCurve3(pts);
      parts.push(
        sweepGeometry(curve, {
          tubular: 36,
          radial: 16,
          binormal: T,
          radius: (t) => {
            let w = 0.075 + 0.04 * Math.sin(Math.min(1, t * 1.8) * Math.PI * 0.5) - 0.03 * t;
            w *= Math.pow(Math.min(1, (1 - t) / 0.3), 0.7);
            return [0.022, Math.max(w, 0.004)];
          },
          offset: (t, a) => {
            const sa = Math.sin(a);
            return [0.025 * (1 - t * 0.6) * sa * sa, 0];
          },
          color: (t, a, out) => {
            const c = Math.cos(a);
            out.copy(BANANA_YELLOW).lerp(PEEL_INNER, smooth(-0.2, 0.4, c));
            if (t > 0.84) out.lerp(BANANA_BROWN, smooth(0.84, 0.98, t));
            return out;
          },
          recomputeNormals: true,
        }),
      );
    }
    const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()));
    parts.forEach((p) => p.dispose());
    return merged;
  });
}

function buildBanana(peeled) {
  const g = new THREE.Group();
  const m = mesh(peeled ? bananaPeelGeometry() : bananaGeometry(), bananaMaterial());
  if (!peeled) {
    m.rotation.z = -0.2;
    m.position.x = -0.06;
  }
  g.add(m);
  g.userData.radius = 0.6;
  g.userData.tick = () => {};
  return g;
}

// ------------------------------------------------------------------- mushroom

function buildMushroom(golden) {
  const g = new THREE.Group();
  const key = golden ? 'gold' : 'red';
  const capGeo = geo('mush-cap', () => {
    const pts = [new THREE.Vector2(0.49, 0.3), new THREE.Vector2(0.535, 0.335)];
    const n = 20;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.max(0.0001, 0.555 * Math.cos(a)), 0.385 + 0.39 * Math.sin(a)));
    }
    return new THREE.LatheGeometry(pts, 56);
  });
  const underGeo = geo('mush-under', () => {
    const pts = [
      new THREE.Vector2(0.0001, 0.37),
      new THREE.Vector2(0.2, 0.35),
      new THREE.Vector2(0.4, 0.315),
      new THREE.Vector2(0.49, 0.3),
    ].reverse();
    return new THREE.LatheGeometry(pts, 48);
  });
  const stemGeo = geo('mush-stem', () => {
    const pts = [
      new THREE.Vector2(0.0001, 0.0),
      new THREE.Vector2(0.22, 0.0),
      new THREE.Vector2(0.28, 0.03),
      new THREE.Vector2(0.305, 0.1),
      new THREE.Vector2(0.31, 0.2),
      new THREE.Vector2(0.29, 0.29),
      new THREE.Vector2(0.25, 0.35),
      new THREE.Vector2(0.0001, 0.37),
    ];
    return new THREE.LatheGeometry(pts, 48);
  });
  const capMat = mat(`mush-cap-${key}`, () =>
    golden
      ? physical({
          color: 0xffbf2a,
          metalness: 0.85,
          roughness: 0.2,
          clearcoat: 1,
          clearcoatRoughness: 0.08,
          emissive: 0x6a3a00,
          emissiveIntensity: 0.35,
        })
      : physical({ color: 0xe8202a, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0.4, sheenColor: new THREE.Color(0xff7a7a) }),
  );
  const spotMat = mat(`mush-spot-${key}`, () =>
    golden
      ? physical({ color: 0xfff1b0, metalness: 0.6, roughness: 0.25, clearcoat: 1, emissive: 0x6a5000, emissiveIntensity: 0.25 })
      : physical({ color: 0xffffff, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }),
  );
  const stemMat = mat(`mush-stem-${key}`, () =>
    golden
      ? physical({ color: 0xffe39a, metalness: 0.45, roughness: 0.3, clearcoat: 0.8, emissive: 0x5a3a00, emissiveIntensity: 0.2 })
      : physical({ color: 0xfff0d2, roughness: 0.5, clearcoat: 0.4, sheen: 0.6, sheenColor: new THREE.Color(0xffe0b0) }),
  );
  const underMat = mat(`mush-under-${key}`, () =>
    golden ? physical({ color: 0xe0a83a, metalness: 0.6, roughness: 0.35 }) : physical({ color: 0xead4a4, roughness: 0.7 }),
  );
  g.add(mesh(capGeo, capMat));
  g.add(mesh(underGeo, underMat));
  g.add(mesh(stemGeo, stemMat));

  // spots on the cap
  const capPoint = (phi, a, outP, outN) => {
    const r = 0.555 * Math.cos(a);
    outP.set(r * Math.sin(phi), 0.385 + 0.39 * Math.sin(a), r * Math.cos(phi));
    const nr = Math.cos(a) / 0.555;
    const ny = Math.sin(a) / 0.39;
    outN.set(nr * Math.sin(phi), ny, nr * Math.cos(phi)).normalize();
  };
  const spotGeo = geo('mush-spot', () => {
    const s = new THREE.SphereGeometry(1, 28, 14);
    return s;
  });
  const p = new THREE.Vector3();
  const n = new THREE.Vector3();
  const z = new THREE.Vector3(0, 0, 1);
  const spots = [
    [0, 0.42, 0.2],
    [1.45, 0.38, 0.16],
    [-1.45, 0.38, 0.16],
    [Math.PI, 0.45, 0.18],
    [0.3, 1.25, 0.15],
    [2.3, 0.95, 0.1],
    [-2.3, 0.95, 0.1],
    [0.75, 0.95, 0.075],
    [-0.75, 0.95, 0.075],
  ];
  for (const [phi, a, s] of spots) {
    capPoint(phi, a, p, n);
    const m = mesh(spotGeo, spotMat, { cast: false });
    m.position.copy(p).addScaledVector(n, -s * 0.1);
    m.quaternion.setFromUnitVectors(z, n);
    m.scale.set(s, s, s * 0.22);
    g.add(m);
  }
  // eyes on the stem
  for (const side of [-1, 1]) {
    const ep = new THREE.Vector3(side * 0.085, 0.19, 0.296);
    const en = new THREE.Vector3(side * 0.28, 0, 1).normalize();
    addEye(g, ep, en, { w: 0.042, h: 0.082, d: 0.03 });
  }
  if (golden) {
    const glow = glowSprite(0xffc040, 2.0, 0.35);
    glow.position.y = 0.45;
    g.add(glow);
    g.userData.tick = (t) => {
      glow.material.opacity = 0.28 + Math.sin(t * 5) * 0.08;
    };
  } else {
    g.userData.tick = () => {};
  }
  g.userData.radius = 0.6;
  return g;
}

// ----------------------------------------------------------------------- star

function starShape(R, r, round = 0.18) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const rr = i % 2 === 0 ? R : r;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(new THREE.Vector2(Math.cos(a) * rr, Math.sin(a) * rr));
  }
  const sh = new THREE.Shape();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const k = i % 2 === 0 ? round : round * 0.6;
    const a = cur.clone().lerp(prev, k);
    const b = cur.clone().lerp(next, k);
    if (i === 0) sh.moveTo(a.x, a.y);
    else sh.lineTo(a.x, a.y);
    sh.quadraticCurveTo(cur.x, cur.y, b.x, b.y);
  }
  sh.closePath();
  return sh;
}

function buildStar() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.58;
  g.add(body);
  const starGeo = geo('star', () => {
    const e = new THREE.ExtrudeGeometry(starShape(0.56, 0.26, 0.16), {
      depth: 0.14,
      bevelEnabled: true,
      bevelThickness: 0.1,
      bevelSize: 0.075,
      bevelSegments: 6,
      curveSegments: 10,
    });
    e.center();
    e.computeVertexNormals();
    return e;
  });
  const starMat = mat('star', () =>
    physical({
      color: 0xffbe00,
      emissive: 0xff8c00,
      emissiveIntensity: 0.32,
      roughness: 0.2,
      metalness: 0.2,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
    }),
  );
  body.add(mesh(starGeo, starMat));
  for (const side of [-1, 1]) {
    addEye(body, new THREE.Vector3(side * 0.085, 0.04, 0.17), new THREE.Vector3(0, 0, 1), { w: 0.038, h: 0.085, d: 0.02 });
  }
  const glow = glowSprite(0xffe070, 2.2, 0.55);
  glow.position.y = 0.58;
  g.add(glow);
  g.userData.radius = 0.6;
  g.userData.tick = (t) => {
    body.rotation.y = t * 2.5;
    body.position.y = 0.58 + Math.sin(t * 3) * 0.04;
    glow.material.opacity = 0.45 + Math.sin(t * 7) * 0.1;
    const hue = (t * 0.6) % 1;
    starMat.emissive.setHSL(0.09 + Math.sin(hue * Math.PI * 2) * 0.02, 1, 0.5);
  };
  return g;
}

// ----------------------------------------------------------------------- bomb

function buildBomb() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  const R = 0.46;
  const CY = 0.54;
  body.add(
    (() => {
      const m = mesh(
        geo('bomb-body', () => new THREE.SphereGeometry(R, 48, 32)),
        mat('bomb-body', () =>
          physical({ color: 0x1b1e2b, roughness: 0.28, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.06 }),
        ),
      );
      m.position.y = CY;
      return m;
    })(),
  );
  const metal = mat('bomb-metal', () => physical({ color: 0xa8aeb8, metalness: 0.9, roughness: 0.28 }));
  const cap = mesh(geo('bomb-cap', () => new THREE.CylinderGeometry(0.12, 0.15, 0.1, 28)), metal);
  cap.position.y = CY + R - 0.02;
  body.add(cap);
  const fuseCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, CY + R + 0.02, 0),
    new THREE.Vector3(0.01, CY + R + 0.12, -0.02),
    new THREE.Vector3(0.07, CY + R + 0.19, -0.03),
    new THREE.Vector3(0.13, CY + R + 0.2, 0.0),
  ]);
  const fuse = mesh(
    geo('bomb-fuse', () => new THREE.TubeGeometry(fuseCurve, 16, 0.028, 10, false)),
    mat('bomb-fuse', () => physical({ color: 0xd8c294, roughness: 0.8 })),
  );
  body.add(fuse);
  const spark = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getSparkTexture(),
      color: 0xffd27a,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  spark.userData.ownMaterial = true;
  spark.position.copy(fuseCurve.getPoint(1));
  spark.scale.setScalar(0.4);
  body.add(spark);

  // eyes
  const em = eyeMaterials();
  for (const side of [-1, 1]) {
    const dir = new THREE.Vector3(side * 0.27, 0.16, 1).normalize();
    const p = dir.clone().multiplyScalar(R).add(new THREE.Vector3(0, CY, 0));
    const eye = new THREE.Group();
    eye.position.copy(p);
    eye.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    const sclera = mesh(unitSphere(), em.sclera, { cast: false });
    sclera.scale.set(0.07, 0.12, 0.035);
    eye.add(sclera);
    const pupil = mesh(unitSphere(), em.black, { cast: false });
    pupil.scale.set(0.035, 0.065, 0.02);
    pupil.position.set(0, -0.01, 0.025);
    eye.add(pupil);
    const hl = mesh(unitSphere(), em.white, { cast: false });
    hl.scale.setScalar(0.012);
    hl.position.set(0.01, 0.02, 0.045);
    eye.add(hl);
    body.add(eye);
  }

  // wind-up key
  const keyMat = mat('bomb-key', () => physical({ color: 0xf0bd3c, metalness: 0.85, roughness: 0.22, clearcoat: 0.5 }));
  const key = new THREE.Group();
  key.position.set(0, CY + 0.02, -R + 0.02);
  const shaft = mesh(
    geo('key-shaft', () => {
      const c = new THREE.CylinderGeometry(0.035, 0.035, 0.2, 12);
      c.rotateX(Math.PI / 2);
      c.translate(0, 0, -0.1);
      return c;
    }),
    keyMat,
  );
  key.add(shaft);
  const loopGeo = geo('key-loop', () => {
    const t = new THREE.TorusGeometry(0.1, 0.032, 12, 28);
    t.rotateY(Math.PI / 2);
    return t;
  });
  for (const side of [-1, 1]) {
    const l = mesh(loopGeo, keyMat);
    l.position.set(0, side * 0.115, -0.24);
    key.add(l);
  }
  const hub = mesh(geo('key-hub', () => new THREE.SphereGeometry(0.05, 16, 10)), keyMat);
  hub.position.z = -0.24;
  key.add(hub);
  body.add(key);

  // feet
  const footMat = mat('bomb-foot', () => physical({ color: 0xffa21f, roughness: 0.35, clearcoat: 0.8 }));
  const feet = [];
  for (const side of [-1, 1]) {
    const f = mesh(unitSphere(), footMat);
    f.scale.set(0.15, 0.09, 0.22);
    f.position.set(side * 0.19, 0.08, 0.08);
    g.add(f);
    feet.push(f);
  }
  g.userData.radius = 0.6;
  g.userData.fuse = 1;
  g.userData.tick = (t, dt, walking = 1) => {
    key.rotation.z = t * 3;
    const fl = 0.75 + Math.sin(t * 47) * 0.2 + Math.sin(t * 31) * 0.15;
    spark.scale.setScalar(0.38 * fl * (1 + (1 - g.userData.fuse) * 0.8));
    spark.material.rotation = t * 4;
    for (let i = 0; i < 2; i++) {
      const ph = t * 12 + i * Math.PI;
      feet[i].position.z = 0.08 + Math.sin(ph) * 0.07 * walking;
      feet[i].position.y = 0.08 + Math.max(0, Math.cos(ph)) * 0.05 * walking;
    }
    body.position.y = Math.abs(Math.sin(t * 12)) * 0.03 * walking;
    body.rotation.z = Math.sin(t * 12) * 0.05 * walking;
  };
  return g;
}

// ------------------------------------------------------------------ lightning

function buildLightning() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = 0.62;
  g.add(body);
  const boltGeo = geo('bolt', () => {
    const sh = new THREE.Shape();
    const P = [
      [-0.12, 0.66],
      [0.3, 0.66],
      [0.07, 0.13],
      [0.32, 0.15],
      [-0.26, -0.72],
      [-0.04, -0.07],
      [-0.31, -0.09],
    ];
    sh.moveTo(P[0][0], P[0][1]);
    for (let i = 1; i < P.length; i++) sh.lineTo(P[i][0], P[i][1]);
    sh.closePath();
    const e = new THREE.ExtrudeGeometry(sh, {
      depth: 0.12,
      bevelEnabled: true,
      bevelThickness: 0.06,
      bevelSize: 0.045,
      bevelSegments: 5,
    });
    e.center();
    e.computeVertexNormals();
    return e;
  });
  const boltMat = mat('bolt', () =>
    physical({ color: 0xffcc00, emissive: 0xff9500, emissiveIntensity: 0.35, roughness: 0.2, clearcoat: 1, metalness: 0.25 }),
  );
  body.add(mesh(boltGeo, boltMat));
  const glow = glowSprite(0xfff080, 2.0, 0.5);
  glow.position.y = 0.62;
  g.add(glow);
  g.userData.radius = 0.6;
  g.userData.tick = (t) => {
    body.rotation.y = Math.sin(t * 1.8) * 0.6;
    glow.material.opacity = 0.35 + Math.abs(Math.sin(t * 9)) * 0.25;
  };
  return g;
}

// ----------------------------------------------------------------------- coin

export const COIN_RADIUS = 0.42;

/** Coin geometry with two groups: 0 = rim, 1 = faces. Axis along +Z (standing coin). */
export function getCoinGeometry() {
  return geo('coin', () => {
    const R = COIN_RADIUS;
    const face = 0.3;
    const th = 0.05;
    const rimPts = [
      new THREE.Vector2(face, th * 0.55),
      new THREE.Vector2(face + 0.02, th),
      new THREE.Vector2(R - 0.035, th),
      new THREE.Vector2(R - 0.005, th * 0.55),
      new THREE.Vector2(R, 0),
      new THREE.Vector2(R - 0.005, -th * 0.55),
      new THREE.Vector2(R - 0.035, -th),
      new THREE.Vector2(face + 0.02, -th),
      new THREE.Vector2(face, -th * 0.55),
    ].reverse();
    const rim = new THREE.LatheGeometry(rimPts, 40);
    const top = new THREE.CircleGeometry(face, 40);
    top.rotateX(-Math.PI / 2);
    top.translate(0, th * 0.55, 0);
    const bottom = new THREE.CircleGeometry(face, 40);
    bottom.rotateX(Math.PI / 2);
    bottom.rotateY(Math.PI);
    bottom.translate(0, -th * 0.55, 0);
    const merged = mergeGeometries([rim.toNonIndexed(), mergeGeometries([top.toNonIndexed(), bottom.toNonIndexed()])], true);
    rim.dispose();
    top.dispose();
    bottom.dispose();
    merged.rotateX(Math.PI / 2); // axis -> Z
    return merged;
  });
}

export function getCoinMaterials() {
  const rim = mat('coin-rim', () =>
    new THREE.MeshStandardMaterial({
      color: 0xffc21a,
      metalness: 1,
      roughness: 0.26,
      emissive: 0x6a4000,
      emissiveIntensity: 0.25,
      envMap: getStudioEnvMap(),
      envMapIntensity: 1.25,
    }),
  );
  const face = mat('coin-face', () => {
    const tex = getCoinFaceTextures();
    return new THREE.MeshStandardMaterial({
      color: 0xffc72a,
      map: tex.map,
      bumpMap: tex.bump,
      bumpScale: 3,
      metalness: 1,
      roughness: 0.3,
      emissive: 0x6a4000,
      emissiveIntensity: 0.22,
      envMap: getStudioEnvMap(),
      envMapIntensity: 1.25,
    });
  });
  return [rim, face];
}

function buildCoin() {
  const g = new THREE.Group();
  const c = mesh(getCoinGeometry(), getCoinMaterials());
  c.position.y = 0.55;
  g.add(c);
  g.userData.radius = 0.5;
  g.userData.tick = (t) => {
    c.rotation.y = t * 3.2;
  };
  return g;
}

// ------------------------------------------------------------------- item box

export function getItemBoxGeometry() {
  return geo('itembox', () => new RoundedBoxGeometry(ITEM_BOX_SIZE, ITEM_BOX_SIZE, ITEM_BOX_SIZE, 5, 0.22));
}

export function getQuestionMarkGeometry() {
  return geo('question', () => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.2, 0.2, 0),
      new THREE.Vector3(-0.17, 0.33, 0),
      new THREE.Vector3(-0.05, 0.41, 0),
      new THREE.Vector3(0.1, 0.4, 0),
      new THREE.Vector3(0.2, 0.3, 0),
      new THREE.Vector3(0.18, 0.16, 0),
      new THREE.Vector3(0.06, 0.07, 0),
      new THREE.Vector3(0.0, -0.02, 0),
      new THREE.Vector3(0.0, -0.11, 0),
    ]);
    const r = 0.072;
    const tube = new THREE.TubeGeometry(curve, 48, r, 14, false);
    const capA = new THREE.SphereGeometry(r, 14, 10);
    capA.translate(-0.2, 0.2, 0);
    const capB = new THREE.SphereGeometry(r, 14, 10);
    capB.translate(0, -0.11, 0);
    const dot = new THREE.SphereGeometry(0.088, 18, 12);
    dot.translate(0, -0.3, 0);
    const parts = [tube, capA, capB, dot].map((p) => {
      const q = p.index ? p.toNonIndexed() : p;
      q.deleteAttribute('uv');
      return q;
    });
    const merged = mergeGeometries(parts);
    [tube, capA, capB, dot].forEach((p) => p.dispose());
    merged.scale(1.35, 1.35, 1.35);
    return merged;
  });
}

export function getQuestionMarkMaterial() {
  return mat('question', () =>
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfff4d6,
      emissiveIntensity: 0.55,
      roughness: 0.25,
      metalness: 0.0,
      envMap: getStudioEnvMap(),
    }),
  );
}

/** Shared box material (one per ItemSystem is fine; uTime driven by owner). */
export function getItemBoxMaterial() {
  return mat('itembox', () => createItemBoxMaterial({ halfSize: ITEM_BOX_SIZE / 2 }));
}

function buildItemBox() {
  const g = new THREE.Group();
  const holder = new THREE.Group();
  holder.position.y = ITEM_BOX_SIZE / 2 + 0.1;
  g.add(holder);
  const boxMat = getItemBoxMaterial();
  const box = new THREE.Mesh(getItemBoxGeometry(), boxMat);
  box.renderOrder = 2;
  holder.add(box);
  const q = mesh(getQuestionMarkGeometry(), getQuestionMarkMaterial(), { cast: false });
  holder.add(q);
  g.userData.radius = 1.0;
  g.userData.tick = (t) => {
    boxMat.uniforms.uTime.value = t;
    box.rotation.set(0.25, t * 0.9, 0.18);
    q.rotation.y = Math.sin(t * 1.2) * 0.5;
    holder.position.y = ITEM_BOX_SIZE / 2 + 0.1 + Math.sin(t * 2) * 0.08;
  };
  return g;
}

// ---------------------------------------------------------------------- public

/**
 * Creates a model for an item type (`ITEMS.*`) or one of the extra keys
 * 'banana_peel' | 'item_box'. Triple variants return the single model.
 */
export function createItemModel(type) {
  switch (type) {
    case ITEMS.GREEN_SHELL:
    case ITEMS.TRIPLE_GREEN_SHELL:
      return buildShell('green');
    case ITEMS.RED_SHELL:
    case ITEMS.TRIPLE_RED_SHELL:
      return buildShell('red');
    case ITEMS.SPINY_SHELL:
      return buildShell('spiny');
    case ITEMS.BANANA:
    case ITEMS.TRIPLE_BANANA:
      return buildBanana(false);
    case 'banana_peel':
      return buildBanana(true);
    case ITEMS.MUSHROOM:
    case ITEMS.TRIPLE_MUSHROOM:
      return buildMushroom(false);
    case ITEMS.GOLDEN_MUSHROOM:
      return buildMushroom(true);
    case ITEMS.STAR:
      return buildStar();
    case ITEMS.BOMB:
      return buildBomb();
    case ITEMS.LIGHTNING:
      return buildLightning();
    case ITEMS.COIN:
      return buildCoin();
    case 'item_box':
      return buildItemBox();
    default:
      return buildMushroom(false);
  }
}

/** Frees per-instance resources (sprite materials) of a model made by createItemModel. */
export function disposeItemModel(group) {
  group.traverse((o) => {
    if (o.userData.ownMaterial && o.material) o.material.dispose();
  });
  group.removeFromParent();
}
