import * as THREE from 'three';

/**
 * Iridescent, translucent rainbow material for the item boxes. Works on both
 * plain meshes and InstancedMesh (per-instance `aPhase` attribute optional).
 * Bright frosted edges, view-dependent hue (thin-film look), moving sheen
 * bands, and an inner glow. Fog aware and tone-mapped like built-ins.
 */
export function createItemBoxMaterial({ halfSize = 0.75 } = {}) {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uHalf: { value: halfSize },
      uOpacity: { value: 1 },
    },
  ]);

  const vertexShader = /* glsl */ `
    uniform float uTime;
    attribute float aPhase;
    varying vec3 vNormalW;
    varying vec3 vViewDir;
    varying vec3 vObjPos;
    varying float vPhase;
    #include <common>
    #include <fog_pars_vertex>
    void main() {
      vec4 local = vec4(position, 1.0);
      vec3 n = normal;
      #ifdef USE_INSTANCING
        local = instanceMatrix * local;
        n = mat3(instanceMatrix) * n;
      #endif
      vObjPos = position;
      #ifdef HAS_PHASE
        vPhase = aPhase;
      #else
        vPhase = 0.0;
      #endif
      vec4 worldPos = modelMatrix * local;
      vNormalW = normalize(mat3(modelMatrix) * n);
      vViewDir = normalize(cameraPosition - worldPos.xyz);
      vec4 mvPosition = viewMatrix * worldPos;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }
  `;

  const fragmentShader = /* glsl */ `
    uniform float uTime;
    uniform float uHalf;
    uniform float uOpacity;
    varying vec3 vNormalW;
    varying vec3 vViewDir;
    varying vec3 vObjPos;
    varying float vPhase;
    #include <common>
    #include <fog_pars_fragment>

    vec3 hsv2rgb(vec3 c) {
      vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
      return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
    }

    void main() {
      vec3 n = normalize(vNormalW);
      if (!gl_FrontFacing) n = -n;
      float ndv = abs(dot(n, vViewDir));
      float fres = pow(1.0 - ndv, 2.2);

      vec3 a = abs(vObjPos) / uHalf;
      float mx = max(a.x, max(a.y, a.z));
      float mn = min(a.x, min(a.y, a.z));
      float md = a.x + a.y + a.z - mx - mn;
      float edge = smoothstep(0.74, 0.96, md);
      float corner = smoothstep(0.8, 0.97, mn);

      float swirl = 0.13 * sin(vObjPos.y * 3.1 + vObjPos.x * 2.3 - vObjPos.z * 1.7 + uTime * 1.3 + vPhase * 4.0);
      float hue = fract(dot(vObjPos, vec3(0.33, 0.52, 0.21)) * 0.5 + swirl + uTime * 0.1 + fres * 0.3 + vPhase);
      vec3 rainbow = hsv2rgb(vec3(hue, 0.9, 1.0));
      vec3 rainbow2 = hsv2rgb(vec3(fract(hue + 0.3), 0.8, 1.0));

      float band = sin((vObjPos.x * 1.3 + vObjPos.y * 2.0 - vObjPos.z * 0.7) * 2.2 - uTime * 2.4 - vPhase * 6.0);
      float sheen = pow(max(0.0, band), 18.0);

      vec3 col;
      float alpha;
      if (gl_FrontFacing) {
        col = mix(rainbow * 0.82, rainbow2 * 0.95, fres) + vec3(1.0) * (edge * 0.3 + corner * 0.2 + sheen * 0.45);
        alpha = 0.46 + fres * 0.38 + edge * 0.4 + sheen * 0.3;
      } else {
        col = rainbow * 0.8 + vec3(0.2) * edge;
        alpha = 0.2 + edge * 0.3;
      }
      gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.96) * uOpacity);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      #include <fog_fragment>
    }
  `;

  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
  });
  // keep the rainbow vivid: skip filmic tone mapping (it washes saturated colours out)
  mat.toneMapped = false;
  return mat;
}
