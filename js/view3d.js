import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PL, BT, CT, ZONES } from './data.js';
import { iz, ih, id_, layer, isBlind, frame, counterRuns } from './model.js';
import { colorOf, pal, topOf } from './render2d.js';

// מערכת צירים: X = x של התוכנית, Z = y של התוכנית, Y = גובה. בלי שיקוף.
const ROT = { A: 0, B: -Math.PI / 2, C: Math.PI, P: Math.PI / 2 };

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function noise(g, w, h, n, a, b, alpha) { for (let i = 0; i < n; i++) { const v = a + (b - a) * rnd(); g.fillStyle = `rgba(${v},${v},${v},${alpha})`; const r = 1 + rnd() * 2.5; g.fillRect(rnd() * w, rnd() * h, r, r); } }

const TEX = {};
function textures() {
  if (TEX.ok) return TEX;
  TEX.wood = canvasTex(512, 1024, (g, w, h) => {
    g.fillStyle = '#efe9df'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 420; i++) {
      const x = rnd() * w, wd = 0.4 + rnd() * 1.6, l = 170 + rnd() * 60;
      g.strokeStyle = `rgba(${l * 0.62},${l * 0.5},${l * 0.38},${0.05 + rnd() * 0.12})`; g.lineWidth = wd;
      g.beginPath(); g.moveTo(x, 0);
      const ph = rnd() * 6, fq = 140 + rnd() * 120;
      for (let y = 0; y <= h; y += 24) g.lineTo(x + Math.sin(y / fq + ph) * 3 + (rnd() - .5) * 0.8, y);
      g.stroke();
    }
    g.globalAlpha = 0.06; for (let i = 0; i < 30; i++) { g.fillStyle = rnd() > .5 ? '#7a5532' : '#fff'; g.fillRect(rnd() * w, 0, 4 + rnd() * 20, h); } g.globalAlpha = 1;
  });
  TEX.marble = canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = '#f6f3ee'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 6000, 200, 240, 0.05);
    g.filter = 'blur(1.2px)';
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = i % 3 ? 'rgba(150,145,140,0.35)' : 'rgba(176,148,100,0.55)'; g.lineWidth = 1 + rnd() * 4;
      g.beginPath(); let x = rnd() * w, y = -20; g.moveTo(x, y);
      while (y < h + 20) { x += (rnd() - .45) * 90; y += 40 + rnd() * 60; g.lineTo(x, y); }
      g.stroke();
    }
    g.filter = 'none';
  });
  TEX.quartz = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#efeeea'; g.fillRect(0, 0, w, h); noise(g, w, h, 9000, 160, 255, 0.25); noise(g, w, h, 600, 90, 130, 0.35); });
  TEX.concrete = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#a19e98'; g.fillRect(0, 0, w, h);
    g.filter = 'blur(14px)'; for (let i = 0; i < 60; i++) { const v = 130 + rnd() * 60; g.fillStyle = `rgba(${v},${v - 2},${v - 6},0.35)`; g.beginPath(); g.arc(rnd() * w, rnd() * h, 20 + rnd() * 60, 0, 7); g.fill(); }
    g.filter = 'none'; noise(g, w, h, 8000, 80, 200, 0.18);
    for (let i = 0; i < 120; i++) { g.fillStyle = 'rgba(70,68,64,0.35)'; g.beginPath(); g.arc(rnd() * w, rnd() * h, rnd() * 1.6, 0, 7); g.fill(); }
  });
  TEX.floor = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#d9d4cb'; g.fillRect(0, 0, w, h); noise(g, w, h, 7000, 170, 235, 0.12);
    g.fillStyle = '#b9b3a8'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h);
  });
  TEX.plaster = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#f3f1ec'; g.fillRect(0, 0, w, h); noise(g, w, h, 4000, 225, 255, 0.12); });
  TEX.ok = true;
  return TEX;
}

function ringsTex(n) {
  return canvasTex(512, 340, (g, w, h) => {
    g.fillStyle = '#0e0f10'; g.fillRect(0, 0, w, h);
    const cols = n >= 3 ? 3 : 2;
    const pos = cols === 3 ? [[.2, .32], [.2, .72], [.5, .5], [.8, .32], [.8, .72]] : [[.27, .3], [.27, .72], [.73, .3], [.73, .72]];
    g.strokeStyle = 'rgba(200,200,205,0.55)'; g.lineWidth = 3;
    for (const [x, y] of pos) { g.beginPath(); g.arc(x * w, y * h, h * 0.16, 0, 7); g.stroke(); }
    g.fillStyle = 'rgba(220,220,225,0.6)'; g.font = '18px sans-serif'; g.fillText('– +', w * .45, h * .95);
  }, false);
}

function boxUV(geo, w, h, d) {
  const uv = geo.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / 100, uv.getY(i) * dims[f][1] / 100); }
  return geo;
}

