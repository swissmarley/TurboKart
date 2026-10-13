/**
 * In-race HUD + transient race overlays (countdown, lap banners, finish,
 * wrong way, spiny warning, track intro card).
 * `update(hud)` runs every frame: every DOM write is guarded by a change check.
 */
import { GAME_MODES, ITEMS } from '../../core/constants.js';
import { h, replayClass, ordinalSuffix, formatTime, toCss } from '../util.js';
import { ICONS, itemIconSVG } from '../icons.js';
import { ItemSlot, Speedometer, RaceTimer } from './widgets.js';
import { Minimap } from './Minimap.js';

export class HUD {
  constructor(ui) {
    this.ui = ui;
    this.config = null;
    this.visible = false;
    this._hideTimer = 0;
    this._timers = {};

    // --- widgets --------------------------------------------------------------
    this.item = new ItemSlot();
    this.speedo = new Speedometer();
    this.minimap = new Minimap();
    this.timer = new RaceTimer('Time');

    this.posNumB = h('b', null, '1');
    this.posNum = h('span', { class: 'tk-pos__num', 'data-t': '1' }, this.posNumB);
    this.posSufB = h('b', null, 'st');
    this.posSuf = h('span', { class: 'tk-pos__suf', 'data-t': 'st' }, this.posSufB);
    this.posOf = h('span', { class: 'tk-pos__of' }, '/8');
    this.pos = h('div', { class: 'tk-pos', 'data-pos': '1' }, h('span', { class: 'tk-pos__glow' }), this.posNum, this.posSuf, this.posOf);

    this.lapCur = h('span', { class: 'tk-lap__cur' }, '1');
    this.lapTot = h('span', { class: 'tk-lap__tot' }, '/3');
    this.lap = h('div', { class: 'tk-lap tk-display' }, h('span', { class: 'tk-lap__label' }, 'Lap'), this.lapCur, this.lapTot);

    this.coinNum = h('span', { class: 'tk-coins__n tk-display' }, '0');
    this.coins = h(
      'div',
      { class: 'tk-coins' },
      h('span', { class: 'tk-coins__icon', html: itemIconSVG(ITEMS.COIN) }),
      h('span', { class: 'tk-coins__x tk-display' }, '×'),
      this.coinNum,
    );

    this.splitLabel = h('span', { class: 'tk-split__lap' });
    this.splitTime = h('span', { class: 'tk-split__time tk-display' });
    this.split = h('div', { class: 'tk-split' }, this.splitLabel, this.splitTime);
    this.bestLapEl = h('div', { class: 'tk-bestlap' });
    this.timerBox = h('div', { class: 'tk-timer' }, this.timer.el, this.split, this.bestLapEl);


    this.el = h(
      'div',
      { class: 'tk-hud' },
      h('div', { class: 'tk-hud__tl' }, this.item.el),
      h('div', { class: 'tk-hud__tr' }, this.timerBox, this.minimap.el),
      h('div', { class: 'tk-hud__bl' }, this.lap, this.coins),
      h('div', { class: 'tk-hud__br' }, this.speedo.el, this.pos),
    );
    this.el.hidden = true;

    // --- overlays -------------------------------------------------------------
    this.countNum = h('span', { class: 'tk-count__n tk-display' });
    this.count = h('div', { class: 'tk-count' }, h('div', { class: 'tk-count__rays' }), this.countNum);
    this.bannerText = h('span', { class: 'tk-banner__text tk-display' });
    this.banner = h('div', { class: 'tk-banner' }, h('div', { class: 'tk-banner__band' }), this.bannerText);
    this.finishPos = h('div', { class: 'tk-finish__pos tk-display' });
    this.finishEl = h(
      'div',
      { class: 'tk-finish' },
      h('div', { class: 'tk-finish__band' }),
      h('div', { class: 'tk-finish__word tk-display' }, [...'FINISH!'].map((c, i) => h('span', { style: { '--i': i } }, c))),
      this.finishPos,
    );
    this.wrong = h(
      'div',
      { class: 'tk-wrongway' },
      h('span', { class: 'tk-wrongway__icon', html: ICONS.uturn() }),
      h('span', { class: 'tk-wrongway__text tk-display' }, 'Wrong Way!'),
      h('span', { class: 'tk-wrongway__icon', html: ICONS.uturn() }),
    );
    this.spiny = h(
      'div',
      { class: 'tk-spiny' },
      h('span', { class: 'tk-spiny__icon', html: itemIconSVG(ITEMS.SPINY_SHELL) }),
      h('span', { class: 'tk-spiny__text' }, h('b', { class: 'tk-display' }, 'Spiny Shell!'), h('span', null, 'Incoming — it targets you')),
    );
    this.danger = h('div', { class: 'tk-danger' });
    this.introCup = h('div', { class: 'tk-intro__cup' });
    this.introName = h('div', { class: 'tk-intro__name tk-display' });
    this.intro = h(
      'div',
      { class: 'tk-intro' },
      h('div', { class: 'tk-intro__band' }),
      this.introCup,
      this.introName,
      h(
        'div',
        { class: 'tk-intro__hint' },
        h('span', { class: 'tk-key k' }, 'Enter'),
        h('span', { class: 'tk-key g tk-key--a' }, 'A'),
        'Skip intro',
      ),
    );
    this.overlays = h('div', { class: 'tk-overlays' }, this.danger, this.wrong, this.spiny, this.intro, this.banner, this.count, this.finishEl);

    this.p = {};
    this._onResize = () => this.minimap.markDirty();
    window.addEventListener('resize', this._onResize);
  }

