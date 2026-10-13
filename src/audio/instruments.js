import { noiseBuffer, voice, fmBell, adsr } from './synth.js';
import { midiToFreq } from './theory.js';

/**
 * Synthesized instruments for the sequencer. All take (ctx, out, t, ...) and
 * work with any BaseAudioContext.
 */

const EPS = 0.0001;

function noiseSrc(ctx, color = 'white') {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx, color);
  s.loop = true;
  return s;
}

function noiseHit(ctx, out, t, { color = 'white', type = 'highpass', f = 6000, q = 0.7, peak = 0.2, a = 0.001, decay = 0.08, f2 = null }) {
  const src = noiseSrc(ctx, color);
  const flt = ctx.createBiquadFilter();
  flt.type = type;
  flt.frequency.setValueAtTime(f, t);
  if (f2) flt.frequency.exponentialRampToValueAtTime(f2, t + decay);
  flt.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(EPS, t + a + decay);
  src.connect(flt);
  flt.connect(g);
  g.connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + a + decay + 0.05);
}

// ---------------------------------------------------------------------------
// Drums
// ---------------------------------------------------------------------------
export const DRUMS = {
  kick(ctx, out, t, v = 1, p = {}) {
    const tune = p.tune ?? 1;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(155 * tune, t);
    o.frequency.exponentialRampToValueAtTime(46 * tune, t + 0.11);
    o.frequency.exponentialRampToValueAtTime(38 * tune, t + 0.4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(EPS, t);
    g.gain.linearRampToValueAtTime(0.95 * v, t + 0.002);
    g.gain.setTargetAtTime(0.0001, t + 0.06, (p.decay ?? 0.42) / 4);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 0.7);
    noiseHit(ctx, out, t, { type: 'highpass', f: 2500, peak: 0.18 * v, decay: 0.012 });
  },
  snare(ctx, out, t, v = 1, p = {}) {
    noiseHit(ctx, out, t, { type: 'bandpass', f: p.f ?? 2200, q: 0.7, peak: 0.42 * v, decay: p.decay ?? 0.17 });
    noiseHit(ctx, out, t, { type: 'highpass', f: 5000, peak: 0.16 * v, decay: (p.decay ?? 0.17) * 0.7 });
    voice(ctx, out, t, { type: 'triangle', f: 200, f2: 150, sweep: 0.08, dur: 0.11, peak: 0.32 * v });
  },
  clap(ctx, out, t, v = 1) {
    for (let i = 0; i < 3; i++) {
      noiseHit(ctx, out, t + i * 0.011, { type: 'bandpass', f: 1250, q: 1.6, peak: 0.32 * v, decay: 0.012 });
    }
    noiseHit(ctx, out, t + 0.033, { type: 'bandpass', f: 1150, q: 1.2, peak: 0.36 * v, decay: 0.16 });
  },
  hat(ctx, out, t, v = 1) {
    noiseHit(ctx, out, t, { type: 'highpass', f: 7500, peak: 0.16 * v, decay: 0.04 });
  },
  openHat(ctx, out, t, v = 1) {
    noiseHit(ctx, out, t, { type: 'highpass', f: 6500, peak: 0.13 * v, decay: 0.26 });
    noiseHit(ctx, out, t, { type: 'bandpass', f: 9500, q: 1.5, peak: 0.07 * v, decay: 0.2 });
  },
  crash(ctx, out, t, v = 1) {
    noiseHit(ctx, out, t, { type: 'highpass', f: 3800, peak: 0.2 * v, decay: 1.5 });
    noiseHit(ctx, out, t, { type: 'bandpass', f: 7000, q: 0.8, peak: 0.12 * v, decay: 1.1 });
  },
  ride(ctx, out, t, v = 1) {
    fmBell(ctx, out, t, 470, { dur: 0.8, peak: 0.05 * v, ratio: 2.41, index: 2.5, decayIndex: 0.2 });
    noiseHit(ctx, out, t, { type: 'highpass', f: 8000, peak: 0.06 * v, decay: 0.3 });
  },
  tom(ctx, out, t, v = 1, p = {}) {
    const f = p.f ?? 160;
    voice(ctx, out, t, { type: 'sine', f: f * 1.5, f2: f, sweep: 0.12, dur: 0.38, peak: 0.6 * v });
    noiseHit(ctx, out, t, { type: 'lowpass', f: 1500, peak: 0.1 * v, decay: 0.05 });
  },
  shaker(ctx, out, t, v = 1) {
    noiseHit(ctx, out, t, { type: 'bandpass', f: 6500, q: 1.4, peak: 0.1 * v, a: 0.012, decay: 0.06 });
  },
  jingle(ctx, out, t, v = 1) {
    // sleigh bells: a cluster of tiny inharmonic bells + sizzle
    for (let i = 0; i < 3; i++) {
      fmBell(ctx, out, t + i * 0.006, 3200 + Math.random() * 2600, { dur: 0.16, peak: 0.022 * v, ratio: 1.41, index: 1.5, decayIndex: 0.05 });
    }
    noiseHit(ctx, out, t, { type: 'highpass', f: 8500, peak: 0.08 * v, a: 0.004, decay: 0.09 });
  },
  dum(ctx, out, t, v = 1) {
    voice(ctx, out, t, { type: 'sine', f: 120, f2: 78, sweep: 0.12, dur: 0.42, peak: 0.6 * v });
    noiseHit(ctx, out, t, { type: 'lowpass', f: 900, peak: 0.12 * v, decay: 0.04 });
  },
  tek(ctx, out, t, v = 1) {
    noiseHit(ctx, out, t, { type: 'bandpass', f: 3200, q: 2.5, peak: 0.3 * v, decay: 0.045 });
    voice(ctx, out, t, { type: 'triangle', f: 640, f2: 560, dur: 0.05, peak: 0.16 * v });
  },
  ka(ctx, out, t, v = 1) {
    noiseHit(ctx, out, t, { type: 'bandpass', f: 2600, q: 2, peak: 0.14 * v, decay: 0.03 });
  },
  rim(ctx, out, t, v = 1) {
    voice(ctx, out, t, { type: 'triangle', f: 1750, dur: 0.03, peak: 0.2 * v });
    noiseHit(ctx, out, t, { type: 'bandpass', f: 2600, q: 3, peak: 0.12 * v, decay: 0.02 });
  },
  cowbell(ctx, out, t, v = 1) {
    const flt = ctx.createBiquadFilter();
    flt.type = 'bandpass';
    flt.frequency.value = 900;
    flt.Q.value = 2.5;
    flt.connect(out);
    voice(ctx, flt, t, { type: 'square', f: 545, dur: 0.22, peak: 0.16 * v });
    voice(ctx, flt, t, { type: 'square', f: 815, dur: 0.22, peak: 0.12 * v });
  },
  timpani(ctx, out, t, v = 1, p = {}) {
    const f = p.f ?? 98;
    voice(ctx, out, t, { type: 'sine', f: f * 1.04, f2: f, sweep: 0.15, dur: 1.0, peak: 0.55 * v });
    voice(ctx, out, t, { type: 'sine', f: f * 1.5, dur: 0.5, peak: 0.12 * v });
    noiseHit(ctx, out, t, { type: 'lowpass', f: 600, peak: 0.12 * v, decay: 0.12 });
  },
  snap(ctx, out, t, v = 1) {
    noiseHit(ctx, out, t, { type: 'bandpass', f: 3000, q: 1.2, peak: 0.25 * v, decay: 0.035 });
  },
};

