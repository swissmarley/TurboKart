/**
 * Race results: animated standings (with GP points count-up and re-sort),
 * Time Trial summary (splits + NEW RECORD) and the Grand Prix trophy ceremony.
 */
import { EVENTS, GAME_MODES, RECORDS_STORAGE_KEY } from '../../core/constants.js';
import { Screen } from '../Screen.js';
import { h, formatTime, formatDelta, ordinalSuffix, loadJSON, saveJSON, replayClass } from '../util.js';
import { ICONS, trophySVG } from '../icons.js';
import { portraitSVG } from '../portraits.js';
import { MODE_INFO } from './menus.js';

const CONFETTI_COLORS = ['#ffd23f', '#ff3d8b', '#22d3ff', '#7dff4a', '#ff8a1f', '#a05cff', '#ffffff'];

function chevrons() {
  return h('span', { class: 'tk-chevrons' }, h('i'), h('i'), h('i'));
}

export class ResultsScreen extends Screen {
  constructor(ui) {
    super(ui, 'results');
    this.outDuration = 380;
    this._timers = [];
    this._raf = 0;
  }

  build() {
    this.body = h('div', { class: 'tk-results__body' });
    return h('div', { class: 'tk-results' }, h('div', { class: 'tk-backdrop tk-backdrop--results' }), this.body);
  }

  later(ms, fn) {
    this._timers.push(setTimeout(fn, ms));
  }

  clearTimers() {
    for (const t of this._timers) clearTimeout(t);
    this._timers = [];
    cancelAnimationFrame(this._raf);
  }

  onShow({ results }) {
    this.clearTimers();
    this.clearItems();
    this.results = results || { standings: [] };
    this.body.innerHTML = '';
    this.body.className = 'tk-results__body';
    const r = this.results;
    if (r.mode === GAME_MODES.TIME_TRIAL && r.timeTrial) {
      this.writeRecord(r);
      this.buildTimeTrial(r);
    } else {
      this.buildStandings(r);
    }
  }

  onHidden() {
    this.clearTimers();
  }

  onBack() {}

  // ---------------------------------------------------------------------------

  buttons(defs) {
    const wrap = h('div', { class: 'tk-results__btns' });
    defs.forEach((d, i) => {
      const b = h(
        'button',
        { class: `tk-btn tk-btn--sm tk-anim-d`, type: 'button', style: { '--c1': d.c1, '--c2': d.c2, '--i': i + 10 } },
        h('span', { class: 'tk-btn__plate' }, h('span', { class: 'tk-btn__label tk-display' }, d.label), chevrons()),
      );
      this.addItem(b, { onConfirm: d.action });
      wrap.appendChild(b);
    });
    this.columns = defs.length;
    this.index = 0;
    return wrap;
  }

  standardButtons() {
    const r = this.results;
    if (r.mode === GAME_MODES.GRAND_PRIX) {
      if (r.gpComplete) {
        return this.buttons([{ label: 'Continue', c1: '#ffd23f', c2: '#ff7a1a', action: () => this.showCeremony() }]);
      }
      return this.buttons([{ label: 'Next Race', c1: '#7dff4a', c2: '#14a84a', action: () => this.ui.emit(EVENTS.UI_NEXT_RACE) }]);
    }
    return this.buttons([
      { label: 'Retry', c1: '#7dff4a', c2: '#14a84a', action: () => this.ui.emit(EVENTS.UI_RESTART) },
      { label: 'Main Menu', c1: '#c49bff', c2: '#6a3df0', action: () => this.ui.emit(EVENTS.UI_QUIT) },
    ]);
  }

  head(title, crumbs) {
    return h(
      'header',
      { class: 'tk-header tk-anim-l' },
      h(
        'div',
        { class: 'tk-header__crumbs' },
        crumbs.filter(Boolean).map((c, i) => [i ? h('i', { class: 'tk-crumb-sep' }, '›') : null, h('span', null, c)]),
      ),
      h('h1', { class: 'tk-header__title' }, h('span', { class: 'tk-display' }, title)),
    );
  }

  // ---------------------------------------------------------------------------
  // Standings (GP / VS)
  // ---------------------------------------------------------------------------

