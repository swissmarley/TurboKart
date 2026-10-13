import { EVENTS } from './constants.js';

/**
 * Keyboard + gamepad input.
 *
 * Driving: call `update()` once per rendered frame, then read
 * `getKartControls()`. Steering is digital on keyboard (-1/0/1) and analog on
 * gamepad; the kart physics applies its own steering response curve.
 *
 * Menus: Input emits EVENTS.INPUT_MENU { action } on the bus for both keyboard
 * and gamepad presses, so the UI never needs its own key handling.
 * Escape / gamepad B emit 'back'; P / gamepad Start emit 'pause'. During a race
 * the Game treats both 'back' and 'pause' as a pause request.
 */

const KEY_BINDINGS = {
  throttle: ['ArrowUp', 'KeyW'],
  brake: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  drift: ['Space', 'ShiftLeft', 'ShiftRight'],
  item: ['KeyE', 'KeyX', 'KeyF', 'KeyL'],
  lookBack: ['KeyC', 'KeyQ'],
  pause: ['KeyP'],
};

const MENU_KEYS = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  Enter: 'confirm',
  NumpadEnter: 'confirm',
  Space: 'confirm',
  Escape: 'back',
  Backspace: 'back',
};

// Standard gamepad mapping
const PAD = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  SELECT: 8,
  START: 9,
  UP: 12,
  DOWN: 13,
  LEFT: 14,
  RIGHT: 15,
};

const STICK_DEADZONE = 0.18;

