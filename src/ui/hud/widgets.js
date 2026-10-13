/**
 * HUD widgets: item slot (with roulette), speedometer gauge (with drift
 * charge + boost glow) and the split-flap style race timer.
 */
import { ITEMS, ITEM_INFO, DRIFT_LEVELS } from '../../core/constants.js';
import { h, replayClass, clamp, formatTime, uid } from '../util.js';
import { itemIconSVG, isTripleItem } from '../icons.js';

const ROULETTE_ORDER = [
  ITEMS.MUSHROOM,
  ITEMS.BANANA,
  ITEMS.GREEN_SHELL,
  ITEMS.STAR,
  ITEMS.RED_SHELL,
  ITEMS.COIN,
  ITEMS.LIGHTNING,
  ITEMS.TRIPLE_MUSHROOM,
  ITEMS.BOMB,
  ITEMS.GOLDEN_MUSHROOM,
  ITEMS.TRIPLE_GREEN_SHELL,
  ITEMS.SPINY_SHELL,
  ITEMS.TRIPLE_BANANA,
  ITEMS.TRIPLE_RED_SHELL,
];

const ROLL_KEYFRAMES = [
  { translate: '0 -45%', opacity: 0.4 },
  { translate: '0 0', opacity: 1 },
];
const ROLL_TIMING = { duration: 80, easing: 'linear' };

const GOLDEN_DURATION = (ITEM_INFO[ITEMS.GOLDEN_MUSHROOM] && ITEM_INFO[ITEMS.GOLDEN_MUSHROOM].duration) || 7.5;

// -----------------------------------------------------------------------------
// Item slot
// -----------------------------------------------------------------------------

export class ItemSlot {
  constructor() {
    this.icons = new Map();
    const stack = h('div', { class: 'tk-item__icons' });
    for (const type of Object.values(ITEMS)) {
      const wrap = h('div', { class: 'tk-item__icon', html: itemIconSVG(type) });
      this.icons.set(type, wrap);
      stack.appendChild(wrap);
    }
    this.count = h('div', { class: 'tk-item__count tk-display' });
    this.ringFill = null;
    const rid = uid('ir');
    this.ring = h('div', {
      class: 'tk-item__timer',
      html: `<svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="${rid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff6b0"/><stop offset="1" stop-color="#ffb000"/></linearGradient></defs>
        <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(20,10,40,.6)" stroke-width="7"/>
        <circle class="tk-item__timerfill" cx="50" cy="50" r="46" fill="none" stroke="url(#${rid})" stroke-width="7" stroke-linecap="round" pathLength="100" stroke-dasharray="100 100" transform="rotate(-90 50 50)"/></svg>`,
    });
    this.ringFill = this.ring.querySelector('.tk-item__timerfill');
    this.label = h('div', { class: 'tk-item__label' });
    this.stack = stack;
    this.el = h(
      'div',
      { class: 'tk-item is-empty' },
      h('div', { class: 'tk-item__bubble' }, h('div', { class: 'tk-item__shine' }), stack, h('div', { class: 'tk-item__flash' })),
      this.ring,
      this.count,
      this.label,
    );
    this.reset();
  }

  reset() {
    this.current = null; // icon shown
    this.type = null; // held item
    this.countVal = 0;
    this.rolling = false;
    this.rollIdx = Math.floor(Math.random() * ROULETTE_ORDER.length);
    this.nextSwap = 0;
    this.goldenStart = 0;
    this.goldenFrac = -1;
    this.holding = false;
    this.el.classList.remove('is-holding');
    this._show(null);
    this.el.classList.add('is-empty');
    this.el.classList.remove('is-rolling', 'is-golden');
    this.count.textContent = '';
    this.label.textContent = '';
  }

  _show(type) {
    if (type === this.current) return;
    if (this.current && this.icons.get(this.current)) this.icons.get(this.current).classList.remove('is-on');
    this.current = type;
    if (type && this.icons.get(type)) this.icons.get(type).classList.add('is-on');
  }

  /** Called when the player starts using a golden mushroom (from ITEM_USE). */
  onGoldenUse(now) {
    if (!this.goldenStart) this.goldenStart = now;
  }

