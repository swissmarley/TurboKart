import * as THREE from 'three';
import { EVENTS, PHYSICS_DT } from '../core/constants.js';

/**
 * Kart ↔ kart collisions (call once per fixed physics step, after every kart.update()).
 * Circle–circle in XZ with a height check (airborne karts pass over each other), positional
 * separation by weight ratio, bouncy impulse exchange, plus the arcade rules:
 *   - a star kart spins out anything it touches (and is not pushed around),
 *   - a normal kart squishes a shrunk kart (spinOut 'squish').
 */

const BUMP_COOLDOWN = 0.3; // seconds per pair
const RESTITUTION = 0.55;
const MIN_PUSH = 2.0; // m/s separation kick so karts don't stick together
const lastBump = new Map();
let simTime = 0;

export function resolveKartCollisions(karts, bus) {
  simTime += PHYSICS_DT;
  const n = karts.length;
  for (let i = 0; i < n; i++) {
    const a = karts[i];
    if (!a || a.isFalling || a.isRespawning) continue;
    for (let j = i + 1; j < n; j++) {
      const b = karts[j];
      if (!b || b.isFalling || b.isRespawning) continue;
      if (Math.abs(a.position.y - b.position.y) > 1.1) continue;
      let dx = b.position.x - a.position.x;
      let dz = b.position.z - a.position.z;
      const rr = a.radius + b.radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= rr * rr) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-4) {
        dx = Math.sin(a.heading + Math.PI / 2);
        dz = Math.cos(a.heading + Math.PI / 2);
        d = 1e-4;
      }
      const nx = dx / d;
      const nz = dz / d;
      const pen = rr - Math.min(d, rr);

      const aStar = a.starTimer > 0;
      const bStar = b.starTimer > 0;
      const ma = aStar ? 50 : a.weight;
      const mb = bStar ? 50 : b.weight;
      const ta = mb / (ma + mb);
      const tb = ma / (ma + mb);

      // positional separation (lighter kart moves more)
      a.position.x -= nx * pen * ta;
      a.position.z -= nz * pen * ta;
      b.position.x += nx * pen * tb;
      b.position.z += nz * pen * tb;

      // impulse along the normal
      const rvn = (b.velocity.x - a.velocity.x) * nx + (b.velocity.z - a.velocity.z) * nz;
      const impact = Math.max(0, -rvn);
      if (rvn < 0) {
        const J = (-(1 + RESTITUTION) * rvn) / (1 / ma + 1 / mb);
        a.velocity.x -= (J / ma) * nx;
        a.velocity.z -= (J / ma) * nz;
        b.velocity.x += (J / mb) * nx;
        b.velocity.z += (J / mb) * nz;
      }
      // guarantee a little sideways shove
      const sep = (b.velocity.x - a.velocity.x) * nx + (b.velocity.z - a.velocity.z) * nz;
      if (sep < MIN_PUSH) {
        const extra = MIN_PUSH - sep;
        a.velocity.x -= nx * extra * ta;
        a.velocity.z -= nz * extra * ta;
        b.velocity.x += nx * extra * tb;
        b.velocity.z += nz * extra * tb;
      }

      // arcade rules
      if (aStar && !bStar) b.spinOut('star', 1.0);
      else if (bStar && !aStar) a.spinOut('star', 1.0);
      else if (!aStar && !bStar) {
        if (b.isShrunk && !a.isShrunk) b.spinOut('squish', 1.5);
        else if (a.isShrunk && !b.isShrunk) a.spinOut('squish', 1.5);
      }

      // keep public state coherent until the next physics step
      a._decompose?.();
      b._decompose?.();
      a.mesh.position.copy(a.position);
      b.mesh.position.copy(b.position);

      const key = a.index < b.index ? a.index * 4096 + b.index : b.index * 4096 + a.index;
      const last = lastBump.get(key) ?? -1e9;
      if (impact > 1.0 && simTime - last > BUMP_COOLDOWN) {
        lastBump.set(key, simTime);
        const s = Math.min(1, impact / 12);
        if (a._vis) a._vis.hitShake = Math.max(a._vis.hitShake, s * ta * 1.4);
        if (b._vis) b._vis.hitShake = Math.max(b._vis.hitShake, s * tb * 1.4);
        if (bus) {
          bus.emit(EVENTS.KART_BUMP, {
            kartA: a,
            kartB: b,
            impact,
            point: new THREE.Vector3(
              a.position.x + nx * a.radius,
              (a.position.y + b.position.y) * 0.5 + 0.45,
              a.position.z + nz * a.radius,
            ),
          });
        }
      }
    }
  }
}
