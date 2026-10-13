/**
 * UI sandbox: instantiates the real UI with contract-shaped mock data.
 *
 * URL params
 *   screen = title|main|engine|character|track|cup|settings|loading|hud|pause|
 *            results|results-gp|results-gp-final|ceremony|results-tt|results-tt-slow|
 *            countdown|finish|lap|final|intro
 *   t      = ms after setup at which every animation is frozen (deterministic screenshots)
 *   device = gamepad (show gamepad prompts)
 *   mock=1 = force mock data even when src/track / src/kart exist
 *   keys   = comma separated INPUT_MENU actions replayed at start (e.g. keys=down,down,confirm)
 *   HUD:   item=<ITEMS value> roulette=1 wrong=1 spiny=1 pos=N drift=0..3 boost=1 coins=N speed=N
 *   loading: p=0..1
 */
import { EventBus } from '../src/core/EventBus.js';
import { Input } from '../src/core/Input.js';
import { EVENTS, ITEMS, GAME_MODES, GP_POINTS, RECORDS_STORAGE_KEY } from '../src/core/constants.js';
import { UI } from '../src/ui/index.js';
import { itemIconSVG, trophySVG } from '../src/ui/icons.js';
import { portraitSVG } from '../src/ui/portraits.js';

const params = new URLSearchParams(location.search);
const screen = params.get('screen') || 'title';
const freezeAt = params.has('t') ? Number(params.get('t')) : null;
let frozen = false;
/**
 * Scheduled sandbox event. With ?t= every scheduled event fires (almost) immediately, then all
 * animations are seeked to t ms and paused, so headless screenshots are deterministic.
 */
const later = (ms, fn) => setTimeout(() => {
  if (!frozen) fn();
}, freezeAt !== null ? Math.min(ms, 20) : ms);

// ---------------------------------------------------------------------------
// Mock data (contract shapes)
// ---------------------------------------------------------------------------

const MOCK_CHARACTERS = [
  { id: 'blaze', name: 'Blaze', tagline: 'Born at full throttle.', weightClass: 'medium', stats: { speed: 3.5, accel: 3, handling: 3, weight: 3, offroad: 2.5 }, colors: { primary: 0xff4b3a, secondary: 0x7a1020, accent: 0xffd23f, skin: 0xffd0a8 }, cssColor: '#ff4b3a' },
  { id: 'pip', name: 'Pip', tagline: 'Small kart, big dreams.', weightClass: 'light', stats: { speed: 2, accel: 5, handling: 4.5, weight: 1, offroad: 4 }, colors: { primary: 0x5ee05a, secondary: 0x1b6b2e, accent: 0xffffff, skin: 0xffe0bd }, cssColor: '#5ee05a' },
  { id: 'grizz', name: 'Grizz', tagline: 'The mountain bear that never brakes.', weightClass: 'heavy', stats: { speed: 5, accel: 1.5, handling: 2, weight: 5, offroad: 3 }, colors: { primary: 0x8a5a32, secondary: 0x3a2412, accent: 0xff9a1f, skin: 0xc58a5a }, cssColor: '#a8693a' },
  { id: 'nova', name: 'Nova', tagline: 'Stardust in her exhaust.', weightClass: 'medium', stats: { speed: 3, accel: 3.5, handling: 4, weight: 2.5, offroad: 3 }, colors: { primary: 0xa05cff, secondary: 0x3a1a7a, accent: 0x22d3ff, skin: 0xffd6c4 }, cssColor: '#a05cff' },
  { id: 'bolt', name: 'Bolt-9', tagline: 'Robot racer, zero fear subroutines.', weightClass: 'heavy', stats: { speed: 4.5, accel: 2, handling: 2.5, weight: 4.5, offroad: 2 }, colors: { primary: 0x9aa8c0, secondary: 0x2f3a52, accent: 0x22d3ff, skin: 0xd8e2f0 }, cssColor: '#9aa8c0' },
  { id: 'juniper', name: 'Juniper', tagline: 'Hops from first to first.', weightClass: 'light', stats: { speed: 2.5, accel: 4.5, handling: 5, weight: 1.5, offroad: 3.5 }, colors: { primary: 0xff7ac0, secondary: 0x8a1a5a, accent: 0xfff0f8, skin: 0xffe6d6 }, cssColor: '#ff7ac0' },
  { id: 'kit', name: 'Kit Vex', tagline: 'Sly fox. Slick drifts.', weightClass: 'medium', stats: { speed: 3.5, accel: 3.5, handling: 3.5, weight: 3, offroad: 2 }, colors: { primary: 0xff9a1f, secondary: 0x5a2a08, accent: 0x1d0f2e, skin: 0xffe2b8 }, cssColor: '#ff9a1f' },
  { id: 'rex', name: 'Rexford', tagline: 'Ancient horns, modern horsepower.', weightClass: 'heavy', stats: { speed: 4.5, accel: 2.5, handling: 1.5, weight: 5, offroad: 4.5 }, colors: { primary: 0x2a9d8f, secondary: 0x0f3d38, accent: 0xffd23f, skin: 0x7cc8a0 }, cssColor: '#2a9d8f' },
];

