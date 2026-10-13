import * as THREE from 'three';
import { EventBus } from './EventBus.js';
import { Input } from './Input.js';
import { RaceManager } from './RaceManager.js';
import { Showroom } from './Showroom.js';
import { TouchControls, IS_MOBILE } from './TouchControls.js';
import {
  EVENTS,
  GAME_STATES,
  GAME_MODES,
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  RECORDS_STORAGE_KEY,
  RACER_COUNT,
  DEFAULT_LAPS,
  PHYSICS_DT,
  GP_POINTS,
  ENGINE_CLASSES,
  SPEED_DISPLAY_FACTOR,
} from './constants.js';
import { Track, TRACKS, CUPS, getTrackPreviewPath } from '../track/index.js';
import { CHARACTERS, Kart, createKartModel, resolveKartCollisions, CameraController } from '../kart/index.js';
import { ItemSystem } from '../items/index.js';
import { AIDriver } from '../ai/index.js';
import { UI } from '../ui/index.js';
import { AudioEngine } from '../audio/index.js';
import { Effects } from '../fx/index.js';

const S = GAME_STATES;
const params = new URLSearchParams(location.search);
const MAX_STEPS_PER_FRAME = 10;
const INTRO_DURATION = 4.2;
const RESULTS_DELAY = 4.5;
const FORCE_FINISH_DELAY = 7;
const ATTRACT_CUT_INTERVAL = 7.5;

