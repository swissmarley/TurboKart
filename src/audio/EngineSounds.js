import { noiseBuffer, softClipCurve } from './synth.js';

/**
 * Continuous vehicle sounds: the player's layered engine (simulated gears,
 * throttle load, countdown revving, boost whine), tyre skid, off-road rumble,
 * wind, and a small pool of spatialized AI engines.
 */

const GEARS = [0.24, 0.45, 0.68, 0.9, 10];

function loopNoise(ctx, color = 'white') {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuffer(ctx, color);
  s.loop = true;
  return s;
}

function smooth(param, value, t, tc = 0.04) {
  param.setTargetAtTime(value, t, tc);
}

export class PlayerEngine {
  /** @param {BaseAudioContext} ctx  @param {AudioNode} out */
  constructor(ctx, out) {
    this.ctx = ctx;
    const t = ctx.currentTime;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(out);

    // --- engine body: 2 detuned saws + square sub through a soft clipper and lowpass
    this.body = ctx.createGain();
    this.body.gain.value = 0.0;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 800;
    this.lp.Q.value = 1.4;
    this.shaper = ctx.createWaveShaper();
    this.shaper.curve = softClipCurve(ctx, 2.2);
    this.mix = ctx.createGain();
    this.mix.gain.value = 0.5;
    this.mix.connect(this.shaper);
    this.shaper.connect(this.lp);
    this.lp.connect(this.body);
    this.body.connect(this.out);

    this.oscA = ctx.createOscillator();
    this.oscA.type = 'sawtooth';
    this.oscB = ctx.createOscillator();
    this.oscB.type = 'sawtooth';
    this.oscB.detune.value = 9;
    this.oscC = ctx.createOscillator();
    this.oscC.type = 'square';
    const gA = ctx.createGain();
    gA.gain.value = 0.5;
    const gB = ctx.createGain();
    gB.gain.value = 0.4;
    const gC = ctx.createGain();
    gC.gain.value = 0.35;
    this.oscA.connect(gA);
    this.oscB.connect(gB);
    this.oscC.connect(gC);
    gA.connect(this.mix);
    gB.connect(this.mix);
    gC.connect(this.mix);

    // combustion "putter": amplitude modulation at the firing rate
    this.am = ctx.createGain();
    this.am.gain.value = 1;
    this.mix.disconnect();
    this.mix.connect(this.am);
    this.am.connect(this.shaper);
    this.amLfo = ctx.createOscillator();
    this.amLfo.type = 'triangle';
    this.amDepth = ctx.createGain();
    this.amDepth.gain.value = 0.35;
    this.amLfo.connect(this.amDepth);
    this.amDepth.connect(this.am.gain);

    // filtered noise layer (intake / mechanical)
    this.noise = loopNoise(ctx, 'white');
    this.noiseBp = ctx.createBiquadFilter();
    this.noiseBp.type = 'bandpass';
    this.noiseBp.Q.value = 1.1;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0.0;
    this.noise.connect(this.noiseBp);
    this.noiseBp.connect(this.noiseGain);
    this.noiseGain.connect(this.lp);

    // turbo whine while boosting
    this.whine = ctx.createOscillator();
    this.whine.type = 'triangle';
    this.whineGain = ctx.createGain();
    this.whineGain.gain.value = 0;
    this.whine.connect(this.whineGain);
    this.whineGain.connect(this.out);

    // --- tyre skid (drift): band-passed noise + squeal + spark crackle
    this.skidOut = ctx.createGain();
    this.skidOut.gain.value = 0;
    this.skidOut.connect(out);
    this.skidNoise = loopNoise(ctx, 'white');
    this.skidBp = ctx.createBiquadFilter();
    this.skidBp.type = 'bandpass';
    this.skidBp.frequency.value = 1500;
    this.skidBp.Q.value = 5;
    const skidNG = ctx.createGain();
    skidNG.gain.value = 0.9;
    this.skidNoise.connect(this.skidBp);
    this.skidBp.connect(skidNG);
    skidNG.connect(this.skidOut);
    this.squeal = ctx.createOscillator();
    this.squeal.type = 'sine';
    this.squeal.frequency.value = 950;
    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0.18;
    const sqLfo = ctx.createOscillator();
    sqLfo.frequency.value = 9;
    const sqLfoG = ctx.createGain();
    sqLfoG.gain.value = 22;
    sqLfo.connect(sqLfoG);
    sqLfoG.connect(this.squeal.detune);
    this.squeal.connect(this.squealGain);
    this.squealGain.connect(this.skidOut);
    this.crackleNoise = loopNoise(ctx, 'white');
    const crHp = ctx.createBiquadFilter();
    crHp.type = 'highpass';
    crHp.frequency.value = 5000;
    this.crackleGain = ctx.createGain();
    this.crackleGain.gain.value = 0;
    const crAm = ctx.createGain();
    crAm.gain.value = 0.5;
    const crLfo = ctx.createOscillator();
    crLfo.type = 'square';
    crLfo.frequency.value = 31;
    const crLfoG = ctx.createGain();
    crLfoG.gain.value = 0.5;
    crLfo.connect(crLfoG);
    crLfoG.connect(crAm.gain);
    this.crackleNoise.connect(crHp);
    crHp.connect(crAm);
    crAm.connect(this.crackleGain);
    this.crackleGain.connect(this.skidOut);

    // --- off-road rumble
    this.rumble = loopNoise(ctx, 'brown');
    this.rumbleLp = ctx.createBiquadFilter();
    this.rumbleLp.type = 'lowpass';
    this.rumbleLp.frequency.value = 320;
    this.rumbleGain = ctx.createGain();
    this.rumbleGain.gain.value = 0;
    this.rumble.connect(this.rumbleLp);
    this.rumbleLp.connect(this.rumbleGain);
    this.rumbleGain.connect(out);
    this.grit = loopNoise(ctx, 'white');
    const gritBp = ctx.createBiquadFilter();
    gritBp.type = 'bandpass';
    gritBp.frequency.value = 1100;
    gritBp.Q.value = 0.8;
    this.gritGain = ctx.createGain();
    this.gritGain.gain.value = 0;
    this.grit.connect(gritBp);
    gritBp.connect(this.gritGain);
    this.gritGain.connect(out);

    // --- wind
    this.wind = loopNoise(ctx, 'pink');
    this.windBp = ctx.createBiquadFilter();
    this.windBp.type = 'bandpass';
    this.windBp.frequency.value = 650;
    this.windBp.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.wind.connect(this.windBp);
    this.windBp.connect(this.windGain);
    this.windGain.connect(out);

    for (const n of [this.oscA, this.oscB, this.oscC, this.amLfo, this.noise, this.whine, this.skidNoise, this.squeal, sqLfo,
      this.crackleNoise, crLfo, this.rumble, this.grit, this.wind]) n.start(t);
    this._sources = [this.oscA, this.oscB, this.oscC, this.amLfo, this.noise, this.whine, this.skidNoise, this.squeal, sqLfo,
      this.crackleNoise, crLfo, this.rumble, this.grit, this.wind];

    this.rpm = 0.12;
    this.gear = 0;
    this.active = false;
    this.revPhase = 0;
  }

