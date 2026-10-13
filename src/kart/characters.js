/**
 * The TurboKart roster — 8 original characters.
 *
 * Contract fields (ARCHITECTURE.md §2):
 *   { id, name, tagline, weightClass, stats: { speed, accel, handling, weight, offroad } (1..5),
 *     colors: { primary, secondary, accent, skin }, cssColor }
 *
 * Extra fields (used by the kart builder / physics, safe for others to read):
 *   number   — racing number painted on the plates
 *   species  — selects the driver head/body builder in KartModel.js
 *   kartStyle — selects the kart body style ('racer' | 'bubble' | 'buggy' | 'muscle' | 'mech')
 *   eyeColor, suitColor, gloveColor — extra palette entries for the driver
 *   description — one-line flavour text for menus
 */

/** @typedef {{speed:number, accel:number, handling:number, weight:number, offroad:number}} Stats */

export const CHARACTERS = [
  {
    id: 'ember',
    name: 'Ember',
    tagline: 'Quick paws, quicker wits.',
    description: 'A goggle-wearing fox mechanic who tunes her kart between laps.',
    weightClass: 'light',
    species: 'fox',
    kartStyle: 'racer',
    number: 7,
    stats: { speed: 3, accel: 4, handling: 4, weight: 2, offroad: 2 },
    colors: { primary: 0xff6a13, secondary: 0x1d2742, accent: 0x22d6c0, skin: 0xf07b24 },
    eyeColor: 0x2a7a3a,
    suitColor: 0x1d2742,
    gloveColor: 0xffffff,
    cssColor: '#ff7a1a',
  },
  {
    id: 'mochi',
    name: 'Mochi',
    tagline: 'Cute, cuddly, and coming through!',
    description: 'A bubbly bunny whose tiny kart corners like it is on rails.',
    weightClass: 'light',
    species: 'bunny',
    kartStyle: 'bubble',
    number: 3,
    stats: { speed: 2, accel: 5, handling: 5, weight: 1, offroad: 3 },
    colors: { primary: 0xff7fbf, secondary: 0xfff3fa, accent: 0x8f6bff, skin: 0xfff6fb },
    eyeColor: 0x6a3fd6,
    suitColor: 0x8f6bff,
    gloveColor: 0xffffff,
    cssColor: '#ff8fc8',
  },
  {
    id: 'pebble',
    name: 'Pebble',
    tagline: 'Slides into first place.',
    description: 'A chilled-out penguin who learned to drift on frozen lakes.',
    weightClass: 'light',
    species: 'penguin',
    kartStyle: 'bubble',
    number: 12,
    stats: { speed: 2, accel: 5, handling: 4, weight: 1, offroad: 4 },
    colors: { primary: 0x2f86ff, secondary: 0xeaf6ff, accent: 0xffa21a, skin: 0x1a2236 },
    eyeColor: 0x1d2a5a,
    suitColor: 0x1a2236,
    gloveColor: 0x1a2236,
    cssColor: '#3d8bff',
  },
  {
    id: 'maple',
    name: 'Maple',
    tagline: 'Forest trails are my fast lane.',
    description: 'A red panda ranger whose buggy laughs at mud, sand and snow.',
    weightClass: 'medium',
    species: 'redpanda',
    kartStyle: 'buggy',
    number: 21,
    stats: { speed: 3, accel: 3, handling: 3, weight: 3, offroad: 5 },
    colors: { primary: 0x34a853, secondary: 0xf4e4c1, accent: 0xffc93a, skin: 0xc4492a },
    eyeColor: 0x4a2a14,
    suitColor: 0x2d6b3c,
    gloveColor: 0x3a2418,
    cssColor: '#3fae5a',
  },
  {
    id: 'jett',
    name: 'Jett',
    tagline: 'Born on the starting line.',
    description: 'A rookie champion with a lucky helmet and a need for speed.',
    weightClass: 'medium',
    species: 'human',
    kartStyle: 'racer',
    number: 1,
    stats: { speed: 4, accel: 3, handling: 3, weight: 3, offroad: 2 },
    colors: { primary: 0xe3192b, secondary: 0xf7f7f7, accent: 0xffd200, skin: 0xf1c09a },
    eyeColor: 0x3b2a1e,
    suitColor: 0xe3192b,
    gloveColor: 0x222222,
    cssColor: '#e8262b',
  },
  {
    id: 'torque',
    name: 'Torque',
    tagline: 'Precision-engineered. Zero chill.',
    description: 'A heavyweight racing robot running on pure overclocked enthusiasm.',
    weightClass: 'heavy',
    species: 'robot',
    kartStyle: 'mech',
    number: 99,
    stats: { speed: 4, accel: 2, handling: 3, weight: 5, offroad: 2 },
    colors: { primary: 0x12c6dc, secondary: 0x5d6a7d, accent: 0xffb21a, skin: 0xc5d0dc },
    eyeColor: 0x3ff6ff,
    suitColor: 0x8a97a8,
    gloveColor: 0x3a4250,
    cssColor: '#22d3e6',
  },
  {
    id: 'rumble',
    name: 'Rumble',
    tagline: 'Big teeth. Bigger engine.',
    description: 'A grinning dinosaur who treats every bump as a love tap.',
    weightClass: 'heavy',
    species: 'dino',
    kartStyle: 'muscle',
    number: 65,
    stats: { speed: 5, accel: 2, handling: 2, weight: 4, offroad: 3 },
    colors: { primary: 0x8b4dff, secondary: 0x241a3a, accent: 0xffd23f, skin: 0x5cc84a },
    eyeColor: 0x7a3a10,
    suitColor: 0x5cc84a,
    gloveColor: 0x5cc84a,
    cssColor: '#8b5cf6',
  },
  {
    id: 'bruno',
    name: 'Bruno',
    tagline: 'Built like a brick, drives like a rocket.',
    description: 'A gruff bulldog biker with a heart of gold and a lead foot.',
    weightClass: 'heavy',
    species: 'bulldog',
    kartStyle: 'muscle',
    number: 88,
    stats: { speed: 5, accel: 1, handling: 2, weight: 5, offroad: 3 },
    colors: { primary: 0xffb400, secondary: 0x1c1d24, accent: 0xe8322e, skin: 0xcf9460 },
    eyeColor: 0x2b1a10,
    suitColor: 0x2a2b33,
    gloveColor: 0x2a2b33,
    cssColor: '#f5b400',
  },
];

/** Lookup helper (not part of the barrel; import from this file if needed). */
export function getCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
}
