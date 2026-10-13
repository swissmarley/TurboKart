import { EVENTS } from './constants.js';

/**
 * Tracks laps, race positions, lap times, wrong-way state and the finish order.
 *
 * Progress is measured as a continuous `raceDistance` along the centerline:
 * karts start on the grid behind the line (negative distance), crossing the
 * line the first time puts them at ~0 (lap 1), and they finish once
 * `raceDistance >= totalLaps * track.length`.
 */
export class RaceManager {
  /**
   * @param {{ track: any, karts: any[], bus: import('./EventBus.js').EventBus, totalLaps: number, mode: string }} opts
   */
  constructor({ track, karts, bus, totalLaps, mode }) {
    this.track = track;
    this.karts = karts;
    this.bus = bus;
    this.totalLaps = totalLaps;
    this.mode = mode;
    this.running = false;
    this.raceTime = 0;
    this.finishOrder = [];
    this.allFinished = false;
    this.playerFinishTime = null;
    this._ordered = [...karts];

    for (const kart of karts) this._initKart(kart);
    this._updatePositions(); // grid order (no events while not running)
  }

  _initKart(kart) {
    const L = this.track.length;
    const d = kart.trackInfo ? kart.trackInfo.distance : 0;
    // Grid slots sit just behind the line, i.e. near the end of the lap.
    const start = d > L * 0.5 ? d - L : d;
    kart.raceDistance = start;
    kart.lap = 1;
    kart.finished = false;
    kart.finishTime = null;
    kart.racePosition = 1;
    kart._rm = {
      prevDistance: d,
      lapsCompleted: 0,
      lapStart: 0,
      lapTimes: [],
      bestLap: null,
      lastLapTime: null,
      wrongWayTime: 0,
      wrongWay: false,
      maxDistance: start,
    };
  }

  start() {
    this.running = true;
    this.raceTime = 0;
    for (const kart of this.karts) {
      kart._rm.lapStart = 0;
      kart._rm.prevDistance = kart.trackInfo ? kart.trackInfo.distance : kart._rm.prevDistance;
    }
  }

  /** Lap time for the current lap of `kart`. */
  currentLapTime(kart) {
    return this.raceTime - kart._rm.lapStart;
  }

  update(dt) {
    if (!this.running) return;
    this.raceTime += dt;
    const L = this.track.length;

    for (const kart of this.karts) {
      const rm = kart._rm;
      if (!kart.trackInfo) continue;
      if (!kart.finished) {
        const d = kart.trackInfo.distance;
        let delta = d - rm.prevDistance;
        if (delta > L * 0.5) delta -= L;
        else if (delta < -L * 0.5) delta += L;
        // Guard against teleports / query glitches.
        if (delta > 30) delta = 30;
        else if (delta < -30) delta = -30;
        rm.prevDistance = d;
        kart.raceDistance += delta;
        if (kart.raceDistance > rm.maxDistance) rm.maxDistance = kart.raceDistance;

        // Negative before the first line crossing; 1 after one full lap, etc.
        const lapsDone = Math.floor(kart.raceDistance / L);
        if (lapsDone > rm.lapsCompleted) {
          // Crossed the line forward, completing a lap.
          rm.lapsCompleted = lapsDone;
          const lapTime = this.raceTime - rm.lapStart;
          rm.lapStart = this.raceTime;
          rm.lapTimes.push(lapTime);
          rm.lastLapTime = lapTime;
          if (rm.bestLap === null || lapTime < rm.bestLap) rm.bestLap = lapTime;

          if (rm.lapsCompleted >= this.totalLaps) {
            this._finishKart(kart);
          } else {
            const lap = rm.lapsCompleted + 1;
            kart.lap = lap;
            const isFinalLap = lap === this.totalLaps;
            this.bus.emit(EVENTS.RACE_LAP, { kart, lap, totalLaps: this.totalLaps, isFinalLap, lapTime });
            if (isFinalLap && kart.isPlayer) this.bus.emit(EVENTS.RACE_FINAL_LAP, { kart });
          }
        }

        if (kart.isPlayer) this._updateWrongWay(kart, dt);
      }
    }

    this._updatePositions();
  }

