import * as THREE from 'three';
import { EVENTS, GAME_STATES, SURFACES, ITEMS } from '../core/constants.js';
import { ParticleLayer, ParticleSpec, MODE } from './ParticleLayer.js';
import { getSpriteAtlas, disposeSpriteAtlas, SPRITE } from './spriteAtlas.js';
import { PostFX } from './PostFX.js';
import { rand, range, spread, seed } from './rng.js';
import {
  count, hueToSpec, hexRGB, flash, sparks, starBurst, ring, puffs, explosion, itemBoxShatter,
  coinSparkle, coinSpill, lightningBolt, confettiBurst, confettiPiece, fireworkBurst,
} from './emitters.js';

/**
 * Effects: pooled particles (2 draw calls) + post-processing. Owns the final
 * render (Game calls `render()` instead of `renderer.render`).
 */

const QUALITY = {
  low: { add: 900, alpha: 500, rate: 0.4, heavyDist: 55, lightDist: 70 },
  medium: { add: 1600, alpha: 900, rate: 0.7, heavyDist: 80, lightDist: 100 },
  high: { add: 2600, alpha: 1400, rate: 1.0, heavyDist: 110, lightDist: 130 },
};

// Saturated render palette for the drift tiers (hues match DRIFT_LEVELS in constants; tuned so
// ACES + bloom keep the colour identity instead of washing to white).
const DRIFT_RGB = [
  [1.0, 0.8, 0.35],
  [0.12, 0.5, 1.0],
  [1.0, 0.27, 0.02],
  [0.78, 0.2, 1.0],
];
// Mini-turbo flame tints (hot core → level colour)
const LEVEL_FLAME = [
  [2.4, 1.6, 0.6],
  [0.7, 1.6, 3.6],
  [3.2, 1.4, 0.35],
  [2.2, 0.8, 3.6],
];

const THEME_STYLE = {
  meadow: { dust: 0x9a8058, accent: 0x5fbf3a, kind: 'grass', roadDust: 0xb8b2a6 },
  desert: { dust: 0xe0b878, accent: 0xf2cf8f, kind: 'sand', roadDust: 0xd8c4a0 },
  snow: { dust: 0xf4f8ff, accent: 0xffffff, kind: 'snow', roadDust: 0xe8eef8 },
  neon: { dust: 0x6a4cff, accent: 0x40f0ff, kind: 'neon', roadDust: 0x8a7aff },
};

const _v0 = new THREE.Vector3();
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3(0, 0, 1);
const _vel = new THREE.Vector3();
const _p = { x: 0, y: 0, z: 0 };

const LOCAL = {
  exhaustL: new THREE.Vector3(0.32, 0.45, -1.15),
  exhaustR: new THREE.Vector3(-0.32, 0.45, -1.15),
  wheelRL: new THREE.Vector3(0.72, 0.3, -0.8),
  wheelRR: new THREE.Vector3(-0.72, 0.3, -0.8),
  wheelFL: new THREE.Vector3(0.72, 0.3, 0.8),
  wheelFR: new THREE.Vector3(-0.72, 0.3, 0.8),
  body: new THREE.Vector3(0, 0.8, 0),
};

function isMiniTurboSource(src) {
  const s = String(src || '').toLowerCase();
  return s.includes('drift') || s.includes('mini') || s.includes('turbo');
}

export class Effects {
  /**
   * @param {{ renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, bus: any, quality?: string }} o
   */
  constructor({ renderer, scene, camera, bus, quality = 'high' }) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.bus = bus;
    this.quality = QUALITY[quality] ? quality : 'high';
    this.Q = QUALITY[this.quality];
    this.atlas = getSpriteAtlas();
    this.S = new ParticleSpec();
    this.time = 0;
    this.lastDt = 1 / 60;
    this.track = null;
    this.style = THEME_STYLE.meadow;
    this.dustRGB = hexRGB(this.style.dust);
    this.roadDustRGB = hexRGB(this.style.roadDust);
    this.accentRGB = hexRGB(this.style.accent);
    this.karts = [];
    this.playerKart = null;
    this.state = null;
    this.kartState = new Map();
    this.tasks = [];
    this.lightFlash = 0;
    this.post = new PostFX(renderer, scene, camera, this.quality);
    this.postState = this.post.state;
    this.boostFx = 0;
    this.hitFx = 0;
    this.flashFx = 0;
    this.starFx = 0;
    seed(12345);

    this._buildLayers();

    // One permanent point light for explosion / lightning flashes (constant light
    // count → no shader recompiles). Idle intensity 0.
    this.flashLight = new THREE.PointLight(0xffa040, 0, 45, 2);
    this.flashLight.name = 'TurboKart.fxFlashLight';
    this.flashLight.castShadow = false;
    scene.add(this.flashLight);

    this._subs = [];
    this._bindEvents();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  setTrack(track) {
    this.track = track;
    const theme = track?.theme || {};
    const key = track?.def?.musicTheme || this._guessTheme(track?.id || '');
    this.style = THEME_STYLE[key] || THEME_STYLE.meadow;
    this.themeKey = key;
    this.dustRGB = hexRGB(theme.dustColor ?? this.style.dust);
    this.accentRGB = hexRGB(this.style.accent);
    this.roadDustRGB = hexRGB(this.style.roadDust);
    this.sparkTint = theme.sparkTint !== undefined ? hexRGB(theme.sparkTint) : null;
    const night = !!theme.isNight || key === 'neon';
    if (night) {
      this.post.setBloom({ strength: 0.8, radius: 0.5, threshold: 0.82 });
      this.post.setGrade({ saturation: 1.12, contrast: 1.06, vignette: 0.42, grain: 0.04, tint: 0xf4f0ff });
    } else if (key === 'snow') {
      this.post.setBloom({ strength: 0.6, radius: 0.5, threshold: 1.35 });
      this.post.setGrade({ saturation: 1.05, contrast: 1.04, vignette: 0.32, grain: 0.03, tint: 0xfff6ee });
    } else if (key === 'desert') {
      this.post.setBloom({ strength: 0.62, radius: 0.5, threshold: 1.2 });
      this.post.setGrade({ saturation: 1.08, contrast: 1.05, vignette: 0.36, grain: 0.035, tint: 0xfff4e6 });
    } else {
      this.post.setBloom({ strength: 0.65, radius: 0.48, threshold: 1.15 });
      this.post.setGrade({ saturation: 1.08, contrast: 1.04, vignette: 0.3, grain: 0.03, tint: 0xffffff });
    }
  }

  setCamera(camera) {
    this.camera = camera;
    this.post.setCamera(camera);
  }

  /** Addition to the contract: render a different scene (e.g. after Game swaps scenes). */
  setScene(scene) {
    if (scene === this.scene) return;
    this.scene = scene;
    this.post.setScene(scene);
    this._ensureInScene();
  }

  setSize(width, height, pixelRatio) {
    this.post.setSize(width, height, pixelRatio ?? this.renderer.getPixelRatio());
  }

  setQuality(quality) {
    if (!QUALITY[quality]) quality = 'high';
    if (quality === this.quality) return;
    this.quality = quality;
    this.Q = QUALITY[quality];
    this.post.setQuality(quality);
    const old = [this.add, this.alpha];
    this._buildLayers();
    for (const l of old) l.dispose();
  }

  clear() {
    this.add.clear();
    this.alpha.clear();
    this.tasks.length = 0;
    this.kartState.clear();
    this.followKart = null;
    this.flashFx = 0;
    this.hitFx = 0;
    this.boostFx = 0;
    this.starFx = 0;
    this.lightFlash = 0;
    this.flashLight.intensity = 0;
  }

