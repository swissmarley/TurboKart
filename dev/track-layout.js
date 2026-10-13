// 2D layout inspector for all tracks: road ribbon coloured by curvature radius,
// walls (dashed = none/void), item rows, coins, boosts, ramps, obstacles, elevation profile.
import { LAYOUTS } from '../src/track/layouts.js';
import { compileLayout } from '../src/track/layoutCompiler.js';
import { TrackPath } from '../src/track/TrackPath.js';

const params = new URLSearchParams(location.search);
const only = params.get('track');
const grid = document.getElementById('grid');
if (only) grid.style.gridTemplateColumns = '1fr';

for (const id of Object.keys(LAYOUTS)) {
  if (only && id !== only) continue;
  const cell = document.createElement('div');
  cell.className = 'cell';
  const h = document.createElement('h3');
  h.textContent = id;
  cell.appendChild(h);
  const info = document.createElement('pre');
  cell.appendChild(info);
  const cv = document.createElement('canvas');
  const W = only ? 1500 : 760;
  const H = only ? 1000 : 520;
  cv.width = W;
  cv.height = H;
  cell.appendChild(cv);
  grid.appendChild(cell);
  try {
    const lay = compileLayout(LAYOUTS[id]);
    const path = new TrackPath(lay);
    draw(cv, path, lay);
    let minR = Infinity;
    for (let k = 0; k < path.count; k++) minR = Math.min(minR, 1 / Math.max(1e-6, Math.abs(path.curvature[k])));
    const autos = LAYOUTS[id].segs.filter((s) => s.s === 'auto').length;
    info.textContent = `length ${path.length.toFixed(0)} m  minR ${minR.toFixed(1)} m  elev ${path.bounds.minY.toFixed(1)}..${path.bounds.maxY.toFixed(1)}  size ${(path.bounds.maxX - path.bounds.minX).toFixed(0)}x${(path.bounds.maxZ - path.bounds.minZ).toFixed(0)}  items ${path.itemBoxPositions.length} coins ${path.coinPositions.length} boosts ${path.boostPads.length} ramps ${path.ramps.length}`;
  } catch (e) {
    info.textContent = 'ERROR: ' + e.message;
    info.style.color = '#f66';
    drawRaw(cv, LAYOUTS[id]);
  }
}

function makeXf(cv, b, profileH) {
  const pad = 40;
  const W = cv.width;
  const H = cv.height - profileH;
  const sx = (W - 2 * pad) / (b.maxX - b.minX);
  const sz = (H - 2 * pad) / (b.maxZ - b.minZ);
  const s = Math.min(sx, sz);
  // screen x = -world x (so that driving "up" the screen, right turns go right)
  const cx = (b.minX + b.maxX) / 2;
  const cz = (b.minZ + b.maxZ) / 2;
  return { s, X: (x) => W / 2 - (x - cx) * s, Y: (z) => H / 2 - (z - cz) * s };
}

