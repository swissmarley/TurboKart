import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CHARACTERS } from '../src/kart/characters.js';
import { createKartModel } from '../src/kart/KartModel.js';

/**
 * Garage / showroom view: all 8 characters lined up under studio lighting.
 * Params: angle=front|back|chase|side|top|three, char=<id> (single kart close-up), env=room|none,
 *         pose=<pose> (applied by kart-sandbox for Kart instances), t=<seconds> idle time.
 */
export function runGarage({ renderer, params, hud, labels, karts: externalKarts }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 500);

  // backdrop gradient
  const c = document.createElement('canvas');
  c.width = 4;
  c.height = 256;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#26304a');
  grad.addColorStop(0.55, '#4b5878');
  grad.addColorStop(1, '#141824');
  g.fillStyle = grad;
  g.fillRect(0, 0, 4, 256);
  const bg = new THREE.CanvasTexture(c);
  bg.colorSpace = THREE.SRGBColorSpace;
  scene.background = bg;

  if (params.get('env') !== 'none') {
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
  }

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(40, 64),
    new THREE.MeshStandardMaterial({ color: 0x3a4152, roughness: 0.55, metalness: 0.0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const grid = new THREE.GridHelper(40, 40, 0x56607a, 0x485067);
  grid.position.y = 0.002;
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  scene.add(grid);

  scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x3a3428, 0.9));
  const key = new THREE.DirectionalLight(0xfff3e0, 2.6);
  key.position.set(6, 10, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -12;
  key.shadow.camera.right = 12;
  key.shadow.camera.top = 12;
  key.shadow.camera.bottom = -12;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x9fc4ff, 1.6);
  rim.position.set(-6, 5, -9);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffd6f0, 0.5);
  fill.position.set(-8, 3, 6);
  scene.add(fill);

  const only = params.get('char');
  const list = only ? CHARACTERS.filter((ch) => ch.id === only) : CHARACTERS;
  const models = [];
  list.forEach((ch, i) => {
    const m = externalKarts ? externalKarts(ch, i) : createKartModel(ch);
    const obj = m.mesh || m;
    const cols = 4;
    const row = Math.floor(i / cols);
    const col = i % cols;
    if (!only) obj.position.set((col - (cols - 1) / 2) * 3.1, 0, row === 0 ? 2.2 : -2.2);
    scene.add(obj);
    models.push({ ch, obj, m });
  });

  const angle = params.get('angle') || 'three';
  const camSetups = only
    ? {
        front: [0, 1.0, 4.2, 0, 0.7, 0],
        back: [0, 1.5, -4.4, 0, 0.7, 0],
        chase: [0, 2.3, -5.6, 0, 1.0, 2],
        side: [4.6, 1.0, 0, 0, 0.6, 0],
        top: [0, 6, 0.01, 0, 0, 0],
        three: [3.0, 1.7, 3.6, 0, 0.6, 0],
        face: [0.9, 1.25, 2.2, 0, 1.0, 0],
      }
    : {
        front: [0, 4.5, 13, 0, 0.6, 0],
        back: [0, 4.5, -13, 0, 0.6, 0],
        chase: [0, 3.5, -12, 0, 0.6, 0],
        side: [14, 4, 0, 0, 0.6, 0],
        top: [0, 20, 0.1, 0, 0, 0],
        three: [7, 6, 12, 0, 0.4, 0],
      };
  const cs = camSetups[angle] || camSetups.three;
  camera.position.set(cs[0], cs[1], cs[2]);
  camera.lookAt(cs[3], cs[4], cs[5]);

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);

  const v = new THREE.Vector3();
  function updateLabels() {
    if (only || params.get('labels') === '0') return;
    labels.innerHTML = '';
    for (const { ch, obj } of models) {
      v.set(0, -0.05, 1.4).applyMatrix4(obj.matrixWorld).project(camera);
      if (angle === 'back' || angle === 'chase') v.set(0, -0.05, -1.4).applyMatrix4(obj.matrixWorld).project(camera);
      const d = document.createElement('div');
      d.className = 'lbl';
      d.style.left = ((v.x + 1) / 2) * innerWidth + 'px';
      d.style.top = ((1 - v.y) / 2) * innerHeight + 'px';
      d.innerHTML = `<span style="color:${ch.cssColor}">${ch.name}</span><small>${ch.weightClass} · #${ch.number}</small>`;
      labels.appendChild(d);
    }
  }

  let time = parseFloat(params.get('t') || '0');
  const spin = params.get('spin') === '1';
  hud.textContent = 'GARAGE  angle=' + angle;
  return {
    scene,
    camera,
    update(dt) {
      time += dt;
      for (const { obj, m } of models) {
        if (obj.userData.tick) obj.userData.tick(dt, time);
        if (m.updateVisuals) m.updateVisuals(dt, time);
        if (spin) obj.rotation.y += dt * 0.5;
      }
      scene.updateMatrixWorld();
      updateLabels();
    },
  };
}
