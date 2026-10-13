import * as THREE from 'three';

/**
 * Procedural canvas textures for karts (cached, shared between instances).
 * Every function returns null when no DOM is available (headless Node tests).
 */

const HAS_DOM = typeof document !== 'undefined';
const cache = new Map();

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function hex(n) {
  return '#' + n.toString(16).padStart(6, '0');
}

function cached(key, fn) {
  if (!HAS_DOM) return null;
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

/**
 * Fallback reflection environment (equirectangular, auto-PMREM'd by three) so clearcoat paint and
 * chrome read nicely even when the scene has no `scene.environment`.
 */
export function getFallbackEnvMap() {
  return cached('env', () => {
    const w = 512;
    const h = 256;
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#9fc8ff');
    grad.addColorStop(0.42, '#e8f2ff');
    grad.addColorStop(0.5, '#ffffff');
    grad.addColorStop(0.53, '#8c8f86');
    grad.addColorStop(1, '#3b3d38');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // soft boxes / sun streaks for crisp highlights
    const box = (x, y, bw, bh, a) => {
      const rg = g.createRadialGradient(x, y, 1, x, y, Math.max(bw, bh));
      rg.addColorStop(0, `rgba(255,255,255,${a})`);
      rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg;
      g.fillRect(x - bw * 1.5, y - bh * 1.5, bw * 3, bh * 3);
    };
    box(128, 50, 50, 22, 1);
    box(330, 40, 70, 20, 0.85);
    box(450, 80, 30, 30, 0.7);
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.fillRect(100, 40, 60, 14);
    g.fillRect(300, 30, 70, 10);
    const tex = new THREE.CanvasTexture(c);
    tex.mapping = THREE.EquirectangularReflectionMapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

/** Tyre tread: colour + bump maps. `knobby` = off-road blocks. U wraps around the tyre. */
export function getTreadTextures(knobby = false) {
  return cached('tread' + (knobby ? 'K' : ''), () => {
    const w = 512;
    const h = 64;
    const col = makeCanvas(w, h);
    const bump = makeCanvas(w, h);
    const gc = col.getContext('2d');
    const gb = bump.getContext('2d');
    gc.fillStyle = '#26262b';
    gc.fillRect(0, 0, w, h);
    gb.fillStyle = '#ffffff';
    gb.fillRect(0, 0, w, h);
    const n = knobby ? 22 : 32;
    for (let i = 0; i < n; i++) {
      const x = (i / n) * w;
      const step = w / n;
      if (knobby) {
        for (let r = 0; r < 3; r++) {
          const y = 6 + r * 19 + (i % 2 ? 6 : 0);
          gb.fillStyle = '#ffffff';
          gc.fillStyle = '#2c2c32';
          gc.fillRect(x + 2, y, step * 0.62, 12);
          gb.fillStyle = '#000000';
          gb.fillRect(x + step * 0.66, y - 3, step * 0.34, 18);
        }
      } else {
        // chevron grooves
        gb.strokeStyle = '#000000';
        gb.lineWidth = step * 0.28;
        gb.beginPath();
        gb.moveTo(x, 4);
        gb.lineTo(x + step * 0.55, h / 2);
        gb.lineTo(x, h - 4);
        gb.stroke();
        gc.strokeStyle = '#18181c';
        gc.lineWidth = step * 0.28;
        gc.beginPath();
        gc.moveTo(x, 4);
        gc.lineTo(x + step * 0.55, h / 2);
        gc.lineTo(x, h - 4);
        gc.stroke();
      }
    }
    // sidewall shoulder lines
    gc.fillStyle = '#1b1b1f';
    gc.fillRect(0, 0, w, 3);
    gc.fillRect(0, h - 3, w, 3);
    const map = new THREE.CanvasTexture(col);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.anisotropy = 4;
    const bumpMap = new THREE.CanvasTexture(bump);
    bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
    return { map, bumpMap };
  });
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** Number plate with the racing number, framed in the character's colours. */
export function getPlateTexture(character) {
  return cached('plate:' + character.id, () => {
    const w = 256;
    const h = 128;
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    g.fillStyle = hex(character.colors.secondary === 0xf7f7f7 ? 0x222222 : character.colors.secondary);
    roundRect(g, 0, 0, w, h, 26);
    g.fill();
    g.fillStyle = '#fbfbf4';
    roundRect(g, 10, 10, w - 20, h - 20, 18);
    g.fill();
    g.fillStyle = hex(character.colors.primary);
    g.fillRect(10, h - 34, w - 20, 14);
    g.font = '900 92px "Arial Black", "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 10;
    g.strokeStyle = '#fbfbf4';
    g.fillStyle = '#141418';
    g.strokeText(String(character.number), w / 2, h / 2 - 6);
    g.fillText(String(character.number), w / 2, h / 2 - 6);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  });
}

/** Name decal for the rear wing (seen from the chase cam). */
export function getWingTexture(character) {
  return cached('wing:' + character.id, () => {
    const w = 512;
    const h = 128;
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    const base = character.colors.secondary;
    g.fillStyle = hex(base);
    g.fillRect(0, 0, w, h);
    // diagonal racing stripes
    g.fillStyle = hex(character.colors.accent);
    for (let i = -2; i < 3; i++) {
      g.beginPath();
      const x = 20 + i * 18;
      g.moveTo(x, h);
      g.lineTo(x + 40, 0);
      g.lineTo(x + 50, 0);
      g.lineTo(x + 10, h);
      g.fill();
    }
    for (let i = -2; i < 3; i++) {
      g.beginPath();
      const x = w - 70 + i * 18;
      g.moveTo(x, h);
      g.lineTo(x + 40, 0);
      g.lineTo(x + 50, 0);
      g.lineTo(x + 10, h);
      g.fill();
    }
    const lum = ((base >> 16) & 255) * 0.3 + ((base >> 8) & 255) * 0.59 + (base & 255) * 0.11;
    g.font = 'italic 900 78px "Arial Black", "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = lum > 140 ? '#141418' : hex(character.colors.primary);
    g.fillStyle = lum > 140 ? hex(character.colors.primary) : '#ffffff';
    const label = character.name.toUpperCase();
    g.strokeText(label, w / 2, h / 2 + 4);
    g.fillText(label, w / 2, h / 2 + 4);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
  });
}

/** Small circular emblem with the racing number for helmets / hood. */
export function getEmblemTexture(character) {
  return cached('emblem:' + character.id, () => {
    const s = 128;
    const c = makeCanvas(s, s);
    const g = c.getContext('2d');
    g.clearRect(0, 0, s, s);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(s / 2, s / 2, s / 2 - 4, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = hex(character.colors.accent);
    g.stroke();
    g.fillStyle = '#141418';
    g.font = '900 64px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(character.number), s / 2, s / 2 + 3);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  });
}

/**
 * Body livery for the lofted kart tub. Canvas X = U (around the hull: 0 bottom, .25 left (+X) side,
 * .5 top, .75 right (-X) side), canvas Y = V (top row = nose, bottom row = tail).
 * `ratio` = (pixels per metre along V) / (pixels per metre along U) so decals stay round.
 */
export function getLiveryTexture(character, pattern, ratio = 0.6) {
  return cached('livery:' + character.id, () => {
    const W = 1024;
    const H = 512;
    const c = makeCanvas(W, H);
    const g = c.getContext('2d');
    const P = hex(character.colors.primary);
    const S = hex(character.colors.secondary);
    const A = hex(character.colors.accent);
    g.fillStyle = P;
    g.fillRect(0, 0, W, H);

    // lower two-tone skirt (around the bottom seam)
    const skirt = 0.13 * W;
    g.fillStyle = S;
    g.fillRect(0, 0, skirt, H);
    g.fillRect(W - skirt, 0, skirt, H);
    g.fillStyle = A;
    g.fillRect(skirt - 8, 0, 8, H);
    g.fillRect(W - skirt, 0, 8, H);

    // side decal helper: draws in a local frame where +x = towards the tail on that side and +y = down.
    const side = (u, fn) => {
      g.save();
      g.translate(u * W, 0);
      if (u < 0.5) g.rotate(Math.PI / 2);
      else g.rotate(-Math.PI / 2);
      // after rotation local x runs along V; scale so that 1 local unit ~ 1 unrotated pixel along U
      fn(g);
      g.restore();
    };

    const drawRoundel = (u, vCenter) => {
      side(u, (gg) => {
        const sx = ratio; // local x is along V (compressed)
        const ly = 0;
        const lx = u < 0.5 ? vCenter : -vCenter;
        gg.save();
        gg.translate(lx, ly);
        gg.scale(sx, 1);
        gg.fillStyle = '#ffffff';
        gg.beginPath();
        gg.arc(0, 0, 62, 0, Math.PI * 2);
        gg.fill();
        gg.lineWidth = 10;
        gg.strokeStyle = S;
        gg.stroke();
        gg.fillStyle = '#141418';
        gg.font = '900 74px "Arial Black", Arial, sans-serif';
        gg.textAlign = 'center';
        gg.textBaseline = 'middle';
        gg.fillText(String(character.number), 0, 4);
        gg.restore();
      });
    };

    const top = 0.5 * W;
    if (pattern === 'stripes') {
      g.fillStyle = S;
      g.fillRect(top - 70, 0, 50, H);
      g.fillRect(top + 20, 0, 50, H);
      g.fillStyle = A;
      g.fillRect(top - 82, 0, 8, H);
      g.fillRect(top + 74, 0, 8, H);
    } else if (pattern === 'dots') {
      g.fillStyle = S;
      for (let y = 0; y < H; y += 46) {
        for (let x = 0; x < W; x += 64) {
          const ox = (Math.floor(y / 46) % 2) * 32;
          g.beginPath();
          g.ellipse(x + ox, y + 12, 15, 15 * ratio * 1.6, 0, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.fillStyle = A;
      g.fillRect(top - 40, 0, 80, H);
      g.fillStyle = S;
      g.fillRect(top - 10, 0, 20, H);
    } else if (pattern === 'waves') {
      g.strokeStyle = S;
      g.lineWidth = 16;
      for (let k = 0; k < 3; k++) {
        for (const base of [0.25, 0.75]) {
          g.beginPath();
          for (let y = 0; y <= H; y += 8) {
            const x = base * W + (k - 1) * 46 + Math.sin(y * 0.05 + k) * 14;
            if (y === 0) g.moveTo(x, y);
            else g.lineTo(x, y);
          }
          g.stroke();
        }
      }
      g.fillStyle = A;
      g.fillRect(top - 30, 0, 60, H);
      g.fillStyle = '#ffffff';
      g.fillRect(top - 8, 0, 16, H);
    } else if (pattern === 'flames') {
      // hot-rod flames licking back from the nose on both sides and over the hood
      const flame = (cx, dir) => {
        const cols = [A, '#ff5a1f', '#ffe066'];
        for (let layer = 0; layer < 3; layer++) {
          g.fillStyle = cols[layer];
          const s = 1 - layer * 0.28;
          g.beginPath();
          g.moveTo(cx - 150 * s, 0);
          for (let i = 0; i <= 6; i++) {
            const x = cx - 150 * s + (300 * s * i) / 6;
            const len = (200 + ((i * 53) % 90)) * s * (i % 2 ? 0.7 : 1);
            g.quadraticCurveTo(x - 20 * dir, len * 0.6, x + 12 * dir, len);
            g.quadraticCurveTo(x + 30 * dir, len * 0.5, x + (300 * s) / 12, 0);
          }
          g.closePath();
          g.fill();
        }
      };
      flame(0.25 * W, 1);
      flame(0.75 * W, -1);
      flame(0.5 * W, 1);
    } else if (pattern === 'checker') {
      const sq = 34;
      for (const base of [0.25, 0.75]) {
        for (let y = 0; y < H; y += sq * ratio * 1.7) {
          for (let k = -2; k < 2; k++) {
            const odd = (Math.floor(y / (sq * ratio * 1.7)) + k) % 2 === 0;
            g.fillStyle = odd ? S : '#ffffff';
            g.fillRect(base * W + k * sq, y, sq, sq * ratio * 1.7);
          }
        }
      }
      g.fillStyle = S;
      g.fillRect(top - 60, 0, 120, H);
      g.fillStyle = A;
      g.fillRect(top - 10, 0, 20, H);
    } else if (pattern === 'circuit') {
      g.strokeStyle = A;
      g.fillStyle = A;
      g.lineWidth = 6;
      let seed = 7;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 46; i++) {
        let x = rnd() * W;
        let y = rnd() * H;
        g.beginPath();
        g.moveTo(x, y);
        for (let k = 0; k < 3; k++) {
          if (rnd() < 0.5) x += (rnd() - 0.5) * 140;
          else y += (rnd() - 0.5) * 140;
          g.lineTo(x, y);
        }
        g.stroke();
        g.beginPath();
        g.arc(x, y, 9, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = S;
      g.fillRect(top - 50, 0, 100, H);
      g.fillStyle = A;
      g.fillRect(top - 6, 0, 12, H);
    } else if (pattern === 'leaves') {
      g.fillStyle = S;
      g.fillRect(top - 46, 0, 92, H);
      let seed = 3;
      const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      for (let i = 0; i < 26; i++) {
        const x = (0.16 + rnd() * 0.68) * W;
        const y = rnd() * H;
        g.save();
        g.translate(x, y);
        g.rotate(rnd() * Math.PI * 2);
        g.scale(1, ratio * 1.6);
        g.fillStyle = i % 3 === 0 ? A : '#2a7a3e';
        g.beginPath();
        g.ellipse(0, 0, 26, 12, 0, 0, Math.PI * 2);
        g.fill();
        g.restore();
      }
    }

    // nose and tail bands
    g.fillStyle = S;
    g.fillRect(0, 0, W, 10);
    drawRoundel(0.25, H * 0.42);
    drawRoundel(0.75, H * 0.42);

    // subtle panel lines
    g.strokeStyle = 'rgba(0,0,0,0.18)';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(0, H * 0.7);
    g.lineTo(W, H * 0.7);
    g.stroke();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  });
}
