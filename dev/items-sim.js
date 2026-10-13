import * as THREE from 'three';
import { EventBus } from '../src/core/EventBus.js';
import { EVENTS, ITEMS, PHYSICS_DT, GAME_MODES } from '../src/core/constants.js';
import { ItemSystem } from '../src/items/index.js';
import { AIDriver } from '../src/ai/index.js';
import { MockTrack, MockKart, DevRaceManager, makeRng, resolveMockCollisions } from './items-mocks.js';

/**
 * ?view=sim[&t=10][&follow=0][&cam=chase|top][&give=<item>][&player=1][&seed=1][&karts=8][&skill=0.9]
 * Mock karts race with AI drivers and use items. Logs hits/uses to console.
 */
export function runSim(params) {
  const seed = parseInt(params.get('seed') || '1', 10);
  const rng = makeRng(seed);
  const nKarts = parseInt(params.get('karts') || '8', 10);
  const skill = parseFloat(params.get('skill') || '0.9');
  const ffTime = parseFloat(params.get('t') || '0');
  const follow = parseInt(params.get('follow') || '0', 10);
  const camMode = params.get('cam') || 'chase';
  const give = params.get('give');
  const hasPlayer = params.get('player') === '1';
  const mode = params.get('mode') === 'tt' ? GAME_MODES.TIME_TRIAL : GAME_MODES.VS;

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.body.appendChild(renderer.domElement);
  Object.assign(renderer.domElement.style, { position: 'fixed', left: '0', top: '0' });
  const paused = params.get('pause') === '1';
  const camDist = parseFloat(params.get('dist') || '7.5');
  const camHeight = parseFloat(params.get('h') || '3.4');
  const camSide = parseFloat(params.get('side') || '0');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd0ff);
  scene.fog = new THREE.Fog(0x9fd0ff, 150, 700);
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 3000);
  scene.add(new THREE.HemisphereLight(0xdbeeff, 0x6a7a50, 1.3));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.position.set(60, 120, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -60;
  sc.right = 60;
  sc.top = 60;
  sc.bottom = -60;
  sc.far = 400;
  scene.add(sun, sun.target);

  const bus = new EventBus();
  const track = new MockTrack('loop');
  track.build(scene);
  const karts = [];
  const grid = track.getStartGrid(nKarts);
  for (let i = 0; i < nKarts; i++) {
    const k = new MockKart({ index: i, bus, isPlayer: hasPlayer && i === 0, character: { id: `k${i}`, name: `Kart${i}` } });
    k.placeAtStart(grid[i]);
    k.frozen = true;
    scene.add(k.mesh);
    karts.push(k);
  }
  const playerKart = hasPlayer ? karts[0] : null;
  const items = new ItemSystem({ scene, track, karts, bus, mode, rng });
  items.build();
  const drivers = karts.map(
    (k, i) => new AIDriver(k, { track, itemSystem: items, skill: skill - (i % 4) * 0.05, bus, rng: makeRng(seed * 100 + i) }),
  );
  const race = new DevRaceManager({ karts, track, bus, laps: 3 });
  if (params.get('noitems') === '1') for (const d of drivers) d._items = () => {};
  if (give) for (const k of karts) items.giveItem(k, give);

  // ------------------------------------------------------- event logging
  const counts = {};
  const recent = [];
  const log = (name, msg) => {
    counts[name] = (counts[name] || 0) + 1;
    recent.unshift(`${simTime.toFixed(1)}s ${msg}`);
    if (recent.length > 9) recent.pop();
  };
  const nm = (k) => (k ? k.name : '-');
  bus.on(EVENTS.ITEM_USE, (e) => log('use', `${nm(e.kart)} uses ${e.type}`));
  bus.on(EVENTS.ITEM_HIT, (e) => {
    log('hit', `${nm(e.kart)} HIT by ${e.type} (${nm(e.attacker)})`);
    console.log(`[sim] t=${simTime.toFixed(2)} HIT ${nm(e.kart)} by ${e.type} from ${nm(e.attacker)}`);
  });
  bus.on(EVENTS.ITEM_BLOCKED, (e) => log('blocked', `${nm(e.kart)} blocked ${e.type}`));
  bus.on(EVENTS.ITEM_EXPLOSION, (e) => log('explosion', `BOOM ${e.type}`));
  bus.on(EVENTS.ITEM_ROULETTE_STOP, (e) => log('roulette', `${nm(e.kart)} got ${e.type} (P${e.kart.racePosition})`));
  bus.on(EVENTS.ITEM_BOX_HIT, () => (counts.box = (counts.box || 0) + 1));
  bus.on(EVENTS.COIN_PICKUP, () => (counts.coin = (counts.coin || 0) + 1));
  bus.on(EVENTS.COIN_LOST, () => (counts.coinLost = (counts.coinLost || 0) + 1));
  bus.on(EVENTS.ITEM_SHELL_BOUNCE, () => (counts.bounce = (counts.bounce || 0) + 1));
  bus.on(EVENTS.ITEM_DESTROYED, () => (counts.destroyed = (counts.destroyed || 0) + 1));
  bus.on(EVENTS.ITEM_LIGHTNING, (e) => log('lightning', `${nm(e.kart)} LIGHTNING`));
  bus.on(EVENTS.ITEM_SPINY_WARNING, (e) => log('spiny', `spiny -> ${nm(e.target)}`));
  bus.on(EVENTS.RACE_LAP, (e) => {
    if (e.kart === karts[follow]) log('lap', `${nm(e.kart)} lap ${e.lap} ${e.lapTime.toFixed(2)}s`);
  });
  bus.on(EVENTS.RACE_FINISH, (e) => console.log(`[sim] FINISH P${e.position} ${nm(e.kart)} ${e.time.toFixed(2)}s`));

  // ------------------------------------------------------- simulation
  let simTime = 0;
  let acc = 0;
  let countdownT = 0;
  let countdown = 4;
  const FRAME = 1 / 60;
  function step(dt) {
    if (countdown > 0) {
      countdownT += dt;
      const c = 3 - Math.floor(countdownT);
      if (c < countdown) {
        countdown = c;
        bus.emit(EVENTS.RACE_COUNTDOWN, { count: Math.max(0, c) });
        if (c <= 0) {
          for (const k of karts) k.frozen = false;
          bus.emit(EVENTS.RACE_START, {});
        }
      }
    }
    for (const d of drivers) d.update(dt, { karts, playerKart });
    acc += dt;
    while (acc >= PHYSICS_DT) {
      for (const k of karts) k.update(PHYSICS_DT, track);
      resolveMockCollisions(karts);
      acc -= PHYSICS_DT;
    }
    items.update(dt, simTime);
    race.update(dt);
    if (params.get('hold') && simTime > 4) {
      // debug: keep giving the followed kart an item and hold it
      const k = karts[follow];
      if (!items.getItemState(k).type) items.giveItem(k, params.get('hold'));
    }
    simTime += dt;
  }
  const t0 = performance.now();
  while (simTime < ffTime) step(FRAME);
  if (ffTime > 0) console.log(`[sim] fast-forwarded ${ffTime}s in ${(performance.now() - t0).toFixed(0)}ms`);
  window.__sim = { karts, items, drivers, race, track, step, counts };

  const summary = () => {
    const rows = [...karts]
      .sort((a, b) => a.racePosition - b.racePosition)
      .map((k) => {
        const d = drivers[k.index];
        const st = items.getItemState(k);
        return `P${k.racePosition} ${k.name.padEnd(6)} lap ${k.lap} c${String(k.coins).padStart(2)} ${(st.roulette ? '??' : st.type || '-').padEnd(18)} v${k.speed.toFixed(0).padStart(3)} sc${k.speedScale.toFixed(3)} stuck${d.stats.stuckEvents} wall${k.stats.wallHits} spin${k.stats.spins} fall${k.stats.falls} mt${d.stats.miniTurbos}`;
      });
    return rows;
  };
  console.log('[sim] t=' + simTime.toFixed(1) + '\n' + summary().join('\n'));
  console.log('[sim] counts ' + JSON.stringify(counts));

  // ------------------------------------------------------- minimap overlay
  const mini = document.createElement('canvas');
  mini.id = 'mini';
  mini.width = 300;
  mini.height = 300;
  document.body.appendChild(mini);
  const g = mini.getContext('2d');
  const b = track.minimap.bounds;
  const scale = 280 / Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
  const mx = (x) => 10 + (x - b.minX) * scale;
  const mz = (z) => 290 - (z - b.minZ) * scale;
  function drawMini() {
    g.clearRect(0, 0, 300, 300);
    g.strokeStyle = 'rgba(255,255,255,0.5)';
    g.lineWidth = 6;
    g.beginPath();
    track.minimap.path.forEach((p, i) => (i ? g.lineTo(mx(p.x), mz(p.z)) : g.moveTo(mx(p.x), mz(p.z))));
    g.closePath();
    g.stroke();
    // racing line
    const L = drivers[0].line;
    g.strokeStyle = 'rgba(80,200,255,0.9)';
    g.lineWidth = 1;
    g.beginPath();
    for (let i = 0; i < L.n; i += 3) (i ? g.lineTo(mx(L.px[i]), mz(L.pz[i])) : g.moveTo(mx(L.px[i]), mz(L.pz[i])));
    g.closePath();
    g.stroke();
    for (const m of items.getMinimapMarkers()) {
      g.fillStyle = m.type === ITEMS.BANANA ? '#ffe14a' : m.type === ITEMS.RED_SHELL ? '#ff3030' : m.type === ITEMS.GREEN_SHELL ? '#30ff60' : m.type === ITEMS.SPINY_SHELL ? '#3070ff' : '#222';
      g.fillRect(mx(m.x) - 2, mz(m.z) - 2, 4, 4);
    }
    for (const k of karts) {
      g.fillStyle = '#' + k.color.toString(16).padStart(6, '0');
      g.beginPath();
      g.arc(mx(k.position.x), mz(k.position.z), k === karts[follow] ? 5 : 3.5, 0, Math.PI * 2);
      g.fill();
    }
  }

  // ------------------------------------------------------- render loop
  const hud = document.getElementById('hud');
  const camPos = new THREE.Vector3();
  const camLook = new THREE.Vector3();
  let first = true;
  let last = performance.now();
  function frame(now) {
    const realDt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!paused) step(FRAME); // fixed simulation step per rendered frame (deterministic)
    for (const k of karts) k.updateVisuals(realDt, simTime);
    if (paused) items.update(0.0001, simTime + (now - t0) / 1000);
    const fk = karts[follow];
    if (camMode === 'top') {
      camPos.set(fk.position.x, fk.position.y + 70, fk.position.z - 25);
      camLook.copy(fk.position);
    } else {
      camPos.copy(fk.position).addScaledVector(fk.forward, -camDist);
      camPos.x += -fk.forward.z * camSide;
      camPos.z += fk.forward.x * camSide;
      camPos.y += camHeight;
      camLook.copy(fk.position).addScaledVector(fk.forward, 6);
      camLook.y += 1.0;
    }
    if (first) camera.position.copy(camPos);
    else camera.position.lerp(camPos, 0.15);
    first = false;
    camera.lookAt(camLook);
    sun.position.copy(fk.position).add(new THREE.Vector3(40, 90, 30));
    sun.target.position.copy(fk.position);
    drawMini();
    hud.textContent = `t=${simTime.toFixed(1)}s  follow=${fk.name}  mode=${drivers[follow].debug.mode} vt=${drivers[follow].debug.vt.toFixed(1)}\n` + summary().join('\n') + '\n\n' + recent.join('\n');
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // periodic console summary
  setInterval(() => {
    console.log('[sim] t=' + simTime.toFixed(1) + ' counts ' + JSON.stringify(counts));
  }, 5000);
}