export class Input {
  /**
   * @param {{ bus: import('./EventBus.js').EventBus, target?: Window }} opts
   */
  constructor({ bus, target = window }) {
    this.bus = bus;
    this.target = target;
    this.enabled = true;
    this.keys = new Set();
    this.device = 'keyboard';

    this._prev = { item: false, pause: false };
    this._pressedThisFrame = { item: false, pause: false };
    this._padPrevButtons = [];
    this._padMenuRepeat = { dir: null, time: 0 };
    this._lastUpdate = performance.now();

    this.controls = {
      throttle: 0,
      brake: 0,
      steer: 0,
      drift: false,
      item: false,
      itemPressed: false,
      lookBack: false,
    };

    this._onKeyDown = (e) => {
      if (e.repeat) {
        if (MENU_KEYS[e.code] && ['up', 'down', 'left', 'right'].includes(MENU_KEYS[e.code])) {
          this.bus.emit(EVENTS.INPUT_MENU, { action: MENU_KEYS[e.code], repeat: true });
        }
        if (this._shouldPrevent(e)) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      this._setDevice('keyboard');
      if (KEY_BINDINGS.pause.includes(e.code)) {
        this.bus.emit(EVENTS.INPUT_MENU, { action: 'pause' });
      }
      const menu = MENU_KEYS[e.code];
      if (menu) this.bus.emit(EVENTS.INPUT_MENU, { action: menu });
      if (this._shouldPrevent(e)) e.preventDefault();
    };
    this._onKeyUp = (e) => {
      this.keys.delete(e.code);
    };
    this._onBlur = () => this.keys.clear();

    target.addEventListener('keydown', this._onKeyDown);
    target.addEventListener('keyup', this._onKeyUp);
    target.addEventListener('blur', this._onBlur);
  }

  _shouldPrevent(e) {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return false;
    return e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Backspace';
  }

  _setDevice(device) {
    if (this.device !== device) {
      this.device = device;
      this.bus.emit(EVENTS.INPUT_DEVICE, { device });
    }
  }

  _anyKey(action) {
    for (const code of KEY_BINDINGS[action]) if (this.keys.has(code)) return true;
    return false;
  }

  _getPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) if (p && p.connected) return p;
    return null;
  }

  /** Poll devices. Call exactly once per rendered frame. */
  update() {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this._lastUpdate) / 1000);
    this._lastUpdate = now;

    let throttle = this._anyKey('throttle') ? 1 : 0;
    let brake = this._anyKey('brake') ? 1 : 0;
    let steer = (this._anyKey('right') ? 1 : 0) - (this._anyKey('left') ? 1 : 0);
    let drift = this._anyKey('drift');
    let item = this._anyKey('item');
    let lookBack = this._anyKey('lookBack');
    let pause = false;

    const pad = this._getPad();
    if (pad) {
      const b = (i) => !!(pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5));
      const v = (i) => (pad.buttons[i] ? pad.buttons[i].value : 0);
      const ax = pad.axes[0] || 0;
      const stick = Math.abs(ax) > STICK_DEADZONE ? Math.sign(ax) * ((Math.abs(ax) - STICK_DEADZONE) / (1 - STICK_DEADZONE)) : 0;
      const padSteer = stick !== 0 ? stick : (b(PAD.RIGHT) ? 1 : 0) - (b(PAD.LEFT) ? 1 : 0);
      const padThrottle = Math.max(b(PAD.A) ? 1 : 0, v(PAD.RT));
      const padBrake = Math.max(b(PAD.B) ? 1 : 0, v(PAD.LT) > 0.5 ? 1 : 0);
      const padAny = padThrottle > 0 || padBrake > 0 || padSteer !== 0 || b(PAD.RB) || b(PAD.LB) || b(PAD.Y) || b(PAD.X);
      if (padAny) this._setDevice('gamepad');

      throttle = Math.max(throttle, padThrottle);
      brake = Math.max(brake, padBrake);
      if (padSteer !== 0) steer = padSteer;
      drift = drift || b(PAD.RB);
      item = item || b(PAD.LB) || b(PAD.Y);
      lookBack = lookBack || b(PAD.X);
      pause = b(PAD.START) && !this._padPrevButtons[PAD.START];

      this._pollPadMenu(pad, b, dt);
      this._padPrevButtons = pad.buttons.map((_, i) => b(i));
    }

    if (pause) this.bus.emit(EVENTS.INPUT_MENU, { action: 'pause' });

    const c = this.controls;
    if (!this.enabled) {
      throttle = 0;
      brake = 0;
      steer = 0;
      drift = false;
      item = false;
      lookBack = false;
    }
    c.throttle = throttle;
    c.brake = brake;
    c.steer = Math.max(-1, Math.min(1, steer));
    c.drift = drift;
    c.itemPressed = item && !this._prev.item;
    c.item = item;
    c.lookBack = lookBack;
    this._prev.item = item;
  }

  _pollPadMenu(pad, b, dt) {
    const emit = (action) => this.bus.emit(EVENTS.INPUT_MENU, { action });
    const prev = this._padPrevButtons;
    if (b(PAD.A) && !prev[PAD.A]) emit('confirm');
    if (b(PAD.B) && !prev[PAD.B]) emit('back');

    const ax = pad.axes[0] || 0;
    const ay = pad.axes[1] || 0;
    let dir = null;
    if (b(PAD.UP) || ay < -0.6) dir = 'up';
    else if (b(PAD.DOWN) || ay > 0.6) dir = 'down';
    else if (b(PAD.LEFT) || ax < -0.6) dir = 'left';
    else if (b(PAD.RIGHT) || ax > 0.6) dir = 'right';

    const r = this._padMenuRepeat;
    if (dir !== r.dir) {
      r.dir = dir;
      r.time = 0.38;
      if (dir) emit(dir);
    } else if (dir) {
      r.time -= dt;
      if (r.time <= 0) {
        r.time = 0.11;
        this.bus.emit(EVENTS.INPUT_MENU, { action: dir, repeat: true });
      }
    }
  }

  /** Current driving controls for the player kart (same object every call). */
  getKartControls() {
    return this.controls;
  }

  isDown(action) {
    return this._anyKey(action);
  }

  /** Short rumble on supported gamepads. */
  rumble(strength = 0.5, durationMs = 120) {
    const pad = this._getPad();
    const act = pad && pad.vibrationActuator;
    if (act && act.playEffect) {
      act
        .playEffect('dual-rumble', { duration: durationMs, strongMagnitude: strength, weakMagnitude: strength * 0.6 })
        .catch(() => {});
    }
  }

  dispose() {
    this.target.removeEventListener('keydown', this._onKeyDown);
    this.target.removeEventListener('keyup', this._onKeyUp);
    this.target.removeEventListener('blur', this._onBlur);
  }
}