  buildStandings(r) {
    const isGP = r.mode === GAME_MODES.GRAND_PRIX;
    const standings = [...(r.standings || [])].sort((a, b) => a.position - b.position);
    const crumbs = isGP
      ? [r.cupName || 'Grand Prix', `Race ${(r.raceIndex ?? 0) + 1} / ${r.raceCount ?? 1}`, r.trackName]
      : [MODE_INFO[r.mode]?.title || 'Race', r.trackName];
    const header = this.head(isGP ? 'Race Results' : 'Results', crumbs);
    this.titleSpan = header.querySelector('.tk-header__title span');

    const list = h('div', { class: `tk-standings${isGP ? ' is-gp' : ''}`, style: { '--rows': String(standings.length) } });
    const leaderTime = standings[0]?.finishTime;
    this.rows = standings.map((s, k) => {
      const ch = this.ui.characters.find((c) => c.id === s.characterId) || { id: s.characterId, name: s.name, cssColor: s.cssColor };
      const pos = h('span', { class: 'tk-row__pos tk-display', 'data-pos': String(s.position) }, String(s.position), h('small', null, ordinalSuffix(s.position)));
      const total = h('span', { class: 'tk-row__total tk-display' }, String(Math.max(0, (s.totalPoints ?? 0) - (s.points ?? 0))));
      const pts = h('span', { class: 'tk-row__pts tk-display' }, `+${s.points ?? 0}`);
      const gap = s.finishTime !== null && s.finishTime !== undefined && k > 0 && Number.isFinite(leaderTime) ? formatDelta(s.finishTime - leaderTime) : '';
      const row = h(
        'div',
        {
          class: `tk-row${s.isPlayer ? ' is-player' : ''}`,
          style: { '--row': String(k), '--i': String(k), '--cc': s.cssColor || ch.cssColor || '#888' },
          'data-pos': String(s.position),
        },
        h('span', { class: 'tk-row__plate' }),
        pos,
        h('span', { class: 'tk-row__portrait', html: portraitSVG(ch) }),
        h('span', { class: 'tk-row__name' }, s.name || ch.name, s.isPlayer ? h('em', { class: 'tk-row__you' }, 'You') : null),
        h('span', { class: 'tk-row__time' }, formatTime(s.finishTime), gap ? h('small', null, gap) : null),
        isGP ? pts : null,
        isGP ? total : null,
      );
      list.appendChild(row);
      return { s, row, pos, total, pts };
    });

    const colHead = h(
      'div',
      { class: `tk-standings__head${isGP ? ' is-gp' : ''} tk-anim-d` },
      h('span', null, 'Pos'),
      h('span', null, ''),
      h('span', null, 'Driver'),
      h('span', null, 'Time'),
      isGP ? h('span', null, 'Pts') : null,
      isGP ? h('span', null, 'Total') : null,
    );

    this.body.append(header, h('div', { class: 'tk-standings-wrap' }, colHead, list), this.standardButtons(), this.footerPrompt());

    if (isGP) {
      const base = 650 + standings.length * 70;
      this.later(base, () => {
        for (const rr of this.rows) replayClass(rr.pts, 'is-pop');
        this.countUp(this.rows.map((rr) => ({ el: rr.total, from: Math.max(0, (rr.s.totalPoints ?? 0) - (rr.s.points ?? 0)), to: rr.s.totalPoints ?? 0 })), 900);
      });
      this.later(base + 1500, () => this.resortByTotal());
    }
  }

  resortByTotal() {
    const order = [...this.rows].sort((a, b) => (b.s.totalPoints ?? 0) - (a.s.totalPoints ?? 0) || a.s.position - b.s.position);
    order.forEach((rr, k) => {
      rr.row.style.setProperty('--row', String(k));
      rr.pos.firstChild.textContent = String(k + 1);
      rr.pos.querySelector('small').textContent = ordinalSuffix(k + 1);
      rr.pos.dataset.pos = String(k + 1);
      rr.row.dataset.pos = String(k + 1);
    });
    for (const rr of this.rows) rr.row.classList.add('is-sorted');
    if (this.titleSpan) {
      this.titleSpan.textContent = 'Cup Standings';
      replayClass(this.titleSpan.parentElement, 'is-swap');
    }
  }

