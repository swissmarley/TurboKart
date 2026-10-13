// Headless physics run (Node): node dev/kart-headless.mjs [seconds=150] [charId=all] [digital=0]
// Drives every character around the mock track with the AutoDriver and prints telemetry.
import { EventBus } from '../src/core/EventBus.js';
import { PHYSICS_DT, EVENTS } from '../src/core/constants.js';
import { CHARACTERS } from '../src/kart/characters.js';
import { Kart } from '../src/kart/Kart.js';
import { resolveKartCollisions } from '../src/kart/collisions.js';
import { MockTrack } from './kart-mocktrack.js';
import { AutoDriver } from './kart-autodrive.js';

const secs = +(process.argv[2] || 150);
const only = process.argv[3] && process.argv[3] !== 'all' ? process.argv[3] : null;
const digital = process.argv[4] === '1';
const together = process.argv[5] === 'pack';

const track = new MockTrack();
console.log('track length', track.length.toFixed(1), 'samples', track.samples.length, 'sections', JSON.stringify(Object.fromEntries(Object.entries(track.sections).map(([k, v]) => [k, Math.round(v)]))));

const chars = only ? CHARACTERS.filter((c) => c.id === only) : CHARACTERS;
const runs = [];
if (together) {
  const bus = new EventBus();
  const grid = track.getStartGrid(chars.length);
  const karts = chars.map((ch, i) => new Kart({ character: ch, index: i, bus }));
  const drivers = karts.map((k, i) => {
    k.placeAtStart(grid[i]);
    return new AutoDriver(k, track, bus, { digital, name: k.name, lateral: (i % 3) - 1 });
  });
  let bumps = 0;
  bus.on(EVENTS.KART_BUMP, () => bumps++);
  const steps = Math.round(secs / PHYSICS_DT);
  for (let s = 0; s < steps; s++) {
    for (const d of drivers) d.update(PHYSICS_DT);
    for (const k of karts) k.update(PHYSICS_DT, track);
    resolveKartCollisions(karts, bus);
  }
  for (const d of drivers) console.log(JSON.stringify(d.report()));
  console.log('bumps', bumps);
} else {
  for (const ch of chars) {
    const bus = new EventBus();
    const kart = new Kart({ character: ch, index: 0, bus });
    const grid = track.getStartGrid(1);
    kart.placeAtStart(grid[0]);
    const drv = new AutoDriver(kart, track, bus, { digital, name: ch.name });
    const steps = Math.round(secs / PHYSICS_DT);
    const t0 = performance.now();
    for (let s = 0; s < steps; s++) {
      drv.update(PHYSICS_DT);
      kart.update(PHYSICS_DT, track);
    }
    const ms = performance.now() - t0;
    const r = drv.report();
    r.msPerStep = +(ms / steps).toFixed(4);
    runs.push(r);
    console.log(JSON.stringify(r));
  }
}