  update(dt, ctx = {}) {
    dt = Math.min(Math.max(dt || 0, 0), 0.1);
    this.lastDt = dt;
    this.time += dt;
    const { karts, playerKart, camera, state } = ctx;
    if (camera && camera !== this.camera) this.setCamera(camera);
    this.karts = karts || [];
    this.playerKart = playerKart || null;
    this.state = state ?? this.state;
    this._ensureInScene();

    this.add.setFog(this.scene.fog);
    this.alpha.setFog(this.scene.fog);

    // Kart-relative frame for celebration particles (confetti / fireworks follow the winner).
    const fk = this.followKart;
    if (fk && fk.position && this._followPrev) {
      const fd = this.add.followDelta;
      fd.x = fk.position.x - this._followPrev.x;
      fd.y = fk.position.y - this._followPrev.y;
      fd.z = fk.position.z - this._followPrev.z;
      if (fd.x * fd.x + fd.z * fd.z > 400) fd.x = fd.y = fd.z = 0; // teleport (respawn)
      this.alpha.followDelta.x = fd.x;
      this.alpha.followDelta.y = fd.y;
      this.alpha.followDelta.z = fd.z;
      this._followPrev.copy(fk.position);
      this.fx.groundY = fk.position.y;
    } else {
      this.add.followDelta.x = this.add.followDelta.y = this.add.followDelta.z = 0;
      this.alpha.followDelta.x = this.alpha.followDelta.y = this.alpha.followDelta.z = 0;
    }

    this.add.simulate(dt);
    this.alpha.simulate(dt);

    this._runTasks(dt);

    const camPos = this.camera ? this.camera.getWorldPosition(_v0) : _v0.set(0, 0, 0);
    this._camX = camPos.x;
    this._camY = camPos.y;
    this._camZ = camPos.z;

    if (dt > 0) {
      for (const kart of this.karts) this._updateKart(kart, dt);
    }

    this.add.upload();
    this.alpha.upload();

    this._updatePost(dt);
  }

  render() {
    this.post.render(this.lastDt || 1 / 60);
  }

