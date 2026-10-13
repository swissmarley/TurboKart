/**
 * Title, main menu, engine class, settings and pause screens.
 */
import { EVENTS, GAME_MODES, ENGINE_CLASSES, QUALITY_LEVELS, DEFAULT_SETTINGS } from '../../core/constants.js';
import { Screen } from '../Screen.js';
import { h, clamp, replayClass } from '../util.js';
import { ICONS } from '../icons.js';

export const MODE_INFO = {
  [GAME_MODES.GRAND_PRIX]: {
    title: 'Grand Prix',
    desc: 'Four tracks, one cup. Score points and lift the trophy.',
    icon: 'trophy',
    c1: '#ffd23f',
    c2: '#ff6a1a',
  },
  [GAME_MODES.VS]: {
    title: 'VS Race',
    desc: 'One race, any track, seven hungry rivals.',
    icon: 'flags',
    c1: '#ff6aa0',
    c2: '#e0185a',
  },
  [GAME_MODES.TIME_TRIAL]: {
    title: 'Time Trial',
    desc: 'Just you, three mushrooms and the clock.',
    icon: 'stopwatch',
    c1: '#3fe6ff',
    c2: '#2f5bff',
  },
  settings: {
    title: 'Settings',
    desc: 'Audio, graphics, camera and default engine.',
    icon: 'gear',
    c1: '#c49bff',
    c2: '#6a3df0',
  },
};

function chevrons(cls = '') {
  return h('span', { class: `tk-chevrons ${cls}` }, h('i'), h('i'), h('i'));
}

// -----------------------------------------------------------------------------
// Title
// -----------------------------------------------------------------------------

export class TitleScreen extends Screen {
  constructor(ui) {
    super(ui, 'title');
    this.outDuration = 450;
  }

  build() {
    const letters = (word, cls, offset) =>
      [...word].map((c, i) =>
        h('span', { class: `tk-logo__l ${cls}`, style: { '--i': i + offset }, 'data-c': c }, h('b', null, c)),
      );
    const el = h(
      'div',
      { class: 'tk-title' },
      h('div', { class: 'tk-title__shade' }),
      h('div', { class: 'tk-title__burst' }),
      h(
        'div',
        { class: 'tk-title__streaks' },
        [...Array(12)].map((_, i) => h('i', { style: { '--i': i, '--y': `${8 + ((i * 37) % 84)}%`, '--w': `${18 + ((i * 13) % 30)}%` } })),
      ),
      h(
        'div',
        { class: 'tk-logo' },
        h('div', { class: 'tk-logo__speed' }, h('i'), h('i'), h('i'), h('i')),
        h('div', { class: 'tk-logo__word' }, letters('TURBO', 'is-turbo', 0), letters('KART', 'is-kart', 5)),
        h('div', { class: 'tk-logo__ribbon' }, h('span', null, 'Arcade Grand Prix')),
      ),
      h(
        'div',
        { class: 'tk-press' },
        chevrons('is-left'),
        h('span', { class: 'tk-press__txt k' }, 'Press ', h('span', { class: 'tk-key tk-key--big' }, 'Enter')),
        h('span', { class: 'tk-press__txt g' }, 'Press ', h('span', { class: 'tk-key tk-key--a tk-key--big' }, 'A')),
        h('span', { class: 'tk-press__txt t' }, 'Tap to start'),
        chevrons('is-right'),
      ),
      h('div', { class: 'tk-title__foot' }, '© 2026 TurboKart Racing Club  ·  All characters & tracks original'),
    );
    el.addEventListener('click', () => {
      if (this.active) this.handleAction('confirm');
    });
    return el;
  }

  handleAction(action) {
    if (action === 'confirm') {
      this.ui.emit(EVENTS.UI_CONFIRM);
      replayClass(this.el, 'is-pressed');
      this.ui.go('main');
    }
  }
}

// -----------------------------------------------------------------------------
// Main menu
// -----------------------------------------------------------------------------

export class MainMenuScreen extends Screen {
  constructor(ui) {
    super(ui, 'main');
  }