function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function shuffle(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const PIXEL_RATIO = {
  low: () => Math.min(window.devicePixelRatio, 1),
  medium: () => Math.min(window.devicePixelRatio, 1.5),
  high: () => Math.min(window.devicePixelRatio, 2),
};

/**
 * Owns the renderer, the frame loop and the game state machine, and wires
 * every module (track, karts, items, AI, UI, audio, effects) together.
 */
export class Game {
  constructor({ canvas, uiRoot }) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.state = S.BOOT;
    this.prevState = null;
    this.time = 0;
    this.lastFrame = performance.now();
    this.accumulator = 0;
    this.session = null;
    this.track = null;
    this.renderMode = 'world';
    this.raceConfig = null;
    this.gp = null;
    this.stateTime = 0;
    this._pending = [];
    this._fps = { frames: 0, time: 0 };
    this._hud = null;
    this._loadToken = 0;
    this._frame = this._frame.bind(this);
  }

  async init() {
    // Phones/tablets default to medium graphics; an explicit saved setting always wins.
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(IS_MOBILE ? { quality: 'medium' } : {}),
      ...loadJSON(SETTINGS_STORAGE_KEY, {}),
    };

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setPixelRatio((PIXEL_RATIO[this.settings.quality] || PIXEL_RATIO.high)());

    this.bus = new EventBus();
    this.input = new Input({ bus: this.bus });
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 3000);
    this.camera.position.set(0, 30, 60);
    this.scene.add(this.camera);

    this.cameraController = new CameraController(this.camera, { bus: this.bus });
    this.effects = new Effects({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      bus: this.bus,
      quality: this.settings.quality,
    });
    this.audio = new AudioEngine({ bus: this.bus, settings: this.settings });
    this.audio.setVolumes(this.settings);
    this.ui = new UI(this.uiRoot, {
      bus: this.bus,
      characters: CHARACTERS,
      tracks: TRACKS,
      cups: CUPS,
      getTrackPreviewPath,
      settings: this.settings,
    });
    this.showroom = new Showroom({ createKartModel, characters: CHARACTERS });
    this.touch = null;
    if (IS_MOBILE) {
      this.touch = new TouchControls({ bus: this.bus, onPause: () => this._defer(() => this._pause()) });
      this.input.attachTouch(this.touch);
    }

    this._bindEvents();
    this._onResize = this._onResize.bind(this);
    window.addEventListener('resize', this._onResize);
    this._onResize();

    const unlock = () => {
      this.audio.unlock();
      if (IS_MOBILE) this._goFullscreen();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchend', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    // iOS only resumes audio from touchend/click gestures.
    if (IS_MOBILE) window.addEventListener('touchend', unlock);
    document.addEventListener('visibilitychange', () => {
      if (params.has('nopause')) return;
      if (document.hidden && [S.RACING, S.COUNTDOWN, S.INTRO].includes(this.state)) this._pause();
    });

    window.__game = this;
    requestAnimationFrame(this._frame);

    if (params.has('quick')) {
      await this.startRace({
        mode: params.get('mode') || GAME_MODES.VS,
        engineClass: Number(params.get('cc')) || this.settings.engineClass || 150,
        characterId: params.get('char') || CHARACTERS[0].id,
        trackId: params.get('track') || TRACKS[0].id,
        cupId: CUPS[0].id,
      });
    } else {
      this._setState(S.MENU);
      this.ui.showTitle();
      this._playMusic('title');
      await this._startAttract(params.get('track') || TRACKS[0].id);
    }
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  _bindEvents() {
    const bus = this.bus;
    bus.on(EVENTS.UI_START_RACE, (cfg) => this._defer(() => this.startRace(cfg)));
    bus.on(EVENTS.UI_RESTART, () => this._defer(() => this.restartRace()));
    bus.on(EVENTS.UI_NEXT_RACE, () => this._defer(() => this.nextRace()));
    bus.on(EVENTS.UI_QUIT, () => this._defer(() => this.quitToMenu()));
    bus.on(EVENTS.UI_RESUME, () => this._defer(() => this._resume()));
    bus.on(EVENTS.UI_SETTINGS, ({ settings }) => this._applySettings(settings));
    bus.on(EVENTS.UI_SCREEN, ({ screen }) => this._onScreen(screen));
    bus.on(EVENTS.UI_PREVIEW_CHARACTER, ({ characterId }) => this.showroom.setCharacter(characterId));

    bus.on(EVENTS.INPUT_MENU, ({ action, repeat }) => {
      if (repeat) return;
      if (action === 'pause' || action === 'back') {
        // Deferred so the UI does not see the same key press on the freshly opened pause menu.
        if ([S.RACING, S.COUNTDOWN, S.INTRO, S.FINISHED].includes(this.state)) this._defer(() => this._pause());
        else if (this.state === S.PAUSED && action === 'pause') this._defer(() => this._resume());
      } else if (action === 'confirm' && this.state === S.INTRO && this.stateTime > 0.4) {
        this._defer(() => this._beginCountdown());
      }
    });

    bus.on(EVENTS.RACE_FINISH, ({ kart }) => {
      if (!this.session || this.session.attract) return;
      if (kart.isPlayer) this._onPlayerFinish();
    });
    bus.on(EVENTS.RACE_ALL_FINISHED, () => {
      if (!this.session || this.session.attract) return;
      this.session.allFinished = true;
    });
    bus.on(EVENTS.RACE_FINAL_LAP, () => this.audio.setFinalLap(true));
    bus.on(EVENTS.KART_WALL_HIT, ({ kart, impact }) => {
      if (kart.isPlayer && impact > 6) this.input.rumble(Math.min(1, impact / 20), 120);
    });
    bus.on(EVENTS.ITEM_HIT, ({ kart }) => {
      if (kart.isPlayer) this.input.rumble(0.9, 300);
    });
  }

  _defer(fn) {
    this._pending.push(fn);
  }

  _setState(state) {
    if (state === this.state) return;
    const previous = this.state;
    this.prevState = previous;
    this.state = state;
    this.stateTime = 0;
    this.bus.emit(EVENTS.GAME_STATE, { state, previous });
  }

  _onScreen(screen) {
    this.renderMode = screen === 'character' ? 'showroom' : 'world';
    if (screen === 'character' && !this.showroom.currentId) this.showroom.setCharacter(CHARACTERS[0].id);
    if (['main', 'engine', 'character', 'track', 'cup', 'settings'].includes(screen)) this._playMusic('menu');
    if (screen === 'title') this._playMusic('title');
  }

  _applySettings(settings) {
    const prevQuality = this.settings.quality;
    this.settings = { ...this.settings, ...settings };
    this.audio.setVolumes(this.settings);
    if (this.settings.quality !== prevQuality) {
      this.effects.setQuality(this.settings.quality);
      this._onResize();
    }
    if (this.cameraController && 'shakeEnabled' in this.cameraController) {
      this.cameraController.shakeEnabled = this.settings.cameraShake;
    }
  }

  /** Mobile: try fullscreen + landscape lock (silently unsupported on iPhone Safari). */
  _goFullscreen() {
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!req || document.fullscreenElement) return;
    try {
      const p = req.call(el, { navigationUI: 'hide' });
      if (p && p.then) {
        p.then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }

  _updateTouch() {
    const t = this.touch;
    const s = this.session;
    const show =
      this.input.device === 'touch' &&
      !!s &&
      !s.attract &&
      !!s.player &&
      [S.INTRO, S.COUNTDOWN, S.RACING].includes(this.state);
    t.setActive(show);
    if (!show) return;
    t.autoThrottle = this.state === S.RACING;
    const p = s.player;
    t.setDriftLevel(p.isDrifting ? p.driftLevel : 0);
    const item = s.items.getItemState(p);
    t.setItemReady(!!item.type && !item.roulette);
  }

  _playMusic(id) {
    if (this._music === id) return;
    this._music = id;
    this.audio.playMusic(id, { fade: 1 });
  }

  _onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = (PIXEL_RATIO[this.settings.quality] || PIXEL_RATIO.high)();
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.effects.setSize(w, h, pr);
    this.showroom.resize(w, h);
    // Mobile: turning the phone to portrait mid-race pauses (the rotate prompt covers the screen).
    if (IS_MOBILE && h > w && [S.RACING, S.COUNTDOWN, S.INTRO].includes(this.state)) this._defer(() => this._pause());
  }

  // ---------------------------------------------------------------------------
  // Session building
  // ---------------------------------------------------------------------------

  async _ensureTrack(trackId, onProgress) {
    if (this.track && this.track.id === trackId) return this.track;
    if (this.track) {
      this.track.dispose();
      this.track = null;
    }
    // Clear anything a previous track left on the scene (environment, fog, background).
    this.scene.environment = null;
    this.scene.background = null;
    this.scene.fog = null;
    const track = new Track(trackId, { quality: this.settings.quality });
    await track.build(this.scene, this.renderer, onProgress);
    this.track = track;
    this.effects.setTrack(track);
    this.cameraController.setTrack(track);
    return track;
  }

  _disposeSession() {
    const s = this.session;
    if (!s) return;
    for (const kart of s.karts) {
      this.scene.remove(kart.mesh);
      kart.dispose();
    }
    s.items?.dispose();
    this.effects.clear();
    this.session = null;
    this.audio.setFinalLap(false);
  }

  /**
   * @param {{ trackId: string, roster: Array<{character: any, isPlayer: boolean}>, mode: string,
   *           engineClass: number, laps: number, attract?: boolean }} cfg
   */
  _createSession(cfg) {
    const track = this.track;
    const grid = track.getStartGrid(cfg.roster.length);
    const karts = [];
    const engine = ENGINE_CLASSES[cfg.engineClass] || ENGINE_CLASSES[150];

    cfg.roster.forEach((entry, slot) => {
      const kart = new Kart({
        character: entry.character,
        index: slot,
        isPlayer: entry.isPlayer,
        bus: this.bus,
        engineClass: cfg.engineClass,
      });
      this.scene.add(kart.mesh);
      kart.placeAtStart(grid[slot]);
      kart.frozen = true;
      kart.update(PHYSICS_DT, track);
      if (!kart.trackInfo) kart.trackInfo = track.queryPosition(kart.position);
      karts.push(kart);
    });

    const player = karts.find((k) => k.isPlayer) || null;
    const items = new ItemSystem({ scene: this.scene, track, karts, bus: this.bus, mode: cfg.mode });
    items.build();

    const ais = [];
    const aiKarts = karts.filter((k) => !k.isPlayer);
    const skillOrder = shuffle(aiKarts.map((_, i) => i));
    aiKarts.forEach((kart, i) => {
      const rank = aiKarts.length > 1 ? skillOrder[i] / (aiKarts.length - 1) : 1;
      const skill = Math.min(1, engine.aiSkill * (0.86 + 0.18 * rank));
      ais.push(new AIDriver(kart, { track, itemSystem: items, skill, bus: this.bus }));
    });

    const race = new RaceManager({ track, karts, bus: this.bus, totalLaps: cfg.laps, mode: cfg.mode });

    this.session = {
      ...cfg,
      track,
      karts,
      player,
      items,
      ais,
      race,
      autopilot: null,
      playerFinishedAt: null,
      allFinished: false,
      resultsShown: false,
      attractCut: 0,
      attractTarget: null,
    };
    this.accumulator = 0;

    if (player && params.has('autopilot')) {
      this.session.autopilot = new AIDriver(player, { track, itemSystem: items, skill: 0.95, bus: this.bus });
    }
    return this.session;
  }

  async _startAttract(trackId) {
    const token = ++this._loadToken;
    this._disposeSession();
    await this._ensureTrack(trackId);
    if (token !== this._loadToken) return;
    const roster = shuffle(CHARACTERS)
      .slice(0, RACER_COUNT)
      .map((character) => ({ character, isPlayer: false }));
    const s = this._createSession({
      trackId,
      roster,
      mode: GAME_MODES.VS,
      engineClass: 150,
      laps: 999,
      attract: true,
    });
    for (const kart of s.karts) {
      kart.frozen = false;
      kart.onRaceStart?.();
    }
    s.race.start();
    // Let the pack spread out a little before anyone sees it.
    this._fastForward(6);
    this._attractCut();
  }

  _attractCut() {
    const s = this.session;
    if (!s || !s.attract) return;
    s.attractCut = ATTRACT_CUT_INTERVAL;
    const candidates = s.karts.filter((k) => k !== s.attractTarget);
    const target = candidates[Math.floor(Math.random() * candidates.length)] || s.karts[0];
    s.attractTarget = target;
    this.cameraController.setTarget(target);
    this.cameraController.setMode(Math.random() < 0.35 ? 'orbit' : 'chase');
    this.cameraController.snap();
  }

  // ---------------------------------------------------------------------------
  // Race flow
  // ---------------------------------------------------------------------------

  async startRace(config) {
    this.raceConfig = { ...config };
    const mode = config.mode;
    if (mode === GAME_MODES.GRAND_PRIX) {
      const cup = CUPS.find((c) => c.id === config.cupId) || CUPS[0];
      this.gp = { cup, raceIndex: 0, totals: new Map(), lastOrder: null };
      await this._loadRace(cup.trackIds[0]);
    } else {
      this.gp = null;
      await this._loadRace(config.trackId || TRACKS[0].id);
    }
  }

  async nextRace() {
    if (!this.gp) return this.quitToMenu();
    this.gp.raceIndex++;
    if (this.gp.raceIndex >= this.gp.cup.trackIds.length) return this.quitToMenu();
    await this._loadRace(this.gp.cup.trackIds[this.gp.raceIndex]);
  }

  async restartRace() {
    if (!this.raceConfig || !this.session) return;
    this.ui.hidePause();
    await this._loadRace(this.session.trackId, { restart: true });
  }

  async quitToMenu() {
    const trackId = this.track ? this.track.id : TRACKS[0].id;
    this.gp = null;
    this.ui.hidePause();
    this.ui.hideHUD();
    this.ui.hideAll();
    this._setState(S.MENU);
    this.ui.showMainMenu();
    this._playMusic('menu');
    await this._startAttract(trackId);
  }

  _buildRoster(mode, characterId) {
    const playerChar = CHARACTERS.find((c) => c.id === characterId) || CHARACTERS[0];
    if (mode === GAME_MODES.TIME_TRIAL) return [{ character: playerChar, isPlayer: true }];

    const others = shuffle(CHARACTERS.filter((c) => c.id !== playerChar.id));
    while (others.length < RACER_COUNT - 1) others.push(...shuffle(CHARACTERS.filter((c) => c.id !== playerChar.id)));
    let rivals = others.slice(0, RACER_COUNT - 1);

    if (mode === GAME_MODES.GRAND_PRIX && this.gp && this.gp.lastOrder) {
      // Grid follows the previous race's finishing order.
      const order = this.gp.lastOrder;
      const all = [playerChar, ...rivals].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
      return all.map((character) => ({ character, isPlayer: character.id === playerChar.id }));
    }
    if (mode === GAME_MODES.GRAND_PRIX) {
      // First race of a cup: the player starts at the back.
      return [...rivals.map((character) => ({ character, isPlayer: false })), { character: playerChar, isPlayer: true }];
    }
    // VS: random slot in the back half.
    const slot = Math.floor(RACER_COUNT / 2 + Math.random() * (RACER_COUNT / 2));
    const roster = rivals.map((character) => ({ character, isPlayer: false }));
    roster.splice(Math.min(slot, roster.length), 0, { character: playerChar, isPlayer: true });
    return roster;
  }

  async _loadRace(trackId, { restart = false } = {}) {
    const token = ++this._loadToken;
    const cfg = this.raceConfig;
    const def = TRACKS.find((t) => t.id === trackId) || TRACKS[0];

    this.ui.hideAll();
    this.ui.hideHUD();
    this.renderMode = 'world';
    this._setState(S.LOADING);
    this.ui.showLoading(0, def.name);
    this.bus.emit(EVENTS.RACE_LOADING, { progress: 0, label: def.name });
    this.audio.stopMusic(0.8);
    this._music = null;

    const roster = restart && this.session && !this.session.attract
      ? this.session.roster
      : this._buildRoster(cfg.mode, cfg.characterId);

    this._disposeSession();
    // Give the loading screen a frame to appear before heavy work.
    await new Promise((r) => requestAnimationFrame(() => r()));
    await this._ensureTrack(trackId, (p) => {
      this.ui.showLoading(p * 0.9, def.name);
      this.bus.emit(EVENTS.RACE_LOADING, { progress: p * 0.9, label: def.name });
    });
    if (token !== this._loadToken) return;

    const laps = def.laps || DEFAULT_LAPS;
    const s = this._createSession({
      trackId,
      roster,
      mode: cfg.mode,
      engineClass: cfg.engineClass || 150,
      laps,
      attract: false,
    });
    this.ui.showLoading(1, def.name);
    await new Promise((r) => setTimeout(r, 250));
    if (token !== this._loadToken) return;
    this.ui.hideLoading();

    this.ui.showHUD({
      mode: cfg.mode,
      totalLaps: laps,
      racerCount: s.karts.length,
      trackName: def.name,
      playerCharacter: s.player.character,
    });
    this.cameraController.setTarget(s.player);
    this.cameraController.setTrack(this.track);
    this._playMusic(def.musicTheme || this.track.def?.musicTheme || 'meadow');

    if (params.has('skipintro')) {
      this._beginCountdown();
    } else {
      this.cameraController.setMode('intro');
      this.cameraController.snap();
      this._setState(S.INTRO);
      this.bus.emit(EVENTS.RACE_INTRO, { track: this.track });
    }
  }

  _beginCountdown() {
    if (!this.session || this.state === S.COUNTDOWN) return;
    this.cameraController.setMode('chase');
    if (this.state !== S.INTRO) this.cameraController.snap();
    this._setState(S.COUNTDOWN);
    this._countdown = { t: 0, next: 3 };
  }

  _updateCountdown(dt) {
    const c = this._countdown;
    const s = this.session;
    c.t += dt;
    // Hold ~0.6 s on the starting camera, then 3-2-1-GO one second apart.
    const beats = [0.6, 1.6, 2.6, 3.6];
    while (c.next >= 0 && c.t >= beats[3 - c.next]) {
      const count = c.next;
      this.bus.emit(EVENTS.RACE_COUNTDOWN, { count });
      if (count > 0) {
        for (const kart of s.karts) kart.onCountdown?.(count);
      } else {
        for (const kart of s.karts) {
          kart.frozen = false;
          kart.onRaceStart?.();
        }
        s.race.start();
        this.bus.emit(EVENTS.RACE_START, {});
        this._setState(S.RACING);
        const warp = Number(params.get('warp'));
        if (warp > 0) this._fastForward(warp);
      }
      c.next--;
    }
  }

  _onPlayerFinish() {
    const s = this.session;
    if (!s || s.playerFinishedAt !== null) return;
    s.playerFinishedAt = this.time;
    this._setState(S.FINISHED);
    this.cameraController.setMode('finish');
    // Autopilot takes over for the cool-down lap.
    if (!s.autopilot) {
      s.autopilot = new AIDriver(s.player, { track: s.track, itemSystem: s.items, skill: 0.8, bus: this.bus });
    }
    this.audio.setFinalLap(false);
  }

  _updateFinished() {
    const s = this.session;
    const since = this.time - s.playerFinishedAt;
    if (!s.allFinished && since > FORCE_FINISH_DELAY) s.race.forceFinish();
    if (s.allFinished && !s.resultsShown && since > RESULTS_DELAY) this._showResults();
  }

  _showResults() {
    const s = this.session;
    s.resultsShown = true;
    const standings = s.race.getStandings();
    const mode = s.mode;
    const def = this.track.def || {};
    let gpComplete = false;
    let timeTrial = null;

    if (mode === GAME_MODES.GRAND_PRIX && this.gp) {
      for (const st of standings) {
        const id = st.kart.character.id;
        const pts = GP_POINTS[st.position - 1] || 0;
        st.points = pts;
        this.gp.totals.set(id, (this.gp.totals.get(id) || 0) + pts);
        st.totalPoints = this.gp.totals.get(id);
      }
      this.gp.lastOrder = standings.map((st) => st.kart.character.id);
      gpComplete = this.gp.raceIndex >= this.gp.cup.trackIds.length - 1;
    }

    if (mode === GAME_MODES.TIME_TRIAL) {
      const records = loadJSON(RECORDS_STORAGE_KEY, {});
      const prev = records[s.trackId] || null;
      const st = standings[0];
      const time = st.finishTime;
      timeTrial = {
        time,
        bestLap: st.bestLap,
        lapTimes: st.lapTimes,
        isRecord: !prev || time < prev.time,
        previousRecord: prev ? prev.time : null,
      };
    }

    const playerStanding = standings.find((st) => st.kart.isPlayer);
    const results = {
      mode,
      trackId: s.trackId,
      trackName: def.name || s.trackId,
      cupName: this.gp ? this.gp.cup.name : null,
      raceIndex: this.gp ? this.gp.raceIndex : 0,
      raceCount: this.gp ? this.gp.cup.trackIds.length : 1,
      gpComplete,
      standings: standings.map((st) => ({
        position: st.position,
        name: st.kart.name || st.kart.character.name,
        characterId: st.kart.character.id,
        cssColor: st.kart.character.cssColor,
        isPlayer: st.kart.isPlayer,
        finishTime: st.finishTime,
        bestLap: st.bestLap,
        points: st.points ?? 0,
        totalPoints: st.totalPoints ?? 0,
      })),
      timeTrial,
    };

    this._setState(S.RESULTS);
    this.ui.hideHUD();
    this.ui.showResults(results);
    const podium = playerStanding && playerStanding.position <= 3;
    this._playMusic(gpComplete && podium ? 'victory' : podium ? 'victory' : 'results');
  }

  _pause() {
    if (this.state === S.PAUSED || !this.session || this.session.attract) return;
    this._pausedFrom = this.state;
    this._setState(S.PAUSED);
    this.ui.showPause();
  }

  _resume() {
    if (this.state !== S.PAUSED) return;
    this.ui.hidePause();
    this._setState(this._pausedFrom || S.RACING);
    this.lastFrame = performance.now();
  }

  // ---------------------------------------------------------------------------
  // Simulation
  // ---------------------------------------------------------------------------

  _fastForward(seconds) {
    const step = 1 / 60;
    for (let t = 0; t < seconds; t += step) {
      this.time += step;
      this._simulate(step);
    }
    for (const kart of this.session.karts) kart.updateVisuals(step, this.time);
  }

  _simulate(dt) {
    const s = this.session;
    if (!s) return;
    const track = s.track;

    if (s.player) {
      if (s.autopilot) {
        s.autopilot.update(dt, { karts: s.karts, playerKart: s.player });
      } else {
        Object.assign(s.player.controls, this.input.getKartControls());
      }
    }
    for (const ai of s.ais) ai.update(dt, { karts: s.karts, playerKart: s.player });

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= PHYSICS_DT && steps < MAX_STEPS_PER_FRAME) {
      for (const kart of s.karts) kart.update(PHYSICS_DT, track);
      resolveKartCollisions(s.karts, this.bus);
      this.accumulator -= PHYSICS_DT;
      steps++;
    }
    if (steps >= MAX_STEPS_PER_FRAME) this.accumulator = 0;

    s.items.update(dt, this.time);
    s.race.update(dt);
  }

  /** Intro / countdown: physics runs frozen so engines rev and rocket starts register. */
  _simulateFrozen(dt) {
    const s = this.session;
    if (s.player) Object.assign(s.player.controls, this.input.getKartControls());
    for (const ai of s.ais) ai.update(dt, { karts: s.karts, playerKart: s.player });
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= PHYSICS_DT && steps < MAX_STEPS_PER_FRAME) {
      for (const kart of s.karts) kart.update(PHYSICS_DT, s.track);
      this.accumulator -= PHYSICS_DT;
      steps++;
    }
    if (steps >= MAX_STEPS_PER_FRAME) this.accumulator = 0;
    s.items.update(dt, this.time);
  }

  _frame(now) {
    requestAnimationFrame(this._frame);
    let dt = (now - this.lastFrame) / 1000;
    this.lastFrame = now;
    if (!(dt > 0)) dt = 1 / 60;
    dt = Math.min(dt, 1 / 20);

    try {
      this._tick(dt);
    } catch (err) {
      console.error('[Game] frame error', err);
    }
    this._updateFps(dt);
  }

  _tick(dt) {
    if (this.touch) this._updateTouch();
    this.input.update();
    const pending = this._pending;
    this._pending = [];
    for (const fn of pending) {
      const r = fn();
      if (r && r.catch) r.catch((e) => console.error(e));
    }

    const s = this.session;
    const paused = this.state === S.PAUSED;
    if (!paused) {
      this.time += dt;
      this.stateTime += dt;
    }

    if (s && !paused && this.state !== S.LOADING) {
      switch (this.state) {
        case S.MENU:
          this._simulate(dt);
          s.attractCut -= dt;
          if (s.attractCut <= 0) this._attractCut();
          break;
        case S.INTRO:
          this._simulateFrozen(dt);
          if (this.stateTime >= INTRO_DURATION) this._beginCountdown();
          break;
        case S.COUNTDOWN:
          this._simulateFrozen(dt);
          this._updateCountdown(dt);
          break;
        case S.RACING:
          this._simulate(dt);
          break;
        case S.FINISHED:
          this._simulate(dt);
          this._updateFinished();
          break;
        case S.RESULTS:
          this._simulate(dt);
          break;
        default:
          break;
      }
    }

    const time = this.time;
    if (s && !paused) {
      for (const kart of s.karts) kart.updateVisuals(dt, time);
    }
    const focus = s ? (s.player || s.attractTarget || s.karts[0])?.position : null;
    if (this.track && !paused) this.track.update(dt, time, focus || this.camera.position);
    if (!paused) this.cameraController.update(dt);

    const playerKart = s ? s.player || (s.attract ? s.attractTarget : null) : null;
    const ctx = {
      karts: s ? s.karts : [],
      playerKart: s && !s.attract ? s.player : null,
      camera: this.camera,
      time,
      state: this.state,
    };
    if (!paused) this.effects.update(dt, { ...ctx, playerKart: s && s.attract ? null : playerKart });
    this.audio.update(paused ? 0 : dt, { camera: this.camera, playerKart: ctx.playerKart, karts: ctx.karts, state: this.state });

    if (s && !s.attract && s.player && [S.RACING, S.COUNTDOWN, S.INTRO, S.FINISHED].includes(this.state)) {
      this.ui.updateHUD(this._buildHUD());
    }

    if (this.renderMode === 'showroom') {
      this.showroom.update(dt, time);
      this.showroom.render(this.renderer);
    } else if (this.track) {
      this.effects.render();
    } else {
      this.renderer.setClearColor(0x05060a, 1);
      this.renderer.clear();
    }
  }

  _buildHUD() {
    const s = this.session;
    const p = s.player;
    const race = s.race;
    const stats = race.getKartStats(p);
    if (!this._hud) {
      this._hud = {
        item: { type: null, count: 0, roulette: false },
        minimap: { path: null, bounds: null, karts: [], markers: [] },
      };
    }
    const h = this._hud;
    h.position = p.racePosition;
    h.racerCount = s.karts.length;
    h.lap = Math.min(race.totalLaps, Math.max(1, stats.lapsCompleted + 1));
    h.totalLaps = race.totalLaps;
    h.raceTime = p.finished ? p.finishTime : race.raceTime;
    h.lapTime = p.finished ? stats.lastLapTime || 0 : stats.lapTime;
    h.bestLap = stats.bestLap;
    h.lastLapTime = stats.lastLapTime;
    h.speed = Math.round(Math.abs(p.speed) * SPEED_DISPLAY_FACTOR);
    h.coins = p.coins;
    h.driftLevel = p.driftLevel;
    h.boosting = p.isBoosting;
    const item = s.items.getItemState(p);
    h.item.type = item.type;
    h.item.count = item.count;
    h.item.roulette = item.roulette;
    h.item.golden = item.golden;
    h.item.holding = item.holding;
    h.driftCharge = p.driftCharge;
    h.mode = s.mode;
    h.minimap.path = this.track.minimap.path;
    h.minimap.bounds = this.track.minimap.bounds;
    const mk = h.minimap.karts;
    mk.length = s.karts.length;
    for (let i = 0; i < s.karts.length; i++) {
      const k = s.karts[i];
      const e = mk[i] || (mk[i] = {});
      e.x = k.position.x;
      e.z = k.position.z;
      e.heading = k.heading;
      e.color = k.character.cssColor;
      e.isPlayer = k.isPlayer;
      e.position = k.racePosition;
    }
    h.minimap.markers = s.items.getMinimapMarkers();
    h.wrongWay = stats.wrongWay;
    h.finished = p.finished;
    return h;
  }

  _updateFps(dt) {
    const f = this._fps;
    f.frames++;
    f.time += dt;
    if (f.time >= 0.5) {
      this.fps = Math.round(f.frames / f.time);
      if (this.settings.showFps) this.ui.setFps(this.fps);
      f.frames = 0;
      f.time = 0;
    }
  }
}
