/**
 * Shared headless race runner for the AI sandboxes (browser dev/ai.html).
 * Wires Track + Karts + ItemSystem + AIDrivers + a minimal race manager and
 * steps them exactly like Game's frame loop (AI/items per frame, physics @120 Hz).
 */
import { EVENTS, PHYSICS_DT, GAME_MODES, ENGINE_CLASSES } from '../src/core/constants.js';
import { ItemSystem } from '../src/items/index.js';
import { AIDriver } from '../src/ai/index.js';
import { DevRaceManager, makeRng } from './items-mocks.js';

export function createRace({ scene, bus, track, KartCls, characters, resolveKartCollisions, nKarts = 8, seed = 1, cc = 150, playerIndex = -1, laps = 3, mode = GAME_MODES.VS }) {
  const rng = makeRng(seed);
  const grid = track.getStartGrid(nKarts);
  const karts = [];
  for (let i = 0; i < nKarts; i++) {
    const character = characters ? characters[i % characters.length] : { id: `k${i}`, name: `Kart${i}` };
    const k = new KartCls({ index: i, bus, isPlayer: i === playerIndex, character, engineClass: cc });
    k.placeAtStart(grid[i]);
    k.frozen = true;
    if (scene) scene.add(k.mesh);
    karts.push(k);
  }
  const playerKart = playerIndex >= 0 ? karts[playerIndex] : null;
  const items = new ItemSystem({ scene, track, karts, bus, mode, rng });
  items.build();
  const baseSkill = ENGINE_CLASSES[cc]?.aiSkill ?? 0.9;
  const drivers = karts.map(
    (k, i) => new AIDriver(k, { track, itemSystem: items, skill: Math.max(0, baseSkill - (i % 4) * 0.04), bus, rng: makeRng(seed * 100 + i) }),
  );
  const race = new DevRaceManager({ karts, track, bus, laps });

  const stats = karts.map(() => ({ walls: 0, spins: 0, launches: 0, falls: 0, respawns: 0 }));
  bus.on(EVENTS.KART_WALL_HIT, (e) => stats[e.kart.index] && stats[e.kart.index].walls++);
  bus.on(EVENTS.KART_SPINOUT, (e) => stats[e.kart.index] && stats[e.kart.index].spins++);
  bus.on(EVENTS.KART_LAUNCHED, (e) => stats[e.kart.index] && stats[e.kart.index].launches++);
  bus.on(EVENTS.KART_FALL, (e) => stats[e.kart.index] && stats[e.kart.index].falls++);
  bus.on(EVENTS.KART_RESPAWN, (e) => stats[e.kart.index] && stats[e.kart.index].respawns++);
  const itemCounts = {};
  for (const [name, ev] of Object.entries(EVENTS)) {
    if (name.startsWith('ITEM_') || name.startsWith('COIN_')) bus.on(ev, () => (itemCounts[name] = (itemCounts[name] || 0) + 1));
  }

  let time = 0;
  let acc = 0;
  let cdT = 0;
  let cd = 4;
  function step(dt) {
    if (cd > 0) {
      cdT += dt;
      const c = 3 - Math.floor(cdT);
      if (c < cd) {
        cd = c;
        if (c > 0) for (const k of karts) k.onCountdown?.(c);
        bus.emit(EVENTS.RACE_COUNTDOWN, { count: Math.max(0, c) });
        if (c <= 0) {
          for (const k of karts) {
            k.frozen = false;
            k.onRaceStart?.();
          }
          bus.emit(EVENTS.RACE_START, {});
        }
      }
    }
    for (const d of drivers) d.update(dt, { karts, playerKart });
    acc += dt;
    while (acc >= PHYSICS_DT) {
      for (const k of karts) k.update(PHYSICS_DT, track);
      resolveKartCollisions?.(karts, bus);
      acc -= PHYSICS_DT;
    }
    items.update(dt, time);
    race.update(dt);
    time += dt;
  }

  function report() {
    const lines = [];
    for (const k of [...karts].sort((a, b) => a.racePosition - b.racePosition)) {
      const d = drivers[k.index];
      const st = stats[k.index];
      const laps = race.lapTimes(k).map((t) => t.toFixed(2)).join(' ');
      lines.push(
        `P${k.racePosition} ${String(k.name).padEnd(7)} lap ${k.lap} ${k.finished ? 'FIN ' + k.finishTime.toFixed(2) + 's' : 'running'} laps[${laps}] stuck=${d.stats.stuckEvents} aiRespawn=${d.stats.respawns} walls=${st.walls} spins=${st.spins} launches=${st.launches} falls=${st.falls} drifts=${d.stats.drifts} miniTurbos=${d.stats.miniTurbos} coins=${k.coins}`,
      );
    }
    return lines;
  }

  return {
    karts,
    drivers,
    items,
    race,
    stats,
    itemCounts,
    playerKart,
    step,
    report,
    get time() {
      return time;
    },
  };
}