  dispose() {
    for (const off of this._subs) off();
    this._subs.length = 0;
    this.add.dispose();
    this.alpha.dispose();
    this.flashLight.removeFromParent();
    this.flashLight.dispose?.();
    this.post.dispose();
    disposeSpriteAtlas();
    this.kartState.clear();
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  _guessTheme(id) {
    if (/snow|frost|ice/.test(id)) return 'snow';
    if (/dune|desert|sand/.test(id)) return 'desert';
    if (/neon|sky|space|rainbow/.test(id)) return 'neon';
    return 'meadow';
  }

  _buildLayers() {
    const Q = this.Q;
    this.alpha = new ParticleLayer({ capacity: Q.alpha, additive: false, texture: this.atlas, name: 'fxAlpha', renderOrder: 20 });
    this.add = new ParticleLayer({ capacity: Q.add, additive: true, texture: this.atlas, name: 'fxAdditive', renderOrder: 21 });
    this.fx = { add: this.add, alpha: this.alpha, S: this.S, q: Q.rate };
    this._ensureInScene();
  }

  _ensureInScene() {
    if (!this.scene) return;
    if (this.alpha.mesh.parent !== this.scene) this.scene.add(this.alpha.mesh);
    if (this.add.mesh.parent !== this.scene) this.scene.add(this.add.mesh);
    if (this.flashLight && this.flashLight.parent !== this.scene) this.scene.add(this.flashLight);
  }

  _on(name, fn) {
    if (!this.bus || !name) return;
    this._subs.push(this.bus.on(name, (p) => fn.call(this, p || {})));
  }

  /** Distance from camera to a point (Vector3-like). */
  _camDist(p) {
    if (!p) return 0;
    const dx = p.x - this._camX;
    const dy = p.y - this._camY;
    const dz = p.z - this._camZ;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /** Quality × distance scale for bursts; 0 = skip. */
  _burstScale(p, heavy = true) {
    if (!this.camera) return 1;
    if (this._camX === undefined) {
      const c = this.camera.getWorldPosition(_v2);
      this._camX = c.x; this._camY = c.y; this._camZ = c.z;
    }
    const d = this._camDist(p);
    const max = heavy ? this.Q.heavyDist : this.Q.lightDist;
    if (d > max) return 0;
    return d < max * 0.4 ? 1 : 1 - ((d - max * 0.4) / (max * 0.6)) * 0.7;
  }

  _withScale(scale, fn) {
    const q = this.fx.q;
    this.fx.q = q * scale;
    try {
      fn();
    } finally {
      this.fx.q = q;
    }
  }

  _bindEvents() {
    this._on(EVENTS.KART_DRIFT_END, ({ kart, level }) => {
      if (kart && level > 0) this._miniTurbo(kart, level);
    });
    this._on(EVENTS.KART_DRIFT_LEVEL, ({ kart, level }) => {
      if (kart && level > 0) this._driftLevelPop(kart, level);
    });
    this._on(EVENTS.KART_BOOST, ({ kart, source }) => {
      if (!kart || isMiniTurboSource(source)) return;
      this._boostBurst(kart, source);
    });
    this._on(EVENTS.KART_LAND, ({ kart, impact }) => kart && this._landDust(kart, impact || 4));
    this._on(EVENTS.KART_HOP, ({ kart }) => kart && this._hopPuff(kart));
    this._on(EVENTS.KART_WALL_HIT, ({ kart, impact, point }) => kart && this._wallHit(kart, impact || 5, point));
    this._on(EVENTS.KART_BUMP, ({ kartA, kartB, impact, point }) => this._bump(kartA, kartB, impact || 4, point));
    this._on(EVENTS.ITEM_BOX_HIT, ({ kart, position }) => {
      const p = position || kart?.position;
      if (!p) return;
      const s = this._burstScale(p);
      if (s > 0) this._withScale(s, () => itemBoxShatter(this.fx, p, this._groundYAt(p, kart, 1.3)));
    });
    this._on(EVENTS.ITEM_EXPLOSION, ({ position, radius, type }) => {
      if (!position) return;
      const s = this._burstScale(position);
      if (s <= 0) return;
      const blue = type === ITEMS.SPINY_SHELL;
      this._withScale(s, () => explosion(this.fx, position, radius || 7, { blue, groundY: this._groundYAt(position, null, 0) }));
      const d = this._camDist(position);
      this.flashLight.color.set(blue ? 0x6aa0ff : 0xffa040);
      this.flashLight.position.set(position.x, position.y + 2, position.z);
      this.lightFlash = Math.max(this.lightFlash, 1);
      this.lightFlashPower = 140;
      if (d < 25) this.flashFx = Math.max(this.flashFx, 0.18 * (1 - d / 25));
    });
    this._on(EVENTS.COIN_PICKUP, ({ kart, position }) => {
      const p = position || (kart && this._anchor(kart, 'body', _v1));
      if (!p) return;
      const s = this._burstScale(p, false);
      if (s > 0) this._withScale(s, () => coinSparkle(this.fx, p));
    });
    this._on(EVENTS.COIN_LOST, ({ kart, amount, position }) => {
      const p = position || kart?.position;
      if (!p || !amount) return;
      if (this._burstScale(p, false) > 0) coinSpill(this.fx, p, amount, this._groundYAt(p, kart, 0));
    });
    this._on(EVENTS.ITEM_HIT, ({ kart, type, position }) => {
      const p = position || (kart && this._anchor(kart, 'body', _v1));
      if (!p) return;
      if (kart?.isPlayer) this.hitFx = 1;
      if (type === ITEMS.BOMB || type === ITEMS.SPINY_SHELL) return; // explosion covers it
      const s = this._burstScale(p);
      if (s <= 0) return;
      this._withScale(s, () => {
        flash(this.fx, p, 3, 4, 3.4, 2, 0.15);
        starBurst(this.fx, p, 8, { speed: 6, size: 0.42 });
        sparks(this.fx, p, 18, { speed: 9, life: 0.4 });
      });
    });
    this._on(EVENTS.ITEM_BLOCKED, ({ position, kart }) => {
      const p = position || kart?.position;
      if (!p) return;
      const s = this._burstScale(p);
      if (s <= 0) return;
      this._withScale(s, () => {
        flash(this.fx, p, 2.6, 2.4, 3, 4, 0.14);
        ring(this.fx, p, 0.4, 3, 0.25, 1.6, 2.2, 3.5, { flat: false, soft: true });
        sparks(this.fx, p, 16, { speed: 8, r: 2.6, g: 3, b: 4, r2: 0.8, g2: 1.2, b2: 2.5 });
      });
    });
    this._on(EVENTS.ITEM_DESTROYED, ({ type, position }) => {
      if (!position) return;
      const s = this._burstScale(position);
      if (s <= 0) return;
      const col = this._itemColor(type);
      this._withScale(s, () => {
        flash(this.fx, position, 1.6, 2.5, 2.2, 1.6, 0.12);
        this._chunks(position, 8, col);
        puffs(this.fx, position, 4, { size: 0.3, sizeEnd: 1.1, life: 0.6, alpha: 0.4, speed: 1.5 });
      });
    });
    this._on(EVENTS.ITEM_SHELL_BOUNCE, ({ position }) => {
      if (!position || this._burstScale(position) <= 0) return;
      sparks(this.fx, position, 8, { speed: 6, life: 0.25, size: 0.05 });
    });
    this._on(EVENTS.ITEM_USE, ({ kart, type, position }) => {
      if (!kart) return;
      if (type === ITEMS.GREEN_SHELL || type === ITEMS.RED_SHELL || type === ITEMS.TRIPLE_GREEN_SHELL ||
          type === ITEMS.TRIPLE_RED_SHELL || type === ITEMS.SPINY_SHELL || type === ITEMS.BOMB) {
        const p = position || this._anchor(kart, 'body', _v1);
        if (this._burstScale(p, false) <= 0) return;
        puffs(this.fx, p, 4, { size: 0.3, sizeEnd: 1.2, life: 0.5, alpha: 0.35, speed: 2 });
      }
    });
    this._on(EVENTS.ITEM_LIGHTNING, ({ kart }) => this._lightning(kart));
    this._on(EVENTS.KART_SPINOUT, ({ kart }) => {
      if (!kart) return;
      if (kart.isPlayer) this.hitFx = Math.max(this.hitFx, 0.8);
      const p = kart.position;
      if (this._burstScale(p) <= 0) return;
      _p.x = p.x; _p.y = p.y + 0.2; _p.z = p.z;
      puffs(this.fx, _p, 8, {
        r: this.roadDustRGB[0], g: this.roadDustRGB[1], b: this.roadDustRGB[2],
        size: 0.4, sizeEnd: 1.6, life: 0.8, alpha: 0.4, speed: 3, radial: true, up: 0.6,
      });
    });
    this._on(EVENTS.KART_LAUNCHED, ({ kart }) => {
      if (kart?.isPlayer) this.hitFx = 1;
    });
    this._on(EVENTS.KART_TRICK, ({ kart }) => kart && this._trick(kart));
    this._on(EVENTS.KART_RESPAWN, ({ kart }) => kart && this._respawnSparkle(kart));
    this._on(EVENTS.KART_SHRINK, ({ kart }) => {
      if (!kart || this._burstScale(kart.position) <= 0) return;
      const p = this._anchor(kart, 'body', _v1);
      puffs(this.fx, p, 8, { r: 0.85, g: 0.8, b: 1, size: 0.4, sizeEnd: 1.8, life: 0.7, alpha: 0.6, speed: 3 });
      sparks(this.fx, p, 10, { speed: 6, r: 3, g: 3, b: 1.2, life: 0.3 });
    });
    this._on(EVENTS.KART_STAR_START, ({ kart }) => {
      if (!kart || this._burstScale(kart.position) <= 0) return;
      const p = this._anchor(kart, 'body', _v1);
      for (let i = 0; i < count(this.fx, 30); i++) {
        const S = this.S.reset();
        const a = (i / 30) * Math.PI * 2;
        S.pos(p);
        S.vx = Math.cos(a) * 7;
        S.vz = Math.sin(a) * 7;
        S.vy = range(0, 3);
        S.drag = 2.5;
        S.life = 0.6;
        S.size = 0.45;
        S.sizeEnd = 0.05;
        hueToSpec(S, i / 30, 3.2, 0.8);
        S.sprite = SPRITE.SPARKLE;
        this.add.spawn(S);
      }
      flash(this.fx, p, 4, 3.5, 3.2, 1.5, 0.2);
    });
    this._on(EVENTS.KART_START_STALL, ({ kart }) => {
      if (!kart) return;
      for (const name of ['exhaustL', 'exhaustR']) {
        const p = this._anchor(kart, name, _v1);
        puffs(this.fx, p, 6, { r: 0.08, g: 0.08, b: 0.09, r2: 0.25, g2: 0.25, b2: 0.26, size: 0.3, sizeEnd: 1.4, life: 1.1, alpha: 0.75, speed: 1.2, up: 1.5 });
      }
    });
    this._on(EVENTS.RACE_FINISH, ({ kart }) => {
      if (kart?.isPlayer) this.celebrate(kart);
    });
  }

  _itemColor(type) {
    switch (type) {
      case ITEMS.GREEN_SHELL:
      case ITEMS.TRIPLE_GREEN_SHELL:
        return [0.2, 0.8, 0.3];
      case ITEMS.RED_SHELL:
      case ITEMS.TRIPLE_RED_SHELL:
        return [0.9, 0.15, 0.12];
      case ITEMS.SPINY_SHELL:
        return [0.2, 0.4, 1];
      case ITEMS.BANANA:
      case ITEMS.TRIPLE_BANANA:
        return [1, 0.85, 0.2];
      default:
        return [0.4, 0.4, 0.42];
    }
  }

  _chunks(p, n, col) {
    const S = this.S;
    const groundY = this._groundYAt(p, null, 0.3);
    for (let i = 0; i < count(this.fx, n); i++) {
      S.reset();
      S.pos(p);
      const a = rand() * Math.PI * 2;
      const sp = range(2, 5);
      S.vx = Math.cos(a) * sp;
      S.vz = Math.sin(a) * sp;
      S.vy = range(3, 7);
      S.gravity = 22;
      S.life = range(0.8, 1.2);
      S.size = range(0.12, 0.24);
      S.color(col[0], col[1], col[2]);
      S.fadeOut = 0.7;
      S.rot = rand() * 6;
      S.rotVel = spread(14);
      S.sprite = SPRITE.CHUNK;
      S.floor = groundY;
      S.bounce = 0.35;
      this.alpha.spawn(S);
    }
  }

  /** Approximate ground height under p (uses the kart if given). */
  _groundYAt(p, kart, fallbackOffset = 0) {
    if (kart && kart.position) return kart.position.y;
    if (this.track && typeof this.track.queryPosition === 'function' && p.isVector3) {
      try {
        if (!this._q) this._q = {};
        const q = this.track.queryPosition(p, undefined, this._q);
        if (q && Number.isFinite(q.groundHeight)) return q.groundHeight;
      } catch {
        // fall through
      }
    }
    return p.y - fallbackOffset;
  }

  /** World position of a kart anchor (falls back to sensible local offsets). */
  _anchor(kart, name, out) {
    const a = kart.anchors && kart.anchors[name];
    if (a && a.getWorldPosition) return a.getWorldPosition(out);
    if (kart.mesh && kart.mesh.localToWorld) {
      kart.mesh.updateWorldMatrix(true, false);
      return kart.mesh.localToWorld(out.copy(LOCAL[name] || LOCAL.body));
    }
    const l = LOCAL[name] || LOCAL.body;
    const f = kart.forward || _fwd;
    const u = kart.up || _up;
    _right.copy(f).cross(u);
    return out.copy(kart.position).addScaledVector(f, l.z).addScaledVector(u, l.y).addScaledVector(_right, -l.x);
  }

  /** Contact point of a wheel with the ground. */
  _wheelContact(kart, name, out) {
    this._anchor(kart, name, out);
    const u = kart.up || _up;
    const h = (out.x - kart.position.x) * u.x + (out.y - kart.position.y) * u.y + (out.z - kart.position.z) * u.z;
    return out.addScaledVector(u, -h + 0.06);
  }

  _kartVel(kart, out) {
    if (kart.velocity) return out.copy(kart.velocity);
    return out.copy(kart.forward || _fwd).multiplyScalar(kart.speed || 0);
  }

  _ks(kart) {
    let s = this.kartState.get(kart);
    if (!s) {
      s = {
        spark: 0, smoke: 0, dust: 0, flame: 0, puff: 0, star: 0, blade: 0,
        exL: new THREE.Vector3(), exR: new THREE.Vector3(), body: new THREE.Vector3(),
        hasPrev: false, wasBoosting: false,
      };
      this.kartState.set(kart, s);
    }
    return s;
  }

  _updateKart(kart, dt) {
    if (!kart || !kart.position) return;
    const d = this._camDist(kart.position);
    const ks = this._ks(kart);
    if (d > this.Q.lightDist) {
      ks.hasPrev = false;
      return;
    }
    const near = d < this.Q.heavyDist;
    const q = this.Q.rate * (d < 40 ? 1 : Math.max(0.35, 1 - (d - 40) / 100));
    const S = this.S;
    const f = kart.forward || _fwd;
    const u = kart.up || _up;
    const vel = this._kartVel(kart, _vel);
    const speed = Math.abs(kart.speed || 0);
    const grounded = !kart.isAirborne;
    const level = kart.driftLevel || 0;
    _right.copy(f).cross(u).normalize();

    // ---- drift sparks -------------------------------------------------------
    if (kart.isDrifting && grounded && near) {
      const rgb = level > 0 ? DRIFT_RGB[level] : [1, 0.85, 0.45];
      const k = level > 0 ? 2.4 + level * 0.25 : 1.6;
      const rate = (level > 0 ? 50 + level * 28 : 22) * q;
        ks.spark += rate * dt;
      const n = Math.floor(ks.spark);
      ks.spark -= n;
      for (const wheel of ['wheelRL', 'wheelRR']) {
        const c = this._wheelContact(kart, wheel, _v1);
        const outX = c.x - kart.position.x;
        const outZ = c.z - kart.position.z;
        // core glow just behind / outside the tyre so the chase cam sees it (this frame only)
        S.reset();
        S.x = c.x - f.x * 0.3 + outX * 0.18 + u.x * 0.22;
        S.y = c.y - f.y * 0.3 + u.y * 0.22;
        S.z = c.z - f.z * 0.3 + outZ * 0.18 + u.z * 0.22;
        S.life = 1e-4;
        S.size = (level > 0 ? 0.6 + level * 0.16 : 0.32) * range(0.85, 1.15);
        S.color(rgb[0] * 0.95, rgb[1] * 0.95, rgb[2] * 0.95);
        S.alpha = level > 0 ? 1 : 0.6;
        S.fadeOut = 1;
        S.sprite = SPRITE.GLOW;
        this.add.spawn(S);
        if (level > 0) {
          S.size *= 0.8;
          S.rot = this.time * 9 + (wheel === 'wheelRL' ? 0 : 1.3);
          S.sprite = SPRITE.SPARKLE;
          S.color(rgb[0] * k * 0.7 + 0.12, rgb[1] * k * 0.7 + 0.12, rgb[2] * k * 0.7 + 0.12);
          this.add.spawn(S);
        }
        const sx = S.x, sy = S.y, sz = S.z;
        for (let i = 0; i < n; i++) {
          S.reset();
          S.x = sx + spread(0.08);
          S.y = sy - 0.1;
          S.z = sz + spread(0.08);
          const back = range(1, 4.5);
          const side = range(0.4, 3) * Math.sign(outX * _right.x + outZ * _right.z || 1);
          const upv = range(1.8, 4.2);
          S.vx = vel.x * 0.9 - f.x * back + _right.x * side + u.x * upv;
          S.vy = vel.y * 0.9 - f.y * back + _right.y * side + u.y * upv;
          S.vz = vel.z * 0.9 - f.z * back + _right.z * side + u.z * upv;
          S.life = range(0.14, 0.3) * (level > 0 ? 1 : 0.75);
          S.size = level > 0 ? range(0.07, 0.11) : range(0.045, 0.065);
          S.color(rgb[0] * k + 0.25, rgb[1] * k + 0.25, rgb[2] * k + 0.25);
          S.colorEnd(rgb[0] * k * 0.6, rgb[1] * k * 0.6, rgb[2] * k * 0.6);
          S.gravity = 22;
          S.drag = 1.2;
          S.fadeOut = 0.55;
          S.sprite = SPRITE.SPARK;
          S.mode = MODE.AXIAL;
          S.aspect = 1.6;
          S.stretch = 0.022 / S.size;
          S.floor = c.y - 0.02;
          S.bounce = 0.3;
          this.add.spawn(S);
        }
      }
      // tyre smoke on road
      if (kart.surface !== SURFACES.OFFROAD) {
        ks.smoke += 14 * q * dt;
        const ns = Math.floor(ks.smoke);
        ks.smoke -= ns;
        for (let i = 0; i < ns; i++) {
          const c = this._wheelContact(kart, i % 2 ? 'wheelRL' : 'wheelRR', _v1);
          S.reset();
          S.pos(c);
          S.y += 0.15;
          S.vx = vel.x * 0.85 + spread(0.6);
          S.vy = range(0.4, 1.0);
          S.vz = vel.z * 0.85 + spread(0.6);
          S.size = 0.3;
          S.sizeEnd = range(1.0, 1.5);
          S.life = range(0.45, 0.65);
          const g = this.roadDustRGB;
          S.color(g[0], g[1], g[2]);
          S.alpha = 0.16;
          S.fadeIn = 0.1;
          S.fadeOut = 0.3;
          S.drag = 2.5;
          S.gravity = -0.5;
          S.rot = rand() * 6.28;
          S.rotVel = spread(1);
          S.sprite = rand() < 0.5 ? SPRITE.SMOKE : SPRITE.SMOKE2;
          this.alpha.spawn(S);
        }
      }
    } else {
      ks.spark = 0;
    }

    // ---- exhaust positions & boost -----------------------------------------
    const exL = this._anchor(kart, 'exhaustL', _v1);
    const exLx = exL.x;
    const exLy = exL.y;
    const exLz = exL.z;
    const exR = this._anchor(kart, 'exhaustR', _v2);
    const boosting = !!kart.isBoosting;

    if (boosting && near) {
      ks.flame += 85 * q * dt;
      const nf = Math.floor(ks.flame);
      ks.flame -= nf;
      for (let side = 0; side < 2; side++) {
        const ox = side === 0 ? exLx : exR.x;
        const oy = side === 0 ? exLy : exR.y;
        const oz = side === 0 ? exLz : exR.z;
        // exhaust glow
        S.reset();
        S.x = ox; S.y = oy; S.z = oz;
        S.life = 1e-4;
        S.size = range(0.6, 0.8);
        S.color(1.5, 0.55, 0.1);
        S.alpha = 0.85;
        S.fadeOut = 1;
        S.sprite = SPRITE.GLOW;
        this.add.spawn(S);
        S.size = range(0.28, 0.36);
        S.color(0.7, 1.1, 2.6);
        this.add.spawn(S);
        for (let i = 0; i < nf; i++) {
          S.reset();
          const back = range(6, 11);
          S.x = ox + spread(0.05);
          S.y = oy + spread(0.05);
          S.z = oz + spread(0.05);
          S.vx = vel.x * 0.88 - f.x * back + spread(0.8);
          S.vy = vel.y * 0.88 - f.y * back + range(0, 0.8);
          S.vz = vel.z * 0.88 - f.z * back + spread(0.8);
          S.life = range(0.1, 0.2);
          S.size = range(0.26, 0.36);
          S.sizeEnd = 0.08;
          S.color(2.2, 1.25, 0.3);
          S.colorEnd(1.5, 0.22, 0.03);
          S.fadeOut = 0.4;
          S.sprite = SPRITE.FLAME;
          S.mode = MODE.AXIAL;
          S.aspect = 1.4;
          S.stretch = 0.025 / S.size;
          this.add.spawn(S);
        }
        // heat trail ribbon: fill the path travelled since last frame
        if (ks.hasPrev && ks.wasBoosting) {
          const px = side === 0 ? ks.exL.x : ks.exR.x;
          const py = side === 0 ? ks.exL.y : ks.exR.y;
          const pz = side === 0 ? ks.exL.z : ks.exR.z;
          const dx = ox - px, dy = oy - py, dz = oz - pz;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < 6) {
            const steps = Math.min(8, Math.ceil(dist / (0.3 / Math.max(0.5, q))));
            for (let i = 0; i < steps; i++) {
              const t = (i + rand()) / steps;
              S.reset();
              S.x = px + dx * t;
              S.y = py + dy * t;
              S.z = pz + dz * t;
              S.vy = 0.4;
              S.life = 0.32;
              S.size = 0.34;
              S.sizeEnd = 0.05;
              S.color(1.4, 0.6, 0.18);
              S.colorEnd(0.9, 0.15, 0.04);
              S.alpha = 0.4;
              S.fadeOut = 0.2;
              S.sprite = SPRITE.GLOW;
              this.add.spawn(S);
            }
          }
        }
      }
    } else if (near && grounded && kart.controls && kart.controls.throttle > 0.1 && (speed < 14 || kart.frozen)) {
      // ---- exhaust puffs when accelerating / revving ------------------------
      const rev = kart.frozen ? 1 : 1 - speed / 14;
      ks.puff += (4 + 12 * rev) * q * dt;
      const np = Math.floor(ks.puff);
      ks.puff -= np;
      for (let i = 0; i < np; i++) {
        const ex = i % 2 ? exR : _v0.set(exLx, exLy, exLz);
        S.reset();
        S.pos(ex);
        S.vx = vel.x * 0.4 - f.x * range(1, 2.5) + spread(0.3);
        S.vy = range(0.6, 1.4);
        S.vz = vel.z * 0.4 - f.z * range(1, 2.5) + spread(0.3);
        S.size = 0.14;
        S.sizeEnd = range(0.55, 0.85);
        S.life = range(0.5, 0.8);
        const g = kart.frozen ? 0.35 : 0.55;
        S.color(g, g, g * 1.04);
        S.colorEnd(0.85, 0.85, 0.88);
        S.alpha = 0.38;
        S.fadeIn = 0.08;
        S.fadeOut = 0.3;
        S.drag = 2;
        S.gravity = -0.6;
        S.rot = rand() * 6.28;
        S.sprite = SPRITE.SMOKE;
        this.alpha.spawn(S);
      }
    }
    ks.exL.set(exLx, exLy, exLz);
    ks.exR.copy(exR);
    ks.wasBoosting = boosting;

    // ---- off-road dust -------------------------------------------------------
    if (near && grounded && kart.surface === SURFACES.OFFROAD && speed > 3) {
      this._offroadDust(kart, ks, dt, q, speed, vel, f, u);
    }

    // ---- star power rainbow trail -------------------------------------------
    const starOn = kart.isInvincible && kart.starTimer > 0;
    const body = this._anchor(kart, 'body', _v1);
    if (starOn) {
      ks.star += 55 * q * dt;
      const ns = Math.floor(ks.star);
      ks.star -= ns;
      const hueBase = (this.time * 1.3) % 1;
      for (let i = 0; i < ns; i++) {
        S.reset();
        S.x = body.x + spread(0.9);
        S.y = body.y + spread(0.6);
        S.z = body.z + spread(0.9);
        S.vx = vel.x * 0.2 + spread(1);
        S.vy = range(0.5, 2);
        S.vz = vel.z * 0.2 + spread(1);
        S.life = range(0.4, 0.7);
        S.size = range(0.25, 0.42);
        S.sizeEnd = 0.04;
        hueToSpec(S, (hueBase + rand() * 0.25) % 1, 3.2, 0.7);
        S.drag = 2;
        S.flicker = 0.4;
        S.rot = rand() * 6;
        S.sprite = rand() < 0.6 ? SPRITE.SPARKLE : SPRITE.STAR;
        this.add.spawn(S);
      }
      // rainbow ribbon behind the kart
      if (ks.hasPrev) {
        const dx = body.x - ks.body.x, dy = body.y - ks.body.y, dz = body.z - ks.body.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < 6) {
          const steps = Math.min(6, Math.ceil(dist / 0.45));
          for (let i = 0; i < steps; i++) {
            const t = (i + rand()) / steps;
            S.reset();
            S.x = ks.body.x + dx * t;
            S.y = ks.body.y + dy * t - 0.2;
            S.z = ks.body.z + dz * t;
            S.life = 0.38;
            S.size = 1.2;
            S.sizeEnd = 0.3;
            hueToSpec(S, (hueBase + t * 0.05) % 1, 1.4, 0.85);
            S.alpha = 0.35;
            S.fadeOut = 0.1;
            S.sprite = SPRITE.GLOW;
            this.add.spawn(S);
          }
        }
      }
      // aura
      S.reset();
      S.pos(body);
      S.life = 1e-4;
      S.size = 3.2 + Math.sin(this.time * 18) * 0.25;
      hueToSpec(S, (this.time * 2) % 1, 0.8, 0.6);
      S.alpha = 0.55;
      S.fadeOut = 1;
      S.sprite = SPRITE.GLOW;
      this.add.spawn(S);
    }

    // ---- dizzy stars over a spun-out kart -----------------------------------
    if (kart.isSpunOut && near) {
      const cx = kart.position.x + u.x * 1.75;
      const cy = kart.position.y + u.y * 1.75;
      const cz = kart.position.z + u.z * 1.75;
      for (let i = 0; i < 3; i++) {
        const a = this.time * 6 + (i * Math.PI * 2) / 3;
        S.reset();
        S.x = cx + Math.cos(a) * 0.6;
        S.y = cy + Math.sin(a * 2) * 0.08;
        S.z = cz + Math.sin(a) * 0.6;
        S.life = 1e-4;
        S.size = 0.38;
        S.rot = a * 0.5;
        S.color(3.2, 2.7, 0.7);
        S.fadeOut = 1;
        S.sprite = SPRITE.STAR;
        this.add.spawn(S);
        if (rand() < 18 * dt) {
          S.life = 0.3;
          S.size = 0.16;
          S.sizeEnd = 0.02;
          S.sprite = SPRITE.SPARKLE;
          this.add.spawn(S);
        }
      }
    }

    ks.body.copy(body);
    ks.hasPrev = true;
  }