  /**
   * @param {number} dt
   * @param {object|null} kart  player kart (contract fields) or null to silence
   * @param {boolean} active    engine audible (race states)
   */
  update(dt, kart, active) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (!kart || !active) {
      smooth(this.out.gain, 0, t, 0.08);
      smooth(this.skidOut.gain, 0, t, 0.05);
      smooth(this.rumbleGain.gain, 0, t, 0.05);
      smooth(this.gritGain.gain, 0, t, 0.05);
      smooth(this.windGain.gain, 0, t, 0.1);
      smooth(this.whineGain.gain, 0, t, 0.05);
      this.active = false;
      return;
    }
    this.active = true;
    const c = kart.controls || {};
    const throttle = Math.max(0, Math.min(1, c.throttle || 0));
    const maxS = kart.maxSpeed || 30;
    const speed = Math.abs(kart.speed || 0);
    const sf = Math.min(1.4, speed / Math.max(10, maxS));
    const boosting = !!kart.isBoosting;
    const airborne = !!kart.isAirborne;
    const spun = !!kart.isSpunOut;

    // --- simulated gearbox
    let target;
    if (kart.frozen) {
      // countdown: free revving with a soft limiter bounce
      this.revPhase += dt * 22;
      target = throttle > 0.1 ? 0.82 + 0.07 * Math.sin(this.revPhase) : 0.12;
      this.gear = 0;
    } else {
      while (this.gear < GEARS.length - 1 && sf > GEARS[this.gear] + 0.02) this.gear++;
      while (this.gear > 0 && sf < GEARS[this.gear - 1] - 0.04) this.gear--;
      const lo = this.gear === 0 ? 0 : GEARS[this.gear - 1];
      const hi = Math.min(1.35, GEARS[this.gear]);
      const g = Math.max(0, Math.min(1, (sf - lo) / Math.max(0.05, hi - lo)));
      target = (this.gear === 0 ? 0.14 : 0.42) + g * (this.gear === 0 ? 0.62 : 0.5);
      if (throttle > 0.1 && speed < 4) target = Math.max(target, 0.35 + throttle * 0.2); // launch slip
      if (airborne) target = Math.min(1, target + 0.15 * throttle);
      if (boosting) target = Math.min(1.05, target + 0.1);
      if (throttle < 0.05) target *= 0.85;
    }
    const rate = target > this.rpm ? 7 : 4;
    this.rpm += (target - this.rpm) * Math.min(1, dt * rate);
    const rpm = this.rpm;
    const f = 34 + rpm * 165;
    const load = kart.frozen ? throttle : throttle * (airborne ? 0.4 : 1);

