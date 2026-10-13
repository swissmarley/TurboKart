/**
 * Low-level Web Audio building blocks. Every function takes any
 * BaseAudioContext (realtime or OfflineAudioContext) so sounds can be
 * rendered offline for automated checks.
 */

const caches = new WeakMap();

function cacheFor(ctx) {
  let c = caches.get(ctx);
  if (!c) {
    c = {};
    caches.set(ctx, c);
  }
  return c;
}

/** Looping noise buffers: 'white' | 'pink' | 'brown' (2 s, cached per context). */
export function noiseBuffer(ctx, color = 'white') {
  const c = cacheFor(ctx);
  const key = `noise_${color}`;
  if (c[key]) return c[key];
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = 22222;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed / 2147483647) * 2 - 1;
  };
  if (color === 'white') {
    for (let i = 0; i < len; i++) d[i] = rnd();
  } else if (color === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = rnd();
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
  } else {
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * rnd()) / 1.02;
      d[i] = last * 3.5;
    }
  }
  c[key] = buf;
  return buf;
}

/** Soft-clip curve for WaveShaper (cached). */
export function softClipCurve(ctx, amount = 2) {
  const c = cacheFor(ctx);
  const key = `clip_${amount}`;
  if (c[key]) return c[key];
  const n = 1024;
  const curve = new Float32Array(n);
  const k = amount;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  c[key] = curve;
  return curve;
}

/** Stereo reverb impulse response (cached per context). */
export function reverbIR(ctx, seconds = 2.2, decay = 2.8) {
  const c = cacheFor(ctx);
  const key = `ir_${seconds}_${decay}`;
  if (c[key]) return c[key];
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  let seed = 9871;
  const rnd = () => {
    seed = (seed * 48271) % 2147483647;
    return (seed / 2147483647) * 2 - 1;
  };
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // early reflections + exponential tail, darker as it decays
      const env = Math.pow(1 - t, decay) * (i < ctx.sampleRate * 0.012 ? i / (ctx.sampleRate * 0.012) : 1);
      const k = 0.35 + 0.6 * t;
      lp = lp * k + rnd() * (1 - k);
      d[i] = lp * env * 1.6;
    }
  }
  c[key] = buf;
  return buf;
}

/** Creates a reverb send network: input → convolver → output gain. */
export function createReverb(ctx, out, { seconds = 2.2, decay = 2.8, wet = 0.35 } = {}) {
  const input = ctx.createGain();
  const conv = ctx.createConvolver();
  conv.buffer = reverbIR(ctx, seconds, decay);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 180;
  const wetGain = ctx.createGain();
  wetGain.gain.value = wet;
  input.connect(hp);
  hp.connect(conv);
  conv.connect(wetGain);
  wetGain.connect(out);
  return { input, output: wetGain, convolver: conv };
}

/** Exponential-safe ramp target. */
const EPS = 0.0001;

/**
 * Applies an AD(S)R envelope to an AudioParam.
 * a: attack, d: decay, s: sustain level (fraction of peak), dur: note length (before release), r: release.
 * Returns the time the envelope reaches silence.
 */
export function adsr(param, t, peak, { a = 0.005, d = 0.1, s = 0.6, r = 0.1 } = {}, dur = 0.2) {
  const sus = Math.max(EPS, peak * s);
  param.cancelScheduledValues(t);
  param.setValueAtTime(EPS, t);
  param.linearRampToValueAtTime(peak, t + a);
  if (dur > a) {
    param.setTargetAtTime(sus, t + a, Math.max(0.001, d / 3));
  }
  const relStart = t + Math.max(dur, a + 0.001);
  param.setTargetAtTime(EPS, relStart, Math.max(0.002, r / 4));
  return relStart + r * 1.5 + 0.02;
}