  _offroadDust(kart, ks, dt, q, speed, vel, f, u) {
    const S = this.S;
    const kind = this.style.kind;
    const sp = Math.min(1, speed / 25);
    const boostMul = kart.isBoosting || kart.isDrifting ? 1.5 : 1;
    ks.dust += (14 + 30 * sp) * q * boostMul * dt;
    const n = Math.floor(ks.dust);
    ks.dust -= n;
    const col = this.dustRGB;
    const shadeMul = kind === 'snow' ? 0.93 : kind === 'sand' ? 1.08 : 1;
    for (let i = 0; i < n; i++) {
      const c = this._wheelContact(kart, i % 2 ? 'wheelRL' : 'wheelRR', _v0);
      S.reset();
      S.pos(c);
      S.y += 0.15;
      const lat = spread(1.8);
      S.vx = vel.x * 0.55 - f.x * range(0.5, 2.5) + _right.x * lat;
      S.vy = range(1.0, 2.8) * (kind === 'snow' ? 1.3 : 1);
      S.vz = vel.z * 0.55 - f.z * range(0.5, 2.5) + _right.z * lat;
      S.size = kind === 'snow' ? 0.6 : 0.5;
      S.sizeEnd = (kind === 'snow' ? range(2.2, 3.2) : range(1.9, 2.9)) * (0.7 + 0.3 * sp);
      S.life = range(0.8, 1.3);
      const shade = range(0.92, 1.06) * shadeMul;
      S.color(Math.min(1, col[0] * shade), Math.min(1, col[1] * shade), Math.min(1, col[2] * shade));
      if (kind === 'snow') {
        S.color(0.62, 0.7, 0.86);
        S.colorEnd(0.8, 0.85, 0.95);
      }
      S.alpha = kind === 'snow' ? 0.95 : 0.75;
      S.fadeIn = 0.05;
      S.fadeOut = 0.35;
      S.drag = 2.2;
      S.gravity = -0.25;
      S.rot = rand() * 6.28;
      S.rotVel = spread(1.2);
      S.sprite = rand() < 0.5 ? SPRITE.SMOKE : SPRITE.SMOKE2;
      if (kind === 'neon') {
        S.color(col[0] * 1.2, col[1] * 1.2, col[2] * 1.2);
        S.alpha = 0.35;
        this.add.spawn(S);
      } else {
        this.alpha.spawn(S);
      }
    }
    // debris spray: grass blades / sand grains / snow flakes / neon sparks
    ks.blade += (12 + 30 * sp) * q * dt;
    const nb = Math.floor(ks.blade);
    ks.blade -= nb;
    const acc = this.accentRGB;
    for (let i = 0; i < nb; i++) {
      const c = this._wheelContact(kart, i % 2 ? 'wheelRL' : 'wheelRR', _v0);
      S.reset();
      S.pos(c);
      S.y += 0.05;
      const lat = spread(2.5);
      S.vx = vel.x * 0.35 - f.x * range(1, 4) + _right.x * lat;
      S.vy = range(2.5, 5.5);
      S.vz = vel.z * 0.35 - f.z * range(1, 4) + _right.z * lat;
      S.gravity = 18;
      S.drag = 0.8;
      S.life = range(0.45, 0.7);
      S.floor = c.y - 0.05;
      S.rot = rand() * 6.28;
      S.rotVel = spread(14);
      S.fadeOut = 0.7;
      if (kind === 'grass') {
        S.size = range(0.12, 0.2);
        const g = range(0.75, 1.1);
        S.color(acc[0] * g, acc[1] * g, acc[2] * g);
        S.sprite = SPRITE.BLADE;
        this.alpha.spawn(S);
      } else if (kind === 'sand') {
        S.size = range(0.07, 0.12);
        S.color(col[0] * 0.8, col[1] * 0.72, col[2] * 0.6);
        S.sprite = SPRITE.DOT;
        this.alpha.spawn(S);
      } else if (kind === 'snow') {
        if (i % 2) {
          S.size = range(0.1, 0.18);
          S.color(1.4, 1.5, 1.7);
          S.sprite = SPRITE.FLAKE;
          S.gravity = 9;
          S.drag = 1.6;
          S.flicker = 0.3;
          this.add.spawn(S);
        } else {
          S.size = range(0.16, 0.28);
          S.color(0.75, 0.8, 0.92);
          S.sprite = SPRITE.CHUNK;
          this.alpha.spawn(S);
        }
      } else {
        S.size = range(0.06, 0.1);
        S.color(acc[0] * 3, acc[1] * 3, acc[2] * 3);
        S.sprite = SPRITE.SPARK;
        S.mode = MODE.AXIAL;
        S.aspect = 1.5;
        S.stretch = 0.4;
        this.add.spawn(S);
      }
    }
  }

