import { EVENTS } from '../core/constants.js';
import { h, replayClass } from './util.js';
import { ICONS } from './icons.js';

/**
 * Base class for every interactive menu screen. Handles show/hide
 * animation classes and a focus model driven by INPUT_MENU actions
 * (vertical list, horizontal row or grid) plus mouse hover / click.
 */
export class Screen {
  /**
   * @param {import('./UI.js').UI} ui
   * @param {string} id  UI_SCREEN name
   */
  constructor(ui, id) {
    this.ui = ui;
    this.id = id;
    this.el = null;
    /** @type {Array<{ el: HTMLElement, onConfirm?: Function, onAdjust?: Function, disabled?: boolean, silent?: boolean }>} */
    this.items = [];
    this.index = 0;
    this.columns = 1; // 1 = vertical list, n = grid with n columns
    this.active = false;
    this.outDuration = 360;
    this._hideTimer = 0;
  }

  /** Lazily build the DOM. */
  ensure() {
    if (!this.el) {
      this.el = this.build();
      this.el.classList.add('tk-screen', `tk-screen--${this.id}`);
      this.el.hidden = true;
      this.ui.screensLayer.appendChild(this.el);
    }
    return this.el;
  }

  build() {
    return h('div');
  }

  get visible() {
    return !!this.el && !this.el.hidden;
  }

  show(params = {}) {
    this.ensure();
    clearTimeout(this._hideTimer);
    this.active = true;
    this.el.hidden = false;
    this.el.classList.remove('is-out');
    this.el.classList.toggle('is-back', !!params.back);
    replayClass(this.el, 'is-in');
    this.onShow(params);
    this.applyFocus();
  }

  hide(immediate = false) {
    if (!this.el || this.el.hidden) {
      this.active = false;
      return;
    }
    const wasActive = this.active;
    this.active = false;
    clearTimeout(this._hideTimer);
    const done = () => {
      if (this.active || !this.el) return;
      this.el.hidden = true;
      this.el.classList.remove('is-out', 'is-in');
      this.onHidden();
    };
    if (immediate || !wasActive) {
      done();
    } else {
      this.el.classList.remove('is-in');
      this.el.classList.add('is-out');
      this._hideTimer = setTimeout(done, this.outDuration);
    }
    this.onHide();
  }

  onShow() {}
  onHide() {}
  onHidden() {}
  onFocus() {}

  // ---------------------------------------------------------------------------
  // Focus
  // ---------------------------------------------------------------------------

  /** Register a focusable element. Returns the item record. */
  addItem(el, opts = {}) {
    const item = { el, ...opts };
    const index = this.items.length;
    this.items.push(item);
    el.classList.add('tk-focusable');
    el.addEventListener('pointermove', () => {
      if (!this.active || this.index === index || item.disabled) return;
      this.focus(index);
    });
    el.addEventListener('click', (e) => {
      if (!this.active || item.disabled) return;
      e.stopPropagation();
      if (this.index !== index) this.focus(index, { silent: true });
      if (item.clickToConfirm === false) return;
      this.activate(index);
    });
    return item;
  }

  clearItems() {
    this.items = [];
    this.index = 0;
  }

  focus(index, { silent = false } = {}) {
    if (index < 0 || index >= this.items.length) return;
    const changed = index !== this.index;
    this.index = index;
    this.applyFocus();
    if (changed) {
      if (!silent) this.ui.emit(EVENTS.UI_NAVIGATE);
      this.onFocus(this.items[index], index);
    }
  }

  applyFocus() {
    for (let i = 0; i < this.items.length; i++) {
      const on = i === this.index;
      const el = this.items[i].el;
      if (el.classList.contains('is-focused') !== on) {
        el.classList.toggle('is-focused', on);
        if (on) replayClass(el, 'is-focus-anim');
      }
    }
  }

  activate(index = this.index) {
    const item = this.items[index];
    if (!item || item.disabled) return;
    if (!item.silent) this.ui.emit(EVENTS.UI_CONFIRM);
    replayClass(item.el, 'is-pressed');
    if (item.onConfirm) item.onConfirm(item, index);
  }

