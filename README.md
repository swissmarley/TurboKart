# TurboKart

An arcade kart racer in the spirit of Mario Kart, built with **Three.js r186** + **Vite**.
All art, music and sound effects are generated procedurally in code — there are no asset files.

**▶ Play in your browser: https://swissmarley.github.io/TurboKart/**
(desktop browser with keyboard or gamepad recommended)

## Run

```bash
npm install
npm run dev        # http://127.0.0.1:5173
npm run build      # production build in dist/
```

Every push to `main` builds the game and deploys it to GitHub Pages via `.github/workflows/deploy.yml`.

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Accelerate | W / ↑ | A or RT |
| Brake / reverse | S / ↓ | B or LT |
| Steer | A D / ← → | Left stick / D-pad |
| Hop & drift (hold) | Space / Shift | RB |
| Use item (hold to drag bananas/shells) | E / X / F | LB or Y |
| Look back | C / Q | X |
| Pause | Esc / P | Start |

Tips: hold drift through a corner until the sparks turn blue → orange → purple, then release for a mini-turbo.
Press accelerate just as the "2" disappears in the countdown for a rocket start. Press drift off a ramp for a trick boost.

## Content

- **Modes:** Grand Prix (4-race Turbo Cup with points and trophy ceremony), VS Race, Time Trial (records saved locally).
- **Engine classes:** 50cc, 100cc, 150cc, 200cc.
- **Tracks:** Sunny Meadows, Dune Drift, Frostbite Peaks, Neon Skyway.
- **Racers:** Ember, Mochi, Pebble, Maple, Jett, Torque, Rumble, Bruno — light / medium / heavy classes with distinct stats.
- **Items:** mushroom, triple & golden mushroom, banana & triple banana, green / red shells (single & triple),
  spiny shell, star, lightning, bomb, coins.

## Project layout

See [ARCHITECTURE.md](ARCHITECTURE.md) for the module contracts.

| Path | Contents |
|---|---|
| `src/core/` | Game loop & state machine, race manager, input, showroom, constants |
| `src/track/` | Track layouts, road/terrain/scenery generation, sky & lighting |
| `src/kart/` | Characters, kart models, arcade physics, collisions, camera |
| `src/items/`, `src/ai/` | Item boxes, coins, items; AI drivers & racing line |
| `src/ui/` | Menus, HUD, minimap, results (DOM/CSS) |
| `src/audio/`, `src/fx/` | Synthesized music/SFX; particles & post-processing |
| `dev/` | Standalone sandboxes for each module |

## Debug URL flags

`?quick=1&mode=vs|grandprix|timetrial&track=<id>&char=<id>&cc=150` jumps straight into a race.
Add `skipintro=1`, `autopilot=1` (AI drives you), `warp=<seconds>` (fast-forward after GO), `nopause=1`.
