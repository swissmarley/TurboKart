import { ITEMS, GAME_MODES } from '../core/constants.js';

/**
 * Position-weighted item distribution.
 *
 * Columns are race positions 1..8 (for other racer counts the position is
 * mapped onto this 0..1 range and the columns are interpolated). Leaders get
 * defensive items (bananas, green shells, coins), the mid-pack gets red shells
 * and mushrooms, back markers get catch-up items (stars, golden mushrooms,
 * triple reds, lightning). Spiny shell and lightning are rare and back-half only.
 */
export const ITEM_TABLE = {
  //                           1st 2nd 3rd 4th 5th 6th 7th 8th
  [ITEMS.BANANA]:             [30, 16, 9, 5, 2, 0, 0, 0],
  [ITEMS.TRIPLE_BANANA]:      [7, 9, 6, 3, 1, 0, 0, 0],
  [ITEMS.GREEN_SHELL]:        [26, 18, 13, 8, 4, 2, 0, 0],
  [ITEMS.TRIPLE_GREEN_SHELL]: [3, 8, 9, 8, 5, 3, 1, 0],
  [ITEMS.COIN]:               [22, 10, 6, 3, 1, 0, 0, 0],
  [ITEMS.RED_SHELL]:          [0, 13, 18, 17, 14, 10, 6, 3],
  [ITEMS.TRIPLE_RED_SHELL]:   [0, 0, 4, 8, 12, 14, 14, 12],
  [ITEMS.MUSHROOM]:           [6, 14, 16, 17, 15, 11, 8, 5],
  [ITEMS.TRIPLE_MUSHROOM]:    [0, 3, 7, 11, 14, 15, 14, 12],
  [ITEMS.GOLDEN_MUSHROOM]:    [0, 0, 0, 3, 6, 10, 13, 15],
  [ITEMS.STAR]:               [0, 0, 0, 2, 6, 10, 14, 18],
  [ITEMS.BOMB]:               [6, 9, 12, 13, 13, 11, 10, 9],
  [ITEMS.LIGHTNING]:          [0, 0, 0, 0, 0, 2, 4, 6],
  [ITEMS.SPINY_SHELL]:        [0, 0, 0, 0, 2, 3, 4, 5],
};

const TYPES = Object.keys(ITEM_TABLE);
const CATCH_UP = new Set([ITEMS.STAR, ITEMS.GOLDEN_MUSHROOM, ITEMS.TRIPLE_MUSHROOM, ITEMS.TRIPLE_RED_SHELL]);
const _weights = new Float64Array(TYPES.length);

/**
 * Rolls an item for a racer.
 * @param {number} racePosition 1-based
 * @param {number} racerCount
 * @param {object} [ctx]
 * @param {() => number} [ctx.rng]            random source (default Math.random)
 * @param {string} [ctx.mode]                 GAME_MODES.*
 * @param {number} [ctx.distanceToLeader]     metres behind the leader (boosts catch-up items when large)
 * @param {boolean} [ctx.spinyActive]         a spiny shell is already in flight (no second one)
 * @param {boolean} [ctx.lightningBlocked]    lightning on global cooldown
 * @returns {string} ITEMS.*
 */
export function rollItem(racePosition, racerCount, ctx = {}) {
  const rng = ctx.rng || Math.random;
  if (ctx.mode === GAME_MODES.TIME_TRIAL) return ITEMS.TRIPLE_MUSHROOM;
  const n = Math.max(1, racerCount | 0);
  const pos = Math.min(n, Math.max(1, racePosition | 0));
  const t = n > 1 ? (pos - 1) / (n - 1) : 0; // 0 leader .. 1 last
  const col = t * 7;
  const c0 = Math.floor(col);
  const c1 = Math.min(7, c0 + 1);
  const f = col - c0;
  const behind = Math.max(0, ctx.distanceToLeader || 0);
  const catchUpBoost = 1 + Math.min(0.8, Math.max(0, (behind - 120) / 400));

  let total = 0;
  for (let i = 0; i < TYPES.length; i++) {
    const type = TYPES[i];
    const row = ITEM_TABLE[type];
    let w = row[c0] * (1 - f) + row[c1] * f;
    if ((type === ITEMS.SPINY_SHELL || type === ITEMS.LIGHTNING) && (t < 0.5 || n < 3)) w = 0;
    if (type === ITEMS.SPINY_SHELL && ctx.spinyActive) w = 0;
    if (type === ITEMS.LIGHTNING && ctx.lightningBlocked) w = 0;
    if (CATCH_UP.has(type)) w *= catchUpBoost;
    if (n === 1 && (type === ITEMS.RED_SHELL || type === ITEMS.TRIPLE_RED_SHELL)) w = 0;
    _weights[i] = w;
    total += w;
  }
  if (total <= 0) return ITEMS.MUSHROOM;
  let r = rng() * total;
  for (let i = 0; i < TYPES.length; i++) {
    r -= _weights[i];
    if (r <= 0) return TYPES[i];
  }
  return TYPES[TYPES.length - 1];
}

/** Item types shown while the roulette spins (display only). */
export const ROULETTE_DISPLAY = [
  ITEMS.MUSHROOM,
  ITEMS.BANANA,
  ITEMS.GREEN_SHELL,
  ITEMS.RED_SHELL,
  ITEMS.STAR,
  ITEMS.BOMB,
  ITEMS.COIN,
  ITEMS.TRIPLE_MUSHROOM,
  ITEMS.GOLDEN_MUSHROOM,
  ITEMS.TRIPLE_GREEN_SHELL,
  ITEMS.LIGHTNING,
  ITEMS.TRIPLE_BANANA,
];