  _updateWrongWay(kart, dt) {
    const rm = kart._rm;
    const t = kart.trackInfo.tangent;
    const f = kart.forward;
    const dot = t.x * f.x + t.z * f.z;
    const movingBack = kart.speed > 2 ? dot < -0.35 : kart.speed < -2 ? dot > 0.35 : false;
    rm.wrongWayTime = movingBack ? rm.wrongWayTime + dt : Math.max(0, rm.wrongWayTime - dt * 2);
    const wrong = rm.wrongWayTime > 1.2;
    if (wrong !== rm.wrongWay) {
      rm.wrongWay = wrong;
      this.bus.emit(EVENTS.RACE_WRONG_WAY, { kart, wrongWay: wrong });
    }
  }

  _finishKart(kart) {
    kart.finished = true;
    kart.finishTime = this.raceTime;
    kart.lap = this.totalLaps;
    this.finishOrder.push(kart);
    const position = this.finishOrder.length;
    kart.racePosition = position;
    if (kart.isPlayer) this.playerFinishTime = this.raceTime;
    this.bus.emit(EVENTS.RACE_FINISH, { kart, position, time: this.raceTime });
    if (this.finishOrder.length === this.karts.length) this._completeRace();
  }

  _updatePositions() {
    const ordered = this._ordered;
    ordered.sort((a, b) => {
      if (a.finished && b.finished) return this.finishOrder.indexOf(a) - this.finishOrder.indexOf(b);
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.raceDistance - a.raceDistance;
    });
    for (let i = 0; i < ordered.length; i++) {
      const kart = ordered[i];
      const pos = i + 1;
      if (kart.racePosition !== pos) {
        const from = kart.racePosition;
        kart.racePosition = pos;
        if (this.running && this.raceTime > 0.5) {
          this.bus.emit(EVENTS.RACE_POSITION_CHANGE, { kart, from, to: pos });
        }
      }
    }
  }

  /**
   * Ends the race for everyone still driving, estimating their finishing
   * times from their remaining distance (used shortly after the player
   * finishes so nobody waits for the last AI).
   */
  forceFinish() {
    if (this.allFinished) return;
    const L = this.track.length;
    const remaining = this.karts.filter((k) => !k.finished).sort((a, b) => b.raceDistance - a.raceDistance);
    let lastTime = this.finishOrder.length ? this.finishOrder[this.finishOrder.length - 1].finishTime : this.raceTime;
    for (const kart of remaining) {
      const left = Math.max(0, this.totalLaps * L - kart.raceDistance);
      const avgSpeed = Math.max(12, kart.raceDistance / Math.max(1, this.raceTime));
      let t = this.raceTime + left / avgSpeed;
      t = Math.max(t, lastTime + 0.15 + Math.random() * 0.4);
      lastTime = t;
      kart.finished = true;
      kart.finishTime = t;
      const rm = kart._rm;
      if (rm.bestLap === null) rm.bestLap = (t / this.totalLaps) * (0.97 + Math.random() * 0.04);
      this.finishOrder.push(kart);
      kart.racePosition = this.finishOrder.length;
    }
    this._completeRace();
  }

  _completeRace() {
    if (this.allFinished) return;
    this.allFinished = true;
    this.running = false;
    this.bus.emit(EVENTS.RACE_ALL_FINISHED, { standings: this.getStandings() });
  }

  getStandings() {
    const list = this.finishOrder.length === this.karts.length ? this.finishOrder : this._ordered;
    return list.map((kart, i) => ({
      kart,
      position: i + 1,
      finishTime: kart.finishTime,
      bestLap: kart._rm.bestLap,
      lapTimes: [...kart._rm.lapTimes],
    }));
  }

  getKartStats(kart) {
    const rm = kart._rm;
    return {
      lapsCompleted: rm.lapsCompleted,
      lapTime: this.raceTime - rm.lapStart,
      bestLap: rm.bestLap,
      lastLapTime: rm.lastLapTime,
      lapTimes: rm.lapTimes,
      wrongWay: rm.wrongWay,
    };
  }
}