    smooth(this.oscA.frequency, f, t, 0.025);
    smooth(this.oscB.frequency, f * 1.004, t, 0.025);
    smooth(this.oscC.frequency, f * 0.5, t, 0.025);
    smooth(this.amLfo.frequency, f * 0.5, t, 0.025);
    smooth(this.amDepth.gain, 0.45 - rpm * 0.3, t, 0.05);
    smooth(this.lp.frequency, 260 + rpm * 1500 + load * 1100 + (boosting ? 900 : 0), t, 0.04);
    smooth(this.noiseBp.frequency, f * 6, t, 0.04);
    smooth(this.noiseGain.gain, 0.04 + load * 0.12, t, 0.05);
    smooth(this.body.gain, 0.32 + load * 0.22 + rpm * 0.15, t, 0.05);
    smooth(this.whine.frequency, 900 + rpm * 1400, t, 0.05);
    smooth(this.whineGain.gain, boosting ? 0.035 : 0, t, 0.06);
    smooth(this.out.gain, spun ? 0.5 : 0.62, t, 0.08);

    // --- skid while drifting on the ground
    const drifting = kart.isDrifting && !airborne;
    const lvl = kart.driftLevel || 0;
    smooth(this.skidOut.gain, drifting ? 0.11 + lvl * 0.02 : 0, t, drifting ? 0.03 : 0.06);
    smooth(this.skidBp.frequency, 1300 + lvl * 260, t, 0.08);
    smooth(this.squeal.frequency, 880 + lvl * 190, t, 0.08);
    smooth(this.crackleGain.gain, drifting && lvl > 0 ? 0.25 + lvl * 0.1 : 0, t, 0.05);

    // --- off-road rumble
    const off = kart.surface === 'offroad' && !airborne;
    const sp = Math.min(1, speed / 25);
    smooth(this.rumbleGain.gain, off ? 0.25 * sp + 0.05 : 0, t, 0.06);
    smooth(this.gritGain.gain, off ? 0.07 * sp : 0, t, 0.06);

    // --- wind
    const w = Math.min(1.3, speed / 30);
    smooth(this.windGain.gain, 0.02 + 0.09 * w * w + (boosting ? 0.04 : 0), t, 0.15);
    smooth(this.windBp.frequency, 450 + 700 * w, t, 0.2);
  }

  silence() {
    this.update(0, null, false);
  }

  dispose() {
    const t = this.ctx.currentTime;
    for (const s of this._sources) {
      try {
        s.stop(t + 0.05);
      } catch {
        // already stopped
      }
    }
    this.out.disconnect();
    this.skidOut.disconnect();
    this.rumbleGain.disconnect();
    this.gritGain.disconnect();
    this.windGain.disconnect();
  }
}

