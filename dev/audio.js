/**
 * Audio sandbox.
 *   default      : buttons to audition every SFX / music track / engine states.
 *   ?offline=1   : renders every SFX, a few seconds of every music track, the
 *                  stings, the engine loop and a full mix through
 *                  OfflineAudioContexts and logs peak / RMS / NaN checks.
 */
import { EventBus } from '../src/core/EventBus.js';
import { EVENTS, GAME_STATES } from '../src/core/constants.js';
import { AudioEngine } from '../src/audio/index.js';
import { SFX, SFX_NAMES, SFX_TEST_OPTS } from '../src/audio/sfx.js';
import { SONGS, STINGS } from '../src/audio/songs.js';
import { SongPlayer, playSting, compileSong, compileWarnings } from '../src/audio/MusicPlayer.js';
import { createReverb } from '../src/audio/synth.js';
import { PlayerEngine } from '../src/audio/EngineSounds.js';

const params = new URLSearchParams(location.search);
const app = document.getElementById('app');
const status = document.getElementById('status');

// ---------------------------------------------------------------------------
// Offline analysis
// ---------------------------------------------------------------------------
const SR = 44100;

function analyze(buf) {
  let peak = 0, sum = 0, nan = 0, n = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (!Number.isFinite(v)) {
        nan++;
        continue;
      }
      const a = Math.abs(v);
      if (a > peak) peak = a;
      sum += v * v;
      n++;
    }
  }
  return { peak, rms: Math.sqrt(sum / Math.max(1, n)), nan };
}

function verdict(r, { minPeak = 0.01, maxPeak = 1.0 } = {}) {
  if (r.nan > 0) return 'FAIL';
  if (r.peak < minPeak) return 'FAIL';
  if (r.peak > maxPeak) return 'FAIL';
  if (r.peak > 0.95) return 'WARN';
  return 'OK';
}

async function renderSfx(name) {
  const dur = 3.2;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
  const g = ctx.createGain();
  g.connect(ctx.destination);
  const opts = { pitch: 1, level: 1, ...(SFX_TEST_OPTS[name] || {}) };
  const len = SFX[name](ctx, g, 0.02, opts);
  const buf = await ctx.startRendering();
  return { ...analyze(buf), len };
}

async function renderSong(id, seconds = 9, opts = {}) {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
  const bus = ctx.createGain();
  bus.gain.value = 0.8 * 0.55; // musicBus at default musicVolume
  bus.connect(ctx.destination);
  const rv = createReverb(ctx, ctx.destination, { seconds: 2.0, decay: 2.6, wet: 0.32 });
  const p = new SongPlayer(ctx, bus, id, { reverb: rv.input, startTime: 0.02, ...opts });
  p.schedule(seconds);
  const buf = await ctx.startRendering();
  return analyze(buf);
}

async function renderSting(name) {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * 5), SR);
  const bus = ctx.createGain();
  bus.gain.value = 0.8 * 0.55 * 1.1;
  bus.connect(ctx.destination);
  const rv = createReverb(ctx, ctx.destination, { seconds: 2.0, decay: 2.6, wet: 0.32 });
  const len = playSting(ctx, bus, name, 0.02, rv.input);
  const buf = await ctx.startRendering();
  return { ...analyze(buf), len };
}

async function renderEngine() {
  const seconds = 6;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
  const bus = ctx.createGain();
  bus.gain.value = 0.9 * 0.8;
  bus.connect(ctx.destination);
  const eng = new PlayerEngine(ctx, bus);
  const kart = {
    speed: 0, maxSpeed: 30, isBoosting: false, isAirborne: false, isDrifting: false, driftLevel: 0,
    surface: 'road', frozen: true, isSpunOut: false, controls: { throttle: 1 },
  };
  const step = 0.05;
  for (let t = step; t < seconds; t += step) {
    ctx.suspend(t).then(() => {
      const tt = ctx.currentTime;
      kart.frozen = tt < 1.2;
      if (!kart.frozen) kart.speed = Math.min(34, kart.speed + 9 * step);
      kart.isDrifting = tt > 3 && tt < 4.5;
      kart.driftLevel = tt > 3.9 ? 2 : tt > 3.4 ? 1 : 0;
      kart.isBoosting = tt > 4.5 && tt < 5.5;
      kart.surface = tt > 5.5 ? 'offroad' : 'road';
      eng.update(step, kart, true);
      ctx.resume();
    });
  }
  const buf = await ctx.startRendering();
  return analyze(buf);
}

