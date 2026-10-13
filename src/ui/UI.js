/**
 * TurboKart UI — every menu, the in-race HUD and overlays (DOM + CSS).
 *
 * The UI owns the menu flow (title → main → engine → character → track/cup)
 * and talks to the rest of the game only through the EventBus (UI_* events
 * out, INPUT_MENU / RACE_* / ITEM_* in). See ARCHITECTURE.md §4.
 */
import { EVENTS, GAME_MODES, ITEMS, DEFAULT_SETTINGS, SETTINGS_STORAGE_KEY } from '../core/constants.js';
import { h, loadJSON, saveJSON } from './util.js';
import { injectStyles, removeStyles } from './styles/index.js';
import { TitleScreen, MainMenuScreen, EngineScreen, SettingsScreen, PauseScreen, MODE_INFO } from './screens/menus.js';
import { CharacterScreen, TrackScreen, CupScreen } from './screens/select.js';
import { LoadingScreen } from './screens/loading.js';
import { ResultsScreen } from './screens/results.js';
import { HUD } from './hud/HUD.js';

const MENU_SCREENS = ['title', 'main', 'engine', 'character', 'track', 'cup', 'settings', 'pause', 'results'];
const INPUT_GUARD_MS = 120;

export class UI {
  /**
   * @param {HTMLElement} root  #ui-root
   * @param {{ bus, characters, tracks, cups, getTrackPreviewPath, settings }} opts
   */
  constructor(root, { bus, characters = [], tracks = [], cups = [], getTrackPreviewPath = null, settings = null } = {}) {
    this.root = root;
    this.bus = bus;
    this.characters = characters || [];
    this.tracks = tracks || [];
    this.cups = cups || [];
    this._getPreviewPath = typeof getTrackPreviewPath === 'function' ? getTrackPreviewPath : null;
    this._previewCache = new Map();
    this.settings = { ...DEFAULT_SETTINGS, ...(settings || {}), ...loadJSON(SETTINGS_STORAGE_KEY, {}) };

    this.flow = {
      mode: null,
      engineClass: Number(this.settings.engineClass) || 150,
      characterId: this.characters[0]?.id ?? null,
      trackId: this.tracks[0]?.id ?? null,
      cupId: this.cups[0]?.id ?? null,
    };

    injectStyles();
    this.el = h('div', { class: 'tk-ui', 'data-device': 'keyboard', 'data-screen': 'none' });
    this.screensLayer = h('div', { class: 'tk-layer tk-layer--screens' });
    this.hud = new HUD(this);
    this.fpsEl = h('div', { class: 'tk-fps' }, h('b', null, '--'), ' FPS');
    this.fpsEl.hidden = true;
    this.el.append(this.hud.el, this.hud.overlays, this.screensLayer, this.fpsEl);
    root.appendChild(this.el);

    this.screens = {
      title: new TitleScreen(this),
      main: new MainMenuScreen(this),
      engine: new EngineScreen(this),
      character: new CharacterScreen(this),
      track: new TrackScreen(this),
      cup: new CupScreen(this),
      settings: new SettingsScreen(this),
      loading: new LoadingScreen(this),
      pause: new PauseScreen(this),
      results: new ResultsScreen(this),
    };

    /** Interactive screen receiving INPUT_MENU actions (null during racing). */
    this.current = null;
    this.screenName = null;
    this._lastChange = 0;
    this._fps = null;

    const on = (name, fn) => bus.on(name, fn);
    this._subs = [
      on(EVENTS.INPUT_MENU, (e) => this._onMenuInput(e)),
      on(EVENTS.INPUT_DEVICE, ({ device }) => {
        this.el.dataset.device = device === 'gamepad' ? 'gamepad' : 'keyboard';
      }),
      on(EVENTS.RACE_LOADING, ({ progress, label }) => {
        if (this.screens.loading.active) this.showLoading(progress, label);
      }),
      on(EVENTS.RACE_INTRO, ({ track }) => this._onIntro(track)),
      on(EVENTS.RACE_COUNTDOWN, ({ count }) => this.hud.showCountdown(count)),
      on(EVENTS.RACE_LAP, ({ kart, lap, totalLaps, isFinalLap }) => {
        if (!kart || !kart.isPlayer || !this.hud.visible) return;
        if (lap > totalLaps || lap < 2) return;
        this.hud.showLapBanner(lap, totalLaps, isFinalLap || lap === totalLaps);
      }),
      on(EVENTS.RACE_FINISH, ({ kart, position }) => {
        if (!kart || !kart.isPlayer || !this.hud.visible) return;
        this.hud.showFinish(position ?? kart.racePosition);
      }),
      on(EVENTS.ITEM_SPINY_WARNING, ({ target }) => {
        if (target && target.isPlayer && this.hud.visible) this.hud.showSpinyWarning();
      }),
      on(EVENTS.ITEM_USE, ({ kart, type }) => {
        if (kart && kart.isPlayer && type === ITEMS.GOLDEN_MUSHROOM) this.hud.item.onGoldenUse(performance.now());
      }),
      on(EVENTS.ITEM_ROULETTE_STOP, ({ kart }) => {
        if (kart && kart.isPlayer) this.hud.item.nextSwap = 0;
      }),
    ];

    // Subtle pointer parallax on menu art (CSS vars --px/--py in -1..1, written at most once per frame)
    this._ptr = { x: 0, y: 0, raf: 0 };
    this._onPointer = (e) => {
      if (!this.isMenuOpen) return;
      this._ptr.x = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      this._ptr.y = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
      if (!this._ptr.raf) {
        this._ptr.raf = requestAnimationFrame(() => {
          this._ptr.raf = 0;
          this.el.style.setProperty('--px', this._ptr.x.toFixed(3));
          this.el.style.setProperty('--py', this._ptr.y.toFixed(3));
        });
      }
    };
    window.addEventListener('pointermove', this._onPointer, { passive: true });

    this._applyFpsVisibility();
    // Let listeners subscribed right after construction receive the merged settings.
    queueMicrotask(() => this.emit(EVENTS.UI_SETTINGS, { settings: { ...this.settings } }));
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  emit(name, payload = {}) {
    this.bus.emit(name, payload);
  }

  previewPath(trackId) {
    if (!this._previewCache.has(trackId)) {
      let pts = [];
      try {
        pts = this._getPreviewPath ? this._getPreviewPath(trackId, 160) || [] : [];
      } catch (err) {
        console.warn('[UI] getTrackPreviewPath failed for', trackId, err);
      }
      this._previewCache.set(trackId, pts);
    }
    return this._previewCache.get(trackId);
  }

  trackByName(nameOrId) {
    if (!nameOrId) return null;
    return this.tracks.find((t) => t.id === nameOrId || t.name === nameOrId) || null;
  }

  trackIdByName(name) {
    return this.trackByName(name)?.id || null;
  }

  getSettings() {
    return { ...this.settings };
  }

  /** Merge, persist and broadcast settings. */
  updateSettings(patch) {
    this.settings = { ...this.settings, ...patch };
    saveJSON(SETTINGS_STORAGE_KEY, this.settings);
    if ('engineClass' in patch) this.flow.engineClass = Number(this.settings.engineClass) || 150;
    this._applyFpsVisibility();
    this.emit(EVENTS.UI_SETTINGS, { settings: { ...this.settings } });
  }

  _applyFpsVisibility() {
    this.fpsEl.hidden = !this.settings.showFps;
  }

  _setScreen(name) {
    this.screenName = name;
    this.el.dataset.screen = name || 'none';
    this._lastChange = performance.now();
    if (name) this.emit(EVENTS.UI_SCREEN, { screen: name });
  }

  /** Internal menu navigation (hides the current interactive screen). */
  go(name, params = {}) {
    const next = this.screens[name];
    if (!next) return;
    if (this.current && this.current !== next) this.current.hide();
    for (const key of MENU_SCREENS) {
      const s = this.screens[key];
      if (s !== next && s !== this.current && s.active) s.hide(true);
    }
    this.current = next;
    this._setScreen(name);
    next.show(params);
  }

  _hideMenus(immediate = false) {
    for (const key of MENU_SCREENS) this.screens[key].hide(immediate);
    this.current = null;
  }

  _onMenuInput({ action }) {
    const cur = this.current;
    if (!cur || !cur.active) return;
    if (action === 'pause') return; // Game owns pause toggling
    if ((action === 'confirm' || action === 'back') && performance.now() - this._lastChange < INPUT_GUARD_MS) return;
    cur.handleAction(action);
  }

  _onIntro(track) {
    const name = track?.name || track?.def?.name || this.hud.config?.trackName || '';
    const cfg = this.hud.config || {};
    let line = MODE_INFO[cfg.mode]?.title || '';
    if (cfg.mode === GAME_MODES.GRAND_PRIX) {
      const cup = this.cups.find((c) => c.id === this.flow.cupId) || this.cups[0];
      const id = track?.id || this.trackIdByName(name);
      const idx = cup ? cup.trackIds.indexOf(id) : -1;
      line = cup ? `${cup.name}${idx >= 0 ? `  ·  Race ${idx + 1}/${cup.trackIds.length}` : ''}` : line;
    }
    this.hud.showIntro(name, line);
  }

  /** Called by the track / cup screens when the player commits. */
  startRace() {
    const f = this.flow;
    const payload = {
      mode: f.mode || GAME_MODES.VS,
      engineClass: Number(f.engineClass) || 150,
      characterId: f.characterId,
      trackId: f.trackId,
      cupId: f.mode === GAME_MODES.GRAND_PRIX ? f.cupId : null,
    };
    this._hideMenus();
    this._setScreen(null);
    this.emit(EVENTS.UI_START_RACE, payload);
  }

  // ---------------------------------------------------------------------------
  // Public API (ARCHITECTURE.md §4)
  // ---------------------------------------------------------------------------

  showTitle() {
    this.hidePause();
    this.hud.hide();
    this.screens.results.hide();
    this.screens.loading.hide();
    this.go('title');
  }

  showMainMenu() {
    this.hidePause();
    this.hud.hide();
    this.screens.results.hide();
    this.screens.loading.hide();
    this.go('main');
  }

  /**
   * @param {number} progress 0..1
   * @param {string} [label]  track name (as Game passes it) or a status label
   * @param {string|object} [track] optional track id / TRACKS entry
   */
  showLoading(progress = 0, label = '', track = null) {
    const ls = this.screens.loading;
    let def = null;
    if (track && typeof track === 'object') def = track;
    else if (track) def = this.trackByName(track);
    if (!def) def = this.trackByName(label);
    if (!def && this.flow.trackId) def = this.trackByName(this.flow.trackId);
    if (!def && label) def = { name: label };
    let crumb = 'Now Loading';
    const mode = this.flow.mode;
    if (mode === GAME_MODES.GRAND_PRIX && def?.id) {
      const cup = this.cups.find((c) => c.id === this.flow.cupId) || this.cups.find((c) => c.trackIds.includes(def.id));
      const idx = cup ? cup.trackIds.indexOf(def.id) : -1;
      if (cup && idx >= 0) crumb = `${cup.name}  ·  Race ${idx + 1} of ${cup.trackIds.length}`;
    } else if (mode && MODE_INFO[mode]) {
      crumb = MODE_INFO[mode].title;
    }
    ls.setTrack(def, crumb);
    ls.setProgress(progress);
    if (!ls.active) {
      this._hideMenus();
      this.hud.hide();
      ls.show();
      this._setScreen('loading');
    }
  }

  hideLoading() {
    this.screens.loading.hide();
  }

  showHUD(cfg = {}) {
    this._hideMenus();
    this.el.classList.remove('is-paused');
    this.screens.loading.hide();
    const pc = cfg.playerCharacter;
    const character = typeof pc === 'string' ? this.characters.find((c) => c.id === pc) : pc;
    this.hud.show({ ...cfg, playerCharacter: character || null });
    this._setScreen('hud');
  }

  hideHUD() {
    this.hud.hide();
  }

  updateHUD(hud) {
    this.hud.update(hud);
  }

  showPause() {
    const pause = this.screens.pause;
    if (this.current && this.current !== pause) this.current.hide(true);
    this.current = pause;
    pause.show();
    this.el.classList.add('is-paused');
    this._setScreen('pause');
  }

  hidePause() {
    const pause = this.screens.pause;
    this.el.classList.remove('is-paused');
    if (!pause.active) return;
    pause.hide();
    if (this.current === pause) this.current = null;
    if (this.hud.visible) this._setScreen('hud');
  }

  showResults(results) {
    this.hidePause();
    this.hud.hide();
    this.screens.loading.hide();
    this.go('results', { results });
  }

  hideAll() {
    this._hideMenus();
    this.screens.loading.hide();
    this.hud.hide();
    this.hud.clearOverlays();
    this.el.classList.remove('is-paused');
    this.screenName = null;
    this.el.dataset.screen = 'none';
  }

  setFps(fps) {
    const v = Math.round(Number(fps) || 0);
    if (v === this._fps) return;
    this._fps = v;
    const b = this.fpsEl.firstChild;
    b.textContent = String(v);
    this.fpsEl.dataset.band = v >= 55 ? 'good' : v >= 35 ? 'ok' : 'bad';
  }

  get isMenuOpen() {
    return !!(this.current && this.current.active && MENU_SCREENS.includes(this.current.id));
  }

  /** Current screen name ('title' … 'hud' | null). */
  get screen() {
    return this.screenName;
  }

  dispose() {
    window.removeEventListener('pointermove', this._onPointer);
    cancelAnimationFrame(this._ptr.raf);
    for (const off of this._subs) off();
    this._subs = [];
    for (const key in this.screens) this.screens[key].hide(true);
    this.hud.dispose();
    this.el.remove();
    removeStyles();
  }
}

