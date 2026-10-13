// Prints the racing-line corners detected for each real track.
globalThis.document = { createElement: () => ({ getContext: () => null }) };
const { Track } = await import('../src/track/index.js');
const { getRacingLine } = await import('../src/ai/RacingLine.js');
for (const id of ['sunny-meadows', 'dune-drift', 'frostbite-peaks', 'neon-skyway']) {
  const t = new Track(id, { quality: 'low' });
  const L = getRacingLine(t);
  let minV = Infinity;
  let maxK = 0;
  for (let i = 0; i < L.n; i++) maxK = Math.max(maxK, Math.abs(L.curv[i]));
  const voids = t.samples.filter((s) => s.wallOffset === null).length;
  console.log(`${id} len=${t.length.toFixed(0)} n=${L.n} maxK=${maxK.toFixed(3)} (R=${(1 / maxK).toFixed(1)}m) voidSamples=${voids} pads=${L.boostPads.length} coinGroups=${L.coinGroups.length} obstacles=${L.obstacles.length} ramps=${(t.ramps || []).length}`);
  for (const c of L.corners) console.log(`   corner ${c.startDist.toFixed(0)}-${c.endDist.toFixed(0)} len=${c.length.toFixed(0)} dir=${c.dir} turn=${((c.turn * 180) / Math.PI).toFixed(0)}deg peakR=${(1 / c.peak).toFixed(0)}m`);
}