function draw(cv, path, lay) {
  const ctx = cv.getContext('2d');
  const profileH = 110;
  const b = { ...path.bounds };
  const m = path.maxExtent + 10;
  b.minX -= m; b.maxX += m; b.minZ -= m; b.maxZ += m;
  const xf = makeXf(cv, b, profileH);
  const N = path.count;
  // grid
  ctx.strokeStyle = '#262a35';
  ctx.lineWidth = 1;
  for (let g = Math.floor(b.minX / 50) * 50; g < b.maxX; g += 50) { ctx.beginPath(); ctx.moveTo(xf.X(g), 0); ctx.lineTo(xf.X(g), cv.height - profileH); ctx.stroke(); }
  for (let g = Math.floor(b.minZ / 50) * 50; g < b.maxZ; g += 50) { ctx.beginPath(); ctx.moveTo(0, xf.Y(g)); ctx.lineTo(cv.width, xf.Y(g)); ctx.stroke(); }
  // corridor (walls) fill
  const side = (k, off) => [path.px[k] + path.rx[k] * off, path.pz[k] + path.rz[k] * off];
  for (let k = 0; k < N; k++) {
    const j = (k + 1) % N;
    const wk = Number.isNaN(path.wall[k]) ? path.hw[k] + 1 : path.wall[k];
    const wj = Number.isNaN(path.wall[j]) ? path.hw[j] + 1 : path.wall[j];
    const q = [side(k, -wk), side(j, -wj), side(j, wj), side(k, wk)];
    ctx.fillStyle = Number.isNaN(path.wall[k]) ? 'rgba(255,0,200,0.25)' : 'rgba(90,140,70,0.35)';
    ctx.beginPath();
    q.forEach(([x, z], i) => (i ? ctx.lineTo(xf.X(x), xf.Y(z)) : ctx.moveTo(xf.X(x), xf.Y(z))));
    ctx.fill();
  }
  // road coloured by radius
  for (let k = 0; k < N; k++) {
    const j = (k + 1) % N;
    const q = [side(k, -path.hw[k]), side(j, -path.hw[j]), side(j, path.hw[j]), side(k, path.hw[k])];
    const r = 1 / Math.max(1e-6, Math.abs(path.curvature[k]));
    const t = Math.min(1, Math.max(0, (r - 20) / 120));
    const hue = t * 120;
    ctx.fillStyle = `hsl(${hue},70%,${35 + 10 * (path.py[k] - path.bounds.minY) / Math.max(1, path.bounds.maxY - path.bounds.minY)}%)`;
    ctx.beginPath();
    q.forEach(([x, z], i) => (i ? ctx.lineTo(xf.X(x), xf.Y(z)) : ctx.moveTo(xf.X(x), xf.Y(z))));
    ctx.fill();
  }
  // walls
  ctx.lineWidth = 1.5;
  for (const sgn of [-1, 1]) {
    for (let k = 0; k < N; k++) {
      const j = (k + 1) % N;
      if (Number.isNaN(path.wall[k])) continue;
      const a = side(k, sgn * path.wall[k]);
      const c = side(j, sgn * (Number.isNaN(path.wall[j]) ? path.wall[k] : path.wall[j]));
      ctx.strokeStyle = '#e8e0c0';
      ctx.beginPath(); ctx.moveTo(xf.X(a[0]), xf.Y(a[1])); ctx.lineTo(xf.X(c[0]), xf.Y(c[1])); ctx.stroke();
    }
  }
  // segment labels
  ctx.font = '11px system-ui';
  for (const sg of lay.segments) {
    const d = path.cpToDistance((sg.from + sg.to) / 2);
    const f = path.frameAt(d, 0);
    const k = Math.floor(d) % N;
    const off = (path.wall[k] || path.hw[k]) + 12;
    ctx.fillStyle = '#fff';
    ctx.fillText(sg.id, xf.X(f.position.x - f.right.x * off) - 10, xf.Y(f.position.z - f.right.z * off));
  }
  // start line + direction
  {
    const f = path.frameAt(0, 0);
    const a = side(0, -path.hw[0]);
    const c = side(0, path.hw[0]);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(xf.X(a[0]), xf.Y(a[1])); ctx.lineTo(xf.X(c[0]), xf.Y(c[1])); ctx.stroke();
    const g = path.startGrid(8);
    ctx.fillStyle = '#4af';
    for (const s of g) { ctx.beginPath(); ctx.arc(xf.X(s.position.x), xf.Y(s.position.z), 3, 0, 7); ctx.fill(); }
    const tip = path.frameAt(25, 0);
    ctx.strokeStyle = '#ff0';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(xf.X(f.position.x), xf.Y(f.position.z)); ctx.lineTo(xf.X(tip.position.x), xf.Y(tip.position.z)); ctx.stroke();
  }
  const dot = (p, col, r = 2.5) => { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(xf.X(p.x), xf.Y(p.z), r, 0, 7); ctx.fill(); };
  path.itemBoxPositions.forEach((p) => dot(p, '#f0f', 3));
  path.coinPositions.forEach((p) => dot(p, '#fd0', 1.8));
  path.boostPads.forEach((p) => dot(p.position, '#0ff', 5));
  path.ramps.forEach((p) => dot(p.position, '#f80', 6));
  path.obstacles.forEach((o) => dot(o.position, '#a52', Math.max(2, o.radius * xf.s)));
  // elevation profile
  const y0 = cv.height - profileH + 10;
  ctx.fillStyle = '#111';
  ctx.fillRect(0, y0 - 5, cv.width, profileH);
  const ymin = path.bounds.minY - 2;
  const ymax = Math.max(path.bounds.maxY + 2, ymin + 10);
  ctx.strokeStyle = '#7cf';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let k = 0; k < N; k++) {
    const X = (k / N) * cv.width;
    const Y = y0 + (profileH - 20) * (1 - (path.py[k] - ymin) / (ymax - ymin));
    k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
  }
  ctx.stroke();
  // bank (red) in profile
  ctx.strokeStyle = '#f66';
  ctx.beginPath();
  for (let k = 0; k < N; k++) {
    const X = (k / N) * cv.width;
    const Y = y0 + (profileH - 20) * 0.5 - path.bank[k] * 120;
    k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
  }
  ctx.stroke();
  ctx.fillStyle = '#9ab';
  ctx.fillText(`elev ${ymin.toFixed(0)}..${ymax.toFixed(0)} m (blue), bank (red)`, 6, y0 + 4);
  for (const sg of lay.segments) {
    const X = (path.cpToDistance(sg.from) / path.length) * cv.width;
    ctx.fillStyle = '#556';
    ctx.fillRect(X, y0, 1, profileH - 20);
    ctx.fillStyle = '#889';
    ctx.fillText(sg.id, X + 2, cv.height - 6);
  }
}

