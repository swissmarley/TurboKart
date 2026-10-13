import { SONGS, STINGS } from './songs.js';
import { DRUMS, playNote } from './instruments.js';
import { noteToMidi, parseChord, voiceChord, chordLadder, pcAbove } from './theory.js';
import { noiseBuffer } from './synth.js';

/**
 * Step sequencer scheduled on AudioContext time (lookahead scheduling: the
 * caller pumps `schedule(until)` from a timer; notes are placed precisely on
 * the audio clock, never on JS timer timing).
 */

const DRUM_LINES = {
  k: 'kick', s: 'snare', c: 'clap', h: 'hat', o: 'openHat', r: 'ride', x: 'crash', p: 'shaker',
  j: 'jingle', m: 'rim', b: 'cowbell', i: 'timpani', n: 'snap',
};
const VEL = { x: 0.8, X: 1.0, g: 0.35 };
const BASS_OFF = (ch, c) => {
  switch (ch) {
    case 'R': return 0;
    case '3': return c.third;
    case '5': return c.fifth;
    case '7': return c.seventh;
    case 'O': return 12;
    case 'L': return c.fifth - 12;
    case '2': return 2;
    case 'b': return 1;
    case '4': return 5;
    case '6': return 9;
    case 'x': return 0;
    default: return null;
  }
};

export const compileWarnings = [];

function barSlice(pattern, bar) {
  if (!pattern) return '';
  const bars = Math.max(1, Math.floor(pattern.length / 16));
  const b = bar % bars;
  return pattern.slice(b * 16, b * 16 + 16);
}

function parseMelodyBar(str, songId, secName, bar) {
  const out = [];
  if (!str) return out;
  let pos = 0;
  for (const tok of str.trim().split(/\s+/)) {
    const [n, d] = tok.split(':');
    const steps = Number(d);
    if (!Number.isFinite(steps) || steps <= 0) {
      compileWarnings.push(`${songId}.${secName} bar ${bar + 1}: bad token "${tok}"`);
      continue;
    }
    const midi = n === '-' ? null : noteToMidi(n);
    if (midi !== null) out.push({ step: pos, midi, dur: steps });
    pos += steps;
  }
  if (pos !== 16) compileWarnings.push(`${songId}.${secName} bar ${bar + 1}: melody sums to ${pos} steps (expected 16)`);
  return out;
}

