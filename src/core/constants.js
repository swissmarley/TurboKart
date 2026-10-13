/**
 * Shared constants for every TurboKart system. Import from here instead of
 * hard-coding strings so modules written by different people stay in sync.
 * World units are metres. Kart model faces +Z in local space.
 */

export const GAME_TITLE = 'TurboKart';
export const RACER_COUNT = 8;
export const DEFAULT_LAPS = 3;
export const PHYSICS_HZ = 120;
export const PHYSICS_DT = 1 / PHYSICS_HZ;
export const GRAVITY = 32; // arcade gravity (m/s^2), snappier than 9.81

/** Base top speed (m/s) of a medium-weight kart at 150cc before character stats. */
export const BASE_MAX_SPEED = 30;
/** Multiply m/s by this to show the HUD speedometer value. */
export const SPEED_DISPLAY_FACTOR = 3.6;

export const ENGINE_CLASSES = {
  50: { id: 50, label: '50cc', speedMul: 0.78, accelMul: 0.9, aiSkill: 0.55 },
  100: { id: 100, label: '100cc', speedMul: 0.89, accelMul: 0.95, aiSkill: 0.75 },
  150: { id: 150, label: '150cc', speedMul: 1.0, accelMul: 1.0, aiSkill: 0.9 },
  200: { id: 200, label: '200cc', speedMul: 1.18, accelMul: 1.08, aiSkill: 1.0 },
};

export const GAME_MODES = {
  GRAND_PRIX: 'grandprix',
  VS: 'vs',
  TIME_TRIAL: 'timetrial',
};

/** Grand Prix points by finishing position (index 0 = 1st). */
export const GP_POINTS = [15, 12, 10, 8, 6, 4, 2, 1];

export const MAX_COINS = 10;
/** Each coin adds this fraction to top speed (10 coins = +10%). */
export const COIN_SPEED_BONUS = 0.01;

/** Mini-turbo tiers produced by drifting. */
export const DRIFT_LEVELS = [
  { level: 0, name: 'none', color: 0xffffff, chargeTime: 0, boostTime: 0 },
  { level: 1, name: 'blue', color: 0x3fb4ff, chargeTime: 0.9, boostTime: 0.55 },
  { level: 2, name: 'orange', color: 0xff8a1f, chargeTime: 2.0, boostTime: 1.0 },
  { level: 3, name: 'purple', color: 0xc45bff, chargeTime: 3.3, boostTime: 1.5 },
];

export const SURFACES = {
  ROAD: 'road',
  OFFROAD: 'offroad',
  BOOST: 'boost',
  RAMP: 'ramp',
  VOID: 'void',
};

export const ITEMS = {
  MUSHROOM: 'mushroom',
  TRIPLE_MUSHROOM: 'triple_mushroom',
  GOLDEN_MUSHROOM: 'golden_mushroom',
  BANANA: 'banana',
  TRIPLE_BANANA: 'triple_banana',
  GREEN_SHELL: 'green_shell',
  TRIPLE_GREEN_SHELL: 'triple_green_shell',
  RED_SHELL: 'red_shell',
  TRIPLE_RED_SHELL: 'triple_red_shell',
  SPINY_SHELL: 'spiny_shell',
  STAR: 'star',
  LIGHTNING: 'lightning',
  BOMB: 'bomb',
  COIN: 'coin',
};

/** Display metadata for items (HUD icons are drawn by the UI from `type`). */
export const ITEM_INFO = {
  [ITEMS.MUSHROOM]: { name: 'Turbo Mushroom', uses: 1, color: '#ff4040' },
  [ITEMS.TRIPLE_MUSHROOM]: { name: 'Triple Mushrooms', uses: 3, color: '#ff4040' },
  [ITEMS.GOLDEN_MUSHROOM]: { name: 'Golden Mushroom', uses: Infinity, duration: 7.5, color: '#ffc928' },
  [ITEMS.BANANA]: { name: 'Banana', uses: 1, color: '#ffe14a' },
  [ITEMS.TRIPLE_BANANA]: { name: 'Triple Bananas', uses: 3, color: '#ffe14a' },
  [ITEMS.GREEN_SHELL]: { name: 'Green Shell', uses: 1, color: '#2fd85a' },
  [ITEMS.TRIPLE_GREEN_SHELL]: { name: 'Triple Green Shells', uses: 3, color: '#2fd85a' },
  [ITEMS.RED_SHELL]: { name: 'Red Shell', uses: 1, color: '#ff2d2d' },
  [ITEMS.TRIPLE_RED_SHELL]: { name: 'Triple Red Shells', uses: 3, color: '#ff2d2d' },
  [ITEMS.SPINY_SHELL]: { name: 'Spiny Shell', uses: 1, color: '#2f7bff' },
  [ITEMS.STAR]: { name: 'Super Star', uses: 1, duration: 7.5, color: '#ffe600' },
  [ITEMS.LIGHTNING]: { name: 'Lightning', uses: 1, color: '#ffd700' },
  [ITEMS.BOMB]: { name: 'Bob-Bomb', uses: 1, color: '#222222' },
  [ITEMS.COIN]: { name: 'Coin', uses: 1, color: '#ffcc00' },
};

