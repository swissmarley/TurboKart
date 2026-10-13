// Track sandbox:  /dev/track.html?track=dune-drift&view=drive&d=350
//   view = drive (chase-cam style at distance d) | overview | orbit | top | side
//   d, lat (lateral offset), h (cam height), back (cam distance behind), quality, t (fixed time),
//   debug=1 (queryPosition probes coloured by surface), hud=1, kart=0 (hide stand-in kart)
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Track, TRACKS } from '../src/track/index.js';
import { SURFACES } from '../src/core/constants.js';

const P = new URLSearchParams(location.search);
const trackId = P.get('track') || TRACKS[0].id;
const view = P.get('view') || 'drive';
const quality = P.get('quality') || 'high';
const fixedTime = P.has('t') ? parseFloat(P.get('t')) : null;
const hud = document.getElementById('hud');
const bar = document.getElementById('bar');

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: /HeadlessChrome/.test(navigator.userAgent) });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = parseFloat(P.get('exposure') || '1');
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(parseFloat(P.get('fov') || '70'), innerWidth / innerHeight, 0.1, 3000);
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ?rebuild=1 : build + dispose every track once first, report GPU memory (leak check)
if (P.get('rebuild') === '1') {
  const mem0 = { ...renderer.info.memory };
  for (const t of TRACKS) {
    const tr = new Track(t.id, { quality });
    await tr.build(scene, renderer);
    renderer.render(scene, camera);
    tr.dispose();
  }
  renderer.render(scene, camera);
  console.log(`[track-sandbox] rebuild check: memory before ${JSON.stringify(mem0)} after ${JSON.stringify(renderer.info.memory)}, scene children ${scene.children.length}, fog ${scene.fog}, env ${scene.environment}`);
}
const t0 = performance.now();
const track = new Track(trackId, { quality });
const tMath = performance.now() - t0;
await track.build(scene, renderer, (p) => (bar.style.width = `${(p * 100).toFixed(0)}%`));
const tBuild = performance.now() - t0;
bar.style.display = 'none';

// ---- stand-in kart for scale --------------------------------------------------------
const focus = new THREE.Vector3();
let kart = null;
if (P.get('kart') !== '0' && view === 'drive') {
  kart = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 2.3), new THREE.MeshStandardMaterial({ color: 0xe8262b, roughness: 0.35, metalness: 0.3 }));
  body.position.y = 0.45;
  body.castShadow = true;
  kart.add(body);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.7, 0.6), new THREE.MeshStandardMaterial({ color: 0x222228 }));
  seat.position.set(0, 0.9, -0.4);
  seat.castShadow = true;
  kart.add(seat);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.3 }));
  head.position.set(0, 1.55, -0.3);
  head.castShadow = true;
  kart.add(head);
  for (const [x, z] of [[0.8, 0.8], [-0.8, 0.8], [0.8, -0.8], [-0.8, -0.8]]) {
    const w = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.3, 14), new THREE.MeshStandardMaterial({ color: 0x18181c, roughness: 0.8 }));
    w.rotation.z = Math.PI / 2;
    w.position.set(x, 0.32, z);
    w.castShadow = true;
    kart.add(w);
  }
  scene.add(kart);
}

// ---- camera placement --------------------------------------------------------------------
const d = parseFloat(P.get('d') || '30');
const lat = parseFloat(P.get('lat') || '0');
const camH = parseFloat(P.get('h') || '3.2');
const back = parseFloat(P.get('back') || '7.5');
let controls = null;
const b = track.path.bounds;
const center = new THREE.Vector3((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2);
const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
function placeDrive() {
  const fk = track.getFrameAtDistance(d, lat);
  const q = track.queryPosition(fk.position, undefined);
  if (kart) {
    kart.position.copy(fk.position);
    kart.position.y = q.groundHeight;
    const fwd = fk.tangent;
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(q.groundNormal, fwd).normalize(), q.groundNormal, new THREE.Vector3().crossVectors(new THREE.Vector3().crossVectors(q.groundNormal, fwd).normalize(), q.groundNormal));
    kart.quaternion.setFromRotationMatrix(m);
  }
  const fc = track.getFrameAtDistance(d - back, lat * 0.85);
  const fl = track.getFrameAtDistance(d + 10, lat);
  camera.position.copy(fc.position);
  camera.position.y += camH;
  camera.lookAt(fl.position.x, fl.position.y + 1.4, fl.position.z);
  focus.copy(fk.position);
}
if (view === 'drive') placeDrive();
else if (view === 'overview') {
  camera.position.set(center.x + span * 0.55, center.y + span * 0.55, center.z - span * 0.55);
  camera.lookAt(center);
  focus.copy(center);
} else if (view === 'top') {
  camera.position.set(center.x, center.y + span * 1.05, center.z + 1);
  camera.lookAt(center);
  focus.copy(center);
} else if (view === 'side') {
  const f = track.getFrameAtDistance(d, 0);
  const side = parseFloat(P.get('side') || '1');
  camera.position.copy(f.position).addScaledVector(f.right, side * parseFloat(P.get('dist') || '45')).add(new THREE.Vector3(0, camH, 0));
  camera.lookAt(f.position.x, f.position.y + 2, f.position.z);
  focus.copy(f.position);
} else {
  const f = track.getFrameAtDistance(d, 0);
  camera.position.copy(f.position).add(new THREE.Vector3(40, 30, -40));
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.copy(f.position);
  controls.update();
  focus.copy(f.position);
}