function shapePath(fn, count = 200) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const t = (i / count) * Math.PI * 2;
    pts.push(fn(t));
  }
  return pts;
}

const MOCK_PATHS = {
  'sunny-meadows': (n) => shapePath((t) => ({ x: Math.cos(t) * 320 + Math.cos(2 * t) * 40, z: Math.sin(t) * 190 + Math.sin(3 * t) * 30 }), n),
  'dune-drift': (n) => shapePath((t) => ({ x: Math.cos(t) * 300 + Math.cos(3 * t) * 70, z: Math.sin(t) * 260 - Math.sin(2 * t) * 90 }), n),
  'frostbite-peaks': (n) => shapePath((t) => ({ x: Math.cos(t) * (260 + 60 * Math.sin(4 * t)), z: Math.sin(t) * (220 + 40 * Math.cos(3 * t)) }), n),
  'neon-skyway': (n) => shapePath((t) => ({ x: Math.sin(t) * 360, z: Math.sin(2 * t) * 170 + Math.cos(t) * 40 }), n),
};

const MOCK_TRACKS = [
  { id: 'sunny-meadows', name: 'Sunny Meadows', cupId: 'turbo', theme: 'meadow', description: 'Rolling green hills, windmills and a sparkling lake. The perfect warm-up.', laps: 3, difficulty: 1, accentColor: '#5ee05a', musicTheme: 'meadow' },
  { id: 'dune-drift', name: 'Dune Drift', cupId: 'turbo', theme: 'desert', description: 'Scorching canyon switchbacks, cacti and a monster ramp over the mesa.', laps: 3, difficulty: 2, accentColor: '#ffae1f', musicTheme: 'desert' },
  { id: 'frostbite-peaks', name: 'Frostbite Peaks', cupId: 'turbo', theme: 'snow', description: 'Icy hairpins, pine forests and a tunnel through the mountain at sunset.', laps: 3, difficulty: 2, accentColor: '#7fd8ff', musicTheme: 'snow' },
  { id: 'neon-skyway', name: 'Neon Skyway', cupId: 'turbo', theme: 'neon', description: 'A glowing ribbon among the stars. Some sections have no walls — mind the edge!', laps: 3, difficulty: 3, accentColor: '#ff3df0', musicTheme: 'neon' },
];
const MOCK_CUPS = [{ id: 'turbo', name: 'Turbo Cup', trackIds: MOCK_TRACKS.map((t) => t.id) }];
const mockPreviewPath = (id, n = 200) => (MOCK_PATHS[id] ? MOCK_PATHS[id](n) : MOCK_PATHS['sunny-meadows'](n));

async function loadData() {
  const data = { characters: MOCK_CHARACTERS, tracks: MOCK_TRACKS, cups: MOCK_CUPS, getTrackPreviewPath: mockPreviewPath, source: 'mock' };
  if (params.get('mock') === '1') return data;
  // Plain dynamic imports (not import.meta.glob) so that, with ?mock=1, edits to other modules never
  // hot-reload this page.
  try {
    const m = await import(/* @vite-ignore */ `${'/src/track/'}TrackDefinitions.js`);
    if (Array.isArray(m.TRACKS) && m.TRACKS.length && typeof m.getTrackPreviewPath === 'function') {
      data.tracks = m.TRACKS;
      data.cups = m.CUPS || MOCK_CUPS;
      data.getTrackPreviewPath = m.getTrackPreviewPath;
      data.source = 'real-tracks';
    }
  } catch (err) {
    console.warn('[ui-sandbox] real tracks unavailable, using mocks', err?.message);
  }
  try {
    const m = await import(/* @vite-ignore */ `${'/src/kart/'}characters.js`);
    if (Array.isArray(m.CHARACTERS) && m.CHARACTERS.length) {
      data.characters = m.CHARACTERS;
      data.source += '+real-chars';
    }
  } catch (err) {
    console.warn('[ui-sandbox] real characters unavailable, using mocks', err?.message);
  }
  return data;
}

