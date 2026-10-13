// Node unit checks for ItemSystem: every item use path, events, TT mode, reset, dispose.
const fakeCtx = new Proxy({}, { get(t, p) { if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} }); if (p in t) return t[p]; return () => {}; }, set(t, p, v) { t[p] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => fakeCtx, style: {} }) };
const THREE = await import('three');
const { EventBus } = await import('../src/core/EventBus.js');
const { EVENTS, ITEMS, PHYSICS_DT, GAME_MODES } = await import('../src/core/constants.js');
const { ItemSystem, rollItem } = await import('../src/items/index.js');
const { Track } = await import('../src/track/index.js');
const { Kart } = await import('../src/kart/Kart.js');
const { CHARACTERS } = await import('../src/kart/characters.js');
const { makeRng } = await import('./items-mocks.js');

let fails = 0;
const ok = (cond, msg) => { if (!cond) { fails++; console.log('FAIL', msg); } else console.log('ok  ', msg); };

function setup(mode = GAME_MODES.VS, n = 4) {
  const scene = new THREE.Scene();
  const bus = new EventBus();
  const track = new Track('sunny-meadows', { quality: 'low' });
  const grid = track.getStartGrid(n);
  const karts = [];
  for (let i = 0; i < n; i++) {
    const k = new Kart({ character: CHARACTERS[i], index: i, bus });
    k.placeAtStart(grid[i]);
    karts.push(k);
  }
  const items = new ItemSystem({ scene, track, karts, bus, mode, rng: makeRng(3) });
  items.build();
  const ev = [];
  for (const [name, e] of Object.entries(EVENTS)) bus.on(e, (p) => ev.push({ name, p }));
  let t = 0;
  const step = (sec, before) => {
    for (let f = 0; f < sec * 60; f++) {
      before?.(f);
      for (let s = 0; s < 2; s++) for (const k of karts) k.update(PHYSICS_DT, track);
      items.update(1 / 60, (t += 1 / 60));
      for (const k of karts) k.controls.itemPressed = false;
    }
  };
  // fake race positions: kart index order (0 leads)
  karts.forEach((k, i) => { k.racePosition = i + 1; k.raceDistance = 100 - i * 10; });
  return { scene, bus, track, karts, items, ev, step };
}
const count = (ev, name) => ev.filter((e) => e.name === name).length;

// distribution sanity
{
  const rng = makeRng(9);
  const tally = (pos) => { const c = {}; for (let i = 0; i < 4000; i++) { const t = rollItem(pos, 8, { rng }); c[t] = (c[t] || 0) + 1; } return c; };
  const first = tally(1);
  const last = tally(8);
  ok(!first[ITEMS.SPINY_SHELL] && !first[ITEMS.LIGHTNING] && !first[ITEMS.STAR], 'leader never gets spiny/lightning/star');
  ok((last[ITEMS.STAR] || 0) > 400 && !last[ITEMS.BANANA], 'last place gets stars, no bananas');
  ok(rollItem(1, 1, { mode: GAME_MODES.TIME_TRIAL }) === ITEMS.TRIPLE_MUSHROOM, 'time trial roll');
  console.log('     leader', JSON.stringify(first));
  console.log('     last  ', JSON.stringify(last));
}

// every item use path
for (const type of Object.values(ITEMS)) {
  const { karts, items, ev, step } = setup();
  const k = karts[2];
  for (const kk of karts) kk.controls.throttle = 1;
  step(0.5);
  items.giveItem(k, type);
  const st = items.getItemState(k);
  ok(st.type === type && st.count >= 1, `giveItem ${type} -> state ${st.type} x${st.count}`);
  step(0.2, (f) => { if (f === 0) { k.controls.itemPressed = true; k.controls.item = true; } if (f === 3) k.controls.item = false; });
  step(2.5);
  ok(count(ev, 'ITEM_USE') >= 1, `${type}: ITEM_USE emitted (${count(ev, 'ITEM_USE')})`);
  if (type === ITEMS.LIGHTNING) ok(count(ev, 'ITEM_LIGHTNING') === 1 && karts[0].shrinkTimer > 0, 'lightning shrinks others');
  if (type === ITEMS.STAR) ok(k.starTimer > 0, 'star started');
  if (type === ITEMS.COIN) ok(k.coins === 2, 'coin item +2 coins');
  if (type === ITEMS.SPINY_SHELL) ok(count(ev, 'ITEM_SPINY_WARNING') >= 1, 'spiny warning emitted');
  if (type === ITEMS.MUSHROOM) ok(count(ev, 'KART_BOOST') >= 1, 'mushroom boosts');
}

