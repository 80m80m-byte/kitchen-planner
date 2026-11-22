// ציור תוכנית הדירה כ-SVG (קואורדינטות עולם בס"מ)
import { FURN, ROOM_TYPES } from './data.js';
import { centroid, polyArea, bbox, rad } from './geom.js';
import { clearZones, doorZone } from './generate.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const P = (pts) => pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');

// סמל רהיט בקואורדינטות מקומיות: מרכז ב-0,0, גב ב- -d/2
export function furnSymbol(it, sel = false, bad = false) {
  const f = FURN[it.type] || { shape: 'box', color: '#ccc' };
  const w = it.w, d = it.d, hw = w / 2, hd = d / 2, col = it.color || f.color;
  const st = `stroke="${bad ? '#c62828' : sel ? '#1565c0' : '#444'}" stroke-width="${bad || sel ? 2.4 : 1.1}" vector-effect="non-scaling-stroke"`;
  const thin = `stroke="#555" stroke-width="0.8" vector-effect="non-scaling-stroke" fill="none"`;
  const R = (x, y, ww, hh, fill = col, rx = 0, s = st) => `<rect x="${x}" y="${y}" width="${ww}" height="${hh}" rx="${rx}" fill="${fill}" ${s}/>`;
  let g = '';
  switch (f.shape) {
    case 'bed': case 'bunk': case 'crib': {
      g += R(-hw, -hd, w, d, col, 3);
      if (f.shape === 'crib') { for (let x = -hw + 8; x < hw; x += 8) g += `<line x1="${x}" y1="${-hd}" x2="${x}" y2="${-hd + 6}" ${thin}/>`; break; }
      const pw = w > 110 ? (w - 30) / 2 : w - 20; const n = w > 110 ? 2 : 1;
      for (let i = 0; i < n; i++) g += R(-hw + 10 + i * (pw + 10), -hd + 6, pw, 26, '#fff', 6, thin);
      g += `<path d="M${-hw} ${-hd + 55} L${hw} ${-hd + 55} L${hw} ${-hd + 75} Z" fill="rgba(0,0,0,.06)" ${thin}/>`;
      if (f.shape === 'bunk') g += `<line x1="${-hw}" y1="${-hd}" x2="${hw}" y2="${hd}" ${thin}/><line x1="${hw}" y1="${-hd}" x2="${-hw}" y2="${hd}" ${thin}/>`;
      break;
    }
    case 'sofa': case 'sofaL': case 'armchair': {
      g += R(-hw, -hd, w, d, col, 6);
      g += R(-hw + 2, -hd + 2, w - 4, Math.min(22, d * .25), 'rgba(0,0,0,.12)', 4, thin);
      g += R(-hw + 2, -hd + 2, 16, d - 4, 'rgba(0,0,0,.10)', 4, thin) + R(hw - 18, -hd + 2, 16, d - 4, 'rgba(0,0,0,.10)', 4, thin);
      if (f.shape === 'sofaL') g += R(hw - 95, -hd + 20, 93, d - 22, 'rgba(255,255,255,.18)', 4, thin);
      break;
    }
    case 'table': case 'desk': g += R(-hw, -hd, w, d, col, 3); break;
    case 'round': g += `<ellipse cx="0" cy="0" rx="${hw}" ry="${hd}" fill="${col}" ${st}/>`; break;
    case 'chair': g += R(-hw, -hd, w, d, col, 6) + `<line x1="${-hw + 4}" y1="${-hd + 7}" x2="${hw - 4}" y2="${-hd + 7}" stroke="#fff" stroke-width="1.2" vector-effect="non-scaling-stroke"/>`; break;
    case 'toilet': g += R(-hw, -hd, w, 18, col, 3) + `<ellipse cx="0" cy="${-hd + 18 + (d - 18) / 2}" rx="${hw - 2}" ry="${(d - 18) / 2}" fill="${col}" ${st}/>`; break;
    case 'vanity': g += R(-hw, -hd, w, d, col, 2) + `<ellipse cx="0" cy="${d * .08}" rx="${w * .32}" ry="${d * .3}" fill="#fff" ${thin}/>`; break;
    case 'shower': g += R(-hw, -hd, w, d, col, 0) + `<line x1="${-hw}" y1="${-hd}" x2="${hw}" y2="${hd}" ${thin}/><line x1="${hw}" y1="${-hd}" x2="${-hw}" y2="${hd}" ${thin}/><circle r="4" fill="#fff" ${thin}/>`; break;
    case 'tub': g += R(-hw, -hd, w, d, col, 8) + R(-hw + 8, -hd + 8, w - 16, d - 16, '#e6f1f5', 20, thin); break;
    case 'wardrobe': g += R(-hw, -hd, w, d, col, 0) + `<line x1="${-hw}" y1="${hd - 4}" x2="${hw}" y2="${hd - 4}" ${thin}/>`; for (let x = -hw + 60; x < hw - 5; x += 60) g += `<line x1="${x}" y1="${-hd}" x2="${x}" y2="${hd}" ${thin}/>`; g += `<line x1="${-hw}" y1="${-hd}" x2="${hw}" y2="${hd - 4}" stroke="#999" stroke-dasharray="4 4" stroke-width=".7" vector-effect="non-scaling-stroke"/>`; break;
    case 'tv': g += R(-hw, -hd, w, d, col, 2) + `<rect x="${-hw * .7}" y="${-hd + 4}" width="${w * .7}" height="5" fill="#111"/>`; break;
    case 'washer': g += R(-hw, -hd, w, d, col, 4) + `<circle cx="0" cy="${d * .06}" r="${Math.min(w, d) * .3}" fill="#dfe8ee" ${thin}/>`; break;
    case 'fridge': g += R(-hw, -hd, w, d, col, 2) + `<line x1="${-hw}" y1="${hd - 6}" x2="${hw}" y2="${hd - 6}" ${thin}/>`; break;
    case 'counter': g += R(-hw, -hd, w, d, col, 0) + `<line x1="${-hw}" y1="${hd - 5}" x2="${hw}" y2="${hd - 5}" ${thin}/>`; break;
    case 'rug': g += R(-hw, -hd, w, d, col, 4, `stroke="#8a7a62" stroke-dasharray="6 4" stroke-width="1" vector-effect="non-scaling-stroke" fill-opacity=".55"`); break;
    case 'plant': g += `<circle r="${Math.min(hw, hd)}" fill="${col}" ${st}/><circle r="${Math.min(hw, hd) * .45}" fill="#7fae63"/>`; break;
    case 'lounger': g += R(-hw, -hd, w, d, col, 6) + R(-hw + 4, -hd + 4, w - 8, 45, 'rgba(0,0,0,.08)', 4, thin); break;
    default: g += R(-hw, -hd, w, d, col, 2);
  }
  return g;
}
const tf = (it) => `translate(${it.x.toFixed(1)} ${it.y.toFixed(1)}) rotate(${it.rot || 0})`;