// ---------------------------------------------------------------------------

const bus = new EventBus();
const origEmit = bus.emit.bind(bus);
bus.emit = (name, payload = {}) => {
  if (name.startsWith('ui:')) {
    const safe = {};
    for (const k in payload) safe[k] = typeof payload[k] === 'object' && payload[k] !== null && k !== 'settings' ? '[obj]' : payload[k];
    console.log(`[ui-event] ${name} ${JSON.stringify(safe)}`);
  }
  origEmit(name, payload);
};

const data = await loadData();
console.log(`[ui-sandbox] data source: ${data.source}`);
const input = new Input({ bus });

const ui = new UI(document.getElementById('ui-root'), {
  bus,
  characters: data.characters,
  tracks: data.tracks,
  cups: data.cups,
  getTrackPreviewPath: data.getTrackPreviewPath,
  settings: { showFps: params.get('fps') === '1' },
});
window.ui = ui;
window.bus = bus;
if (params.get('device') === 'gamepad') bus.emit(EVENTS.INPUT_DEVICE, { device: 'gamepad' });

const scene = document.getElementById('fake-scene');
bus.on(EVENTS.UI_SCREEN, ({ screen: s }) => scene.classList.toggle('showroom', s === 'character'));

// ---------------------------------------------------------------------------
// HUD simulation
// ---------------------------------------------------------------------------

const ROLL_ITEMS = [ITEMS.TRIPLE_MUSHROOM, ITEMS.RED_SHELL, ITEMS.GOLDEN_MUSHROOM, ITEMS.BANANA, ITEMS.STAR, ITEMS.TRIPLE_GREEN_SHELL, ITEMS.LIGHTNING, ITEMS.BOMB, ITEMS.SPINY_SHELL];
const track = data.tracks[1] || data.tracks[0];
const path = data.getTrackPreviewPath(track.id, 200);
let bounds = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
for (const p of path) {
  bounds.minX = Math.min(bounds.minX, p.x);
  bounds.maxX = Math.max(bounds.maxX, p.x);
  bounds.minZ = Math.min(bounds.minZ, p.z);
  bounds.maxZ = Math.max(bounds.maxZ, p.z);
}
const PLAYER = 3;
const sim = {
  running: false,
  t0: performance.now(),
  hud: {
    position: 4, racerCount: 8, lap: 2, totalLaps: 3, raceTime: 61.234, lapTime: 20.1, bestLap: 40.882, lastLapTime: 41.15,
    speed: 0, coins: 6, driftLevel: 0, boosting: false,
    item: { type: null, count: 0, roulette: false }, mode: GAME_MODES.VS,
    minimap: { path, bounds, karts: [], markers: [] }, wrongWay: false, finished: false,
  },
  karts: data.characters.slice(0, 8).map((c, i) => ({ x: 0, z: 0, heading: 0, color: c.cssColor, isPlayer: i === PLAYER, position: i + 1, prog: 0.35 - i * 0.025, v: 0.05 + (i % 3) * 0.002 })),
  playerKart: { isPlayer: true, racePosition: 4, name: 'You' },
};

function pointAt(prog) {
  const n = path.length;
  const f = (((prog % 1) + 1) % 1) * n;
  const i = Math.floor(f);
  const a = path[i % n];
  const b = path[(i + 1) % n];
  const k = f - i;
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, heading: Math.atan2(b.x - a.x, b.z - a.z) };
}

