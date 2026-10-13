import { ITEM_INFO } from '../../core/constants.js';
import { h } from '../util.js';

/**
 * 2D canvas minimap. The track outline (glow + dark edge + road) is cached
 * to an offscreen canvas whenever the path / size changes; each frame only
 * blits it and draws markers + kart dots (player last, on top).
 */
export class Minimap {
  constructor() {
    this.canvas = h('canvas', { class: 'tk-minimap__canvas' });
    this.ctx = this.canvas.getContext('2d');
    this.el = h('div', { class: 'tk-minimap' }, h('div', { class: 'tk-minimap__bg' }), this.canvas);
    this.cache = document.createElement('canvas');
    this.cacheCtx = this.cache.getContext('2d');
    this.cachePath = null;
    this.cachePathLen = 0;
    this.px = 0;
    this.dirty = true;
    this.accent = '#22d3ff';
    this.tf = { s: 1, ox: 0, oy: 0, minX: 0, minZ: 0 };
    this._sorted = [];
  }

  setAccent(color) {
    if (color && color !== this.accent) {
      this.accent = color;
      this.cachePath = null;
    }
  }

  markDirty() {
    this.dirty = true;
  }

  _resize() {
    this.dirty = false;
    const css = this.el.clientWidth;
    if (!css) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const px = Math.max(32, Math.round(css * dpr));
    if (px !== this.px) {
      this.px = px;
      this.canvas.width = px;
      this.canvas.height = px;
      this.cache.width = px;
      this.cache.height = px;
      this.cachePath = null;
    }
    return true;
  }

  _buildCache(path, bounds) {
    const px = this.px;
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    if (bounds && Number.isFinite(bounds.minX)) {
      ({ minX, maxX, minZ, maxZ } = bounds);
    } else {
      for (const p of path) {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.z < minZ) minZ = p.z;
        if (p.z > maxZ) maxZ = p.z;
      }
    }
    const pad = px * 0.11;
    const w = Math.max(1, maxX - minX);
    const hgt = Math.max(1, maxZ - minZ);
    const s = Math.min((px - pad * 2) / w, (px - pad * 2) / hgt);
    const tf = this.tf;
    tf.s = s;
    tf.minX = minX;
    tf.minZ = minZ;
    tf.ox = (px - w * s) / 2;
    tf.oy = (px - hgt * s) / 2;

    const c = this.cacheCtx;
    c.clearRect(0, 0, px, px);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    const trace = () => {
      c.beginPath();
      for (let i = 0; i < path.length; i++) {
        const x = tf.ox + (path[i].x - minX) * s;
        const y = tf.oy + (path[i].z - minZ) * s;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.closePath();
    };
    // glow
    c.save();
    c.shadowColor = this.accent;
    c.shadowBlur = px * 0.05;
    c.strokeStyle = this.accent;
    c.globalAlpha = 0.75;
    c.lineWidth = px * 0.075;
    trace();
    c.stroke();
    c.restore();
    // dark edge
    c.strokeStyle = 'rgba(16,8,40,0.95)';
    c.lineWidth = px * 0.07;
    trace();
    c.stroke();
    // road
    c.strokeStyle = '#f4f6ff';
    c.lineWidth = px * 0.036;
    trace();
    c.stroke();
    // centre accent dashes
    c.save();
    c.strokeStyle = this.accent;
    c.lineWidth = Math.max(1, px * 0.008);
    c.setLineDash([px * 0.02, px * 0.025]);
    trace();
    c.stroke();
    c.restore();
    // start / finish line
    if (path.length > 2) {
      const a = path[0];
      const b = path[2];
      const ax = tf.ox + (a.x - minX) * s;
      const ay = tf.oy + (a.z - minZ) * s;
      const ang = Math.atan2((b.z - a.z) * s, (b.x - a.x) * s);
      c.save();
      c.translate(ax, ay);
      c.rotate(ang);
      const sz = px * 0.022;
      for (let i = -2; i < 2; i++) {
        for (let j = 0; j < 2; j++) {
          c.fillStyle = (i + j) % 2 === 0 ? '#111' : '#fff';
          c.fillRect(-sz + j * sz, i * sz, sz, sz);
        }
      }
      c.strokeStyle = '#111';
      c.lineWidth = Math.max(1, px * 0.006);
      c.strokeRect(-sz, -2 * sz, sz * 2, sz * 4);
      c.restore();
    }
    this.cachePath = path;
    this.cachePathLen = path.length;
  }

