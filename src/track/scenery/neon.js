/**
 * Neon Skyway: a glowing rainbow-grid ribbon floating among the stars.
 * Sections without rails (void), glowing rails with energy fences, neon arches,
 * a light pillar inside the spiral, planets, crystals and a synthwave floor far below.
 */
import * as THREE from 'three';
import { createRng, smoothstep } from '../util.js';
import { makeNeonGrid, makePlanetTexture, makeBanner, createCanvas, canvasTexture } from '../build/textures.js';
import { buildRoadMesh, buildCurbs, buildBarriers, buildStartLine, buildBoostPads, buildRamps, findRuns } from '../build/road.js';
import { makeInstanced } from '../build/scatter.js';
import * as P from '../build/props.js';

const HUE_GLSL = /* glsl */ `
vec3 hue2rgb(float h) { vec3 k = vec3(0.0, 2.0 / 3.0, 1.0 / 3.0); return clamp(abs(fract(h + k) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
`;

export async function build(ctx) {
  const { path, density } = ctx;
  const rng = createRng(4321);
  const N = path.count;
  const L = path.length;
  const uTime = { value: 0 };
  ctx.animators.push((dt, time) => {
    uTime.value = time;
  });
  const hue = (d) => new THREE.Color().setHSL(((d / L) * 3 + 0.55) % 1, 1, 0.55);

  // ---- road -------------------------------------------------------------------------------
  const grid = makeNeonGrid();
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x0b0a1c, metalness: 0.6, roughness: 0.26, emissive: 0xffffff, emissiveMap: grid, emissiveIntensity: 1.1 });
  roadMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\n${HUE_GLSL}`)
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        float along = vEmissiveMapUv.y;
        vec3 rb = hue2rgb(fract(along * 0.06 - uTime * 0.05));
        vec3 base = mix(vec3(0.2, 0.85, 1.0), vec3(1.0, 0.25, 0.85), smoothstep(0.3, 0.7, abs(vEmissiveMapUv.x - 0.5) * 2.0));
        float pulse = smoothstep(0.9, 1.0, fract(along * 0.1 - uTime * 0.45));
        totalEmissiveRadiance *= mix(base, rb, 0.6) * (1.0 + pulse * 3.0);`,
      );
  };
  roadMat.customProgramCacheKey = () => 'neon-road';
  buildRoadMesh(ctx, roadMat, { texLen: 24, cols: [-1, -0.5, 0, 0.5, 1] });

  // ---- deck: aprons (hw -> ext), glowing edges, underside --------------------------------------
  {
    const T = 1.4; // slab thickness
    const pos = [];
    const col = [];
    const uv = [];
    const edgePos = [];
    const edgeCol = [];
    const underPos = [];
    const p = new THREE.Vector3();
    const push = (arr, k, lat, up) => {
      p.set(path.px[k] + path.rx[k] * lat + path.ux[k] * up, path.py[k] + path.ry[k] * lat + path.uy[k] * up, path.pz[k] + path.rz[k] * lat + path.uz[k] * up);
      arr.push(p.x, p.y, p.z);
    };
    const ext = (k) => (Number.isNaN(path.wall[k]) ? path.hw[k] + 1 : path.wall[k]);
    for (let k = 0; k < N; k++) {
      const j = (k + 1) % N;
      const voidK = Number.isNaN(path.wall[k]);
      const cA = voidK ? new THREE.Color(1.0, 0.25, 0.8) : new THREE.Color(0.35, 0.25, 0.9);
      const hk = hue(k * path.spacing);
      const hj = hue(j * path.spacing);
      for (const side of [-1, 1]) {
        // apron top: quads (k,hw)-(k,ext)-(j,hw)-(j,ext)
        const quad = [
          [k, path.hw[k]],
          [k, ext(k)],
          [j, path.hw[j]],
          [j, ext(j)],
        ];
        const order = side > 0 ? [0, 1, 2, 1, 3, 2] : [0, 2, 1, 1, 2, 3];
        for (const o of order) {
          const [kk, l] = quad[o];
          push(pos, kk, side * l, 0.005);
          col.push(cA.r, cA.g, cA.b);
          uv.push((o % 2) * 0.25, (kk === k ? k : k + 1) * path.spacing / 3);
        }
        // glowing edge (vertical face at ext, down to -T)
        const e = [
          [k, 0, hk],
          [k, -T, hk],
          [j, 0, hj],
          [j, -T, hj],
        ];
        const eo = side > 0 ? [0, 2, 1, 1, 2, 3] : [0, 1, 2, 1, 3, 2];
        for (const o of eo) {
          const [kk, up, cc] = e[o];
          push(edgePos, kk, side * ext(kk), up);
          const glow = up === 0 ? 1.6 : 0.5;
          edgeCol.push(cc.r * glow, cc.g * glow, cc.b * glow);
        }
      }
      // underside (faces down)
      const u = [
        [k, -ext(k)],
        [k, ext(k)],
        [j, -ext(j)],
        [j, ext(j)],
      ];
      for (const o of [0, 2, 1, 1, 2, 3]) {
        const [kk, l] = u[o];
        push(underPos, kk, l, -T);
      }
    }
    const apronMat = new THREE.MeshStandardMaterial({ color: 0x120c2c, metalness: 0.5, roughness: 0.35, emissive: 0xffffff, emissiveMap: makeNeonGrid({ cells: 4, edge: 0.02 }), emissiveIntensity: 0.6, vertexColors: true });
    apronMat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_COLOR\ntotalEmissiveRadiance *= vColor.rgb;\n#endif');
    };
    apronMat.customProgramCacheKey = () => 'neon-apron';
    const g1 = new THREE.BufferGeometry();
    g1.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g1.setAttribute('color', new THREE.Float32BufferAttribute(col.map((v) => Math.min(1, v * 0.25 + 0.1)), 3));
    g1.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g1.computeVertexNormals();
    const apron = new THREE.Mesh(g1, apronMat);
    apron.receiveShadow = true;
    apron.name = 'NeonApron';
    ctx.root.add(apron);
    // rim colour (bright magenta on void edges) via a second pass: thin glowing stripe at the outer edge
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.Float32BufferAttribute(edgePos, 3));
    g2.setAttribute('color', new THREE.Float32BufferAttribute(edgeCol, 3));
    const edges = new THREE.Mesh(g2, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    edges.name = 'NeonEdges';
    ctx.root.add(edges);
    const g3 = new THREE.BufferGeometry();
    g3.setAttribute('position', new THREE.Float32BufferAttribute(underPos, 3));
    g3.computeVertexNormals();
    const under = new THREE.Mesh(g3, new THREE.MeshStandardMaterial({ color: 0x0a0618, metalness: 0.7, roughness: 0.4, emissive: 0x2a0a4a, emissiveIntensity: 0.6 }));
    under.name = 'NeonUnderside';
    ctx.root.add(under);
  }

  // void-edge hazard stripes (hw -> hw+1 where there is no rail)
  {
    const runs = findRuns(N, (k) => Number.isNaN(path.wall[k]));
    const pos = [];
    const col = [];
    const p = new THREE.Vector3();
    const ca = new THREE.Color(1.6, 0.2, 1.2);
    const cb = new THREE.Color(0.15, 1.4, 1.6);
    for (const run of runs) {
      for (let r = run.start; r < run.end; r++) {
        const k = r % N;
        const j = (r + 1) % N;
        const c = Math.floor((k * path.spacing) / 2) % 2 ? ca : cb;
        for (const side of [-1, 1]) {
          const q = [
            [k, path.hw[k] + 0.1],
            [k, path.hw[k] + 1],
            [j, path.hw[j] + 0.1],
            [j, path.hw[j] + 1],
          ];
          const order = side > 0 ? [0, 1, 2, 1, 3, 2] : [0, 2, 1, 1, 2, 3];
          for (const o of order) {
            const [kk, l] = q[o];
            p.set(path.px[kk] + path.rx[kk] * side * l + path.ux[kk] * 0.02, path.py[kk] + path.ry[kk] * side * l + path.uy[kk] * 0.02, path.pz[kk] + path.rz[kk] * side * l + path.uz[kk] * 0.02);
            pos.push(p.x, p.y, p.z);
            col.push(c.r, c.g, c.b);
          }
        }
      }
    }
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      m.name = 'VoidStripes';
      ctx.root.add(m);
    }
  }
  await ctx.yield(0.3);

  // ---- rails + energy fences ----------------------------------------------------------------------
  {
    const railMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    buildBarriers(ctx, {
      material: railMat,
      name: 'NeonRailTop',
      castShadow: false,
      profile: [
        [0, 0.95],
        [0, 1.2],
        [0.22, 1.2],
        [0.22, 0.95],
        [0, 0.95],
      ],
      colorFn: (d) => hue(d).multiplyScalar(1.7),
    });
    buildBarriers(ctx, {
      material: railMat,
      name: 'NeonRailBase',
      castShadow: false,
      profile: [
        [0, 0],
        [0, 0.22],
        [0.4, 0.22],
        [0.4, 0],
      ],
      colorFn: (d) => hue(d + 40).multiplyScalar(1.2),
    });
    // energy fence
    const fenceMat = new THREE.ShaderMaterial({
      uniforms: { uTime },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUv; varying vec3 vCol;
        attribute vec3 color;
        void main() { vUv = uv; vCol = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; varying vec2 vUv; varying vec3 vCol;
        void main() {
          float h = clamp(vUv.x / 1.1, 0.0, 1.0);
          float fade = (1.0 - h) * (1.0 - h);
          float scan = 0.55 + 0.45 * sin(vUv.y * 6.0 - uTime * 4.0);
          float hexl = smoothstep(0.92, 1.0, abs(sin(vUv.y * 3.14159 * 2.0))) * 0.6;
          gl_FragColor = vec4(vCol * (fade * 0.35 * scan + hexl * fade * 0.4), 1.0);
        }`,
    });
    buildBarriers(ctx, {
      material: fenceMat,
      name: 'EnergyFence',
      castShadow: false,
      profile: [
        [0.1, 0.25],
        [0.1, 2.4],
      ],
      colorFn: (d) => hue(d),
    });
    // posts
    const posts = [];
    for (let d = 0; d < L; d += 6) {
      const k = Math.floor(d / path.spacing) % N;
      if (Number.isNaN(path.wall[k])) continue;
      for (const side of [-1, 1]) {
        const f = path.frameAt(d, side * (path.wall[k] + 0.11));
        posts.push({ x: f.position.x, y: f.position.y, z: f.position.z, ry: Math.atan2(f.tangent.x, f.tangent.z) });
      }
    }
    const postGeo = new THREE.BoxGeometry(0.18, 1.2, 0.18);
    postGeo.translate(0, 0.6, 0);
    makeInstanced(ctx, postGeo, new THREE.MeshStandardMaterial({ color: 0x1a1430, metalness: 0.8, roughness: 0.3 }), posts, { castShadow: false, name: 'RailPosts' });
  }

  buildCurbs(ctx, { colors: [0x18f0ff, 0xff2fd6], emissive: true, minCurv: 1 / 70 });
  buildStartLine(ctx, { neon: true, frameColor: 0x35f3ff, accent: 0xff3fd8 });
  buildBoostPads(ctx, { colA: 0x3ff6ff, colB: 0x7a2bff, edge: 0xffffff, glow: 2.2 });
  buildRamps(ctx, { topColors: { a: '#3ff6ff', b: '#2a0a4a' }, sideColor: 0x1a1030, emissive: true });
  await ctx.yield(0.45);

  // ---- neon arches over the road ----------------------------------------------------------------
  {
    const items = [];
    for (let d = 40; d < L - 20; d += 95) {
      const k = Math.floor(d / path.spacing) % N;
      if (Math.abs(path.curvature[k]) > 1 / 70) continue;
      items.push(d);
    }
    if (items.length) {
      const maxExt = path.maxExtent + 2.5;
      const torus = new THREE.TorusGeometry(1, 0.035, 8, 64, Math.PI);
      const mesh = new THREE.InstancedMesh(torus, new THREE.MeshBasicMaterial({ color: 0xffffff }), items.length * 2);
      const o = new THREE.Object3D();
      let i = 0;
      items.forEach((d, n) => {
        const k = Math.floor(d / path.spacing) % N;
        const ext = (Number.isNaN(path.wall[k]) ? path.hw[k] + 1 : path.wall[k]) + 2.5;
        for (const off of [0, 1.6]) {
          ctx.placeOnTrack(o, d + off, 0, 0);
          o.scale.setScalar(ext);
          o.updateMatrix();
          mesh.setMatrixAt(i, o.matrix);
          mesh.setColorAt(i, new THREE.Color().setHSL((n * 0.17 + off * 0.1) % 1, 1, 0.5).multiplyScalar(1.15));
          i++;
        }
      });
      mesh.name = 'NeonArches';
      mesh.computeBoundingSphere();
      ctx.root.add(mesh);
      void maxExt;
    }
  }

  // ---- spiral light pillar --------------------------------------------------------------------------
  {
    const d0 = ctx.ref('spiral@0');
    const d1 = ctx.ref('spiral@1');
    // centre of the arc: average of points offset to the inside (right) by the radius
    const c = new THREE.Vector3();
    let n = 0;
    for (let d = d0; d < d1; d += 10) {
      const f = path.frameAt(d, 0);
      const r = new THREE.Vector3(f.right.x, 0, f.right.z).normalize();
      c.add(f.position.clone().addScaledVector(r, 55));
      n++;
    }
    c.divideScalar(n);
    const colGeo = new THREE.CylinderGeometry(4, 4, 260, 24, 1, true);
    const colMat = new THREE.ShaderMaterial({
      uniforms: { uTime },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){ vUv = uv; vec4 wp = modelMatrix * vec4(position,1.0); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `uniform float uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        ${HUE_GLSL}
        void main(){
          float rim = 1.0 - abs(dot(vN, vV));
          float bands = 0.5 + 0.5 * sin(vUv.y * 120.0 - uTime * 6.0);
          vec3 c = hue2rgb(fract(vUv.y * 2.0 - uTime * 0.1));
          float fade = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.7, vUv.y);
          gl_FragColor = vec4(c * (0.25 + rim * 1.4) * (0.6 + 0.4 * bands) * fade, 1.0);
        }`,
    });
    const col = new THREE.Mesh(colGeo, colMat);
    col.position.set(c.x, path.bounds.minY - 60, c.z);
    col.name = 'SpiralPillar';
    ctx.root.add(col);
    // core
    const core = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 260, 12), new THREE.MeshBasicMaterial({ color: 0xe8f8ff }));
    core.position.copy(col.position);
    ctx.root.add(core);
    // rotating rings
    const rings = [];
    for (let i = 0; i < 5; i++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(9 + i * 3, 0.25, 6, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(i * 0.18, 1, 0.6).multiplyScalar(1.6) }));
      r.position.set(c.x, path.bounds.minY - 10 + i * 12, c.z);
      r.rotation.x = Math.PI / 2;
      ctx.root.add(r);
      rings.push(r);
    }
    ctx.animators.push((dt, time) => {
      rings.forEach((r, i) => {
        r.rotation.x = Math.PI / 2 + Math.sin(time * 0.5 + i) * 0.25;
        r.rotation.y = Math.cos(time * 0.4 + i * 1.3) * 0.25;
        r.position.y = path.bounds.minY - 10 + i * 12 + Math.sin(time * 0.8 + i) * 2;
      });
    });
  }
  await ctx.yield(0.6);

  // ---- floating crystals & asteroids -------------------------------------------------------------
  {
    const items = [];
    const n = Math.round(90 * density) + 20;
    const b = path.bounds;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const span = Math.max(b.maxX - b.minX, b.maxZ - b.minZ);
    let tries = 0;
    while (items.length < n && tries++ < 5000) {
      const a = rng() * Math.PI * 2;
      const r = span * 0.2 + rng() * span * 1.1;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const y = b.minY - 70 + rng() * 150;
      const l = path.locate(x, z, 80, {});
      if (l && l.absLateral < l.extent + 25 && Math.abs(y - l.centerY) < 30) continue;
      items.push({ x, y, z, s: 2 + rng() * 7, ph: rng() * 6, sp: 0.2 + rng() * 0.5, color: new THREE.Color().setHSL(rng() < 0.5 ? 0.52 + rng() * 0.06 : 0.82 + rng() * 0.08, 1, 0.55) });
    }
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.4, roughness: 0.15, flatShading: true });
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n#if defined(USE_COLOR) || defined(USE_INSTANCING_COLOR)\ntotalEmissiveRadiance += vColor.rgb * 0.7;\n#endif',
      );
    };
    mat.customProgramCacheKey = () => 'neon-crystal';
    const geo = P.crystal(3);
    // crystal() bakes white vertex colours; drop them so instance colours drive the look
    geo.deleteAttribute('color');
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    items.forEach((it, i) => mesh.setColorAt(i, it.color));
    const upd = (time) => {
      items.forEach((it, i) => {
        e.set(Math.sin(time * it.sp + it.ph) * 0.4, time * it.sp + it.ph, 0.3);
        q.setFromEuler(e);
        v.set(it.x, it.y + Math.sin(time * 0.6 + it.ph) * 2, it.z);
        s.setScalar(it.s);
        m4.compose(v, q, s);
        mesh.setMatrixAt(i, m4);
      });
      mesh.instanceMatrix.needsUpdate = true;
    };
    upd(0);
    mesh.frustumCulled = false;
    mesh.name = 'Crystals';
    ctx.root.add(mesh);
    ctx.animators.push((dt, time) => upd(time));
    // dark asteroids
    const rocks = [];
    for (let i = 0; i < Math.round(60 * density); i++) {
      const a = rng() * Math.PI * 2;
      const r = span * 0.3 + rng() * span * 1.3;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const y = b.minY - 120 + rng() * 220;
      const l = path.locate(x, z, 80, {});
      if (l && l.absLateral < l.extent + 30) continue;
      rocks.push({ x, y, z, s: 3 + rng() * 12, ry: rng() * 6, rx: rng() * 6 });
    }
    makeInstanced(ctx, P.rock(17, { colors: [0x1a1530, 0x4a3a7a] }), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }), rocks, { castShadow: false, name: 'Asteroids' });
  }

  // ---- holographic billboard by the start ----------------------------------------------------------
  {
    const tex = makeBanner('NEON SKYWAY', { bg: '#12052e', bg2: '#05010f', fg: '#ff5fe0', stroke: '#35f3ff', checker: false });
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false });
    for (const [d, side] of [
      [60, -1],
      [L - 70, 1],
    ]) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(30, 5.6), mat);
      const k = Math.floor(path.wrapDistance(d) / path.spacing) % N;
      ctx.placeOnTrack(m, d, side * (path.wall[k] + 9), 7);
      m.rotateY(side > 0 ? Math.PI / 2 : -Math.PI / 2);
      ctx.root.add(m);
      const base = m.position.y;
      ctx.animators.push((dt, time) => {
        m.position.y = base + Math.sin(time * 1.2 + d) * 0.4;
      });
    }
  }
  await ctx.yield(0.72);

  // ---- planets ------------------------------------------------------------------------------------------
  {
    const b = path.bounds;
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;
    const dir0 = Math.atan2(path.tz[0], path.tx[0]); // roughly ahead of the start
    const planet = (r, dist, ang, elev, texOpts, ring) => {
      const tex = makePlanetTexture(texOpts);
      const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, fog: false, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.18 });
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32), mat);
      m.position.set(cx + Math.cos(ang) * dist, elev, cz + Math.sin(ang) * dist);
      m.rotation.z = 0.3;
      ctx.root.add(m);
      if (ring) {
        const c = createCanvas(256, 8);
        const g = c.getContext('2d');
        const gr = g.createLinearGradient(0, 0, 256, 0);
        gr.addColorStop(0, 'rgba(255,200,255,0)');
        gr.addColorStop(0.2, 'rgba(255,170,240,0.55)');
        gr.addColorStop(0.45, 'rgba(160,220,255,0.25)');
        gr.addColorStop(0.6, 'rgba(255,230,250,0.6)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, 256, 8);
        const rt = canvasTexture(c, { repeat: false });
        const rg = new THREE.RingGeometry(r * 1.3, r * 2.3, 96, 1);
        // radial uv
        const pos = rg.attributes.position;
        const uv = rg.attributes.uv;
        for (let i = 0; i < pos.count; i++) {
          const rr = Math.hypot(pos.getX(i), pos.getY(i));
          uv.setXY(i, (rr - r * 1.3) / (r * 1.0), 0.5);
        }
        const ringM = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ map: rt, transparent: true, side: THREE.DoubleSide, fog: false, depthWrite: false }));
        ringM.position.copy(m.position);
        ringM.rotation.set(-Math.PI / 2 + 0.35, 0.2, 0.15);
        ctx.root.add(ringM);
      }
      ctx.animators.push((dt, time) => {
        m.rotation.y = time * 0.01;
      });
      return m;
    };
    planet(260, 1700, dir0 + 0.5, 260, { seed: 3, colors: ['#ff7ad9', '#ffb36b', '#c2459a', '#5a2a8a', '#ff9ad0'] }, true);
    planet(90, 1350, dir0 + 2.4, 420, { seed: 9, colors: ['#5ad8ff', '#2a6aff', '#9af0ff', '#1a2a8a'] }, false);
    planet(55, 1100, dir0 - 1.8, 160, { seed: 15, colors: ['#9a9ab8', '#5a5a7a', '#c8c8e0'], bands: false }, false);
  }

  // ---- synthwave floor far below ------------------------------------------------------------------------
  {
    const geo = new THREE.PlaneGeometry(7000, 7000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime },
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `varying vec3 vW; void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `uniform float uTime; varying vec3 vW;
        float gridLine(float x, float w){ float f = abs(fract(x) - 0.5); return smoothstep(0.5 - w, 0.5, f); }
        void main(){
          vec2 p = vW.xz / 60.0 + vec2(0.0, uTime * 0.15);
          float l = max(gridLine(p.x, 0.035), gridLine(p.y, 0.035));
          float d = length(vW.xz - cameraPosition.xz);
          float fade = smoothstep(2600.0, 300.0, d);
          vec3 col = mix(vec3(1.0, 0.2, 0.75), vec3(0.2, 0.8, 1.0), smoothstep(0.0, 1.0, sin(vW.x * 0.002) * 0.5 + 0.5));
          gl_FragColor = vec4(col * l * 1.3 + vec3(0.06, 0.0, 0.12) * fade, (l * 0.9 + 0.25) * fade);
        }`,
    });
    const floor = new THREE.Mesh(geo, mat);
    const b = path.bounds;
    floor.position.set((b.minX + b.maxX) / 2, b.minY - 180, (b.minZ + b.maxZ) / 2);
    floor.name = 'SynthFloor';
    floor.renderOrder = -5;
    ctx.root.add(floor);
  }
  ctx.heightAt = () => -1000;
  await ctx.yield(0.95);
  void smoothstep;
}
