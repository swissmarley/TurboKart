// Lists item-box rows / coin groups / pads per real track (distance along the lap).
const { Track } = await import('../src/track/index.js');
for (const id of ['sunny-meadows', 'dune-drift', 'frostbite-peaks', 'neon-skyway']) {
  const t = new Track(id, { quality: 'low' });
  const rows = new Map();
  for (const p of t.itemBoxPositions) {
    const q = t.queryPosition(p);
    const key = Math.round(q.distance / 10) * 10;
    rows.set(key, (rows.get(key) || 0) + 1);
  }
  const coins = t.coinPositions.map((p) => Math.round(t.queryPosition(p).distance));
  console.log(id, 'boxRows', JSON.stringify([...rows]), 'coins', coins.length, coins.slice(0, 12).join(','), 'pads', t.boostPads.map((p) => Math.round(p.distance)).join(','), 'obstacles', t.obstacles.length);
}