export const GAME_STATES = {
  BOOT: 'boot',
  MENU: 'menu',
  LOADING: 'loading',
  INTRO: 'intro',
  COUNTDOWN: 'countdown',
  RACING: 'racing',
  PAUSED: 'paused',
  FINISHED: 'finished',
  RESULTS: 'results',
};

export const QUALITY_LEVELS = ['low', 'medium', 'high'];

export const DEFAULT_SETTINGS = {
  masterVolume: 0.8,
  musicVolume: 0.55,
  sfxVolume: 0.9,
  quality: 'high',
  showFps: false,
  cameraShake: true,
  engineClass: 150,
};

export const SETTINGS_STORAGE_KEY = 'turbokart.settings';
export const RECORDS_STORAGE_KEY = 'turbokart.records';

/**
 * Every event that crosses module boundaries. Payload shapes are documented
 * in ARCHITECTURE.md. Always use these constants, never raw strings.
 */
export const EVENTS = {
  // --- Game / race flow (Game + RaceManager) ---
  GAME_STATE: 'game:state', // { state, previous }
  RACE_LOADING: 'race:loading', // { progress, label }
  RACE_INTRO: 'race:intro', // { track }
  RACE_COUNTDOWN: 'race:countdown', // { count } 3,2,1 then 0 === GO
  RACE_START: 'race:start', // {}
  RACE_LAP: 'race:lap', // { kart, lap, totalLaps, isFinalLap, lapTime }
  RACE_FINAL_LAP: 'race:final-lap', // { kart } (player only)
  RACE_POSITION_CHANGE: 'race:position', // { kart, from, to }
  RACE_FINISH: 'race:finish', // { kart, position, time }
  RACE_ALL_FINISHED: 'race:all-finished', // { standings }
  RACE_WRONG_WAY: 'race:wrong-way', // { kart, wrongWay }

  // --- Kart (Kart) ---
  KART_HOP: 'kart:hop', // { kart }
  KART_DRIFT_START: 'kart:drift-start', // { kart, direction }
  KART_DRIFT_LEVEL: 'kart:drift-level', // { kart, level } 1 blue, 2 orange, 3 purple
  KART_DRIFT_END: 'kart:drift-end', // { kart, level } level 0 = no mini-turbo
  KART_BOOST: 'kart:boost', // { kart, source, duration, power }
  KART_LAND: 'kart:land', // { kart, impact }
  KART_TRICK: 'kart:trick', // { kart }
  KART_WALL_HIT: 'kart:wall-hit', // { kart, impact, point }
  KART_BUMP: 'kart:bump', // { kartA, kartB, impact, point }
  KART_SPINOUT: 'kart:spinout', // { kart, cause }
  KART_LAUNCHED: 'kart:launched', // { kart, cause }
  KART_SHRINK: 'kart:shrink', // { kart, duration }
  KART_STAR_START: 'kart:star-start', // { kart, duration }
  KART_STAR_END: 'kart:star-end', // { kart }
  KART_FALL: 'kart:fall', // { kart }
  KART_RESPAWN: 'kart:respawn', // { kart }
  KART_START_STALL: 'kart:start-stall', // { kart }
  KART_SURFACE: 'kart:surface', // { kart, surface, previous }

  // --- Items (ItemSystem) ---
  ITEM_BOX_HIT: 'item:box-hit', // { kart, position }
  ITEM_ROULETTE_START: 'item:roulette-start', // { kart }
  ITEM_ROULETTE_STOP: 'item:roulette-stop', // { kart, type }
  ITEM_USE: 'item:use', // { kart, type, position }
  ITEM_HIT: 'item:hit', // { kart, type, attacker, position }
  ITEM_BLOCKED: 'item:blocked', // { kart, type, position }
  ITEM_DESTROYED: 'item:destroyed', // { type, position }
  ITEM_EXPLOSION: 'item:explosion', // { position, radius, type }
  ITEM_SHELL_BOUNCE: 'item:shell-bounce', // { position }
  ITEM_LIGHTNING: 'item:lightning', // { kart }
  ITEM_SPINY_WARNING: 'item:spiny-warning', // { target }
  COIN_PICKUP: 'coin:pickup', // { kart, coins, position }
  COIN_LOST: 'coin:lost', // { kart, amount, position }

  // --- UI (UI) ---
  UI_START_RACE: 'ui:start-race', // { mode, engineClass, characterId, trackId, cupId }
  UI_NEXT_RACE: 'ui:next-race', // {}
  UI_RESTART: 'ui:restart', // {}
  UI_QUIT: 'ui:quit', // {}
  UI_RESUME: 'ui:resume', // {}
  UI_SCREEN: 'ui:screen', // { screen }
  UI_PREVIEW_CHARACTER: 'ui:preview-character', // { characterId }
  UI_PREVIEW_TRACK: 'ui:preview-track', // { trackId }
  UI_SETTINGS: 'ui:settings', // { settings }
  UI_NAVIGATE: 'ui:navigate', // {}
  UI_CONFIRM: 'ui:confirm', // {}
  UI_BACK: 'ui:back', // {}

  // --- Input (Input) ---
  INPUT_MENU: 'input:menu', // { action: 'up'|'down'|'left'|'right'|'confirm'|'back'|'pause' }
  INPUT_DEVICE: 'input:device', // { device: 'keyboard'|'gamepad' }
};
