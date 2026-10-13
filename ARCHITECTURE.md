# TurboKart — Architecture & Module Contracts

TurboKart is an arcade kart racer in the spirit of Mario Kart, built with **Three.js r186** + **Vite**, plain
ES modules (JavaScript + JSDoc, no TypeScript). **All art and audio are procedural** — no external model,
texture or sound files. Geometry is built from Three primitives / custom BufferGeometry, textures are drawn
to `<canvas>` (CanvasTexture), audio is synthesized with the Web Audio API.

The quality bar is **"AAA-feeling arcade racer in a browser"**: juicy, polished, readable, 60 fps on a
MacBook. Every module owner is expected to go well beyond the minimum.

Original IP only: no Nintendo character names/likenesses/logos. Generic item concepts (mushroom boost,
banana, shells, star, lightning, bomb) are fine.

## Conventions

- 1 world unit = 1 metre. Y is up.
- **Kart model faces +Z in local space.** Yaw `heading` rotates about +Y; `forward = (sin h, 0, cos h)`.
- Track `right` vector = `tangent × up` (Three's `a.clone().cross(b)`). Positive `lateral` = right of the
  direction of travel. Positive `steer` = turn right (which *decreases* yaw).
- Scale: road ~22–28 m wide; lap length 900–1600 m; kart ~1.6 m wide × 2.4 m long; top speed ~30 m/s.
- Import shared things from `src/core/constants.js` (`EVENTS`, `ITEMS`, `SURFACES`, `DRIFT_LEVELS`, ...).
  Never hard-code event strings.
- Cross-module communication is via the `EventBus` (`src/core/EventBus.js`) — every system receives `bus`
  in its constructor. Do not import the singleton; use the injected one.
- Do not allocate in hot loops (reuse `Vector3`s); use `InstancedMesh` for repeated decoration.
- Every class has `dispose()` that removes its objects from the scene and frees GPU resources.
- Each module directory exposes an `index.js` barrel with exactly the exports listed below.

## Directory ownership

| Path | Owner | Contents |
|---|---|---|
| `src/core/`, `src/main.js`, `index.html` | Integrator | Game loop, state machine, RaceManager, Input, EventBus, constants |
| `src/track/` | Agent 1 — Tracks & World | Track definitions, road/terrain/scenery generation, sky, lighting |
| `src/kart/` | Agent 2 — Karts & Camera | Characters, kart models, arcade physics, kart collisions, camera |
| `src/items/`, `src/ai/` | Agent 3 — Items & AI | Item boxes, coins, all items, AI drivers |
| `src/ui/` | Agent 4 — UI | Menus, HUD, overlays, results, settings (DOM/CSS) |
| `src/audio/`, `src/fx/` | Agent 5 — Audio & VFX | Procedural music & SFX, particles, post-processing |
| `dev/<area>*.html|js` | each agent | Standalone sandboxes for testing your module |

**Never edit files outside your directories.** If you need something from another module, code against
this contract; if the contract is insufficient, make a sensible local assumption and list it in your final
report so the integrator can reconcile.

## Frame loop (owned by `src/core/Game.js`)

```
each animation frame (dt clamped to 1/20 s):
  input.update()
  if racing:
    player.controls  <- input.getKartControls()      (copied into kart.controls)
    aiDriver.update(dt, ctx) for each AI kart         (writes kart.controls)
    fixed-step loop @120 Hz (accumulator):
      kart.update(PHYSICS_DT, track)  for each kart
      resolveKartCollisions(karts, bus)
    itemSystem.update(dt, time)                       (reads kart.controls.itemPressed / .item)
    raceManager.update(dt)                            (sets kart.racePosition, lap, ...)
  kart.updateVisuals(dt, time) for each kart
  track.update(dt, time, focusPosition)
  cameraController.update(dt)
  effects.update(dt, { karts, playerKart, camera, time, state })
  audio.update(dt, { camera, playerKart, karts, state })
  ui.updateHUD(hudState)                              (racing only)
  effects.render()                                    (Effects owns the final render / post-processing)
```

Renderer (owned by Game): `WebGLRenderer({ antialias: false, powerPreference: 'high-performance' })`,
`toneMapping = ACESFilmicToneMapping`, `outputColorSpace = SRGBColorSpace`, `shadowMap.enabled = true`,
`shadowMap.type = PCFSoftShadowMap`. Camera: `PerspectiveCamera(70, aspect, 0.1, 3000)`.

---

## 1. Tracks — `src/track/index.js`

```js
export { TRACKS, CUPS, getTrackPreviewPath } from './TrackDefinitions.js';
export { Track } from './Track.js';
```

- `TRACKS`: array of `{ id, name, cupId, theme, description, laps: 3, difficulty: 1|2|3, accentColor: '#hex',
  musicTheme }` — **4 tracks**, distinct themes:
  1. `sunny-meadows` — grassy hills, trees, lake, windmills (beginner).
  2. `dune-drift` — desert canyon, mesas, cacti, sand off-road, ramp jump.
  3. `frostbite-peaks` — snowy mountain, pines, ice, tunnel/bridge, sunset/evening light.
  4. `neon-skyway` — night-sky/space rainbow road: glowing neon road, **no walls on some sections (falling
     off → respawn)**, stars, planets.
- `CUPS`: `[{ id: 'turbo', name: 'Turbo Cup', trackIds: [all 4 in order] }]`.
- `getTrackPreviewPath(trackId, count = 200) -> Array<{x, z}>` — cheap (no meshes) centerline outline for
  menus/minimap previews.
- `musicTheme` is one of `'meadow' | 'desert' | 'snow' | 'neon'` (the audio module plays matching music).

```js
class Track {
  constructor(trackId, { quality = 'high' } = {})
  async build(scene, renderer, onProgress?)   // adds everything to scene; may yield between steps
  id; name; def;                               // def = the TRACKS entry
  theme: {                                     // palette consumed by FX / Game
    skyTop, skyBottom, fogColor, fogNear, fogFar,  // numbers (hex)
    dustColor, offroadColor, sparkTint,            // numbers (hex)
    isNight: boolean,
  };
  length: number;                              // centerline length (m)
  samples: TrackSample[];                      // ~1 m spacing, closed loop, samples[0] = start/finish line
  queryPosition(position: Vector3, hintIndex?: number, out?: TrackQuery): TrackQuery
  getFrameAtDistance(distance, lateral = 0, out?): { position, tangent, right, up, distance }  // interpolated, wraps
  getStartGrid(count): Array<{ position: Vector3, heading: number, distance: number }>
  itemBoxPositions: Vector3[];                 // centre of each item box (~1.3 m above road), rows across road
  coinPositions: Vector3[];                    // ~1.0 m above road
  boostPads: Array<{ position, tangent, width, length, distance }>
  ramps: Array<{ distance, position, tangent }>
  obstacles: Array<{ position: Vector3, radius: number }>  // static cylinders karts/items collide with
  sunLight: THREE.DirectionalLight;            // casts shadows; shadow frustum follows focus
  minimap: { path: Array<{x,z}>, bounds: { minX, maxX, minZ, maxZ } }
  update(dt, time, focusPosition)              // animations + move shadow camera with focus
  dispose()
}

TrackSample = { index, distance, position: Vector3 /*road centre surface*/, tangent, right, up,
                halfWidth, wallOffset /* number | null — null = no barrier, falling possible */,
                curvature /* signed 1/m, + = turning right */, bank /* radians */ }

TrackQuery = {
  index,                // nearest sample index — pass back as hintIndex next frame
  distance, progress,   // along centerline [0,length) and [0,1)
  lateral,              // signed offset from centre (+ right)
  center, tangent, right, up,   // Vector3 (copies, safe to read)
  halfWidth, wallOffset,
  groundHeight,         // world Y of the drivable surface directly under `position`
  groundNormal,         // Vector3
  surface,              // SURFACES.ROAD | OFFROAD | BOOST | RAMP | VOID
  rampBoost,            // upward launch speed (m/s) when surface === RAMP, else 0
}
```

Rules:
- Between `±halfWidth` → road (or `boost`/`ramp` where pads/ramps are). Between `halfWidth` and
  `wallOffset` → `offroad` (grass/sand/snow — slow). Beyond `wallOffset` the kart is pushed back by the kart
  physics (barrier). Where `wallOffset === null`, beyond `halfWidth + 1` → `void` (kart falls and respawns).
- `queryPosition` must be fast (called ~1000×/s): local search around `hintIndex` (±40 samples), full
  search only if no hint. Must be robust at sharp corners. Tracks must **not** self-overlap in XZ (bridges
  over other parts of the track are not allowed — elevation changes, hills, banking, tunnels are fine).
- Visible geometry must match the query (road mesh at `groundHeight`, off-road strip continuous with the
  road edge, barriers drawn at `wallOffset`).
- Start/finish gantry with checkered line at distance 0. Grid: 2 karts per row, staggered, rows ~6 m apart,
  all behind the line, facing the tangent. Pole position is slot 0.

## 2. Karts — `src/kart/index.js`

```js
export { CHARACTERS } from './characters.js';
export { Kart } from './Kart.js';
export { createKartModel } from './KartModel.js';       // (character) -> THREE.Group (menu showroom)
export { resolveKartCollisions } from './collisions.js'; // (karts, bus) — kart↔kart bumps (weight-based)
export { CameraController } from './CameraController.js';
```

- `CHARACTERS`: **8 original characters** `{ id, name, tagline, weightClass: 'light'|'medium'|'heavy',
  stats: { speed, accel, handling, weight, offroad } /* 1..5 for display */, colors: { primary, secondary,
  accent, skin } /* hex numbers */, cssColor: '#hex' }`. Each must look distinct (body shape, helmet/hat,
  ears, kart style).

```js
class Kart {
  constructor({ character, index, isPlayer = false, bus, engineClass = 150 })
  // identity
  index; character; name; isPlayer; isAI /* = !isPlayer */;
  mesh: THREE.Group;                     // add to scene; transform updated by update()
  anchors: { exhaustL, exhaustR, wheelFL, wheelFR, wheelRL, wheelRR, itemHold, body }  // Object3D children
  // physics state (read by everyone, written only by Kart)
  position: Vector3;                     // ground-contact point (bottom centre)
  velocity: Vector3; heading: number; quaternion: Quaternion;
  forward: Vector3; up: Vector3;         // world-space unit vectors
  speed: number;                         // signed forward speed m/s
  maxSpeed: number;                      // current effective top speed
  radius: number;                        // collision radius (~1.25, smaller when shrunk)
  weight: number;                        // collision mass factor
  isAirborne: boolean; surface: string;
  isDrifting; driftDirection /* -1|1 */; driftLevel /* 0..3 */; driftCharge /* seconds */;
  boostTimer; get isBoosting();
  starTimer; get isInvincible();         // star OR post-respawn ghost
  spinoutTimer; get isSpunOut();         // spinning or tumbling (no control)
  shrinkTimer; get isShrunk();
  coins: number;                          // 0..MAX_COINS, each = +1% top speed
  speedScale: number = 1;                 // external multiplier (AI rubber-banding)
  trackInfo: TrackQuery; trackHint: number; lastSafeDistance: number;
  frozen: boolean;                        // true during intro/countdown (no movement)
  controls: { throttle, brake, steer, drift, item, itemPressed, lookBack };
  // race state (written by RaceManager, read by others)
  racePosition = 1; lap = 0; finished = false; finishTime = null; raceDistance = 0;

  update(dt, track)                       // ONE fixed physics step
  updateVisuals(dt, time)                 // per rendered frame: wheels, lean, squash, star rainbow, ghost
  placeAtStart({ position, heading })     // resets all state
  applyBoost(duration, power = 1, source = 'mushroom')
  spinOut(cause = 'banana', duration = 1.1)     // ignored if invincible
  launch(cause = 'bomb')                  // tumble ~1.6 s (spiny shell / bomb)
  shrink(duration = 6)                    // lightning
  startStar(duration = 7.5)
  addCoins(n) / loseCoins(n)              // emit COIN_* is ItemSystem's job; these just change state
  respawn(track)                          // "lakitu": lift back to lastSafeDistance, 1.5 s ghost
  onCountdown(count)                      // 3,2,1 — tracks throttle timing for rocket start
  onRaceStart()                           // GO: start boost if timed right, stall if too early
  dispose()
}
```

Physics feel (arcade, not sim): snappy accel, strong grip, no understeer at normal speeds. Hop on drift
press; holding drift + steer on landing starts a drift; mini-turbo tiers per `DRIFT_LEVELS` (charge faster
when steering into the drift). Boost raises top speed ~35% and accel strongly; boost pads give 1 s boost;
off-road caps speed ~55% unless boosting/star. Ramps launch the kart; pressing drift near a ramp lip does
a trick (`KART_TRICK`) and gives a small boost on landing. Walls deflect along the wall and scrub speed
(not a dead stop). Gravity `GRAVITY`; snap to ground when close; align body to `groundNormal` smoothly.
`VOID` → `KART_FALL` then auto `respawn()` ~1.2 s later. Rocket start: throttle pressed just after "2"
→ boost at GO; pressed before "2" → stall (`KART_START_STALL`).

`CameraController(camera, { bus })` — `setTarget(kart)`, `setTrack(track)`, `setMode('chase'|'intro'|
'finish'|'orbit')`, `update(dt)`, `shake(intensity, duration)`, `snap()` (teleport, no smoothing).
Chase cam: smoothed follow behind/above, looks slightly ahead, FOV widens with speed and boost, slight
roll/offset when drifting, `controls.lookBack` flips view. Intro: ~4 s sweeping flyover of the track ending
behind the target. Finish: slow orbit around target. Subscribes to bus to shake on hits of its target.

## 3. Items & AI — `src/items/index.js`, `src/ai/index.js`

```js
export { ItemSystem } from './ItemSystem.js';
export { rollItem } from './distribution.js';  // (racePosition, racerCount, ctx) -> ITEMS.*
export { AIDriver } from './AIDriver.js';      // from src/ai/index.js
```

```js
class ItemSystem {
  constructor({ scene, track, karts, bus, mode })   // mode: GAME_MODES.* (time trial = 3 mushrooms, no boxes)
  build()                     // item boxes (spinning rainbow "?" cubes) + coins at track positions
  update(dt, time)            // pickups, roulette (~2.5 s, position-weighted), use on controls.itemPressed,
                              // projectiles, trailing held items, kart hits, box respawn (~3 s)
  getItemState(kart) -> { type: string|null, count: number, roulette: boolean }
  giveItem(kart, type)        // debugging / time trial
  getThreats(kart) -> Array<{ type, position, velocity, target }>   // incoming projectiles (AI)
  getHazards() -> Array<{ type, position, radius }>                 // bananas, bombs on track (AI)
  getMinimapMarkers() -> Array<{ x, z, type }>
  reset()                     // clear all items, restore boxes (race restart)
  dispose()
}
```

Item behaviours: mushroom (boost 1.2 s), triple mushroom, golden mushroom (unlimited for 7.5 s), banana
(hold `controls.item` to drag behind as a shield; release/press to drop; press with throttle+up direction
logic optional: throw forward), triple banana (orbit/trail), green shell (straight, bounces off walls ~5
times, ~8 s life), triple green (orbit around kart), red shell (homes on kart ahead along the track),
triple red, spiny shell (flies along track to 1st place, explodes → `launch`), star (`startStar`),
lightning (all other karts `shrink` + `spinOut` + lose item), bomb (thrown forward, explodes after 3 s or on
contact, radius ~7 m → `launch`), coin (+2 coins). Hit kart loses 3 coins. Held trailing banana/shell
blocks one hit from behind. Items collide with `track.obstacles` and walls (`wallOffset`). Distribution
heavily favours defensive items for leaders and powerful catch-up items for back markers.

```js
class AIDriver {
  constructor(kart, { track, itemSystem, skill /* 0..1 */, bus, personality? })
  update(dt, { karts, playerKart })   // writes kart.controls once per frame
}
```
AI: follow a racing line computed from `track.samples` (curvature-aware, cut corners within road), look-ahead
steering, brake for sharp turns, drift on long corners to earn mini-turbos, use boost pads, avoid hazards,
use items intelligently (fire shells at karts ahead, drop bananas when someone is behind, hold defensive
items), recover after hits/walls, stay off off-road. Distinct per-kart personalities (aggression, line
offset, mistakes). Rubber-banding via `kart.speedScale` (behind player → up to ~1.12, far ahead → ~0.92),
scaled by `skill`. Must also work when every kart is AI (menu attract mode).

## 4. UI — `src/ui/index.js`

```js
export { UI } from './UI.js';
```

```js
class UI {
  constructor(root /* #ui-root */, { bus, characters, tracks, cups, getTrackPreviewPath, settings })
  // screens (UI owns the menu flow internally; it emits UI_* events)
  showTitle()                 // splash: logo + "Press Enter / A"
  showMainMenu()              // Grand Prix / VS Race / Time Trial / Settings
  showLoading(progress, label) / hideLoading()
  showHUD({ mode, totalLaps, racerCount, trackName, playerCharacter }) / hideHUD()
  updateHUD(hud)              // every frame while racing (must be cheap: only touch DOM on change)
  showPause() / hidePause()
  showResults(results)
  hideAll()
  setFps(fps)
  get isMenuOpen()
}
```

Menu flow: Title → Main Menu → (mode) → Engine class (50/100/150/200cc) → Character Select → Track Select
(VS / Time Trial) or Cup Select (GP) → emit `UI_START_RACE { mode, engineClass, characterId, trackId, cupId }`.
UI emits `UI_SCREEN { screen }` on every screen change ('title','main','engine','character','track','cup',
'settings','loading','hud','pause','results') and `UI_PREVIEW_CHARACTER { characterId }` whenever the
highlighted character changes, `UI_PREVIEW_TRACK { trackId }` likewise. **On the character screen keep the
right ~55% of the viewport transparent** — Game renders the selected kart on a 3D turntable there. All
other menu screens use semi-transparent panels over the live 3D attract-mode background.
Navigation: mouse + `EVENTS.INPUT_MENU` actions (Input emits these for keyboard & gamepad — do not add your
own keydown listeners for navigation). Emit `UI_NAVIGATE` / `UI_CONFIRM` / `UI_BACK` for menu sounds.
Settings screen edits `DEFAULT_SETTINGS` fields, persists to `localStorage[SETTINGS_STORAGE_KEY]`, emits
`UI_SETTINGS { settings }`.

`hud` passed to `updateHUD`:
```js
{ position, racerCount, lap, totalLaps, raceTime, lapTime, bestLap, lastLapTime,
  speed /* display units */, coins, driftLevel, boosting,
  item: { type, count, roulette }, mode,
  minimap: { path, bounds, karts: [{ x, z, heading, color /* css */, isPlayer, position }],
             markers: [{ x, z, type }] },
  wrongWay, finished }
```
UI subscribes to bus for transient overlays: `RACE_COUNTDOWN` (big 3-2-1-GO!), `RACE_LAP` (player only:
"LAP 2/3", "FINAL LAP!"), `RACE_FINISH` (player: "FINISH!" + position), `RACE_POSITION_CHANGE` (player:
animate position badge), `ITEM_ROULETTE_*`, `ITEM_SPINY_WARNING` (target is player → warning), etc.
Pause screen: Resume / Restart / Quit → `UI_RESUME` / `UI_RESTART` / `UI_QUIT`.
Results payload:
```js
{ mode, trackName, cupName, raceIndex, raceCount, gpComplete,
  standings: [{ position, name, characterId, cssColor, isPlayer, finishTime, bestLap, points, totalPoints }],
  timeTrial: { time, bestLap, lapTimes, isRecord, previousRecord } | null }
```
Results buttons: GP → "Next Race" (`UI_NEXT_RACE`) or, when `gpComplete`, trophy ceremony then "Main Menu"
(`UI_QUIT`); VS/TT → "Retry" (`UI_RESTART`) / "Main Menu" (`UI_QUIT`).

## 5. Audio & VFX — `src/audio/index.js`, `src/fx/index.js`

```js
export { AudioEngine } from './AudioEngine.js';
export { Effects } from './Effects.js';
```

```js
class AudioEngine {
  constructor({ bus, settings })
  unlock()                    // resume AudioContext (Game calls on first user gesture)
  setVolumes({ masterVolume, musicVolume, sfxVolume })
  playMusic(id, { fade = 1 })  // 'title' | 'menu' | 'results' | 'victory' | 'meadow' | 'desert' | 'snow' | 'neon'
  stopMusic(fade = 1)
  setFinalLap(on)             // tempo/pitch up like the classic final lap
  play(name, opts?)           // one-shot SFX by name (also used internally)
  update(dt, { camera, playerKart, karts, state })  // engines, skids, spatial
  dispose()
}
```
Everything synthesized. Subscribes to the bus for all SFX (countdown beeps, lap/final-lap jingle, finish
fanfare, hops, drift skid loop, mini-turbo pops by level, boosts, item box, roulette ticks, item use, shell
fire/bounce, hits, explosions, coins, star (music overlay), lightning, wall hits, bumps, UI navigate/
confirm/back, position change). Player engine is rich (pitch from speed, layered), AI engines spatialized
and quieter (limit to nearest 3–4).

```js
class Effects {
  constructor({ renderer, scene, camera, bus, quality })
  setTrack(track)             // theme palette for dust/snow/sand
  setCamera(camera)
  update(dt, { karts, playerKart, camera, time, state })
  render()                    // final frame incl. post-processing (composer); Game never calls renderer.render
  setSize(width, height, pixelRatio)
  setQuality(quality)         // 'low' | 'medium' | 'high'
  clear()                     // remove all live particles
  dispose()
}
```
Particles (pooled, instanced/points): drift sparks at rear wheels coloured by `driftLevel`, mini-turbo
burst, boost exhaust flames, off-road dust kicked by wheels (theme colour), landing puffs, wall-hit sparks,
item-box shatter, explosions, hit stars, star sparkle trail, coin sparkle, confetti at player finish.
Post: bloom, vignette, subtle chromatic aberration + radial speed-blur/speed-lines while the player
boosts, FXAA/SMAA, quality-scaled.

---

## Shared dev server & screenshots

A Vite dev server runs at **http://127.0.0.1:5173** (serves the whole repo with HMR). Put sandboxes in
`dev/` (e.g. `dev/track.html` → http://127.0.0.1:5173/dev/track.html). Capture what your sandbox renders:

```
tools/screenshot.sh http://127.0.0.1:5173/dev/track.html /path/to/out.png 1280 720 6000
```
It prints browser console errors. Open the PNG with the Read tool to look at it. Use query params in your
sandbox URL to select camera angles / tracks / states so you can inspect several views. Headless Chrome
uses software WebGL, so it is slow — fps there means nothing.
Do **not** run `npx vite build` (agents share the repo; the integrator runs builds). Syntax-check with
`node --check <file>` and rely on the sandbox console log for import/runtime errors. Do not start
another dev server or kill the shared one.
