// Headless physics run on the REAL tracks (queries only, no build):
//   node dev/kart-headless-real.mjs [trackId|all] [seconds=120] [charId=ember]
import { EventBus } from '../src/core/EventBus.js';
import { PHYSICS_DT, EVENTS } from '../src/core/constants.js';
import { CHARACTERS } from '../src/kart/characters.js';
import { Kart } from '../src/kart/Kart.js';
import { resolveKartCollisions } from '../src/kart/collisions.js';
import { AutoDriver } from './kart-autodrive.js';

const { Track, TRACKS } = await import('../src/track/index.js');
const which = process.argv[2] || 'all';
const secs = +(process.argv[3] || 120);
const charId = process.argv[4] || 'ember';
const ids = which === 'all' ? TRACKS.map((t) => t.id) : [which];
for (const id of ids) {
  let track;
  try {
    track = new Track(id, { quality: 'low' });
  } catch (e) {
    console.log(id, 'constructor failed:', e.message);
    continue;
  }
  const bus = new EventBus();
  const ch = CHARACTERS.find((c) => c.id === charId) || CHARACTERS[0];
  const grid = track.getStartGrid(8);
  const karts = CHARACTERS.map((c, i) => new Kart({ character: i === 0 ? ch : c, index: i, bus }));
  const drivers = karts.map((k, i) => {
    k.placeAtStart(grid[i]);
    return new AutoDriver(k, track, bus, { name: k.name, lateral: ((i % 3) - 1) * 2.5 });
  });
  let bumps = 0;
  bus.on(EVENTS.KART_BUMP, () => bumps++);
  const t0 = performance.now();
  for (let s = 0; s < secs / PHYSICS_DT; s++) {
    for (const d of drivers) d.update(PHYSICS_DT);
    for (const k of karts) k.update(PHYSICS_DT, track);
    resolveKartCollisions(karts, bus);
  }
  console.log(`== ${id}  length ${track.length.toFixed(0)} m  samples ${track.samples.length}  ${(performance.now() - t0).toFixed(0)} ms  bumps ${bumps}`);
  for (const d of drivers.slice(0, 3)) console.log('  ' + JSON.stringify(d.report()));
}
