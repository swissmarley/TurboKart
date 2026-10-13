/**
 * Builds the complete visual world for a Track: sky, fog, lights, environment
 * map, then delegates terrain / road / scenery to the theme module.
 */
import * as THREE from 'three';
import { createRng, hashString, nextFrame } from '../util.js';
import { createSkyMaterial, createSkyDome, createEnvironment } from './sky.js';
import * as meadow from '../scenery/meadow.js';
import * as desert from '../scenery/desert.js';
import * as snow from '../scenery/snow.js';
import * as neon from '../scenery/neon.js';

const THEMES = { meadow, desert, snow, neon };
const DENSITY = { low: 0.4, medium: 0.7, high: 1 };

export async function buildWorld(track, scene, renderer, onProgress) {
  const style = track.style;
  const root = new THREE.Group();
  root.name = `Track:${track.id}`;
  scene.add(root);

  const prev = {
    fog: scene.fog,
    background: scene.background,
    environment: scene.environment,
    environmentIntensity: scene.environmentIntensity,
  };

  const path = track.path;
  const ctx = {
    track,
    path,
    layout: track.layout,
    /** lap distance of a layout reference like 'tunnel@0.5' */
    ref: (r) => path.cpToDistance(track.layout.refToCp(r)),
    style,
    theme: track.theme,
    quality: track.quality,
    density: DENSITY[track.quality] ?? 1,
    scene,
    root,
    renderer,
    anisotropy: renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4,
    rng: createRng(hashString(track.id)),
    animators: [],
    disposers: [],
    apron: 2.5,
    groundTile: 7,
    avoidZones: [],
    progress: 0,
    scatterBounds: null,
    async yield(p) {
      if (p !== undefined) {
        ctx.progress = p;
        onProgress(Math.min(1, p));
      }
      await nextFrame();
    },
    // default ground: the road plane extended (themes with terrain override this)
    heightAt(x, z) {
      const l = path.locate(x, z, 400, {});
      return l ? l.planeHeight : 0;
    },
    slopeAt(x, z) {
      const e = 1.5;
      const hx = ctx.heightAt(x + e, z) - ctx.heightAt(x - e, z);
      const hz = ctx.heightAt(x, z + e) - ctx.heightAt(x, z - e);
      return Math.hypot(hx, hz) / (2 * e);
    },
    groundColor(x, z, out) {
      out[0] = out[1] = out[2] = 1;
      return out;
    },
    /** Place an Object3D on the track frame: local +X = left, +Y = up, +Z = forward. */
    placeOnTrack(obj, distance, lateral = 0, up = 0, { yaw = 0, worldUp = true } = {}) {
      const f = path.frameAt(distance, lateral);
      const fwd = f.tangent.clone();
      let upv = f.up.clone();
      if (worldUp) {
        upv.set(0, 1, 0);
        fwd.y = 0;
        fwd.normalize();
      }
      const left = new THREE.Vector3().crossVectors(upv, fwd).normalize();
      const fw = new THREE.Vector3().crossVectors(left, upv).normalize();
      const m = new THREE.Matrix4().makeBasis(left, upv, fw);
      obj.quaternion.setFromRotationMatrix(m);
      if (yaw) obj.rotateY(yaw);
      obj.position.copy(f.position).addScaledVector(f.up, up);
      return obj;
    },
  };
  {
    const b = path.bounds;
    const m = 260;
    ctx.scatterBounds = { minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m };
  }

  onProgress(0.02);
  // ---- sky, fog, lights, environment ---------------------------------------
  const isNight = track.theme.isNight;
  const skyMat = createSkyMaterial(style.sky, track.sunDirection, isNight, { exposure: style.skyExposure ?? 1 });
  const sky = createSkyDome(skyMat);
  root.add(sky);
  const myFog = new THREE.Fog(track.theme.fogColor, track.theme.fogNear, track.theme.fogFar);
  const myBackground = new THREE.Color(track.theme.fogColor);
  myFog.userData = { trackOwned: true };
  myBackground.trackOwned = true;
  // never "restore" state that belonged to another (possibly disposed) track
  if (prev.fog?.userData?.trackOwned) prev.fog = null;
  if (prev.background?.trackOwned) prev.background = null;
  if (prev.environment?.userData?.trackOwned) prev.environment = null;
  scene.fog = myFog;
  scene.background = myBackground;

  const hemi = new THREE.HemisphereLight(style.hemi.sky, style.hemi.ground, style.hemi.intensity);
  hemi.name = 'TrackHemi';
  root.add(hemi);
  const sun = track.sunLight;
  root.add(sun);
  root.add(sun.target);
  track.update(0, 0, new THREE.Vector3(path.px[0], path.py[0], path.pz[0]));

  let envRT = null;
  try {
    envRT = createEnvironment(renderer, style.sky, track.sunDirection, isNight);
  } catch (e) {
    console.warn('[Track] environment map failed', e);
  }
  if (envRT) {
    envRT.texture.userData.trackOwned = true;
    scene.environment = envRT.texture;
    if ('environmentIntensity' in scene) scene.environmentIntensity = style.envIntensity;
  }
  ctx.envMap = envRT ? envRT.texture : null;
  await ctx.yield(0.08);

  // ---- theme content -------------------------------------------------------------
  const themeMod = THEMES[track.def.theme];
  await themeMod.build(ctx);
  await ctx.yield(0.97);

  // count draw calls roughly (for diagnostics)
  let meshes = 0;
  root.traverse((o) => {
    if (o.isMesh || o.isPoints || o.isLine) meshes++;
  });
  ctx.meshCount = meshes;
  onProgress(1);

  const animators = ctx.animators;
  return {
    ctx,
    meshCount: meshes,
    update(dt, time, focus) {
      skyMat.uniforms.uTime.value = time;
      for (let i = 0; i < animators.length; i++) animators[i](dt, time, focus);
    },
    dispose() {
      for (const fn of ctx.disposers) {
        try {
          fn();
        } catch (e) {
          /* ignore */
        }
      }
      const mats = new Set();
      const geos = new Set();
      root.traverse((o) => {
        if (o.geometry) geos.add(o.geometry);
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
      });
      for (const g of geos) g.dispose();
      for (const m of mats) {
        for (const key of Object.keys(m)) {
          const v = m[key];
          if (v && v.isTexture) v.dispose();
        }
        if (m.uniforms) {
          for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture) u.value.dispose();
        }
        if (m.userData?.uniforms) {
          for (const u of Object.values(m.userData.uniforms)) if (u && u.value && u.value.isTexture) u.value.dispose();
        }
        m.dispose();
      }
      root.removeFromParent();
      // only restore scene state that still belongs to this track (another track
      // may already have been built into the same scene)
      if (envRT && scene.environment === envRT.texture) {
        scene.environment = prev.environment ?? null;
        if ('environmentIntensity' in scene && prev.environmentIntensity !== undefined) scene.environmentIntensity = prev.environmentIntensity;
      }
      if (envRT) envRT.dispose();
      if (scene.fog === myFog) scene.fog = prev.fog ?? null;
      if (scene.background === myBackground) scene.background = prev.background ?? null;
    },
  };
}