/** Turns the song description into per-step event lists. */
export function compileSong(id, song) {
  const sections = {};
  for (const [name, sec] of Object.entries(song.sections)) {
    const steps = sec.bars * 16;
    const events = Array.from({ length: steps }, () => []);
    const chordAt = new Array(steps);
    // chords
    for (let bar = 0; bar < sec.bars; bar++) {
      const sym = sec.chords[bar % sec.chords.length];
      const parts = sym.split('|').map((x) => parseChord(x));
      const len = 16 / parts.length;
      for (let s = 0; s < 16; s++) chordAt[bar * 16 + s] = parts[Math.floor(s / len)];
    }
    // drums
    for (let bar = 0; bar < sec.bars; bar++) {
      let patName = sec.drumsByBar ? sec.drumsByBar[bar] : sec.drums;
      if (sec.fill && bar === sec.bars - 1) patName = sec.fill;
      const pat = song.drums[patName];
      if (!pat) continue;
      for (const [line, str] of Object.entries(pat)) {
        const s16 = barSlice(str, bar);
        for (let s = 0; s < s16.length; s++) {
          const ch = s16[s];
          if (ch === '.' || ch === ' ') continue;
          const step = bar * 16 + s;
          if (line === 't') {
            const f = ch === 'h' ? 230 : ch === 'm' ? 165 : 115;
            events[step].push({ k: 'drum', name: 'tom', vel: 0.8, p: { f } });
          } else if (line === 'd') {
            const name = ch === 'D' ? 'dum' : ch === 'T' ? 'tek' : 'ka';
            events[step].push({ k: 'drum', name, vel: 0.85 });
          } else if (DRUM_LINES[line]) {
            events[step].push({ k: 'drum', name: DRUM_LINES[line], vel: VEL[ch] ?? 0.8 });
          }
        }
      }
    }
    if (sec.crash) events[0].push({ k: 'drum', name: 'crash', vel: 0.9 });
    if (sec.riser && sec.bars >= 2) events[(sec.bars - 2) * 16].push({ k: 'riser', steps: 32 });
    // bass
    if (sec.bass && song.inst.bass) {
      for (let bar = 0; bar < sec.bars; bar++) {
        const p = barSlice(sec.bass, bar);
        for (let s = 0; s < p.length; s++) {
          const ch = p[s];
          const c = chordAt[bar * 16 + s];
          const off = BASS_OFF(ch, c);
          if (off === null) continue;
          let dur = 1;
          while (s + dur < p.length && p[s + dur] === '.') dur++;
          const root = pcAbove(c.bass, song.low?.bass ?? 33);
          const dead = ch === 'x';
          events[bar * 16 + s].push({ k: 'note', part: 'bass', midi: root + off, dur: dead ? 0.5 : dur * 0.92, vel: dead ? 0.45 : s % 4 === 0 ? 1 : 0.85 });
        }
      }
    }
    // arp
    if (sec.arp && song.inst.arp) {
      for (let bar = 0; bar < sec.bars; bar++) {
        const p = barSlice(sec.arp, bar);
        for (let s = 0; s < p.length; s++) {
          const ch = p[s];
          if (ch < '0' || ch > '9') continue;
          let dur = 1;
          while (s + dur < p.length && p[s + dur] === '.') dur++;
          const c = chordAt[bar * 16 + s];
          const ladder = chordLadder(c, song.low?.arp ?? 60, 10);
          events[bar * 16 + s].push({ k: 'note', part: 'arp', midi: ladder[Number(ch)], dur: Math.max(0.8, dur * 0.8), vel: s % 4 === 0 ? 0.95 : 0.75 });
        }
      }
    }
    // comp (chord stabs)
    if (sec.comp && song.inst.comp) {
      for (let bar = 0; bar < sec.bars; bar++) {
        const p = barSlice(sec.comp, bar);
        for (let s = 0; s < p.length; s++) {
          if (p[s] !== 'x') continue;
          let dur = 1;
          while (s + dur < p.length && p[s + dur] === '.') dur++;
          const c = chordAt[bar * 16 + s];
          const notes = voiceChord(c, song.low?.comp ?? 58, 4);
          events[bar * 16 + s].push({ k: 'chord', part: 'comp', midis: notes, dur: Math.min(dur, 3) * 0.9, vel: 0.8 });
        }
      }
    }
    // pad
    if (sec.pad && song.inst.pad) {
      let s = 0;
      while (s < steps) {
        const c = chordAt[s];
        let e = s + 1;
        while (e < steps && chordAt[e] === c) e++;
        events[s].push({ k: 'chord', part: 'pad', midis: voiceChord(c, song.low?.pad ?? 55, 4), dur: e - s, vel: 0.9 });
        s = e;
      }
    }
    // melodies
    for (const part of ['lead', 'counter']) {
      const bars = sec[part];
      if (!bars || !song.inst[part]) continue;
      for (let bar = 0; bar < sec.bars; bar++) {
        for (const n of parseMelodyBar(bars[bar], id, name, bar)) {
          events[bar * 16 + n.step].push({ k: 'note', part, midi: n.midi, dur: n.dur * 0.94, vel: 0.9 });
        }
      }
    }
    sections[name] = { name, steps, events };
  }
  return { id, song, sections, arrangement: song.arrangement, loopFrom: song.loopFrom ?? 0 };
}

const compiled = {};
export function getCompiled(id) {
  if (!SONGS[id]) return null;
  if (!compiled[id]) compiled[id] = compileSong(id, SONGS[id]);
  return compiled[id];
}

