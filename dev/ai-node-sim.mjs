// Headless Node harness for fast AI / item iteration with the mocks.
// Usage: node dev/ai-node-sim.mjs [seconds=240] [seed=1] [karts=8] [skill=0.9] [player=0]
const fakeCtx = new Proxy(
  {},
  {
    get(target, prop) {
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop in target) return target[prop];
      return () => {};
    },
    set(target, prop, value) {
      target[prop] = value;
      return true;
    },
  },
);
globalThis.document = {
  createElement: () => ({ width: 1, height: 1, getContext: () => fakeCtx, style: {} }),
};

const THREE = await import('three');
const { EventBus } = await import('../src/core/EventBus.js');
const { EVENTS, PHYSICS_DT, GAME_MODES } = await import('../src/core/constants.js');
const { ItemSystem } = await import('../src/items/index.js');
const { AIDriver } = await import('../src/ai/index.js');
const { MockTrack, MockKart, DevRaceManager, makeRng, resolveMockCollisions } = await import('./items-mocks.js');

const [secs = '240', seedS = '1', nS = '8', skillS = '0.9', playerS = '0'] = process.argv.slice(2);
const seed = parseInt(seedS, 10);
const rng = makeRng(seed);
const scene = new THREE.Scene();
const bus = new EventBus();
let track;
if (process.env.TRACK) {
  const { Track } = await import('../src/track/index.js');
  track = new Track(process.env.TRACK, { quality: 'low' });
} else track = new MockTrack('loop');
const karts = [];
const n = parseInt(nS, 10);
const grid = track.getStartGrid(n);
const REAL = process.env.REALKART === '1';
let resolveKartCollisions = resolveMockCollisions;
let KartCls = MockKart;
let CHARS = null;
if (REAL) {
  KartCls = (await import('../src/kart/Kart.js')).Kart;
  CHARS = (await import('../src/kart/characters.js')).CHARACTERS;
  resolveKartCollisions = (await import('../src/kart/collisions.js')).resolveKartCollisions;
}
const engineClass = parseInt(process.env.CC || '150', 10);
for (let i = 0; i < n; i++) {
  const character = CHARS ? CHARS[i % CHARS.length] : { id: `k${i}`, name: `Kart${i}` };
  const k = new KartCls({ index: i, bus, isPlayer: playerS === '1' && i === 0, character, engineClass });
  if (!k.stats || typeof k.stats.wallHits !== 'number') k.dbg = { wallHits: 0, spins: 0, launches: 0, falls: 0 };
  else k.dbg = k.stats;
  k.placeAtStart(grid[i]);
  k.frozen = true;
  karts.push(k);
}
bus.on(EVENTS.KART_WALL_HIT, (e) => { if (e.kart.dbg !== e.kart.stats) e.kart.dbg.wallHits++; });
bus.on(EVENTS.KART_SPINOUT, (e) => { if (e.kart.dbg !== e.kart.stats) e.kart.dbg.spins++; });
bus.on(EVENTS.KART_LAUNCHED, (e) => { if (e.kart.dbg !== e.kart.stats) e.kart.dbg.launches++; });
bus.on(EVENTS.KART_FALL, (e) => { if (e.kart.dbg !== e.kart.stats) e.kart.dbg.falls++; });
const items = new ItemSystem({ scene, track, karts, bus, mode: GAME_MODES.VS, rng });
items.build();
const drivers = karts.map((k, i) => new AIDriver(k, { track, itemSystem: items, skill: parseFloat(skillS) - (i % 4) * 0.05, bus, rng: makeRng(seed * 100 + i) }));
if (process.env.PLANLOG) {
  const d0 = drivers[0];
  const orig = d0._planCorner.bind(d0);
  d0._planCorner = (c, sp) => {
    const fresh = d0.drift.planFor !== c || Math.abs(d0.drift.planSpeed - sp) >= 4;
    const r = orig(c, sp);
    if (fresh) console.log(`plan t=${d0.time.toFixed(2)} corner ${c.startDist.toFixed(0)} len ${c.length.toFixed(0)} v=${sp.toFixed(1)} -> ${r} kOut=${d0.driftModel.kOut.toFixed(4)}`);
    return r;
  };
}
if (process.env.SHELLLOG) {
  const fate = {};
  const origKill = items._kill.bind(items);
  items._kill = (p, emit) => {
    if (p.active && (p.type === 'red_shell' || p.type === 'green_shell') && !p.attached && p.state !== 'held') {
      const key = `${p.type}${p.homing ? '(homing)' : ''}:${emit ? 'destroyed' : 'consumed'}:${p.state}${p.locked ? ':locked' : ''}:${p.age > p.life ? 'expired' : ''}`;
      fate[key] = (fate[key] || 0) + 1;
    }
    return origKill(p, emit);
  };
  process.on('exit', () => console.log('shell fates', JSON.stringify(fate, null, 0)));
}
const race = new DevRaceManager({ karts, track, bus, laps: 3 });
const counts = {};
const inc = (k) => (counts[k] = (counts[k] || 0) + 1);
for (const [name, ev] of Object.entries(EVENTS)) if (name.startsWith('ITEM_') || name.startsWith('COIN_')) bus.on(ev, () => inc(name));
const hitsBy = {};
bus.on(EVENTS.ITEM_HIT, (e) => (hitsBy[e.type] = (hitsBy[e.type] || 0) + 1));
const usesBy = {};
bus.on(EVENTS.ITEM_USE, (e) => (usesBy[e.type] = (usesBy[e.type] || 0) + 1));
const finishes = [];
let tricks = 0;
bus.on(EVENTS.KART_TRICK, () => tricks++);
process.on('exit', () => console.log('tricks', tricks));
const wallAt = {};
bus.on(EVENTS.KART_WALL_HIT, (e) => {
  const b = Math.floor(e.kart.trackInfo.distance / 25) * 25;
  wallAt[b] = (wallAt[b] || 0) + 1;
});
bus.on(EVENTS.RACE_FINISH, (e) => finishes.push(`P${e.position} ${e.kart.name} ${e.time.toFixed(1)}s`));