// ---- debug probes -------------------------------------------------------------------------
if (P.get('debug') === '1') {
  const colors = { [SURFACES.ROAD]: 0x9aa0aa, [SURFACES.OFFROAD]: 0x3bd13b, [SURFACES.BOOST]: 0xff8a00, [SURFACES.RAMP]: 0xffee00, [SURFACES.VOID]: 0xff1030 };
  const probes = [];
  const R = view === 'drive' ? 60 : span * 0.6;
  const step = view === 'drive' ? 2 : 6;
  const q = Track.createQuery();
  let hint;
  const p = new THREE.Vector3();
  for (let x = -R; x <= R; x += step) {
    for (let z = -R; z <= R; z += step) {
      p.set(focus.x + x, 0, focus.z + z);
      const r = track.queryPosition(p, hint, q);
      if (Math.abs(r.lateral) > (r.wallOffset ?? r.halfWidth + 1) + 6) continue;
      probes.push({ x: p.x, y: r.surface === SURFACES.VOID ? r.center.y - 1 : r.groundHeight + 0.15, z: p.z, c: colors[r.surface] });
    }
  }
  const geo = new THREE.SphereGeometry(0.25, 6, 4);
  const mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial(), probes.length);
  const m = new THREE.Matrix4();
  probes.forEach((pr, i) => {
    m.makeTranslation(pr.x, pr.y, pr.z);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, new THREE.Color(pr.c));
  });
  scene.add(mesh);
  // obstacles as red cylinders
  for (const o of track.obstacles) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(o.radius, o.radius, 4, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true }));
    c.position.copy(o.position).add(new THREE.Vector3(0, 2, 0));
    scene.add(c);
  }
  // item boxes / coins
  const ib = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xff40ff, wireframe: true }), track.itemBoxPositions.length);
  track.itemBoxPositions.forEach((pp, i) => ib.setMatrixAt(i, m.makeTranslation(pp.x, pp.y, pp.z)));
  scene.add(ib);
  if (track.coinPositions.length) {
    const cm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 10), new THREE.MeshBasicMaterial({ color: 0xffd000 }), track.coinPositions.length);
    track.coinPositions.forEach((pp, i) => cm.setMatrixAt(i, m.makeTranslation(pp.x, pp.y, pp.z)));
    scene.add(cm);
  }
  // start grid
  for (const g of track.getStartGrid(8)) {
    const s = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.6, 8), new THREE.MeshBasicMaterial({ color: 0x40c0ff }));
    s.position.copy(g.position).add(new THREE.Vector3(0, 0.8, 0));
    s.rotation.set(Math.PI / 2, 0, 0);
    s.rotation.y = g.heading;
    scene.add(s);
  }
}

// ---- loop ------------------------------------------------------------------------------------
const clock = new THREE.Timer();
const headless = /HeadlessChrome/.test(navigator.userAgent);
const syncPixel = new Uint8Array(4);
let time = fixedTime ?? 0;
let frames = 0;
function frame() {
  clock.update();
  const dt = Math.min(0.05, clock.getDelta());
  time = fixedTime ?? time + dt;
  if (controls) {
    controls.update();
    focus.copy(controls.target);
  }
  track.update(dt, time, focus);
  renderer.render(scene, camera);
  if (headless) {
    // force the (software) GPU to finish so headless captures never grab an empty frame
    const gl = renderer.getContext();
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPixel);
  }
  frames++;
  if (frames === 2) {
    const info = renderer.info.render;
    const msg = `[track-sandbox] ${trackId} built: math ${tMath.toFixed(0)} ms, total ${tBuild.toFixed(0)} ms, objects ${track.world.meshCount}, draw calls ${info.calls}, triangles ${(info.triangles / 1000).toFixed(0)}k, length ${track.length.toFixed(0)} m`;
    console.log(msg);
    if (P.get('hud') === '1') {
      hud.textContent = msg.replace('[track-sandbox] ', '');
      hud.classList.remove('hidden');
    }
  }
  if (frames < maxFrames) requestAnimationFrame(frame);
  else setTimeout(frame, 1500); // keep presenting slowly (headless capture)
}
// headless screenshots: render a few frames then idle (software GL is slow)
const maxFrames = P.has('frames') ? parseInt(P.get('frames'), 10) : /HeadlessChrome/.test(navigator.userAgent) ? 3 : Infinity;
frame();
window.__track = track;
