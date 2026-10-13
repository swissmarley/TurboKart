/**
 * Loading screen: track name, self-drawing track outline driven by the
 * load progress, striped progress bar and rotating gameplay tips.
 */
import { Screen } from '../Screen.js';
import { h, fitPath, toCss, clamp, uid, replayClass } from '../util.js';
import { starsHTML } from '../icons.js';

export const TIPS = [
  'Hold <kbd>Space</kbd> or <kbd>Shift</kbd> while steering to drift. Hold it longer for <b class="c-blue">blue</b>, <b class="c-orange">orange</b> and <b class="c-purple">purple</b> mini-turbos!',
  'Press <kbd>W</kbd> / <kbd>↑</kbd> just after the <b>2</b> appears in the countdown for a rocket start.',
  'Accelerate with <kbd>W</kbd> / <kbd>↑</kbd> and brake with <kbd>S</kbd> / <kbd>↓</kbd>. On a gamepad use <kbd>A</kbd> / <kbd>RT</kbd> and <kbd>B</kbd> / <kbd>LT</kbd>.',
  'Steer with <kbd>A</kbd> <kbd>D</kbd> or <kbd>←</kbd> <kbd>→</kbd> — or the left stick on a gamepad.',
  'Use your item with <kbd>E</kbd> or <kbd>X</kbd>. Gamepad: <kbd>LB</kbd> or <kbd>Y</kbd>.',
  'Hold the item button to drag a banana or shell behind you — it blocks one hit from behind.',
  'Press <kbd>C</kbd> (gamepad <kbd>X</kbd>) to look behind you before firing a shell backwards.',
  'Every coin adds to your top speed — up to 10. Getting hit makes you drop three!',
  'Off-road terrain slows you down, unless you are boosting or invincible.',
  'Hop with <kbd>Space</kbd> right at a ramp lip to pull a trick and earn a boost on landing.',
  'Red shells home in on the racer ahead. Green shells fly straight and bounce off walls.',
  'The spiny shell hunts down whoever is in first place. Leading is not always safe!',
  'Boost pads give a free burst of speed — aim for the glowing chevrons.',
  'Press <kbd>Esc</kbd> (gamepad <kbd>Start</kbd>) to pause the race at any time.',
];

const STATUS = [
  [0, 'Paving the road'],
  [0.2, 'Planting the scenery'],
  [0.45, 'Painting the sky'],
  [0.65, 'Placing item boxes'],
  [0.82, 'Warming up engines'],
  [0.97, 'Lining up the grid'],
];

export class LoadingScreen extends Screen {
  constructor(ui) {
    super(ui, 'loading');
    this.outDuration = 420;
    this.progress = 0;
    this.trackKey = null;
    this.tipIndex = Math.floor(Math.random() * TIPS.length);
    this._tipTimer = 0;
  }

  build() {
    this.crumb = h('div', { class: 'tk-load__crumb' });
    this.name = h('div', { class: 'tk-load__name tk-display' });
    this.stars = h('div', { class: 'tk-load__stars' });
    this.desc = h('div', { class: 'tk-load__desc' });
    this.mapWrap = h('div', { class: 'tk-load__map' });
    this.fill = h('div', { class: 'tk-load__fill' });
    this.pct = h('div', { class: 'tk-load__pct tk-display' }, '0%');
    this.status = h('div', { class: 'tk-load__status' });
    this.tipText = h('div', { class: 'tk-tip__text' });
    this.tip = h('div', { class: 'tk-tip tk-anim-d' }, h('span', { class: 'tk-tip__badge tk-display' }, 'Tip'), this.tipText);
    return h(
      'div',
      { class: 'tk-load' },
      h('div', { class: 'tk-load__bg' }),
      h('div', { class: 'tk-load__stripes' }),
      this.mapWrap,
      h('div', { class: 'tk-load__info tk-anim-l' }, this.crumb, this.name, this.stars, this.desc),
      this.tip,
      h(
        'div',
        { class: 'tk-load__bar tk-anim-d' },
        h('div', { class: 'tk-load__barhead' }, this.status, this.pct),
        h('div', { class: 'tk-load__track' }, this.fill),
      ),
    );
  }

