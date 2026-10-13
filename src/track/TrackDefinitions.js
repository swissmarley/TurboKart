/**
 * Static track catalogue + cheap preview outlines (no meshes).
 */
import { LAYOUTS } from './layouts.js';
import { compileLayout } from './layoutCompiler.js';
import { TrackPath } from './TrackPath.js';

export const TRACKS = [
  {
    id: 'sunny-meadows',
    name: 'Sunny Meadows',
    cupId: 'turbo',
    theme: 'meadow',
    description: 'Rolling green hills, windmills and a sparkling lake. Sweeping corners and one cheeky hairpin.',
    laps: 3,
    difficulty: 1,
    accentColor: '#5fd34a',
    musicTheme: 'meadow',
  },
  {
    id: 'dune-drift',
    name: 'Dune Drift',
    cupId: 'turbo',
    theme: 'desert',
    description: 'Blast through a red-rock canyon: a huge drift sweeper, a big ramp jump and a tunnel through the mesa.',
    laps: 3,
    difficulty: 2,
    accentColor: '#ffad33',
    musicTheme: 'desert',
  },
  {
    id: 'frostbite-peaks',
    name: 'Frostbite Peaks',
    cupId: 'turbo',
    theme: 'snow',
    description: 'A sunset mountain pass: steep climbs, banked turns, a timber bridge and icy lakeside esses.',
    laps: 3,
    difficulty: 2,
    accentColor: '#7fd6ff',
    musicTheme: 'snow',
  },
  {
    id: 'neon-skyway',
    name: 'Neon Skyway',
    cupId: 'turbo',
    theme: 'neon',
    description: 'A glowing ribbon among the stars. A climbing spiral, a plunging drop and sections with no rails at all.',
    laps: 3,
    difficulty: 3,
    accentColor: '#ff3fd8',
    musicTheme: 'neon',
  },
];

export const CUPS = [{ id: 'turbo', name: 'Turbo Cup', trackIds: TRACKS.map((t) => t.id) }];

const compiledCache = new Map();
const pathCache = new Map();

/** Compiled layout (cached). */
export function getCompiledLayout(trackId) {
  let c = compiledCache.get(trackId);
  if (!c) {
    const def = LAYOUTS[trackId];
    if (!def) throw new Error(`Unknown track "${trackId}"`);
    c = compileLayout(def);
    compiledCache.set(trackId, c);
  }
  return c;
}

/** Shared read-only TrackPath for previews (cached). */
export function getTrackPathCached(trackId) {
  let p = pathCache.get(trackId);
  if (!p) {
    p = new TrackPath(getCompiledLayout(trackId));
    pathCache.set(trackId, p);
  }
  return p;
}

/**
 * Cheap centreline outline for menus/minimap previews (math only, no meshes).
 * @returns {Array<{x:number,z:number}>}
 */
export function getTrackPreviewPath(trackId, count = 200) {
  return getTrackPathCached(trackId).outline(count);
}
