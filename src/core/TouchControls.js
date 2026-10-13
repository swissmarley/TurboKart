/**
 * On-screen touch controls for phones and tablets.
 *
 * Only created when the device's primary pointer is a finger (`pointer: coarse`),
 * so desktops — including touchscreen laptops — never see any of this.
 *
 * Layout (landscape): a floating steering stick anywhere on the left half,
 * DRIFT / ITEM / BRAKE buttons on the right, PAUSE at the top centre.
 * The kart auto-accelerates while racing; during the countdown, holding any
 * finger on the screen revs the engine so rocket starts still work.
 */

export const IS_MOBILE =
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches &&
  (navigator.maxTouchPoints || 0) > 0;

const STEER_DEADZONE = 0.1;

const ICON = {
  drift:
    '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M10 33c4-12 14-19 28-19" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M31 7l9 7-9 8" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="39" r="3.5" fill="currentColor"/><circle cx="21" cy="41" r="2.5" fill="currentColor" opacity=".7"/></svg>',
  item:
    '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="8" y="8" width="32" height="32" rx="7" fill="none" stroke="currentColor" stroke-width="4.5"/><path d="M19 19.5a5.5 5.5 0 1 1 7.6 5.1c-1.6.7-2.6 1.8-2.6 3.6v1.3" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round"/><circle cx="24" cy="35" r="2.8" fill="currentColor"/></svg>',
  brake:
    '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="13" y="9" width="22" height="30" rx="5" fill="none" stroke="currentColor" stroke-width="4.5"/><path d="M18 17h12M18 24h12M18 31h12" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/></svg>',
  pause:
    '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="13" y="11" width="8" height="26" rx="2.5" fill="currentColor"/><rect x="27" y="11" width="8" height="26" rx="2.5" fill="currentColor"/></svg>',
  rotate:
    '<svg viewBox="0 0 96 96" aria-hidden="true"><rect x="30" y="14" width="36" height="62" rx="7" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="48" cy="67" r="3" fill="currentColor"/><path d="M18 52a32 32 0 0 0 26 30" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M38 76l7 6-7 6" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const DRIFT_COLORS = ['#ffffff', '#3fb4ff', '#ff8a1f', '#c45bff'];

const CSS = `
.tkt { position: fixed; inset: 0; z-index: 20; pointer-events: none; touch-action: none;
  font-family: 'Lilita One', 'Arial Rounded MT Bold', sans-serif; color: #fff;
  --s: min(1vh, 0.5625vw); -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
.tkt * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
.tkt__race { position: absolute; inset: 0; opacity: 0; visibility: hidden; transition: opacity .25s ease, visibility 0s .25s; }
.tkt.is-active .tkt__race { opacity: 1; visibility: visible; transition: opacity .25s ease; }
.tkt.is-active .tkt__zone, .tkt.is-active .tkt__btn { pointer-events: auto; }

.tkt__zone { position: absolute; left: 0; bottom: 0; width: 48%; height: 72%; touch-action: none; }
.tkt__stick { position: absolute; width: calc(var(--s) * 26); height: calc(var(--s) * 26); margin: calc(var(--s) * -13) 0 0 calc(var(--s) * -13);
  border-radius: 50%; border: calc(var(--s) * .6) solid rgba(255,255,255,.55);
  background: radial-gradient(circle, rgba(30,18,80,.25), rgba(30,18,80,.55)); opacity: .55; transition: opacity .15s;
  left: calc(env(safe-area-inset-left, 0px) + var(--s) * 22); top: 72%; }
.tkt__stick::before, .tkt__stick::after { content: ''; position: absolute; top: 50%; width: calc(var(--s) * 3); height: calc(var(--s) * 3); margin-top: calc(var(--s) * -1.5);
  border: solid rgba(255,255,255,.7); border-width: 0 0 calc(var(--s) * .6) calc(var(--s) * .6); }
.tkt__stick::before { left: calc(var(--s) * 2.4); transform: rotate(45deg); }
.tkt__stick::after { right: calc(var(--s) * 2.4); transform: rotate(-135deg); }
.tkt__stick.is-held { opacity: 1; }
.tkt__knob { position: absolute; left: 50%; top: 50%; width: calc(var(--s) * 12); height: calc(var(--s) * 12); margin: calc(var(--s) * -6) 0 0 calc(var(--s) * -6);
  border-radius: 50%; background: radial-gradient(circle at 40% 35%, #fff, #c9d4ff 55%, #7f8cff);
  box-shadow: 0 calc(var(--s) * .6) calc(var(--s) * 2) rgba(0,0,0,.45); }

.tkt__btn { position: absolute; display: grid; place-items: center; border-radius: 50%; touch-action: none;
  border: calc(var(--s) * .6) solid rgba(255,255,255,.75);
  background: radial-gradient(circle at 50% 30%, rgba(110,86,230,.72), rgba(28,16,78,.78) 75%);
  box-shadow: 0 calc(var(--s) * .8) calc(var(--s) * 2.4) rgba(0,0,0,.4), inset 0 calc(var(--s) * -.8) 0 rgba(0,0,0,.25);
  transition: transform .08s ease, filter .08s ease, box-shadow .15s ease; }
.tkt__btn svg { width: 46%; height: 46%; filter: drop-shadow(0 2px 2px rgba(0,0,0,.35)); }
.tkt__btn span { position: absolute; bottom: 12%; font-size: calc(var(--s) * 2.2); letter-spacing: .04em; text-shadow: 0 2px 0 rgba(0,0,0,.4); }
.tkt__btn.is-down { transform: scale(.9); filter: brightness(1.35); }

.tkt__drift { width: calc(var(--s) * 25); height: calc(var(--s) * 25);
  right: calc(env(safe-area-inset-right, 0px) + var(--s) * 5); bottom: calc(var(--s) * 7); --glow: #fff; }
.tkt__drift.is-charged { border-color: var(--glow); box-shadow: 0 0 calc(var(--s) * 4) var(--glow), inset 0 0 calc(var(--s) * 3) var(--glow); }
.tkt__item { width: calc(var(--s) * 18); height: calc(var(--s) * 18);
  right: calc(env(safe-area-inset-right, 0px) + var(--s) * 27); bottom: calc(var(--s) * 27);
  background: radial-gradient(circle at 50% 30%, rgba(255,190,70,.7), rgba(120,40,20,.78) 75%); }
.tkt__item.is-ready { animation: tkt-ready 1s ease-in-out infinite; }
@keyframes tkt-ready { 50% { box-shadow: 0 0 calc(var(--s) * 4) #ffd23f, inset 0 0 calc(var(--s) * 2) #ffd23f; } }
.tkt__brake { width: calc(var(--s) * 15); height: calc(var(--s) * 15);
  right: calc(env(safe-area-inset-right, 0px) + var(--s) * 32); bottom: calc(var(--s) * 5);
  background: radial-gradient(circle at 50% 30%, rgba(255,90,110,.65), rgba(90,10,30,.78) 75%); }
.tkt__pause { width: calc(var(--s) * 10); height: calc(var(--s) * 10); left: 50%; margin-left: calc(var(--s) * -5);
  top: calc(env(safe-area-inset-top, 0px) + var(--s) * 2.5); border-width: calc(var(--s) * .45); }
.tkt__pause svg { width: 52%; height: 52%; }

.tkt__rotate { position: fixed; inset: 0; z-index: 30; display: none; flex-direction: column; align-items: center; justify-content: center; gap: 18px;
  background: radial-gradient(circle at 50% 40%, #3a1f8a, #0b0a1f 75%); text-align: center; padding: 24px; pointer-events: auto; }
.tkt__rotate svg { width: 96px; height: 96px; animation: tkt-rot 2.2s ease-in-out infinite; }
.tkt__rotate b { font-size: 30px; letter-spacing: .02em; background: linear-gradient(#ffe36b, #ff8a1f); -webkit-background-clip: text; background-clip: text; color: transparent; }
.tkt__rotate p { margin: 0; font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 16px; opacity: .85; }
@keyframes tkt-rot { 0%, 20% { transform: rotate(0); } 55%, 100% { transform: rotate(-90deg); } }
@media (orientation: portrait) { .tkt__rotate { display: flex; } }

/* --- HUD / menu adjustments for touch (only applied while the UI is in touch mode) --- */
.tk-ui[data-device="touch"] .tk-prompt:not(.tk-prompt--btn) { display: none !important; }
.tk-ui[data-device="touch"] .tk-hud__bl { top: calc(var(--u) * 23); bottom: auto; }
.tk-ui[data-device="touch"] .tk-hud__br { top: calc(var(--u) * 3); bottom: auto; left: calc(var(--u) * 23); right: auto; }
.tk-ui[data-device="touch"] .tk-hud__br .tk-speedo { display: none; }
.tk-ui[data-device="touch"] .tk-fps { display: none; }
`;

export class TouchControls {
  /**
   * @param {{ bus: any, onPause: () => void }} opts
   */
  constructor({ bus, onPause }) {
    this.bus = bus;
    this.onPause = onPause;
    this.active = false;
    this.autoThrottle = false;
    this.state = { steer: 0, steerActive: false, drift: false, item: false, brake: false, anyTouch: false };
    this._touches = new Set();
    this._stick = null; // { id, baseX, baseY }
    this._driftLevel = -1;
    this._itemReady = null;

    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    this.el = document.createElement('div');
    this.el.className = 'tkt';
    this.el.innerHTML = `
      <div class="tkt__race">
        <div class="tkt__zone"><div class="tkt__stick"><div class="tkt__knob"></div></div></div>
        <button class="tkt__btn tkt__brake" type="button" aria-label="Brake">${ICON.brake}<span>BRAKE</span></button>
        <button class="tkt__btn tkt__item" type="button" aria-label="Use item">${ICON.item}<span>ITEM</span></button>
        <button class="tkt__btn tkt__drift" type="button" aria-label="Hop and drift">${ICON.drift}<span>DRIFT</span></button>
        <button class="tkt__btn tkt__pause" type="button" aria-label="Pause">${ICON.pause}</button>
      </div>
      <div class="tkt__rotate">${ICON.rotate}<b>Rotate your device</b><p>TurboKart plays in landscape.</p></div>`;
    document.body.appendChild(this.el);

    this.zone = this.el.querySelector('.tkt__zone');
    this.stick = this.el.querySelector('.tkt__stick');
    this.knob = this.el.querySelector('.tkt__knob');
    this.driftBtn = this.el.querySelector('.tkt__drift');
    this.itemBtn = this.el.querySelector('.tkt__item');

    this._bindStick();
    this._bindHold(this.driftBtn, 'drift');
    this._bindHold(this.itemBtn, 'item');
    this._bindHold(this.el.querySelector('.tkt__brake'), 'brake');
    const pause = this.el.querySelector('.tkt__pause');
    pause.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.active) this.onPause();
    });

    // Any finger anywhere counts for the countdown rev / rocket start.
    const down = (e) => {
      if (e.pointerType !== 'touch') return;
      this._touches.add(e.pointerId);
      this.state.anyTouch = true;
    };
    const up = (e) => {
      this._touches.delete(e.pointerId);
      this.state.anyTouch = this._touches.size > 0;
    };
    window.addEventListener('pointerdown', down, { capture: true, passive: true });
    window.addEventListener('pointerup', up, { capture: true, passive: true });
    window.addEventListener('pointercancel', up, { capture: true, passive: true });
    // Block the long-press context menu / callout on the controls.
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _bindHold(btn, key) {
    const press = (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        btn.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this.state[key] = true;
      btn.classList.add('is-down');
      if (navigator.vibrate) navigator.vibrate(8);
    };
    const release = () => {
      this.state[key] = false;
      btn.classList.remove('is-down');
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
  }

  _bindStick() {
    const zone = this.zone;
    const radius = () => this.stick.getBoundingClientRect().width * 0.5;

    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this._stick) return;
      try {
        zone.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      const rect = zone.getBoundingClientRect();
      this._stick = { id: e.pointerId, baseX: e.clientX, baseY: e.clientY };
      this.stick.style.left = `${e.clientX - rect.left}px`;
      this.stick.style.top = `${e.clientY - rect.top}px`;
      this.stick.classList.add('is-held');
      this._moveStick(e.clientX, e.clientY, radius());
    });
    zone.addEventListener('pointermove', (e) => {
      if (!this._stick || e.pointerId !== this._stick.id) return;
      this._moveStick(e.clientX, e.clientY, radius());
    });
    const end = (e) => {
      if (!this._stick || e.pointerId !== this._stick.id) return;
      this._releaseStick();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    zone.addEventListener('lostpointercapture', end);
  }

  _moveStick(x, y, r) {
    const s = this._stick;
    let dx = x - s.baseX;
    const dy = y - s.baseY;
    // Floating base: drag far past the rim and the base follows the thumb.
    const max = r * 1.35;
    if (Math.abs(dx) > max) {
      const shift = dx - Math.sign(dx) * max;
      s.baseX += shift;
      dx -= shift;
      const rect = this.zone.getBoundingClientRect();
      this.stick.style.left = `${s.baseX - rect.left}px`;
    }
    let v = dx / r;
    v = Math.max(-1, Math.min(1, v));
    const mag = Math.abs(v);
    const steer = mag < STEER_DEADZONE ? 0 : Math.sign(v) * ((mag - STEER_DEADZONE) / (1 - STEER_DEADZONE));
    this.state.steer = steer;
    this.state.steerActive = true;
    const ky = Math.max(-r * 0.35, Math.min(r * 0.35, dy));
    this.knob.style.transform = `translate(${v * r}px, ${ky}px)`;
  }

  _releaseStick() {
    this._stick = null;
    this.state.steer = 0;
    this.state.steerActive = false;
    this.knob.style.transform = '';
    this.stick.classList.remove('is-held');
    this.stick.style.left = '';
    this.stick.style.top = '';
  }

  /** Show/hide the race controls. Hiding releases every held control. */
  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    this.el.classList.toggle('is-active', on);
    if (!on) {
      this._releaseStick();
      this.state.drift = this.state.item = this.state.brake = false;
      this.el.querySelectorAll('.is-down').forEach((b) => b.classList.remove('is-down'));
    }
  }

  /** Throttle contributed by touch: auto while racing, any finger during the countdown. */
  throttle() {
    if (this.state.brake) return 0;
    if (this.autoThrottle) return 1;
    return this.state.anyTouch ? 1 : 0;
  }

  setDriftLevel(level) {
    if (level === this._driftLevel) return;
    this._driftLevel = level;
    this.driftBtn.classList.toggle('is-charged', level > 0);
    this.driftBtn.style.setProperty('--glow', DRIFT_COLORS[level] || '#fff');
  }

  setItemReady(ready) {
    if (ready === this._itemReady) return;
    this._itemReady = ready;
    this.itemBtn.classList.toggle('is-ready', ready);
  }
}
