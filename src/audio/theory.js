/**
 * Tiny music-theory helpers: note names → MIDI, chord symbols → intervals.
 */

const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** "C#4" / "Bb3" / "E5" → MIDI number (C4 = 60). Returns null for rests. */
export function noteToMidi(name) {
  if (!name || name === '-' || name === 'r') return null;
  const m = /^([A-Ga-g])([#b]*)(-?\d+)$/.exec(name);
  if (!m) throw new Error(`Bad note "${name}"`);
  let pc = PC[m[1].toUpperCase()];
  for (const acc of m[2]) pc += acc === '#' ? 1 : -1;
  return pc + (Number(m[3]) + 1) * 12;
}

export function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

const QUALITIES = [
  // longest first so "maj7" wins over "m"
  ['maj9', [0, 4, 7, 11, 14]],
  ['maj7', [0, 4, 7, 11]],
  ['m7b5', [0, 3, 6, 10]],
  ['madd9', [0, 3, 7, 14]],
  ['add9', [0, 4, 7, 14]],
  ['sus4', [0, 5, 7]],
  ['sus2', [0, 2, 7]],
  ['dim7', [0, 3, 6, 9]],
  ['dim', [0, 3, 6]],
  ['aug', [0, 4, 8]],
  ['m9', [0, 3, 7, 10, 14]],
  ['m7', [0, 3, 7, 10]],
  ['m6', [0, 3, 7, 9]],
  ['m', [0, 3, 7]],
  ['13', [0, 4, 7, 10, 21]],
  ['9', [0, 4, 7, 10, 14]],
  ['7', [0, 4, 7, 10]],
  ['6', [0, 4, 7, 9]],
  ['5', [0, 7]],
  ['', [0, 4, 7]],
];

/** "F#m7" → { root: 6 (pitch class), intervals: [0,3,7,10], third, fifth, seventh } */
export function parseChord(sym) {
  const m = /^([A-G])([#b]?)(.*)$/.exec(sym.trim());
  if (!m) throw new Error(`Bad chord "${sym}"`);
  let root = PC[m[1]];
  if (m[2] === '#') root += 1;
  if (m[2] === 'b') root -= 1;
  root = (root + 12) % 12;
  let rest = m[3];
  let bass = null;
  const slash = rest.indexOf('/');
  if (slash >= 0) {
    const b = rest.slice(slash + 1);
    rest = rest.slice(0, slash);
    const bm = /^([A-G])([#b]?)$/.exec(b);
    if (bm) bass = (PC[bm[1]] + (bm[2] === '#' ? 1 : bm[2] === 'b' ? -1 : 0) + 12) % 12;
  }
  let intervals = null;
  for (const [q, iv] of QUALITIES) {
    if (rest === q) {
      intervals = iv;
      break;
    }
  }
  if (!intervals) throw new Error(`Unknown chord quality "${sym}"`);
  const has = (x) => intervals.includes(x);
  return {
    symbol: sym,
    root,
    bass: bass ?? root,
    intervals,
    third: has(3) ? 3 : has(4) ? 4 : has(5) ? 5 : has(2) ? 2 : 4,
    fifth: has(6) ? 6 : has(8) ? 8 : 7,
    seventh: has(11) ? 11 : has(9) && !has(10) && intervals.length === 4 && has(3) && has(6) ? 9 : has(10) ? 10 : 10,
  };
}

/** Lowest MIDI note >= `low` with the given pitch class. */
export function pcAbove(pc, low) {
  let m = low + ((pc - (low % 12) + 120) % 12);
  return m;
}

/**
 * Close voicing of a chord within [low, low+~14]. Returns MIDI numbers.
 */
export function voiceChord(chord, low, maxNotes = 4) {
  const notes = [];
  const root = pcAbove(chord.root, low);
  for (const iv of chord.intervals) {
    let n = root + (iv % 12);
    if (iv >= 12) n = root + iv - 12; // extensions folded down an octave
    while (n < low) n += 12;
    while (n > low + 16) n -= 12;
    notes.push(n);
  }
  notes.sort((a, b) => a - b);
  const uniq = [...new Set(notes)];
  return uniq.slice(0, maxNotes);
}

/** Ascending chord tones spanning several octaves from `low` (for arpeggios). */
export function chordLadder(chord, low, count = 10) {
  const base = pcAbove(chord.root, low);
  const tri = chord.intervals.filter((x) => x < 12);
  const out = [];
  for (let o = 0; out.length < count; o++) {
    for (const iv of tri) {
      out.push(base + iv + o * 12);
      if (out.length >= count) break;
    }
  }
  return out;
}