  countUp(entries, duration) {
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - (1 - t) ** 3;
      for (const en of entries) {
        const v = Math.round(en.from + (en.to - en.from) * e);
        if (en.el.textContent !== String(v)) en.el.textContent = String(v);
      }
      if (t < 1) this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }

  footerPrompt() {
    return this.footer({ back: false, select: 'Select', move: true });
  }

  // ---------------------------------------------------------------------------
  // Grand Prix ceremony
  // ---------------------------------------------------------------------------

  showCeremony() {
    this.clearTimers();
    this.clearItems();
    const r = this.results;
    const ranking = [...(r.standings || [])].sort((a, b) => (b.totalPoints ?? 0) - (a.totalPoints ?? 0) || a.position - b.position);
    const playerRank = Math.max(1, ranking.findIndex((s) => s.isPlayer) + 1);
    const player = ranking[playerRank - 1];
    const tier = playerRank <= 3 ? playerRank : 0;
    const title = tier === 1 ? 'Champion!' : `${playerRank}${ordinalSuffix(playerRank)} Place${tier ? '!' : ''}`;
    const sub = tier ? `${r.cupName || 'Grand Prix'} — ${['', 'Gold', 'Silver', 'Bronze'][tier]} Trophy` : 'No trophy this time — give it another go!';

    const podium = h('div', { class: 'tk-podium' });
    [1, 0, 2].forEach((idx) => {
      const s = ranking[idx];
      if (!s) return;
      const ch = this.ui.characters.find((c) => c.id === s.characterId) || { id: s.characterId, name: s.name, cssColor: s.cssColor };
      podium.appendChild(
        h(
          'div',
          { class: `tk-podium__slot is-p${idx + 1}${s.isPlayer ? ' is-player' : ''}`, style: { '--cc': s.cssColor || '#888', '--i': String(3 - idx) } },
          h('span', { class: 'tk-podium__portrait', html: portraitSVG(ch) }),
          h('span', { class: 'tk-podium__name' }, s.name),
          h('span', { class: 'tk-podium__pts' }, `${s.totalPoints ?? 0} pts`),
          h('span', { class: 'tk-podium__block tk-display' }, String(idx + 1)),
        ),
      );
    });

    const confetti = h('div', { class: 'tk-confetti' });
    if (tier) {
      for (let i = 0; i < 90; i++) {
        const c = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
        confetti.appendChild(
          h('i', {
            style: {
              '--x': `${(i * 37.7) % 100}%`,
              '--d': `${((i * 0.137) % 3).toFixed(2)}s`,
              '--t': `${(3.2 + ((i * 0.71) % 2.4)).toFixed(2)}s`,
              '--r': `${(i * 53) % 360}deg`,
              '--s': `${(0.7 + ((i * 0.31) % 0.8)).toFixed(2)}`,
              '--sway': `${((i % 7) - 3) * 2.2}`,
              background: c,
            },
            class: i % 3 === 0 ? 'is-round' : i % 3 === 1 ? 'is-strip' : '',
          }),
        );
      }
    }

    const view = h(
      'div',
      { class: `tk-ceremony tier-${tier}` },
      confetti,
      h('div', { class: 'tk-ceremony__rays' }),
      h(
        'div',
        { class: 'tk-ceremony__main' },
        h('div', { class: 'tk-ceremony__trophy', html: tier ? trophySVG(tier) : ICONS.flags() }),
        h(
          'div',
          { class: 'tk-ceremony__text' },
          h('div', { class: 'tk-ceremony__cup' }, r.cupName || 'Grand Prix'),
          h('div', { class: 'tk-ceremony__title tk-display' }, title),
          h('div', { class: 'tk-ceremony__sub' }, sub),
          h('div', { class: 'tk-ceremony__score' }, h('b', { class: 'tk-display' }, String(player?.totalPoints ?? 0)), ' points'),
        ),
      ),
      podium,
    );
    this.body.innerHTML = '';
    this.body.className = 'tk-results__body is-ceremony';
    this.body.append(
      view,
      this.buttons([{ label: 'Main Menu', c1: '#c49bff', c2: '#6a3df0', action: () => this.ui.emit(EVENTS.UI_QUIT) }]),
      this.footer({ back: false, select: 'Select', move: false }),
    );
    replayClass(this.el, 'is-in');
    this.applyFocus();
  }