  _miniTurbo(kart, level) {
    const p = kart.position;
    const s = this._burstScale(p);
    if (s <= 0) return;
    const S = this.S;
    const f = kart.forward || _fwd;
    const vel = this._kartVel(kart, _vel);
    const col = LEVEL_FLAME[Math.min(3, level)];
    const n = Math.round((9 + level * 5) * this.fx.q * s);
    for (const name of ['exhaustL', 'exhaustR']) {
      const ex = this._anchor(kart, name, _v1);
      flash(this.fx, ex, 1.0 + level * 0.25, col[0] * 0.32, col[1] * 0.32, col[2] * 0.32, 0.15);
      for (let i = 0; i < n; i++) {
        S.reset();
        S.pos(ex);
        const back = range(9, 16);
        S.vx = vel.x * 0.85 - f.x * back + spread(2.2);
        S.vy = vel.y * 0.85 + range(-0.3, 1.8);
        S.vz = vel.z * 0.85 - f.z * back + spread(2.2);
        S.life = range(0.16, 0.32);
        S.size = range(0.3, 0.48);
        S.sizeEnd = 0.08;
        S.color(col[0] * 0.42 + 0.25, col[1] * 0.42 + 0.25, col[2] * 0.42 + 0.25);
        S.colorEnd(col[0] * 0.4, col[1] * 0.4, col[2] * 0.4);
        S.alpha = 0.85;
        S.drag = 3;
        S.fadeOut = 0.4;
        S.sprite = SPRITE.FLAME;
        S.mode = MODE.AXIAL;
        S.aspect = 1.5;
        S.stretch = 0.03 / S.size;
        this.add.spawn(S);
      }
    }
    // spark ring at the rear wheels
    const c = this._wheelContact(kart, 'wheelRL', _v1);
    const rgb = DRIFT_RGB[Math.min(3, level)];
    this._withScale(s, () => {
      sparks(this.fx, c, 10 + level * 6, {
        speed: 7, vx: vel.x * 0.6, vy: 0, vz: vel.z * 0.6,
        r: rgb[0] * 4, g: rgb[1] * 4, b: rgb[2] * 4, r2: rgb[0] * 2, g2: rgb[1] * 2, b2: rgb[2] * 2,
      });
      const c2 = this._wheelContact(kart, 'wheelRR', _v1);
      sparks(this.fx, c2, 10 + level * 6, {
        speed: 7, vx: vel.x * 0.6, vy: 0, vz: vel.z * 0.6,
        r: rgb[0] * 4, g: rgb[1] * 4, b: rgb[2] * 4, r2: rgb[0] * 2, g2: rgb[1] * 2, b2: rgb[2] * 2,
      });
    });
  }

