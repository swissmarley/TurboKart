import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

/**
 * Final-frame pipeline.
 *   low    : renderer.render() directly (+ a cheap overlay quad for flashes)
 *   medium : RenderPass → Bloom (half res) → Arcade FX → OutputPass → FXAA
 *   high   : RenderPass → Bloom (full res) → Arcade FX → OutputPass → SMAA
 * The arcade FX pass runs in linear HDR (before OutputPass) so tone mapping and
 * sRGB conversion happen exactly once, matching the direct-render colours.
 */

/** Bloom pass whose internal resolution can be scaled (medium = half res). */
class ScaledBloomPass extends UnrealBloomPass {
  constructor(resolution, strength, radius, threshold, scale = 1) {
    super(resolution, strength, radius, threshold);
    this.scale = scale;
  }

  setSize(width, height) {
    super.setSize(Math.max(2, Math.round(width * this.scale)), Math.max(2, Math.round(height * this.scale)));
  }
}

const ArcadeShader = {
  name: 'TurboKart.ArcadeFX',
  defines: { TAPS: 8 },
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1280, 720) },
    uTime: { value: 0 },
    uSpeed: { value: 0 },
    uBoost: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(0.85, 0.9, 1.0) },
    uHit: { value: 0 },
    uStar: { value: 0 },
    uVignette: { value: 0.32 },
    uGrain: { value: 0.035 },
    uSaturation: { value: 1.07 },
    uContrast: { value: 1.04 },
    uTint: { value: new THREE.Color(1.0, 1.0, 1.0) },
    uCenter: { value: new THREE.Vector2(0.5, 0.47) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uSpeed;
    uniform float uBoost;
    uniform float uFlash;
    uniform vec3 uFlashColor;
    uniform float uHit;
    uniform float uStar;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uSaturation;
    uniform float uContrast;
    uniform vec3 uTint;
    uniform vec2 uCenter;
    varying vec2 vUv;

    #define PI 3.14159265

    float hash12(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    vec3 hue(float h) {
      return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    }

    void main() {
      float aspect = uResolution.x / uResolution.y;
      vec2 dir = vUv - uCenter;
      vec2 adir = dir * vec2(aspect, 1.0);
      float dist = length(adir);
      float edge = smoothstep(0.18, 0.95, dist);

      // Chromatic aberration grows towards the edges and with speed/boost.
      float ca = (0.0012 + 0.0022 * uSpeed + 0.0055 * uBoost + 0.004 * uHit) * edge;
      float blur = uBoost * 0.085 * smoothstep(0.12, 0.85, dist);

      vec3 col;
      if (blur > 0.0008) {
        col = vec3(0.0);
        float wsum = 0.0;
        for (int i = 0; i < TAPS; i++) {
          float t = float(i) / float(TAPS - 1);
          float s = 1.0 - blur * t;
          float w = 1.0 - 0.5 * t;
          col.r += texture2D(tDiffuse, uCenter + dir * (s + ca)).r * w;
          col.g += texture2D(tDiffuse, uCenter + dir * s).g * w;
          col.b += texture2D(tDiffuse, uCenter + dir * (s - ca)).b * w;
          wsum += w;
        }
        col /= wsum;
      } else {
        col.r = texture2D(tDiffuse, uCenter + dir * (1.0 + ca)).r;
        col.g = texture2D(tDiffuse, vUv).g;
        col.b = texture2D(tDiffuse, uCenter + dir * (1.0 - ca)).b;
      }

      // Anime-style speed lines while boosting.
      if (uBoost > 0.01) {
        float ang = atan(adir.y, adir.x);
        float bins = 110.0;
        float a01 = (ang + PI) / (2.0 * PI) * bins;
        float id = floor(a01);
        float frame = floor(uTime * 14.0);
        float rnd = hash12(vec2(id, frame));
        float on = step(0.86, rnd);
        float cell = fract(a01);
        float thin = smoothstep(0.5, 0.0, abs(cell - 0.5));
        thin = pow(thin, 5.0);
        float along = fract(dist * 1.3 - uTime * 4.0 - rnd * 5.0);
        float dash = smoothstep(0.0, 0.25, along) * smoothstep(1.0, 0.55, along);
        float mask = smoothstep(0.5, 0.95, dist);
        float lines = on * thin * dash * mask * uBoost;
        col = mix(col, vec3(1.3, 1.35, 1.45), clamp(lines * 0.38, 0.0, 1.0));
      }

      // Star power: rainbow pulse around the frame edge.
      if (uStar > 0.01) {
        float ang = atan(adir.y, adir.x) / (2.0 * PI);
        vec3 rb = hue(fract(ang + uTime * 0.6));
        col += rb * uStar * 0.12 * smoothstep(0.62, 1.1, dist);
      }

      // Colour grading (linear HDR): saturation, gentle contrast about mid grey, tint.
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, uSaturation);
      col = max(col, vec3(0.0));
      col = 0.18 * pow(col / 0.18 + 1e-5, vec3(uContrast));
      col *= uTint;

      // Hit pulse: warm red edge.
      if (uHit > 0.01) {
        col = mix(col, col * vec3(1.2, 0.6, 0.55) + vec3(0.1, 0.0, 0.0), uHit * (0.08 + 0.6 * edge));
      }

      // Vignette (stronger while boosting).
      float vig = uVignette + uBoost * 0.18;
      col *= mix(1.0, smoothstep(1.15, 0.25, dist), vig);

      // Lightning flash.
      if (uFlash > 0.001) {
        col = mix(col, vec3(dot(col, vec3(0.333))) * 1.25, uFlash * 0.45);
        col += uFlashColor * uFlash * uFlash * 1.1;
      }

      // Film grain (luminance-weighted so blacks stay clean).
      float n = hash12(vUv * uResolution + fract(uTime * 13.37) * 400.0) - 0.5;
      col += n * uGrain * (0.06 + sqrt(max(luma, 0.0)) * 0.5);

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

/** Overlay used by the low-quality path for flashes / hit pulses. */
function makeOverlay() {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uFlash: { value: 0 },
      uHit: { value: 0 },
      uFlashColor: { value: new THREE.Color(0.85, 0.9, 1.0) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform float uFlash;
      uniform float uHit;
      uniform vec3 uFlashColor;
      varying vec2 vUv;
      void main() {
        float d = length((vUv - 0.5) * vec2(1.6, 1.0));
        float edge = smoothstep(0.3, 0.95, d);
        vec3 c = uFlashColor * uFlash * 0.85 + vec3(0.55, 0.0, 0.0) * uHit * edge;
        float a = clamp(uFlash * 0.85 + uHit * edge * 0.6, 0.0, 1.0);
        gl_FragColor = vec4(c / max(a, 0.001), a);
      }
    `,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  mesh.frustumCulled = false;
  const scene = new THREE.Scene();
  scene.add(mesh);
  return { scene, mesh, mat, camera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1) };
}

export class PostFX {
  constructor(renderer, scene, camera, quality = 'high') {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = null;
    this.composer = null;
    this.passes = null;
    this.width = 1;
    this.height = 1;
    this.pixelRatio = 1;
    this.time = 0;
    /** Live effect intensities (Effects writes these every frame). */
    this.state = { speed: 0, boost: 0, flash: 0, hit: 0, star: 0 };
    this.bloomParams = { strength: 0.75, radius: 0.5, threshold: 1.0 };
    this.grade = { saturation: 1.07, contrast: 1.04, vignette: 0.32, grain: 0.035, tint: 0xffffff };
    this.overlay = makeOverlay();
    const size = renderer.getSize(new THREE.Vector2());
    this.width = Math.max(1, size.x);
    this.height = Math.max(1, size.y);
    this.pixelRatio = renderer.getPixelRatio();
    this.setQuality(quality);
  }

  setQuality(quality) {
    if (!['low', 'medium', 'high'].includes(quality)) quality = 'high';
    if (quality === this.quality) return;
    this.quality = quality;
    this._destroyComposer();
    if (quality !== 'low') this._buildComposer();
  }

  _buildComposer() {
    const r = this.renderer;
    const high = this.quality === 'high';
    const composer = new EffectComposer(r);
    composer.setPixelRatio(this.pixelRatio);
    composer.setSize(this.width, this.height);

    const renderPass = new RenderPass(this.scene, this.camera);
    const bloom = new ScaledBloomPass(
      new THREE.Vector2(this.width * this.pixelRatio, this.height * this.pixelRatio),
      this.bloomParams.strength,
      this.bloomParams.radius,
      this.bloomParams.threshold,
      high ? 1 : 0.5,
    );
    const arcade = new ShaderPass(ArcadeShader);
    arcade.material.defines.TAPS = high ? 10 : 6;
    const output = new OutputPass();
    const aa = high ? new SMAAPass() : new FXAAPass();

    composer.addPass(renderPass);
    composer.addPass(bloom);
    composer.addPass(arcade);
    composer.addPass(output);
    composer.addPass(aa);
    // Re-run setSize so every pass (incl. scaled bloom / AA) gets pixel sizes.
    composer.setSize(this.width, this.height);

    this.composer = composer;
    this.passes = { renderPass, bloom, arcade, output, aa };
    this._applyBloom();
    this._applyGrade();
    this._syncResolution();
  }

  _destroyComposer() {
    if (!this.composer) return;
    for (const p of Object.values(this.passes)) p.dispose?.();
    this.composer.dispose();
    this.composer = null;
    this.passes = null;
  }

  _applyBloom() {
    if (!this.passes) return;
    const b = this.passes.bloom;
    b.strength = this.bloomParams.strength;
    b.radius = this.bloomParams.radius;
    b.threshold = this.bloomParams.threshold;
  }

  _syncResolution() {
    if (!this.passes) return;
    this.passes.arcade.uniforms.uResolution.value.set(this.width * this.pixelRatio, this.height * this.pixelRatio);
  }

  setBloom({ strength, radius, threshold } = {}) {
    if (strength !== undefined) this.bloomParams.strength = strength;
    if (radius !== undefined) this.bloomParams.radius = radius;
    if (threshold !== undefined) this.bloomParams.threshold = threshold;
    this._applyBloom();
  }

  /** Colour grade / vignette / grain tuning (per theme). */
  setGrade({ saturation, contrast, vignette, grain, tint } = {}) {
    const g = this.grade;
    if (saturation !== undefined) g.saturation = saturation;
    if (contrast !== undefined) g.contrast = contrast;
    if (vignette !== undefined) g.vignette = vignette;
    if (grain !== undefined) g.grain = grain;
    if (tint !== undefined) g.tint = tint;
    this._applyGrade();
  }

  _applyGrade() {
    if (!this.passes) return;
    const u = this.passes.arcade.uniforms;
    const g = this.grade;
    u.uSaturation.value = g.saturation;
    u.uContrast.value = g.contrast;
    u.uVignette.value = g.vignette;
    u.uGrain.value = g.grain;
    u.uTint.value.set(g.tint);
  }

  setSize(width, height, pixelRatio = this.pixelRatio) {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.pixelRatio = pixelRatio || 1;
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(this.width, this.height);
      this._syncResolution();
    }
  }

  setCamera(camera) {
    this.camera = camera;
    if (this.passes) this.passes.renderPass.camera = camera;
  }

  setScene(scene) {
    this.scene = scene;
    if (this.passes) this.passes.renderPass.scene = scene;
  }

  render(dt = 1 / 60) {
    this.time += dt;
    const s = this.state;
    if (!this.composer) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      if (s.flash > 0.004 || s.hit > 0.004) {
        const u = this.overlay.mat.uniforms;
        u.uFlash.value = Math.min(1, s.flash);
        u.uHit.value = Math.min(1, s.hit);
        const ac = this.renderer.autoClear;
        this.renderer.autoClear = false;
        this.renderer.render(this.overlay.scene, this.overlay.camera);
        this.renderer.autoClear = ac;
      }
      return;
    }
    const u = this.passes.arcade.uniforms;
    u.uTime.value = this.time % 1000;
    u.uSpeed.value = s.speed;
    u.uBoost.value = s.boost;
    u.uFlash.value = s.flash;
    u.uHit.value = s.hit;
    u.uStar.value = s.star;
    this.composer.render(dt);
  }

  dispose() {
    this._destroyComposer();
    this.overlay.mesh.geometry.dispose();
    this.overlay.mat.dispose();
  }
}