let simTime = 0;
let acc = 0;
let cdT = 0;
let cd = 4;
const FRAME = 1 / 60;
const t0 = Date.now();
const total = parseFloat(secs);
while (simTime < total) {
  if (cd > 0) {
    cdT += FRAME;
    const c = 3 - Math.floor(cdT);
    if (c < cd) {
      cd = c;
      for (const k of karts) if (c > 0) k.onCountdown?.(c);
      bus.emit(EVENTS.RACE_COUNTDOWN, { count: Math.max(0, c) });
      if (c <= 0) for (const k of karts) { k.frozen = false; k.onRaceStart?.(); }
    }
  }
  for (const d of drivers) d.update(FRAME, { karts, playerKart: playerS === '1' ? karts[0] : null });
  acc += FRAME;
  while (acc >= PHYSICS_DT) {
    for (const k of karts) k.update(PHYSICS_DT, track);
    if (resolveKartCollisions) resolveKartCollisions(karts, bus);
    acc -= PHYSICS_DT;
  }
  items.update(FRAME, simTime);
  race.update(FRAME);
  simTime += FRAME;
  if (process.env.TRACE !== undefined) {
    const ti = parseInt(process.env.TRACE, 10);
    const k = karts[ti];
    const d = drivers[ti];
    const every = parseFloat(process.env.EVERY || '0.25');
    const t0s = parseFloat(process.env.FROM || '0');
    const t1s = parseFloat(process.env.TO || '1e9');
    if (simTime >= t0s && simTime <= t1s && Math.floor(simTime / every) !== Math.floor((simTime - FRAME) / every)) {
      const info = k.trackInfo;
      const ls = d.line.sample(info.distance, {});
      console.log(
        `t${simTime.toFixed(2)} d${info.distance.toFixed(0)} lat${info.lateral.toFixed(1)} line${ls.lat.toFixed(1)} hw${info.halfWidth.toFixed(1)} v${k.speed.toFixed(1)} vt${d.debug.vt.toFixed(1)} k${(ls.curv * 1000).toFixed(1)} st${k.controls.steer.toFixed(2)} th${k.controls.throttle} br${k.controls.brake.toFixed(1)} dr${k.controls.drift ? 1 : 0}/${k.isDrifting ? k.driftLevel : '-'} ${d.debug.mode} shift${d.latShift.toFixed(1)} ${k.surface}`,
      );
    }
  }
  if (karts.every((k) => k.finished)) break;
}
console.log(`simulated ${simTime.toFixed(1)}s in ${Date.now() - t0}ms; track length ${track.length.toFixed(0)}m corners=${drivers[0].line.corners.length}`);
for (const k of [...karts].sort((a, b) => a.racePosition - b.racePosition)) {
  const d = drivers[k.index];
  const laps = race.lapTimes(k).map((t) => t.toFixed(1)).join(' ');
  console.log(
    `P${k.racePosition} ${k.name} lap${k.lap} fin=${k.finished ? k.finishTime.toFixed(1) : '-'} laps[${laps}] stuck=${d.stats.stuckEvents} resp=${d.stats.respawns} wall=${k.dbg.wallHits} spins=${k.dbg.spins} launch=${k.dbg.launches} falls=${k.dbg.falls} drifts=${d.stats.drifts} mt=${d.stats.miniTurbos} coins=${k.coins} scale=${k.speedScale.toFixed(3)}`,
  );
}
console.log('finishes', finishes.join(' | '));
if (process.env.DUMPAI) for (const d of drivers) console.log(d.kart.name, 'driftModel', JSON.stringify(d.driftModel, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)), 'kmax', Array.from(d._kmaxBuckets).map((v) => v.toFixed(3)).join(','), 'pers', JSON.stringify(d.personality, (k, v) => (typeof v === 'number' ? +v.toFixed(2) : v)));
console.log('events', JSON.stringify(counts));
console.log('hits', JSON.stringify(hitsBy));
console.log('uses', JSON.stringify(usesBy));
console.log('wallAt', JSON.stringify(wallAt));