export function doorSVG(d, sel) {
  const u = [Math.cos(rad(d.ang)), Math.sin(rad(d.ang))], n = [-u[1] * d.side, u[0] * d.side];
  const H = [d.x, d.y], C = [d.x + u[0] * d.w, d.y + u[1] * d.w], O = [d.x + n[0] * d.w, d.y + n[1] * d.w];
  const sweep = d.side > 0 ? 1 : 0;
  const col = sel ? '#1565c0' : '#8d6e63';
  return `<g class="door" data-id="${d.id}">
    <line x1="${H[0]}" y1="${H[1]}" x2="${C[0]}" y2="${C[1]}" stroke="#fff" stroke-width="14" stroke-linecap="butt"/>
    <path d="M${C[0]} ${C[1]} A${d.w} ${d.w} 0 0 ${sweep} ${O[0]} ${O[1]}" fill="none" stroke="${col}" stroke-width="1" stroke-dasharray="5 4" vector-effect="non-scaling-stroke"/>
    <line x1="${H[0]}" y1="${H[1]}" x2="${O[0]}" y2="${O[1]}" stroke="${col}" stroke-width="${sel ? 3 : 2}" vector-effect="non-scaling-stroke"/>
    <line x1="${H[0]}" y1="${H[1]}" x2="${C[0]}" y2="${C[1]}" stroke="transparent" stroke-width="30" class="hit"/></g>`;
}
export function windowSVG(w, sel) {
  const dx = w.x2 - w.x1, dy = w.y2 - w.y1, l = Math.hypot(dx, dy) || 1, nx = -dy / l * 5, ny = dx / l * 5;
  const col = sel ? '#1565c0' : '#1e88e5';
  return `<g class="win" data-id="${w.id}"><line x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke="#fff" stroke-width="16"/>
  ${[-1, 0, 1].map(k => `<line x1="${w.x1 + nx * k}" y1="${w.y1 + ny * k}" x2="${w.x2 + nx * k}" y2="${w.y2 + ny * k}" stroke="${col}" stroke-width="${sel ? 2.4 : 1.3}" vector-effect="non-scaling-stroke"/>`).join('')}
  <line x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke="transparent" stroke-width="30" class="hit"/></g>`;
}