  /**
   * @param {{ name: string, id?: string, accentColor?: string, difficulty?: number, description?: string }|null} track
   * @param {string} crumb
   */
  setTrack(track, crumb = 'Now Loading') {
    this.ensure();
    const key = track ? track.id || track.name : null;
    this.crumb.textContent = crumb;
    if (key === this.trackKey) return;
    this.trackKey = key;
    const accent = toCss(track?.accentColor, '#22d3ff');
    this.el.style.setProperty('--ac', accent);
    this.name.textContent = track?.name || 'Loading';
    this.stars.innerHTML = track?.difficulty ? starsHTML(track.difficulty) : '';
    this.desc.textContent = track?.description || '';
    const pts = track?.id ? this.ui.previewPath(track.id) : [];
    this.buildMap(pts, accent);
  }

  buildMap(points, accent) {
    this.mapWrap.innerHTML = '';
    this.mapPts = null;
    if (!points || points.length < 3) return;
    const W = 400;
    const H = 300;
    const { d, points: fitted } = fitPath(points, W, H, 26);
    const id = uid('ld');
    this.mapWrap.innerHTML = `<svg viewBox="0 0 ${W} ${H}" aria-hidden="true">
      <defs><filter id="${id}" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter></defs>
      <path d="${d}" fill="none" stroke="${accent}" stroke-width="22" stroke-linejoin="round" opacity=".55" filter="url(#${id})"/>
      <path d="${d}" fill="none" stroke="#1d0f2e" stroke-width="18" stroke-linejoin="round" opacity=".85"/>
      <path d="${d}" fill="none" stroke="rgba(255,255,255,.16)" stroke-width="9" stroke-linejoin="round"/>
      <path class="tk-load__road" d="${d}" pathLength="1" fill="none" stroke="#fff" stroke-width="9" stroke-linejoin="round" stroke-linecap="round" stroke-dasharray="1 1" stroke-dashoffset="1"/>
      <path d="${d}" fill="none" stroke="${accent}" stroke-width="2.4" stroke-dasharray="7 9" stroke-linejoin="round" opacity=".9"/>
      <g class="tk-load__kart"><circle r="14" fill="${accent}" opacity=".35"/><circle r="8.5" fill="${accent}" stroke="#fff" stroke-width="4"/></g>
    </svg>`;
    this.road = this.mapWrap.querySelector('.tk-load__road');
    this.kart = this.mapWrap.querySelector('.tk-load__kart');
    // cumulative lengths for the kart marker
    const cum = [0];
    for (let i = 1; i <= fitted.length; i++) {
      const a = fitted[i - 1];
      const b = fitted[i % fitted.length];
      cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
    }
    this.mapPts = fitted;
    this.mapCum = cum;
    this.applyProgress();
  }

  setProgress(p) {
    this.progress = clamp(Number(p) || 0, 0, 1);
    this.applyProgress();
  }

  applyProgress() {
    if (!this.el) return;
    const p = this.progress;
    this.fill.style.width = `${(p * 100).toFixed(1)}%`;
    this.pct.textContent = `${Math.round(p * 100)}%`;
    let label = STATUS[0][1];
    for (const [t, l] of STATUS) if (p >= t) label = l;
    if (this.status.textContent !== `${label}…`) this.status.textContent = `${label}…`;
    if (this.road) this.road.setAttribute('stroke-dashoffset', String(1 - p));
    if (this.mapPts && this.kart) {
      const total = this.mapCum[this.mapCum.length - 1];
      const target = total * p;
      let i = 1;
      while (i < this.mapCum.length - 1 && this.mapCum[i] < target) i++;
      const a = this.mapPts[i - 1];
      const b = this.mapPts[i % this.mapPts.length];
      const seg = this.mapCum[i] - this.mapCum[i - 1] || 1;
      const f = clamp((target - this.mapCum[i - 1]) / seg, 0, 1);
      this.kart.setAttribute('transform', `translate(${(a.x + (b.x - a.x) * f).toFixed(1)} ${(a.y + (b.y - a.y) * f).toFixed(1)})`);
    }
  }

  nextTip() {
    this.tipIndex = (this.tipIndex + 1) % TIPS.length;
    this.tipText.innerHTML = TIPS[this.tipIndex];
    replayClass(this.tip, 'is-swap');
  }

  onShow() {
    this.tipText.innerHTML = TIPS[this.tipIndex];
    clearInterval(this._tipTimer);
    this._tipTimer = setInterval(() => this.nextTip(), 4200);
  }

  onHide() {
    clearInterval(this._tipTimer);
    this.tipIndex = (this.tipIndex + 1) % TIPS.length;
  }

  handleAction() {}
}