  // ---------------------------------------------------------------------------

  show(cfg = {}) {
    this.config = { ...cfg };
    clearTimeout(this._hideTimer);
    this.visible = true;
    this.p = {};
    this.item.reset();
    this.speedo.reset();
    this.timer.set(0);
    this.split.classList.remove('is-show', 'is-best');
    this.el.classList.remove('is-out', 'is-finished', 'is-tt');
    this.el.classList.toggle('is-tt', cfg.mode === GAME_MODES.TIME_TRIAL);
    const track = this.ui.trackByName(cfg.trackName);
    const accent = toCss(track?.accentColor, '#22d3ff');
    this.el.style.setProperty('--ac', accent);
    this.overlays.style.setProperty('--ac', accent);
    this.minimap.setAccent(accent);
    this.lapTot.textContent = `/${cfg.totalLaps || 3}`;
    this.posOf.textContent = `/${cfg.racerCount || 8}`;
    this.bestLapEl.textContent = '';
    this.el.hidden = false;
    this.minimap.markDirty();
    this.wrong.classList.remove('is-on');
    this.finishEl.classList.remove('is-show');
    replayClass(this.el, 'is-in');
  }

  hide() {
    if (!this.visible) return;
    this.visible = false;
    this.el.classList.remove('is-in');
    this.el.classList.add('is-out');
    clearTimeout(this._hideTimer);
    this._hideTimer = setTimeout(() => {
      if (!this.visible) this.el.hidden = true;
    }, 320);
    this.clearOverlays();
  }

  clearOverlays() {
    for (const k in this._timers) clearTimeout(this._timers[k]);
    this._timers = {};
    for (const el of [this.count, this.banner, this.finishEl, this.wrong, this.spiny, this.danger, this.intro]) {
      el.classList.remove('is-show', 'is-on', 'is-go', 'is-final');
    }
  }

  _after(key, ms, fn) {
    clearTimeout(this._timers[key]);
    this._timers[key] = setTimeout(fn, ms);
  }

  // ---------------------------------------------------------------------------
  // Per-frame update
  // ---------------------------------------------------------------------------