  update(item, now) {
    const type = item ? item.type || null : null;
    const roulette = !!(item && item.roulette);
    const count = item ? item.count || 0 : 0;

    if (roulette) {
      if (!this.rolling) {
        this.rolling = true;
        this.rollStart = now;
        this.nextSwap = 0;
        this.el.classList.remove('is-empty', 'is-used');
        this.el.classList.add('is-rolling');
        this.count.textContent = '';
        this.label.textContent = '';
      }
      if (now >= this.nextSwap) {
        this.rollIdx = (this.rollIdx + 1) % ROULETTE_ORDER.length;
        this._show(ROULETTE_ORDER[this.rollIdx]);
        // Web Animations API: no forced reflow in the per-frame path
        const icon = this.icons.get(this.current);
        if (icon && icon.animate) icon.animate(ROLL_KEYFRAMES, ROLL_TIMING);
        const t = clamp((now - this.rollStart) / 2400, 0, 1);
        this.nextSwap = now + 50 + t * t * 230;
      }
      return;
    }

    if (this.rolling) {
      this.rolling = false;
      this.el.classList.remove('is-rolling');
      if (type) {
        this.type = null; // force refresh below
        replayClass(this.el, 'is-landed');
      }
    }

    if (type !== this.type) {
      const prev = this.type;
      this.type = type;
      this.goldenStart = 0;
      this.goldenFrac = -1;
      if (type) {
        this._show(type);
        this.el.classList.remove('is-empty', 'is-used');
        if (!prev) replayClass(this.el, 'is-landed');
        this.label.textContent = (ITEM_INFO[type] && ITEM_INFO[type].name) || '';
        replayClass(this.label, 'is-show');
      } else {
        this.el.classList.add('is-empty');
        replayClass(this.el, 'is-used');
        this.label.textContent = '';
        this.label.classList.remove('is-show');
        // keep the last icon visible during the "used" animation, then clear
        this._clearAt = now + 260;
      }
      this.el.classList.toggle('is-golden', type === ITEMS.GOLDEN_MUSHROOM);
      this.countVal = -1;
    }
    if (!type && this._clearAt && now >= this._clearAt) {
      this._clearAt = 0;
      if (!this.type) this._show(null);
    }

    if (count !== this.countVal) {
      const prevCount = this.countVal;
      this.countVal = count;
      const triple = isTripleItem(type);
      const showCount = type && type !== ITEMS.GOLDEN_MUSHROOM && (count > 1 || (triple && count >= 1));
      this.count.textContent = showCount ? `×${count}` : '';
      this.count.classList.toggle('is-on', !!showCount);
      if (triple) {
        const svg = this.icons.get(type).firstElementChild;
        if (svg) svg.dataset.count = String(clamp(count, 1, 3));
      }
      if (prevCount > count && count > 0) {
        replayClass(this.el, 'is-use');
        replayClass(this.count, 'is-bump');
      }
    }

    const holding = !!(item && item.holding && type);
    if (holding !== this.holding) {
      this.holding = holding;
      this.el.classList.toggle('is-holding', holding);
    }

    // golden mushroom timer ring
    if (type === ITEMS.GOLDEN_MUSHROOM) {
      // remaining time: hud.item.golden (ItemSystem.getItemState) / hud.item.timer, else our own ITEM_USE clock
      let frac = 1;
      const remaining = item && Number.isFinite(item.golden) && item.golden > 0 ? item.golden : item && Number.isFinite(item.timer) ? item.timer : null;
      if (remaining !== null) frac = clamp(remaining / (item.duration || GOLDEN_DURATION), 0, 1);
      else if (this.goldenStart) frac = clamp(1 - (now - this.goldenStart) / (GOLDEN_DURATION * 1000), 0, 1);
      if (Math.abs(frac - this.goldenFrac) > 0.004) {
        this.goldenFrac = frac;
        this.ringFill.setAttribute('stroke-dasharray', `${(frac * 100).toFixed(2)} 100`);
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Speedometer
// -----------------------------------------------------------------------------

function arcPath(cx, cy, r, a0, a1) {
  const rad = (a) => (a * Math.PI) / 180;
  const x0 = cx + r * Math.cos(rad(a0));
  const y0 = cy + r * Math.sin(rad(a0));
  const x1 = cx + r * Math.cos(rad(a1));
  const y1 = cy + r * Math.sin(rad(a1));
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

export class Speedometer {
  constructor({ max = 180 } = {}) {
    this.max = max;
    const id = uid('sp');
    const arc = arcPath(100, 100, 78, 135, 405);
    let ticks = '';
    for (let i = 0; i <= 12; i++) {
      const a = ((135 + i * 22.5) * Math.PI) / 180;
      const major = i % 2 === 0;
      const r0 = major ? 56 : 60;
      const r1 = 66;
      ticks += `<line x1="${(100 + Math.cos(a) * r0).toFixed(1)}" y1="${(100 + Math.sin(a) * r0).toFixed(1)}" x2="${(100 + Math.cos(a) * r1).toFixed(1)}" y2="${(100 + Math.sin(a) * r1).toFixed(1)}" stroke="${i >= 10 ? '#ff5a6e' : 'rgba(255,255,255,.75)'}" stroke-width="${major ? 3.4 : 2}" stroke-linecap="round"/>`;
    }
    this.el = h(
      'div',
      { class: 'tk-speedo', 'data-drift': '0' },
      h('div', {
        class: 'tk-speedo__dial',
        html: `<svg viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <linearGradient id="${id}g" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stop-color="#22d3ff"/><stop offset=".55" stop-color="#7dff4a"/><stop offset=".8" stop-color="#ffd23f"/><stop offset="1" stop-color="#ff3d4d"/>
          </linearGradient>
          <radialGradient id="${id}f" cx=".5" cy=".38" r=".62">
            <stop offset="0" stop-color="#3a2f8f"/><stop offset=".75" stop-color="#171046"/><stop offset="1" stop-color="#0b0726"/>
          </radialGradient>
          <filter id="${id}b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter>
        </defs>
        <circle cx="100" cy="100" r="97" fill="#1d0f2e"/>
        <circle class="tk-speedo__ring" cx="100" cy="100" r="92" fill="url(#${id}f)" stroke="rgba(255,255,255,.9)" stroke-width="4"/>
        <path d="${arc}" fill="none" stroke="rgba(0,0,0,.45)" stroke-width="17" stroke-linecap="round"/>
        ${ticks}
        <path class="tk-speedo__boost" d="${arc}" pathLength="100" fill="none" stroke="#ffae1f" stroke-width="22" stroke-linecap="round" stroke-dasharray="0 100" filter="url(#${id}b)"/>
        <path class="tk-speedo__fill" d="${arc}" pathLength="100" fill="none" stroke="url(#${id}g)" stroke-width="13" stroke-linecap="round" stroke-dasharray="0 100"/>
        <path d="${arcPath(100, 100, 78, 140, 230)}" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="3" stroke-linecap="round"/>
      </svg>`,
      }),
      h('div', { class: 'tk-speedo__num tk-display' }, '0'),
      h('div', { class: 'tk-speedo__unit' }, 'km/h'),
      h('div', { class: 'tk-drift' }, h('i'), h('i'), h('i')),
    );
    this.fill = this.el.querySelector('.tk-speedo__fill');
    this.boostArc = this.el.querySelector('.tk-speedo__boost');
    this.num = this.el.querySelector('.tk-speedo__num');
    this.driftEl = this.el.querySelector('.tk-drift');
    this.prev = { speed: -1, pct: -1, boost: null, drift: -1, charge: -1 };
  }

  reset() {
    this.prev = { speed: -1, pct: -1, boost: null, drift: -1, charge: -1 };
  }

  update(speed, boosting, driftLevel, driftCharge) {
    const p = this.prev;
    const s = Math.max(0, Math.round(Math.abs(Number(speed) || 0)));
    if (s !== p.speed) {
      p.speed = s;
      this.num.textContent = String(s);
      const pct = Math.round(clamp(s / this.max, 0, 1) * 1000) / 10;
      if (pct !== p.pct) {
        p.pct = pct;
        const dash = `${pct} 100`;
        this.fill.setAttribute('stroke-dasharray', dash);
        this.boostArc.setAttribute('stroke-dasharray', dash);
      }
    }
    const b = !!boosting;
    if (b !== p.boost) {
      p.boost = b;
      this.el.classList.toggle('is-boost', b);
    }
    const lvl = clamp(driftLevel | 0, 0, 3);
    if (lvl !== p.drift) {
      const up = lvl > p.drift && p.drift >= 0;
      p.drift = lvl;
      this.el.dataset.drift = String(lvl);
      if (up && lvl > 0) replayClass(this.driftEl, 'is-up');
    }
    // optional continuous charge (seconds) → partial fill of the next pip
    if (Number.isFinite(driftCharge)) {
      const next = DRIFT_LEVELS[Math.min(3, lvl + 1)];
      const cur = DRIFT_LEVELS[lvl];
      const f = lvl >= 3 ? 1 : clamp((driftCharge - cur.chargeTime) / Math.max(0.01, next.chargeTime - cur.chargeTime), 0, 1);
      const q = Math.round(f * 20) / 20;
      if (q !== p.charge) {
        p.charge = q;
        this.driftEl.style.setProperty('--charge', String(q));
      }
    }
  }
}

// -----------------------------------------------------------------------------
// Race timer (digit cells so the width never jitters)
// -----------------------------------------------------------------------------

export class RaceTimer {
  constructor(label = 'Time') {
    this.digits = h('span', { class: 'tk-timer__digits tk-display' });
    this.el = h('div', { class: 'tk-timer__row' }, h('span', { class: 'tk-timer__label' }, label), this.digits);
    this.cells = [];
    this.text = '';
  }

  set(seconds) {
    const str = formatTime(Number.isFinite(seconds) ? Math.max(0, seconds) : 0);
    if (str === this.text) return;
    if (str.length !== this.cells.length) {
      this.digits.innerHTML = '';
      this.cells = [...str].map((ch) => {
        const c = h('span', { class: /\d/.test(ch) ? 'd' : 's' }, ch);
        this.digits.appendChild(c);
        return c;
      });
    } else {
      for (let i = 0; i < str.length; i++) {
        if (str[i] !== this.text[i]) this.cells[i].textContent = str[i];
      }
    }
    this.text = str;
  }
}
