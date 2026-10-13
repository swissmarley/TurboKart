// Node smoke test: builds every character model (no DOM → textures are skipped).
import { CHARACTERS } from '../src/kart/characters.js';
import { createKartModel } from '../src/kart/KartModel.js';
for (const ch of CHARACTERS) {
  const t0 = performance.now();
  const g = createKartModel(ch);
  let meshes = 0, tris = 0;
  g.traverse((o) => { if (o.isMesh) { meshes++; tris += o.geometry.attributes.position.count / 3; } });
  console.log(ch.id.padEnd(8), 'meshes', meshes, 'tris', Math.round(tris), 'ms', (performance.now() - t0).toFixed(1));
}
