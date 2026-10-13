import * as THREE from 'three';
import {
  getItemBoxGeometry,
  getItemBoxMaterial,
  getQuestionMarkGeometry,
  getQuestionMarkMaterial,
  ITEM_BOX_SIZE,
} from './models.js';

const RESPAWN_TIME = 3.0;
const POP_TIME = 0.45;
const SHARDS_PER_BOX = 14;
const SHARD_POOL = 112;
const SHARD_LIFE = 0.85;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _c = new THREE.Color();

function elasticPop(t) {
  // 0 -> 1 with overshoot
  if (t >= 1) return 1;
  const c4 = (2 * Math.PI) / 3;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
}

/**
 * All item boxes of a track as two InstancedMeshes (rainbow box + floating
 * "?"), plus a pooled shard burst when a box is smashed.
 */
export class ItemBoxes {
  constructor(scene, positions, rng = Math.random) {
    this.scene = scene;
    this.rng = rng;
    this.count = positions.length;
    this.boxes = positions.map((p, i) => ({
      index: i,
      base: p.clone(),
      position: p.clone(), // live centre (with bob)
      visible: true,
      respawn: 0,
      pop: 1,
      phase: (i * 0.618) % 1,
    }));

    const n = Math.max(1, this.count);
    const geo = getItemBoxGeometry().clone();
    const phase = new Float32Array(n);
    for (let i = 0; i < this.count; i++) phase[i] = this.boxes[i].phase;
    geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    this.boxGeometry = geo;
    this.material = getItemBoxMaterial();
    this.material.defines = { ...(this.material.defines || {}), HAS_PHASE: '' };
    this.material.needsUpdate = true;

    this.boxMesh = new THREE.InstancedMesh(geo, this.material, n);
    this.boxMesh.count = this.count;
    this.boxMesh.renderOrder = 3;
    this.boxMesh.frustumCulled = false;
    this.boxMesh.name = 'ItemBoxes';
    this.qMesh = new THREE.InstancedMesh(getQuestionMarkGeometry(), getQuestionMarkMaterial(), n);
    this.qMesh.count = this.count;
    this.qMesh.frustumCulled = false;
    this.qMesh.name = 'ItemBoxQuestionMarks';
    scene.add(this.boxMesh, this.qMesh);

    // shards
    const shardGeo = new THREE.TetrahedronGeometry(0.2, 0);
    shardGeo.scale(1, 1.6, 0.35);
    this.shardGeometry = shardGeo;
    this.shardMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false });
    this.shardMesh = new THREE.InstancedMesh(shardGeo, this.shardMaterial, SHARD_POOL);
    this.shardMesh.frustumCulled = false;
    this.shardMesh.count = 0;
    this.shardMesh.renderOrder = 4;
    this.shardMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SHARD_POOL * 3), 3);
    scene.add(this.shardMesh);
    this.shards = [];
    for (let i = 0; i < SHARD_POOL; i++) {
      this.shards.push({
        life: 0,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        spin: new THREE.Vector3(),
        size: 1,
      });
    }
    this._shardCursor = 0;
    this.update(0, 0);
  }

  /** Index of a visible box whose centre is within `radius` of `pos` (XZ, |dy| < 2.2), else -1. */
  findHit(pos, radius) {
    for (let i = 0; i < this.count; i++) {
      const b = this.boxes[i];
      if (!b.visible) continue;
      const dx = b.base.x - pos.x;
      const dz = b.base.z - pos.z;
      const dy = b.base.y - pos.y;
      if (dx * dx + dz * dz < radius * radius && Math.abs(dy) < 2.4) return i;
    }
    return -1;
  }

  smash(index) {
    const b = this.boxes[index];
    if (!b || !b.visible) return;
    b.visible = false;
    b.respawn = RESPAWN_TIME;
    b.pop = 0;
    for (let k = 0; k < SHARDS_PER_BOX; k++) {
      const s = this.shards[this._shardCursor];
      this._shardCursor = (this._shardCursor + 1) % SHARD_POOL;
      s.life = SHARD_LIFE * (0.75 + this.rng() * 0.5);
      s.maxLife = s.life;
      const a = this.rng() * Math.PI * 2;
      const up = this.rng();
      s.pos.copy(b.position);
      s.pos.x += Math.cos(a) * 0.4;
      s.pos.z += Math.sin(a) * 0.4;
      s.pos.y += (up - 0.5) * 0.8;
      const sp = 5 + this.rng() * 6;
      s.vel.set(Math.cos(a) * sp, 3 + up * 7, Math.sin(a) * sp);
      s.rot.set(this.rng() * 6, this.rng() * 6, this.rng() * 6);
      s.spin.set((this.rng() - 0.5) * 20, (this.rng() - 0.5) * 20, (this.rng() - 0.5) * 20);
      s.size = 0.7 + this.rng() * 0.7;
      s.hue = this.rng();
    }
  }

  reset() {
    for (const b of this.boxes) {
      b.visible = true;
      b.respawn = 0;
      b.pop = 1;
    }
    for (const s of this.shards) s.life = 0;
  }

  update(dt, time) {
    this.material.uniforms.uTime.value = time;
    for (let i = 0; i < this.count; i++) {
      const b = this.boxes[i];
      if (!b.visible) {
        b.respawn -= dt;
        if (b.respawn <= 0) {
          b.visible = true;
          b.pop = 0.0001;
        }
      } else if (b.pop < 1) {
        b.pop = Math.min(1, b.pop + dt / POP_TIME);
      }
      const ph = b.phase * Math.PI * 2;
      b.position.copy(b.base);
      b.position.y += Math.sin(time * 2.2 + ph) * 0.12;
      const scale = b.visible ? elasticPop(b.pop) : 0;
      _e.set(0.32 + Math.sin(time * 0.7 + ph) * 0.12, time * 1.15 + ph, 0.26);
      _q.setFromEuler(_e);
      _s.setScalar(Math.max(scale, 0.0001));
      _m.compose(b.position, _q, _s);
      this.boxMesh.setMatrixAt(i, _m);
      _e.set(0, Math.sin(time * 1.4 + ph) * 0.65, 0);
      _q.setFromEuler(_e);
      _s.setScalar(Math.max(scale * 0.95, 0.0001));
      _m.compose(b.position, _q, _s);
      this.qMesh.setMatrixAt(i, _m);
    }
    this.boxMesh.instanceMatrix.needsUpdate = true;
    this.qMesh.instanceMatrix.needsUpdate = true;

    // shards
    let n = 0;
    for (const s of this.shards) {
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) continue;
      s.vel.y -= 22 * dt;
      s.vel.multiplyScalar(1 - 1.5 * dt);
      s.pos.addScaledVector(s.vel, dt);
      s.rot.x += s.spin.x * dt;
      s.rot.y += s.spin.y * dt;
      s.rot.z += s.spin.z * dt;
      const k = s.life / s.maxLife;
      _q.setFromEuler(s.rot);
      _s.setScalar(s.size * Math.min(1, k * 1.6));
      _m.compose(s.pos, _q, _s);
      this.shardMesh.setMatrixAt(n, _m);
      _c.setHSL((s.hue + time * 0.5) % 1, 0.9, 0.7);
      this.shardMesh.setColorAt(n, _c);
      n++;
    }
    this.shardMesh.count = n;
    if (n > 0) {
      this.shardMesh.instanceMatrix.needsUpdate = true;
      this.shardMesh.instanceColor.needsUpdate = true;
    }
  }

  get boxSize() {
    return ITEM_BOX_SIZE;
  }

  dispose() {
    this.scene.remove(this.boxMesh, this.qMesh, this.shardMesh);
    this.boxGeometry.dispose();
    this.shardGeometry.dispose();
    this.shardMaterial.dispose();
    this.boxMesh.dispose();
    this.qMesh.dispose();
    this.shardMesh.dispose();
  }
}

