// תלת-ממד לדירה. צירים: X = x בתוכנית, Z = y בתוכנית, Y = גובה (ס"מ, קנה מידה 0.01). בלי שיקוף.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { FURN, ROOM_TYPES } from './data.js';
import { bbox, rad } from './geom.js';
import { labelPt } from './plan.js';

let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t; }
function noise(g, w, h, n, a, b, al) { for (let i = 0; i < n; i++) { const v = a + (b - a) * rnd(); g.fillStyle = `rgba(${v},${v},${v},${al})`; const r = 1 + rnd() * 2; g.fillRect(rnd() * w, rnd() * h, r, r); } }
const TEX = {};
function textures() {
  if (TEX.ok) return TEX;
  TEX.wood = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#c9a77f'; g.fillRect(0, 0, w, h);
    for (let p = 0; p < 4; p++) { const v = 0.9 + rnd() * 0.2; g.fillStyle = `rgba(${150 * v},${110 * v},${75 * v},0.25)`; g.fillRect(0, p * h / 4, w, h / 4); g.fillStyle = 'rgba(60,40,25,.35)'; g.fillRect(0, p * h / 4, w, 2); }
    for (let i = 0; i < 300; i++) { g.strokeStyle = `rgba(90,60,35,${0.04 + rnd() * 0.08})`; g.lineWidth = 0.5 + rnd() * 1.5; const y = rnd() * h; g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x / 70 + i) * 2); g.stroke(); }
    for (let p = 0; p < 4; p++) { const x = rnd() * w; g.fillStyle = 'rgba(60,40,25,.35)'; g.fillRect(x, p * h / 4, 2, h / 4); }
  });
  TEX.tile = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#ddd8cf'; g.fillRect(0, 0, w, h); noise(g, w, h, 6000, 170, 240, 0.12); g.fillStyle = '#b8b2a7'; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h); g.fillRect(0, h / 2, w, 2); g.fillRect(w / 2, 0, 2, h); });
  TEX.bath = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#e4e8ea'; g.fillRect(0, 0, w, h); noise(g, w, h, 3000, 190, 250, 0.1); g.fillStyle = '#c3cacd'; for (let k = 0; k < 4; k++) { g.fillRect(0, k * h / 4, w, 2); g.fillRect(k * w / 4, 0, 2, h); } });
  TEX.deck = canvasTex(512, 512, (g, w, h) => { g.fillStyle = '#9b8063'; g.fillRect(0, 0, w, h); for (let k = 0; k < 8; k++) { g.fillStyle = `rgba(${120 + rnd() * 30},${95 + rnd() * 20},${70},.5)`; g.fillRect(0, k * h / 8 + 3, w, h / 8 - 6); } noise(g, w, h, 3000, 60, 140, 0.15); });
  TEX.fabric = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#888'; g.fillRect(0, 0, w, h); noise(g, w, h, 3000, 90, 190, 0.25); });
  TEX.ok = true; return TEX;
}
function labelSprite(text) {
  const c = document.createElement('canvas'); const g = c.getContext('2d'); g.font = 'bold 52px Rubik, Arial, sans-serif';
  const w = Math.ceil(g.measureText(text).width) + 44; c.width = w; c.height = 80;
  g.font = 'bold 52px Rubik, Arial, sans-serif'; g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.roundRect(0, 0, w, 80, 18); g.fill(); g.fillStyle = '#2a2925'; g.fillText(text, w / 2, 42);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); s.scale.set(w / 80 * 0.42, 0.42, 1); s.renderOrder = 10; return s;
}