  build() {
    const list = h('div', { class: 'tk-modes' });
    const order = [GAME_MODES.GRAND_PRIX, GAME_MODES.VS, GAME_MODES.TIME_TRIAL, 'settings'];
    order.forEach((id, i) => {
      const m = MODE_INFO[id];
      const btn = h(
        'button',
        { class: 'tk-mode tk-anim-l', type: 'button', style: { '--c1': m.c1, '--c2': m.c2, '--i': i } },
        h(
          'span',
          { class: 'tk-mode__plate' },
          h('span', { class: 'tk-mode__stripes' }),
          h('span', { class: 'tk-mode__icon', html: ICONS[m.icon]() }),
          h(
            'span',
            { class: 'tk-mode__text' },
            h('span', { class: 'tk-mode__title tk-display' }, m.title),
            h('span', { class: 'tk-mode__desc' }, m.desc),
          ),
          chevrons(),
        ),
      );
      this.addItem(btn, { onConfirm: () => this.choose(id) });
      list.appendChild(btn);
    });
    this.columns = 1;
    return h(
      'div',
      { class: 'tk-main' },
      h('div', { class: 'tk-backdrop tk-backdrop--left' }),
      h(
        'div',
        { class: 'tk-minilogo tk-anim-pop' },
        h('span', { class: 'is-turbo' }, 'TURBO'),
        h('span', { class: 'is-kart' }, 'KART'),
      ),
      list,
      this.footer({ back: 'Title' }),
    );
  }

  onShow() {
    const order = [GAME_MODES.GRAND_PRIX, GAME_MODES.VS, GAME_MODES.TIME_TRIAL, 'settings'];
    const idx = order.indexOf(this.lastChoice || this.ui.flow.mode);
    this.index = idx >= 0 ? idx : 0;
    this.applyFocus();
  }

  choose(id) {
    const ui = this.ui;
    this.lastChoice = id;
    if (id === 'settings') {
      ui.go('settings');
      return;
    }
    ui.flow.mode = id;
    if (id === GAME_MODES.TIME_TRIAL) {
      ui.flow.engineClass = 150;
      ui.go('character');
    } else {
      ui.go('engine');
    }
  }

  onBack() {
    this.ui.emit(EVENTS.UI_BACK);
    this.ui.go('title', { back: true });
  }
}

// -----------------------------------------------------------------------------
// Engine class
// -----------------------------------------------------------------------------

const CC_INFO = {
  50: { label: 'Rookie', desc: 'Relaxed speeds — perfect for learning every corner.', c1: '#8dff5a', c2: '#14a84a', bars: 1 },
  100: { label: 'Pro', desc: 'Quicker karts and sharper rivals.', c1: '#45e3ff', c2: '#2a55ff', bars: 2 },
  150: { label: 'Expert', desc: 'Full speed. The rivals race to win.', c1: '#ffd23f', c2: '#ff5a1f', bars: 3 },
  200: { label: 'Extreme', desc: 'Blistering speed. Brake into corners — or else.', c1: '#ff2d7a', c2: '#6a00ff', bars: 4 },
};

export class EngineScreen extends Screen {
  constructor(ui) {
    super(ui, 'engine');
  }

  build() {
    const row = h('div', { class: 'tk-ccrow' });
    this.classes = Object.keys(ENGINE_CLASSES)
      .map(Number)
      .sort((a, b) => a - b);
    this.classes.forEach((cc, i) => {
      const info = CC_INFO[cc] || { label: `${cc}cc`, desc: '', c1: '#fff', c2: '#888', bars: 2 };
      const extreme = cc >= 200;
      const meter = h('span', { class: 'tk-cc__meter' });
      for (let b = 0; b < 4; b++) meter.appendChild(h('i', { class: b < info.bars ? 'on' : '' }));
      const ec = ENGINE_CLASSES[cc] || {};
      const bar = (label, f) =>
        h(
          'span',
          { class: 'tk-cc__stat' },
          h('em', null, label),
          h('span', { class: 'tk-cc__track' }, h('b', { style: { width: `${Math.round(clamp(f, 0.08, 1) * 100)}%` } })),
        );
      const card = h(
        'button',
        {
          class: `tk-cc tk-anim-pop${extreme ? ' tk-cc--extreme' : ''}`,
          type: 'button',
          style: { '--c1': info.c1, '--c2': info.c2, '--i': i },
        },
        h('span', { class: 'tk-cc__bg' }, extreme ? h('span', { class: 'tk-cc__hazard' }) : null),
        extreme ? h('span', { class: 'tk-cc__flame', html: ICONS.flame() }) : null,
        h('span', { class: 'tk-cc__num tk-display' }, String(cc), h('small', null, 'cc')),
        h('span', { class: 'tk-cc__label' }, info.label),
        meter,
        h('span', { class: 'tk-cc__desc' }, info.desc),
        h(
          'span',
          { class: 'tk-cc__stats' },
          bar('Top Speed', ((ec.speedMul ?? 1) - 0.62) / 0.58),
          bar('Rivals', ec.aiSkill ?? 0.8),
        ),
      );
      this.addItem(card, { onConfirm: () => this.choose(cc) });
      row.appendChild(card);
    });
    this.columns = this.classes.length;
    return h(
      'div',
      { class: 'tk-engine' },
      h('div', { class: 'tk-backdrop tk-backdrop--full' }),
      this.header('Engine Class'),
      row,
      this.footer(),
    );
  }