// ---------------------------------------------------------------------------
// Melodic presets
// ---------------------------------------------------------------------------
const O = (type, gain = 1, detune = 0, oct = 0) => ({ type, gain, detune, oct });

export const PRESETS = {
  // leads
  supersaw: { osc: [O('sawtooth', 0.45, -11), O('sawtooth', 0.45, 11), O('square', 0.22, 0, -1)], filter: { f: 1600, q: 1, env: 2800, decay: 0.25, key: 0.5 }, amp: { a: 0.008, d: 0.25, s: 0.7, r: 0.14 }, vib: { rate: 5.6, depth: 14, delay: 0.16 }, gain: 0.15, send: 0.35 },
  squareLead: { osc: [O('square', 0.55), O('square', 0.35, 8)], filter: { f: 2400, q: 0.8, env: 1800, decay: 0.12, key: 0.5 }, amp: { a: 0.004, d: 0.12, s: 0.65, r: 0.08 }, vib: { rate: 6, depth: 16, delay: 0.14 }, gain: 0.12, send: 0.25 },
  sawLead: { osc: [O('sawtooth', 0.5, -8), O('sawtooth', 0.5, 8), O('sawtooth', 0.2, 0, 1)], filter: { f: 1800, q: 3, env: 3200, decay: 0.3, key: 0.5 }, amp: { a: 0.01, d: 0.3, s: 0.75, r: 0.2 }, vib: { rate: 5.2, depth: 15, delay: 0.2 }, gain: 0.13, send: 0.4, delay: 0.32 },
  softLead: { osc: [O('triangle', 0.9), O('sine', 0.25, 0, 1)], filter: { f: 3200, q: 0.5 }, amp: { a: 0.025, d: 0.25, s: 0.8, r: 0.25 }, vib: { rate: 5, depth: 18, delay: 0.25 }, gain: 0.22, send: 0.45 },
  flute: { osc: [O('sine', 0.9), O('triangle', 0.3)], filter: { f: 3500, q: 0.5 }, amp: { a: 0.05, d: 0.2, s: 0.85, r: 0.15 }, vib: { rate: 5.2, depth: 14, delay: 0.18 }, noise: { gain: 0.05, f: 2200, q: 1 }, gain: 0.2, send: 0.45 },
  reed: { osc: [O('sawtooth', 0.6), O('square', 0.4, 6)], filter: { type: 'bandpass', f: 1300, q: 2.2, key: 0.8 }, amp: { a: 0.02, d: 0.1, s: 0.85, r: 0.08 }, vib: { rate: 6.4, depth: 32, delay: 0.1 }, gain: 0.32, send: 0.35 },
  brass: { osc: [O('sawtooth', 0.5, -6), O('sawtooth', 0.5, 6)], filter: { f: 500, q: 1.3, env: 2600, decay: 0.2, swell: 0.06, key: 0.5 }, amp: { a: 0.025, d: 0.2, s: 0.8, r: 0.14 }, vib: { rate: 5, depth: 10, delay: 0.25 }, gain: 0.16, send: 0.35 },
  // plucks / arps
  pluck: { osc: [O('sawtooth', 0.6), O('square', 0.3, 5)], filter: { f: 500, q: 3.5, env: 3800, decay: 0.12, key: 0.5 }, amp: { a: 0.002, d: 0.25, s: 0, r: 0.1 }, gain: 0.11, send: 0.3 },
  synthArp: { osc: [O('square', 0.5), O('sawtooth', 0.4, 10)], filter: { f: 700, q: 6, env: 3800, decay: 0.09, key: 0.4 }, amp: { a: 0.002, d: 0.17, s: 0.12, r: 0.06 }, gain: 0.1, send: 0.3, delay: 0.25 },
  oud: { osc: [O('sawtooth', 0.6), O('triangle', 0.4, 0, -1)], filter: { f: 650, q: 5, env: 3200, decay: 0.08, key: 0.7 }, amp: { a: 0.001, d: 0.35, s: 0, r: 0.12 }, pitchEnv: { amt: 2, decay: 0.025 }, gain: 0.15, send: 0.3 },
  // basses
  pickBass: { osc: [O('sawtooth', 0.55), O('sine', 0.8, 0, -1)], filter: { f: 280, q: 2, env: 1400, decay: 0.12, key: 0.3 }, amp: { a: 0.004, d: 0.25, s: 0.6, r: 0.06 }, gain: 0.3 },
  slapBass: { osc: [O('sawtooth', 0.6), O('sine', 1)], filter: { f: 320, q: 4, env: 2800, decay: 0.07 }, amp: { a: 0.002, d: 0.2, s: 0.45, r: 0.05 }, pitchEnv: { amt: 4, decay: 0.012 }, gain: 0.3 },
  bouncyBass: { osc: [O('square', 0.45), O('sine', 1)], filter: { f: 480, q: 1, env: 900, decay: 0.1 }, amp: { a: 0.003, d: 0.2, s: 0.5, r: 0.05 }, gain: 0.3 },
  subBass: { osc: [O('sine', 1), O('triangle', 0.35)], filter: { f: 420, q: 0.7 }, amp: { a: 0.005, d: 0.3, s: 0.8, r: 0.08 }, gain: 0.4 },
  synthBass: { osc: [O('sawtooth', 0.5, -6), O('sawtooth', 0.5, 6), O('square', 0.45, 0, -1)], filter: { f: 240, q: 5, env: 1700, decay: 0.1 }, amp: { a: 0.003, d: 0.15, s: 0.6, r: 0.05 }, gain: 0.22 },
  warmBass: { osc: [O('triangle', 1), O('sine', 0.8)], filter: { f: 650, q: 0.6 }, amp: { a: 0.006, d: 0.3, s: 0.7, r: 0.1 }, gain: 0.36 },
  // pads
  warmPad: { osc: [O('sawtooth', 0.35, -10), O('sawtooth', 0.35, 10), O('triangle', 0.25, 0, 1)], filter: { f: 1300, q: 0.7 }, amp: { a: 0.35, d: 0.5, s: 0.85, r: 0.6 }, gain: 0.06, send: 0.5 },
  sawPad: { osc: [O('sawtooth', 0.4, -14), O('sawtooth', 0.4, 14), O('sawtooth', 0.3, 0, -1)], filter: { f: 1000, q: 1.5 }, amp: { a: 0.12, d: 0.4, s: 0.9, r: 0.4 }, gain: 0.06, send: 0.55 },
  choirPad: { osc: [O('triangle', 0.5, -8), O('triangle', 0.5, 8), O('sine', 0.3, 0, 1)], filter: { type: 'bandpass', f: 950, q: 0.6 }, amp: { a: 0.4, d: 0.5, s: 0.9, r: 0.6 }, vib: { rate: 4.5, depth: 9, delay: 0 }, gain: 0.12, send: 0.6 },
  drone: { osc: [O('sawtooth', 0.5, -5), O('sawtooth', 0.5, 5)], filter: { f: 480, q: 2 }, amp: { a: 0.6, d: 1, s: 1, r: 1 }, gain: 0.05, send: 0.5 },
  strings: { osc: [O('sawtooth', 0.5, -7), O('sawtooth', 0.5, 7)], filter: { f: 1900, q: 0.6 }, amp: { a: 0.18, d: 0.3, s: 0.85, r: 0.4 }, vib: { rate: 5.5, depth: 8, delay: 0.3 }, gain: 0.07, send: 0.5 },
  organPad: { osc: [O('sine', 0.7), O('sine', 0.35, 0, 1), O('sine', 0.18, 0, 2)], filter: { f: 4000, q: 0.5 }, amp: { a: 0.02, d: 0.1, s: 0.9, r: 0.12 }, gain: 0.07, send: 0.3 },
  // FM
  epiano: { fm: { ratio: 1, index: 1.6, decayIndex: 0.5, a: 0.003 }, release: 0.35, gain: 0.13, send: 0.3 },
  glock: { fm: { ratio: 3.5, index: 2.0, decayIndex: 0.2, a: 0.001 }, fixedDur: 1.1, gain: 0.11, send: 0.45 },
  marimba: { fm: { ratio: 4, index: 1.4, decayIndex: 0.06, a: 0.002 }, fixedDur: 0.45, gain: 0.22, send: 0.25 },
  celesta: { fm: { ratio: 4, index: 0.9, decayIndex: 0.15, a: 0.002 }, fixedDur: 0.9, gain: 0.12, send: 0.45 },
};

