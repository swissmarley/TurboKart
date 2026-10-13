import * as THREE from 'three';
import { EventBus } from '../src/core/EventBus.js';
import { Input } from '../src/core/Input.js';
import { EVENTS, PHYSICS_DT, SPEED_DISPLAY_FACTOR, DRIFT_LEVELS } from '../src/core/constants.js';
import { CHARACTERS, Kart, resolveKartCollisions, CameraController } from '../src/kart/index.js';
import { runGarage } from './kart-garage.js';
import { MockTrack } from './kart-mocktrack.js';
import { AutoDriver } from './kart-autodrive.js';

/**
 * Kart sandbox.
 *   ?view=garage                 all 8 characters, studio lighting (angle=front|back|chase|side|three, char=<id>)
 *   ?view=garage&kart=1&pose=X   full Kart instances with a visual pose (drift|star|shrink|spin|launch|ghost|celebrate|hit|trick)
 *   ?view=drive                  keyboard driving (arrows/WASD, Space/Shift = hop/drift, C = look back)
 *   &autodrive=1                 scripted driver + console telemetry
 *   &bots=N                      extra autodriven karts (collisions)
 *   &t=12                        run the sim deterministically to t seconds, then freeze (reproducible screenshots)
 *   &run=1                       keep running after t
 *   &char=<id> &engine=150 &cam=chase|intro|finish|orbit &countdown=1 &pose=...
 *   &track=real&id=sunny-meadows use the real Track from src/track/index.js
 */

const params = new URLSearchParams(location.search);
const hud = document.getElementById('hud');
const labels = document.getElementById('labels');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);
addEventListener('resize', () => renderer.setSize(innerWidth, innerHeight));

const view = params.get('view') || (params.get('autodrive') ? 'drive' : 'garage');

function applyPose(kart, pose, t = 0) {
  switch (pose) {
    case 'drift':
      kart.isDrifting = true;
      kart.driftDirection = 1;
      kart.steerSmoothed = 0.6;
      kart.driftLevel = 2;
      kart.speed = 25;
      break;
    case 'star':
      kart.startStar(30);
      break;
    case 'shrink':
      kart.shrink(30);
      break;
    case 'spin':
      kart.spinOut('banana', 30);
      break;
    case 'launch':
      kart._launchTimer = 0.9;
      kart.spinoutTimer = 0.9;
      kart._spinTotal = 1.6;
      kart._spinCause = 'launch';
      break;
    case 'ghost':
      kart.ghostTimer = 30;
      break;
    case 'celebrate':
      kart.finished = true;
      kart.racePosition = 1;
      break;
    case 'hit':
      kart._hitPose = 30;
      break;
    case 'trick':
      kart._trickTimer = 0.3;
      break;
    case 'boost':
      kart.boostTimer = 30;
      kart.boostPower = 1;
      break;
  }
}