  _driftLevelPop(kart, level) {
    const s = this._burstScale(kart.position);
    if (s <= 0) return;
    const rgb = DRIFT_RGB[Math.min(3, level)];
    const vel = this._kartVel(kart, _vel);
    this._withScale(s, () => {
      for (const w of ['wheelRL', 'wheelRR']) {
        const c = this._wheelContact(kart, w, _v1);
        _p.x = c.x; _p.y = c.y + 0.15; _p.z = c.z;
        flash(this.fx, _p, 1.4 + level * 0.3, rgb[0] * 5, rgb[1] * 5, rgb[2] * 5, 0.16);
        sparks(this.fx, _p, 10, {
          speed: 6, vx: vel.x * 0.7, vz: vel.z * 0.7,
          r: rgb[0] * 4 + 1, g: rgb[1] * 4 + 1, b: rgb[2] * 4 + 1, r2: rgb[0] * 3, g2: rgb[1] * 3, b2: rgb[2] * 3,
        });
      }
    });
  }

  _boostBurst(kart, source) {
    const p = kart.position;
    const s = this._burstScale(p);
    if (s <= 0) return;
    const src = String(source || '').toLowerCase();
    const S = this.S;
    const f = kart.forward || _fwd;
    const vel = this._kartVel(kart, _vel);
    let col = [2.8, 1.5, 0.5];
    if (src.includes('pad')) col = [0.8, 1.9, 3.2];
    else if (src.includes('start') || src.includes('rocket')) col = [3, 2.4, 0.8];
    else if (src.includes('trick')) col = [2.2, 2.2, 1.3];
    const n = Math.round(22 * this.fx.q * s);
    for (const name of ['exhaustL', 'exhaustR']) {
      const ex = this._anchor(kart, name, _v1);
      flash(this.fx, ex, 1.6, col[0] * 0.6, col[1] * 0.6, col[2] * 0.6, 0.18);
      for (let i = 0; i < n; i++) {
        S.reset();
        S.pos(ex);
        const back = range(8, 15);
        S.vx = vel.x * 0.8 - f.x * back + spread(2.5);
        S.vy = vel.y * 0.8 + range(0, 2);
        S.vz = vel.z * 0.8 - f.z * back + spread(2.5);
        S.life = range(0.18, 0.34);
        S.size = range(0.32, 0.5);
        S.sizeEnd = 0.08;
        S.color(col[0] * 0.7 + 0.8, col[1] * 0.7 + 0.8, col[2] * 0.7 + 0.8);
        S.colorEnd(col[0] * 0.6, col[1] * 0.4, col[2] * 0.4);
        S.drag = 3;
        S.fadeOut = 0.4;
        S.sprite = SPRITE.FLAME;
        S.mode = MODE.AXIAL;
        S.aspect = 1.4;
        S.stretch = 0.03 / S.size;
        this.add.spawn(S);
      }
    }
    // ground shock ring
    _p.x = p.x - f.x * 0.8; _p.y = p.y + 0.12; _p.z = p.z - f.z * 0.8;
    ring(this.fx, _p, 0.8, 4.5, 0.3, col[0] * 0.5, col[1] * 0.5, col[2] * 0.5, { alpha: 0.75 });
  }

