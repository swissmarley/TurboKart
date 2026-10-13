/**
 * AI race sandbox.
 *   ?real=1&track=<id>   real Track + real Kart (falls back to mocks if modules are missing)
 *   &t=<sec>             simulate this many seconds headlessly (120 Hz physics) before rendering
 *   &follow=<i>          chase-cam kart index      &seed=<n>  &cc=50|100|150|200  &karts=8
 *   &player=<i>          treat kart i as "player" for rubber-banding (still AI-driven)
 *   &all=1               run all 4 tracks headlessly and log a summary (no rendering)
 */
import * as THREE from 'three';
import { EventBus } from '../src/core/EventBus.js';
import { EVENTS, ITEMS } from '../src/core/constants.js';
import { createRace } from './ai-race.js';
import { MockTrack, MockKart, resolveMockCollisions } from './items-mocks.js';

const params = new URLSearchParams(location.search);
const useReal = params.get('real') === '1';
const trackId = params.get('track') || 'sunny-meadows';
const ff = parseFloat(params.get('t') || '0');
const follow = parseInt(params.get('follow') || '0', 10);
const seed = parseInt(params.get('seed') || '1', 10);
const cc = parseInt(params.get('cc') || '150', 10);
const nKarts = parseInt(params.get('karts') || '8', 10);
const playerIndex = params.has('player') ? parseInt(params.get('player'), 10) : -1;
const FRAME = 1 / 60;

window.addEventListener('error', (e) => console.error('[ai] uncaught', e.message, e.filename, e.lineno));

async function loadModules() {
  if (!useReal) return { Track: null, KartCls: MockKart, characters: null, resolveKartCollisions: resolveMockCollisions, real: false };
  let trackMod = null;
  let kartMod = null;
  try {
    trackMod = await import('../src/track/index.js');
  } catch (e) {
    console.warn('[ai] src/track/index.js unavailable, using MockTrack', e.message);
  }
  try {
    kartMod = await import('../src/kart/index.js');
  } catch (e) {
    console.warn('[ai] src/kart/index.js failed, trying direct imports', e.message);
    try {
      const [k, c, col] = await Promise.all([
        import('../src/kart/Kart.js'),
        import('../src/kart/characters.js'),
        import('../src/kart/collisions.js'),
      ]);
      kartMod = { Kart: k.Kart, CHARACTERS: c.CHARACTERS, resolveKartCollisions: col.resolveKartCollisions };
    } catch (e2) {
      console.warn('[ai] real Kart unavailable, using MockKart', e2.message);
    }
  }
  return {
    Track: trackMod ? trackMod.Track : null,
    KartCls: kartMod ? kartMod.Kart : MockKart,
    characters: kartMod ? kartMod.CHARACTERS : null,
    resolveKartCollisions: kartMod ? kartMod.resolveKartCollisions : null,
    real: !!(trackMod && kartMod),
  };
}

function makeTrack(mods, id) {
  return mods.Track ? new mods.Track(id, { quality: 'low' }) : new MockTrack('loop');
}

async function runAll(mods) {
  const ids = ['sunny-meadows', 'dune-drift', 'frostbite-peaks', 'neon-skyway'];
  for (const id of ids) {
    const bus = new EventBus();
    const track = makeTrack(mods, id);
    const r = createRace({ scene: new THREE.Scene(), bus, track, KartCls: mods.KartCls, characters: mods.characters, resolveKartCollisions: mods.resolveKartCollisions, nKarts, seed, cc, playerIndex });
    const t0 = performance.now();
    while (r.time < 420 && !r.karts.every((k) => k.finished)) r.step(FRAME);
    const fin = r.karts.filter((k) => k.finished).length;
    console.log(`[ai] ${id}: ${fin}/${r.karts.length} finished in ${r.time.toFixed(1)}s sim (${(performance.now() - t0).toFixed(0)}ms real)`);
    for (const l of r.report()) console.log(`[ai]   ${l}`);
    console.log(`[ai]   items ${JSON.stringify(r.itemCounts)}`);
  }
  document.getElementById('hud').textContent = 'all-track run complete — see console';
}

