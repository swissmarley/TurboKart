/**
 * Character, track and cup selection screens.
 */
import { EVENTS, GAME_MODES, ENGINE_CLASSES, RECORDS_STORAGE_KEY } from '../../core/constants.js';
import { Screen } from '../Screen.js';
import { h, fitPath, formatTime, loadJSON, replayClass, uid, clamp, toCss } from '../util.js';
import { ICONS, starsHTML } from '../icons.js';
import { portraitSVG, characterPalette } from '../portraits.js';
import { MODE_INFO } from './menus.js';

const STAT_LABELS = [
  ['speed', 'Speed'],
  ['accel', 'Accel'],
  ['handling', 'Handling'],
  ['weight', 'Weight'],
  ['offroad', 'Off-Road'],
];

const WEIGHT_LABEL = { light: 'Lightweight', medium: 'Middleweight', heavy: 'Heavyweight' };
const WEIGHT_SHORT = { light: 'L', medium: 'M', heavy: 'H' };

const THEME_LABEL = {
  meadow: 'Grasslands',
  desert: 'Desert Canyon',
  snow: 'Snowy Peaks',
  neon: 'Neon Skyway',
};

function crumbsFor(ui, extra = []) {
  const f = ui.flow;
  const cc = ENGINE_CLASSES[f.engineClass]?.label;
  return [MODE_INFO[f.mode]?.title, f.mode === GAME_MODES.TIME_TRIAL ? null : cc, ...extra];
}

