import * as THREE from 'three';
import { getCoinGeometry, getCoinMaterials } from './models.js';

const RESPAWN_TIME = 14;
const COLLECT_TIME = 0.32;
const POP_TIME = 0.4;
const SCATTER_POOL = 36;

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

/**
 * Track coins (pickups, respawning) and the purely visual "lost coins" that
 * scatter when a kart is hit — all in one InstancedMesh.
 */
export class CoinField {
  constructor(scene, positions, rng = Math.random) {
    this.scene = scene;
    this.rng = rng;
    this.count = positions.length;
    this.coins = positions.map((p, i) => ({
      base: p.clone(),
      state: 'idle', // idle | collect | hidden | pop
      t: 0,
      phase: (i * 0.37) % 1,
    }));
    this.scatter = [];
    for (let i = 0; i < SCATTER_POOL; i++) {
      this.scatter.push({ life: 0, pos: new THREE.Vector3(), vel: new THREE.Vector3(), spin: 0, bounce: 0 });
    }
    this._scatterCursor = 0;
    this.mesh = new THREE.InstancedMesh(getCoinGeometry(), getCoinMaterials(), this.count + SCATTER_POOL);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'Coins';
    scene.add(this.mesh);
    this.update(0, 0);
  }

  /** Index of a collectable coin within `radius` of `pos`, else -1. */
  findHit(pos, radius) {
    for (let i = 0; i < this.count; i++) {
      const c = this.coins[i];
      if (c.state !== 'idle' && c.state !== 'pop') continue;
      const dx = c.base.x - pos.x;
      const dz = c.base.z - pos.z;
      const dy = c.base.y - pos.y;
      if (dx * dx + dz * dz < radius * radius && Math.abs(dy) < 2.2) return i;
    }
    return -1;
  }

  collect(index) {
    const c = this.coins[index];
    c.state = 'collect';
    c.t = 0;
  }

  /** Visual burst of `amount` coins flying off a hit kart. */
  burst(position, amount, groundY = position.y) {
    for (let k = 0; k < amount; k++) {
      const s = this.scatter[this._scatterCursor];
      this._scatterCursor = (this._scatterCursor + 1) % SCATTER_POOL;
      const a = this.rng() * Math.PI * 2;
      const sp = 3 + this.rng() * 3;
      s.pos.copy(position);
      s.pos.y += 0.8;
      s.vel.set(Math.cos(a) * sp, 7 + this.rng() * 3, Math.sin(a) * sp);
      s.life = 1.4;
      s.ground = groundY;
      s.spin = 8 + this.rng() * 8;
      s.bounce = 0;
    }
  }

  reset() {
    for (const c of this.coins) {
      c.state = 'idle';
      c.t = 0;
    }
    for (const s of this.scatter) s.life = 0;
  }

  update(dt, time) {
    for (let i = 0; i < this.count; i++) {
      const c = this.coins[i];
      c.t += dt;
      let scale = 1;
      let lift = 0;
      let spinBoost = 0;
      if (c.state === 'collect') {
        const k = Math.min(1, c.t / COLLECT_TIME);
        lift = k * 1.2;
        scale = 1 - k * k;
        spinBoost = k * 10;
        if (k >= 1) {
          c.state = 'hidden';
          c.t = 0;
        }
      } else if (c.state === 'hidden') {
        scale = 0;
        if (c.t >= RESPAWN_TIME) {
          c.state = 'pop';
          c.t = 0;
        }
      } else if (c.state === 'pop') {
        const k = Math.min(1, c.t / POP_TIME);
        scale = k < 1 ? Math.sin(k * Math.PI * 0.5) * (1 + Math.sin(k * Math.PI) * 0.35) : 1;
        if (k >= 1) c.state = 'idle';
      }
      const ph = c.phase * Math.PI * 2;
      _p.copy(c.base);
      _p.y += Math.sin(time * 2.6 + ph) * 0.08 + lift;
      _e.set(0, time * 3.2 + ph + spinBoost, 0);
      _q.setFromEuler(_e);
      _s.setScalar(Math.max(0.0001, scale));
      _m.compose(_p, _q, _s);
      this.mesh.setMatrixAt(i, _m);
    }
    for (let j = 0; j < SCATTER_POOL; j++) {
      const s = this.scatter[j];
      let scale = 0;
      if (s.life > 0) {
        s.life -= dt;
        s.vel.y -= 26 * dt;
        s.pos.addScaledVector(s.vel, dt);
        if (s.pos.y < s.ground + 0.35 && s.vel.y < 0) {
          s.pos.y = s.ground + 0.35;
          s.vel.y *= -0.45;
          s.vel.x *= 0.6;
          s.vel.z *= 0.6;
          s.bounce++;
        }
        scale = Math.min(1, s.life / 0.35) * 0.85;
        if (s.life <= 0) scale = 0;
      }
      _e.set(0, time * s.spin, 0);
      _q.setFromEuler(_e);
      _s.setScalar(Math.max(0.0001, scale));
      _m.compose(s.pos, _q, _s);
      this.mesh.setMatrixAt(this.count + j, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.dispose();
  }
}