/** A single spatialized AI engine voice. */
class AIVoice {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.kart = null;
    this.panner = ctx.createPanner();
    this.panner.panningModel = 'equalpower';
    this.panner.distanceModel = 'inverse';
    this.panner.refDistance = 6;
    this.panner.rolloffFactor = 1.3;
    this.panner.maxDistance = 200;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 900;
    this.a = ctx.createOscillator();
    this.a.type = 'sawtooth';
    this.b = ctx.createOscillator();
    this.b.type = 'square';
    const gb = ctx.createGain();
    gb.gain.value = 0.4;
    this.a.connect(this.lp);
    this.b.connect(gb);
    gb.connect(this.lp);
    this.lp.connect(this.gain);
    this.gain.connect(this.panner);
    this.panner.connect(out);
    this.a.start();
    this.b.start();
    this.prevDist = null;
    this.rpm = 0.2;
    this.assigned = null;
  }

  update(dt, kart, camPos, camVel) {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    if (!kart) {
      smooth(this.gain.gain, 0, t, 0.08);
      this.kart = null;
      this.prevDist = null;
      return;
    }
    if (this.kart !== kart) {
      this.kart = kart;
      this.prevDist = null;
    }
    const p = kart.position;
    const pn = this.panner;
    if (pn.positionX) {
      smooth(pn.positionX, p.x, t, 0.03);
      smooth(pn.positionY, p.y + 0.5, t, 0.03);
      smooth(pn.positionZ, p.z, t, 0.03);
    } else {
      pn.setPosition(p.x, p.y + 0.5, p.z);
    }
    const dx = p.x - camPos.x, dy = p.y - camPos.y, dz = p.z - camPos.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    // doppler from the change in distance (exaggerated a little for fun)
    let doppler = 1;
    if (this.prevDist !== null && dt > 0) {
      const vr = (dist - this.prevDist) / dt; // + = receding
      doppler = Math.max(0.8, Math.min(1.25, 343 / (343 + vr * 1.6)));
    }
    this.prevDist = dist;
    const speed = Math.abs(kart.speed || 0);
    const sf = Math.min(1.3, speed / Math.max(10, kart.maxSpeed || 30));
    const target = 0.15 + sf * 0.75 + (kart.isBoosting ? 0.08 : 0);
    this.rpm += (target - this.rpm) * Math.min(1, dt * 5);
    const f = (36 + this.rpm * 150) * doppler;
    smooth(this.a.frequency, f, t, 0.04);
    smooth(this.b.frequency, f * 0.5, t, 0.04);
    smooth(this.lp.frequency, 380 + this.rpm * 1300, t, 0.05);
    smooth(this.gain.gain, kart.frozen ? 0.05 : 0.11 + 0.05 * (kart.controls?.throttle || 0), t, 0.08);
  }

  dispose() {
    try {
      this.a.stop();
      this.b.stop();
    } catch {
      // ignore
    }
    this.panner.disconnect();
  }
}

export class AIEngines {
  constructor(ctx, out, count = 4) {
    this.ctx = ctx;
    this.voices = [];
    for (let i = 0; i < count; i++) this.voices.push(new AIVoice(ctx, out));
    this._cands = [];
  }

  update(dt, karts, playerKart, camPos, active) {
    const voices = this.voices;
    if (!active || !karts || !camPos) {
      for (const v of voices) v.update(dt, null);
      return;
    }
    const cands = this._cands;
    cands.length = 0;
    for (const k of karts) {
      if (!k || k === playerKart || !k.position) continue;
      const dx = k.position.x - camPos.x, dz = k.position.z - camPos.z, dy = k.position.y - camPos.y;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 90 * 90) continue;
      cands.push({ k, d2 });
    }
    cands.sort((a, b) => a.d2 - b.d2);
    const chosen = cands.slice(0, voices.length).map((c) => c.k);
    // keep existing assignments stable so voices never jump between karts
    for (const v of voices) {
      const i = v.assigned ? chosen.indexOf(v.assigned) : -1;
      if (i >= 0) chosen.splice(i, 1);
      else v.assigned = null;
    }
    for (const v of voices) {
      if (!v.assigned && chosen.length) v.assigned = chosen.shift();
      v.update(dt, v.assigned, camPos);
    }
  }

  dispose() {
    for (const v of this.voices) v.dispose();
  }
}