  update(hud) {
    if (!hud || !this.visible) return;
    const now = performance.now();
    const p = this.p;

    // position badge
    const pos = hud.position | 0;
    if (pos >= 1 && pos !== p.position) {
      const prev = p.position;
      p.position = pos;
      this.posNumB.textContent = String(pos);
      this.posNum.dataset.t = String(pos);
      this.posSufB.textContent = ordinalSuffix(pos);
      this.posSuf.dataset.t = ordinalSuffix(pos);
      this.pos.dataset.pos = String(Math.min(pos, 4));
      if (prev) {
        this.pos.classList.toggle('is-gain', pos < prev);
        this.pos.classList.toggle('is-loss', pos > prev);
        replayClass(this.pos, 'is-bump');
      }
    }
    if (hud.racerCount !== p.racerCount) {
      p.racerCount = hud.racerCount;
      this.posOf.textContent = `/${hud.racerCount || 8}`;
    }

    // lap counter
    if (hud.lap !== p.lap || hud.totalLaps !== p.totalLaps) {
      const bump = p.lap !== undefined;
      p.lap = hud.lap;
      p.totalLaps = hud.totalLaps;
      this.lapCur.textContent = String(Math.max(1, hud.lap | 0));
      this.lapTot.textContent = `/${hud.totalLaps || 3}`;
      this.lap.classList.toggle('is-final', hud.lap >= hud.totalLaps && hud.totalLaps > 1);
      if (bump) replayClass(this.lap, 'is-bump');
    }

    // timer + lap split flash
    this.timer.set(hud.raceTime);
    if (hud.lastLapTime !== p.lastLapTime) {
      const first = !('lastLapTime' in p);
      p.lastLapTime = hud.lastLapTime;
      if (!first && Number.isFinite(hud.lastLapTime) && hud.lastLapTime > 0) {
        const lapNo = hud.finished ? hud.totalLaps : Math.max(1, (hud.lap | 0) - 1);
        const isBest = lapNo > 1 && hud.bestLap !== null && Math.abs(hud.lastLapTime - hud.bestLap) < 1e-6;
        this.splitLabel.textContent = isBest ? 'Best Lap!' : `Lap ${lapNo}`;
        this.splitTime.textContent = formatTime(hud.lastLapTime);
        this.split.classList.toggle('is-best', isBest);
        replayClass(this.split, 'is-show');
        this._after('split', 3600, () => this.split.classList.remove('is-show'));
      }
    }
    if (hud.bestLap !== p.bestLap) {
      p.bestLap = hud.bestLap;
      this.bestLapEl.innerHTML = Number.isFinite(hud.bestLap) && hud.bestLap > 0 ? `<em>Best</em> ${formatTime(hud.bestLap)}` : '';
    }

    // speed / boost / drift
    this.speedo.update(hud.speed, hud.boosting, hud.driftLevel, hud.driftCharge);

    // coins
    const coins = hud.coins | 0;
    if (coins !== p.coins) {
      const prev = p.coins;
      p.coins = coins;
      this.coinNum.textContent = String(coins);
      this.coins.classList.toggle('is-max', coins >= 10);
      if (prev !== undefined) {
        replayClass(this.coins, coins > prev ? 'is-gain' : 'is-loss');
      }
    }

    // item slot
    this.item.update(hud.item, now);

    // wrong way
    const ww = !!hud.wrongWay && !hud.finished;
    if (ww !== p.wrongWay) {
      p.wrongWay = ww;
      this.wrong.classList.toggle('is-on', ww);
    }

    // finished state
    const fin = !!hud.finished;
    if (fin !== p.finished) {
      p.finished = fin;
      this.el.classList.toggle('is-finished', fin);
    }

    // minimap
    this.minimap.draw(hud.minimap, now);
  }

  // ---------------------------------------------------------------------------
  // Overlays
  // ---------------------------------------------------------------------------

  showCountdown(count) {
    this.intro.classList.remove('is-show');
    const go = count <= 0;
    this.count.dataset.n = go ? 'go' : String(count);
    this.countNum.textContent = go ? 'GO!' : String(count);
    this.count.classList.toggle('is-go', go);
    replayClass(this.count, 'is-show');
    this._after('count', go ? 1400 : 1100, () => this.count.classList.remove('is-show', 'is-go'));
  }

  showLapBanner(lap, totalLaps, isFinal) {
    this.bannerText.textContent = isFinal ? 'Final Lap!' : `Lap ${lap}/${totalLaps}`;
    this.banner.classList.toggle('is-final', !!isFinal);
    replayClass(this.banner, 'is-show');
    this._after('banner', isFinal ? 2600 : 2100, () => this.banner.classList.remove('is-show'));
  }

  showFinish(position) {
    this.finishPos.innerHTML = position ? `${position}<sup>${ordinalSuffix(position)}</sup>` : '';
    this.finishPos.dataset.pos = String(Math.min(position || 4, 4));
    this.wrong.classList.remove('is-on');
    replayClass(this.finishEl, 'is-show');
    this._after('finish', 7000, () => this.finishEl.classList.remove('is-show'));
  }

  showSpinyWarning() {
    replayClass(this.spiny, 'is-show');
    replayClass(this.danger, 'is-show');
    this._after('spiny', 3800, () => {
      this.spiny.classList.remove('is-show');
      this.danger.classList.remove('is-show');
    });
  }

  showIntro(name, cupLine) {
    this.introName.textContent = name || '';
    this.introCup.textContent = cupLine || '';
    replayClass(this.intro, 'is-show');
    this._after('intro', 6500, () => this.intro.classList.remove('is-show'));
  }

  dispose() {
    window.removeEventListener('resize', this._onResize);
    this.clearOverlays();
  }
}
