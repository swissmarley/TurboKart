/**
 * Track — public API consumed by karts, items, AI, camera, FX, UI and Game.
 * The constructor is pure math (Node-safe); build() creates all meshes.
 */
import { TRACKS, getCompiledLayout } from './TrackDefinitions.js';
import { TrackPath } from './TrackPath.js';
import { THEME_STYLES } from './themes.js';
import { DirectionalLight, Vector3 } from 'three';

const SHADOW_SIZE = { low: 1024, medium: 1536, high: 2048 };
const SHADOW_EXTENT = { low: 55, medium: 65, high: 75 };

export class Track {
  /**
   * @param {string} trackId
   * @param {{quality?: 'low'|'medium'|'high'}} [opts]
   */
  constructor(trackId, { quality = 'high' } = {}) {
    const def = TRACKS.find((t) => t.id === trackId);
    if (!def) throw new Error(`Unknown track "${trackId}"`);
    this.id = def.id;
    this.name = def.name;
    this.def = def;
    this.quality = quality;
    this.layout = getCompiledLayout(trackId);
    /** @type {TrackPath} */
    this.path = new TrackPath(this.layout);

    const style = THEME_STYLES[def.theme];
    this.style = style;
    this.theme = { ...style.contract };

    this.length = this.path.length;
    this.samples = this.path.samples;
    this.itemBoxPositions = this.path.itemBoxPositions;
    this.coinPositions = this.path.coinPositions;
    this.boostPads = this.path.boostPads;
    this.ramps = this.path.ramps;
    this.obstacles = this.path.obstacles;

    // minimap (~300 points) + bounds with a small margin
    const pts = this.path.outline(300);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    const m = 20;
    this.minimap = { path: pts, bounds: { minX: minX - m, maxX: maxX + m, minZ: minZ - m, maxZ: maxZ + m } };

    // sun light exists from construction (shadow-casting, follows focus in update())
    const sun = style.sun;
    this.sunDirection = new Vector3(
      Math.cos(sun.elevation) * Math.sin(sun.azimuth),
      Math.sin(sun.elevation),
      Math.cos(sun.elevation) * Math.cos(sun.azimuth),
    ).normalize();
    this.sunLight = new DirectionalLight(sun.color, sun.intensity);
    this.sunLight.name = 'TrackSun';
    this.sunLight.castShadow = true;
    const ext = SHADOW_EXTENT[quality] ?? 70;
    const sz = SHADOW_SIZE[quality] ?? 2048;
    this.sunLight.shadow.mapSize.set(sz, sz);
    const cam = this.sunLight.shadow.camera;
    cam.left = -ext;
    cam.right = ext;
    cam.top = ext;
    cam.bottom = -ext;
    cam.near = 1;
    cam.far = 700;
    cam.updateProjectionMatrix();
    this.sunLight.shadow.bias = -0.0004;
    this.sunLight.shadow.normalBias = 0.04;
    this._shadowExtent = ext;
    this._shadowTexel = (2 * ext) / sz;

    this.world = null; // built scene content (see build/World.js)
    this._focus = new Vector3();
  }

  static createQuery() {
    return TrackPath.createQuery();
  }

  /**
   * Nearest-point query (called ~1000x/s). Pass the previous `index` back as hintIndex
   * and reuse `out` to avoid allocations.
   */
  queryPosition(position, hintIndex, out) {
    return this.path.query(position, hintIndex, out);
  }

  /** Interpolated frame at a lap distance (wraps). */
  getFrameAtDistance(distance, lateral = 0, out) {
    return this.path.frameAt(distance, lateral, out);
  }

  /** Grid slots, pole = slot 0, all behind the start line. */
  getStartGrid(count) {
    return this.path.startGrid(count);
  }

  /** Adds everything to `scene` (sky, lights, terrain, road, scenery). */
  async build(scene, renderer, onProgress) {
    const { buildWorld } = await import('./build/World.js');
    this.world = await buildWorld(this, scene, renderer, onProgress || (() => {}));
    return this;
  }

  /** Animations + shadow camera follow. */
  update(dt, time, focusPosition) {
    const sun = this.sunLight;
    if (focusPosition) {
      // snap the light to shadow-texel increments in light space to avoid shimmering
      const f = this._focus.copy(focusPosition);
      const texel = this._shadowTexel;
      const d = this.sunDirection;
      // light basis
      const ux = Math.abs(d.y) > 0.99 ? 1 : 0;
      const right = _tmpA.set(ux ? 1 : 0, ux ? 0 : 1, 0).cross(d).normalize();
      const up = _tmpB.copy(d).cross(right).normalize();
      const a = Math.round(f.dot(right) / texel) * texel - f.dot(right);
      const b = Math.round(f.dot(up) / texel) * texel - f.dot(up);
      f.addScaledVector(right, a).addScaledVector(up, b);
      sun.target.position.copy(f);
      sun.position.copy(f).addScaledVector(d, 300);
      sun.target.updateMatrixWorld();
    }
    if (this.world) this.world.update(dt, time, focusPosition);
  }

  dispose() {
    if (this.world) {
      this.world.dispose();
      this.world = null;
    }
    this.sunLight.removeFromParent();
    this.sunLight.target.removeFromParent();
    this.sunLight.dispose?.();
    this.sunLight.shadow?.map?.dispose?.();
  }
}

const _tmpA = new Vector3();
const _tmpB = new Vector3();