  onShow() {
    const flow = this.ui.flow;
    this.setCrumbs([MODE_INFO[flow.mode]?.title]);
    const idx = this.classes.indexOf(Number(flow.engineClass) || this.ui.settings.engineClass || 150);
    this.index = idx >= 0 ? idx : 2;
    this.applyFocus();
  }

  choose(cc) {
    this.ui.flow.engineClass = cc;
    this.ui.go('character');
  }

  onBack() {
    this.ui.emit(EVENTS.UI_BACK);
    this.ui.go('main', { back: true });
  }
}

// -----------------------------------------------------------------------------
// Settings
// -----------------------------------------------------------------------------

export class SettingsScreen extends Screen {
  constructor(ui) {
    super(ui, 'settings');
    this.rows = [];
  }

  build() {
    const s = () => this.ui.settings;
    const defs = [
      { key: 'masterVolume', label: 'Master Volume', type: 'slider' },
      { key: 'musicVolume', label: 'Music Volume', type: 'slider' },
      { key: 'sfxVolume', label: 'Sound Effects', type: 'slider' },
      {
        key: 'quality',
        label: 'Graphics Quality',
        type: 'choice',
        options: QUALITY_LEVELS.map((q) => ({ value: q, label: q })),
      },
      { key: 'showFps', label: 'Show FPS', type: 'toggle' },
      { key: 'cameraShake', label: 'Camera Shake', type: 'toggle' },
      {
        key: 'engineClass',
        label: 'Default Engine',
        type: 'choice',
        options: Object.keys(ENGINE_CLASSES).map((k) => ({ value: Number(k), label: ENGINE_CLASSES[k].label })),
      },
      { type: 'button', label: 'Reset to Defaults', action: () => this.reset() },
      { type: 'button', label: 'Done', action: () => this.onBack(true), primary: true },
    ];
    const list = h('div', { class: 'tk-setlist' });
    defs.forEach((d, i) => {
      const row = this.buildRow(d, i, s);
      list.appendChild(row.el);
      this.rows.push(row);
    });
    this.columns = 1;
    return h(
      'div',
      { class: 'tk-settings' },
      h('div', { class: 'tk-backdrop tk-backdrop--full' }),
      this.header('Settings', ['Options']),
      h('div', { class: 'tk-panel tk-setpanel tk-anim-pop' }, h('div', { class: 'tk-panel__stripes' }), list),
      this.footer({ select: 'Change', extra: [] }),
    );
  }