function labelSprite(text, color = '#2a2925', size = 1) {
  const c = document.createElement('canvas'); const g = c.getContext('2d');
  g.font = 'bold 56px Rubik, Arial, sans-serif';
  const w = Math.ceil(g.measureText(text).width) + 48; c.width = w; c.height = 84;
  g.font = 'bold 56px Rubik, Arial, sans-serif'; g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.roundRect(0, 0, w, 84, 20); g.fill();
  g.fillStyle = color; g.fillText(text, w / 2, 44);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
  s.scale.set(w / 84 * 0.28 * size, 0.28 * size, 1); s.renderOrder = 10;
  s.userData.label = true;
  return s;
}

export function create3D(container, cb = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: false });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.495; controls.minDistance = 0.5; controls.maxDistance = 14;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const root = new THREE.Group(); root.scale.setScalar(0.01); scene.add(root);
  const kitchen = new THREE.Group(); root.add(kitchen);
  const roomG = new THREE.Group(); root.add(roomG);
  const labels = new THREE.Group(); scene.add(labels);
  const hemi = new THREE.HemisphereLight(0xffffff, 0xb8b0a4, 0.6); scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.6); scene.add(sun); scene.add(sun.target);
  const fill = new THREE.PointLight(0xfff4e6, 6, 8, 1.6); scene.add(fill);
  const amb = new THREE.AmbientLight(0xffffff, 0.0); scene.add(amb);
  let mode = 'real', quality = matchMedia('(max-width: 800px)').matches ? 'low' : 'high', state = null, selId = null, showLabels = true;
  let walk = null; const keys = {};
  let needs = true, raf = 0, disposed = false;
  const mats = new Map();
  let selBox = null;

  function M(key, make) { if (!mats.has(key)) mats.set(key, make()); return mats.get(key); }
  function mat(kind, color = '#ffffff', opts = {}) {
    const real = mode === 'real';
    const tx = real ? textures() : null;
    const key = `${mode}|${kind}|${color}|${JSON.stringify(opts)}`;
    return M(key, () => {
      if (!real) {
        const base = { steel: '#c6c9cd', dark: '#2a2b2e', glass: '#30343a', black: '#1c1d1f', floor: '#ece8e1', wall: '#f5f3ee', winglass: '#cfe6f7', chrome: '#d0d3d6', grout: '#555', gola: '#3a3a3a', plinth: '#555', frame: '#444', seat: '#6e655b' }[kind] || color;
        const m = new THREE.MeshLambertMaterial({ color: base });
        if (kind === 'bowl') { m.color.set('#b9bcbf'); m.side = THREE.BackSide; }
        if (kind === 'winglass') { m.transparent = true; m.opacity = .45; }
        return m;
      }
      switch (kind) {
        case 'front': {
          const m = new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0 });
          if (opts.finish === 'oak') { m.map = tx.wood; m.roughness = 0.55; }
          return m;
        }
        case 'carcass': return new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
        case 'gola': return new THREE.MeshStandardMaterial({ color: '#2b2b2c', roughness: 0.45, metalness: 0.6 });
        case 'plinth': return new THREE.MeshStandardMaterial({ color: '#2f2f30', roughness: 0.8 });
        case 'steel': return new THREE.MeshStandardMaterial({ color: '#e2e4e6', roughness: 0.38, metalness: 0.8, envMapIntensity: 1.4 });
        case 'chrome': return new THREE.MeshStandardMaterial({ color: '#eceef0', roughness: 0.08, metalness: 1 });
        case 'bowl': return new THREE.MeshStandardMaterial({ color: '#c9cbcd', roughness: 0.32, metalness: 1, side: THREE.BackSide });
        case 'black': return new THREE.MeshPhysicalMaterial({ color: '#0c0c0d', roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 });
        case 'cooktop': return new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: opts.map, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02 });
        case 'glass': return new THREE.MeshPhysicalMaterial({ color: '#1a1c1f', roughness: 0.05, metalness: 0.1, clearcoat: 1 });
        case 'dark': return new THREE.MeshStandardMaterial({ color: '#2a2b2e', roughness: 0.5, metalness: 0.3 });
        case 'counter': {
          const map = { quartz: tx.quartz, concrete: tx.concrete, marble: tx.marble }[opts.k];
          const m = new THREE.MeshPhysicalMaterial({ color: '#ffffff', map, roughness: opts.k === 'concrete' ? 0.75 : 0.22, clearcoat: opts.k === 'concrete' ? 0 : 0.5, clearcoatRoughness: 0.15 });
          if (map) { map.repeat.set(1 / 160, 1 / 160); }
          return m;
        }
        case 'counterEdge': {
          const map = { quartz: tx.quartz, concrete: tx.concrete, marble: tx.marble }[opts.k];
          return new THREE.MeshPhysicalMaterial({ color: '#ffffff', map, roughness: opts.k === 'concrete' ? 0.75 : 0.25 });
        }
        case 'floor': { const m = new THREE.MeshStandardMaterial({ map: tx.floor, roughness: 0.35 }); tx.floor.repeat.set(1 / 60, 1 / 60); return m; }
        case 'wall': { const m = new THREE.MeshStandardMaterial({ map: tx.plaster, roughness: 0.92 }); tx.plaster.repeat.set(1 / 120, 1 / 120); return m; }
        case 'winglass': return new THREE.MeshStandardMaterial({ color: '#dff0ff', emissive: '#cfe8ff', emissiveIntensity: 1.2, roughness: 0.1, transparent: true, opacity: 0.55 });
        case 'frame': return new THREE.MeshStandardMaterial({ color: '#4a4b4d', roughness: 0.45, metalness: 0.4 });
        case 'seat': return new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
        default: return new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
      }
    });
  }

  const geoms = [];
  function box(parent, x1, x2, y1, y2, z1, z2, m, cast = true) {
    const w = x2 - x1, h = y2 - y1, d = z2 - z1;
    if (w <= 0 || h <= 0 || d <= 0) return null;
    const g = boxUV(new THREE.BoxGeometry(w, h, d), w, h, d); geoms.push(g);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x1 + w / 2, y1 + h / 2, z1 + d / 2);
    mesh.castShadow = cast; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  }

  function buildItem(it, st) {
    const g = new THREE.Group();
    const f = frame(it.wall, st);
    const off = st.walls[it.wall].off || 0;
    const [px, py] = f.p(it.s, 0);
    g.position.set(px, 0, py); g.rotation.y = ROT[it.wall];
    g.userData.id = it.id; g.userData.wall = it.wall; g.userData.layer = layer(it);
    const w = it.w, d = id_(it), z1 = iz(it), z2 = z1 + ih(it);
    const c = colorOf(it, st);
    const finish = it.color ? 'matte' : pal(st).finish === 'oak' && layer(it) !== 'upper' ? 'oak' : 'matte';
    const FR = mat('front', c, { finish });
    const CA = mat('carcass', c);
    const GO = mat('gola');
    const t0 = off, t1 = off + d; // גב וחזית
    const G = 0.3; // מרווח בין חזיתות
    const fronts = (xa, xb, ya, yb) => box(g, xa + G / 2, xb - G / 2, ya + G / 2, yb - G / 2, t1 - 1.9, t1, FR);
    const L = layer(it);
    if (it.type === 'window') {
      return null;
    }
    if (L === 'blind') { box(g, 0, w, PL, BT, t0, t1 - 2, mat('carcass', c)); box(g, 0, w, 0, PL, t0, t1 - 6, mat('plinth')); return g; }
    if (L === 'base') {
      box(g, 0, w, 0, PL, t0, t1 - 6, mode === 'real' ? mat('plinth') : mat('carcass', '#555'));
      box(g, 0, w, PL, it.type === 'base_sink' ? 62 : BT, t0, t1 - 2, CA);
      if (it.type === 'base_sink') { box(g, 0, 1.8, 62, BT, t0, t1 - 2, CA); box(g, w - 1.8, w, 62, BT, t0, t1 - 2, CA); }
      const top = BT - 4;
      box(g, 0, w, top, BT, t1 - 4, t1 - 1.9, GO, false);
      if (it.type.startsWith('base_dr')) {
        const n = +it.type.slice(-1);
        const hs = n === 2 ? [PL + 38] : n === 3 ? [PL + 18, PL + 41] : [PL + 16, PL + 33, PL + 50];
        let y = PL; for (const z of hs) { fronts(0, w, y, z - 1.5); box(g, 0, w, z - 1.5, z + 1.5, t1 - 4, t1 - 1.9, GO, false); y = z + 1.5; }
        fronts(0, w, y, top);
      } else if (it.type === 'base_oven') {
        box(g, 0.5, w - 0.5, PL + 12, PL + 72, t1 - 2, t1, mat('glass')); box(g, 2, w - 2, PL + 66, PL + 70, t1, t1 + 0.4, mat('steel'));
        fronts(0, w, PL, PL + 12); fronts(0, w, PL + 72, top);
      } else if (w > 60 && !['dw', 'base_pullout', 'base_corner'].includes(it.type)) { fronts(0, w / 2, PL, top); fronts(w / 2, w, PL, top); }
      else fronts(0, w, PL, top);
      return g;
    }
    if (L === 'tall') {
      if (it.type === 'panel') { box(g, 0, w, 0, z2, t0, t1, FR); return g; }
      if (it.type === 'fridge') {
        const S = mat('steel');
        box(g, 1, w - 1, 0, z2, t0, t1 - 4, mode === 'real' ? mat('dark') : S);
        box(g, 1, w - 1, 0, 115, t1 - 4, t1, S); box(g, 1, w - 1, 115.4, z2, t1 - 4, t1, S);
        const hx = w > 75 ? w / 2 : w - 6;
        if (w > 75) { box(g, 1, w / 2 - 0.2, 115.4, z2, t1 - 4, t1, S); box(g, w / 2 + 0.2, w - 1, 115.4, z2, t1 - 4, t1, S); }
        box(g, hx - 2.5, hx - 1.5, 125, 175, t1, t1 + 3, mat('chrome')); if (w > 75) box(g, hx + 1.5, hx + 2.5, 125, 175, t1, t1 + 3, mat('chrome'));
        box(g, 6, w - 6, 104, 106, t1, t1 + 3, mat('chrome'));
        return g;
      }
      box(g, 0, w, 0, PL, t0, t1 - 6, mat('plinth'));
      box(g, 0, w, PL, z2, t0, t1 - 2, CA);
      if (it.type === 'tall_oven') {
        const stk = it.stack || {}; const n = stk.ovens ?? 2;
        let z = PL;
        if (n === 1) { fronts(0, w, z, z + 58.5); box(g, 0, w, z + 58.5, z + 60, t1 - 4, t1 - 1.9, GO, false); z += 60; }
        for (let k = 0; k < n; k++) {
          box(g, 0.3, w - 0.3, z + 0.3, z + 59.7, t1 - 2, t1, mat('black'));
          box(g, 5, w - 5, z + 6, z + 44, t1, t1 + 0.1, mat('glass'));
          box(g, 3, w - 3, z + 50, z + 52, t1, t1 + 2.5, mat('steel'));
          const zc = (stk.zones || [])[k];
          if (zc && mode !== 'real') box(g, 1, w - 1, z + 55, z + 57, t1, t1 + 0.2, mat('x', ZONES[zc].color));
          z += 60;
        }
        if (stk.mw !== false) { box(g, 0.3, w - 0.3, z + 0.3, z + 44.7, t1 - 2, t1, mat('black')); box(g, 4, w - 18, z + 7, z + 38, t1, t1 + 0.1, mat('glass')); z += 45; }
        box(g, 0, w, z, z + 3, t1 - 4, t1 - 1.9, GO, false); z += 3;
        if (z2 - z > 95) { const m = z + (z2 - z) / 2; fronts(0, w, z, m); fronts(0, w, m, z2); } else fronts(0, w, z, z2);
        return g;
      }
      const split = 175;
      const pair = (ya, yb) => { if (w > 60) { fronts(0, w / 2, ya, yb); fronts(w / 2, w, ya, yb); } else fronts(0, w, ya, yb); };
      pair(PL, split); pair(split, z2);
      return g;
    }
    if (L === 'upper') {
      const UF = mat('front', c, { finish: it.color ? 'matte' : pal(st).finish === 'oak' ? 'matte' : 'matte' });
      const ufront = (xa, xb, ya, yb) => box(g, xa + G / 2, xb - G / 2, ya + G / 2, yb - G / 2, t1 - 1.9, t1, UF);
      if (isBlind(it)) { box(g, 0, w, z1, z2, t0, t1, mat('carcass', c)); return g; }
      box(g, 0, w, z1, z2, t0, t1 - 1.9, mode === 'real' ? mat('carcass', '#e8e6e1') : mat('carcass', c));
      if (it.type === 'upper_hood') {
        box(g, 0, w, z1, z1 + 30, t0, t1 + 3, mat('steel')); box(g, 4, w - 4, z1 - 0.2, z1, t0 + 4, t1, mat('dark'), false);
        ufront(0, w, z1 + 30, z2); return g;
      }
      if (it.type === 'upper_open') {
        for (let k = 0; k <= 3; k++) box(g, 0, w, z1 + (ih(it) - 2) * k / 3, z1 + (ih(it) - 2) * k / 3 + 2.5, t0, t1, UF);
        box(g, 0, 1.8, z1, z2, t0, t1, UF); box(g, w - 1.8, w, z1, z2, t0, t1, UF);
        return g;
      }
      const hRow = ih(it) > 90 ? z2 - 40 : z2;
      if (it.type === 'upper_lift') { const m = z1 + (hRow - z1) / 2; ufront(0, w, z1, m); ufront(0, w, m, hRow); }
      else if (w > 60) { ufront(0, w / 2, z1, hRow); ufront(w / 2, w, z1, hRow); }
      else ufront(0, w, z1, hRow);
      if (hRow < z2) ufront(0, w, hRow, z2);
      return g;
    }
    if (L === 'top') {
      const cd = 60 + off; // עומק משטח
      const tc = off + (60 - d) / 2 - 2;
      if (it.type === 'cooktop') {
        const m = mode === 'real' ? M('ring' + w, () => new THREE.MeshPhysicalMaterial({ color: '#ffffff', map: ringsTex(w >= 90 ? 5 : 4), roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02 })) : mat('black');
        const gg = new THREE.BoxGeometry(w - 1, 0.6, d); geoms.push(gg);
        const mats6 = [mat('black'), mat('black'), m, mat('black'), mat('black'), mat('black')];
        const mesh = new THREE.Mesh(gg, mats6); mesh.position.set(w / 2, CT + 0.3, tc + d / 2); mesh.castShadow = true; mesh.receiveShadow = true;
        // התאמת כיוון הטקסטורה כך שהצד הקדמי פונה לחדר
        g.add(mesh);
      } else if (it.type === 'sink') {
        const dbl = (it.variant || 'single') === 'double';
        const S = mat('steel');
        const bowls = sinkBowls(it, off, d);
        for (const b of bowls) {
          const bg = new THREE.BoxGeometry(b.x2 - b.x1, 20, b.t2 - b.t1); geoms.push(bg);
          const bm = new THREE.Mesh(bg, mat('bowl')); bm.position.set((b.x1 + b.x2) / 2, CT - 10.01, (b.t1 + b.t2) / 2); bm.receiveShadow = true; g.add(bm);
          box(g, (b.x1 + b.x2) / 2 - 2.5, (b.x1 + b.x2) / 2 + 2.5, CT - 19.9, CT - 19.6, (b.t1 + b.t2) / 2 - 2.5, (b.t1 + b.t2) / 2 + 2.5, mat('dark'), false);
        }
        tap(g, w / 2, off + 3, 32, 20);
      } else if (it.type === 'water') {
        tap(g, w / 2, off + 4, 28, 14, true);
      } else if (it.type === 'urn') {
        const cg = new THREE.CylinderGeometry(w / 2 - 1, w / 2, 34, 28); geoms.push(cg);
        const u = new THREE.Mesh(cg, mat('steel')); u.position.set(w / 2, CT + 17, off + 15); u.castShadow = true; g.add(u);
        box(g, w / 2 - 2, w / 2 + 2, CT + 6, CT + 9, off + 15 + w / 2 - 1, off + 15 + w / 2 + 3, mat('black'));
      } else if (it.type === 'plata') {
        box(g, 0, w, CT, CT + 2, off + 6, off + 6 + d, mat('black'));
      }
      return g;
    }
    return g;
  }
  function sinkBowls(it, off, d) {
    const dbl = (it.variant || 'single') === 'double';
    const w = it.w, t1 = off + 10, t2 = off + 10 + Math.min(d, 42);
    if (!dbl) return [{ x1: 4, x2: w - 4, t1, t2 }];
    return [{ x1: 3, x2: w / 2 - 2, t1, t2 }, { x1: w / 2 + 2, x2: w - 3, t1, t2 }];
  }
  function tap(g, x, t, h, reach, thin = false) {
    const C = mat('chrome');
    const r = thin ? 0.9 : 1.4;
    const cyl = new THREE.CylinderGeometry(r * 1.6, r * 1.8, 4, 20); geoms.push(cyl);
    const b = new THREE.Mesh(cyl, C); b.position.set(x, CT + 2, t); b.castShadow = true; g.add(b);
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x, CT + 3, t), new THREE.Vector3(x, CT + h * 0.8, t), new THREE.Vector3(x, CT + h, t + reach * 0.3), new THREE.Vector3(x, CT + h * 0.9, t + reach), new THREE.Vector3(x, CT + h * 0.72, t + reach + 1)]);
    const tg = new THREE.TubeGeometry(curve, 40, r, 12, false); geoms.push(tg);
    const m = new THREE.Mesh(tg, C); m.castShadow = true; g.add(m);
  }

  function buildCounters(st) {
    const k = topOf(st).kind;
    const CM = mode === 'real' ? mat('counter', '#fff', { k }) : mat('x', topOf(st).color);
    const EM = mode === 'real' ? mat('counterEdge', '#fff', { k }) : CM;
    for (const r of counterRuns(st)) {
      const g = new THREE.Group();
      const f = frame(r.wall, st);
      const [px, py] = f.p(0, 0);
      g.position.set(px, 0, py); g.rotation.y = ROT[r.wall];
      const back = r.wall === 'P' ? -(st.walls.P.overhang || 0) : 0;
      const shape = new THREE.Shape();
      shape.moveTo(r.s1, back); shape.lineTo(r.s2, back); shape.lineTo(r.s2, r.depth); shape.lineTo(r.s1, r.depth); shape.lineTo(r.s1, back);
      const off = st.walls[r.wall].off || 0;
      for (const s of st.items.filter(i => i.type === 'sink' && i.wall === r.wall && i.s >= r.s1 - 1 && i.s + i.w <= r.s2 + 1)) {
        for (const b of sinkBowls(s, off, id_(s))) {
          const h = new THREE.Path();
          const x1 = s.s + b.x1, x2 = s.s + b.x2;
          h.moveTo(x1, b.t1); h.lineTo(x1, b.t2); h.lineTo(x2, b.t2); h.lineTo(x2, b.t1); h.lineTo(x1, b.t1);
          shape.holes.push(h);
        }
      }
      const eg = new THREE.ExtrudeGeometry(shape, { depth: CT - BT, bevelEnabled: false }); geoms.push(eg);
      eg.rotateX(Math.PI / 2); eg.translate(0, CT, 0);
      const mesh = new THREE.Mesh(eg, [CM, EM]); mesh.castShadow = true; mesh.receiveShadow = true;
      g.add(mesh); kitchen.add(g);
      // פנל גב לחצי האי
      if (r.wall === 'P') { box(g, r.s1, r.s2, 0, BT, -1.8, 0, mat('front', pal(st).base, { finish: pal(st).finish === 'oak' ? 'oak' : 'matte' })); }
    }
  }

  function buildRoom(st) {
    roomG.clear();
    const { W, D, H, Pend } = st.room; const notch = st.room.notch ?? 105;
    const WM = mat('wall');
    const plane = (w, h, m) => { const g = new THREE.PlaneGeometry(w, h); geoms.push(g); const p = new THREE.Mesh(g, m); p.receiveShadow = true; return p; };
    // רצפה
    const fl = plane(W + 300, D + 300, mat('floor')); fl.rotation.x = -Math.PI / 2; fl.position.set(W / 2 - 60, 0, D / 2 + 40);
    const uv = fl.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (W + 300), uv.getY(i) * (D + 300));
    roomG.add(fl);
    // קיר המקרר (Z=0) – פונה פנימה (+Z)
    const wa = plane(W - 120, H, WM); wa.position.set(120 + (W - 120) / 2, H / 2, 0); roomG.add(wa);
    // קיר הכיריים (X=W) – פונה -X
    const wb = plane(D, H, WM); wb.rotation.y = -Math.PI / 2; wb.position.set(W, H / 2, D / 2); roomG.add(wb);
    // קיר החלון (Z=D) עם פתח לחלון – פונה -Z
    const win = st.items.find(i => i.type === 'window' && i.wall === 'C');
    const sh = new THREE.Shape(); sh.moveTo(0, 0); sh.lineTo(W - notch, 0); sh.lineTo(W - notch, H); sh.lineTo(0, H); sh.lineTo(0, 0);
    if (win) {
      const wz1 = iz(win), wz2 = wz1 + ih(win);
      const a = win.s, b = win.s + win.w; // s מהקצה המזרחי
      const hp = new THREE.Path(); hp.moveTo(a, wz1); hp.lineTo(b, wz1); hp.lineTo(b, wz2); hp.lineTo(a, wz2); hp.lineTo(a, wz1); sh.holes.push(hp);
      // זכוכית ומסגרת
      const gw = new THREE.Group(); gw.position.set(W, 0, D); gw.rotation.y = Math.PI; gw.userData.cut = 'C'; roomG.add(gw);
      const gl = plane(win.w, ih(win), mat('winglass')); gl.position.set(a + win.w / 2, (wz1 + wz2) / 2, -6); gl.castShadow = false; gl.receiveShadow = false; gw.add(gl);
      const FRm = mat('frame');
      box(gw, a, b, wz1 - 1, wz1 + 4, -9, -3, FRm); box(gw, a, b, wz2 - 4, wz2, -9, -3, FRm);
      box(gw, a - 1, a + 4, wz1, wz2, -9, -3, FRm); box(gw, b - 4, b + 1, wz1, wz2, -9, -3, FRm); box(gw, (a + b) / 2 - 2, (a + b) / 2 + 2, wz1, wz2, -8, -4, FRm);
      box(gw, a - 2, b + 2, wz1 - 2, wz1, 0, 4, mat('counterEdge', '#fff', { k: 'quartz' }));
      sun.position.set((W - a - win.w / 2) / 100 + 0.8, 3.4, (D + 260) / 100);
      sun.target.position.set((W - a - win.w / 2) / 100 - 0.4, 0, D / 200);
    }
    const sg = new THREE.ShapeGeometry(sh); geoms.push(sg);
    const wc = new THREE.Mesh(sg, WM); wc.receiveShadow = true; wc.castShadow = true;
    // ShapeGeometry ב-XY, פונה +Z. סיבוב 180° סביב Y: x -> -x, פונה -Z; ממוקם כך ש-s=0 בקצה המזרחי (X=W)
    wc.rotation.y = Math.PI; wc.position.set(W, 0, D); roomG.add(wc);
    // קיר שמאחורי חצי האי (Z=Pend)
    const wp = plane(notch + 40, H, WM); wp.rotation.y = Math.PI; wp.position.set((notch - 40) / 2, H / 2, Pend); roomG.add(wp);
    // ארון כניסה
    box(roomG, 0, 120, 0, H, -35, 10, mat('front', '#ebe9e4'));
    // כיסאות בר
    const P = st.walls.P, n = P.stools || 0;
    for (let i = 0; i < n; i++) {
      const z = Pend - P.len + P.len * (i + 0.5) / n, x = st.room.Px - P.overhang - 14;
      const cg = new THREE.CylinderGeometry(17, 17, 5, 28); geoms.push(cg);
      const seat = new THREE.Mesh(cg, mat('seat', '#6e655b')); seat.position.set(x, 66, z); seat.castShadow = true; roomG.add(seat);
      const lg = new THREE.CylinderGeometry(1.6, 1.6, 64, 10); geoms.push(lg);
      const leg = new THREE.Mesh(lg, mat('dark')); leg.position.set(x, 32, z); leg.castShadow = true; roomG.add(leg);
      const rg = new THREE.TorusGeometry(13, 1, 8, 24); geoms.push(rg);
      const ring = new THREE.Mesh(rg, mat('dark')); ring.rotation.x = Math.PI / 2; ring.position.set(x, 1, z); roomG.add(ring);
    }
    // תאורה תלויה מעל חצי האי
    const np = Math.max(1, Math.round(P.len / 70));
    for (let i = 0; i < np; i++) {
      const z = Pend - P.len + P.len * (i + 0.5) / np, x = st.room.Px + 15;
      const cord = new THREE.CylinderGeometry(0.3, 0.3, H - 175, 6); geoms.push(cord);
      const cm = new THREE.Mesh(cord, mat('dark')); cm.position.set(x, 175 + (H - 175) / 2, z); roomG.add(cm);
      const sh2 = new THREE.ConeGeometry(12, 16, 24, 1, true); geoms.push(sh2);
      const lm = new THREE.Mesh(sh2, mat('dark')); lm.position.set(x, 170, z); lm.castShadow = true; roomG.add(lm);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(3, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff3d6' })); bulb.position.set(x, 163, z); roomG.add(bulb);
    }
    fill.position.set(W / 200, 2.4, D / 200);
  }

  function buildLabels(st) {
    labels.clear();
    if (!showLabels) return;
    const { W, D, H, Pend } = st.room;
    const add = (t, x, y, z, col, s) => { const sp = labelSprite(t, col, s); sp.position.set(x / 100, y / 100, z / 100); labels.add(sp); };
    add('קיר המקרר', W / 2 + 60, H + 25, -10);
    add('קיר הכיריים', W + 10, H + 25, D / 2);
    add('קיר החלון', (W + 105) / 2, H + 25, D + 10);
    add('חצי האי', st.room.Px, 140, Pend - st.walls.P.len / 2);
    add('כניסה', -60, 40, 120, '#b5532c', 1.1);
  }

  function update(st, sel) {
    state = st; if (sel !== undefined) selId = sel;
    for (const g of geoms) g.dispose(); geoms.length = 0;
    kitchen.clear();
    renderer.shadowMap.enabled = mode === 'real' && quality === 'high';
    const real = mode === 'real';
    scene.environment = real ? envTex : null;
    scene.background = new THREE.Color(real ? '#e9e6e0' : '#f2f0eb');
    renderer.toneMapping = real ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    renderer.toneMappingExposure = real ? 0.9 : 1.0;
    hemi.intensity = real ? 0.35 : 1.6; sun.intensity = real ? 3.2 : 0.9; fill.intensity = real ? 4 : 0; amb.intensity = real ? 0 : 0.5;
    sun.castShadow = renderer.shadowMap.enabled;
    if (sun.castShadow) { const s = quality === 'high' ? 2048 : 1024; sun.shadow.mapSize.set(s, s); const c = sun.shadow.camera; c.left = -4; c.right = 4; c.top = 4; c.bottom = -4; c.near = 0.5; c.far = 12; sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4; c.updateProjectionMatrix(); }
    renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 2 : 1));
    buildRoom(st);
    for (const it of st.items) { const g = buildItem(it, st); if (g) kitchen.add(g); }
    buildCounters(st);
    buildLabels(st);
    drawSel();
    resize();
    needs = true;
  }
  function drawSel() {
    if (selBox) { scene.remove(selBox); selBox.geometry.dispose(); selBox = null; }
    if (!selId) return;
    const g = kitchen.children.find(c => c.userData.id === selId);
    if (!g) return;
    const b = new THREE.Box3().setFromObject(g);
    if (b.isEmpty()) return;
    selBox = new THREE.Box3Helper(b, 0xff6a00); scene.add(selBox);
  }
  function select(id) { selId = id; drawSel(); needs = true; }

  function resize() {
    const w = container.clientWidth || 300, h = container.clientHeight || 300;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); needs = true;
  }
  const ro = new ResizeObserver(resize); ro.observe(container);

  function preset(name) {
    const st = state; if (!st) return;
    const W = st.room.W / 100, D = st.room.D / 100;
    walk = null; controls.enabled = true;
    if (name === 'top') { const a = camera.aspect; const h = Math.max(6.6 / Math.max(a, 0.5), 6.0) * 1.8; camera.position.set(W / 2 - 0.15, h, D / 2 + 0.2 + 0.001); controls.target.set(W / 2 - 0.15, 0, D / 2 + 0.2); camera.fov = 32; }
    else if (name === 'iso') { const k = camera.aspect < 1.2 ? Math.pow(1.2 / camera.aspect, 0.75) : 1; const tg = new THREE.Vector3(W / 2 + 0.1, 0.7, D / 2 - 0.2); controls.target.copy(tg); camera.position.copy(tg).add(new THREE.Vector3(-2.3 - W / 2 - 0.1, 3.3, D + 2.9 - D / 2 + 0.2).multiplyScalar(k)); camera.fov = 50; }
    else if (name === 'front') { const k = camera.aspect < 1.2 ? Math.pow(1.2 / camera.aspect, 0.8) : 1; camera.position.set(W / 2, 1.5 + 0.4 * (k - 1), D + 1.6 * k); controls.target.set(W / 2, 1.1, 0.5); camera.fov = 55; }
    else if (name === 'eye') {
      controls.enabled = false; camera.fov = 70;
      walk = { x: 1.0, z: 1.05, yaw: -2.21, pitch: -0.22 };
      applyWalk();
    }
    camera.updateProjectionMatrix(); controls.update(); needs = true;
  }
  function applyWalk() {
    camera.position.set(walk.x, 1.6, walk.z);
    const dir = new THREE.Vector3(Math.cos(walk.pitch) * -Math.sin(walk.yaw), Math.sin(walk.pitch), Math.cos(walk.pitch) * -Math.cos(walk.yaw));
    camera.lookAt(camera.position.clone().add(dir)); needs = true;
  }
  function move(fw, side, turn) {
    if (!walk) return;
    walk.yaw += turn;
    const fx = -Math.sin(walk.yaw), fz = -Math.cos(walk.yaw);
    walk.x += fx * fw + -fz * side; walk.z += fz * fw + fx * side;
    const st = state; walk.x = Math.max(-1.5, Math.min(st.room.W / 100 - 0.2, walk.x)); walk.z = Math.max(0.2, Math.min(st.room.Pend / 100 - 0.2, walk.z));
    applyWalk();
  }
  // גרירה במצב הליכה = הסתכלות
  let drag = null;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, moved: false };
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (walk && drag.moved) { walk.yaw += dx * 0.005; walk.pitch = Math.max(-1.2, Math.min(1.2, walk.pitch + dy * 0.004)); drag.x = e.clientX; drag.y = e.clientY; applyWalk(); }
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (drag && !drag.moved) pick(e);
    drag = null;
  });
  const ray = new THREE.Raycaster();
  function pick(e) {
    const r = renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(v, camera);
    const hit = ray.intersectObjects(kitchen.children, true)[0];
    let o = hit?.object; while (o && !o.userData.id) o = o.parent;
    cb.onSelect?.(o ? o.userData.id : null);
  }
  const onKey = (e, down) => { if (e.target.closest && e.target.closest('input,select,textarea')) return; keys[e.key.toLowerCase()] = down; };
  const kd = (e) => onKey(e, true), ku = (e) => onKey(e, false);
  addEventListener('keydown', kd); addEventListener('keyup', ku);
  controls.addEventListener('change', () => { needs = true; });
  function loop() {
    if (disposed) return;
    raf = requestAnimationFrame(loop);
    if (walk) {
      const sp = 0.03; let fw = 0, sd = 0, tr = 0;
      if (keys['w'] || keys['arrowup']) fw += sp; if (keys['s'] || keys['arrowdown']) fw -= sp;
      if (keys['a']) sd -= sp; if (keys['d']) sd += sp;
      if (keys['arrowleft']) tr += 0.03; if (keys['arrowright']) tr -= 0.03;
      if (hold) { fw += hold.fw * sp; tr += hold.tr * 0.03; }
      if (fw || sd || tr) move(fw, sd, tr);
    } else if (controls.enabled) controls.update();
    if (needs) { cutaway(); renderer.render(scene, camera); needs = false; }
  }
  let hold = null;
  // חיתוך: מסתירים ארונות עליונים/גבוהים של קיר שהמצלמה נמצאת מאחוריו, כדי לראות פנימה
  function cutaway() {
    if (!state) return;
    const cx = camera.position.x * 100, cz = camera.position.z * 100;
    const behind = {};
    for (const w of ['A', 'B', 'C', 'P']) { const f = frame(w, state); const [x0, z0] = f.p(0, 0); behind[w] = !walk && ((cx - x0) * f.n[0] + (cz - z0) * f.n[1] < -20); }
    for (const g of kitchen.children) if (g.userData.wall && ['upper', 'tall'].includes(g.userData.layer)) g.visible = !behind[g.userData.wall];
    for (const g of roomG.children) if (g.userData.cut) g.visible = !behind[g.userData.cut];
    if (selBox) { const g = kitchen.children.find(c => c.userData.id === selId); selBox.visible = !g || g.visible; }
  }
  function setHold(h) { hold = h; }
  loop();
  return {
    update, select, preset, move, setHold,
    setMode(m) { mode = m; if (state) update(state); },
    setQuality(q) { quality = q; if (state) update(state); },
    setLabels(v) { showLabels = v; if (state) { buildLabels(state); needs = true; } },
    get mode() { return mode; }, get quality() { return quality; },
    snapshot(filename = 'kitchen.png') {
      const lv = labels.visible; labels.visible = showLabels; if (selBox) selBox.visible = false;
      renderer.render(scene, camera);
      const url = renderer.domElement.toDataURL('image/png');
      if (selBox) selBox.visible = true;
      const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
      needs = true; return url;
    },
    resize,
    dispose() { disposed = true; cancelAnimationFrame(raf); ro.disconnect(); removeEventListener('keydown', kd); removeEventListener('keyup', ku); renderer.dispose(); },
  };
}