// banana hit + coin loss + blocked by trailing banana
{
  const { karts, items, ev, step, track } = setup();
  const [a, b] = karts;
  b.addCoins(5);
  items.giveItem(a, ITEMS.BANANA);
  // drop banana right in front of b
  a.controls.itemPressed = true;
  a.controls.item = false;
  step(1 / 60);
  const p = items.projectiles.find((q) => q.type === ITEMS.BANANA);
  ok(!!p && p.state === 'rest', 'banana dropped and resting');
  p.position.copy(b.position).addScaledVector(b.forward, 3);
  p.ownerImmune = 0;
  b.controls.throttle = 1;
  step(1.5);
  ok(count(ev, 'ITEM_HIT') === 1 && count(ev, 'COIN_LOST') === 1 && b.coins === 2, `banana hit b: hits=${count(ev, 'ITEM_HIT')} coins=${b.coins}`);
}
{
  const { karts, items, ev, step } = setup(GAME_MODES.VS, 2);
  const [a, b] = karts;
  items.giveItem(b, ITEMS.TRIPLE_BANANA);
  items.giveItem(a, ITEMS.GREEN_SHELL);
  step(0.3);
  console.log('     after setup: b count', items.getItemState(b).count, ev.map((e) => e.name).filter((n) => n.startsWith('ITEM')).join(','));
  // fire a green shell at b from behind
  const p = items._spawn(ITEMS.GREEN_SHELL, a);
  p.position.copy(b.position).addScaledVector(b.forward, -9);
  p.velocity.copy(b.forward).multiplyScalar(46);
  p.state = 'slide';
  p.life = 8;
  const before = ev.length;
  step(0.6);
  console.log('     events after shot:', ev.slice(before).map((e) => e.name + (e.p.type ? ':' + e.p.type : '')).join(', '));
  ok(count(ev, 'ITEM_BLOCKED') >= 1 && count(ev, 'ITEM_HIT') === 0, `trailing bananas block a shell from behind (blocked=${count(ev, 'ITEM_BLOCKED')})`);
  ok(items.getItemState(b).count === 2 && b.spinoutTimer === 0, `one banana consumed, b unharmed (count=${items.getItemState(b).count})`);
}
// item box pickup -> roulette -> item
{
  const { karts, items, ev, step } = setup();
  const k = karts[0];
  const box = items.boxes.boxes[0];
  k.position.copy(box.base);
  k.position.y -= 1.3;
  step(1 / 60);
  ok(count(ev, 'ITEM_BOX_HIT') === 1 && items.getItemState(k).roulette, 'box hit starts roulette');
  k.position.x += 30; // drive away so the box can respawn
  step(2.6);
  ok(count(ev, 'ITEM_ROULETTE_STOP') === 1 && items.getItemState(k).type, `roulette stops with ${items.getItemState(k).type}`);
  step(3.5);
  ok(items.boxes.boxes[0].visible, 'box respawned');
}
// time trial + reset + dispose
{
  const { karts, items, scene } = setup(GAME_MODES.TIME_TRIAL, 1);
  ok(items.boxes.count === 0, 'time trial: no boxes');
  ok(items.getItemState(karts[0]).type === ITEMS.TRIPLE_MUSHROOM, 'time trial: triple mushroom');
  items.giveItem(karts[0], ITEMS.TRIPLE_GREEN_SHELL);
  items.reset();
  ok(items.projectiles.length === 0 && items.getItemState(karts[0]).type === ITEMS.TRIPLE_MUSHROOM, 'reset clears projectiles, TT item restored');
  items.dispose();
  ok(!scene.children.includes(items.root), 'dispose removes root');
}
console.log(fails ? `${fails} FAILURES` : 'ALL OK');