// px = ס"מ לפיקסל מסך (לגודל טקסט)
export function floorSVG(floor, o = {}) {
  const px = o.px || 1, sel = o.sel || {}, bad = o.bad || new Set();
  const fs = Math.max(9, 12.5 * px);
  let s = '';
  // חדרים
  for (const r of floor.rooms) {
    const T = ROOM_TYPES[r.type] || ROOM_TYPES.other; const isSel = sel.kind === 'room' && sel.id === r.id;
    s += `<polygon class="room" data-id="${r.id}" points="${P(r.poly)}" fill="${T.color}" fill-opacity="${o.bgOn ? (r.confirmed ? 0.45 : 0.22) : 0.92}" stroke="${isSel ? '#1565c0' : r.confirmed ? '#7a6f60' : '#e65100'}" stroke-width="${isSel ? 2.5 : 1}" ${r.confirmed ? '' : 'stroke-dasharray="6 4"'} vector-effect="non-scaling-stroke"/>`;
  }
  // קירות
  for (const w of floor.walls) {
    const isSel = sel.kind === 'wall' && sel.id === w.id;
    s += `<line class="wall" data-id="${w.id}" x1="${w.x1}" y1="${w.y1}" x2="${w.x2}" y2="${w.y2}" stroke="${isSel ? '#1565c0' : '#2b2b2b'}" stroke-width="${w.t}" stroke-linecap="square" ${o.bgOn ? 'stroke-opacity=".35"' : ''}/>`;
  }
  for (const w of floor.windows) s += windowSVG(w, sel.kind === 'window' && sel.id === w.id);
  for (const d of floor.doors) s += doorSVG(d, sel.kind === 'door' && sel.id === d.id);
  // אזורי שימוש של הרהיט הנבחר
  const fsel = sel.kind === 'furn' && floor.furn.find(f => f.id === sel.id);
  if (fsel && o.showClear !== false) for (const z of clearZones(fsel)) s += `<polygon points="${P(z)}" fill="rgba(21,101,192,.10)" stroke="#1565c0" stroke-dasharray="4 3" stroke-width="1" vector-effect="non-scaling-stroke" pointer-events="none"/>`;
  // רהיטים (שטיחים קודם)
  const F = [...floor.furn].sort((a, b) => (FURN[b.type]?.flat ? 1 : 0) - (FURN[a.type]?.flat ? 1 : 0));
  for (const it of F) s += `<g class="furn" data-id="${it.id}" transform="${tf(it)}">${furnSymbol(it, sel.kind === 'furn' && sel.id === it.id, bad.has(it.id))}</g>`;
  // תוויות חדרים
  if (o.labels !== false) for (const r of floor.rooms) {
    const c = labelPt(r.poly); const a = Math.abs(polyArea(r.poly)) / 1e4;
    const name = r.name || ROOM_TYPES[r.type]?.name || '';
    s += `<g pointer-events="none" font-family="Rubik,Arial,sans-serif" text-anchor="middle"><text x="${c[0]}" y="${c[1]}" font-size="${fs}" font-weight="600" fill="#2d2a26" stroke="#fff" stroke-width="${fs * 0.25}" paint-order="stroke">${esc(name)}</text><text x="${c[0]}" y="${c[1] + fs * 1.15}" font-size="${fs * .8}" fill="#5b544a" stroke="#fff" stroke-width="${fs * 0.2}" paint-order="stroke">${a.toFixed(1)} מ״ר${r.confirmed ? '' : ' · לא מאושר'}</text></g>`;
  }
  return s;
}
// נקודת תווית: מרכז כובד אם בפנים, אחרת מרכז השורה האמצעית
export function labelPt(poly) {
  const c = centroid(poly); let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (((yi > c[1]) !== (yj > c[1])) && (c[0] < (xj - xi) * (c[1] - yi) / (yj - yi) + xi)) ins = !ins; }
  if (ins) return c;
  const xs = []; for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; if ((y1 > c[1]) !== (y2 > c[1])) xs.push(x1 + (c[1] - y1) * (x2 - x1) / (y2 - y1)); }
  xs.sort((a, b) => a - b); let best = c, bw = 0;
  for (let i = 0; i + 1 < xs.length; i += 2) if (xs[i + 1] - xs[i] > bw) { bw = xs[i + 1] - xs[i]; best = [(xs[i] + xs[i + 1]) / 2, c[1]]; }
  return best;
}
// תמונה ממוזערת של חלופה
export function miniSVG(room, items, floor, size = 150) {
  const b = bbox(room.poly); const pad = 25;
  const vb = `${b.x0 - pad} ${b.y0 - pad} ${b.w + 2 * pad} ${b.h + 2 * pad}`;
  const T = ROOM_TYPES[room.type] || ROOM_TYPES.other;
  let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${size}" height="${size}" preserveAspectRatio="xMidYMid meet"><polygon points="${P(room.poly)}" fill="${T.color}" stroke="#333" stroke-width="6"/>`;
  for (const d of floor.doors) { const z = doorZone(d, room.poly); if (z) s += doorSVG(d); }
  for (const w of floor.windows) s += windowSVG(w);
  for (const it of items) s += `<g transform="${tf(it)}">${furnSymbol(it)}</g>`;
  return s + '</svg>';
}
// SVG מלא להדפסה
export function printSVG(floor, bgHref) {
  const pts = floor.rooms.flatMap(r => r.poly).concat(floor.walls.flatMap(w => [[w.x1, w.y1], [w.x2, w.y2]]));
  if (!pts.length) return '<svg></svg>';
  const b = bbox(pts), pad = 60;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${b.x0 - pad} ${b.y0 - pad} ${b.w + 2 * pad} ${b.h + 2 * pad}" style="width:100%;height:auto;max-height:24cm">${floorSVG(floor, { px: Math.max(b.w, b.h) / 700, labels: true })}${scaleBar(b.x0, b.y1 + pad * .6)}</svg>`;
}
function scaleBar(x, y) { return `<g font-size="16" font-family="Arial"><rect x="${x}" y="${y - 6}" width="100" height="6" fill="#222"/><rect x="${x + 100}" y="${y - 6}" width="100" height="6" fill="#fff" stroke="#222"/><text x="${x}" y="${y + 18}">0</text><text x="${x + 100}" y="${y + 18}" text-anchor="middle">1מ׳</text><text x="${x + 200}" y="${y + 18}" text-anchor="middle">2מ׳</text></g>`; }
