import { voice, fmBell, softClipCurve } from './synth.js';
import { DRUMS } from './instruments.js';

/**
 * One-shot sound effects. Signature: (ctx, out, t, o) → duration (s).
 * `o.pitch` (default 1) scales frequencies, `o.level` (default 1) scales gain.
 * All work with any BaseAudioContext so they can be rendered offline.
 */

const P = (o) => o.pitch ?? 1;
const L = (o) => o.level ?? 1;

function shaped(ctx, out, amount = 3) {
  const s = ctx.createWaveShaper();
  s.curve = softClipCurve(ctx, amount);
  s.connect(out);
  return s;
}

function chime(ctx, out, t, notes, gap, o = {}) {
  const { peak = 0.16, dur = 0.7, ratio = 3.5, index = 2 } = o;
  notes.forEach((f, i) => fmBell(ctx, out, t + i * gap, f, { dur, peak, ratio, index, decayIndex: 0.15 }));
  return notes.length * gap + dur;
}

export const SFX = {
  // ------------------------------------------------------------ race flow --
  count(ctx, out, t, o = {}) {
    const p = P(o);
    voice(ctx, out, t, { type: 'square', f: 440 * p, dur: 0.32, a: 0.004, peak: 0.16, hold: 0.12, filter: { f: 2600 } });
    voice(ctx, out, t, { type: 'sine', f: 880 * p, dur: 0.3, peak: 0.12, hold: 0.1 });
    return 0.35;
  },
  go(ctx, out, t, o = {}) {
    const p = P(o);
    voice(ctx, out, t, { type: 'square', f: 880 * p, dur: 0.85, a: 0.004, peak: 0.16, hold: 0.35, filter: { f: 3500 }, vib: { rate: 7, depth: 12 } });
    voice(ctx, out, t, { type: 'sine', f: 1760 * p, dur: 0.8, peak: 0.1, hold: 0.3 });
    for (const [f, d] of [[1108.7, 0.02], [1318.5, 0.04], [1760, 0.06]]) {
      fmBell(ctx, out, t + d, f * p, { dur: 0.9, peak: 0.06, ratio: 3.5, index: 1.5 });
    }
    return 0.95;
  },
  lap(ctx, out, t) {
    return chime(ctx, out, t, [1318.5, 1760], 0.13, { peak: 0.2, dur: 0.9 });
  },
  hop(ctx, out, t, o = {}) {
    const p = P(o), l = L(o);
    voice(ctx, out, t, { type: 'sine', f: 190 * p, f2: 430 * p, sweep: 0.09, dur: 0.12, peak: 0.28 * l });
    voice(ctx, out, t, { type: 'noise', dur: 0.05, peak: 0.12 * l, filter: { type: 'lowpass', f: 500 } });
    return 0.13;
  },
  driftStart(ctx, out, t, o = {}) {
    const l = L(o);
    voice(ctx, out, t, { type: 'noise', dur: 0.22, a: 0.01, peak: 0.16 * l, filter: { type: 'bandpass', f: 1800, f2: 2600, q: 3 } });
    voice(ctx, out, t, { type: 'sine', f: 1300, f2: 1550, dur: 0.22, a: 0.02, peak: 0.05 * l, vib: { rate: 11, depth: 25 } });
    return 0.23;
  },
  driftLevel(ctx, out, t, o = {}) {
    const lvl = o.level2 ?? 1;
    const f = [0, 1568, 1976, 2637][Math.min(3, lvl)] || 1568;
    fmBell(ctx, out, t, f, { dur: 0.45, peak: 0.13, ratio: 2.01, index: 1.2, decayIndex: 0.1 });
    fmBell(ctx, out, t + 0.05, f * 1.5, { dur: 0.35, peak: 0.08, ratio: 2.01, index: 1, decayIndex: 0.08 });
    voice(ctx, out, t, { type: 'noise', dur: 0.06, peak: 0.07, filter: { type: 'highpass', f: 6000 } });
    return 0.5;
  },
  miniTurbo(ctx, out, t, o = {}) {
    const lvl = Math.max(1, Math.min(3, o.level2 ?? 1));
    const l = L(o);
    const dur = 0.45 + 0.18 * lvl;
    // pop
    voice(ctx, out, t, { type: 'noise', dur: 0.07, peak: 0.32 * l, filter: { type: 'lowpass', f: 1600 } });
    voice(ctx, out, t, { type: 'sine', f: 160, f2: 60, sweep: 0.08, dur: 0.1, peak: 0.4 * l });
    // fwoosh
    voice(ctx, out, t + 0.02, { type: 'noise', dur, a: 0.03, peak: (0.16 + 0.04 * lvl) * l, filter: { type: 'bandpass', f: 500, f2: 2600 + 600 * lvl, q: 1.4, sweep: dur * 0.7 } });
    const d = shaped(ctx, out, 2.5);
    voice(ctx, d, t + 0.02, { type: 'sawtooth', f: 90, f2: 180 + 30 * lvl, sweep: dur * 0.6, dur, a: 0.02, peak: 0.12 * l, filter: { f: 900 } });
    voice(ctx, out, t + 0.03, { type: 'sine', f: 700 + 150 * lvl, f2: 1500 + 400 * lvl, sweep: dur * 0.5, dur: dur * 0.8, a: 0.03, peak: 0.05 * l });
    return dur + 0.05;
  },
  boost(ctx, out, t, o = {}) {
    const l = L(o);
    voice(ctx, out, t, { type: 'noise', dur: 0.9, a: 0.04, peak: 0.26 * l, filter: { type: 'bandpass', f: 280, f2: 3200, q: 1.1, sweep: 0.55 } });
    const d = shaped(ctx, out, 3);
    voice(ctx, d, t, { type: 'sawtooth', f: 70, f2: 165, sweep: 0.5, dur: 0.85, a: 0.03, peak: 0.16 * l, filter: { f: 700 } });
    voice(ctx, out, t, { type: 'sine', f: 120, f2: 55, sweep: 0.15, dur: 0.2, peak: 0.35 * l });
    voice(ctx, out, t + 0.05, { type: 'sine', f: 600, f2: 1800, sweep: 0.5, dur: 0.6, a: 0.05, peak: 0.04 * l });
    return 0.95;
  },
  boostPad(ctx, out, t, o = {}) {
    const l = L(o);
    voice(ctx, out, t, { type: 'sawtooth', f: 280, f2: 2000, sweep: 0.22, dur: 0.3, peak: 0.1 * l, filter: { type: 'bandpass', f: 1200, q: 2 } });
    voice(ctx, out, t, { type: 'square', f: 560, f2: 2600, sweep: 0.18, dur: 0.25, peak: 0.06 * l, filter: { f: 4000 } });
    voice(ctx, out, t + 0.02, { type: 'noise', dur: 0.55, a: 0.02, peak: 0.18 * l, filter: { type: 'bandpass', f: 600, f2: 4000, q: 1.3, sweep: 0.4 } });
    fmBell(ctx, out, t, 2349, { dur: 0.3, peak: 0.05 * l, ratio: 1.5, index: 2 });
    return 0.6;
  },
  rocketStart(ctx, out, t, o = {}) {
    SFX.boost(ctx, out, t, { level: 1.15 * L(o) });
    chime(ctx, out, t, [1046.5, 1318.5, 1568, 2093], 0.05, { peak: 0.09, dur: 0.5 });
    return 1;
  },
  trick(ctx, out, t, o = {}) {
    const p = P(o);
    voice(ctx, out, t, { type: 'sine', f: 600 * p, f2: 1700 * p, sweep: 0.16, dur: 0.2, peak: 0.12 });
    voice(ctx, out, t, { type: 'noise', dur: 0.25, peak: 0.08, filter: { type: 'bandpass', f: 1500, f2: 5000, q: 2 } });
    chime(ctx, out, t + 0.12, [2093 * p, 2637 * p], 0.06, { peak: 0.1, dur: 0.45 });
    return 0.65;
  },
  land(ctx, out, t, o = {}) {
    const l = L(o);
    voice(ctx, out, t, { type: 'sine', f: 120, f2: 45, sweep: 0.14, dur: 0.22, peak: 0.45 * l });
    voice(ctx, out, t, { type: 'noise', dur: 0.12, peak: 0.16 * l, filter: { type: 'lowpass', f: 600 } });
    voice(ctx, out, t, { type: 'noise', dur: 0.05, peak: 0.06 * l, filter: { type: 'bandpass', f: 2200, q: 1 } });
    return 0.24;
  },
  wallHit(ctx, out, t, o = {}) {
    const l = L(o);
    const d = shaped(ctx, out, 2);
    voice(ctx, d, t, { type: 'noise', dur: 0.18, peak: 0.3 * l, filter: { type: 'bandpass', f: 1000, q: 0.9 } });
    voice(ctx, out, t, { type: 'sine', f: 95, f2: 48, sweep: 0.18, dur: 0.24, peak: 0.4 * l });
    for (const [f, g] of [[523, 0.05], [1381, 0.035], [2213, 0.025]]) {
      voice(ctx, out, t, { type: 'sine', f: f * (0.97 + Math.random() * 0.06), dur: 0.3, peak: g * l });
    }
    return 0.32;
  },
  bump(ctx, out, t, o = {}) {
    const l = L(o), p = P(o);
    voice(ctx, out, t, { type: 'sine', f: 170 * p, f2: 85 * p, sweep: 0.1, dur: 0.14, peak: 0.35 * l });
    voice(ctx, out, t, { type: 'noise', dur: 0.06, peak: 0.14 * l, filter: { type: 'lowpass', f: 900 } });
    voice(ctx, out, t + 0.02, { type: 'triangle', f: 320 * p, f2: 520 * p, sweep: 0.08, dur: 0.12, peak: 0.08 * l });
    return 0.16;
  },
  spinOut(ctx, out, t, o = {}) {
    const l = L(o);
    voice(ctx, out, t, { type: 'sawtooth', f: 950, f2: 230, sweep: 0.75, dur: 0.8, a: 0.01, peak: 0.08 * l, vib: { rate: 13, depth: 70 }, filter: { f: 2400 } });
    voice(ctx, out, t, { type: 'noise', dur: 0.6, a: 0.02, peak: 0.14 * l, filter: { type: 'bandpass', f: 2200, f2: 900, q: 3 } });
    voice(ctx, out, t, { type: 'sine', f: 140, f2: 70, sweep: 0.15, dur: 0.2, peak: 0.25 * l });
    return 0.82;
  },
  launched(ctx, out, t, o = {}) {
    const l = L(o);
    voice(ctx, out, t, { type: 'sine', f: 380, f2: 1400, sweep: 0.45, dur: 0.5, a: 0.02, peak: 0.1 * l, glide: 'exp' });
    voice(ctx, out, t + 0.45, { type: 'sine', f: 1400, f2: 500, sweep: 0.6, dur: 0.65, peak: 0.08 * l });
    voice(ctx, out, t, { type: 'noise', dur: 0.5, peak: 0.12 * l, filter: { type: 'bandpass', f: 800, f2: 3000, q: 1 } });
    return 1.12;
  },
  fall(ctx, out, t, o = {}) {
    const l = L(o);
    voice(ctx, out, t, { type: 'sine', f: 1400, f2: 170, sweep: 1.3, dur: 1.35, a: 0.02, peak: 0.13 * l, vib: { rate: 7, depth: 40 }, curve: 'lin' });
    voice(ctx, out, t, { type: 'triangle', f: 700, f2: 85, sweep: 1.3, dur: 1.35, a: 0.02, peak: 0.05 * l, curve: 'lin' });
    return 1.4;
  },
  respawn(ctx, out, t) {
    voice(ctx, out, t, { type: 'noise', dur: 0.7, a: 0.2, peak: 0.05, filter: { type: 'highpass', f: 5000 } });
    return chime(ctx, out, t, [1046.5, 1318.5, 1568, 2093, 2637], 0.07, { peak: 0.12, dur: 0.6, ratio: 2.01, index: 1.2 });
  },
  shrink(ctx, out, t, o = {}) {
    const l = L(o);
    const g = ctx.createGain();
    g.connect(out);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 28;
    const lg = ctx.createGain();
    lg.gain.value = 0.5;
    g.gain.value = 0.5;
    lfo.connect(lg);
    lg.connect(g.gain);
    lfo.start(t);
    lfo.stop(t + 0.6);
    voice(ctx, g, t, { type: 'square', f: 1300, f2: 140, sweep: 0.5, dur: 0.55, peak: 0.12 * l, filter: { type: 'lowpass', f: 3000, f2: 600 } });
    voice(ctx, out, t, { type: 'sine', f: 2400, f2: 300, sweep: 0.3, dur: 0.32, peak: 0.06 * l });
    return 0.6;
  },
  starStart(ctx, out, t) {
    const notes = [1046.5, 1174.7, 1318.5, 1396.9, 1568, 1760, 1975.5, 2093];
    return chime(ctx, out, t, notes, 0.035, { peak: 0.08, dur: 0.45, ratio: 3.01, index: 1 });
  },
  // ------------------------------------------------------------------ items --
  coin(ctx, out, t, o = {}) {
    const p = P(o);
    voice(ctx, out, t, { type: 'square', f: 988 * p, dur: 0.07, a: 0.002, peak: 0.08, hold: 0.05, curve: 'lin', filter: { f: 6000 } });
    voice(ctx, out, t + 0.07, { type: 'square', f: 1319 * p, dur: 0.38, a: 0.002, peak: 0.08, hold: 0.04, filter: { f: 6000 } });
    voice(ctx, out, t + 0.07, { type: 'sine', f: 2638 * p, dur: 0.3, peak: 0.04 });
    return 0.46;
  },
  coinLost(ctx, out, t) {
    [1568, 1319, 1047].forEach((f, i) => {
      voice(ctx, out, t + i * 0.07, { type: 'square', f, dur: 0.1, peak: 0.05, filter: { f: 5000 } });
    });
    return 0.3;
  },
  itemBox(ctx, out, t, o = {}) {
    const l = L(o);
    voice(ctx, out, t, { type: 'noise', dur: 0.28, peak: 0.16 * l, filter: { type: 'highpass', f: 2800 } });
    voice(ctx, out, t, { type: 'sine', f: 240, f2: 110, sweep: 0.08, dur: 0.12, peak: 0.25 * l });
    for (let i = 0; i < 7; i++) {
      fmBell(ctx, out, t + Math.random() * 0.12, 2000 + Math.random() * 4500, { dur: 0.25 + Math.random() * 0.3, peak: 0.035 * l, ratio: 1.41 + Math.random(), index: 1.5, decayIndex: 0.05 });
    }
    return 0.55;
  },
  rouletteTick(ctx, out, t, o = {}) {
    const p = P(o);
    voice(ctx, out, t, { type: 'square', f: 1250 * p, dur: 0.03, a: 0.001, peak: 0.045, filter: { f: 5000 } });
    voice(ctx, out, t, { type: 'triangle', f: 2500 * p, dur: 0.02, peak: 0.025 });
    return 0.04;
  },
  rouletteLand(ctx, out, t) {
    voice(ctx, out, t, { type: 'triangle', f: 1318.5, dur: 0.12, peak: 0.12, hold: 0.04 });
    voice(ctx, out, t + 0.09, { type: 'triangle', f: 1760, dur: 0.35, peak: 0.12, hold: 0.05 });
    fmBell(ctx, out, t + 0.09, 3520, { dur: 0.5, peak: 0.05, ratio: 2.01, index: 1 });
    return 0.5;
  },
  throw(ctx, out, t, o = {}) {
    const l = L(o);
    voice(ctx, out, t, { type: 'noise', dur: 0.2, a: 0.01, peak: 0.13 * l, filter: { type: 'bandpass', f: 700, f2: 2400, q: 1.5 } });
    voice(ctx, out, t, { type: 'sine', f: 300, f2: 160, sweep: 0.1, dur: 0.12, peak: 0.12 * l });
    return 0.22;
  },
  shellFire(ctx, out, t, o = {}) {
    const l = L(o), p = P(o);
    voice(ctx, out, t, { type: 'sine', f: 230 * p, f2: 85 * p, sweep: 0.12, dur: 0.16, peak: 0.38 * l });
    voice(ctx, out, t, { type: 'noise', dur: 0.08, peak: 0.12 * l, filter: { type: 'lowpass', f: 1200 } });
    voice(ctx, out, t + 0.03, { type: 'noise', dur: 0.3, a: 0.02, peak: 0.1 * l, filter: { type: 'bandpass', f: 900, f2: 3000, q: 1.6 } });
    return 0.34;
  },
  bananaDrop(ctx, out, t, o = {}) {
    const l = L(o);
    voice(ctx, out, t, { type: 'sine', f: 520, f2: 240, sweep: 0.08, dur: 0.1, peak: 0.18 * l });
    voice(ctx, out, t + 0.03, { type: 'noise', dur: 0.08, peak: 0.08 * l, filter: { type: 'bandpass', f: 650, q: 2 } });
    return 0.13;
  },
  shellBounce(ctx, out, t, o = {}) {
    const l = L(o), p = P(o);
    voice(ctx, out, t, { type: 'sine', f: 720 * p, dur: 0.05, peak: 0.16 * l });
    voice(ctx, out, t, { type: 'triangle', f: 1450 * p, dur: 0.035, peak: 0.08 * l });
    return 0.06;
  },
  bananaSlip(ctx, out, t, o = {}) {
    const l = L(o);
    voice(ctx, out, t, { type: 'sine', f: 1100, f2: 2500, sweep: 0.1, dur: 0.12, peak: 0.1 * l });
    voice(ctx, out, t + 0.1, { type: 'sine', f: 2500, f2: 800, sweep: 0.18, dur: 0.2, peak: 0.08 * l });
    voice(ctx, out, t, { type: 'noise', dur: 0.4, peak: 0.1 * l, filter: { type: 'bandpass', f: 2000, q: 3 } });
    return 0.42;
  },
  itemHit(ctx, out, t, o = {}) {
    const l = L(o);
    const d = shaped(ctx, out, 2.5);
    voice(ctx, d, t, { type: 'sine', f: 200, f2: 65, sweep: 0.22, dur: 0.3, peak: 0.42 * l });
    voice(ctx, out, t, { type: 'noise', dur: 0.14, peak: 0.2 * l, filter: { type: 'bandpass', f: 1600, q: 0.8 } });
    voice(ctx, out, t + 0.03, { type: 'triangle', f: 900, f2: 1500, sweep: 0.1, dur: 0.18, peak: 0.06 * l, vib: { rate: 18, depth: 80 } });
    return 0.32;
  },
  blocked(ctx, out, t, o = {}) {
    const l = L(o);
    for (const [f, g, d] of [[1040, 0.08, 0.45], [2730, 0.05, 0.35], [4320, 0.03, 0.25]]) {
      voice(ctx, out, t, { type: 'sine', f, dur: d, peak: g * l });
    }
    voice(ctx, out, t, { type: 'noise', dur: 0.03, peak: 0.12 * l, filter: { type: 'highpass', f: 3000 } });
    return 0.46;
  },
  crunch(ctx, out, t, o = {}) {
    const l = L(o);
    voice(ctx, out, t, { type: 'noise', dur: 0.12, peak: 0.14 * l, filter: { type: 'bandpass', f: 1300, q: 1 } });
    voice(ctx, out, t, { type: 'sine', f: 300, f2: 120, sweep: 0.06, dur: 0.08, peak: 0.12 * l });
    return 0.13;
  },
  explosion(ctx, out, t, o = {}) {
    const l = L(o);
    const d = shaped(ctx, out, 2.2);
    // initial crack
    voice(ctx, d, t, { type: 'noise', dur: 0.12, a: 0.001, peak: 0.32 * l, filter: { type: 'lowpass', f: 6000 } });
    // body roar
    voice(ctx, d, t, { type: 'brown', dur: 1.9, a: 0.008, peak: 0.42 * l, filter: { type: 'lowpass', f: 2600, f2: 140, q: 0.7, sweep: 1.5 } });
    // sub drop
    voice(ctx, out, t, { type: 'sine', f: 75, f2: 26, sweep: 0.9, dur: 1.1, a: 0.005, peak: 0.45 * l });
    // crackle tail
    for (let i = 0; i < 8; i++) {
      const tt = t + 0.15 + Math.random() * 0.9;
      voice(ctx, out, tt, { type: 'noise', dur: 0.03 + Math.random() * 0.04, peak: (0.04 + Math.random() * 0.05) * l, filter: { type: 'bandpass', f: 1500 + Math.random() * 3000, q: 2 } });
    }
    return 2.0;
  },
  lightning(ctx, out, t, o = {}) {
    const l = L(o);
    // crack
    voice(ctx, out, t, { type: 'noise', dur: 0.1, a: 0.0008, peak: 0.42 * l, filter: { type: 'highpass', f: 1400 } });
    voice(ctx, out, t, { type: 'sawtooth', f: 3200, f2: 180, sweep: 0.16, dur: 0.18, peak: 0.1 * l, filter: { f: 6000 } });
    voice(ctx, out, t + 0.04, { type: 'noise', dur: 0.08, a: 0.001, peak: 0.28 * l, filter: { type: 'highpass', f: 2200 } });
    // thunder rumble
    const d = shaped(ctx, out, 1.8);
    voice(ctx, d, t + 0.08, { type: 'brown', dur: 2.6, a: 0.12, peak: 0.55 * l, filter: { type: 'lowpass', f: 420, f2: 140, sweep: 2.2 } });
    for (let i = 0; i < 3; i++) {
      voice(ctx, d, t + 0.3 + i * 0.45 + Math.random() * 0.2, { type: 'brown', dur: 0.8, a: 0.06, peak: (0.3 - i * 0.06) * l, filter: { type: 'lowpass', f: 300 } });
    }
    return 2.8;
  },
  spinyWarning(ctx, out, t) {
    for (let i = 0; i < 4; i++) {
      voice(ctx, out, t + i * 0.4, { type: 'square', f: 660, f2: 990, sweep: 0.2, dur: 0.38, a: 0.01, peak: 0.07, hold: 0.15, filter: { f: 2600 }, curve: 'lin' });
      voice(ctx, out, t + i * 0.4 + 0.2, { type: 'square', f: 990, f2: 660, sweep: 0.18, dur: 0.2, peak: 0.06, filter: { f: 2600 }, curve: 'lin' });
    }
    return 1.65;
  },
  positionUp(ctx, out, t) {
    voice(ctx, out, t, { type: 'triangle', f: 784, dur: 0.08, peak: 0.1 });
    voice(ctx, out, t + 0.07, { type: 'triangle', f: 1175, dur: 0.18, peak: 0.1 });
    return 0.26;
  },
  positionDown(ctx, out, t) {
    voice(ctx, out, t, { type: 'triangle', f: 622, dur: 0.08, peak: 0.08 });
    voice(ctx, out, t + 0.08, { type: 'triangle', f: 440, dur: 0.18, peak: 0.08 });
    return 0.27;
  },
  stall(ctx, out, t) {
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.16;
      voice(ctx, out, tt, { type: 'noise', dur: 0.1, peak: 0.18 - i * 0.04, filter: { type: 'lowpass', f: 500 - i * 100 } });
      voice(ctx, out, tt, { type: 'sawtooth', f: 70 - i * 10, f2: 45 - i * 8, dur: 0.11, peak: 0.12 - i * 0.03, filter: { f: 400 } });
    }
    voice(ctx, out, t + 0.5, { type: 'noise', dur: 0.4, a: 0.05, peak: 0.06, filter: { type: 'bandpass', f: 800, q: 0.8 } });
    return 0.9;
  },
  wrongWay(ctx, out, t) {
    voice(ctx, out, t, { type: 'square', f: 220, dur: 0.14, peak: 0.07, filter: { f: 1500 }, hold: 0.06 });
    voice(ctx, out, t + 0.2, { type: 'square', f: 220, dur: 0.14, peak: 0.07, filter: { f: 1500 }, hold: 0.06 });
    return 0.36;
  },
  // ---------------------------------------------------------------------- UI --
  uiNavigate(ctx, out, t, o = {}) {
    const p = P(o);
    voice(ctx, out, t, { type: 'triangle', f: 1180 * p, dur: 0.05, peak: 0.08 });
    voice(ctx, out, t, { type: 'sine', f: 2360 * p, dur: 0.03, peak: 0.03 });
    return 0.06;
  },
  uiConfirm(ctx, out, t) {
    voice(ctx, out, t, { type: 'triangle', f: 1046.5, dur: 0.09, peak: 0.1 });
    voice(ctx, out, t + 0.065, { type: 'triangle', f: 1568, dur: 0.22, peak: 0.1 });
    fmBell(ctx, out, t + 0.065, 3136, { dur: 0.35, peak: 0.035, ratio: 2.01, index: 1 });
    return 0.32;
  },
  uiBack(ctx, out, t) {
    voice(ctx, out, t, { type: 'triangle', f: 784, dur: 0.08, peak: 0.09 });
    voice(ctx, out, t + 0.07, { type: 'triangle', f: 523, dur: 0.16, peak: 0.09 });
    return 0.24;
  },
  // drum hits usable from the SFX api
  thud(ctx, out, t) {
    DRUMS.kick(ctx, out, t, 0.8);
    return 0.4;
  },
};

export const SFX_NAMES = Object.keys(SFX);

/** Default options used by the offline test & audition page for parametric SFX. */
export const SFX_TEST_OPTS = {
  driftLevel: { level2: 3 },
  miniTurbo: { level2: 3 },
  coin: { pitch: 1.12 },
};