  /**
   * @param {{ path, bounds, karts, markers }} mm
   * @param {number} now ms
   */
  draw(mm, now) {
    if (!mm || !mm.path || mm.path.length < 2) return;
    if (this.dirty && !this._resize()) return;
    if (!this.px) return;
    if (mm.path !== this.cachePath || mm.path.length !== this.cachePathLen) this._buildCache(mm.path, mm.bounds);
    const c = this.ctx;
    const px = this.px;
    const tf = this.tf;
    c.clearRect(0, 0, px, px);
    c.drawImage(this.cache, 0, 0);

    // item markers
    const markers = mm.markers;
    if (markers && markers.length) {
      const r = px * 0.016;
      for (let i = 0; i < markers.length; i++) {
        const m = markers[i];
        const x = tf.ox + (m.x - tf.minX) * tf.s;
        const y = tf.oy + (m.z - tf.minZ) * tf.s;
        const color = (ITEM_INFO[m.type] && ITEM_INFO[m.type].color) || '#ffffff';
        c.beginPath();
        if (m.type && m.type.indexOf('banana') >= 0) {
          c.moveTo(x, y - r * 1.3);
          c.lineTo(x + r * 1.2, y + r);
          c.lineTo(x - r * 1.2, y + r);
          c.closePath();
        } else {
          c.arc(x, y, r, 0, Math.PI * 2);
        }
        c.fillStyle = color;
        c.fill();
        c.lineWidth = Math.max(1, px * 0.006);
        c.strokeStyle = '#120a2a';
        c.stroke();
      }
    }

    // karts — others (back-markers first so the leaders sit on top), player last
    const karts = mm.karts;
    if (!karts || !karts.length) return;
    const sorted = this._sorted;
    sorted.length = 0;
    let player = null;
    for (let i = 0; i < karts.length; i++) {
      if (karts[i].isPlayer) player = karts[i];
      else sorted.push(karts[i]);
    }
    sorted.sort((a, b) => (b.position || 0) - (a.position || 0));
    const r = px * 0.03;
    for (let i = 0; i < sorted.length; i++) this._kart(c, sorted[i], r, false, now);
    if (player) this._kart(c, player, r * 1.3, true, now);
  }

  _kart(c, k, r, isPlayer, now) {
    const tf = this.tf;
    const x = tf.ox + (k.x - tf.minX) * tf.s;
    const y = tf.oy + (k.z - tf.minZ) * tf.s;
    const fx = Math.sin(k.heading || 0);
    const fy = Math.cos(k.heading || 0);
    if (isPlayer) {
      const pulse = (now % 1100) / 1100;
      c.beginPath();
      c.arc(x, y, r * (1.2 + pulse * 1.3), 0, Math.PI * 2);
      c.strokeStyle = `rgba(255,255,255,${(0.75 * (1 - pulse)).toFixed(3)})`;
      c.lineWidth = r * 0.35;
      c.stroke();
    }
    // heading pointer
    c.beginPath();
    c.moveTo(x + fx * r * 1.9, y + fy * r * 1.9);
    c.lineTo(x - fy * r * 0.85, y + fx * r * 0.85);
    c.lineTo(x + fy * r * 0.85, y - fx * r * 0.85);
    c.closePath();
    c.fillStyle = isPlayer ? '#ffffff' : '#120a2a';
    c.fill();
    // body
    c.beginPath();
    c.arc(x, y, r, 0, Math.PI * 2);
    c.fillStyle = k.color || '#ff4d4d';
    c.fill();
    c.lineWidth = isPlayer ? r * 0.38 : r * 0.3;
    c.strokeStyle = isPlayer ? '#ffffff' : '#120a2a';
    c.stroke();
    if (isPlayer) {
      c.beginPath();
      c.arc(x, y, r + r * 0.32, 0, Math.PI * 2);
      c.lineWidth = r * 0.22;
      c.strokeStyle = '#120a2a';
      c.stroke();
    }
  }
}