function drawRaw(cv, def) {
  // walk turtle with auto = 60 m to visualise a failing layout
  const ctx = cv.getContext('2d');
  let x = 0, z = 0, h = 0;
  const pts = [[0, 0]];
  const labels = [];
  for (const g of def.segs) {
    const isArc = g.s === undefined;
    const len = isArc ? Math.abs(g.a) * Math.PI / 180 * g.r : g.s === 'auto' ? 60 : g.s;
    const rate = isArc ? Math.sign(g.a) / g.r : 0;
    const n = Math.ceil(len);
    for (let k = 0; k < n; k++) {
      const dl = len / n;
      x += Math.sin(h - rate * dl / 2) * dl; z += Math.cos(h - rate * dl / 2) * dl; h -= rate * dl;
      pts.push([x, z]);
      if (k === Math.floor(n / 2)) labels.push([g.id + (g.s === 'auto' ? '(auto)' : ''), x, z]);
    }
  }
  const b = { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity };
  pts.forEach(([x, z]) => { b.minX = Math.min(b.minX, x); b.maxX = Math.max(b.maxX, x); b.minZ = Math.min(b.minZ, z); b.maxZ = Math.max(b.maxZ, z); });
  b.minX -= 30; b.maxX += 30; b.minZ -= 30; b.maxZ += 30;
  const xf = makeXf(cv, b, 0);
  ctx.strokeStyle = '#f84';
  ctx.lineWidth = 3;
  ctx.beginPath();
  pts.forEach(([x, z], i) => (i ? ctx.lineTo(xf.X(x), xf.Y(z)) : ctx.moveTo(xf.X(x), xf.Y(z))));
  ctx.stroke();
  ctx.fillStyle = '#fff';
  labels.forEach(([t, x, z]) => ctx.fillText(t, xf.X(x) + 4, xf.Y(z)));
  ctx.fillStyle = '#0f0';
  ctx.beginPath(); ctx.arc(xf.X(0), xf.Y(0), 5, 0, 7); ctx.fill();
}