async function main() {
  const mods = await loadModules();
  console.log(`[ai] modules: ${mods.real ? 'REAL Track + Kart' : 'mocks'} (track=${mods.Track ? 'real' : 'mock'}, kart=${mods.KartCls === MockKart ? 'mock' : 'real'})`);
  if (params.get('all') === '1') return runAll(mods);

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.body.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 3000);
  const bus = new EventBus();
  const track = makeTrack(mods, trackId);
  await track.build(scene, renderer, () => {});
  if (!mods.Track) {
    scene.background = new THREE.Color(0x9fd0ff);
    scene.add(new THREE.HemisphereLight(0xdbeeff, 0x6a7a50, 1.3));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
    sun.position.set(60, 120, 40);
    scene.add(sun);
  } else if (track.sunLight && !track.sunLight.parent) {
    scene.add(track.sunLight, track.sunLight.target);
  }
  const r = createRace({ scene, bus, track, KartCls: mods.KartCls, characters: mods.characters, resolveKartCollisions: mods.resolveKartCollisions, nKarts, seed, cc, playerIndex });

  // &give=<item>: hand the followed kart this item at the start; &noaiitems=1: AI never uses items
  if (params.get('noaiitems') === '1') for (const d of r.drivers) d._items = () => {};
  const log = [];
  const nm = (k) => (k ? k.name : '-');
  bus.on(EVENTS.RACE_LAP, (e) => console.log(`[ai] t=${r.time.toFixed(2)} ${nm(e.kart)} lap ${e.lap - 1} done in ${e.lapTime.toFixed(2)}s`));
  bus.on(EVENTS.RACE_FINISH, (e) => console.log(`[ai] FINISH P${e.position} ${nm(e.kart)} ${e.time.toFixed(2)}s`));
  bus.on(EVENTS.ITEM_HIT, (e) => {
    log.unshift(`${r.time.toFixed(1)} ${nm(e.kart)} hit by ${e.type} (${nm(e.attacker)})`);
    log.length = Math.min(log.length, 8);
  });
  bus.on(EVENTS.ITEM_USE, (e) => {
    log.unshift(`${r.time.toFixed(1)} ${nm(e.kart)} uses ${e.type}`);
    log.length = Math.min(log.length, 8);
  });
  const stuckSeen = r.drivers.map(() => 0);

  const t0 = performance.now();
  while (r.time < ff) r.step(FRAME);
  // &at=<metres>: keep simulating until the followed kart reaches this lap distance (lap 1)
  const at = params.has('at') ? parseFloat(params.get('at')) : null;
  if (at !== null) {
    const fk = r.karts[follow];
    while (r.time < 200 && !(r.time > 4 && fk.trackInfo.distance >= at && fk.trackInfo.distance < at + 40)) r.step(FRAME);
  }
  if (params.get('give')) {
    r.items.giveItem(r.karts[follow], params.get('give'));
    for (let i = 0; i < 20; i++) r.step(FRAME); // let the items settle into orbit / trail
  }
  if (ff > 0 || at !== null) {
    console.log(`[ai] fast-forwarded ${ff}s (${(performance.now() - t0).toFixed(0)}ms real) on ${track.name || track.id}`);
    for (const l of r.report()) console.log(`[ai]   ${l}`);
    console.log('[ai] item events ' + JSON.stringify(r.itemCounts));
  }

  // minimap
  const mini = document.getElementById('mini');
  const g = mini.getContext('2d');
  const b = track.minimap.bounds;
  const sc = 240 / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  const mx = (x) => 10 + (x - b.minX) * sc;
  const mz = (z) => 250 - (z - b.minZ) * sc;
  const line = r.drivers[0].line;
  const drawMini = () => {
    g.clearRect(0, 0, 260, 260);
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 7;
    g.beginPath();
    track.minimap.path.forEach((p, i) => (i ? g.lineTo(mx(p.x), mz(p.z)) : g.moveTo(mx(p.x), mz(p.z))));
    g.closePath();
    g.stroke();
    g.strokeStyle = 'rgba(90,210,255,0.9)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < line.n; i += 3) (i ? g.lineTo(mx(line.px[i]), mz(line.pz[i])) : g.moveTo(mx(line.px[i]), mz(line.pz[i])));
    g.closePath();
    g.stroke();
    for (const m of r.items.getMinimapMarkers()) {
      g.fillStyle = m.type === ITEMS.BANANA ? '#ffe14a' : m.type === ITEMS.RED_SHELL ? '#ff3030' : m.type === ITEMS.GREEN_SHELL ? '#30ff60' : m.type === ITEMS.SPINY_SHELL ? '#3070ff' : '#ddd';
      g.fillRect(mx(m.x) - 2, mz(m.z) - 2, 4, 4);
    }
    for (const k of r.karts) {
      g.fillStyle = k.character?.cssColor || '#fff';
      g.beginPath();
      g.arc(mx(k.position.x), mz(k.position.z), k.index === follow ? 5 : 3.5, 0, Math.PI * 2);
      g.fill();
    }
  };

  const hud = document.getElementById('hud');
  const camPos = new THREE.Vector3();
  const look = new THREE.Vector3();
  let first = true;
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    r.step(FRAME);
    for (const k of r.karts) k.updateVisuals(dt, r.time);
    r.drivers.forEach((d, i) => {
      if (d.stats.stuckEvents !== stuckSeen[i]) {
        stuckSeen[i] = d.stats.stuckEvents;
        console.log(`[ai] STUCK ${r.karts[i].name} at d=${r.karts[i].trackInfo.distance.toFixed(0)} t=${r.time.toFixed(1)}`);
      }
    });
    const fk = r.karts[follow];
    camPos.copy(fk.position).addScaledVector(fk.forward, -7.5);
    camPos.y += 3.2;
    look.copy(fk.position).addScaledVector(fk.forward, 6);
    look.y += 1.2;
    if (first) camera.position.copy(camPos);
    else camera.position.lerp(camPos, 0.12);
    first = false;
    camera.lookAt(look);
    track.update?.(dt, r.time, fk.position);
    drawMini();
    const d = r.drivers[follow];
    hud.textContent =
      `${track.name || track.id}  t=${r.time.toFixed(1)}s  ${mods.real ? 'REAL modules' : 'mocks'}  follow=${fk.name} ${d.debug.mode} v=${fk.speed.toFixed(1)} vt=${d.debug.vt.toFixed(1)} scale=${fk.speedScale.toFixed(3)}\n` +
      r.report().map((l) => l.slice(0, 120)).join('\n') +
      '\n\n' +
      log.join('\n');
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  window.__race = r;
}

main().catch((e) => console.error('[ai] failed', String(e.stack || e).replace(/\n/g, ' | ')));