/**
 * Plays one note. `out` is the dry destination, `send` (optional) the reverb
 * input, `delayIn` (optional) a delay-effect input. Returns end time.
 */
export function playNote(ctx, out, t, midi, dur, vel, presetName, send = null, delayIn = null) {
  const P = PRESETS[presetName];
  if (!P) return t;
  const f = midiToFreq(midi);
  const peak = P.gain * vel;
  const amp = ctx.createGain();
  amp.connect(out);
  if (send && P.send) {
    const sg = ctx.createGain();
    sg.gain.value = P.send;
    amp.connect(sg);
    sg.connect(send);
  }
  if (delayIn && P.delay) {
    const dg = ctx.createGain();
    dg.gain.value = P.delay;
    amp.connect(dg);
    dg.connect(delayIn);
  }

  if (P.fm) {
    const len = P.fixedDur ?? dur + (P.release ?? 0.3);
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const mg = ctx.createGain();
    car.frequency.value = f;
    mod.frequency.value = f * P.fm.ratio;
    mg.gain.setValueAtTime(f * P.fm.index, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(1, f * P.fm.index * 0.08), t + Math.max(0.02, P.fm.decayIndex));
    mod.connect(mg);
    mg.connect(car.frequency);
    car.connect(amp);
    amp.gain.setValueAtTime(EPS, t);
    amp.gain.linearRampToValueAtTime(peak, t + (P.fm.a ?? 0.002));
    if (P.fixedDur) {
      amp.gain.exponentialRampToValueAtTime(EPS, t + len);
    } else {
      amp.gain.setTargetAtTime(peak * 0.35, t + 0.01, 0.35);
      amp.gain.setTargetAtTime(EPS, t + dur, (P.release ?? 0.3) / 4);
    }
    const end = t + len + 0.1;
    car.start(t);
    mod.start(t);
    car.stop(end);
    mod.stop(end);
    return end;
  }

  // subtractive
  let flt = null;
  let dest = amp;
  if (P.filter) {
    flt = ctx.createBiquadFilter();
    flt.type = P.filter.type || 'lowpass';
    const key = P.filter.key ?? 0;
    const base = Math.min(16000, P.filter.f * Math.pow(f / 261.6, key));
    flt.Q.value = P.filter.q ?? 1;
    if (P.filter.env) {
      const peakF = Math.min(16000, base + P.filter.env * vel);
      if (P.filter.swell) {
        flt.frequency.setValueAtTime(base, t);
        flt.frequency.linearRampToValueAtTime(peakF, t + P.filter.swell);
        flt.frequency.setTargetAtTime(base * 1.6, t + P.filter.swell, P.filter.decay);
      } else {
        flt.frequency.setValueAtTime(peakF, t);
        flt.frequency.setTargetAtTime(base, t, P.filter.decay / 3);
      }
    } else {
      flt.frequency.value = base;
    }
    flt.connect(amp);
    dest = flt;
  }
  const end = adsr(amp.gain, t, peak, P.amp, dur);
  let lfoGain = null;
  if (P.vib) {
    const lfo = ctx.createOscillator();
    lfo.frequency.value = P.vib.rate;
    lfoGain = ctx.createGain();
    lfoGain.gain.setValueAtTime(0, t);
    lfoGain.gain.linearRampToValueAtTime(P.vib.depth, t + (P.vib.delay || 0) + 0.15);
    lfo.connect(lfoGain);
    lfo.start(t);
    lfo.stop(end);
  }
  for (const o of P.osc) {
    const osc = ctx.createOscillator();
    osc.type = o.type;
    const of = f * Math.pow(2, o.oct || 0);
    if (P.pitchEnv) {
      osc.frequency.setValueAtTime(of * Math.pow(2, P.pitchEnv.amt / 12), t);
      osc.frequency.setTargetAtTime(of, t, P.pitchEnv.decay);
    } else {
      osc.frequency.value = of;
    }
    if (o.detune) osc.detune.value = o.detune;
    if (lfoGain) lfoGain.connect(osc.detune);
    const og = ctx.createGain();
    og.gain.value = o.gain;
    osc.connect(og);
    og.connect(dest);
    osc.start(t);
    osc.stop(end);
  }
  if (P.noise) {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx, 'white');
    n.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = P.noise.f;
    nf.Q.value = P.noise.q;
    const ng = ctx.createGain();
    ng.gain.value = P.noise.gain;
    n.connect(nf);
    nf.connect(ng);
    ng.connect(dest);
    n.start(t, Math.random());
    n.stop(end);
  }
  return end;
}
