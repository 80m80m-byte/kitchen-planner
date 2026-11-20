import { PALS, TOPS, ZONES, WALL_IDS, PL, BT, CT, WALL_VIEW } from './data.js';
import { T, iz, ih, id_, layer, isBlind, rectOf, rectST, counterRuns, remaining, frame, points, PT_COLOR } from './model.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function pal(st) {
  const p = PALS.find(p => p.id === st.pal) || PALS[0];
  return st.pal === 'custom' ? { ...p, ...st.custom } : p;
}
export const topOf = (st) => TOPS.find(t => t.id === st.top) || TOPS[0];
export function colorOf(it, st) {
  if (it.color) return it.color;
  const p = pal(st);
  const l = layer(it);
  return l === 'upper' ? p.upper : l === 'tall' ? p.tall : p.base;
}
function rgb(h) { const n = parseInt(h.replace('#', ''), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function shade(h, f) { const [r, g, b] = rgb(h); const q = v => Math.max(0, Math.min(255, Math.round(v * f))); return `rgb(${q(r)},${q(g)},${q(b)})`; }
export function ink(h) { const [r, g, b] = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55 ? '#1E1E1C' : '#FFFFFF'; }
const STEEL = '#C6C9CD', IND = '#1C1D1F', OVEN = '#2C2E31';
const n1 = (v) => Math.round(v * 10) / 10;
const R = (x1, y1, x2, y2, a = '') => `<rect x="${n1(x1)}" y="${n1(y1)}" width="${n1(x2 - x1)}" height="${n1(y2 - y1)}" ${a}/>`;
const Ln = (x1, y1, x2, y2, a = '') => `<line x1="${n1(x1)}" y1="${n1(y1)}" x2="${n1(x2)}" y2="${n1(y2)}" ${a}/>`;
const Tx = (x, y, s, a = '') => `<text x="${n1(x)}" y="${n1(y)}" ${a}>${esc(s)}</text>`;

const DEFS = `<defs>
<pattern id="hatch" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#9a978f" stroke-width="1"/></pattern>
<pattern id="hatchL" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="#c9c6bf" stroke-width="0.8"/></pattern>
</defs>`;

export function planSVG(st, sel) {
  const { W, D, Pend, Px } = st.room;
  const notch = st.room.notch ?? 105;
  const p = pal(st), top = topOf(st);
  const o = [];
  o.push(`<svg class="plan" viewBox="-100 -118 560 560" xmlns="http://www.w3.org/2000/svg" font-family="Rubik, Arial, sans-serif">${DEFS}`);
  // רצפה
  o.push(`<polygon points="0,0 ${W},0 ${W},${D} ${notch},${D} ${notch},${Pend} 0,${Pend}" fill="#faf8f4" />`);
  // קירות
  const wall = (x1, y1, x2, y2) => o.push(R(x1, y1, x2, y2, 'fill="url(#hatch)" stroke="#77746d" stroke-width="0.8"'));
  wall(144, -20, W + 20, 0); wall(120, -60, 144, 0); wall(W, -20, W + 20, D + 20);
  wall(-40, Pend, notch + 20, Pend + 20); wall(notch, D, notch + 20, Pend + 20);
  const win = st.items.filter(i => i.type === 'window' && i.wall === 'C');
  let segs = [[notch + 20, W]];
  for (const w of win) { const r = rectST('C', st, w.s, w.s + w.w, 0, 0); segs = segs.flatMap(([a, b]) => (r.x2 <= a || r.x1 >= b) ? [[a, b]] : [[a, r.x1], [r.x2, b]].filter(([x, y]) => y - x > 0)); }
  for (const [a, b] of segs) wall(a, D, b, D + 20);
  for (const w of win) {
    const r = rectST('C', st, w.s, w.s + w.w, 0, 0);
    o.push(`<g class="it${w.id === sel ? ' sel' : ''}" data-id="${w.id}">` + R(r.x1, D + 2, r.x2, D + 18, 'fill="#e8f2fb" stroke="#77746d" stroke-width="0.8"') + Ln(r.x1, D + 8, r.x2, D + 8, 'stroke="#77746d" stroke-width="0.6"') + Ln(r.x1, D + 12, r.x2, D + 12, 'stroke="#77746d" stroke-width="0.6"') + Tx((r.x1 + r.x2) / 2, D + 32, `${w.label || 'חלון'} ${w.w}`, 'font-size="10" text-anchor="middle" fill="#55524c"') + '</g>');
  }
  // ארון כניסה ותוויות
  o.push(R(0, -35, 120, 10, 'fill="#ebe9e4" stroke="#8d8a83" stroke-width="0.8"'));
  o.push(Tx(60, -10, 'ארון כניסה 120×45', 'font-size="9.5" text-anchor="middle" fill="#6b6862"'));
  o.push(`<g class="lbl">` + Tx(-50, 112, 'כניסה', 'font-size="13" font-weight="700" text-anchor="middle" fill="#b5532c"') + Ln(-88, 122, -8, 122, 'stroke="#b5532c" stroke-width="1.6"') + `<path d="M-8,122 L-16,117 L-16,127Z" fill="#b5532c"/>` + '</g>');
  o.push(Tx(W / 2 + 70, -30, 'קיר המקרר', 'class="wl" font-size="13" font-weight="700" text-anchor="middle"'));
  o.push(Tx(W + 42, D / 2, 'קיר הכיריים', `class="wl" font-size="13" font-weight="700" text-anchor="middle" transform="rotate(90 ${W + 42} ${D / 2})"`));
  o.push(Tx((notch + W) / 2, Pend + 48, 'קיר החלון', 'class="wl" font-size="13" font-weight="700" text-anchor="middle"'));
  o.push(Tx(-62, Pend - st.walls.P.len / 2, 'חצי האי', `class="wl" font-size="13" font-weight="700" text-anchor="middle" transform="rotate(-90 -62 ${Pend - st.walls.P.len / 2})"`));
  // משטחים
  for (const r of counterRuns(st)) {
    const back = r.wall === 'P' ? -(st.walls.P.overhang || 0) : 0;
    const q = rectST(r.wall, st, r.s1, r.s2, back, r.depth);
    o.push(R(q.x1, q.y1, q.x2, q.y2, `fill="${top.color}" stroke="#6f6c66" stroke-width="0.8"` + (top.kind === 'concrete' ? '' : '')));
  }
  // כיסאות בר
  const P = st.walls.P, ns = P.stools || 0;
  for (let i = 0; i < ns; i++) {
    const cy = Pend - P.len + P.len * (i + 0.5) / ns;
    o.push(`<circle cx="${Px - P.overhang - 14}" cy="${n1(cy)}" r="13" fill="#fff" stroke="#8d8a83" stroke-width="1"/>`);
  }
  const showUp = st.ui.planLayer === 'up';
  const zonesOn = st.ui.zones;
  const items = st.items.filter(i => i.type !== 'window');
  const lowI = items.filter(i => ['base', 'blind', 'tall'].includes(layer(i)));
  const topI = items.filter(i => layer(i) === 'top');
  const upI = items.filter(i => layer(i) === 'upper');
  const grp = (it, inner, active) => `<g class="it${it.id === sel ? ' sel' : ''}${active ? '' : ' inactive'}" data-id="${it.id}">${inner}</g>`;
  for (const it of lowI) {
    const r = rectOf(it, st);
    const c = it.type === 'fridge' ? STEEL : colorOf(it, st);
    let s = '';
    if (isBlind(it)) {
      s += R(r.x1, r.y1, r.x2, r.y2, 'fill="url(#hatchL)" stroke="#a8a59e" stroke-width="0.6" stroke-dasharray="3 2"');
    } else {
      s += R(r.x1, r.y1, r.x2, r.y2, `fill="${c}" stroke="#4d4a45" stroke-width="0.9"`);
      if (zonesOn && it.zone && it.zone !== 'shared') s += R(r.x1, r.y1, r.x2, r.y2, `fill="${ZONES[it.zone].color}" fill-opacity="0.32" stroke="none"`);
      if (it.type === 'tall_oven') s += Ln(r.x1, r.y1, r.x2, r.y2, `stroke="${shade(c, .6)}" stroke-width=".8"`) + Ln(r.x2, r.y1, r.x1, r.y2, `stroke="${shade(c, .6)}" stroke-width=".8"`);
      const cx = (r.x1 + r.x2) / 2, cy = (r.y1 + r.y2) / 2;
      const vert = (r.y2 - r.y1) > (r.x2 - r.x1) * 1.3 && (r.x2 - r.x1) < 40;
      const tc = it.type === 'fridge' ? '#222' : ink(c);
      if (r.x2 - r.x1 > 6 && r.y2 - r.y1 > 6) {
        const rot = vert ? ` transform="rotate(-90 ${n1(cx)} ${n1(cy)})"` : '';
        s += Tx(cx, cy - (layer(it) === 'base' ? 0 : 4), it.id, `font-size="10" font-weight="700" text-anchor="middle" dominant-baseline="middle" fill="${tc}"${rot}`);
        if (layer(it) === 'tall' && !vert) s += Tx(cx, cy + 10, it.label || T(it).name.split(' ')[0], `font-size="8.5" text-anchor="middle" dominant-baseline="middle" fill="${tc}"`);
      }
    }
    o.push(grp(it, s, !showUp));
  }
  for (const it of topI) {
    const f = frame(it.wall, st);
    const off = (st.walls[it.wall].off || 0);
    const baseD = 60;
    const t1 = off + (baseD - id_(it)) / 2 - 2, t2 = t1 + id_(it);
    const r = rectST(it.wall, st, it.s, it.s + it.w, t1, t2);
    let s = '';
    const cx = (r.x1 + r.x2) / 2, cy = (r.y1 + r.y2) / 2;
    if (it.type === 'cooktop') {
      s += R(r.x1, r.y1, r.x2, r.y2, `fill="${IND}" stroke="${IND}" rx="2"`);
      const big = Math.max(r.x2 - r.x1, r.y2 - r.y1), horiz = (r.x2 - r.x1) >= (r.y2 - r.y1);
      const nz = it.w >= 80 ? 2 : 2;
      for (let a = 0; a < 2; a++) for (let b = 0; b < nz; b++) {
        const u = horiz ? r.x1 + (r.x2 - r.x1) * (b + .5) / nz : r.x1 + (r.x2 - r.x1) * (a + .5) / 2;
        const v = horiz ? r.y1 + (r.y2 - r.y1) * (a + .5) / 2 : r.y1 + (r.y2 - r.y1) * (b + .5) / nz;
        s += `<circle cx="${n1(u)}" cy="${n1(v)}" r="8" fill="none" stroke="#6b6e73" stroke-width="1.2"/>`;
      }
    } else if (it.type === 'sink') {
      s += R(r.x1, r.y1, r.x2, r.y2, `fill="#d7dadd" stroke="#55585c" stroke-width="0.8" rx="2"`);
      const dbl = (it.variant || 'single') === 'double';
      const horiz = (r.x2 - r.x1) >= (r.y2 - r.y1);
      const parts = dbl ? 2 : 1;
      for (let k = 0; k < parts; k++) {
        const a = horiz ? [r.x1 + 3 + (r.x2 - r.x1 - 6) * k / parts + (k ? 2 : 0), r.y1 + 3, r.x1 + 3 + (r.x2 - r.x1 - 6) * (k + 1) / parts - (k ? 0 : 2), r.y2 - 3] : [r.x1 + 3, r.y1 + 3 + (r.y2 - r.y1 - 6) * k / parts + (k ? 2 : 0), r.x2 - 3, r.y1 + 3 + (r.y2 - r.y1 - 6) * (k + 1) / parts - (k ? 0 : 2)];
        s += R(a[0], a[1], a[2], a[3], 'fill="#eef0f2" stroke="#7d8084" stroke-width="0.6" rx="3"');
      }
    } else if (it.type === 'water') {
      s += `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="4" fill="#14b8a6" stroke="#222" stroke-width=".8"/>` + Tx(cx, cy + 12, 'בר מים', `font-size="8" text-anchor="middle" fill="#222"`);
    } else if (it.type === 'urn') {
      s += `<circle cx="${n1(cx)}" cy="${n1(cy)}" r="${n1(it.w / 2.3)}" fill="#a3a7ab" stroke="#55585c" stroke-width=".8"/>` + Tx(cx, cy + 3, 'מיחם', `font-size="7.5" text-anchor="middle" fill="#111"`);
    } else if (it.type === 'plata') {
      s += R(r.x1, r.y1, r.x2, r.y2, 'fill="#3a3a3a" rx="2"') + Tx(cx, cy + 3, 'פלטה', 'font-size="8.5" text-anchor="middle" fill="#fff"');
    }
    o.push(grp(it, s, !showUp));
  }
  for (const it of upI) {
    const r = rectOf(it, st);
    let s = '';
    if (showUp) {
      s += R(r.x1, r.y1, r.x2, r.y2, `fill="${isBlind(it) ? 'url(#hatchL)' : colorOf(it, st)}" fill-opacity="${isBlind(it) ? 1 : .92}" stroke="#4d4a45" stroke-width="0.9"`);
      if (zonesOn && it.zone && it.zone !== 'shared') s += R(r.x1, r.y1, r.x2, r.y2, `fill="${ZONES[it.zone].color}" fill-opacity="0.3"`);
      if (it.type === 'upper_hood') s += R(r.x1 + 3, r.y1 + 3, r.x2 - 3, r.y2 - 3, 'fill="none" stroke="#777" stroke-dasharray="2 2"');
      const vert = (r.y2 - r.y1) > (r.x2 - r.x1) * 1.3;
      const cx = (r.x1 + r.x2) / 2, cy = (r.y1 + r.y2) / 2;
      if (!isBlind(it)) s += Tx(cx, cy, it.id, `font-size="9" font-weight="700" text-anchor="middle" dominant-baseline="middle" fill="${ink(colorOf(it, st))}"${vert ? ` transform="rotate(-90 ${n1(cx)} ${n1(cy)})"` : ''}`);
    } else {
      s += R(r.x1, r.y1, r.x2, r.y2, 'fill="none" stroke="#5f5c56" stroke-width="0.7" stroke-dasharray="5 3"');
    }
    o.push(grp(it, s, showUp));
  }
  // מעברים
  const dim = (x1, y1, x2, y2, s) => {
    const vert = x1 === x2;
    o.push(`<g class="dim">` + Ln(x1, y1, x2, y2, 'stroke="#8a877f" stroke-width="0.8" stroke-dasharray="4 3"') + Tx((x1 + x2) / 2 + (vert ? 4 : 0), (y1 + y2) / 2 - (vert ? 0 : 3), s, `font-size="10" text-anchor="${vert ? 'end' : 'middle'}" fill="#6b6862" paint-order="stroke" stroke="#faf8f4" stroke-width="3"`) + '</g>');
  };
  const frontAt = (w, s) => {
    const arr = st.items.filter(i => i.wall === w && ['base', 'tall', 'blind'].includes(layer(i)) && i.type !== 'panel' && i.s <= s && i.s + i.w >= s);
    return arr.length ? Math.max(...arr.map(i => (st.walls[w].off || 0) + id_(i))) : 0;
  };
  const yMid = 150, xMid = 260, xEnt = 45;
  const fP = Px + frontAt('P', Pend - yMid), fB = W - frontAt('B', yMid);
  dim(fP, yMid, fB, yMid, `מעבר ${Math.round(fB - fP)}`);
  const fA = frontAt('A', xMid), fC = D - frontAt('C', W - xMid);
  dim(xMid, fA, xMid, fC, `מעבר ${Math.round(fC - fA)}`);
  const fA2 = frontAt('A', xEnt);
  dim(xEnt + 20, fA2, xEnt + 20, Pend - st.walls.P.len, `מעבר ${Math.round(Pend - st.walls.P.len - fA2)}`);
  // יתרות לכל קיר
  const rem = remaining(st);
  const remTxt = (w) => `${rem[w].low >= 0 ? 'פנוי' : 'חריגה'} ${Math.abs(Math.round(rem[w].low))}`;
  o.push(Tx(W / 2 + 70, -46, `${W} ס״מ · ${remTxt('A')}`, 'font-size="9.5" text-anchor="middle" fill="#7a776f"'));
  o.push(Tx(W + 58, D / 2, `${st.walls.B.len} ס״מ · ${remTxt('B')}`, `font-size="9.5" text-anchor="middle" fill="#7a776f" transform="rotate(90 ${W + 58} ${D / 2})"`));
  o.push(Tx((notch + W) / 2, Pend + 62, `${st.walls.C.len} ס״מ · ${remTxt('C')}`, 'font-size="9.5" text-anchor="middle" fill="#7a776f"'));
  o.push(Tx(-78, Pend - st.walls.P.len / 2, `${st.walls.P.len} ס״מ · ${remTxt('P')}`, `font-size="9.5" text-anchor="middle" fill="#7a776f" transform="rotate(-90 -78 ${Pend - st.walls.P.len / 2})"`));
  // מצפן/מקרא כיוונים
  o.push(`<g transform="translate(415,-85)" class="compass"><circle r="20" fill="#fff" stroke="#999"/><path d="M0,-17 L5,0 L0,-4 L-5,0Z" fill="#b5532c"/><text y="-23" font-size="8" text-anchor="middle" fill="#555">מקרר</text><text x="27" y="3" font-size="8" text-anchor="end" fill="#555">כיריים</text><text y="31" font-size="8" text-anchor="middle" fill="#555">חלון</text><text x="-27" y="3" font-size="8" text-anchor="start" fill="#555">אי</text></g>`);
  o.push('</svg>');
  return o.join('');
}

// ===== חזיתות =====
export function elevSVG(st, wall, sel, opts = {}) {
  const H = st.room.H;
  const L = st.walls[wall].len;
  const Y = (z) => H - z;
  const o = [];
  const vb = `-30 -40 ${L + 60} ${H + 95}`;
  const maxL = Math.max(...WALL_IDS.map(w => st.walls[w].len));
  o.push(`<svg class="elev" data-wall="${wall}" viewBox="${vb}" style="max-width:${Math.round((L + 60) / (maxL + 60) * 100)}%" xmlns="http://www.w3.org/2000/svg" font-family="Rubik, Arial, sans-serif">${DEFS}`);
  const top = topOf(st);
  if (wall !== 'P') {
    o.push(R(0, 0, L, H, 'fill="#f6f4ef" stroke="#c9c6bf" stroke-width="0.8"'));
    o.push(Ln(0, 0, L, 0, 'stroke="#9a978f" stroke-dasharray="6 4"'));
  } else o.push(Ln(-20, H, L + 20, H, 'stroke="#9a978f"'));
  o.push(Tx(L, -6, `תקרה ${H}`, 'font-size="9" text-anchor="start" fill="#8a877f"'));
  o.push(Tx(0, -22, `${st.walls[wall].name} – ${L} ס״מ`, 'font-size="13" font-weight="700" text-anchor="end" fill="#2a2925"'));
  o.push(Tx(0, -9, WALL_VIEW[wall], 'font-size="8.5" text-anchor="end" fill="#7a776f"'));
  const its = st.items.filter(i => i.wall === wall);
  const ordr = { window: 0, tall: 1, base: 2, blind: 2, upper: 3, top: 4 };
  its.sort((a, b) => ordr[layer(a)] - ordr[layer(b)]);
  // משטח רציף
  for (const r of counterRuns(st).filter(r => r.wall === wall)) o.push(R(r.s1, Y(CT), r.s2, Y(BT), `fill="${top.color}" stroke="#6f6c66" stroke-width="0.7"`));
  for (const it of its) {
    const x1 = it.s, x2 = it.s + it.w, z1 = iz(it), z2 = z1 + ih(it);
    const c = colorOf(it, st), lc = shade(c, 0.62), tc = ink(c);
    const ln = (xa, za, xb, zb, col = lc, sw = 1) => Ln(xa, Y(za), xb, Y(zb), `stroke="${col}" stroke-width="${sw}"`);
    const box = (xa, za, xb, zb, fill, stroke = '#4d4a45', extra = '') => R(xa, Y(zb), xb, Y(za), `fill="${fill}" stroke="${stroke}" stroke-width="0.8" ${extra}`);
    const gola = (z) => R(x1, Y(z + 1.5), x2, Y(z - 1.5), `fill="${shade(c, .35)}" stroke="none"`);
    let s = '';
    const L_ = layer(it);
    const cx = (x1 + x2) / 2;
    const label = (z, sub) => Tx(cx, Y(z), it.id, `font-size="10" font-weight="700" text-anchor="middle" fill="${tc}"`) + (sub ? Tx(cx, Y(z) + 10, sub, `font-size="8" text-anchor="middle" fill="${tc}"`) : '');
    const zoneBar = (za) => (st.ui.zones && it.zone && it.zone !== 'shared') ? R(x1 + 2, Y(za) - 3, x2 - 2, Y(za), `fill="${ZONES[it.zone].color}"`) : '';
    if (it.type === 'window') {
      s += box(x1, z1, x2, z2, '#dcebf7', '#77746d') + ln(cx, z1, cx, z2, '#77746d') + Tx(cx, Y(z2) + 12, `${it.label || 'חלון'} ${it.w}×${ih(it)}`, 'font-size="9" text-anchor="middle" fill="#55524c"');
    } else if (L_ === 'blind') {
      s += box(x1, 0, x2, BT, 'url(#hatchL)', '#a8a59e', 'stroke-dasharray="3 2"') + Tx(cx, Y(45), 'עיוור', 'font-size="8" text-anchor="middle" fill="#8a877f"');
    } else if (L_ === 'base') {
      s += box(x1, 0, x2, PL, shade(c, .45));
      s += box(x1, PL, x2, BT, c);
      const ft = BT - 4;
      let sub = '';
      if (it.type.startsWith('base_dr')) {
        const n = +it.type.slice(-1);
        const hs = n === 2 ? [PL + 38] : n === 3 ? [PL + 18, PL + 41] : [PL + 16, PL + 33, PL + 50];
        for (const z of hs) s += gola(z);
      } else if (it.type === 'base_oven') {
        s += box(x1 + 2, PL + 12, x2 - 2, PL + 70, OVEN) + R(x1 + 6, Y(PL + 60), x2 - 6, Y(PL + 20), 'fill="#474c53"');
      } else if (it.type === 'dw') { s += ln(x1, 20, x2, 20, lc, .5); sub = 'מדיח'; }
      else if (it.type === 'base_pullout') { sub = 'שולפן'; }
      else if (it.type === 'base_corner') { s += ln(x1 + 3, PL + 3, x1 + 3, ft - 3, lc, .6); sub = 'פינה'; }
      else if (it.w > 60 || it.type === 'base_sink' && it.w > 60) s += ln(cx, PL, cx, ft, lc, 1);
      if (it.type === 'base_sink') sub = 'כיור';
      s += gola(ft + 1);
      s += zoneBar(PL + 3);
      s += label(62, sub);
    } else if (L_ === 'tall') {
      if (it.type === 'fridge') {
        s += box(x1 + 1, 0, x2 - 1, z2, STEEL, '#55585c', 'rx="2"') + ln(x1 + 1, 120, x2 - 1, 120, '#7d8084') + ln(x2 - 6, 125, x2 - 6, 170, '#55585c', 2) + Tx(cx, Y(90), it.label || 'מקרר', 'font-size="10" text-anchor="middle" fill="#222"');
      } else if (it.type === 'panel') {
        s += box(x1, 0, x2, z2, shade(c, .9));
      } else {
        s += box(x1, 0, x2, PL, shade(c, .45)) + box(x1, PL, x2, z2, c);
        if (it.type === 'tall_oven') {
          const stk = it.stack || {}; const n = stk.ovens ?? 2;
          let z = PL; const slots = [];
          if (n === 1) { slots.push(['drawer', z, z + 60]); z += 60; }
          for (let k = 0; k < n; k++) { slots.push(['oven', z, z + 60, (stk.zones || [])[k]]); z += 60; }
          if (stk.mw !== false) { slots.push(['mw', z, z + 45]); z += 45; }
          for (const sl of slots) {
            if (sl[0] === 'drawer') { s += gola(sl[2]); continue; }
            s += box(x1 + 2, sl[1] + 1.5, x2 - 2, sl[2] - 1.5, OVEN, '#111') + R(x1 + 6, Y(sl[2] - (sl[0] === 'mw' ? 10 : 14)), x2 - 6, Y(sl[1] + 7), 'fill="#474c53"');
            const zl = sl[3] ? ZONES[sl[3]].name : '';
            s += Tx(cx, Y((sl[1] + sl[2]) / 2) + 3, sl[0] === 'mw' ? 'מיקרוגל' : 'תנור ' + zl, 'font-size="8.5" text-anchor="middle" fill="#fff"');
            if (st.ui.zones && sl[3]) s += R(x1 + 2, Y(sl[1] + 3.5), x2 - 2, Y(sl[1] + 1.5), `fill="${ZONES[sl[3]].color}"`);
          }
          s += gola(z + 1);
          if (z2 - z > 95) s += ln(x1, z + (z2 - z) / 2, x2, z + (z2 - z) / 2, lc, .8);
          s += Tx(cx, Y(z2 - 14), it.id, `font-size="10" font-weight="700" text-anchor="middle" fill="${tc}"`);
        } else {
          s += ln(x1, 175, x2, 175, lc, .9);
          if (it.w > 60) { s += ln(cx, PL, cx, z2, lc, .9); }
          s += zoneBar(PL + 3) + label(130, it.label || (it.type === 'tall_pantry' ? 'מזווה' : ''));
        }
      }
    } else if (L_ === 'upper') {
      if (isBlind(it)) { s += box(x1, z1, x2, z2, 'url(#hatchL)', '#a8a59e', 'stroke-dasharray="3 2"'); }
      else if (it.type === 'upper_hood') {
        s += box(x1, z1 + 30, x2, z2, c) + box(x1, z1, x2, z1 + 30, STEEL, '#55585c') + Tx(cx, Y(z1 + 15) + 3, it.label || 'מנדף', 'font-size="8.5" text-anchor="middle" fill="#222"') + label(z2 - 30);
      } else if (it.type === 'upper_open') {
        s += box(x1, z1, x2, z2, shade(c, .85)); for (let k = 1; k < 3; k++) s += ln(x1, z1 + ih(it) * k / 3, x2, z1 + ih(it) * k / 3, shade(c, .5), 1.4); s += label(z2 - 12);
      } else {
        s += box(x1, z1, x2, z2, c);
        if (ih(it) > 90) s += ln(x1, z2 - 40, x2, z2 - 40, lc, .9);
        if (it.type === 'upper_lift') s += ln(x1, z1 + (ih(it) > 90 ? (ih(it) - 40) / 2 : ih(it) / 2), x2, z1 + (ih(it) > 90 ? (ih(it) - 40) / 2 : ih(it) / 2), lc, .9);
        else if (it.w > 60) s += ln(cx, z1, cx, ih(it) > 90 ? z2 - 40 : z2, lc, .9);
        s += zoneBar(z1 + 3) + label(z1 + Math.min(45, ih(it) / 2 + 5));
      }
    } else if (L_ === 'top') {
      if (it.type === 'cooktop') s += box(x1, CT, x2, CT + 2.5, IND, IND) + Tx(cx, Y(CT + 6), it.label || `אינדוקציה ${it.w}`, 'font-size="8" text-anchor="middle" fill="#333"');
      else if (it.type === 'sink') {
        const dbl = (it.variant || 'single') === 'double';
        s += R(x1, Y(BT - 2), x2, Y(BT - 20), 'fill="none" stroke="#7d8084" stroke-dasharray="3 2" stroke-width="0.8"');
        if (dbl) s += ln(cx, BT - 2, cx, BT - 20, '#7d8084', .8);
        s += box(cx - 2, CT, cx + 2, CT + 30, STEEL, '#55585c') + R(cx - 2, Y(CT + 32), cx + 14, Y(CT + 28), `fill="${STEEL}" stroke="#55585c" stroke-width=".6"`);
      } else if (it.type === 'water') s += box(cx - 1.5, CT, cx + 1.5, CT + 28, STEEL, '#55585c') + R(cx - 1.5, Y(CT + 30), cx + 10, Y(CT + 27), `fill="${STEEL}" stroke="#55585c" stroke-width=".6"`) + Tx(cx, Y(CT + 34), 'בר מים', 'font-size="8" text-anchor="middle" fill="#0f766e"');
      else if (it.type === 'urn') s += box(x1 + 2, CT, x2 - 2, CT + 38, '#a3a7ab', '#55585c', 'rx="4"') + Tx(cx, Y(CT + 42), 'מיחם', 'font-size="8" text-anchor="middle" fill="#555"');
      else if (it.type === 'plata') s += box(x1, CT, x2, CT + 3, '#3a3a3a', '#222') + Tx(cx, Y(CT + 7), 'פלטה', 'font-size="8" text-anchor="middle" fill="#555"');
    }
    o.push(`<g class="it${it.id === sel ? ' sel' : ''}" data-id="${it.id}">${s}</g>`);
  }
  // נקודות
  if (opts.points) {
    for (const p of points(st).filter(p => p.wall === wall && p.s != null && typeof p.z === 'number')) {
      o.push(`<g class="pt"><circle cx="${p.s}" cy="${Y(p.z)}" r="4" fill="${PT_COLOR[p.kind]}" stroke="#fff" stroke-width="1"/>` + Tx(p.s, Y(p.z) - 6, p.id, 'font-size="7" text-anchor="middle" fill="#333" paint-order="stroke" stroke="#fff" stroke-width="2"') + '</g>');
    }
  }
  // מידות
  const low = its.filter(i => ['base', 'blind', 'tall'].includes(layer(i))).sort((a, b) => a.s - b.s);
  const yd = H + 16;
  o.push(Ln(0, yd, L, yd, 'stroke="#9a978f" stroke-width=".6"'));
  const marks = new Set([0, L]);
  for (const i of low) { marks.add(i.s); marks.add(i.s + i.w); }
  const ms = [...marks].sort((a, b) => a - b);
  for (const m of ms) o.push(Ln(m, yd - 4, m, yd + 4, 'stroke="#9a978f" stroke-width=".6"'));
  for (let k = 0; k < ms.length - 1; k++) { const w = ms[k + 1] - ms[k]; if (w >= 8) o.push(Tx((ms[k] + ms[k + 1]) / 2, yd + 13, Math.round(w * 10) / 10, 'font-size="8.5" text-anchor="middle" fill="#6b6862"')); }
  const rem = remaining(st)[wall];
  o.push(Tx(L, yd + 30, `תחתון: ${rem.low >= 0 ? 'פנוי' : 'חריגה'} ${Math.abs(Math.round(rem.low))} ס״מ${rem.up != null ? ` · עליון: ${rem.up >= 0 ? 'פנוי' : 'חריגה'} ${Math.abs(Math.round(rem.up))} ס״מ` : ''}`, `font-size="9.5" text-anchor="start" fill="${rem.low < 0 ? '#c0392b' : '#6b6862'}"`));
  o.push('</svg>');
  return o.join('');
}