/** Full chain (compressor + limiter) with music and a pile of SFX on top. */
async function renderFullMix() {
  const seconds = 6;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * seconds), SR);
  const master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 10;
  comp.ratio.value = 3.5;
  comp.attack.value = 0.004;
  comp.release.value = 0.22;
  const lim = ctx.createDynamicsCompressor();
  lim.threshold.value = -2.5;
  lim.knee.value = 0;
  lim.ratio.value = 20;
  lim.attack.value = 0.001;
  lim.release.value = 0.08;
  master.connect(comp);
  comp.connect(lim);
  lim.connect(ctx.destination);
  const music = ctx.createGain();
  music.gain.value = 0.8 * 0.55;
  music.connect(master);
  const sfx = ctx.createGain();
  sfx.gain.value = 0.9;
  sfx.connect(master);
  const rv = createReverb(ctx, master, { seconds: 2.0, decay: 2.6, wet: 0.32 });
  const p = new SongPlayer(ctx, music, 'neon', { reverb: rv.input, startTime: 0.02, skipIntro: true });
  p.schedule(seconds);
  // worst case: explosion + lightning + boost + item hit at once
  SFX.explosion(ctx, sfx, 1.0, { level: 1 });
  SFX.lightning(ctx, sfx, 1.02, { level: 1 });
  SFX.boost(ctx, sfx, 1.05, { level: 1 });
  SFX.itemHit(ctx, sfx, 1.1, { level: 1 });
  SFX.wallHit(ctx, sfx, 1.12, { level: 1 });
  SFX.miniTurbo(ctx, sfx, 3, { level2: 3 });
  const buf = await ctx.startRendering();
  return analyze(buf);
}

async function runOffline() {
  status.textContent = 'Rendering offline checks…';
  const rows = [];
  const add = (kind, name, r, extra = '') => {
    const v = r.verdict;
    rows.push({ kind, name, ...r, v, extra });
    console.log(`[audio-test] ${kind}:${name} peak=${r.peak.toFixed(3)} rms=${r.rms.toFixed(4)} nan=${r.nan} ${v}${extra ? ' ' + extra : ''}`);
  };
  // compile every song (validates melodies sum to full bars)
  for (const id of Object.keys(SONGS)) compileSong(id, SONGS[id]);
  if (compileWarnings.length) for (const w of compileWarnings) console.warn('[audio-test] compile:', w);
  console.log(`[audio-test] songs compiled: ${Object.keys(SONGS).length}, warnings: ${compileWarnings.length}`);

  const t0 = performance.now();
  const songIds = Object.keys(SONGS);
  // everything renders in parallel (keeps headless capture fast)
  const jobs = [
    ...SFX_NAMES.map((n) => renderSfx(n).then((r) => ['sfx', n, r, { minPeak: 0.02 }, `len=${(r.len || 0).toFixed(2)}s`])),
    ...songIds.map((id) => renderSong(id, 9).then((r) => ['music', id, r, { minPeak: 0.05 }, ''])),
    ...['meadow', 'neon'].map((id) => renderSong(id, 6, { tempoMul: 1.12, transpose: 1, skipIntro: true })
      .then((r) => ['music', `${id}@finalLap`, r, { minPeak: 0.05 }, ''])),
    ...Object.keys(STINGS).map((n) => renderSting(n).then((r) => ['sting', n, r, { minPeak: 0.05 }, `len=${r.len.toFixed(2)}s`])),
    renderEngine().then((r) => ['loop', 'playerEngine', r, { minPeak: 0.03 }, '']),
    renderFullMix().then((r) => ['mix', 'fullChain', r, { minPeak: 0.1, maxPeak: 1.0 }, '']),
  ];
  const results = await Promise.all(jobs);
  for (const [kind, name, r, lim, extra] of results) add(kind, name, { ...r, verdict: verdict(r, lim) }, extra);

  const fail = rows.filter((r) => r.v === 'FAIL').length;
  const warn = rows.filter((r) => r.v === 'WARN').length;
  console.log(`[audio-test] DONE in ${((performance.now() - t0) / 1000).toFixed(1)}s: ${rows.length} checks, ${fail} fail, ${warn} warn, compileWarnings=${compileWarnings.length}`);
  status.textContent = `Offline checks: ${rows.length} renders, ${fail} FAIL, ${warn} WARN, compile warnings ${compileWarnings.length}`;
  const table = document.createElement('table');
  table.innerHTML = '<tr><th>kind</th><th>name</th><th>peak</th><th>rms</th><th>NaN</th><th>result</th><th></th></tr>' +
    rows.map((r) => `<tr><td>${r.kind}</td><td>${r.name}</td><td>${r.peak.toFixed(3)}</td><td>${r.rms.toFixed(4)}</td><td>${r.nan}</td><td class="${r.v}">${r.v}</td><td>${r.extra}</td></tr>`).join('');
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.appendChild(table);
  app.appendChild(panel);
  window.__audioTest = { rows, fail, warn, compileWarnings };
}