// ---------------------------------------------------------------------------
// SongPlayer: one playing instance of a song
// ---------------------------------------------------------------------------
export class SongPlayer {
  constructor(ctx, dest, id, { reverb = null, startTime = ctx.currentTime + 0.05, tempoMul = 1, transpose = 0,
    skipIntro = false, fadeIn = 0, level = 1 } = {}) {
    this.ctx = ctx;
    this.id = id;
    this.c = getCompiled(id);
    this.song = this.c.song;
    this.tempoMul = tempoMul;
    this.transpose = transpose;
    this.stepDur = 60 / (this.song.bpm * tempoMul) / 4;
    this.swing = (this.song.swing || 0) * this.stepDur;
    this.secIdx = skipIntro ? this.c.loopFrom : 0;
    this.step = 0;
    this.gridTime = startTime;
    this.stopped = false;
    this.stopAt = Infinity;

    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(fadeIn > 0 ? 0.0001 : level, startTime);
    if (fadeIn > 0) this.out.gain.linearRampToValueAtTime(level, startTime + fadeIn);
    this.out.connect(dest);
    this.reverb = reverb;

    const mix = this.song.mix || {};
    const mk = (v) => {
      const g = ctx.createGain();
      g.gain.value = v;
      g.connect(this.out);
      return g;
    };
    this.parts = {
      drums: mk(0.9 * (mix.drums ?? 1)),
      bass: mk(1.0 * (mix.bass ?? 1)),
      lead: mk(1.0 * (mix.lead ?? 1)),
      counter: mk(0.8 * (mix.counter ?? 1)),
      arp: mk(0.8 * (mix.arp ?? 1)),
      comp: mk(0.9 * (mix.comp ?? 1)),
      pad: mk(1.0 * (mix.pad ?? 1)),
    };
    // pad sidechain pump stage
    this.pump = ctx.createGain();
    this.pump.connect(this.parts.pad);
    // reverb send (shared reverb input if provided)
    this.send = ctx.createGain();
    this.send.gain.value = 1;
    if (reverb) this.send.connect(reverb);
    // drum room send
    this.drumSend = ctx.createGain();
    this.drumSend.gain.value = 0.12;
    this.parts.drums.connect(this.drumSend);
    if (reverb) this.drumSend.connect(reverb);
    // tempo-synced feedback delay
    const beat = this.stepDur * 4;
    this.delayIn = ctx.createGain();
    const dl = ctx.createDelay(2);
    dl.delayTime.value = Math.min(1.9, beat * (this.song.delayTime ?? 0.75));
    const fb = ctx.createGain();
    fb.gain.value = 0.38;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2600;
    this.delayIn.connect(dl);
    dl.connect(lp);
    lp.connect(fb);
    fb.connect(dl);
    const dw = ctx.createGain();
    dw.gain.value = 0.6;
    lp.connect(dw);
    dw.connect(this.out);
    this._nodes = [dl, fb, lp, dw];
  }

  get section() {
    return this.c.sections[this.c.arrangement[this.secIdx]];
  }

  /** Schedules every step whose time is < `until`. */
  schedule(until) {
    while (!this.stopped && this.gridTime < until) {
      if (this.gridTime >= this.stopAt) {
        this.stopped = true;
        break;
      }
      const sec = this.section;
      const t = this.gridTime + (this.step % 2 === 1 ? this.swing : 0);
      this._playStep(sec, this.step, t);
      this.gridTime += this.stepDur;
      this.step++;
      if (this.step >= sec.steps) {
        this.step = 0;
        this.secIdx++;
        if (this.secIdx >= this.c.arrangement.length) this.secIdx = this.c.loopFrom;
      }
    }
  }

  _playStep(sec, step, t) {
    const ctx = this.ctx;
    const inst = this.song.inst;
    const tr = this.transpose;
    if (this.song.pump && step % 4 === 0) {
      const g = this.pump.gain;
      const beat = this.stepDur * 4;
      g.setValueAtTime(1, t);
      g.linearRampToValueAtTime(1 - this.song.pump, t + 0.012);
      g.linearRampToValueAtTime(1, t + beat * 0.85);
    }
    for (const ev of sec.events[step]) {
      if (ev.k === 'drum') {
        const fn = DRUMS[ev.name];
        if (fn) fn(ctx, this.parts.drums, t, ev.vel, ev.p);
      } else if (ev.k === 'note') {
        const dest = this.parts[ev.part];
        playNote(ctx, dest, t, ev.midi + tr, ev.dur * this.stepDur, ev.vel, inst[ev.part], this.send, this.delayIn);
      } else if (ev.k === 'chord') {
        const dest = ev.part === 'pad' ? this.pump : this.parts[ev.part];
        const v = ev.vel / Math.sqrt(ev.midis.length) * 1.4;
        for (const m of ev.midis) playNote(ctx, dest, t, m + tr, ev.dur * this.stepDur, v, inst[ev.part], this.send, null);
      } else if (ev.k === 'riser') {
        this._riser(t, ev.steps * this.stepDur);
      }
    }
  }

  _riser(t, dur) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(ctx, 'white');
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.95);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02);
    src.connect(f);
    f.connect(g);
    g.connect(this.parts.drums);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  /** Fades out and stops scheduling. */
  stop(at = this.ctx.currentTime, fade = 0.5) {
    if (this.stopped) return;
    const g = this.out.gain;
    g.cancelScheduledValues(at);
    g.setValueAtTime(g.value, at);
    g.linearRampToValueAtTime(0.0001, at + Math.max(0.02, fade));
    this.stopAt = at + fade;
    const ms = (at + fade - this.ctx.currentTime + 2.5) * 1000;
    if (typeof AudioContext !== 'undefined' && this.ctx instanceof AudioContext) {
      setTimeout(() => this.disconnect(), Math.max(0, ms));
    }
  }

  disconnect() {
    try {
      this.out.disconnect();
      this.send.disconnect();
      this.drumSend.disconnect();
      for (const n of this._nodes) n.disconnect();
    } catch {
      // already disconnected
    }
  }
}