function stepSim(now) {
  const t = (now - sim.t0) / 1000;
  const h = sim.hud;
  h.raceTime = 61.234 + t;
  h.lapTime = 20.1 + t;
  h.speed = params.has('speed') ? Number(params.get('speed')) : Math.round(96 + Math.sin(t * 0.9) * 30 + (h.boosting ? 30 : 0));
  h.boosting = params.get('boost') === '1' || (t % 9 > 6 && t % 9 < 7.4);
  h.driftLevel = params.has('drift') ? Number(params.get('drift')) : Math.floor((t % 6) / 1.5) % 4;
  h.coins = params.has('coins') ? Number(params.get('coins')) : 6 + (Math.floor(t / 3) % 5);
  h.wrongWay = params.get('wrong') === '1';
  // karts
  for (const k of sim.karts) {
    k.prog += k.v * 0.016;
    const p = pointAt(k.prog);
    k.x = p.x;
    k.z = p.z;
    k.heading = p.heading;
  }
  const order = [...sim.karts].sort((a, b) => b.prog - a.prog);
  order.forEach((k, i) => (k.position = i + 1));
  h.minimap.karts = sim.karts;
  h.position = params.has('pos') ? Number(params.get('pos')) : sim.karts[PLAYER].position;
  h.minimap.markers = [
    { ...pointAt(0.1), type: ITEMS.BANANA },
    { ...pointAt(0.55), type: ITEMS.GREEN_SHELL },
    { ...pointAt(0.62), type: ITEMS.BANANA },
    { ...pointAt(0.8), type: ITEMS.BOMB },
  ];
  // item roulette cycle (6 s): 0–2.4 roulette, 2.4–5 holding, 5–6 empty
  if (params.has('item')) {
    h.item.type = params.get('item');
    h.item.count = Number(params.get('count')) || (h.item.type.startsWith('triple') ? 3 : 1);
    h.item.roulette = params.get('roulette') === '1';
  } else if (params.get('roulette') === '1') {
    h.item.roulette = true;
    h.item.type = null;
  } else {
    const cyc = t % 6;
    const k = Math.floor(t / 6) % ROLL_ITEMS.length;
    const type = ROLL_ITEMS[k];
    if (cyc < 2.4) {
      h.item.roulette = true;
      h.item.type = null;
      h.item.count = 0;
    } else if (cyc < 5) {
      h.item.roulette = false;
      h.item.type = type;
      const triple = type.startsWith('triple');
      h.item.count = triple ? 3 - Math.floor(Math.max(0, cyc - 3.2) / 0.6) : 1;
      if (h.item.count < 1) {
        h.item.type = null;
        h.item.count = 0;
      }
    } else {
      h.item.roulette = false;
      h.item.type = null;
      h.item.count = 0;
    }
  }
}