// ---------------------------------------------------------------------------
// Interactive audition
// ---------------------------------------------------------------------------
function buildUI() {
  const bus = new EventBus();
  const settings = { masterVolume: 0.8, musicVolume: 0.55, sfxVolume: 0.9 };
  const audio = new AudioEngine({ bus, settings });
  window.__audio = audio;
  const unlock = () => {
    audio.unlock();
    status.textContent = `AudioContext: ${audio.ctx ? audio.ctx.state : 'n/a'}`;
  };
  window.addEventListener('pointerdown', unlock);

  // fake player kart driven by sliders
  const kart = {
    isPlayer: true, index: 0, position: { x: 0, y: 0, z: 0 }, speed: 0, maxSpeed: 30, isBoosting: false, isAirborne: false,
    isDrifting: false, driftLevel: 0, surface: 'road', frozen: false, isSpunOut: false, starTimer: 0, isInvincible: false,
    controls: { throttle: 0 },
  };
  const ai = [1, 2, 3].map((i) => ({ isPlayer: false, index: i, position: { x: 0, y: 0, z: 0 }, speed: 22, maxSpeed: 30, controls: { throttle: 1 } }));
  const camera = { matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 2, 6, 1] } };
  let engineOn = false;
  let state = GAME_STATES.MENU;
  let t = 0;
  let last = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt;
    ai.forEach((k, i) => {
      const a = t * 0.6 + i * 2;
      k.position.x = Math.cos(a) * (10 + i * 6);
      k.position.z = Math.sin(a) * (10 + i * 6);
    });
    audio.update(dt, { camera, playerKart: engineOn ? kart : null, karts: engineOn ? [kart, ...ai] : [], state });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  const section = (title) => {
    const p = document.createElement('div');
    p.className = 'panel';
    p.innerHTML = `<h2>${title}</h2>`;
    const row = document.createElement('div');
    row.className = 'row';
    p.appendChild(row);
    app.appendChild(p);
    return row;
  };
  const button = (row, label, fn) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = (e) => {
      unlock();
      fn(b, e);
    };
    row.appendChild(b);
    return b;
  };

  const cols = document.createElement('div');
  cols.className = 'cols';
  app.appendChild(cols);

  const mrow = section('Music');
  for (const id of Object.keys(SONGS)) button(mrow, id, () => audio.playMusic(id));
  button(mrow, 'stop', () => audio.stopMusic(1));
  button(mrow, 'final lap ON', () => audio.setFinalLap(true));
  button(mrow, 'final lap OFF', () => audio.setFinalLap(false));
  button(mrow, 'star overlay', (b) => {
    kart.starTimer = kart.starTimer > 0 ? 0 : 7.5;
    kart.isInvincible = kart.starTimer > 0;
    engineOn = true;
    state = GAME_STATES.RACING;
    b.classList.toggle('on', kart.starTimer > 0);
  });
  button(mrow, 'finish 1st', () => bus.emit(EVENTS.RACE_FINISH, { kart, position: 1, time: 80 }));
  button(mrow, 'finish 6th', () => bus.emit(EVENTS.RACE_FINISH, { kart, position: 6, time: 95 }));

  const srow = section('SFX (direct)');
  for (const n of SFX_NAMES) button(srow, n, () => audio.play(n, { ...(SFX_TEST_OPTS[n] || {}) }));

  const erow = section('Events (through the bus, as the game emits them)');
  const ev = (label, name, payload) => button(erow, label, () => {
    state = GAME_STATES.RACING;
    bus.emit(name, payload());
  });
  ev('countdown 3', EVENTS.RACE_COUNTDOWN, () => ({ count: 3 }));
  ev('GO', EVENTS.RACE_COUNTDOWN, () => ({ count: 0 }));
  ev('lap 2', EVENTS.RACE_LAP, () => ({ kart, lap: 2, totalLaps: 3, isFinalLap: false }));
  ev('final lap', EVENTS.RACE_FINAL_LAP, () => ({ kart }));
  ev('roulette', EVENTS.ITEM_ROULETTE_START, () => ({ kart }));
  ev('roulette stop', EVENTS.ITEM_ROULETTE_STOP, () => ({ kart, type: 'mushroom' }));
  ev('drift lvl 1', EVENTS.KART_DRIFT_LEVEL, () => ({ kart, level: 1 }));
  ev('drift lvl 3', EVENTS.KART_DRIFT_LEVEL, () => ({ kart, level: 3 }));
  ev('mini-turbo 2', EVENTS.KART_DRIFT_END, () => ({ kart, level: 2 }));
  ev('boost pad', EVENTS.KART_BOOST, () => ({ kart, source: 'pad' }));
  ev('coin x', EVENTS.COIN_PICKUP, () => ({ kart, coins: 3 }));
  ev('AI explosion (far)', EVENTS.ITEM_EXPLOSION, () => ({ position: { x: 25, y: 0, z: -30 }, radius: 7 }));
  ev('AI wall hit (left)', EVENTS.KART_WALL_HIT, () => ({ kart: { ...ai[0], position: { x: -8, y: 0, z: 0 } }, impact: 14 }));
  ev('spiny warning', EVENTS.ITEM_SPINY_WARNING, () => ({ target: kart }));
  ev('lightning', EVENTS.ITEM_LIGHTNING, () => ({ kart: ai[0] }));
  ev('position up', EVENTS.RACE_POSITION_CHANGE, () => ({ kart, from: 4, to: 3 }));

  const krow = section('Engine');
  const slider = (label, min, max, step, val, fn) => {
    const l = document.createElement('label');
    l.textContent = label;
    const s = document.createElement('input');
    s.type = 'range';
    s.min = min;
    s.max = max;
    s.step = step;
    s.value = val;
    s.oninput = () => fn(Number(s.value));
    l.appendChild(s);
    krow.appendChild(l);
  };
  button(krow, 'engine on/off', (b) => {
    engineOn = !engineOn;
    state = engineOn ? GAME_STATES.RACING : GAME_STATES.MENU;
    b.classList.toggle('on', engineOn);
  });
  button(krow, 'countdown rev', (b) => {
    kart.frozen = !kart.frozen;
    b.classList.toggle('on', kart.frozen);
  });
  button(krow, 'drift', (b) => {
    kart.isDrifting = !kart.isDrifting;
    b.classList.toggle('on', kart.isDrifting);
  });
  button(krow, 'boost', (b) => {
    kart.isBoosting = !kart.isBoosting;
    b.classList.toggle('on', kart.isBoosting);
  });
  button(krow, 'offroad', (b) => {
    kart.surface = kart.surface === 'offroad' ? 'road' : 'offroad';
    b.classList.toggle('on', kart.surface === 'offroad');
  });
  slider('speed', 0, 38, 0.1, 0, (v) => (kart.speed = v));
  slider('throttle', 0, 1, 0.01, 0, (v) => (kart.controls.throttle = v));
  slider('drift lvl', 0, 3, 1, 0, (v) => (kart.driftLevel = v));

  const vrow = section('Volumes');
  for (const k of ['masterVolume', 'musicVolume', 'sfxVolume']) {
    const l = document.createElement('label');
    l.textContent = k;
    const s = document.createElement('input');
    s.type = 'range';
    s.min = 0;
    s.max = 1;
    s.step = 0.01;
    s.value = settings[k];
    s.oninput = () => audio.setVolumes({ [k]: Number(s.value) });
    l.appendChild(s);
    vrow.appendChild(l);
  }
}