  buildRow(d, i, getSettings) {
    const row = { def: d, el: null, refresh: () => {} };
    if (d.type === 'button') {
      const el = h('button', { class: `tk-set tk-set--btn${d.primary ? ' is-primary' : ''} tk-anim-l`, type: 'button', style: { '--i': i } }, h('span', { class: 'tk-set__label' }, d.label));
      this.addItem(el, { onConfirm: d.action });
      row.el = el;
      return row;
    }
    const label = h('span', { class: 'tk-set__label' }, d.label);
    const ctrl = h('span', { class: 'tk-set__ctrl' });
    const left = h('span', { class: 'tk-arrow is-l', html: ICONS.back() });
    const right = h('span', { class: 'tk-arrow is-r', html: ICONS.chevron() });
    const el = h('div', { class: `tk-set tk-set--${d.type} tk-anim-l`, style: { '--i': i } }, label, ctrl);
    const item = this.addItem(el, { clickToConfirm: false });

    const setValue = (v) => {
      if (getSettings()[d.key] === v) return;
      this.ui.updateSettings({ [d.key]: v });
      this.ui.emit(EVENTS.UI_NAVIGATE);
      row.refresh(true);
    };

    if (d.type === 'slider') {
      const fill = h('span', { class: 'tk-slider__fill' });
      const knob = h('span', { class: 'tk-slider__knob' });
      const track = h('span', { class: 'tk-slider' }, h('span', { class: 'tk-slider__ticks' }), fill, knob);
      const val = h('span', { class: 'tk-set__val tk-display' });
      ctrl.append(left, track, right, val);
      const step = (dir) => setValue(Math.round(clamp((getSettings()[d.key] ?? 0) + dir * 0.05, 0, 1) * 100) / 100);
      item.onAdjust = step;
      item.onConfirm = () => step(1);
      const fromPointer = (e) => {
        const r = track.getBoundingClientRect();
        setValue(Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * 20) / 20);
      };
      track.addEventListener('pointerdown', (e) => {
        if (!this.active) return;
        e.stopPropagation();
        this.focus(this.items.indexOf(item), { silent: true });
        fromPointer(e);
        const move = (ev) => fromPointer(ev);
        const up = () => {
          window.removeEventListener('pointermove', move);
          window.removeEventListener('pointerup', up);
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
      });
      row.refresh = (bump) => {
        const v = clamp(getSettings()[d.key] ?? 0, 0, 1);
        fill.style.width = `${v * 100}%`;
        knob.style.left = `${v * 100}%`;
        val.textContent = String(Math.round(v * 100));
        if (bump) replayClass(val, 'is-bump');
      };
    } else {
      const options = d.type === 'toggle' ? [{ value: false, label: 'Off' }, { value: true, label: 'On' }] : d.options;
      const seg = h('span', { class: 'tk-seg' });
      const segs = options.map((o) => {
        const s = h('span', { class: 'tk-seg__opt' }, o.label);
        s.addEventListener('click', (e) => {
          if (!this.active) return;
          e.stopPropagation();
          this.focus(this.items.indexOf(item), { silent: true });
          setValue(o.value);
        });
        seg.appendChild(s);
        return s;
      });
      ctrl.append(left, seg, right);
      const cur = () => Math.max(0, options.findIndex((o) => o.value === getSettings()[d.key]));
      item.onAdjust = (dir) => {
        const n = options.length;
        const next = d.type === 'toggle' ? (dir > 0 ? 1 : 0) : clamp(cur() + dir, 0, n - 1);
        setValue(options[next].value);
      };
      item.onConfirm = () => setValue(options[(cur() + 1) % options.length].value);
      row.refresh = (bump) => {
        const c = cur();
        segs.forEach((s, k) => s.classList.toggle('is-on', k === c));
        if (bump) replayClass(segs[c], 'is-bump');
      };
    }
    left.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.active) return;
      this.focus(this.items.indexOf(item), { silent: true });
      item.onAdjust(-1);
    });
    right.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!this.active) return;
      this.focus(this.items.indexOf(item), { silent: true });
      item.onAdjust(1);
    });
    row.el = el;
    return row;
  }

  onShow(params) {
    if (!params.back) this.index = 0;
    for (const r of this.rows) r.refresh(false);
    this.applyFocus();
  }

  reset() {
    this.ui.updateSettings({ ...DEFAULT_SETTINGS });
    for (const r of this.rows) r.refresh(true);
  }

  onBack(fromButton = false) {
    if (!fromButton) this.ui.emit(EVENTS.UI_BACK);
    this.ui.go('main', { back: true });
  }
}

// -----------------------------------------------------------------------------
// Pause
// -----------------------------------------------------------------------------

export class PauseScreen extends Screen {
  constructor(ui) {
    super(ui, 'pause');
    this.outDuration = 260;
  }

  build() {
    this.sub = h('div', { class: 'tk-pause__sub' });
    const list = h('div', { class: 'tk-pause__list' });
    const defs = [
      { label: 'Resume', event: EVENTS.UI_RESUME, c1: '#7dff4a', c2: '#14a84a' },
      { label: 'Restart', event: EVENTS.UI_RESTART, c1: '#ffd23f', c2: '#ff7a1a' },
      { label: 'Quit', event: EVENTS.UI_QUIT, c1: '#ff6a8a', c2: '#d0144a' },
    ];
    defs.forEach((d, i) => {
      const b = h(
        'button',
        { class: 'tk-btn tk-anim-l', type: 'button', style: { '--c1': d.c1, '--c2': d.c2, '--i': i } },
        h('span', { class: 'tk-btn__plate' }, h('span', { class: 'tk-btn__label tk-display' }, d.label), chevrons()),
      );
      this.addItem(b, { onConfirm: () => this.ui.emit(d.event) });
      list.appendChild(b);
    });
    this.columns = 1;
    return h(
      'div',
      { class: 'tk-pause' },
      h('div', { class: 'tk-pause__dim' }),
      h(
        'div',
        { class: 'tk-pause__panel tk-anim-pop' },
        h('div', { class: 'tk-panel__stripes' }),
        h('div', { class: 'tk-pause__title tk-display' }, 'Paused'),
        this.sub,
        list,
      ),
      this.footer({ back: 'Resume', move: true }),
    );
  }

  onShow() {
    this.index = 0;
    const cfg = this.ui.hud.config || {};
    const mode = MODE_INFO[cfg.mode]?.title || '';
    this.sub.textContent = [cfg.trackName, mode].filter(Boolean).join('  ·  ');
    this.applyFocus();
  }

  onBack() {
    this.ui.emit(EVENTS.UI_BACK);
    this.ui.emit(EVENTS.UI_RESUME);
  }
}