async function runDrive() {
  const bus = new EventBus();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 3000);
  scene.add(camera);
  addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  });

  let track;
  if (params.get('track') === 'real') {
    try {
      const mod = await import('../src/track/index.js');
      const id = params.get('id') || (mod.TRACKS && mod.TRACKS[0] && mod.TRACKS[0].id) || 'sunny-meadows';
      track = new mod.Track(id, { quality: params.get('quality') || 'high' });
      await track.build(scene, renderer, () => {});
      console.log('[kart-sandbox] real track loaded', id, 'length', track.length?.toFixed?.(1));
    } catch (err) {
      console.error('[kart-sandbox] real track failed, falling back to mock', err);
      track = null;
    }
  }
  if (!track) {
    track = new MockTrack();
    await track.build(scene, renderer);
  }

  const engine = +(params.get('engine') || 150);
  const charId = params.get('char') || 'ember';
  const pIdx = Math.max(0, CHARACTERS.findIndex((c) => c.id === charId));
  const bots = +(params.get('bots') || 0);
  const count = 1 + bots;
  const grid = track.getStartGrid(Math.max(count, 2));
  const karts = [];
  const drivers = [];
  const player = new Kart({ character: CHARACTERS[pIdx], index: 0, isPlayer: true, bus, engineClass: engine });
  karts.push(player);
  for (let i = 0; i < bots; i++) {
    const ch = CHARACTERS[(pIdx + 1 + i) % CHARACTERS.length];
    karts.push(new Kart({ character: ch, index: i + 1, bus, engineClass: engine }));
  }
  karts.forEach((k, i) => {
    k.placeAtStart(grid[i]);
    scene.add(k.mesh);
  });
  const auto = params.get('autodrive') === '1';
  const playerDriver = auto ? new AutoDriver(player, track, bus, { name: player.name, digital: params.get('digital') === '1' }) : null;
  for (let i = 1; i < karts.length; i++) drivers.push(new AutoDriver(karts[i], track, bus, { name: karts[i].name, lateral: ((i % 3) - 1) * 3 }));
  const pose = params.get('pose');

  const input = new Input({ bus });
  const camCtl = new CameraController(camera, { bus });
  camCtl.setTarget(player);
  camCtl.setTrack(track);
  const camMode = params.get('cam') || 'chase';
  camCtl.setMode(camMode);
  camCtl.snap();

  // countdown (rocket start test)
  const useCountdown = params.get('countdown') === '1';
  let countdownT = useCountdown ? 0 : null;
  let nextCount = 3;
  if (useCountdown) for (const k of karts) k.frozen = true;
  const events = [];
  for (const ev of ['KART_BOOST', 'KART_DRIFT_LEVEL', 'KART_DRIFT_END', 'KART_WALL_HIT', 'KART_FALL', 'KART_RESPAWN', 'KART_TRICK', 'KART_START_STALL', 'KART_BUMP', 'KART_LAND']) {
    bus.on(EVENTS[ev], (p) => {
      if (p.kart === player || p.kartA === player || p.kartB === player) {
        events.push(`${simTime.toFixed(2)} ${ev}${p.level !== undefined ? ' L' + p.level : ''}${p.source ? ' ' + p.source : ''}${p.impact ? ' ' + p.impact.toFixed(1) : ''}`);
        if (events.length > 8) events.shift();
      }
    });
  }

  let simTime = 0;
  let acc = 0;
  let visualTime = 0;
  let frozenAtT = false;
  const tStop = params.has('t') ? parseFloat(params.get('t')) : null;
  const keepRunning = params.get('run') === '1';
  let lastLaps = 0;

  function physicsStep() {
    if (countdownT !== null) {
      countdownT += PHYSICS_DT;
      const at = { 3: 0.6, 2: 1.6, 1: 2.6, 0: 3.6 }[nextCount];
      if (countdownT >= at) {
        if (nextCount > 0) for (const k of karts) k.onCountdown(nextCount);
        else {
          for (const k of karts) {
            k.frozen = false;
            k.onRaceStart();
          }
          countdownT = null;
        }
        nextCount--;
      }
      // scripted rocket start: press throttle 0.2 s after "2"
      if (auto && countdownT !== null) player.controls.throttle = countdownT > 1.8 ? 1 : 0;
    }
    if (playerDriver && countdownT === null) playerDriver.update(PHYSICS_DT);
    for (const d of drivers) if (countdownT === null) d.update(PHYSICS_DT);
    for (const k of karts) k.update(PHYSICS_DT, track);
    resolveKartCollisions(karts, bus);
    simTime += PHYSICS_DT;
  }

  function logTelemetry(tag) {
    if (!playerDriver) return;
    console.log(`[kart-telemetry] ${tag} ` + JSON.stringify(playerDriver.report()));
  }

  // deterministic fast-forward
  if (tStop !== null) {
    const steps = Math.round(tStop / PHYSICS_DT);
    for (let i = 0; i < steps; i++) {
      physicsStep();
      if (i % 2 === 1) {
        visualTime += 2 * PHYSICS_DT;
        for (const k of karts) k.updateVisuals(2 * PHYSICS_DT, visualTime);
        camCtl.update(2 * PHYSICS_DT);
      }
      if (pose && i === steps - 30) for (const k of karts) applyPose(k, pose);
    }
    if (pose) for (let i = 0; i < 20; i++) for (const k of karts) k.updateVisuals(1 / 60, (visualTime += 1 / 60));
    frozenAtT = !keepRunning;
    logTelemetry('t=' + tStop);
  } else if (pose) {
    for (const k of karts) applyPose(k, pose);
  }

  function updateHud(fps) {
    const k = player;
    const lvl = DRIFT_LEVELS[k.driftLevel];
    hud.textContent =
      `${k.name} (${k.character.weightClass}) ${engine}cc   t=${simTime.toFixed(2)}${frozenAtT ? ' [frozen]' : ''}\n` +
      `speed ${(k.speed * SPEED_DISPLAY_FACTOR).toFixed(0)} km/h  (${k.speed.toFixed(1)} / max ${k.maxSpeed.toFixed(1)} m/s)\n` +
      `surface ${k.surface}  air ${k.isAirborne ? k.airTime.toFixed(2) : '-'}  lat ${k.trackInfo.lateral.toFixed(1)}  d ${k.trackInfo.distance.toFixed(0)}\n` +
      `drift ${k.isDrifting ? (k.driftDirection > 0 ? 'R' : 'L') + ' ' + lvl.name + ' ' + k.driftCharge.toFixed(2) : '-'}  boost ${k.boostTimer.toFixed(2)}  coins ${k.coins}\n` +
      (playerDriver ? `laps ${JSON.stringify(playerDriver.tel.lapTimes)}\n` : '') +
      events.join('\n') +
      `\n${fps.toFixed(0)} fps`;
  }

  window.__kartSandbox = { renderer, scene, camera, karts, track, camCtl, bus };
  let fpsAcc = 0;
  let fpsN = 0;
  let fps = 60;
  return {
    scene,
    camera,
    update(dt) {
      input.update();
      if (!auto) {
        const c = input.getKartControls();
        Object.assign(player.controls, c);
      }
      if (!frozenAtT) {
        acc += dt;
        let n = 0;
        while (acc >= PHYSICS_DT && n < 12) {
          physicsStep();
          acc -= PHYSICS_DT;
          n++;
        }
        if (n >= 12) acc = 0;
        visualTime += dt;
        for (const k of karts) k.updateVisuals(dt, visualTime);
        camCtl.update(dt);
        if (playerDriver && playerDriver.tel.lapTimes.length !== lastLaps) {
          lastLaps = playerDriver.tel.lapTimes.length;
          logTelemetry('lap ' + lastLaps);
        }
      }
      track.update(dt, visualTime, player.position);
      fpsAcc += dt;
      fpsN++;
      if (fpsAcc > 0.5) {
        fps = fpsN / fpsAcc;
        fpsAcc = 0;
        fpsN = 0;
      }
      updateHud(fps);
    },
  };
}

async function runGarageKarts() {
  // garage with full Kart instances so visual states can be inspected
  const bus = new EventBus();
  const pose = params.get('pose');
  const makeKart = (ch, i) => {
    const k = new Kart({ character: ch, index: i, bus });
    if (pose) applyPose(k, pose);
    // a few frames so springs settle
    for (let f = 0; f < 30; f++) k.updateVisuals(1 / 60, f / 60);
    k.mesh.position.set(0, 0, 0);
    return {
      mesh: k.mesh,
      updateVisuals: (dt, t) => k.updateVisuals(dt, t),
    };
  };
  return runGarage({ renderer, params, hud, labels, karts: makeKart });
}

let app;
if (view === 'garage') app = params.get('kart') === '1' ? await runGarageKarts() : runGarage({ renderer, params, hud, labels });
else app = await runDrive();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  app.update(dt);
  renderer.render(app.scene, app.camera);
  requestAnimationFrame(frame);
}
app.update(0);
renderer.render(app.scene, app.camera);
requestAnimationFrame(frame);