// ---------------------------------------------------------------------------
// Stings (final lap, finish fanfares)
// ---------------------------------------------------------------------------
export function playSting(ctx, dest, name, t, reverb = null, transpose = 0) {
  const s = STINGS[name];
  if (!s) return 0;
  const step = 60 / s.bpm / 4;
  const out = ctx.createGain();
  out.gain.value = 0.8;
  out.connect(dest);
  const drums = ctx.createGain();
  drums.gain.value = 0.85;
  drums.connect(out);
  for (const [st, name2, vel] of s.drums) DRUMS[name2]?.(ctx, drums, t + st * step, vel);
  for (const [st, note, steps, preset, vel] of s.notes) {
    playNote(ctx, out, t + st * step, noteToMidi(note) + transpose, steps * step * 0.95, vel, preset, reverb, null);
  }
  return s.length * step + 0.6;
}

// ---------------------------------------------------------------------------
// MusicPlayer: crossfades, final-lap tempo, star overlay
// ---------------------------------------------------------------------------
export class MusicPlayer {
  constructor(ctx, out, reverbInput = null) {
    this.ctx = ctx;
    this.reverb = reverbInput;
    this.main = ctx.createGain();
    this.main.connect(out);
    this.overlayBus = ctx.createGain();
    this.overlayBus.gain.value = 0.8;
    this.overlayBus.connect(out);
    this.current = null;
    this.overlay = null;
    this.fading = [];
    this.lookahead = 0.3;
  }

  get currentId() {
    return this.current && !this.current.stopped && this.current.stopAt === Infinity ? this.current.id : null;
  }

  play(id, { fade = 1, at = null, tempoMul = 1, transpose = 0, skipIntro = false, fadeIn = null } = {}) {
    if (!SONGS[id]) return;
    const now = this.ctx.currentTime;
    const start = Math.max(now + 0.06, at ?? 0);
    const cur = this.current;
    if (cur && cur.id === id && cur.stopAt === Infinity && cur.tempoMul === tempoMul && cur.transpose === transpose) return;
    if (cur) {
      cur.stop(now, Math.max(0.05, fade));
      this.fading.push(cur);
    }
    this.current = new SongPlayer(this.ctx, this.main, id, {
      reverb: this.reverb,
      startTime: cur && fade > 0.3 && at === null ? start + Math.min(fade * 0.35, 0.4) : start,
      tempoMul,
      transpose,
      skipIntro,
      fadeIn: fadeIn ?? (cur ? Math.min(0.6, fade * 0.5) : 0.02),
    });
    this.pump();
  }

  stop(fade = 1) {
    if (this.current) {
      this.current.stop(this.ctx.currentTime, Math.max(0.02, fade));
      this.fading.push(this.current);
      this.current = null;
    }
  }

  startOverlay(id = 'star') {
    if (this.overlay && this.overlay.stopAt === Infinity) return;
    const now = this.ctx.currentTime;
    this.overlay = new SongPlayer(this.ctx, this.overlayBus, id, { reverb: this.reverb, startTime: now + 0.05, fadeIn: 0.08 });
    const g = this.main.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(0.1, now + 0.25);
    this.pump();
  }

  stopOverlay(fade = 0.5) {
    if (!this.overlay) return;
    const now = this.ctx.currentTime;
    this.overlay.stop(now, fade);
    this.fading.push(this.overlay);
    this.overlay = null;
    const g = this.main.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(1, now + fade + 0.4);
  }

  get overlayActive() {
    return !!this.overlay;
  }

  /** Schedules all players up to now + lookahead. Call often (timer + frame). */
  pump() {
    const until = this.ctx.currentTime + this.lookahead;
    if (this.current) this.current.schedule(until);
    if (this.overlay) this.overlay.schedule(until);
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const p = this.fading[i];
      p.schedule(until);
      if (p.stopped || this.ctx.currentTime > p.stopAt) this.fading.splice(i, 1);
    }
  }

  dispose() {
    this.current?.disconnect();
    this.overlay?.disconnect();
    for (const p of this.fading) p.disconnect();
    this.main.disconnect();
    this.overlayBus.disconnect();
  }
}