/**
 * Generic one-voice SFX/instrument helper.
 * spec: { type: osc type | 'noise' | 'pink' | 'brown', f, f2, glide ('exp'|'lin'), sweep (s),
 *         dur, a, peak, hold, curve ('exp'|'lin'), detune, filter: {type,f,f2,q,sweep},
 *         vib: {rate, depth (cents)}, delay }
 * Returns end time.
 */
export function voice(ctx, out, t, spec) {
  const {
    type = 'sine', f = 440, f2 = null, glide = 'exp', sweep = null, dur = 0.2, a = 0.004,
    peak = 0.3, hold = 0, curve = 'exp', detune = 0, filter = null, vib = null, delay = 0, pan = 0,
  } = spec;
  t += delay;
  let src;
  const isNoise = type === 'noise' || type === 'pink' || type === 'brown';
  if (isNoise) {
    src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, type === 'noise' ? 'white' : type);
    src.loop = true;
  } else {
    src = ctx.createOscillator();
    src.type = type;
    src.frequency.setValueAtTime(Math.max(1, f), t);
    if (f2 !== null) {
      const sw = sweep ?? dur;
      if (glide === 'exp') src.frequency.exponentialRampToValueAtTime(Math.max(1, f2), t + sw);
      else src.frequency.linearRampToValueAtTime(Math.max(1, f2), t + sw);
    }
    if (detune) src.detune.value = detune;
    if (vib) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = vib.rate || 6;
      const lg = ctx.createGain();
      lg.gain.value = vib.depth || 30;
      lfo.connect(lg);
      lg.connect(src.detune);
      lfo.start(t);
      lfo.stop(t + dur + 0.05);
    }
  }
  let node = src;
  if (filter) {
    const bq = ctx.createBiquadFilter();
    bq.type = filter.type || 'lowpass';
    bq.frequency.setValueAtTime(filter.f || 1000, t);
    if (filter.f2) bq.frequency.exponentialRampToValueAtTime(filter.f2, t + (filter.sweep ?? dur));
    bq.Q.value = filter.q ?? 1;
    node.connect(bq);
    node = bq;
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  if (hold > 0) g.gain.setValueAtTime(peak, t + a + hold);
  const end = t + Math.max(dur, a + hold + 0.01);
  if (curve === 'exp') g.gain.exponentialRampToValueAtTime(EPS, end);
  else g.gain.linearRampToValueAtTime(0, end);
  node.connect(g);
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    p.connect(out);
  } else {
    g.connect(out);
  }
  // random start offset so repeated noise bursts never sound identical
  if (isNoise) src.start(t, Math.random() * 1.7);
  else src.start(t);
  src.stop(end + 0.02);
  return end;
}

/** FM bell / tine: carrier + modulator with decaying index. Returns end time. */
export function fmBell(ctx, out, t, f, { dur = 1.2, peak = 0.2, ratio = 3.5, index = 3, a = 0.002, decayIndex = 0.3, pan = 0 } = {}) {
  const car = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const mg = ctx.createGain();
  car.frequency.value = f;
  mod.frequency.value = f * ratio;
  mg.gain.setValueAtTime(f * index, t);
  mg.gain.exponentialRampToValueAtTime(Math.max(1, f * index * 0.05), t + Math.max(0.02, decayIndex));
  mod.connect(mg);
  mg.connect(car.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(EPS, t + dur);
  car.connect(g);
  if (pan && ctx.createStereoPanner) {
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    p.connect(out);
  } else {
    g.connect(out);
  }
  car.start(t);
  mod.start(t);
  car.stop(t + dur + 0.05);
  mod.stop(t + dur + 0.05);
  return t + dur;
}

/** Gain node helper connected to `out`. */
export function gainTo(ctx, out, value = 1) {
  const g = ctx.createGain();
  g.gain.value = value;
  g.connect(out);
  return g;
}

/** Soft distortion stage connected to `out`; returns its input. */
export function shaperTo(ctx, out, amount = 2) {
  const s = ctx.createWaveShaper();
  s.curve = softClipCurve(ctx, amount);
  s.oversample = '2x';
  s.connect(out);
  return s;
}