  // ---------------------------------------------------------------------------
  // Time Trial
  // ---------------------------------------------------------------------------

  writeRecord(r) {
    const tt = r.timeTrial;
    if (!tt || !Number.isFinite(tt.time)) return;
    const trackId = r.trackId || this.ui.trackIdByName(r.trackName) || this.ui.flow.trackId;
    if (!trackId) return;
    const records = loadJSON(RECORDS_STORAGE_KEY, {}) || {};
    const prev = records[trackId] || null;
    const bestLap = [prev?.bestLap, tt.bestLap].filter((v) => Number.isFinite(v));
    if (tt.isRecord) {
      records[trackId] = { time: tt.time, bestLap: bestLap.length ? Math.min(...bestLap) : null };
      saveJSON(RECORDS_STORAGE_KEY, records);
    } else if (prev && Number.isFinite(tt.bestLap) && (!Number.isFinite(prev.bestLap) || tt.bestLap < prev.bestLap)) {
      records[trackId] = { ...prev, bestLap: tt.bestLap };
      saveJSON(RECORDS_STORAGE_KEY, records);
    }
  }

  buildTimeTrial(r) {
    const tt = r.timeTrial;
    const laps = Array.isArray(tt.lapTimes) ? tt.lapTimes : [];
    const best = laps.length ? Math.min(...laps.filter((v) => Number.isFinite(v))) : tt.bestLap;
    const player = (r.standings || []).find((s) => s.isPlayer) || (r.standings || [])[0];
    const ch = player ? this.ui.characters.find((c) => c.id === player.characterId) : null;

    const lapRows = laps.map((t, i) =>
      h(
        'div',
        { class: `tk-lapsplit${t === best ? ' is-best' : ''} tk-anim-r`, style: { '--i': String(i + 4) } },
        h('span', { class: 'tk-lapsplit__n' }, `Lap ${i + 1}`),
        h('span', { class: 'tk-lapsplit__t tk-display' }, formatTime(t)),
        h('span', { class: 'tk-lapsplit__b' }, t === best ? 'Best' : ''),
      ),
    );

    let compare = null;
    if (tt.isRecord) {
      compare = Number.isFinite(tt.previousRecord)
        ? h('div', { class: 'tk-tt__cmp is-better' }, `Previous ${formatTime(tt.previousRecord)}`, h('b', null, formatDelta(tt.time - tt.previousRecord)))
        : h('div', { class: 'tk-tt__cmp is-better' }, 'First record on this track!');
    } else if (Number.isFinite(tt.previousRecord)) {
      compare = h('div', { class: 'tk-tt__cmp is-worse' }, `Record ${formatTime(tt.previousRecord)}`, h('b', null, formatDelta(tt.time - tt.previousRecord)));
    }

    const panel = h(
      'div',
      { class: `tk-tt${tt.isRecord ? ' is-record' : ''}` },
      h(
        'div',
        { class: 'tk-tt__card tk-anim-pop' },
        h('div', { class: 'tk-panel__stripes' }),
        ch ? h('div', { class: 'tk-tt__portrait', html: portraitSVG(ch) }) : null,
        h('div', { class: 'tk-tt__label' }, 'Final Time'),
        h('div', { class: 'tk-tt__time tk-display' }, formatTime(tt.time)),
        compare,
        tt.isRecord ? h('div', { class: 'tk-tt__stamp tk-display' }, h('span', null, 'New'), h('span', null, 'Record!')) : null,
      ),
      h('div', { class: 'tk-tt__laps' }, h('div', { class: 'tk-tt__lapshead tk-anim-r', style: { '--i': '3' } }, 'Lap Splits'), lapRows),
    );
    this.body.append(this.head('Time Trial', ['Time Trial', r.trackName]), panel, this.standardButtons(), this.footerPrompt());
  }
}
