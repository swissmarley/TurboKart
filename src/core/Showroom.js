import * as THREE from 'three';

/**
 * Character-select showroom: the highlighted kart spins on a glowing podium
 * in the right half of the screen while the UI roster sits on the left.
 */
export class Showroom {
  constructor({ createKartModel, characters }) {
    this.createKartModel = createKartModel;
    this.characters = characters;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    this.models = new Map();
    this.current = null;
    this.currentId = null;
    this.spin = 0;
    this.swapT = 1;
    this._build();
  }

  _build() {
    const s = this.scene;
    s.background = this._gradientTexture();
    s.fog = new THREE.Fog(0x1a1240, 18, 60);

    s.add(new THREE.HemisphereLight(0xbfd6ff, 0x2a1840, 1.1));
    const key = new THREE.SpotLight(0xffffff, 260, 40, Math.PI / 6, 0.45, 1.4);
    key.position.set(4, 10, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.bias = -0.0004;
    s.add(key, key.target);
    const rim = new THREE.DirectionalLight(0x8a7bff, 2.2);
    rim.position.set(-6, 4, -6);
    s.add(rim);
    const fill = new THREE.DirectionalLight(0xffb36b, 0.9);
    fill.position.set(6, 2, -2);
    s.add(fill);

    // Podium
    this.podium = new THREE.Group();
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(3.2, 3.4, 0.5, 64),
      new THREE.MeshStandardMaterial({ color: 0x2b2550, metalness: 0.6, roughness: 0.25 }),
    );
    top.position.y = -0.25;
    top.receiveShadow = true;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.32, 0.07, 12, 96),
      new THREE.MeshStandardMaterial({ color: 0x66e0ff, emissive: 0x33c8ff, emissiveIntensity: 3 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.02;
    this.ring = ring;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(3.6, 4.2, 1.2, 64),
      new THREE.MeshStandardMaterial({ color: 0x15122e, metalness: 0.3, roughness: 0.6 }),
    );
    base.position.y = -1.05;
    this.podium.add(top, ring, base);
    s.add(this.podium);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(40, 64),
      new THREE.MeshStandardMaterial({ color: 0x120e26, roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -1.65;
    floor.receiveShadow = true;
    s.add(floor);

    this.turntable = new THREE.Group();
    s.add(this.turntable);

    // Look slightly below the kart so it sits higher on screen, clear of the stats panel.
    this.camera.position.set(0, 2.4, 10.5);
    this.camera.lookAt(0, -0.2, 0);
  }

  _gradientTexture() {
    const c = document.createElement('canvas');
    c.width = 4;
    c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#3a1f8a');
    grad.addColorStop(0.55, '#1b1450');
    grad.addColorStop(1, '#0b0a1f');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  setCharacter(id) {
    if (id === this.currentId) return;
    const character = this.characters.find((c) => c.id === id);
    if (!character) return;
    this.currentId = id;
    let model = this.models.get(id);
    if (!model) {
      model = this.createKartModel(character);
      model.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      this.models.set(id, model);
    }
    if (this.current) this.turntable.remove(this.current);
    this.current = model;
    this.turntable.add(model);
    this.swapT = 0;
    const accent = new THREE.Color(character.cssColor || '#66e0ff');
    this.ring.material.color.copy(accent);
    this.ring.material.emissive.copy(accent);
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    // Shift the framing so the kart sits in the right half of the screen.
    this.camera.setViewOffset(width, height, -width * 0.2, 0, width, height);
    this.camera.updateProjectionMatrix();
  }

  update(dt, time) {
    this.spin += dt * 0.6;
    this.turntable.rotation.y = this.spin + Math.sin(time * 0.7) * 0.15;
    this.swapT = Math.min(1, this.swapT + dt * 3.5);
    // Springy pop when switching characters
    const t = this.swapT;
    const pop = t < 1 ? 1 + Math.sin(t * Math.PI) * 0.18 * (1 - t) : 1;
    const s = (0.55 + 0.45 * easeOutBack(t)) * pop * 1.15;
    this.turntable.scale.setScalar(s);
    this.turntable.position.y = 0.02 + Math.sin(time * 1.8) * 0.04;
    this.ring.material.emissiveIntensity = 2.5 + Math.sin(time * 3) * 0.8;
    this.current?.userData.tick?.(dt, time);
  }

  render(renderer) {
    renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
    });
  }
}

function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