/** Glowing track outline SVG built from getTrackPreviewPath(). */
export function trackMapSVG(points, { width = 160, height = 100, pad = 12, accent = '#22d3ff', dot = true, draw = true, cls = '' } = {}) {
  const { d, points: fitted } = fitPath(points, width, height, pad);
  if (!d) return `<svg class="tk-map ${cls}" viewBox="0 0 ${width} ${height}"></svg>`;
  const id = uid('mp');
  let start = '';
  if (fitted.length > 2) {
    const p0 = fitted[0];
    const p1 = fitted[Math.min(2, fitted.length - 1)];
    const ang = (Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI;
    start = `<g transform="translate(${p0.x.toFixed(1)} ${p0.y.toFixed(1)}) rotate(${ang.toFixed(1)})">
      <rect x="-2.2" y="-6" width="4.4" height="12" fill="#fff" stroke="#1d0f2e" stroke-width="1.2"/>
      <rect x="-2.2" y="-6" width="2.2" height="3" fill="#1d0f2e"/><rect x="0" y="-3" width="2.2" height="3" fill="#1d0f2e"/>
      <rect x="-2.2" y="0" width="2.2" height="3" fill="#1d0f2e"/><rect x="0" y="3" width="2.2" height="3" fill="#1d0f2e"/>
    </g>`;
  }
  return `<svg class="tk-map ${cls}" viewBox="0 0 ${width} ${height}" style="--ac:${accent}" aria-hidden="true">
    <defs>
      <filter id="${id}g" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.2"/></filter>
    </defs>
    <path class="tk-map__glow" d="${d}" fill="none" stroke="${accent}" stroke-width="9" stroke-linejoin="round" filter="url(#${id}g)"/>
    <path class="tk-map__edge" d="${d}" fill="none" stroke="#1d0f2e" stroke-width="8" stroke-linejoin="round"/>
    <path class="tk-map__road${draw ? ' is-draw' : ''}" d="${d}" pathLength="1" fill="none" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>
    <path class="tk-map__dash" d="${d}" fill="none" stroke="${accent}" stroke-width="1.3" stroke-dasharray="3 4" stroke-linejoin="round"/>
    ${start}
    ${
      dot
        ? `<circle class="tk-map__dot" r="3.6" fill="${accent}" stroke="#fff" stroke-width="1.6"><animateMotion dur="7s" repeatCount="indefinite" path="${d}"/></circle>`
        : ''
    }
  </svg>`;
}

function loadRecords() {
  return loadJSON(RECORDS_STORAGE_KEY, {}) || {};
}

// -----------------------------------------------------------------------------
// Character select
// -----------------------------------------------------------------------------

export class CharacterScreen extends Screen {
  constructor(ui) {
    super(ui, 'character');
  }

  build() {
    const chars = this.ui.characters;
    const grid = h('div', { class: 'tk-chargrid' });
    this.columns = Math.min(4, Math.max(1, chars.length));
    grid.style.setProperty('--cols', String(this.columns));
    chars.forEach((c, i) => {
      const pal = characterPalette(c);
      const card = h(
        'button',
        { class: 'tk-char tk-anim-pop', type: 'button', style: { '--cc': pal.css, '--cc2': pal.secondary, '--i': i } },
        h('span', { class: 'tk-char__portrait', html: portraitSVG(c) }),
        h('span', { class: 'tk-char__name' }, c.name),
        h('span', { class: `tk-char__weight tk-w--${c.weightClass || 'medium'}` }, WEIGHT_SHORT[c.weightClass] || 'M'),
        h('span', { class: 'tk-char__cursor tk-display' }, 'P1'),
      );
      this.addItem(card, { onConfirm: () => this.choose(c) });
      grid.appendChild(card);
    });

    // Info panel (bottom-right)
    this.infoName = h('div', { class: 'tk-charinfo__name tk-display' });
    this.infoTag = h('div', { class: 'tk-charinfo__tag' });
    this.infoDesc = h('div', { class: 'tk-charinfo__desc' });
    this.infoWeight = h('div', { class: 'tk-charinfo__weight' });
    this.statRows = STAT_LABELS.map(([key, label], i) => {
      const segs = [...Array(5)].map(() => h('i', null, h('b')));
      const row = h('div', { class: 'tk-stat', style: { '--i': i } }, h('span', { class: 'tk-stat__label' }, label), h('span', { class: 'tk-stat__bar' }, segs));
      return { key, row, segs };
    });
    this.info = h(
      'div',
      { class: 'tk-charinfo tk-anim-r' },
      h('div', { class: 'tk-charinfo__stripes' }),
      h('div', { class: 'tk-charinfo__head' }, this.infoName, this.infoWeight),
      this.infoTag,
      this.infoDesc,
      h(
        'div',
        { class: 'tk-stats' },
        this.statRows.map((s) => s.row),
      ),
    );

    return h(
      'div',
      { class: 'tk-charsel' },
      h('div', { class: 'tk-backdrop tk-backdrop--charsel' }),
      this.header('Select Driver'),
      grid,
      this.info,
      this.footer({ select: 'Choose' }),
    );
  }

  onShow() {
    this.setCrumbs(crumbsFor(this.ui));
    const idx = this.ui.characters.findIndex((c) => c.id === this.ui.flow.characterId);
    this.index = idx >= 0 ? idx : 0;
    this.applyFocus();
    this.updateInfo(true);
  }

  onFocus() {
    this.updateInfo(true);
  }

  updateInfo(emit) {
    const c = this.ui.characters[this.index];
    if (!c) return;
    const pal = characterPalette(c);
    this.info.style.setProperty('--cc', pal.css);
    this.info.style.setProperty('--cc2', pal.secondary);
    this.infoName.textContent = c.name;
    this.infoTag.textContent = c.tagline || '';
    this.infoDesc.textContent = c.description || '';
    this.infoWeight.textContent = WEIGHT_LABEL[c.weightClass] || 'Middleweight';
    this.infoWeight.className = `tk-charinfo__weight tk-w--${c.weightClass || 'medium'}`;
    const stats = c.stats || {};
    for (const s of this.statRows) {
      const v = clamp(Number(stats[s.key]) || 0, 0, 5);
      s.segs.forEach((seg, k) => {
        const f = clamp(v - k, 0, 1);
        seg.firstChild.style.width = `${f * 100}%`;
        seg.classList.toggle('is-full', f >= 1);
      });
    }
    replayClass(this.info, 'is-swap');
    if (emit) this.ui.emit(EVENTS.UI_PREVIEW_CHARACTER, { characterId: c.id });
  }

  choose(c) {
    const ui = this.ui;
    ui.flow.characterId = c.id;
    ui.go(ui.flow.mode === GAME_MODES.GRAND_PRIX ? 'cup' : 'track');
  }

  onBack() {
    this.ui.emit(EVENTS.UI_BACK);
    this.ui.go(this.ui.flow.mode === GAME_MODES.TIME_TRIAL ? 'main' : 'engine', { back: true });
  }
}

// -----------------------------------------------------------------------------
// Track select (VS / Time Trial)
// -----------------------------------------------------------------------------

export class TrackScreen extends Screen {
  constructor(ui) {
    super(ui, 'track');
  }

  build() {
    const tracks = this.ui.tracks;
    const row = h('div', { class: 'tk-trackrow' });
    this.columns = Math.min(4, Math.max(1, tracks.length));
    row.style.setProperty('--cols', String(this.columns));
    this.bestEls = [];
    tracks.forEach((t, i) => {
      const accent = toCss(t.accentColor, '#22d3ff');
      const best = h('span', { class: 'tk-track__best' });
      this.bestEls.push(best);
      const card = h(
        'button',
        { class: 'tk-track tk-anim-pop', type: 'button', style: { '--ac': accent, '--i': i } },
        h('span', { class: 'tk-track__map', html: trackMapSVG(this.ui.previewPath(t.id), { accent }) }),
        h('span', { class: 'tk-track__num tk-display' }, String(i + 1)),
        h('span', { class: 'tk-track__name tk-display' }, t.name),
        h('span', { class: 'tk-track__stars', html: starsHTML(t.difficulty || 1) }),
        best,
      );
      this.addItem(card, { onConfirm: () => this.choose(t) });
      row.appendChild(card);
    });

    this.dName = h('div', { class: 'tk-trackinfo__name tk-display' });
    this.dTheme = h('span', { class: 'tk-chip' });
    this.dLaps = h('span', { class: 'tk-chip tk-chip--dark' });
    this.dDesc = h('div', { class: 'tk-trackinfo__desc' });
    this.dBest = h('div', { class: 'tk-trackinfo__rec' });
    this.detail = h(
      'div',
      { class: 'tk-trackinfo tk-anim-d' },
      h('div', { class: 'tk-trackinfo__main' }, h('div', { class: 'tk-trackinfo__top' }, this.dName, this.dTheme, this.dLaps), this.dDesc),
      this.dBest,
    );

    return h(
      'div',
      { class: 'tk-tracksel' },
      h('div', { class: 'tk-backdrop tk-backdrop--full' }),
      this.header('Select Track'),
      row,
      this.detail,
      this.footer({ select: 'Race!' }),
    );
  }

  onShow() {
    const ui = this.ui;
    const ch = ui.characters.find((c) => c.id === ui.flow.characterId);
    this.setCrumbs(crumbsFor(ui, [ch?.name]));
    const idx = ui.tracks.findIndex((t) => t.id === ui.flow.trackId);
    this.index = idx >= 0 ? idx : 0;
    this.records = loadRecords();
    ui.tracks.forEach((t, i) => {
      const r = this.records[t.id];
      this.bestEls[i].innerHTML = r && Number.isFinite(r.time) ? `<em>BEST</em> ${formatTime(r.time)}` : `<em>BEST</em> -'--"---`;
    });
    this.applyFocus();
    this.updateDetail(true);
  }

  onFocus() {
    this.updateDetail(true);
  }

  updateDetail(emit) {
    const t = this.ui.tracks[this.index];
    if (!t) return;
    this.detail.style.setProperty('--ac', toCss(t.accentColor, '#22d3ff'));
    this.dName.textContent = t.name;
    this.dTheme.textContent = THEME_LABEL[t.musicTheme] || THEME_LABEL[t.theme] || t.theme || 'Circuit';
    this.dLaps.textContent = `${t.laps || 3} Laps`;
    this.dDesc.textContent = t.description || '';
    const r = (this.records || {})[t.id];
    this.dBest.innerHTML = `
      <div><span>Best Time</span><b class="tk-display">${formatTime(r?.time)}</b></div>
      <div><span>Best Lap</span><b class="tk-display">${formatTime(r?.bestLap)}</b></div>`;
    replayClass(this.detail, 'is-swap');
    if (emit) this.ui.emit(EVENTS.UI_PREVIEW_TRACK, { trackId: t.id });
  }

  choose(t) {
    this.ui.flow.trackId = t.id;
    this.ui.startRace();
  }

  onBack() {
    this.ui.emit(EVENTS.UI_BACK);
    this.ui.go('character', { back: true });
  }
}

// -----------------------------------------------------------------------------
// Cup select (Grand Prix)
// -----------------------------------------------------------------------------

const CUP_COLORS = ['#ffd23f', '#ff6a3d', '#3fe6ff', '#b78cff', '#7dff4a'];

export class CupScreen extends Screen {
  constructor(ui) {
    super(ui, 'cup');
  }

  build() {
    const cups = this.ui.cups;
    const row = h('div', { class: 'tk-cuprow' });
    this.columns = Math.max(1, cups.length);
    cups.forEach((cup, i) => {
      const color = cup.color || CUP_COLORS[i % CUP_COLORS.length];
      const card = h(
        'button',
        { class: 'tk-cup tk-anim-pop', type: 'button', style: { '--ac': color, '--i': i } },
        h('span', { class: 'tk-cup__rays' }),
        h('span', { class: 'tk-cup__icon', html: ICONS.cup(color) }),
        h('span', { class: 'tk-cup__name tk-display' }, cup.name),
        h('span', { class: 'tk-cup__count' }, `${(cup.trackIds || []).length} Tracks`),
      );
      this.addItem(card, { onConfirm: () => this.choose(cup) });
      row.appendChild(card);
    });
    this.list = h('div', { class: 'tk-cuplist' });
    this.listTitle = h('div', { class: 'tk-cuplist__title tk-display' });
    return h(
      'div',
      { class: 'tk-cupsel' },
      h('div', { class: 'tk-backdrop tk-backdrop--full' }),
      this.header('Select Cup'),
      h('div', { class: 'tk-cupwrap' }, row, h('div', { class: 'tk-cuppanel tk-anim-r' }, this.listTitle, this.list)),
      this.footer({ select: 'Race!' }),
    );
  }

  onShow() {
    const ui = this.ui;
    const ch = ui.characters.find((c) => c.id === ui.flow.characterId);
    this.setCrumbs(crumbsFor(ui, [ch?.name]));
    const idx = ui.cups.findIndex((c) => c.id === ui.flow.cupId);
    this.index = idx >= 0 ? idx : 0;
    this.applyFocus();
    this.updateList(true);
  }

  onFocus() {
    this.updateList(true);
  }

  updateList(emit) {
    const cup = this.ui.cups[this.index];
    if (!cup) return;
    this.listTitle.textContent = cup.name;
    this.list.innerHTML = '';
    const records = loadRecords();
    (cup.trackIds || []).forEach((id, i) => {
      const t = this.ui.tracks.find((tr) => tr.id === id) || { id, name: id };
      const accent = toCss(t.accentColor, '#22d3ff');
      this.list.appendChild(
        h(
          'div',
          { class: 'tk-cuptrack', style: { '--ac': accent, '--i': i } },
          h('span', { class: 'tk-cuptrack__n tk-display' }, String(i + 1)),
          h('span', { class: 'tk-cuptrack__map', html: trackMapSVG(this.ui.previewPath(id), { width: 120, height: 72, pad: 9, accent, dot: false }) }),
          h(
            'span',
            { class: 'tk-cuptrack__text' },
            h('span', { class: 'tk-cuptrack__name tk-display' }, t.name),
            h('span', { class: 'tk-cuptrack__meta', html: `${starsHTML(t.difficulty || 1)}<em>${records[id] ? formatTime(records[id].time) : ''}</em>` }),
          ),
        ),
      );
    });
    replayClass(this.list, 'is-swap');
    if (emit && cup.trackIds && cup.trackIds[0]) this.ui.emit(EVENTS.UI_PREVIEW_TRACK, { trackId: cup.trackIds[0] });
  }

  choose(cup) {
    this.ui.flow.cupId = cup.id;
    this.ui.flow.trackId = (cup.trackIds || [])[0] || this.ui.flow.trackId;
    this.ui.startRace();
  }

  onBack() {
    this.ui.emit(EVENTS.UI_BACK);
    this.ui.go('character', { back: true });
  }
}