  _landDust(kart, impact) {
    const p = kart.position;
    const s = this._burstScale(p);
    if (s <= 0 || impact < 2) return;
    const k = Math.min(1, impact / 14);
    const offroad = kart.surface === SURFACES.OFFROAD;
    const col = offroad ? this.dustRGB : this.roadDustRGB;
    _p.x = p.x; _p.y = p.y + 0.15; _p.z = p.z;
    this._withScale(s, () => {
      puffs(this.fx, _p, 8 + 14 * k, {
        r: col[0], g: col[1], b: col[2], alpha: 0.5 + 0.2 * k,
        size: 0.35, sizeEnd: 1.4 + 1.2 * k, life: 0.7 + 0.4 * k,
        speed: 3 + 6 * k, up: 0.5, radial: true, spreadPos: 0.9, drag: 3.6, gravity: -0.2,
      });
      ring(this.fx, _p, 0.8, 2.5 + 3 * k, 0.4, col[0], col[1], col[2], { soft: true, alpha: 0.35 * k + 0.15, layer: 'alpha' });
    });
  }

  _hopPuff(kart) {
    const p = kart.position;
    if (this._burstScale(p) <= 0 || this._camDist(p) > 45) return;
    const col = kart.surface === SURFACES.OFFROAD ? this.dustRGB : this.roadDustRGB;
    for (const w of ['wheelRL', 'wheelRR']) {
      const c = this._wheelContact(kart, w, _v1);
      puffs(this.fx, c, 2, {
        r: col[0], g: col[1], b: col[2], alpha: 0.3, size: 0.2, sizeEnd: 0.8, life: 0.45, speed: 1.2, up: 0.6,
      });
    }
  }

  _wallHit(kart, impact, point) {
    const p = point || this._anchor(kart, 'body', _v1);
    const s = this._burstScale(p);
    if (s <= 0 || impact < 1.5) return;
    const k = Math.min(1, impact / 18);
    // normal points from the wall towards the kart
    let nx = kart.position.x - p.x;
    let nz = kart.position.z - p.z;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;
    const vel = this._kartVel(kart, _vel);
    const t = this.sparkTint;
    this._withScale(s, () => {
      flash(this.fx, p, 1.4 + 1.6 * k, 4, 3, 1.5, 0.12);
      sparks(this.fx, p, 10 + 26 * k, {
        speed: 6 + 9 * k, nx: nx * 1.2, nz: nz * 1.2, cone: 0.8, up: 0.8,
        vx: vel.x * 0.5, vz: vel.z * 0.5, life: 0.35 + 0.15 * k,
        r: t ? t[0] * 4 : 4, g: t ? t[1] * 4 : 2.8, b: t ? t[2] * 4 : 1.0,
        floor: kart.position.y,
      });
      if (k > 0.35) starBurst(this.fx, p, 3, { speed: 3, size: 0.3, life: 0.45 });
      puffs(this.fx, p, 2 + 3 * k, { size: 0.3, sizeEnd: 1.2, life: 0.6, alpha: 0.35, speed: 1.5 });
    });
  }

  _bump(a, b, impact, point) {
    let p = point;
    if (!p && a && b) {
      p = _v1.copy(a.position).add(b.position).multiplyScalar(0.5);
      p.y += 0.5;
    }
    if (!p) return;
    const s = this._burstScale(p);
    if (s <= 0 || impact < 1) return;
    const k = Math.min(1, impact / 12);
    this._withScale(s, () => {
      flash(this.fx, p, 1.2 + 1.2 * k, 3.5, 3, 2, 0.12);
      sparks(this.fx, p, 8 + 16 * k, { speed: 5 + 6 * k, life: 0.3, up: 0.8 });
      starBurst(this.fx, p, 2 + 3 * k, { speed: 3.5, size: 0.3, life: 0.5 });
    });
  }

  _trick(kart) {
    const p = this._anchor(kart, 'body', _v1);
    const s = this._burstScale(p);
    if (s <= 0) return;
    const S = this.S;
    const n = count(this.fx, 16, s);
    for (let i = 0; i < n; i++) {
      S.reset();
      const a = (i / n) * Math.PI * 2;
      S.pos(p);
      S.vx = Math.cos(a) * 6;
      S.vz = Math.sin(a) * 6;
      S.vy = range(0, 1.5);
      S.drag = 3;
      S.life = 0.5;
      S.size = 0.4;
      S.sizeEnd = 0.05;
      hueToSpec(S, i / n, 3, 0.6);
      S.sprite = i % 2 ? SPRITE.STAR : SPRITE.SPARKLE;
      S.rotVel = 8;
      this.add.spawn(S);
    }
    flash(this.fx, p, 3, 3, 3, 2.4, 0.15);
  }

  _respawnSparkle(kart) {
    const S = this.S;
    const p = kart.position;
    if (this._burstScale(p) <= 0) return;
    const n = count(this.fx, 28);
    for (let i = 0; i < n; i++) {
      S.reset();
      const a = rand() * Math.PI * 2;
      const r = range(0.4, 1.3);
      S.x = p.x + Math.cos(a) * r;
      S.y = p.y + range(0, 1.5);
      S.z = p.z + Math.sin(a) * r;
      S.vy = range(1.5, 4);
      S.life = range(0.6, 1.1);
      S.size = range(0.2, 0.35);
      S.sizeEnd = 0.04;
      S.color(2.6, 2.8, 3.2);
      S.fadeIn = 0.15;
      S.flicker = 0.5;
      S.sprite = SPRITE.SPARKLE;
      this.add.spawn(S);
    }
    _p.x = p.x; _p.y = p.y + 0.1; _p.z = p.z;
    ring(this.fx, _p, 0.5, 3.5, 0.5, 1.6, 1.8, 2.4);
  }