export function create3D(container, cb = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#e9e6df');
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.maxPolarAngle = Math.PI * 0.495; controls.screenSpacePanning = true;
  const pmrem = new THREE.PMREMGenerator(renderer); scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; scene.environmentIntensity = 0.55;
  const root = new THREE.Group(); root.scale.setScalar(0.01); scene.add(root);
  const labels = new THREE.Group(); scene.add(labels);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb5ab9c, 0.9));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.2); scene.add(sun); scene.add(sun.target);
  let opts = { cut: true, labels: true, quality: matchMedia('(max-width: 800px)').matches ? 'low' : 'high' };
  let floor = null, selId = null, needs = true, raf = 0, disposed = false, center = new THREE.Vector3(), span = 10;
  const mats = new Map(); const pickables = []; let selHelper = null;
  const M = (key, make) => { if (!mats.has(key)) mats.set(key, make()); return mats.get(key); };
  const std = (color, o = {}) => M('s' + color + JSON.stringify(o), () => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...o }));
  function floorMat(kind) {
    const T = textures(); const t = T[kind] || T.tile;
    return M('f' + kind, () => new THREE.MeshStandardMaterial({ map: t, roughness: kind === 'wood' ? 0.6 : 0.45, metalness: 0 }));
  }
  function box(p, w, h, d, x, y, z, m, cast = true) { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); o.castShadow = cast; o.receiveShadow = true; p.add(o); return o; }
  function cyl(p, r, h, x, y, z, m, seg = 24) { const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; p.add(o); return o; }
  // רהיט בקואורדינטות מקומיות: x לרוחב, z עומק (גב ב- -d/2), y גובה
  function buildFurn(it) {
    const f = FURN[it.type] || { shape: 'box', h: 60, color: '#ccc' };
    const g = new THREE.Group(); const w = it.w, d = it.d, h = f.h || 60, col = it.color || f.color, hw = w / 2, hd = d / 2;
    const m = std(col), white = std('#f7f7f5', { roughness: 0.3 }), dark = std('#2c2a28'), metal = std('#b9bcc0', { metalness: 0.8, roughness: 0.3 }), wood = std('#a07a52');
    switch (f.shape) {
      case 'bed': case 'bunk': {
        box(g, w, 28, d, 0, 14, 0, wood); box(g, w - 4, 22, d - 6, 0, 39, 3, std('#f2efe8'));
        box(g, w + 4, 100, 8, 0, 50, -hd + 4, std('#8d7a66'));
        const n = w > 110 ? 2 : 1, pw = n === 2 ? (w - 30) / 2 : w - 20;
        for (let i = 0; i < n; i++) box(g, pw, 12, 32, -hw + 10 + pw / 2 + i * (pw + 10), 56, -hd + 26, white);
        box(g, w - 2, 6, d * 0.55, 0, 52, hd - d * 0.3, std(col === '#e9e4da' ? '#9fb3c4' : col));
        if (f.shape === 'bunk') { box(g, w, 6, d, 0, 120, 0, wood); box(g, w - 4, 16, d - 6, 0, 131, 3, std('#f2efe8')); for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 6, h, 6, sx * (hw - 3), h / 2, sz * (hd - 3), wood); }
        break;
      }
      case 'crib': box(g, w, 12, d, 0, 40, 0, white); for (let x = -hw; x <= hw; x += 10) { box(g, 2, 50, 2, x, 70, -hd, white); box(g, 2, 50, 2, x, 70, hd, white); } break;
      case 'sofa': case 'armchair': case 'sofaL': {
        const fab = M('fab' + col, () => new THREE.MeshStandardMaterial({ color: col, map: textures().fabric, roughness: 0.95 }));
        box(g, w, 42, d, 0, 21, 0, fab); box(g, w, 40, 20, 0, 62, -hd + 10, fab);
        box(g, 18, 22, d, -hw + 9, 53, 0, fab); box(g, 18, 22, d, hw - 9, 53, 0, fab);
        if (f.shape === 'sofaL') box(g, 90, 0.1, d - 20, hw - 55, 42.1, 10, fab);
        const seats = Math.max(1, Math.round((w - 36) / 70)); const sw = (w - 36) / seats;
        for (let i = 0; i < seats; i++) box(g, sw - 3, 12, d - 28, -hw + 18 + sw * (i + .5), 48, 6, fab);
        break;
      }
      case 'table': case 'desk': {
        box(g, w, 4, d, 0, h - 2, 0, m);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 5, h - 4, 5, sx * (hw - 6), (h - 4) / 2, sz * (hd - 6), f.shape === 'desk' ? dark : m);
        break;
      }
      case 'round': cyl(g, hw, 4, 0, h - 2, 0, m, 40); cyl(g, 5, h - 4, 0, (h - 4) / 2, 0, dark); cyl(g, 25, 3, 0, 1.5, 0, dark); break;
      case 'chair': {
        box(g, w - 4, 5, d - 10, 0, 45, 3, m); box(g, w - 4, 40, 4, 0, 67, -hd + 4, m);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(g, 3, 44, 3, sx * (hw - 5), 22, sz * (hd - 8), dark);
        break;
      }
      case 'toilet': {
        box(g, w, 40, 18, 0, 60, -hd + 9, white);
        const b = cyl(g, w / 2 - 1, 38, 0, 19, -hd + 18 + (d - 18) / 2, white, 28); b.scale.z = (d - 18) / (w - 2);
        break;
      }
      case 'vanity': box(g, w, h - 6, d, 0, (h - 6) / 2, 0, m); box(g, w + 1, 6, d + 1, 0, h - 3, 0, white); { const b = cyl(g, w * 0.3, 2, 0, h + 0.5, d * 0.05, std('#dfe3e6')); b.scale.z = 0.8; } cyl(g, 1.5, 22, 0, h + 10, -hd + 6, metal); break;
      case 'shower': {
        box(g, w, 6, d, 0, 3, 0, white);
        const glass = M('glass', () => new THREE.MeshPhysicalMaterial({ color: '#dfeff4', transmission: 0.9, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0 }));
        box(g, w, 195, 1, 0, 100, hd, glass, false); box(g, 1, 195, d, hw, 100, 0, glass, false);
        cyl(g, 1.5, 120, -hw + 12, 130, -hd + 6, metal); cyl(g, 10, 1.5, -hw + 12, 190, -hd + 14, metal);
        break;
      }
      case 'tub': box(g, w, h, d, 0, h / 2, 0, white); box(g, w - 14, 2, d - 14, 0, h + 0.2, 0, std('#cfe4ec', { roughness: 0.1 })); break;
      case 'wardrobe': {
        box(g, w, h, d, 0, h / 2, 0, m);
        const n = Math.max(1, Math.round(w / 60));
        for (let i = 1; i < n; i++) box(g, 0.6, h - 6, 0.6, -hw + i * w / n, h / 2, hd + 0.3, dark, false);
        for (let i = 0; i < n; i++) box(g, 1.5, 30, 1.5, -hw + (i + 0.5) * w / n + (i % 2 ? -w / n / 2 + 5 : w / n / 2 - 5), h / 2, hd + 1, metal, false);
        break;
      }
      case 'tv': box(g, w, h, d, 0, h / 2, 0, m); box(g, w * 0.75, w * 0.75 * 9 / 16, 3, 0, h + 20 + w * 0.75 * 9 / 32, -hd + 4, std('#111', { roughness: 0.2 })); break;
      case 'washer': box(g, w, h, d, 0, h / 2, 0, white); { const c = cyl(g, w * 0.28, 2, 0, h * 0.5, hd + 1, std('#9fb4c0', { roughness: 0.1 })); c.rotation.x = Math.PI / 2; } break;
      case 'fridge': box(g, w, h, d, 0, h / 2, 0, std(col, { metalness: 0.6, roughness: 0.35 })); box(g, w, 0.8, 1, 0, h * 0.62, hd + 0.4, dark, false); break;
      case 'counter': box(g, w, h - 4, d - 2, 0, (h - 4) / 2, -1, m); box(g, w, 4, d, 0, h - 2, 0, std('#d8d4cc', { roughness: 0.3 })); box(g, w, 10, d - 6, 0, 5, -4, dark); break;
      case 'rug': box(g, w, 1, d, 0, 0.5, 0, std(col, { roughness: 1 }), false); break;
      case 'plant': cyl(g, Math.min(hw, hd) * 0.6, 40, 0, 20, 0, std('#b5643c')); { const s = new THREE.Mesh(new THREE.SphereGeometry(Math.min(hw, hd), 16, 12), std(col)); s.position.y = 75; s.scale.y = 1.3; s.castShadow = true; g.add(s); } break;
      case 'lounger': box(g, w, 25, d - 50, 0, 20, 25, m); { const b = box(g, w, 8, 60, 0, 45, -hd + 30, m); b.rotation.x = -0.6; } break;
      default: box(g, w, h, d, 0, h / 2, 0, m);
    }
    g.position.set(it.x, 0, it.y); g.rotation.y = -rad(it.rot || 0);
    g.userData.id = it.id; g.traverse(o => { if (o.isMesh) { o.userData.id = it.id; pickables.push(o); } });
    return g;
  }
  function wallHeight() { return opts.cut ? 120 : 260; }
  function build() {
    for (const c of [...root.children]) { root.remove(c); c.traverse(o => o.geometry?.dispose()); }
    for (const c of [...labels.children]) { labels.remove(c); c.material.map?.dispose(); c.material.dispose(); }
    pickables.length = 0; selHelper = null;
    if (!floor) return;
    const H = wallHeight();
    const wallM = std('#f4f1eb', { roughness: 0.9 }), capM = std('#3a3836');
    const pts = floor.rooms.flatMap(r => r.poly).concat(floor.walls.flatMap(w => [[w.x1, w.y1], [w.x2, w.y2]]));
    const b = pts.length ? bbox(pts) : { x0: 0, y0: 0, x1: 500, y1: 500, w: 500, h: 500 };
    center.set((b.x0 + b.x1) / 200, 0, (b.y0 + b.y1) / 200); span = Math.max(b.w, b.h) / 100;
    // קרקע
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(b.w + 600, b.h + 600), std('#d7d2c8', { roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set((b.x0 + b.x1) / 2, -1, (b.y0 + b.y1) / 2); ground.receiveShadow = true; root.add(ground);
    // רצפות החדרים
    for (const r of floor.rooms) {
      const T = ROOM_TYPES[r.type] || ROOM_TYPES.other;
      const sh = new THREE.Shape(r.poly.map(([x, y]) => new THREE.Vector2(x, -y)));
      const geo = new THREE.ShapeGeometry(sh); geo.rotateX(-Math.PI / 2);
      const uv = geo.attributes.uv, pos = geo.attributes.position;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / 120, pos.getZ(i) / 120);
      const m = new THREE.Mesh(geo, floorMat(T.floor)); m.position.y = 0.2; m.receiveShadow = true; root.add(m);
      if (opts.labels) { const c = labelPt(r.poly); const s = labelSprite(r.name || T.name); s.position.set(c[0] / 100, H / 100 + 0.35, c[1] / 100); labels.add(s); }
    }
    // קירות
    for (const w of floor.walls) {
      const dx = w.x2 - w.x1, dy = w.y2 - w.y1, L = Math.hypot(dx, dy); if (L < 1) continue;
      const t = w.t || 12;
      const o = box(root, L + t, H, t, (w.x1 + w.x2) / 2, H / 2, (w.y1 + w.y2) / 2, wallM);
      o.rotation.y = -Math.atan2(dy, dx);
      if (opts.cut) { const c = box(root, L + t, 1, t, (w.x1 + w.x2) / 2, H + 0.5, (w.y1 + w.y2) / 2, capM, false); c.rotation.y = o.rotation.y; }
    }
    // פתחים: משקוף/אדן/זכוכית
    const glass = M('wglass', () => new THREE.MeshPhysicalMaterial({ color: '#cfe6f2', transparent: true, opacity: 0.35, roughness: 0.05, transmission: 0.6 }));
    const frameM = std('#4a4a4a', { metalness: 0.4, roughness: 0.5 });
    const opening = (x1, y1, x2, y2, t, parts) => {
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy); const ang = -Math.atan2(dy, dx);
      for (const [z1, z2, m, th] of parts) { const z2c = Math.min(z2, H); if (z2c <= z1) continue; const o = box(root, L, z2c - z1, th ?? t, (x1 + x2) / 2, (z1 + z2c) / 2, (y1 + y2) / 2, m); o.rotation.y = ang; }
    };
    for (const wn of floor.windows) opening(wn.x1, wn.y1, wn.x2, wn.y2, 20, [[0, 90, wallM], [90, 92, frameM, 24], [92, 210, glass, 2], [210, 260, wallM]]);
    const leafM = std('#efe9de', { roughness: 0.6 });
    for (const d of floor.doors) {
      const u = [Math.cos(rad(d.ang)), Math.sin(rad(d.ang))];
      opening(d.x, d.y, d.x + u[0] * d.w, d.y + u[1] * d.w, 20, [[210, 260, wallM]]);
      const n = [-u[1] * d.side, u[0] * d.side]; const a = 80 * Math.PI / 180;
      const dir = [u[0] * Math.cos(a) + n[0] * Math.sin(a), u[1] * Math.cos(a) + n[1] * Math.sin(a)];
      const lw = d.w - 4; const o = box(root, lw, Math.min(205, H - 2), 4, d.x + dir[0] * lw / 2, Math.min(205, H - 2) / 2, d.y + dir[1] * lw / 2, leafM);
      o.rotation.y = -Math.atan2(dir[1], dir[0]);
    }
    for (const it of floor.furn) root.add(buildFurn(it));
    drawSel(); applyQuality(); needs = true;
  }
  function drawSel() {
    if (selHelper) { scene.remove(selHelper); selHelper = null; }
    const g = root.children.find(c => c.userData.id && c.userData.id === selId);
    if (g) { selHelper = new THREE.BoxHelper(g, 0x1565c0); scene.add(selHelper); }
    needs = true;
  }
  function applyQuality() {
    const hi = opts.quality === 'high';
    renderer.setPixelRatio(Math.min(devicePixelRatio, hi ? 2 : 1));
    renderer.shadowMap.enabled = hi; sun.castShadow = hi;
    sun.position.set(center.x - span * 0.6, span * 1.4 + 4, center.z + span * 0.9); sun.target.position.copy(center);
    const s = sun.shadow.camera; const e = span * 0.8 + 2; s.left = -e; s.right = e; s.top = e; s.bottom = -e; s.near = 0.5; s.far = span * 4 + 20; s.updateProjectionMatrix();
    sun.shadow.mapSize.set(hi ? 2048 : 512, hi ? 2048 : 512); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
    resize();
  }
  function preset(name) {
    const c = center;
    if (name === 'top') { camera.up.set(0, 0, -1); camera.position.set(c.x, span * 1.35 + 3, c.z + 0.001); controls.target.copy(c); camera.up.set(0, 1, 0); }
    else if (name === 'eye' && cb.roomCenter) { const rc = cb.roomCenter(); if (rc) { camera.position.set(rc[0] / 100, 1.6, rc[1] / 100 + 0.01); controls.target.set(rc[0] / 100, 1.2, rc[1] / 100 - 1.5); } }
    else { camera.position.set(c.x + span * 0.35, span * 0.75 + 2, c.z + span * 0.85 + 1); controls.target.copy(c); }
    controls.update(); needs = true;
  }
  function resize() { const w = container.clientWidth || 300, h = container.clientHeight || 300; renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; camera.aspect = w / h; camera.updateProjectionMatrix(); needs = true; }
  const ro = new ResizeObserver(resize); ro.observe(container);
  controls.addEventListener('change', () => needs = true);
  // בחירה בלחיצה
  let down = null; const ray = new THREE.Raycaster();
  renderer.domElement.addEventListener('pointerdown', e => down = [e.clientX, e.clientY]);
  renderer.domElement.addEventListener('pointerup', e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 5) return;
    const r = renderer.domElement.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1), camera);
    const hit = ray.intersectObjects(pickables, false)[0]; cb.onPick?.(hit ? hit.object.userData.id : null);
  });
  function loop() { if (disposed) return; raf = requestAnimationFrame(loop); if (controls.update() || needs) { if (selHelper) selHelper.update(); renderer.render(scene, camera); needs = false; } }
  let first = true;
  return {
    update(fl, sel) { floor = fl; selId = sel; build(); if (first) { first = false; preset('iso'); } },
    select(id) { selId = id; drawSel(); },
    setOpts(o) { const rebuild = o.cut !== undefined && o.cut !== opts.cut || o.labels !== undefined && o.labels !== opts.labels; opts = { ...opts, ...o }; if (rebuild) build(); else applyQuality(); },
    opts: () => opts, preset, resize,
    start() { if (!raf) loop(); }, stop() { cancelAnimationFrame(raf); raf = 0; },
    snapshot() { renderer.render(scene, camera); return renderer.domElement.toDataURL('image/png'); },
    _cam: camera, _scene: scene,
  };
}
