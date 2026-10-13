/**
 * Original procedural soundtrack. Each song = tempo + instrument choice +
 * named drum patterns + sections (chords per bar, bass/arp/comp patterns,
 * lead + counter melodies) + an arrangement that loops from `loopFrom`.
 *
 * Pattern alphabet (16 steps per 4/4 bar):
 *   drums  : x hit, X accent, g ghost, . nothing (t line: h/m/l toms, d line: D dum, T tek, K ka)
 *   bass   : R root, 3 third, 5 fifth, 7 seventh, O octave, L fifth below, 2 second, b flat-2nd,
 *            4 fourth, 6 sixth, x dead note, . hold, - rest
 *   arp    : 0-9 chord-tone ladder index, . hold, - rest
 *   comp   : x chord stab, . hold, - rest
 *   melody : "NOTE:steps" tokens, "-:steps" = rest (each bar must sum to 16)
 * Chords: one symbol per bar, "A|B" splits the bar in halves.
 */

const FOUR = 'x...x...x...x...';
const BACK = '....x.......x...';

export const SONGS = {
  // ---------------------------------------------------------------- TITLE --
  title: {
    bpm: 150,
    inst: { lead: 'supersaw', counter: 'glock', arp: 'pluck', bass: 'pickBass', pad: 'warmPad' },
    mix: { lead: 1, counter: 0.7, arp: 0.55, bass: 1, pad: 1.1, drums: 1 },
    low: { bass: 33, arp: 62, pad: 54 },
    pump: 0.55,
    drums: {
      build: { k: 'x.......x.......', s: '....x.......x...x.x.x.x.x.x.xxxx', h: '' },
      main: { k: FOUR, s: BACK, h: '..x...x...x...x.', o: '', c: BACK },
      drive: { k: 'x...x...x...x.x.', s: BACK, h: 'xgxgxgxgxgxgxgxg', c: BACK },
      fill: { k: 'x...x...x.......', s: '....x...xxxxXXXX', t: '..........hhmmll' },
      half: { k: 'x.......x.......', s: '........x.......', h: 'x...x...x...x...' },
    },
    sections: {
      intro: { bars: 2, chords: ['D', 'A|E'], drums: 'build', bass: 'R.R.R.R.R.R.R.R.', pad: true, riser: true,
        lead: [null, '-:8 A4:2 D5:2 F#5:2 A5:2'] },
      A: { bars: 8, chords: ['D', 'A', 'Bm', 'G', 'D', 'A', 'G', 'A'], drums: 'main', fill: 'fill', crash: true,
        bass: 'R.R.O.R.R.R.O.5.', arp: '0.2.3.2.0.2.3.2.', pad: true,
        lead: [
          'F#5:2 A5:2 D6:4 C#6:2 A5:2 F#5:4',
          'E5:2 A5:2 C#6:4 B5:2 A5:2 E5:4',
          'F#5:2 B5:2 D6:4 C#6:2 B5:2 F#5:2 A5:2',
          'G5:6 A5:2 B5:4 A5:4',
          'F#5:2 A5:2 D6:4 E6:2 D6:2 C#6:2 D6:2',
          'E6:4 C#6:2 A5:2 E5:4 A5:4',
          'B5:2 A5:2 G5:2 F#5:2 G5:2 A5:2 B5:2 D6:2',
          'C#6:4 E6:4 A5:8',
        ] },
      B: { bars: 8, chords: ['G', 'A', 'F#m', 'Bm', 'G', 'A', 'Bm', 'A'], drums: 'drive', fill: 'fill', crash: true,
        bass: 'R.O.R.O.R.O.5.O.', arp: '2343234323432343', pad: true,
        lead: [
          'D6:3 B5:3 G5:2 B5:2 D6:2 G6:4',
          'E6:3 C#6:3 A5:2 C#6:2 E6:2 A6:4',
          'F#6:4 E6:2 C#6:2 A5:4 C#6:4',
          'D6:4 C#6:2 B5:2 F#5:8',
          'G5:2 B5:2 D6:2 G6:2 F#6:2 E6:2 D6:2 B5:2',
          'C#6:2 E6:2 A6:4 G6:2 F#6:2 E6:4',
          'F#6:6 E6:2 D6:4 C#6:4',
          'E6:8 -:4 A5:2 C#6:2',
        ],
        counter: [
          'B6:4 -:4 B6:2 A6:2 G6:4', 'C#7:4 -:4 C#7:2 B6:2 A6:4', 'A6:4 -:4 A6:2 G#6:2 F#6:4', 'F#6:8 -:8',
          'D7:4 -:4 B6:4 G6:4', 'E7:4 -:4 C#7:4 A6:4', 'F#7:4 D7:4 B6:4 F#6:4', 'E6:4 A6:4 C#7:8',
        ] },
      C: { bars: 8, chords: ['Em', 'G', 'D', 'A', 'Em', 'G', 'A', 'A'], drums: 'half', fill: 'fill', riser: true,
        bass: 'R.......R...5...', arp: '0123012301230123', pad: true,
        lead: [
          'B5:8 G5:4 E5:4', 'D6:8 B5:4 G5:4', 'A5:8 F#5:4 D5:4', 'C#6:8 E6:8',
          'G6:4 F#6:4 E6:4 B5:4', 'D6:4 E6:4 G6:4 B6:4', 'A6:16', '-:8 E6:2 F#6:2 G6:2 G#6:2',
        ] },
    },
    arrangement: ['intro', 'A', 'B', 'A', 'C', 'B'],
    loopFrom: 1,
  },

  // ----------------------------------------------------------------- MENU --
  menu: {
    bpm: 116,
    swing: 0.14,
    inst: { lead: 'marimba', comp: 'epiano', bass: 'slapBass', pad: 'organPad', counter: 'glock' },
    mix: { lead: 1, comp: 1, bass: 1, pad: 0.7, drums: 0.9, counter: 0.5 },
    low: { bass: 33, comp: 57, pad: 55 },
    pump: 0,
    drums: {
      intro: { k: 'x.........x.....', h: 'x.x.x.x.x.x.x.x.', m: '....x.......x...' },
      main: { k: 'x.....x.x..x....', s: BACK, h: 'x.xgx.xgx.xgx.xg', o: '......x.........', b: '' },
      groove2: { k: 'x.....x.x..x..x.', s: '....x..g....x.g.', h: 'x.xgx.xgx.xgx.xg', b: 'x.....x.....x...' },
      fill: { k: 'x.....x.x.......', s: '....x..gx.xxXgXX', h: 'x.x.x.x.........' },
    },
    sections: {
      intro: { bars: 2, chords: ['Fmaj7', 'Gm7|C7'], drums: 'intro', bass: 'R......5R..O..5.', comp: 'x......x....x...', pad: false },
      A: { bars: 8, chords: ['Fmaj7', 'Em7|A7', 'Dm7', 'Cm7|F7', 'Bbmaj7', 'Bbm7', 'Am7|D7', 'Gm7|C7'], drums: 'main', fill: 'fill',
        bass: 'R..O..R.-R.5.O.7', comp: '..x...x...x..x..', pad: true,
        lead: [
          '-:2 A5:1 C6:1 E6:2 C6:2 -:2 A5:2 G5:2 F5:2',
          'G5:3 E5:1 -:2 G5:2 C#6:3 A5:1 -:4',
          '-:2 F5:1 A5:1 C6:2 A5:2 D6:3 C6:1 A5:2 F5:2',
          'Eb5:3 G5:1 -:2 Bb5:2 A5:3 F5:1 Eb5:4',
          '-:2 D6:1 F6:1 A6:2 F6:2 D6:2 C6:2 Bb5:4',
          'Db6:3 Bb5:1 -:2 F5:2 Ab5:4 G5:4',
          'C6:3 A5:1 E5:2 G5:2 F#5:3 A5:1 C6:4',
          'Bb5:2 A5:2 G5:2 F5:2 E5:4 -:4',
        ] },
      B: { bars: 8, chords: ['Bbmaj7', 'Am7', 'Gm7', 'Fmaj7', 'Bbmaj7', 'A7', 'Dm7|G7', 'Gm7|C7'], drums: 'groove2', fill: 'fill', crash: true,
        bass: 'R.-R..5.R.-O..7.', comp: 'x..x..x...x..x..', pad: true,
        lead: [
          'F6:6 E6:2 D6:4 A5:4',
          'C6:6 Bb5:2 A5:4 E5:4',
          'Bb5:3 A5:1 G5:2 F5:2 D5:4 F5:4',
          'E5:2 F5:2 A5:2 C6:2 E6:8',
          'D6:3 F6:1 -:2 D6:2 A6:4 F6:4',
          'G6:3 E6:1 -:2 C#6:2 A5:8',
          'F5:2 A5:2 D6:2 F6:2 F6:3 E6:1 D6:2 B5:2',
          'C6:4 Bb5:4 G5:4 E5:4',
        ],
        counter: [null, null, null, 'A6:2 C7:2 E7:4 -:8', null, null, null, 'E7:4 -:12'] },
    },
    arrangement: ['intro', 'A', 'B', 'A', 'B'],
    loopFrom: 1,
  },

  // --------------------------------------------------------------- MEADOW --
  meadow: {
    bpm: 140,
    inst: { lead: 'squareLead', counter: 'glock', arp: 'pluck', bass: 'bouncyBass', pad: 'warmPad' },
    mix: { lead: 1, counter: 0.8, arp: 0.5, bass: 1, pad: 1, drums: 1 },
    low: { bass: 31, arp: 62, pad: 55 },
    pump: 0.35,
    drums: {
      intro: { k: 'x.......x.......', h: 'x.x.x.x.x.x.x.x.', c: '' },
      main: { k: 'x.....x.x...x...', s: BACK, h: 'x.x.x.x.x.x.x.x.', p: '' },
      bounce: { k: 'x.....x.x...x.x.', s: BACK, c: BACK, h: 'x.xgx.xgx.xgx.xg', o: '..............x.' },
      fill: { k: 'x.....x.x.......', s: '....x.......xxXX', t: '........hhmm....' },
      breakd: { k: 'x...............', s: '', h: '..x...x...x...x.', m: '....x.......x...' },
    },
    sections: {
      intro: { bars: 4, chords: ['G', 'C', 'D', 'D'], drums: 'intro', bass: 'R...5...R...5...', pad: true, arp: '0.2.1.2.3.2.1.2.',
        lead: [null, null, null, '-:8 D5:2 E5:2 F#5:2 A5:2'] },
      A: { bars: 8, chords: ['G', 'Em', 'C', 'D', 'G', 'Em', 'C|D', 'G'], drums: 'main', fill: 'fill', crash: true,
        bass: 'R.-R5.-.R.-R5.L.', arp: '0.2.1.2.3.2.1.2.', pad: true,
        lead: [
          'D5:2 G5:2 B5:3 A5:1 G5:2 B5:2 D6:4',
          'E6:3 D6:1 B5:2 G5:2 E5:4 G5:4',
          'C6:2 E6:2 C6:2 G5:2 A5:3 B5:1 C6:4',
          'B5:2 A5:2 F#5:2 D5:2 A5:8',
          'D5:2 G5:2 B5:3 A5:1 G5:2 B5:2 D6:4',
          'E6:3 F#6:1 G6:2 E6:2 D6:4 B5:4',
          'C6:2 E6:2 G6:4 F#6:2 E6:2 D6:2 C6:2',
          'B5:4 G5:6 -:2 D5:2 E5:2',
        ] },
      B: { bars: 8, chords: ['C', 'D', 'Bm', 'Em', 'C', 'D', 'Em|C', 'D'], drums: 'bounce', fill: 'fill', crash: true,
        bass: 'R.R.5.R.R.R.5.O.', arp: '0123012301230123', pad: true,
        lead: [
          'E5:2 G5:2 C6:6 B5:2 C6:2 E6:2',
          'D6:6 C6:2 B5:2 A5:2 F#5:4',
          'F#5:2 B5:2 D6:6 C#6:2 D6:2 F#6:2',
          'E6:6 D6:2 B5:4 G5:4',
          'G5:2 C6:2 E6:4 G6:4 E6:4',
          'F#6:4 E6:2 D6:2 A5:4 D6:4',
          'G6:4 F#6:2 E6:2 E6:2 D6:2 C6:2 B5:2',
          'A5:4 B5:2 C6:2 D6:8',
        ],
        counter: [
          'C7:4 G6:4 E6:4 G6:4', 'D7:4 A6:4 F#6:4 A6:4', 'B6:4 F#6:4 D6:4 F#6:4', 'G6:4 E6:4 B5:4 E6:4',
          'C7:4 G6:4 E6:4 G6:4', 'D7:4 A6:4 F#6:4 A6:4', 'E7:4 B6:4 C7:4 G6:4', 'F#6:4 A6:4 D7:8',
        ] },
      C: { bars: 8, chords: ['Am', 'D', 'G', 'Em', 'Am', 'D', 'G', 'D7'], drums: 'breakd', fill: 'fill', riser: true,
        bass: 'R.......5.......', arp: '0.1.2.3.2.1.0.1.', pad: true,
        lead: [
          'C6:8 B5:4 A5:4', 'F#5:8 A5:4 D6:4', 'B5:8 A5:4 G5:4', 'E5:8 G5:4 B5:4',
          'C6:4 E6:4 A6:4 G6:4', 'F#6:8 E6:4 D6:4', 'D6:4 B5:4 G5:4 B5:4', 'C6:4 A5:4 F#5:4 D5:4',
        ] },
    },
    arrangement: ['intro', 'A', 'B', 'A', 'C', 'B'],
    loopFrom: 1,
  },

  // --------------------------------------------------------------- DESERT --
  desert: {
    bpm: 126,
    inst: { lead: 'reed', arp: 'oud', bass: 'subBass', pad: 'drone', counter: 'flute' },
    mix: { lead: 1, arp: 0.8, bass: 1, pad: 1.2, drums: 1, counter: 0.7 },
    low: { bass: 28, arp: 52, pad: 40 },
    pump: 0,
    drums: {
      intro: { d: 'D.D...T.D...T...', p: 'xgxgxgxgxgxgxgxg' },
      main: { d: 'D.D.K.T.D.K.T.K.', k: 'x.......x.......', p: 'xgxgxgxgxgxgxgxg', c: '............x...' },
      drive: { d: 'D.DKT.T.DKD.T.TK', k: 'x.....x.x.......', s: BACK, p: 'xgxgxgxgxgxgxgxg' },
      fill: { d: 'D.D.T.T.TKTKTTTT', k: 'x.......x.......', p: 'xgxgxgxgxgxgxgxg' },
    },
    sections: {
      intro: { bars: 4, chords: ['E', 'E', 'E', 'F'], drums: 'intro', bass: 'R..R..b.R..R.5.b', pad: true, arp: '0.0.1.0.2.1.0...' },
      A: { bars: 8, chords: ['E', 'F', 'E', 'Dm', 'E', 'F', 'G|F', 'E'], drums: 'main', fill: 'fill', crash: true,
        bass: 'R..R..b.R..R.5.b', arp: '0.10.21.0.10.21.', pad: true,
        lead: [
          'E5:2 F5:2 G#5:4 F5:2 E5:2 -:2 B4:2',
          'C5:2 B4:1 A4:1 G#4:2 A4:2 B4:4 C5:4',
          'B4:2 C5:2 D5:2 E5:2 F5:3 E5:1 D5:2 C5:2',
          'D5:4 F5:2 E5:2 D5:2 C5:2 B4:2 A4:2',
          'G#4:2 A4:2 B4:2 C5:2 D5:2 E5:2 F5:2 G#5:2',
          'A5:6 G#5:2 F5:4 E5:4',
          'D5:2 E5:2 F5:2 G5:2 F5:3 E5:1 D5:2 C5:2',
          'B4:2 C5:2 G#4:4 E4:8',
        ] },
      B: { bars: 8, chords: ['Am', 'G', 'F', 'E', 'Am', 'G', 'F', 'E'], drums: 'drive', fill: 'fill', crash: true,
        bass: 'R.RO..R.5.R.R.5.', arp: '0121012101210121', pad: true,
        lead: [
          'A5:4 C6:2 B5:2 A5:2 G#5:2 A5:4',
          'G5:4 B5:2 A5:2 G5:2 F5:2 G5:4',
          'F5:2 G5:2 A5:2 G5:2 F5:2 E5:2 F5:4',
          'E5:6 F5:1 E5:1 D5:4 E5:4',
          'C6:2 B5:2 A5:2 B5:2 C6:4 E6:4',
          'D6:2 C6:2 B5:2 C6:2 D6:4 G5:4',
          'A5:2 G#5:2 F5:2 E5:2 F5:2 G#5:2 A5:2 B5:2',
          'G#5:8 E5:8',
        ],
        counter: [
          'E5:8 C5:8', 'D5:8 B4:8', 'C5:8 A4:8', 'B4:8 G#4:8', 'E5:8 A5:8', 'G5:8 D5:8', 'C5:8 F5:8', 'E5:16',
        ] },
      C: { bars: 8, chords: ['Dm', 'E', 'Dm', 'E', 'F', 'G', 'F', 'E'], drums: 'main', fill: 'fill', riser: true,
        bass: 'R.......R...5...', arp: '0.1.2.1.0.1.2.1.', pad: true,
        lead: [
          'D5:3 F5:3 A5:2 -:8', 'G#5:3 F5:3 E5:2 -:8', 'A5:3 F5:3 D6:2 -:8', 'B5:3 G#5:3 E5:2 -:8',
          'C6:4 A5:4 F5:4 A5:4', 'D6:4 B5:4 G5:4 B5:4', 'C6:2 D6:2 C6:2 B5:2 A5:2 G#5:2 F5:2 E5:2', 'E5:16',
        ],
        counter: [
          '-:8 A4:2 D5:2 F5:4', '-:8 B4:2 E5:2 G#5:4', '-:8 D5:2 F5:2 A5:4', '-:8 E5:2 G#5:2 B5:4',
          null, null, null, null,
        ] },
    },
    arrangement: ['intro', 'A', 'B', 'A', 'C', 'B'],
    loopFrom: 1,
  },

  // ----------------------------------------------------------------- SNOW --
  snow: {
    bpm: 132,
    swing: 0.12,
    inst: { lead: 'glock', counter: 'flute', arp: 'celesta', bass: 'warmBass', pad: 'choirPad' },
    mix: { lead: 1.25, counter: 0.75, arp: 0.6, bass: 1, pad: 1, drums: 0.9 },
    low: { bass: 33, arp: 64, pad: 57 },
    pump: 0.25,
    drums: {
      intro: { j: 'x.x.x.x.x.x.x.x.', k: 'x...............' },
      main: { k: 'x.....x...x.....', s: BACK, j: 'xgxgxgxgxgxgxgxg', h: '' },
      sleigh: { k: 'x.....x.x.x.....', s: BACK, c: '', j: 'XgxgXgxgXgxgXgxg', o: '..............x.' },
      fill: { k: 'x.....x.........', s: '....x.......xxxx', j: 'x.x.x.x.x.x.x.x.', t: '........hhmmll..' },
    },
    sections: {
      intro: { bars: 4, chords: ['A', 'F#m', 'D', 'E'], drums: 'intro', bass: 'R...............', pad: true, arp: '0.1.2.3.4.3.2.1.' },
      A: { bars: 8, chords: ['A', 'C#m', 'D', 'E', 'A', 'C#m', 'D|E', 'A'], drums: 'main', fill: 'fill', crash: true,
        bass: 'R...R.5.R...5.O.', arp: '0.2.4.2.0.2.4.2.', pad: true,
        lead: [
          'E5:4 A5:2 C#6:2 E6:4 C#6:4',
          'B5:2 C#6:2 G#5:4 E5:8',
          'F#5:2 A5:2 D6:4 C#6:2 B5:2 A5:4',
          'G#5:4 B5:4 E6:8',
          'E6:2 C#6:2 A5:2 C#6:2 E6:4 A6:4',
          'G#6:4 E6:4 C#6:4 B5:4',
          'A5:2 B5:2 C#6:2 D6:2 E6:2 F#6:2 G#6:4',
          'A6:8 -:4 E5:4',
        ],
        counter: [
          'C#5:8 E5:8', 'E5:8 G#5:8', 'F#5:8 A5:8', 'G#5:8 B5:8', 'C#5:8 E5:8', 'E5:8 G#5:8', 'F#5:8 G#5:8', 'A5:16',
        ] },
      B: { bars: 8, chords: ['D', 'E', 'C#m', 'F#m', 'Bm', 'E', 'A', 'E7'], drums: 'sleigh', fill: 'fill', crash: true,
        bass: 'R.5.R.5.R.5.O.5.', arp: '0123432101234321', pad: true,
        lead: [
          'F#6:6 E6:2 D6:4 A5:4',
          'G#5:6 A5:2 B5:4 E6:4',
          'E6:4 C#6:4 G#5:4 C#6:4',
          'A5:6 G#5:2 F#5:8',
          'D6:4 F#6:4 B6:4 A6:4',
          'G#6:6 F#6:2 E6:4 B5:4',
          'C#6:2 E6:2 A6:4 G#6:2 F#6:2 E6:4',
          'D6:4 B5:4 G#5:4 E5:4',
        ],
        counter: [
          'A5:4 F#5:4 D5:8', 'B5:4 G#5:4 E5:8', 'G#5:4 E5:4 C#5:8', 'F#5:4 A5:4 C#6:8',
          'F#5:4 B5:4 D6:8', 'E5:4 G#5:4 B5:8', 'E5:4 A5:4 C#6:8', 'B5:4 G#5:4 D5:8',
        ] },
      C: { bars: 8, chords: ['F#m', 'D', 'A', 'E', 'F#m', 'D', 'Bm', 'E'], drums: 'main', fill: 'fill', riser: true,
        bass: 'R.......R.......', arp: '0.1.2.3.4.3.2.1.', pad: true,
        lead: [
          'C#6:8 A5:8', 'D6:8 F#6:8', 'E6:8 C#6:4 A5:4', 'B5:12 -:4',
          'A5:4 C#6:4 F#6:4 E6:4', 'D6:4 F#6:4 A6:4 F#6:4', 'F#6:4 D6:4 B5:4 D6:4', 'E6:4 G#6:4 B6:8',
        ] },
    },
    arrangement: ['intro', 'A', 'B', 'A', 'C', 'B'],
    loopFrom: 1,
  },

  // ----------------------------------------------------------------- NEON --
  neon: {
    bpm: 124,
    inst: { lead: 'sawLead', arp: 'synthArp', bass: 'synthBass', pad: 'sawPad', counter: 'pluck' },
    mix: { lead: 1, arp: 1, bass: 1, pad: 1.2, drums: 1.05, counter: 0.6 },
    low: { bass: 33, arp: 57, pad: 52 },
    pump: 0.7,
    delayTime: 0.75, // in beats (dotted eighth)
    drums: {
      intro: { k: FOUR, h: 'gggggggggggggggg', o: '' },
      main: { k: FOUR, s: BACK, c: BACK, h: 'xgxgxgxgxgxgxgxg', o: '..x...x...x...x.' },
      drive: { k: 'x...x...x...x.x.', s: BACK, c: BACK, h: 'xxxxxxxxxxxxxxxx', o: '..x...x...x...x.' },
      fill: { k: FOUR, s: '....x...x.x.xxxx', c: '', t: '........hhmmllll' },
    },
    sections: {
      intro: { bars: 4, chords: ['Am', 'F', 'C', 'G'], drums: 'intro', bass: 'R.......R.......', arp: '0242324202423242', pad: true, riser: true },
      A: { bars: 8, chords: ['Am', 'F', 'C', 'G', 'Am', 'F', 'G', 'G'], drums: 'main', fill: 'fill', crash: true,
        bass: 'RORORORORORORORO', arp: '0242324202423242', pad: true,
        lead: [
          'A5:6 C6:2 E6:4 D6:4',
          'C6:6 A5:2 F5:4 A5:4',
          'G5:6 C6:2 E6:4 G6:4',
          'B5:6 D6:2 G6:4 F6:4',
          'E6:4 A6:4 G6:2 E6:2 C6:4',
          'D6:4 C6:2 A5:2 F5:4 C6:4',
          'B5:4 D6:4 G6:8',
          'G6:4 F6:2 E6:2 D6:4 B5:4',
        ] },
      B: { bars: 8, chords: ['F', 'G', 'Em', 'Am', 'F', 'G', 'Am', 'Am'], drums: 'drive', fill: 'fill', crash: true,
        bass: 'RORORORORORORORO', arp: '0123432101234321', pad: true,
        lead: [
          'A5:2 C6:2 F6:4 E6:2 C6:2 A5:4',
          'B5:2 D6:2 G6:4 F6:2 D6:2 B5:4',
          'G5:2 B5:2 E6:4 D6:2 B5:2 G5:4',
          'A5:2 C6:2 E6:4 A6:8',
          'A6:4 G6:4 F6:4 E6:4',
          'D6:4 E6:4 G6:4 B6:4',
          'C7:6 B6:2 A6:8',
          '-:8 E6:4 G6:4',
        ],
        counter: [
          'F4:2 -:2 F4:2 -:2 A4:2 -:2 C5:4', 'G4:2 -:2 G4:2 -:2 B4:2 -:2 D5:4', 'E4:2 -:2 E4:2 -:2 G4:2 -:2 B4:4', 'A4:2 -:2 A4:2 -:2 C5:2 -:2 E5:4',
          'F4:2 -:2 F4:2 -:2 A4:2 -:2 C5:4', 'G4:2 -:2 G4:2 -:2 B4:2 -:2 D5:4', 'A4:2 -:2 C5:2 -:2 E5:2 -:2 A5:4', 'E5:16',
        ] },
      C: { bars: 8, chords: ['Dm', 'Am', 'F', 'G', 'Dm', 'Am', 'E', 'E'], drums: 'intro', fill: 'fill', riser: true,
        bass: 'R.......R.......', arp: '0242324202423242', pad: true,
        lead: [
          'F5:8 A5:8', 'E5:8 A5:8', 'C6:8 A5:8', 'B5:8 D6:8',
          'D6:4 F6:4 A6:8', 'C6:4 E6:4 A6:8', 'G#6:8 B6:8', 'B6:8 G#6:4 E6:4',
        ] },
    },
    arrangement: ['intro', 'A', 'B', 'A', 'C', 'B'],
    loopFrom: 1,
  },

  // -------------------------------------------------------------- RESULTS --
  results: {
    bpm: 86,
    swing: 0.22,
    inst: { lead: 'softLead', comp: 'epiano', bass: 'warmBass', pad: 'warmPad' },
    mix: { lead: 0.9, comp: 1.1, bass: 1, pad: 0.6, drums: 0.75 },
    low: { bass: 31, comp: 55, pad: 55 },
    pump: 0,
    drums: {
      main: { k: 'x......x..x.....', s: '....x.......x...', h: 'x.xgx.xgx.xgx.xg', m: '' },
      fill: { k: 'x......x..x.....', s: '....x.......x.gg', h: 'x.x.x.x.x.x.x.x.' },
      soft: { k: 'x.........x.....', m: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
    },
    sections: {
      intro: { bars: 2, chords: ['Ebmaj7', 'Abmaj7'], drums: 'soft', bass: 'R.......5.......', comp: 'x.......x.......' },
      A: { bars: 8, chords: ['Ebmaj7', 'Cm7', 'Abmaj7', 'Bb7', 'Ebmaj7', 'Gm7', 'Abmaj7', 'Bbsus4|Bb'], drums: 'main', fill: 'fill',
        bass: 'R.....5...R..O..', comp: 'x......x....x...', pad: true,
        lead: [
          'G5:4 Bb5:2 D6:6 C6:2 Bb5:2',
          'G5:8 -:4 Eb5:2 F5:2',
          'G5:4 Ab5:2 C6:6 Bb5:2 G5:2',
          'F5:8 -:4 D5:2 Eb5:2',
          'G5:2 Bb5:2 Eb6:4 D6:4 Bb5:4',
          'D6:6 C6:2 Bb5:4 G5:4',
          'C6:4 Eb6:4 G6:4 F6:4',
          'Eb6:6 D6:2 -:8',
        ] },
      B: { bars: 8, chords: ['Abmaj7', 'Gm7', 'Fm7', 'Bb7', 'Abmaj7', 'Gm7', 'Cm7|F7', 'Fm7|Bb7'], drums: 'main', fill: 'fill',
        bass: 'R.....5...R..O..', comp: 'x..x......x..x..', pad: true,
        lead: [
          'Eb6:4 C6:4 G5:4 Ab5:4',
          'Bb5:8 F5:4 G5:4',
          'Ab5:4 C6:4 Eb6:4 F6:4',
          'D6:8 Bb5:4 Ab5:4',
          'G5:4 C6:4 Eb6:6 D6:2',
          'D6:6 Bb5:2 G5:8',
          'Eb6:4 C6:4 A5:4 C6:4',
          'Ab5:4 F5:4 D5:8',
        ] },
    },
    arrangement: ['intro', 'A', 'B'],
    loopFrom: 1,
  },

  // -------------------------------------------------------------- VICTORY --
  victory: {
    bpm: 120,
    inst: { lead: 'brass', counter: 'glock', bass: 'pickBass', pad: 'strings' },
    mix: { lead: 1.1, counter: 0.7, bass: 1, pad: 1.1, drums: 1 },
    low: { bass: 33, pad: 55 },
    pump: 0,
    drums: {
      fanfare: { k: 'x.......x.......', s: 'x.x.x.x.x.x.xxxx', i: 'x...............', x: 'x...............' },
      hit: { k: 'x...............', i: 'x.x.x.x.xxxxxxxx', x: 'x...............' },
      march: { k: 'x...x...x...x...', s: '....x..g....x.gg', h: 'x.x.x.x.x.x.x.x.' },
      fill: { k: 'x...x...x.......', s: '....x...xxxxXXXX', i: '............x.x.' },
    },
    sections: {
      intro: { bars: 4, chords: ['C', 'F|G', 'C', 'G'], drums: 'fanfare', bass: 'R...R...R...R...', pad: true,
        drumsByBar: ['fanfare', 'fanfare', 'hit', 'fanfare'],
        lead: ['G4:2 C5:2 E5:2 G5:6 E5:2 G5:2', 'A5:4 F5:4 B5:4 G5:4', 'C6:12 -:4', 'D6:2 C6:2 B5:2 A5:2 G5:8'],
        counter: [null, null, 'C7:2 G6:2 E6:2 C6:2 G6:2 E6:2 C6:2 G5:2', null] },
      A: { bars: 8, chords: ['C', 'Am', 'F', 'G', 'C', 'Am', 'Dm|G', 'C'], drums: 'march', fill: 'fill', crash: true,
        bass: 'R...5...R...5...', pad: true,
        lead: [
          'E5:4 G5:4 C6:6 B5:2', 'A5:4 E5:4 A5:6 G5:2', 'F5:4 A5:4 C6:6 D6:2', 'B5:8 G5:8',
          'E6:4 D6:2 C6:2 G5:4 C6:4', 'C6:4 B5:2 A5:2 E5:4 A5:4', 'F5:4 A5:4 B5:4 D6:4', 'C6:8 -:8',
        ],
        counter: [null, null, null, 'D7:4 B6:4 G6:8', null, null, null, 'G6:2 C7:2 E7:4 -:8'] },
      B: { bars: 8, chords: ['F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'C'], drums: 'march', fill: 'fill', crash: true,
        bass: 'R.5.R.5.R.5.R.5.', pad: true,
        lead: [
          'A5:4 C6:4 F6:8', 'G6:4 F6:2 E6:2 D6:8', 'E6:4 D6:2 B5:2 G5:8', 'A5:4 C6:4 E6:8',
          'F6:4 E6:2 D6:2 C6:4 A5:4', 'B5:4 D6:4 G6:8', 'E6:4 G6:4 C7:8', '-:16',
        ] },
    },
    arrangement: ['intro', 'A', 'B'],
    loopFrom: 1,
  },

  // ----------------------------------------------------------------- STAR --
  star: {
    bpm: 172,
    inst: { lead: 'squareLead', arp: 'pluck', bass: 'bouncyBass', counter: 'glock' },
    mix: { lead: 1.1, arp: 0.6, bass: 1, drums: 1, counter: 0.6 },
    low: { bass: 36, arp: 64 },
    pump: 0,
    drums: {
      main: { k: FOUR, s: BACK, h: 'xxxxxxxxxxxxxxxx', o: '..x...x...x...x.' },
      fill: { k: FOUR, s: '....x.......xxxx', h: 'xxxxxxxxxxxx....' },
    },
    sections: {
      A: { bars: 4, chords: ['C', 'F', 'G', 'C'], drums: 'main', crash: true, bass: 'R.O.R.O.R.O.R.O.', arp: '0.1.2.1.0.1.2.1.',
        lead: [
          'C6:2 C6:2 C6:2 -:2 C6:2 D6:2 E6:2 C6:2',
          'F6:2 F6:2 F6:2 -:2 F6:2 E6:2 D6:2 C6:2',
          'D6:2 D6:2 D6:2 -:2 G6:2 F6:2 E6:2 D6:2',
          'E6:4 C6:4 G5:4 C6:4',
        ] },
      B: { bars: 4, chords: ['C', 'F', 'G', 'G'], drums: 'main', fill: 'fill', bass: 'R.O.R.O.R.O.R.O.', arp: '0123012301230123',
        lead: [
          'G6:2 E6:2 G6:2 E6:2 C6:2 E6:2 G6:4',
          'A6:2 F6:2 A6:2 F6:2 C6:2 F6:2 A6:4',
          'B6:2 G6:2 B6:2 G6:2 D6:2 G6:2 B6:4',
          'C7:4 B6:2 A6:2 G6:4 D6:4',
        ] },
    },
    arrangement: ['A', 'B'],
    loopFrom: 0,
  },
};

/**
 * Short one-shot musical stings (played through the same instruments).
 * notes: [stepOffset, note, steps, preset, vel]
 */
export const STINGS = {
  finalLap: {
    bpm: 150,
    length: 20, // steps
    drums: [
      [0, 'crash', 1], [0, 'kick', 1], [12, 'snare', 0.6], [13, 'snare', 0.7], [14, 'snare', 0.85], [15, 'snare', 1],
      [16, 'kick', 1.1], [16, 'crash', 1.1],
    ],
    notes: [
      [0, 'G4', 2, 'brass', 0.9], [2, 'C5', 2, 'brass', 0.95], [4, 'E5', 2, 'brass', 1], [6, 'G5', 2, 'brass', 1],
      [8, 'E5', 2, 'brass', 0.9], [10, 'G5', 2, 'brass', 1], [12, 'C6', 4, 'brass', 1.1],
      [16, 'C5', 4, 'brass', 1], [16, 'E5', 4, 'brass', 1], [16, 'G5', 4, 'brass', 1], [16, 'C6', 4, 'brass', 1.1],
      [12, 'C7', 2, 'glock', 0.8], [14, 'E7', 2, 'glock', 0.8], [16, 'G7', 4, 'glock', 0.9],
      [0, 'C3', 8, 'pickBass', 1], [8, 'G2', 4, 'pickBass', 1], [12, 'C3', 4, 'pickBass', 1], [16, 'C2', 4, 'pickBass', 1.1],
    ],
  },
  finishTop: {
    bpm: 132,
    length: 32,
    drums: [
      [0, 'crash', 1], [0, 'kick', 1], [0, 'timpani', 1],
      [4, 'snare', 0.7], [6, 'snare', 0.7], [8, 'kick', 1], [10, 'snare', 0.8], [12, 'kick', 1],
      [16, 'crash', 1.1], [16, 'kick', 1.1], [16, 'timpani', 1.1],
      [18, 'timpani', 0.6], [19, 'timpani', 0.65], [20, 'timpani', 0.7], [21, 'timpani', 0.75], [22, 'timpani', 0.8], [23, 'timpani', 0.85],
      [24, 'crash', 1.2], [24, 'kick', 1.2], [24, 'timpani', 1.2],
    ],
    notes: [
      [0, 'C5', 1, 'brass', 1], [1, 'E5', 1, 'brass', 1], [2, 'G5', 2, 'brass', 1], [4, 'C6', 4, 'brass', 1.1],
      [8, 'A5', 2, 'brass', 1], [10, 'B5', 2, 'brass', 1], [12, 'C6', 2, 'brass', 1], [14, 'D6', 2, 'brass', 1],
      [16, 'E6', 6, 'brass', 1.1], [16, 'C6', 6, 'brass', 1], [16, 'G5', 6, 'brass', 1],
      [22, 'D6', 2, 'brass', 1], [24, 'E6', 8, 'brass', 1.15], [24, 'C6', 8, 'brass', 1.05], [24, 'G5', 8, 'brass', 1], [24, 'C5', 8, 'brass', 1],
      [24, 'C7', 2, 'glock', 0.9], [26, 'G6', 2, 'glock', 0.8], [28, 'E7', 2, 'glock', 0.9], [30, 'C8', 2, 'glock', 0.7],
      [0, 'C3', 8, 'pickBass', 1], [8, 'F2', 8, 'pickBass', 1], [16, 'G2', 8, 'pickBass', 1], [24, 'C2', 8, 'pickBass', 1.1],
      [16, 'G4', 8, 'strings', 1], [16, 'B4', 8, 'strings', 1], [24, 'E4', 8, 'strings', 1], [24, 'G4', 8, 'strings', 1],
    ],
  },
  finishLow: {
    bpm: 112,
    length: 32,
    drums: [[0, 'kick', 0.8], [8, 'snare', 0.5], [16, 'kick', 0.8], [24, 'kick', 0.9], [24, 'crash', 0.6]],
    notes: [
      [0, 'G5', 2, 'epiano', 1], [2, 'E5', 2, 'epiano', 1], [4, 'C5', 4, 'epiano', 1],
      [8, 'F5', 2, 'epiano', 1], [10, 'D5', 2, 'epiano', 1], [12, 'B4', 4, 'epiano', 1],
      [16, 'E5', 2, 'epiano', 1], [18, 'D5', 2, 'epiano', 1], [20, 'G4', 4, 'epiano', 1],
      [24, 'C5', 8, 'softLead', 1], [24, 'E5', 8, 'epiano', 0.8], [24, 'G5', 8, 'epiano', 0.8],
      [0, 'C3', 8, 'warmBass', 1], [8, 'G2', 8, 'warmBass', 1], [16, 'A2', 4, 'warmBass', 1], [20, 'G2', 4, 'warmBass', 1], [24, 'C2', 8, 'warmBass', 1],
    ],
  },
};