  _lightning(attacker) {
    this.flashFx = 1;
    this.tasks.push({ t: 0.11, fire: () => (this.flashFx = Math.max(this.flashFx, 0.75)) });
    this.tasks.push({ t: 0.24, fire: () => (this.flashFx = Math.max(this.flashFx, 0.45)) });
    let bolts = 0;
    for (const k of this.karts) {
      if (!k || k === attacker || !k.position) continue;
      if (this._camDist(k.position) > this.Q.heavyDist || bolts >= 7) continue;
      if (k.isInvincible && k.starTimer > 0) continue;
      bolts++;
      _v1.copy(k.position);
      _v1.y += 0.8;
      _v2.set(k.position.x + spread(4), k.position.y + 28, k.position.z + spread(4));
      lightningBolt(this.fx, _v2, _v1);
      // second flicker bolt
      const tx = k.position.x, ty = k.position.y + 0.8, tz = k.position.z;
      this.tasks.push({
        t: 0.12,
        fire: () => {
          _v1.set(tx, ty, tz);
          _v2.set(tx + spread(4), ty + 28, tz + spread(4));
          lightningBolt(this.fx, _v2, _v1, { life: 0.2, segments: 9 });
        },
      });
    }
    if (attacker?.position) {
      this.flashLight.color.set(0x9ab8ff);
      this.flashLight.position.copy(this.camera ? this.camera.getWorldPosition(_v2) : attacker.position);
      this.flashLight.position.y += 10;
      this.lightFlash = 1;
      this.lightFlashPower = 35;
    }
  }

  /** Confetti + fireworks around a kart (player finish). Public for the integrator. */
  celebrate(kart) {
    const p = kart.position;
    this.followKart = kart;
    this._followPrev = (this._followPrev || new THREE.Vector3()).copy(p);
    this.fx.groundY = p.y;
    const f = kart.forward || _fwd;
    _p.x = p.x + f.x * 2; _p.y = p.y + 1; _p.z = p.z + f.z * 2;
    confettiBurst(this.fx, _p, 160);
    // side cannons
    const r = _right.copy(f).cross(kart.up || _up).normalize();
    for (const side of [-1, 1]) {
      const ox = p.x + r.x * side * 4, oz = p.z + r.z * side * 4;
      for (let i = 0; i < count(this.fx, 60); i++) {
        confettiPiece(this.fx, ox, p.y + 0.5, oz,
          -r.x * side * range(2, 6) + f.x * range(0, 4), range(9, 16), -r.z * side * range(2, 6) + f.z * range(0, 4));
      }
    }
    // confetti rain for a few seconds
    let rain = 3.0;
    const tracked = kart;
    this.tasks.push({
      t: 0.3,
      update: (dt) => {
        rain -= dt;
        const n = count(this.fx, 45 * dt * 4);
        const kp = tracked.position;
        for (let i = 0; i < n; i++) {
          confettiPiece(this.fx, kp.x + spread(10), kp.y + range(7, 11), kp.z + spread(10), spread(1), range(-1, 1), spread(1));
        }
        return rain > 0;
      },
    });
    // fireworks show
    const hues = [0.0, 0.13, 0.55, 0.8, 0.33, 0.95, 0.6, 0.1];
    for (let i = 0; i < 8; i++) {
      this.tasks.push({ t: 0.4 + i * 0.7 + rand() * 0.2, fire: () => this._launchFirework(tracked, hues[i]) });
    }
  }

  _launchFirework(kart, hue) {
    const p = kart.position;
    const f = kart.forward || _fwd;
    const r = _right.copy(f).cross(kart.up || _up).normalize();
    const side = spread(16);
    const ahead = range(26, 44);
    const x0 = p.x + f.x * ahead + r.x * side;
    const z0 = p.z + f.z * ahead + r.z * side;
    const y0 = p.y;
    const vy = range(16, 19);
    const vx = spread(2), vz = spread(2);
    const g = 9;
    let t = 0;
    const tBurst = range(1.05, 1.35);
    const start = kart.position.clone();
    this.tasks.push({
      t: 0,
      update: (dt) => {
        t += dt;
        const x = x0 + vx * t + (kart.position.x - start.x);
        const y = y0 + vy * t - 0.5 * g * t * t + (kart.position.y - start.y);
        const z = z0 + vz * t + (kart.position.z - start.z);
        const S = this.S.reset();
        S.x = x; S.y = y; S.z = z;
        S.vx = vx * 0.1 + spread(0.4);
        S.vy = -2;
        S.vz = vz * 0.1 + spread(0.4);
        S.life = range(0.3, 0.55);
        S.size = 0.22;
        S.sizeEnd = 0.04;
        S.color(2.4, 1.8, 1.0);
        S.flicker = 0.5;
        S.gravity = 4;
        S.follow = true;
        S.sprite = SPRITE.SPARKLE;
        this.add.spawn(S);
        if (t >= tBurst) {
          _p.x = x; _p.y = y; _p.z = z;
          fireworkBurst(this.fx, _p, hue);
          return false;
        }
        return true;
      },
    });
  }

  _runTasks(dt) {
    const tasks = this.tasks;
    for (let i = tasks.length - 1; i >= 0; i--) {
      const task = tasks[i];
      if (task.t > 0) {
        task.t -= dt;
        if (task.t > 0) continue;
      }
      let alive = false;
      if (task.fire) {
        task.fire();
        task.fire = null;
        alive = !!task.update;
      }
      if (task.update) alive = task.update(dt) !== false;
      if (!alive) tasks.splice(i, 1);
    }
  }

  _updatePost(dt) {
    const pk = this.playerKart;
    const racing = this.state == null || this.state === GAME_STATES.RACING || this.state === GAME_STATES.FINISHED ||
      this.state === GAME_STATES.COUNTDOWN;
    let boostT = 0;
    let speedT = 0;
    let starT = 0;
    if (pk && racing) {
      const ms = pk.maxSpeed || 30;
      speedT = Math.min(1, Math.abs(pk.speed || 0) / ms);
      if (pk.isBoosting) boostT = 0.75 + 0.25 * Math.min(1, speedT);
      if (pk.isInvincible && pk.starTimer > 0) {
        starT = 0.7 + 0.3 * Math.sin(this.time * 10);
        boostT = Math.max(boostT, 0.45);
      }
    }
    const kUp = 1 - Math.exp(-dt * 10);
    const kDown = 1 - Math.exp(-dt * 3);
    this.boostFx += (boostT - this.boostFx) * (boostT > this.boostFx ? kUp : kDown);
    this.starFx += (starT - this.starFx) * kUp;
    this.speedFx = (this.speedFx || 0) + (speedT - (this.speedFx || 0)) * kDown;
    this.flashFx *= Math.exp(-dt * 10);
    this.hitFx *= Math.exp(-dt * 3.2);
    const st = this.postState;
    st.boost = this.boostFx;
    st.speed = this.speedFx;
    st.star = this.starFx;
    st.flash = this.flashFx;
    st.hit = this.hitFx;
    // flash light decay
    if (this.lightFlash > 0.001) {
      this.lightFlash *= Math.exp(-dt * 9);
      this.flashLight.intensity = this.quality === 'low' ? 0 : this.lightFlash * (this.lightFlashPower || 140);
    } else if (this.flashLight.intensity !== 0) {
      this.flashLight.intensity = 0;
      this.lightFlash = 0;
    }
  }
}
