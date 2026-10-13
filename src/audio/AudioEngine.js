import { EVENTS, GAME_STATES, ITEMS, DEFAULT_SETTINGS } from '../core/constants.js';
import { createReverb } from './synth.js';
import { SFX } from './sfx.js';
import { MusicPlayer, playSting } from './MusicPlayer.js';
import { SONGS } from './songs.js';
import { PlayerEngine, AIEngines } from './EngineSounds.js';

/**
 * TurboKart audio: everything synthesized with the Web Audio API.
 *
 * Graph: [music | sfx | engines | ui] buses → master → compressor → limiter → out.
 * Safe to use before `unlock()` (calls are ignored / remembered, never throw).
 */

const S = GAME_STATES;
const RACE_STATES = new Set([S.INTRO, S.COUNTDOWN, S.RACING, S.FINISHED]);
const TRACK_THEMES = new Set(['meadow', 'desert', 'snow', 'neon']);
const FINAL_LAP_TEMPO = 1.12;
const FINAL_LAP_TRANSPOSE = 1;

// Minimum seconds between two plays of the same sound (anti-spam).
const COOLDOWN = {
  uiNavigate: 0.035, rouletteTick: 0.03, bump: 0.08, wallHit: 0.1, shellBounce: 0.05, land: 0.08,
  hop: 0.05, driftStart: 0.05, coin: 0.03, crunch: 0.05, positionUp: 0.4, positionDown: 0.4, shrink: 0.25,
  itemBox: 0.05, explosion: 0.08, wrongWay: 1.2, spinyWarning: 1.5,
};
// Sounds that must not be pitch-randomized.
const EXACT = new Set(['count', 'go', 'lap', 'uiNavigate', 'uiConfirm', 'uiBack', 'rouletteLand', 'spinyWarning', 'coin', 'rouletteTick']);

function isMiniTurboSource(src) {
  const s = String(src || '').toLowerCase();
  return s.includes('drift') || s.includes('mini') || s.includes('turbo');
}