  /** INPUT_MENU action dispatch. */
  handleAction(action) {
    const item = this.items[this.index];
    if (action === 'left' || action === 'right') {
      if (item && item.onAdjust) {
        item.onAdjust(action === 'left' ? -1 : 1);
        return;
      }
    }
    if (action === 'up' || action === 'down' || action === 'left' || action === 'right') {
      this.move(action);
    } else if (action === 'confirm') {
      this.activate();
    } else if (action === 'back') {
      this.onBack();
    }
  }

  move(dir) {
    const n = this.items.length;
    if (!n) return;
    const cols = Math.max(1, Math.min(this.columns, n));
    const rows = Math.ceil(n / cols);
    let row = Math.floor(this.index / cols);
    let col = this.index % cols;
    if (cols === 1 && (dir === 'left' || dir === 'right')) return;
    if (rows === 1 && (dir === 'up' || dir === 'down')) return;
    const rowLen = (r) => Math.min(cols, n - r * cols);
    if (dir === 'left') col = (col - 1 + rowLen(row)) % rowLen(row);
    else if (dir === 'right') col = (col + 1) % rowLen(row);
    else if (dir === 'up') {
      row = (row - 1 + rows) % rows;
      col = Math.min(col, rowLen(row) - 1);
    } else if (dir === 'down') {
      row = (row + 1) % rows;
      col = Math.min(col, rowLen(row) - 1);
    }
    let next = row * cols + col;
    // Skip disabled items in the travel direction (bounded)
    let guard = n;
    while (this.items[next] && this.items[next].disabled && guard-- > 0) {
      next = (next + (dir === 'left' || dir === 'up' ? -1 : 1) + n) % n;
    }
    this.focus(next);
  }

  onBack() {}

  // ---------------------------------------------------------------------------
  // Shared chrome
  // ---------------------------------------------------------------------------

  header(title, crumbs = []) {
    this._crumbs = h('div', { class: 'tk-header__crumbs' });
    this._title = h('h1', { class: 'tk-header__title' }, h('span', { class: 'tk-display' }, title));
    const el = h('header', { class: 'tk-header tk-anim-l' }, this._crumbs, this._title);
    this.setCrumbs(crumbs);
    return el;
  }

  setCrumbs(crumbs) {
    if (!this._crumbs) return;
    this._crumbs.innerHTML = '';
    crumbs.filter(Boolean).forEach((c, i) => {
      if (i) this._crumbs.appendChild(h('i', { class: 'tk-crumb-sep' }, '›'));
      this._crumbs.appendChild(h('span', null, c));
    });
  }

  footer({ back = true, select = 'Select', move = true, extra = [] } = {}) {
    const prompts = [];
    if (back) {
      const b = h(
        'button',
        { class: 'tk-prompt tk-prompt--btn', type: 'button' },
        h('span', { class: 'tk-key k' }, 'Esc'),
        h('span', { class: 'tk-key g tk-key--b' }, 'B'),
        typeof back === 'string' ? back : 'Back',
      );
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.active) this.onBack();
      });
      prompts.push(b);
    }
    if (select) {
      prompts.push(
        h('span', { class: 'tk-prompt' }, h('span', { class: 'tk-key k' }, 'Enter'), h('span', { class: 'tk-key g tk-key--a' }, 'A'), select),
      );
    }
    if (move) {
      prompts.push(
        h(
          'span',
          { class: 'tk-prompt' },
          h('span', { class: 'tk-key k tk-key--arrows', html: '&#8592;&#8593;&#8594;&#8595;' }),
          h('span', { class: 'tk-key g tk-key--dpad', html: ICONS_DPAD }),
          'Move',
        ),
      );
    }
    for (const x of extra) prompts.push(x);
    return h('footer', { class: 'tk-footer tk-anim-d' }, prompts);
  }

  backButton() {
    const b = h('button', { class: 'tk-backbtn tk-anim-l', type: 'button', html: ICONS.back() });
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.active) this.onBack();
    });
    return b;
  }
}

const ICONS_DPAD =
  '<svg viewBox="0 0 24 24" class="tk-dpad" aria-hidden="true"><path d="M9 2h6v7h7v6h-7v7H9v-7H2V9h7z" fill="currentColor"/></svg>';
