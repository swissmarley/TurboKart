import * as THREE from 'three';
import { ITEMS } from '../src/core/constants.js';
import { createItemModel } from '../src/items/models.js';

/** Turntable showcase of every item model. ?view=showcase[&item=<type>][&t=sec] */
export function runShowcase(params) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  document.body.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#5aa7ff');
    gr.addColorStop(0.55, '#bfe1ff');
    gr.addColorStop(1, '#ffe9c9');
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    scene.background = t;
  }
  const camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 200);

  scene.add(new THREE.HemisphereLight(0xcfe6ff, 0x7a6a50, 1.2));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sun.position.set(6, 12, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -12;
  sun.shadow.camera.right = 12;
  sun.shadow.camera.top = 12;
  sun.shadow.camera.bottom = -12;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9fc8ff, 1.4);
  rim.position.set(-8, 5, -10);
  scene.add(rim);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(40, 64),
    new THREE.MeshStandardMaterial({ color: 0x8fc46a, roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const single = params.get('item');
  const types = single
    ? [single]
    : [
        'item_box',
        ITEMS.COIN,
        ITEMS.MUSHROOM,
        ITEMS.GOLDEN_MUSHROOM,
        ITEMS.BANANA,
        'banana_peel',
        ITEMS.GREEN_SHELL,
        ITEMS.RED_SHELL,
        ITEMS.SPINY_SHELL,
        ITEMS.STAR,
        ITEMS.BOMB,
        ITEMS.LIGHTNING,
      ];
  const cols = single ? 1 : 4;
  const spacing = 2.6;
  const models = [];
  const labels = document.getElementById('labels');
  const pedestalGeo = new THREE.CylinderGeometry(0.85, 0.95, 0.25, 48);
  const pedestalMat = new THREE.MeshStandardMaterial({ color: 0xf6f1ea, roughness: 0.45 });
  types.forEach((type, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = single ? 0 : (col - (cols - 1) / 2) * spacing;
    const z = single ? 0 : (row - 1) * spacing * 0.95;
    const ped = new THREE.Mesh(pedestalGeo, pedestalMat);
    ped.position.set(x, 0.125, z);
    ped.castShadow = true;
    ped.receiveShadow = true;
    scene.add(ped);
    const m = createItemModel(type);
    m.position.set(x, 0.25, z);
    if (type === 'item_box') m.scale.setScalar(0.85);
    scene.add(m);
    const el = document.createElement('div');
    el.className = 'lbl';
    el.textContent = type;
    labels.appendChild(el);
    models.push({ m, el, type, phase: i * 0.7 });
  });

  if (single) {
    const zoom = parseFloat(params.get('zoom') || '1');
    camera.position.set(0, 1.35, 3.2 / zoom);
    camera.lookAt(0, 0.62, 0);
  } else {
    camera.position.set(0, 7.2, 10.8);
    camera.lookAt(0, 0.4, 0.3);
  }

  const v = new THREE.Vector3();
  const tParam = parseFloat(params.get('t') || '0');
  const spin = params.get('spin') !== '0';
  const yaw = parseFloat(params.get('yaw') || '0');
  const start = performance.now();
  let last = start;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const t = tParam + (now - start) / 1000;
    for (const o of models) {
      o.m.userData.tick?.(t + o.phase, dt);
      if (spin) o.m.rotation.y = (t + o.phase) * 0.6 + yaw;
      else o.m.rotation.y = yaw;
      v.copy(o.m.position);
      v.y = 0;
      v.z += 0.95;
      v.project(camera);
      o.el.style.left = `${((v.x + 1) / 2) * window.innerWidth}px`;
      o.el.style.top = `${((1 - v.y) / 2) * window.innerHeight}px`;
      o.el.style.display = single ? 'none' : '';
    }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
  console.log('[items] showcase ready', types.join(','));
}