export class AudioEngine {
  /** @param {{ bus: import('../core/EventBus.js').EventBus, settings?: object }} o */
  constructor({ bus, settings = {} } = {}) {
    this.bus = bus;
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.ctx = null;
    this.state = null;
    this.camera = null;
    this.playerKart = null;
    this.karts = [];
    this.finalLap = false;
    this.pendingMusic = null;
    this.musicHoldUntil = 0;
    this.paused = false;
    this._last = {};
    this._voiceEnds = [];
    this._coin = { t: -10, streak: 0 };
    this._mt = new WeakMap();
    this._roulette = null;
    this._subs = [];
    this._camPos = { x: 0, y: 0, z: 0 };
    this._camRight = { x: 1, y: 0, z: 0 };
    this._bindEvents();
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /** Creates/resumes the AudioContext. Call from a user gesture. */
  unlock() {
    try {
      if (!this.ctx && !this._init()) return;
      if (this.ctx.state !== 'running') {
        const p = this.ctx.resume();
        if (p && p.catch) p.catch(() => {});
      }
      if (this.pendingMusic) {
        const { id, opts } = this.pendingMusic;
        this.pendingMusic = null;
        this.playMusic(id, opts);
      }
      if (this.ctx.state !== 'running' && typeof window !== 'undefined' && !this._retryArmed) {
        this._retryArmed = true;
        const retry = () => {
          this._retryArmed = false;
          window.removeEventListener('pointerdown', retry, true);
          window.removeEventListener('keydown', retry, true);
          this.ctx?.resume?.().catch?.(() => {});
        };
        window.addEventListener('pointerdown', retry, true);
        window.addEventListener('keydown', retry, true);
      }
    } catch (err) {
      console.warn('[audio] unlock failed', err);
    }
  }

  get unlocked() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  setVolumes({ masterVolume, musicVolume, sfxVolume } = {}) {
    if (masterVolume !== undefined) this.settings.masterVolume = masterVolume;
    if (musicVolume !== undefined) this.settings.musicVolume = musicVolume;
    if (sfxVolume !== undefined) this.settings.sfxVolume = sfxVolume;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = this.settings;
    const set = (g, v) => g.gain.setTargetAtTime(Math.max(0, v), t, 0.05);
    set(this.master, s.masterVolume);
    set(this.musicBus, s.musicVolume * 0.8 * (this.paused ? 0.55 : 1));
    set(this.sfxBus, s.sfxVolume);
    set(this.engineBus, s.sfxVolume * 0.8);
    set(this.uiBus, s.sfxVolume * 0.9);
  }

  playMusic(id, { fade = 1 } = {}) {
    if (!SONGS[id]) return;
    if (!this.ctx) {
      this.pendingMusic = { id, opts: { fade } };
      return;
    }
    const now = this.ctx.currentTime;
    const fl = this.finalLap && TRACK_THEMES.has(id);
    this.music.play(id, {
      fade,
      at: this.musicHoldUntil > now ? this.musicHoldUntil : null,
      tempoMul: fl ? FINAL_LAP_TEMPO : 1,
      transpose: fl ? FINAL_LAP_TRANSPOSE : 0,
      skipIntro: fl,
    });
  }

  stopMusic(fade = 1) {
    this.pendingMusic = null;
    this.musicHoldUntil = 0;
    if (!this.ctx) return;
    this.music.stopOverlay(Math.min(0.4, fade));
    this.music.stop(fade);
  }

  /** Final lap: plays the sting, then resumes the race theme ~12% faster and a semitone up. */
  setFinalLap(on) {
    on = !!on;
    if (on === this.finalLap) return;
    this.finalLap = on;
    if (!this.ctx || !on) return;
    const now = this.ctx.currentTime;
    const id = this.music.currentId;
    const dur = playSting(this.ctx, this.stingBus, 'finalLap', now + 0.05, this.reverb.input);
    if (id) {
      this.music.stop(0.2);
      this.music.play(id, {
        fade: 0,
        at: now + 0.05 + dur - 0.55,
        tempoMul: TRACK_THEMES.has(id) ? FINAL_LAP_TEMPO : 1,
        transpose: TRACK_THEMES.has(id) ? FINAL_LAP_TRANSPOSE : 0,
        skipIntro: true,
        fadeIn: 0.15,
      });
    }
  }

  /**
   * One-shot SFX by name.
   * opts: { volume=1, pitch=1, level2, kart, position, bus: 'sfx'|'ui', delay=0, exactPitch }
   * Returns the sound's duration (0 if skipped).
   */
  play(name, opts = {}) {
    const ctx = this.ctx;
    const fn = SFX[name];
    if (!ctx || !fn || ctx.state !== 'running') return 0;
    const now = ctx.currentTime;
    const cd = COOLDOWN[name] ?? 0.02;
    const key = opts.kart ? `${name}#${opts.kart.index ?? ''}` : name;
    if (this._last[key] !== undefined && now - this._last[key] < cd) return 0;
    this._last[key] = now;

    let vol = opts.volume ?? 1;
    let pan = 0;
    const isPlayer = opts.kart ? !!opts.kart.isPlayer : !opts.position;
    if (!isPlayer || opts.position) {
      const sp = this._spatial(opts.position || opts.kart?.position, opts.range ?? 1);
      if (!opts.kart?.isPlayer) {
        vol *= sp.gain;
        pan = sp.pan;
      }
    }
    if (vol < 0.02) return 0;
    // voice cap: drop quiet / non-player sounds when busy
    const ends = this._voiceEnds;
    for (let i = ends.length - 1; i >= 0; i--) if (ends[i] < now) ends.splice(i, 1);
    if (ends.length > 30 && !isPlayer) return 0;
    if (ends.length > 44) return 0;

    const g = ctx.createGain();
    g.gain.value = vol;
    const busNode = opts.bus === 'ui' ? this.uiBus : this.sfxBus;
    let tail = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p);
      tail = p;
    }
    tail.connect(busNode);
    const exact = opts.exactPitch || EXACT.has(name);
    const pitch = (opts.pitch ?? 1) * (exact ? 1 : 1 + (Math.random() * 2 - 1) * 0.03);
    let dur = 0.5;
    try {
      dur = fn(ctx, g, now + 0.005 + (opts.delay || 0), { pitch, level: 1, level2: opts.level2 }) || 0.5;
    } catch (err) {
      console.warn(`[audio] sfx "${name}" failed`, err);
    }
    const end = now + (opts.delay || 0) + dur;
    ends.push(end);
    setTimeout(() => {
      try {
        g.disconnect();
        if (tail !== g) tail.disconnect();
      } catch {
        // ignore
      }
    }, (end - now + 0.6) * 1000);
    return dur;
  }

  update(dt, { camera, playerKart, karts, state } = {}) {
    if (camera) this.camera = camera;
    this.playerKart = playerKart || null;
    this.karts = karts || this.karts;
    if (state !== undefined && state !== null) this._setState(state);
    const ctx = this.ctx;
    if (!ctx) return;
    this._updateListener();
    this.music.pump();
    this._pumpRoulette();

    const active = !!playerKart && RACE_STATES.has(this.state) && !this.paused && dt > 0;
    this.engine.update(dt, playerKart, active);
    this.ai.update(dt, this.karts, playerKart, this._camPos, RACE_STATES.has(this.state) && !this.paused && dt > 0);

    // star overlay follows the player's star timer
    const star = !!(playerKart && playerKart.starTimer > 0 && playerKart.isInvincible && RACE_STATES.has(this.state));
    if (star && !this.music.overlayActive) this.music.startOverlay('star');
    else if (!star && this.music.overlayActive) this.music.stopOverlay(0.6);
  }

  dispose() {
    for (const off of this._subs) off();
    this._subs.length = 0;
    if (this._timer) clearInterval(this._timer);
    this._timer = null;
    if (this.ctx) {
      try {
        this.music.dispose();
        this.engine.dispose();
        this.ai.dispose();
        this.ctx.close();
      } catch {
        // ignore
      }
    }
    this.ctx = null;
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  _init() {
    const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
    if (!AC) return false;
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    // master chain
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 3.5;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2.5;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.001;
    limiter.release.value = 0.08;
    this.master.connect(comp);
    comp.connect(limiter);
    limiter.connect(ctx.destination);
    this.compressor = comp;
    this.limiter = limiter;
    // buses
    this.musicBus = ctx.createGain();
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 20000;
    this.musicFilter.Q.value = 0.5;
    this.musicBus.connect(this.musicFilter);
    this.musicFilter.connect(this.master);
    this.stingBus = ctx.createGain();
    this.stingBus.gain.value = 1.1;
    this.stingBus.connect(this.musicBus);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.engineBus = ctx.createGain();
    this.engineBus.connect(this.master);
    this.uiBus = ctx.createGain();
    this.uiBus.connect(this.master);
    // shared reverb
    this.reverb = createReverb(ctx, this.master, { seconds: 2.0, decay: 2.6, wet: 0.32 });
    const sfxSend = ctx.createGain();
    sfxSend.gain.value = 0.12;
    this.sfxBus.connect(sfxSend);
    sfxSend.connect(this.reverb.input);

    this.music = new MusicPlayer(ctx, this.musicBus, this.reverb.input);
    this.engine = new PlayerEngine(ctx, this.engineBus);
    this.ai = new AIEngines(ctx, this.engineBus, 4);
    this.setVolumes(this.settings);
    this._timer = setInterval(() => {
      if (!this.ctx) return;
      this.music.pump();
      this._pumpRoulette();
    }, 40);
    return true;
  }

  _setState(state) {
    if (state === this.state) return;
    const prev = this.state;
    this.state = state;
    const wasPaused = this.paused;
    this.paused = state === S.PAUSED;
    if (this.ctx && wasPaused !== this.paused) {
      const t = this.ctx.currentTime;
      this.musicFilter.frequency.setTargetAtTime(this.paused ? 750 : 20000, t, 0.08);
      this.setVolumes({});
      if (this.paused) this._roulette = null;
    }
    if (state === S.MENU || state === S.LOADING) {
      this._roulette = null;
      if (this.ctx) this.music.stopOverlay(0.3);
    }
    if (state === S.COUNTDOWN && this.ctx) {
      // let the beeps breathe
      const t = this.ctx.currentTime;
      this.music.main.gain.setTargetAtTime(0.55, t, 0.2);
    } else if (prev === S.COUNTDOWN && this.ctx) {
      const t = this.ctx.currentTime;
      if (!this.music.overlayActive) this.music.main.gain.setTargetAtTime(1, t, 0.1);
    }
  }

  _updateListener() {
    const cam = this.camera;
    if (!cam || !cam.matrixWorld) return;
    const e = cam.matrixWorld.elements;
    const px = e[12], py = e[13], pz = e[14];
    // forward = -Z column, up = Y column
    const fx = -e[8], fy = -e[9], fz = -e[10];
    const ux = e[4], uy = e[5], uz = e[6];
    this._camPos.x = px;
    this._camPos.y = py;
    this._camPos.z = pz;
    this._camRight.x = e[0];
    this._camRight.y = e[1];
    this._camRight.z = e[2];
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(px, t, 0.02);
      l.positionY.setTargetAtTime(py, t, 0.02);
      l.positionZ.setTargetAtTime(pz, t, 0.02);
      l.forwardX.setTargetAtTime(fx, t, 0.02);
      l.forwardY.setTargetAtTime(fy, t, 0.02);
      l.forwardZ.setTargetAtTime(fz, t, 0.02);
      l.upX.setTargetAtTime(ux, t, 0.02);
      l.upY.setTargetAtTime(uy, t, 0.02);
      l.upZ.setTargetAtTime(uz, t, 0.02);
    } else if (l.setPosition) {
      l.setPosition(px, py, pz);
      l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  /** Distance attenuation + stereo pan for a world position relative to the camera. */
  _spatial(p, range = 1) {
    if (!p || !this.camera) return { gain: 0.6, pan: 0 };
    const dx = p.x - this._camPos.x, dy = p.y - this._camPos.y, dz = p.z - this._camPos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const ref = 9 * range;
    if (d > 140 * range) return { gain: 0, pan: 0 };
    const gain = 0.85 / (1 + Math.max(0, d - ref) / (14 * range));
    const pan = d > 0.5 ? ((dx * this._camRight.x + dy * this._camRight.y + dz * this._camRight.z) / d) * 0.75 : 0;
    return { gain, pan };
  }

  _raceSoundsAllowed() {
    return RACE_STATES.has(this.state) || this.state === S.RESULTS || this.state === null;
  }

  _kartSfx(name, kart, extra = {}) {
    if (!kart || !this._raceSoundsAllowed()) return 0;
    return this.play(name, { kart, ...extra });
  }

  _pumpRoulette() {
    const r = this._roulette;
    if (!r || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (now > r.until) {
      this._roulette = null;
      return;
    }
    while (r.next < now + 0.12) {
      const delay = Math.max(0, r.next - now);
      this.play('rouletteTick', { bus: 'ui', delay, pitch: r.alt ? 1 : 1.12 });
      this._last.rouletteTick = undefined; // allow tightly scheduled ticks
      r.alt = !r.alt;
      r.next += r.interval;
      r.interval = Math.min(0.16, r.interval * 1.03);
    }
  }

  _onFinish(position) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.music.stopOverlay(0.2);
    this.music.stop(0.35);
    const top = position <= 3;
    const dur = playSting(this.ctx, this.stingBus, top ? 'finishTop' : 'finishLow', now + 0.12, this.reverb.input);
    this.musicHoldUntil = now + 0.12 + dur - 0.3;
    this.finalLap = false;
    this._roulette = null;
  }

  _on(name, fn) {
    if (!this.bus || !name) return;
    this._subs.push(this.bus.on(name, (p) => {
      try {
        fn.call(this, p || {});
      } catch (err) {
        console.warn(`[audio] handler for ${name} failed`, err);
      }
    }));
  }

  _bindEvents() {
    const E = EVENTS;
    this._on(E.GAME_STATE, ({ state }) => this._setState(state));
    this._on(E.UI_SETTINGS, ({ settings }) => settings && this.setVolumes(settings));
    this._on(E.UI_NAVIGATE, () => this.play('uiNavigate', { bus: 'ui' }));
    this._on(E.UI_CONFIRM, () => this.play('uiConfirm', { bus: 'ui' }));
    this._on(E.UI_BACK, () => this.play('uiBack', { bus: 'ui' }));

    this._on(E.RACE_INTRO, () => {
      this.finalLap = false;
      this._roulette = null;
      if (this.ctx) this.music.stopOverlay(0.3);
    });
    this._on(E.RACE_COUNTDOWN, ({ count }) => {
      if (count > 0) this.play('count', { bus: 'ui' });
      else this.play('go', { bus: 'ui' });
    });
    this._on(E.RACE_LAP, ({ kart, isFinalLap }) => {
      if (!kart?.isPlayer) return;
      if (isFinalLap) this.setFinalLap(true);
      else this.play('lap', { bus: 'ui' });
    });
    this._on(E.RACE_FINAL_LAP, () => this.setFinalLap(true));
    this._on(E.RACE_FINISH, ({ kart, position }) => {
      if (kart?.isPlayer) this._onFinish(position ?? kart.racePosition ?? 8);
    });
    this._on(E.RACE_POSITION_CHANGE, ({ kart, from, to }) => {
      if (!kart?.isPlayer || this.state !== S.RACING || from === to) return;
      this.play(to < from ? 'positionUp' : 'positionDown', { bus: 'ui' });
    });
    this._on(E.RACE_WRONG_WAY, ({ kart, wrongWay }) => {
      if (kart?.isPlayer && wrongWay) this.play('wrongWay', { bus: 'ui' });
    });

    // kart
    this._on(E.KART_HOP, ({ kart }) => this._kartSfx('hop', kart, { volume: kart?.isPlayer ? 0.75 : 0.5 }));
    this._on(E.KART_DRIFT_START, ({ kart }) => this._kartSfx('driftStart', kart, { volume: kart?.isPlayer ? 1 : 0.6 }));
    this._on(E.KART_DRIFT_LEVEL, ({ kart, level }) => {
      if (kart?.isPlayer) this._kartSfx('driftLevel', kart, { level2: level });
    });
    this._on(E.KART_DRIFT_END, ({ kart, level }) => {
      if (!kart || !(level > 0)) return;
      if (this.ctx) this._mt.set(kart, this.ctx.currentTime);
      this._kartSfx('miniTurbo', kart, { level2: level, volume: kart.isPlayer ? 1 : 0.7 });
    });
    this._on(E.KART_BOOST, ({ kart, source }) => {
      if (!kart || !this.ctx) return;
      const last = this._mt.get(kart);
      if (isMiniTurboSource(source) || (last !== undefined && this.ctx.currentTime - last < 0.12)) return;
      const src = String(source || '').toLowerCase();
      if (src.includes('pad')) this._kartSfx('boostPad', kart);
      else if (src.includes('start') || src.includes('rocket')) this._kartSfx('rocketStart', kart);
      else if (src.includes('trick')) this._kartSfx('boost', kart, { volume: 0.6 });
      else this._kartSfx('boost', kart);
    });
    this._on(E.KART_LAND, ({ kart, impact = 4 }) => {
      if (impact < 2.5) return;
      this._kartSfx('land', kart, { volume: Math.min(1.1, 0.3 + impact / 14) });
    });
    this._on(E.KART_TRICK, ({ kart }) => this._kartSfx('trick', kart));
    this._on(E.KART_WALL_HIT, ({ kart, impact = 5 }) => {
      if (impact < 2) return;
      this._kartSfx('wallHit', kart, { volume: Math.min(1.1, 0.25 + impact / 16) });
    });
    this._on(E.KART_BUMP, ({ kartA, kartB, impact = 4 }) => {
      if (impact < 1) return;
      const k = kartA?.isPlayer ? kartA : kartB?.isPlayer ? kartB : kartA;
      this._kartSfx('bump', k, { volume: Math.min(1, 0.3 + impact / 12) });
    });
    this._on(E.KART_SPINOUT, ({ kart, cause }) => {
      this._kartSfx('spinOut', kart);
      if (cause === 'banana' || cause === ITEMS.BANANA) this._kartSfx('bananaSlip', kart, { volume: 0.8 });
    });
    this._on(E.KART_LAUNCHED, ({ kart }) => this._kartSfx('launched', kart));
    this._on(E.KART_SHRINK, ({ kart }) => {
      if (kart?.isPlayer) this._kartSfx('shrink', kart);
      else if (kart) this.play('shrink', { volume: 0.35, exactPitch: false });
    });
    this._on(E.KART_STAR_START, ({ kart }) => {
      if (kart?.isPlayer) this._kartSfx('starStart', kart);
    });
    this._on(E.KART_STAR_END, ({ kart }) => {
      if (kart?.isPlayer && this.ctx) this.music.stopOverlay(0.6);
    });
    this._on(E.KART_FALL, ({ kart }) => this._kartSfx('fall', kart));
    this._on(E.KART_RESPAWN, ({ kart }) => this._kartSfx('respawn', kart, { volume: kart?.isPlayer ? 0.9 : 0.5 }));
    this._on(E.KART_START_STALL, ({ kart }) => {
      if (kart?.isPlayer) this._kartSfx('stall', kart);
    });

    // items
    this._on(E.ITEM_BOX_HIT, ({ kart, position }) => {
      if (kart?.isPlayer) this._kartSfx('itemBox', kart);
      else if (this._raceSoundsAllowed()) this.play('itemBox', { position: position || kart?.position, volume: 0.7 });
    });
    this._on(E.ITEM_ROULETTE_START, ({ kart }) => {
      if (!kart?.isPlayer || !this.ctx) return;
      const now = this.ctx.currentTime;
      this._roulette = { next: now + 0.02, interval: 0.06, until: now + 5, alt: false };
    });
    this._on(E.ITEM_ROULETTE_STOP, ({ kart }) => {
      if (!kart?.isPlayer) return;
      this._roulette = null;
      this.play('rouletteLand', { bus: 'ui' });
    });
    this._on(E.ITEM_USE, ({ kart, type, position }) => {
      if (!kart || !this._raceSoundsAllowed()) return;
      const opts = kart.isPlayer ? { kart } : { kart, position: position || kart.position };
      switch (type) {
        case ITEMS.BANANA:
        case ITEMS.TRIPLE_BANANA:
          this.play('bananaDrop', opts);
          break;
        case ITEMS.GREEN_SHELL:
        case ITEMS.TRIPLE_GREEN_SHELL:
        case ITEMS.RED_SHELL:
        case ITEMS.TRIPLE_RED_SHELL:
          this.play('shellFire', opts);
          break;
        case ITEMS.SPINY_SHELL:
          this.play('shellFire', { ...opts, pitch: 0.75 });
          this.play('throw', { ...opts, delay: 0.05 });
          break;
        case ITEMS.BOMB:
          this.play('throw', opts);
          break;
        default:
          break;
      }
    });
    this._on(E.ITEM_HIT, ({ kart }) => this._kartSfx('itemHit', kart));
    this._on(E.ITEM_BLOCKED, ({ kart }) => this._kartSfx('blocked', kart));
    this._on(E.ITEM_DESTROYED, ({ position }) => {
      if (position && this._raceSoundsAllowed()) this.play('crunch', { position, volume: 0.8 });
    });
    this._on(E.ITEM_EXPLOSION, ({ position }) => {
      if (position && this._raceSoundsAllowed()) this.play('explosion', { position, range: 2.2, volume: 1.1 });
    });
    this._on(E.ITEM_SHELL_BOUNCE, ({ position }) => {
      if (position && this._raceSoundsAllowed()) this.play('shellBounce', { position, volume: 0.8 });
    });
    this._on(E.ITEM_LIGHTNING, () => this.play('lightning', { volume: 1 }));
    this._on(E.ITEM_SPINY_WARNING, ({ target }) => {
      if (target?.isPlayer) this.play('spinyWarning', { bus: 'ui' });
    });
    this._on(E.COIN_PICKUP, ({ kart }) => {
      if (!kart || !this.ctx) return;
      if (kart.isPlayer) {
        const now = this.ctx.currentTime;
        const c = this._coin;
        c.streak = now - c.t < 1.2 ? Math.min(8, c.streak + 1) : 0;
        c.t = now;
        this.play('coin', { kart, pitch: Math.pow(2, c.streak / 12) });
      } else if (this._raceSoundsAllowed()) {
        this.play('coin', { kart, position: kart.position, volume: 0.35 });
      }
    });
    this._on(E.COIN_LOST, ({ kart }) => {
      if (kart?.isPlayer) this._kartSfx('coinLost', kart);
    });
  }
}
