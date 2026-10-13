/**
 * Sky dome (gradient + sun + procedural clouds, or night stars + nebula) and the
 * PMREM environment map generated from it.
 */
import * as THREE from 'three';

const NOISE_GLSL = /* glsl */ `
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * .1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * .1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float vnoise3(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = mix(mix(hash13(i), hash13(i + vec3(1,0,0)), u.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), u.x), u.y);
  float b = mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), u.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), u.x), u.y);
  return mix(a, b, u.z);
}
float fbm2(vec2 p) {
  float s = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 6; i++) { s += a * vnoise(p); p = m * p; a *= 0.5; }
  return s;
}
float fbm3(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}
`;

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uHazeColor;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform vec3 uCloudColor;
uniform vec3 uCloudShade;
uniform float uSunSize;
uniform float uSunGlow;
uniform float uCloudCover;
uniform float uCloudScale;
uniform float uHaze;
uniform float uTime;
uniform float uNight;
uniform float uExposure;
uniform float uStatic;
varying vec3 vDir;
${NOISE_GLSL}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float t = pow(clamp(h, 0.0, 1.0), 0.42);
  vec3 col = mix(uHorizon, uZenith, t);
  // ground below horizon (seen in reflections / env map)
  col = mix(col, uGround, smoothstep(0.0, -0.12, h));
  float sd = max(dot(d, uSunDir), 0.0);

  if (uNight < 0.5) {
    // warm scattering around the sun + horizon haze
    col += uSunColor * (pow(sd, 6.0) * 0.35 + pow(sd, 48.0) * 0.6) * uSunGlow;
    col = mix(col, uHazeColor, (1.0 - smoothstep(0.0, 0.2, abs(h))) * uHaze * 0.7);
    // clouds
    if (uCloudCover > 0.0 && h > -0.02) {
      vec2 uv = d.xz / (max(h, 0.0) + 0.18) * 0.55 * uCloudScale;
      uv += vec2(uTime * 0.0035, uTime * 0.0015) * (1.0 - uStatic);
      float n = fbm2(uv * 1.3);
      float cov = 1.0 - uCloudCover;
      float c = smoothstep(cov, cov + 0.16, n);
      float n2 = fbm2(uv * 1.3 + uSunDir.xz * 0.12);
      float lit = clamp(0.55 + (n - n2) * 4.0, 0.0, 1.0);
      vec3 cc = mix(uCloudShade, uCloudColor, lit);
      cc += uSunColor * pow(sd, 5.0) * 0.5 * uSunGlow;
      c *= smoothstep(-0.02, 0.16, h) * 0.95;
      col = mix(col, cc, c);
    }
    // sun disc
    float disc = smoothstep(cos(uSunSize * 0.0105), cos(uSunSize * 0.0085), dot(d, uSunDir));
    col += uSunColor * disc * 6.0;
  } else {
    // ---- night sky: nebula, galactic band, stars ----
    vec3 bandN = normalize(vec3(0.35, 0.82, -0.45));
    float band = exp(-pow(dot(d, bandN) / 0.32, 2.0));
    float neb = fbm3(d * 2.6 + vec3(0.0, 0.0, uTime * 0.002));
    float neb2 = fbm3(d * 5.3 + 7.1);
    vec3 nebCol = mix(vec3(0.42, 0.06, 0.62), vec3(0.04, 0.35, 0.75), smoothstep(0.35, 0.7, neb2));
    nebCol = mix(nebCol, vec3(0.95, 0.15, 0.55), smoothstep(0.62, 0.8, neb) * 0.6);
    float nebAmt = smoothstep(0.38, 0.78, neb) * (0.25 + 0.95 * band);
    col += nebCol * nebAmt * 0.9;
    // dust lanes
    col *= 1.0 - smoothstep(0.55, 0.75, neb2) * band * 0.45;
    // stars (3 layers)
    for (int L = 0; L < 3; L++) {
      float scale = L == 0 ? 90.0 : (L == 1 ? 180.0 : 320.0);
      vec3 p = d * scale;
      vec3 cell = floor(p);
      float r = hash13(cell + float(L) * 17.0);
      vec3 off = vec3(hash13(cell + 1.7), hash13(cell + 5.3), hash13(cell + 9.1)) - 0.5;
      float dist = length(fract(p) - 0.5 - off * 0.6);
      float thresh = L == 0 ? 0.985 : (L == 1 ? 0.955 : 0.93 - band * 0.2);
      float size = L == 0 ? 0.11 : 0.08;
      float tw = 0.65 + 0.35 * sin(uTime * (1.5 + r * 4.0) + r * 60.0);
      float s = smoothstep(size, 0.0, dist) * step(thresh, r) * tw;
      vec3 sc = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.7), hash13(cell + 3.3));
      col += sc * s * (L == 0 ? 3.0 : 1.4);
    }
  }
  col *= uExposure;
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/**
 * @param {object} skyStyle   THEME_STYLES[x].sky
 * @param {THREE.Vector3} sunDir
 * @param {boolean} night
 */
export function createSkyMaterial(skyStyle, sunDir, night, { exposure = 1, staticClouds = false } = {}) {
  return new THREE.ShaderMaterial({
    name: 'TrackSky',
    uniforms: {
      uZenith: { value: new THREE.Color(skyStyle.zenith) },
      uHorizon: { value: new THREE.Color(skyStyle.horizon) },
      uHazeColor: { value: new THREE.Color(skyStyle.hazeColor ?? skyStyle.horizon) },
      uGround: { value: new THREE.Color(skyStyle.ground) },
      uSunDir: { value: sunDir.clone() },
      uSunColor: { value: new THREE.Color(skyStyle.sunColor) },
      uCloudColor: { value: new THREE.Color(skyStyle.cloudColor) },
      uCloudShade: { value: new THREE.Color(skyStyle.cloudShade) },
      uSunSize: { value: skyStyle.sunSize },
      uSunGlow: { value: skyStyle.sunGlow },
      uCloudCover: { value: skyStyle.cloudCover },
      uCloudScale: { value: skyStyle.cloudScale },
      uHaze: { value: skyStyle.haze },
      uTime: { value: 0 },
      uNight: { value: night ? 1 : 0 },
      uExposure: { value: exposure },
      uStatic: { value: staticClouds ? 1 : 0 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
}

export function createSkyDome(material) {
  const geo = new THREE.SphereGeometry(1000, 48, 24);
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'SkyDome';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.onBeforeRender = (renderer, scene, camera) => {
    mesh.position.copy(camera.position);
    mesh.updateMatrixWorld();
  };
  return mesh;
}

/**
 * Environment map from the sky (plus optional extra objects for reflections).
 * @returns {THREE.WebGLRenderTarget|null}
 */
export function createEnvironment(renderer, skyStyle, sunDir, night, extra = []) {
  if (!renderer) return null;
  const envScene = new THREE.Scene();
  const mat = createSkyMaterial(skyStyle, sunDir, night, { exposure: 1, staticClouds: true });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), mat);
  dome.frustumCulled = false;
  envScene.add(dome);
  for (const o of extra) envScene.add(o);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0.02, 0.1, 200);
  pmrem.dispose();
  dome.geometry.dispose();
  mat.dispose();
  for (const o of extra) {
    o.traverse?.((c) => {
      c.geometry?.dispose?.();
      c.material?.dispose?.();
    });
  }
  return rt;
}