// ---------------------------------------------------------------------------
// Realtime self-test: drives the real AudioEngine through the bus and measures
// the live master output with an AnalyserNode (works headless with autoplay allowed).
// ---------------------------------------------------------------------------
async function runSelfTest() {
  status.textContent = 'Realtime self-test running…';
  const bus = new EventBus();
  const audio = new AudioEngine({ bus, settings: { masterVolume: 0.8, musicVolume: 0.55, sfxVolume: 0.9 } });
  const errors = [];
  const origErr = console.error;
  console.error = (...a) => {
    errors.push(a.join(' '));
    origErr(...a);
  };
  // calls before unlock must be harmless
  audio.play('coin');
  audio.playMusic('meadow');
  audio.setFinalLap(false);
  audio.update(0.016, { camera: null, playerKart: null, karts: [], state: GAME_STATES.MENU });
  audio.unlock();
  await new Promise((r) => setTimeout(r, 200));
  const ctx = audio.ctx;
  console.log(`[audio-selftest] context state=${ctx?.state} sampleRate=${ctx?.sampleRate}`);
  const an = ctx.createAnalyser();
  an.fftSize = 2048;
  audio.limiter.connect(an);
  const buf = new Float32Array(an.fftSize);
  const level = () => {
    an.getFloatTimeDomainData(buf);
    let s = 0, p = 0;
    for (const v of buf) {
      s += v * v;
      p = Math.max(p, Math.abs(v));
    }
    return { rms: Math.sqrt(s / buf.length), peak: p };
  };
  const kart = {
    isPlayer: true, index: 0, position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 20 }, speed: 20, maxSpeed: 30,
    isBoosting: false, isAirborne: false, isDrifting: false, driftLevel: 0, surface: 'road', frozen: false,
    isSpunOut: false, starTimer: 0, isInvincible: false, controls: { throttle: 1 }, racePosition: 2,
  };
  const ai = [1, 2, 3, 4, 5].map((i) => ({ isPlayer: false, index: i, position: { x: i * 3, y: 0, z: -i * 4 }, speed: 22, maxSpeed: 30, controls: { throttle: 1 } }));
  const camera = { matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 2, 6, 1] } };
  let state = GAME_STATES.RACING;
  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    audio.update(dt, { camera, playerKart: kart, karts: [kart, ...ai], state });
  }, 16);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const report = (label) => {
    const l = level();
    console.log(`[audio-selftest] ${label}: rms=${l.rms.toFixed(4)} peak=${l.peak.toFixed(3)} music=${audio.music.currentId} overlay=${audio.music.overlayActive}`);
    return l;
  };
  bus.emit(EVENTS.GAME_STATE, { state: GAME_STATES.RACING, previous: GAME_STATES.COUNTDOWN });
  await wait(1500);
  const m1 = report('meadow + engine');
  // fire every event type once
  const E = EVENTS;
  const p = { x: 4, y: 0, z: -6 };
  const fire = [
    [E.RACE_COUNTDOWN, { count: 3 }], [E.RACE_COUNTDOWN, { count: 0 }], [E.RACE_LAP, { kart, lap: 2, totalLaps: 3, isFinalLap: false }],
    [E.RACE_POSITION_CHANGE, { kart, from: 3, to: 2 }], [E.RACE_WRONG_WAY, { kart, wrongWay: true }],
    [E.KART_HOP, { kart }], [E.KART_DRIFT_START, { kart, direction: 1 }], [E.KART_DRIFT_LEVEL, { kart, level: 2 }],
    [E.KART_DRIFT_END, { kart, level: 2 }], [E.KART_BOOST, { kart, source: 'miniturbo' }], [E.KART_BOOST, { kart, source: 'pad' }],
    [E.KART_BOOST, { kart, source: 'mushroom' }], [E.KART_LAND, { kart, impact: 9 }], [E.KART_TRICK, { kart }],
    [E.KART_WALL_HIT, { kart, impact: 12, point: p }], [E.KART_BUMP, { kartA: kart, kartB: ai[0], impact: 8, point: p }],
    [E.KART_SPINOUT, { kart, cause: 'banana' }], [E.KART_LAUNCHED, { kart: ai[1], cause: 'bomb' }], [E.KART_SHRINK, { kart: ai[2], duration: 6 }],
    [E.KART_FALL, { kart: ai[3] }], [E.KART_RESPAWN, { kart: ai[3] }], [E.KART_START_STALL, { kart }], [E.KART_SURFACE, { kart, surface: 'offroad', previous: 'road' }],
    [E.ITEM_BOX_HIT, { kart, position: p }], [E.ITEM_ROULETTE_START, { kart }], [E.ITEM_USE, { kart, type: 'green_shell', position: p }],
    [E.ITEM_USE, { kart: ai[0], type: 'banana', position: p }], [E.ITEM_USE, { kart, type: 'spiny_shell', position: p }],
    [E.ITEM_HIT, { kart: ai[1], type: 'red_shell', attacker: kart, position: p }], [E.ITEM_BLOCKED, { kart, type: 'green_shell', position: p }],
    [E.ITEM_DESTROYED, { type: 'banana', position: p }], [E.ITEM_EXPLOSION, { position: p, radius: 7, type: 'bomb' }],
    [E.ITEM_SHELL_BOUNCE, { position: p }], [E.ITEM_SPINY_WARNING, { target: kart }], [E.COIN_PICKUP, { kart, coins: 3, position: p }],
    [E.COIN_PICKUP, { kart, coins: 4, position: p }], [E.COIN_LOST, { kart, amount: 3, position: p }],
    [E.UI_NAVIGATE, {}], [E.UI_CONFIRM, {}], [E.UI_BACK, {}], [E.UI_SETTINGS, { settings: { masterVolume: 0.8, musicVolume: 0.55, sfxVolume: 0.9 } }],
  ];
  for (const [name, payload] of fire) {
    bus.emit(name, payload);
    await wait(40);
  }
  await wait(600);
  bus.emit(E.ITEM_ROULETTE_STOP, { kart, type: 'banana' });
  const m2 = report('after event barrage');
  bus.emit(E.ITEM_LIGHTNING, { kart: ai[0] });
  kart.isDrifting = true;
  kart.driftLevel = 3;
  kart.isBoosting = true;
  await wait(700);
  report('lightning + drift + boost');
  kart.isDrifting = false;
  kart.isBoosting = false;
  // final lap
  bus.emit(E.RACE_FINAL_LAP, { kart });
  await wait(3200);
  const fl = audio.music.current;
  const m3 = report(`final lap (tempoMul=${fl?.tempoMul} transpose=${fl?.transpose})`);
  // star overlay
  kart.starTimer = 3;
  kart.isInvincible = true;
  bus.emit(E.KART_STAR_START, { kart, duration: 3 });
  await wait(1200);
  const m4 = report('star overlay');
  kart.starTimer = 0;
  kart.isInvincible = false;
  bus.emit(E.KART_STAR_END, { kart });
  await wait(900);
  report('star ended');
  // pause muffles music, engines stop
  state = GAME_STATES.PAUSED;
  bus.emit(E.GAME_STATE, { state, previous: GAME_STATES.RACING });
  await wait(700);
  report('paused');
  state = GAME_STATES.RACING;
  bus.emit(E.GAME_STATE, { state, previous: GAME_STATES.PAUSED });
  // finish
  bus.emit(E.RACE_FINISH, { kart, position: 1, time: 88 });
  await wait(1500);
  const m5 = report('finish fanfare');
  state = GAME_STATES.RESULTS;
  audio.playMusic('victory');
  await wait(4500);
  const m6 = report('victory');
  audio.stopMusic(0.5);
  for (const id of ['title', 'menu', 'desert', 'snow', 'neon', 'results']) {
    audio.playMusic(id, { fade: 0.3 });
    await wait(900);
    report(`switch ${id}`);
  }
  clearInterval(timer);
  audio.dispose();
  const ok = errors.length === 0 && m1.rms > 0.005 && m2.rms > 0.005 && m3.rms > 0.005 && m4.rms > 0.005 && m5.rms > 0.003 && m6.rms > 0.005;
  console.log(`[audio-selftest] DONE ${ok ? 'PASS' : 'FAIL'} errors=${errors.length}`);
  status.textContent = `Realtime self-test ${ok ? 'PASS' : 'FAIL'} (errors: ${errors.length})`;
}

if (params.has('selftest')) {
  runSelfTest().catch((err) => {
    console.error('[audio-selftest] crashed', err);
    status.textContent = `Self-test crashed: ${err.message}`;
  });
} else if (params.has('offline')) {
  runOffline().catch((err) => {
    console.error('[audio-test] crashed', err);
    status.textContent = `Offline test crashed: ${err.message}`;
  });
} else {
  buildUI();
}