function frame(now) {
  input.update();
  if (sim.running) {
    stepSim(now);
    ui.updateHUD(sim.hud);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

function startHUD(mode = GAME_MODES.VS) {
  sim.hud.mode = mode;
  ui.showHUD({ mode, totalLaps: 3, racerCount: mode === GAME_MODES.TIME_TRIAL ? 1 : 8, trackName: track.name, playerCharacter: data.characters[0] });
  sim.running = true;
  sim.t0 = performance.now();
  stepSim(performance.now());
  ui.updateHUD(sim.hud);
}

// ---------------------------------------------------------------------------
// Results mocks
// ---------------------------------------------------------------------------

function mockStandings({ gp = false, raceIndex = 1 } = {}) {
  const chars = data.characters.slice(0, 8);
  const base = 92.416;
  const playerPos = 2;
  const order = [1, 3, 0, 4, 2, 6, 5, 7];
  return order.map((ci, i) => {
    const c = chars[ci % chars.length];
    const position = i + 1;
    const isPlayer = position === playerPos;
    const points = GP_POINTS[i] || 0;
    const prevTotal = [24, 30, 22, 14, 20, 8, 6, 3][i] * (raceIndex >= 3 ? 1.6 : 1) | 0;
    return {
      position,
      name: isPlayer ? c.name : c.name,
      characterId: c.id,
      cssColor: c.cssColor,
      isPlayer,
      finishTime: base + i * 1.37 + (i > 5 ? 2.1 : 0),
      bestLap: 29.8 + i * 0.3,
      points: gp ? points : 0,
      totalPoints: gp ? prevTotal + points : 0,
    };
  });
}

function resultsPayload(kind) {
  if (kind === 'tt' || kind === 'tt-slow') {
    const record = kind === 'tt';
    const st = mockStandings().slice(0, 1).map((s) => ({ ...s, position: 1, isPlayer: true }));
    return {
      mode: GAME_MODES.TIME_TRIAL, trackName: track.name, cupName: null, raceIndex: 0, raceCount: 1, gpComplete: false,
      standings: st,
      timeTrial: { time: record ? 88.512 : 95.03, bestLap: 29.104, lapTimes: [30.122, 29.104, 29.286], isRecord: record, previousRecord: 90.044 },
    };
  }
  const gp = kind === 'gp' || kind === 'gp-final';
  const raceIndex = kind === 'gp-final' ? 3 : 1;
  return {
    mode: gp ? GAME_MODES.GRAND_PRIX : GAME_MODES.VS,
    trackName: track.name,
    cupName: gp ? data.cups[0].name : null,
    raceIndex,
    raceCount: 4,
    gpComplete: kind === 'gp-final',
    standings: mockStandings({ gp, raceIndex }),
    timeTrial: null,
  };
}

// ---------------------------------------------------------------------------
// Screen router
// ---------------------------------------------------------------------------

const playerKart = sim.playerKart;
const flowDefaults = () => {
  ui.flow.mode = params.get('mode') || GAME_MODES.VS;
  ui.flow.engineClass = Number(params.get('cc')) || 150;
  ui.flow.characterId = (data.characters[Number(params.get('char')) || 0] || data.characters[0]).id;
  ui.flow.trackId = (data.tracks[Number(params.get('track')) || 0] || data.tracks[0]).id;
};

switch (screen) {
  case 'title':
    ui.showTitle();
    break;
  case 'main':
    ui.showMainMenu();
    break;
  case 'engine':
  case 'character':
  case 'track':
  case 'cup':
  case 'settings':
    flowDefaults();
    if (screen === 'cup') ui.flow.mode = GAME_MODES.GRAND_PRIX;
    ui.go(screen);
    break;
  case 'loading': {
    flowDefaults();
    const t = data.tracks[params.has('track') ? Number(params.get('track')) : 3] || data.tracks[0];
    const p = params.has('p') ? Number(params.get('p')) : null;
    ui.showLoading(p ?? 0, t.name);
    if (p === null) {
      let prog = 0;
      const iv = setInterval(() => {
        prog = Math.min(1, prog + 0.07);
        ui.showLoading(prog, t.name);
        if (prog >= 1) clearInterval(iv);
      }, 220);
    }
    break;
  }
  case 'hud':
    startHUD(params.get('mode') || GAME_MODES.VS);
    if (params.get('spiny') === '1') later(300, () => bus.emit(EVENTS.ITEM_SPINY_WARNING, { target: playerKart }));
    break;
  case 'countdown':
    startHUD();
    sim.running = false;
    if (params.has('n')) later(50, () => bus.emit(EVENTS.RACE_COUNTDOWN, { count: Number(params.get('n')) }));
    else [3, 2, 1, 0].forEach((c, i) => later(200 + i * 1000, () => bus.emit(EVENTS.RACE_COUNTDOWN, { count: c })));
    break;
  case 'intro':
    startHUD(GAME_MODES.GRAND_PRIX);
    sim.running = false;
    later(200, () => bus.emit(EVENTS.RACE_INTRO, { track: { id: track.id, name: track.name } }));
    break;
  case 'lap':
  case 'final':
    startHUD();
    later(300, () => bus.emit(EVENTS.RACE_LAP, { kart: playerKart, lap: screen === 'final' ? 3 : 2, totalLaps: 3, isFinalLap: screen === 'final', lapTime: 41.2 }));
    break;
  case 'finish':
    startHUD();
    later(300, () => {
      sim.hud.finished = true;
      bus.emit(EVENTS.RACE_FINISH, { kart: playerKart, position: Number(params.get('pos')) || 1, time: 120.5 });
    });
    break;
  case 'pause':
    startHUD();
    later(200, () => ui.showPause());
    break;
  case 'results':
    flowDefaults();
    ui.showResults(resultsPayload('vs'));
    break;
  case 'results-gp':
    flowDefaults();
    ui.flow.mode = GAME_MODES.GRAND_PRIX;
    ui.showResults(resultsPayload('gp'));
    break;
  case 'results-gp-final':
  case 'ceremony':
    flowDefaults();
    ui.flow.mode = GAME_MODES.GRAND_PRIX;
    ui.showResults(resultsPayload('gp-final'));
    if (screen === 'ceremony') later(150, () => ui.screens.results.showCeremony());
    break;
  case 'results-tt':
  case 'results-tt-slow':
    flowDefaults();
    ui.flow.mode = GAME_MODES.TIME_TRIAL;
    try {
      localStorage.removeItem(RECORDS_STORAGE_KEY);
    } catch {
      /* ignore */
    }
    ui.showResults(resultsPayload(screen === 'results-tt' ? 'tt' : 'tt-slow'));
    break;
  case 'icons': {
    // QA sheet: every item icon (+ triple counts), trophies and all portraits, large
    const sheet = document.createElement('div');
    sheet.style.cssText = 'position:fixed;inset:0;background:#1b1450;display:flex;flex-wrap:wrap;gap:18px;padding:24px;align-content:flex-start;overflow:auto;';
    const cell = (html, label) => {
      const d = document.createElement('div');
      d.style.cssText = 'width:120px;display:flex;flex-direction:column;align-items:center;font:800 12px Nunito,sans-serif;color:#fff;gap:6px;';
      d.innerHTML = `<div style="width:110px;height:110px;border-radius:16px;overflow:hidden;background:#2c2370">${html}</div><span>${label}</span>`;
      sheet.appendChild(d);
    };
    for (const type of Object.values(ITEMS)) cell(itemIconSVG(type), type);
    cell(itemIconSVG(ITEMS.TRIPLE_GREEN_SHELL).replace('class="tk-icon tk-triple ', 'data-count="2" class="tk-icon tk-triple '), 'triple ×2');
    for (const p of [1, 2, 3]) cell(trophySVG(p), `trophy ${p}`);
    for (const c of data.characters) cell(portraitSVG(c), c.name);
    document.body.appendChild(sheet);
    break;
  }
  default:
    ui.showTitle();
}

// Scripted menu input (e.g. keys=down,down,confirm)
if (params.has('keys')) {
  const keys = params.get('keys').split(',').filter(Boolean);
  keys.forEach((action, i) => later(400 + i * 260, () => bus.emit(EVENTS.INPUT_MENU, { action })));
}

// Game-side reactions so the flow is testable end-to-end in the sandbox
bus.on(EVENTS.UI_START_RACE, (cfg) => {
  const t = data.tracks.find((x) => x.id === cfg.trackId) || data.tracks[0];
  let p = 0;
  setTimeout(() => {
    ui.hideAll();
    ui.showLoading(0, t.name);
    const iv = setInterval(() => {
      p += 0.1;
      ui.showLoading(Math.min(1, p), t.name);
      if (p >= 1) {
        clearInterval(iv);
        ui.hideLoading();
        startHUD(cfg.mode);
        bus.emit(EVENTS.RACE_INTRO, { track: t });
      }
    }, 200);
  }, 16);
});
bus.on(EVENTS.INPUT_MENU, ({ action }) => {
  if ((action === 'pause' || action === 'back') && ui.screen === 'hud') setTimeout(() => ui.showPause(), 16);
});
bus.on(EVENTS.UI_RESUME, () => setTimeout(() => ui.hidePause(), 16));
bus.on(EVENTS.UI_QUIT, () =>
  setTimeout(() => {
    sim.running = false;
    ui.hidePause();
    ui.hideHUD();
    ui.hideAll();
    ui.showMainMenu();
  }, 16),
);

if (freezeAt !== null) {
  setTimeout(() => {
    frozen = true;
    sim.running = false;
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = freezeAt;
    }
    // cancel every pending timer (UI overlay auto-hides etc.) so the frozen frame stays put
    const maxId = setTimeout(() => {}, 0);
    for (let id = 0; id <= maxId; id++) {
      clearTimeout(id);
      clearInterval(id);
    }
    console.log(`[ui-sandbox] animations seeked to ${freezeAt}ms and frozen`);
  }, 150);
}
