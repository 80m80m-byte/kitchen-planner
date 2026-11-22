// מחולל העמדות מבוסס-חוקים: לכל סוג חדר מתכון של פריטים, מיקומים מועמדים לאורך הקירות,
// בדיקת התנגשויות/מרווחים/דלתות/חלונות, ניקוד, ובחירת 3–5 חלופות שונות זו מזו.
import { FURN } from './data.js';
import { corners, localRect, bbox, insidePoly, convexOverlap, centroid, pip, distPtSeg, polyArea, rad } from './geom.js';

const SIDE_NAME = ['הקיר העליון', 'הקיר הימני', 'הקיר התחתון', 'הקיר השמאלי'];
let RELAX = false; // מצב חירום לחדרים קטנים: מרווחים מוקטנים
export const clearZones = (it) => {
  let c = FURN[it.type]?.clear || {};
  if (RELAX) c = { front: c.front ? Math.min(c.front, 50) : 0, left: c.left ? Math.min(c.left, it.type.startsWith('toilet') ? 12 : 0) : 0, right: c.right ? Math.min(c.right, it.type.startsWith('toilet') ? 12 : 0) : 0 }; const hw = it.w / 2, hd = it.d / 2; const z = [];
  if (c.front) z.push(localRect(it, -hw, hd, hw, hd + c.front));
  if (c.back) z.push(localRect(it, -hw, -hd - c.back, hw, -hd));
  if (c.left) z.push(localRect(it, -hw - c.left, -hd, -hw, hd));
  if (c.right) z.push(localRect(it, hw, -hd, hw + c.right, hd));
  return z;
};
// אזור פתיחת דלת בתוך חדר מסוים (או מעבר מול הפתח אם הדלת נפתחת החוצה)
export function doorZone(d, poly) {
  const u = [Math.cos(rad(d.ang)), Math.sin(rad(d.ang))], n = [-u[1], u[0]];
  const H = [d.x, d.y], C = [d.x + u[0] * d.w, d.y + u[1] * d.w];
  const inside = (s) => pip([d.x + u[0] * d.w / 2 + n[0] * 30 * s, d.y + u[1] * d.w / 2 + n[1] * 30 * s], poly);
  const sIn = inside(d.side) ? d.side : inside(-d.side) ? -d.side : 0;
  if (!sIn) return null;
  const depth = sIn === d.side ? d.w : 60;
  return [H, C, [C[0] + n[0] * depth * sIn, C[1] + n[1] * depth * sIn], [H[0] + n[0] * depth * sIn, H[1] + n[1] * depth * sIn]];
}
function roomCtx(room, floor) {
  const poly = room.poly, bb = bbox(poly);
  const doors = (floor.doors || []).map(d => ({ d, z: doorZone(d, poly) })).filter(x => x.z);
  const sideOf = (x1, y1, x2, y2) => {
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    const ds = [Math.abs(my - bb.y0), Math.abs(mx - bb.x1), Math.abs(my - bb.y1), Math.abs(mx - bb.x0)];
    const k = ds.indexOf(Math.min(...ds)); if (ds[k] > 45) return null;
    const along = (x, y) => (k % 2 === 0) ? x - bb.x0 : y - bb.y0;
    const a = along(x1, y1), b = along(x2, y2);
    return { k, a: Math.min(a, b), b: Math.max(a, b) };
  };
  const wins = (floor.windows || []).filter(w => { const m = [(w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2]; let dmin = 1e9; for (let i = 0; i < poly.length; i++) dmin = Math.min(dmin, distPtSeg(m, poly[i], poly[(i + 1) % poly.length]).d); return dmin < 40; })
    .map(w => ({ w, s: sideOf(w.x1, w.y1, w.x2, w.y2), m: [(w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2] })).filter(x => x.s);
  const dints = doors.map(({ d }) => { const u = [Math.cos(rad(d.ang)), Math.sin(rad(d.ang))]; return sideOf(d.x, d.y, d.x + u[0] * d.w, d.y + u[1] * d.w); }).filter(Boolean);
  const L = [bb.w, bb.h, bb.w, bb.h];
  const walls = (floor.walls || []).filter(w => { const b = bb; const mx = Math.min(w.x1, w.x2), Mx = Math.max(w.x1, w.x2), my = Math.min(w.y1, w.y2), My = Math.max(w.y1, w.y2); return Mx > b.x0 - 60 && mx < b.x1 + 60 && My > b.y0 - 60 && my < b.y1 + 60; });
  return { walls, poly, bb, doors, wins, dints, L, area: Math.abs(polyArea(poly)) / 1e4, c: centroid(poly) };
}
// פריט צמוד לקיר k, במרחק t מתחילת הצלע. swap = הצד הארוך לאורך הקיר
function onSide(ctx, type, k, t, swap = false, size = null) {
  const f = FURN[type]; const w = size?.w ?? f.w, d = size?.d ?? f.d;
  const along = swap ? d : w, depth = swap ? w : d; const { bb } = ctx;
  let x, y;
  if (k === 0) { x = bb.x0 + t + along / 2; y = bb.y0 + depth / 2; }
  else if (k === 1) { x = bb.x1 - depth / 2; y = bb.y0 + t + along / 2; }
  else if (k === 2) { x = bb.x0 + t + along / 2; y = bb.y1 - depth / 2; }
  else { x = bb.x0 + depth / 2; y = bb.y0 + t + along / 2; }
  return { type, x, y, w, d, rot: (90 * k + (swap ? 90 : 0)) % 360, _k: k, _t: t, _len: along };
}
function sideCands(ctx, type, opts = {}) {
  const out = [];
  for (let k = 0; k < 4; k++) for (const swap of opts.swap === 'only' ? [true] : opts.swap ? [false, true] : [false]) {
    const f = FURN[type]; const w = opts.size?.w ?? f.w, d = opts.size?.d ?? f.d; const len = swap ? d : w;
    const L = ctx.L[k]; if (len > L) continue;
    const ts = []; for (let t = 0; t <= L - len; t += opts.step || 10) ts.push(t); ts.push(L - len);
    for (const t of ts) out.push(onSide(ctx, type, k, t, swap, opts.size));
  }
  return out;
}
const body = (it) => corners(it);
const isSoft = (it) => !!FURN[it.type]?.soft;
const pairOk = (a, b) => (a.type === 'chair' || a.type === 'desk_chair') && ['table4', 'table6', 'table8', 'table_round', 'desk', 'out_table'].includes(b.type) || (b.type === 'chair' || b.type === 'desk_chair') && ['table4', 'table6', 'table8', 'table_round', 'desk', 'out_table'].includes(a.type) || a.type === 'rug' || b.type === 'rug';
function fits(ctx, it, placed, opt = {}) {
  const B = body(it);
  if (!insidePoly(B, ctx.poly, 1.5)) return false;
  for (const { z } of ctx.doors) if (convexOverlap(B, z) > 2) return false;
  const myZ = clearZones(it);
  for (const z of myZ) {
    const zc = centroid(z); if (!pip(zc, ctx.poly)) return false;
    if (!opt.looseClear && !insidePoly(z, ctx.poly, 6)) return false;
  }
  for (const p of placed) {
    if (pairOk(it, p)) continue;
    const PB = body(p);
    if (convexOverlap(B, PB) > 1) return false;
    if (!isSoft(it)) for (const z of clearZones(p)) if (convexOverlap(B, z) > 2) return false;
    if (!isSoft(p)) for (const z of myZ) if (convexOverlap(z, PB) > 2) return false;
  }
  return true;
}
// האם הגב צמוד לקיר אמיתי (לחדרים לא-מלבניים)
function backOnWall(ctx, it) {
  for (const lx of [0, -it.w / 3, it.w / 3]) {
    const p = localRectPt(it, lx, -it.d / 2 - 6); if (pip(p, ctx.poly)) return false;
    // צלע שנוצרה מפיצול חדר (חלל פתוח) היא לא קיר אמיתי
    if (ctx.walls.length && !ctx.walls.some(w => distPtSeg(p, [w.x1, w.y1], [w.x2, w.y2]).d < (w.t || 12) / 2 + 14) && !ctx.wins.some(w => distPtSeg(p, [w.w.x1, w.w.y1], [w.w.x2, w.w.y2]).d < 30)) return false;
  }
  return true;
}
function localRectPt(it, lx, ly) { const c = Math.cos(rad(it.rot)), s = Math.sin(rad(it.rot)); return [it.x + lx * c - ly * s, it.y + lx * s + ly * c]; }
const overlapLen = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
function winOn(ctx, it) { if (it._k == null) return 0; let o = 0; for (const w of ctx.wins) if (w.s.k === it._k) o += overlapLen(it._t, it._t + it._len, w.s.a, w.s.b); return o; }
function doorOn(ctx, it) { if (it._k == null) return 0; let o = 0; for (const d of ctx.dints) if (d.k === it._k) o += overlapLen(it._t, it._t + it._len, d.a - 10, d.b + 10); return o; }
const distWin = (ctx, it) => ctx.wins.length ? Math.min(...ctx.wins.map(w => Math.hypot(w.m[0] - it.x, w.m[1] - it.y))) : 400;
const distDoor = (ctx, it) => ctx.doors.length ? Math.min(...ctx.doors.map(({ d }) => Math.hypot(d.x - it.x, d.y - it.y))) : 400;
const doorSides = (ctx) => new Set(ctx.dints.map(d => d.k));
const centerOff = (ctx, it) => Math.abs(it._t + it._len / 2 - ctx.L[it._k] / 2);
const isCorner = (ctx, it) => it._t < 1 || Math.abs(it._t + it._len - ctx.L[it._k]) < 1;

function bestOf(ctx, cands, placed, score, opt) {
  let best = null, bs = -1e9;
  for (const c of cands) {
    if (opt?.wall && !backOnWall(ctx, c)) continue;
    if (opt?.noWin && winOn(ctx, c) > 0) continue;
    if (doorOn(ctx, c) > 0 && opt?.noDoor !== false) continue;
    if (!fits(ctx, c, placed, opt)) continue;
    const s = score(c); if (s > bs) { bs = s; best = c; }
  }
  return best ? { it: best, s: bs } : null;
}
function rankAnchors(ctx, cands, score, opt, n) {
  const ok = [];
  for (const c of cands) {
    if (opt?.wall !== false && !backOnWall(ctx, c)) continue;
    if (opt?.noWin && winOn(ctx, c) > 0) continue;
    if (doorOn(ctx, c) > 0) continue;
    if (!fits(ctx, c, [], opt)) continue;
    ok.push({ it: c, s: score(c) });
  }
  ok.sort((a, b) => b.s - a.s);
  // קודם הטוב ביותר בכל קיר/כיוון, ואחר כך מיקומים רחוקים זה מזה
  const pick = [], seen = new Set();
  for (const o of ok) { const key = o.it._k + ':' + o.it.rot; if (!seen.has(key)) { seen.add(key); pick.push(o); } }
  pick.sort((a, b) => b.s - a.s);
  const best = ok[0] ? ok[0].s : 0;
  const out = pick.filter(o => o.s > best - 60).slice(0, n);
  for (const o of ok) { if (out.length >= n) break; if (out.every(p => Math.hypot(p.it.x - o.it.x, p.it.y - o.it.y) > 120)) out.push(o); }
  return out;
}
// פריטים נלווים
function addNightstands(ctx, bed, placed) {
  const out = [];
  for (const sx of [-1, 1]) {
    const [x, y] = localRectPt(bed, sx * (bed.w / 2 + 24), -bed.d / 2 + 20);
    const ns = { type: 'nightstand', x, y, w: 45, d: 40, rot: bed.rot };
    if (fits(ctx, ns, placed.concat(out))) out.push(ns);
  }
  return out;
}
function chairFor(ctx, desk, placed) {
  const [x, y] = localRectPt(desk, 0, desk.d / 2 + 15);
  const ch = { type: 'desk_chair', x, y, w: 55, d: 55, rot: (desk.rot + 180) % 360 };
  return fits(ctx, ch, placed, { looseClear: true }) ? [ch] : [];
}
function tryWardrobe(ctx, placed, sizes = ['wardrobe_240', 'wardrobe_180', 'wardrobe_120'], avoidK = null) {
  for (const t of sizes) {
    const r = bestOf(ctx, sideCands(ctx, t), placed, c => FURN[t].w / 5 - (c._k === avoidK ? 6 : 0) + (isCorner(ctx, c) ? 6 : 0) - distDoor(ctx, c) / 200, { wall: true, noWin: true });
    if (r) return r;
  }
  return null;
}
function tryDesk(ctx, placed) {
  const r = bestOf(ctx, sideCands(ctx, 'desk'), placed, c => 30 - distWin(ctx, c) / 8 + (winOn(ctx, c) > 0 ? 8 : 0), { wall: true });
  if (!r) return [];
  return [r.it, ...chairFor(ctx, r.it, placed.concat([r.it]))];
}

const RECIPES = {
  bedroom: (ctx, n) => bedRoom(ctx, n, ctx.area > 13 ? 'bed_queen' : 'bed_double'),
  master: (ctx, n) => bedRoom(ctx, n, ctx.area > 15 ? 'bed_king' : 'bed_queen', true),
  kids: (ctx, n) => kidsRoom(ctx, n, true),
  mamad: (ctx, n) => kidsRoom(ctx, n, false),
  office: (ctx, n) => office(ctx, n),
  living: (ctx, n) => living(ctx, n),
  dining: (ctx, n) => dining(ctx, n),
  kitchen: (ctx, n) => kitchen(ctx, n),
  bath: (ctx, n) => bath(ctx, n, 'bath'),
  shower: (ctx, n) => bath(ctx, n, 'shower'),
  wc: (ctx, n) => wc(ctx, n),
  laundry: (ctx, n) => laundry(ctx, n),
  balcony: (ctx, n) => balcony(ctx, n),
  corridor: (ctx, n) => corridor(ctx, n),
};

function bedRoom(ctx, n, bedType, master = false) {
  const types = [bedType, 'bed_queen', 'bed_double', 'bed_120'].filter((v, i, a) => a.indexOf(v) === i);
  for (const bt of types) {
    const ds = doorSides(ctx);
    const anchors = rankAnchors(ctx, sideCands(ctx, bt, { step: 5 }), c => 60 - centerOff(ctx, c) / 4 - (winOn(ctx, c) > 0 ? 35 : 0) - (ds.has(c._k) ? 8 : 0) - (distDoor(ctx, c) < 120 ? 10 : 0), {}, n * 2);
    if (!anchors.length) continue;
    const opts = [];
    for (const a of anchors) {
      const placed = [a.it]; let s = a.s; const notes = [];
      placed.push(...addNightstands(ctx, a.it, placed));
      const wr = tryWardrobe(ctx, placed, undefined, a.it._k); if (wr) { placed.push(wr.it); s += wr.s; } else { notes.push('אין קיר פנוי לארון בגדים – שקול ארון בנישה או קיר אחר'); s -= 15; }
      if (ctx.area > 11) { const dk = tryDesk(ctx, placed); if (dk.length) { placed.push(...dk); s += 5; } else if (master) { const dr = bestOf(ctx, sideCands(ctx, 'dresser'), placed, c => 10 - distDoor(ctx, c) / 100, { wall: true }); if (dr) placed.push(dr.it); } }
      if (winOn(ctx, a.it) > 0) notes.push('ראש המיטה מתחת לחלון – לא הייתה חלופה טובה יותר');
      opts.push({ title: `מיטה ליד ${SIDE_NAME[a.it._k]}`, score: s, items: placed, notes });
    }
    return opts;
  }
  return [];
}
function kidsRoom(ctx, n, kids) {
  const anchors = rankAnchors(ctx, sideCands(ctx, 'bed_single', { swap: true, step: 5 }), c => 40 + (isCorner(ctx, c) ? 15 : 0) + (c.rot % 180 !== (c._k * 90) % 180 ? 6 : 0) - (winOn(ctx, c) > 0 && c.rot === c._k * 90 ? 20 : 0) - (distDoor(ctx, c) < 100 ? 8 : 0), {}, n * 2);
  const opts = [];
  for (const a of anchors) {
    const placed = [a.it]; let s = a.s; const notes = [];
    const dk = tryDesk(ctx, placed); if (dk.length) { placed.push(...dk); s += 10; } else notes.push('אין מקום לשולחן כתיבה');
    const wr = tryWardrobe(ctx, placed, ['wardrobe_180', 'wardrobe_120']); if (wr) { placed.push(wr.it); s += wr.s; } else { notes.push('אין קיר פנוי לארון'); s -= 10; }
    if (kids && ctx.area > 10) { const bc = bestOf(ctx, sideCands(ctx, 'bookcase'), placed, c => 5 - distDoor(ctx, c) / 200, { wall: true }); if (bc) placed.push(bc.it); }
    if (!kids) notes.push('בממ״ד: לא לתלות מדפים כבדים על הקיר החיצוני ולהשאיר גישה לחלון ההדף');
    opts.push({ title: `מיטה ליד ${SIDE_NAME[a.it._k]}${isCorner(ctx, a.it) ? ' (פינה)' : ''}`, score: s, items: placed, notes });
  }
  return opts;
}
function office(ctx, n) {
  const anchors = rankAnchors(ctx, sideCands(ctx, 'desk', { step: 5 }), c => 40 - distWin(ctx, c) / 6 + (winOn(ctx, c) > 0 ? 6 : 0), {}, n * 2);
  return anchors.map(a => {
    const placed = [a.it, ...chairFor(ctx, a.it, [a.it])]; let s = a.s;
    for (let i = 0; i < 2; i++) { const bc = bestOf(ctx, sideCands(ctx, 'bookcase'), placed, c => 5 - distDoor(ctx, c) / 200, { wall: true }); if (bc) placed.push(bc.it); }
    if (ctx.area > 9) { const so = bestOf(ctx, sideCands(ctx, 'sofa2'), placed, c => 5, { wall: true }); if (so) { placed.push(so.it); s += 3; } }
    return { title: `שולחן ליד ${SIDE_NAME[a.it._k]}`, score: s, items: placed, notes: [] };
  });
}
function living(ctx, n) {
  const sofaT = Math.max(...ctx.L) > 330 ? 'sofa3' : 'sofa2';
  const anchors = rankAnchors(ctx, sideCands(ctx, sofaT, { step: 10 }), c => { const dist = ctx.L[(c._k + 1) % 2 === 0 ? 0 : 1]; const across = (c._k % 2 === 0) ? ctx.bb.h : ctx.bb.w; return 40 - centerOff(ctx, c) / 8 - Math.abs(Math.min(across, 420) - 320) / 10 - (winOn(ctx, c) > 0 ? 6 : 0); }, {}, n * 2);
  return anchors.map(a => {
    const placed = [a.it]; let s = a.s; const notes = [];
    // שולחן סלון מול הספה
    const [cx, cy] = localRectPt(a.it, 0, a.it.d / 2 + 40 + 30);
    const ct = { type: 'coffee', x: cx, y: cy, w: 110, d: 60, rot: a.it.rot };
    if (fits(ctx, ct, placed)) placed.push(ct);
    // טלוויזיה בקיר שממול, מיושרת לספה
    const k2 = (a.it._k + 2) % 4; let tv = null;
    for (const sh of [0, 10, -10, 20, -20, 40, -40, 60, -60, 90, -90]) {
      const t = a.it._t + a.it._len / 2 - 90 + sh; if (t < 0 || t + 180 > ctx.L[k2]) continue;
      // צלע 2/3 רצות באותו כיוון כמו 0/1, לכן אותו t
      const c = onSide(ctx, 'tv_unit', k2, t);
      if (backOnWall(ctx, c) && doorOn(ctx, c) === 0 && fits(ctx, c, placed)) { tv = c; s -= Math.abs(sh) / 5; break; }
    }
    if (tv) { placed.push(tv); const dist = Math.hypot(tv.x - a.it.x, tv.y - a.it.y); if (dist > 450) notes.push(`מרחק צפייה ${Math.round(dist)} ס״מ – גדול; אפשר מסך גדול או לקרב`); s += 15; }
    else { notes.push('אין קיר פנוי מול הספה לטלוויזיה'); s -= 15; }
    const ar = bestOf(ctx, (() => { const out = []; for (const sx of [-1, 1]) { const [x, y] = localRectPt(a.it, sx * (a.it.w / 2 + 70), a.it.d / 2 + 70); out.push({ type: 'armchair', x, y, w: 85, d: 85, rot: (a.it.rot + (sx > 0 ? 270 : 90)) % 360 }); } return out; })(), placed, () => 1, { noDoor: false });
    if (ar) placed.push(ar.it);
    return { title: `ספה ליד ${SIDE_NAME[a.it._k]}`, score: s, items: placed, notes };
  });
}
function dining(ctx, n) {
  const opts = [];
  for (const tt of ['table8', 'table6', 'table4', 'table_round']) {
    const f = FURN[tt]; const cands = [];
    for (const rot of tt === 'table_round' ? [0] : [0, 90]) for (let x = ctx.bb.x0; x <= ctx.bb.x1; x += 10) for (let y = ctx.bb.y0; y <= ctx.bb.y1; y += 10) cands.push({ type: tt, x, y, w: f.w, d: f.d, rot });
    const ok = cands.filter(c => fits(ctx, c, [])).map(c => ({ it: c, s: 30 + f.w / 10 - Math.hypot(c.x - ctx.c[0], c.y - ctx.c[1]) / 15 + Math.min(distDoor(ctx, c), 200) / 20 }));
    ok.sort((a, b) => b.s - a.s);
    for (const o of ok) {
      if (opts.some(p => p.items[0].type === tt && Math.hypot(p.items[0].x - o.it.x, p.items[0].y - o.it.y) < 60 && p.items[0].rot === o.it.rot)) continue;
      const placed = [o.it];
      const t = o.it; const per = Math.max(1, Math.floor(t.w / 60));
      if (tt === 'table_round') { for (let i = 0; i < 4; i++) { const a = i * 90; const [x, y] = localRectPt({ ...t, rot: a }, 0, -t.d / 2 - 15); placed.push({ type: 'chair', x, y, w: 45, d: 50, rot: (a + 180) % 360 }); } }
      else {
        for (const sy of [-1, 1]) for (let i = 0; i < per; i++) { const lx = -t.w / 2 + t.w * (i + 0.5) / per; const [x, y] = localRectPt(t, lx, sy * (t.d / 2 + 12)); placed.push({ type: 'chair', x, y, w: 45, d: 50, rot: (t.rot + (sy < 0 ? 0 : 180)) % 360 }); }
        if (t.w >= 180) for (const sx of [-1, 1]) { const [x, y] = localRectPt(t, sx * (t.w / 2 + 12), 0); placed.push({ type: 'chair', x, y, w: 45, d: 50, rot: (t.rot + (sx < 0 ? 270 : 90)) % 360 }); }
      }
      const seats = placed.length - 1;
      opts.push({ title: `${f.name} · ${seats} מקומות`, score: o.s, items: placed, notes: [] });
      if (opts.filter(p => p.items[0].type === tt).length >= 2) break;
    }
    if (opts.length >= n) break;
  }
  return opts;
}
function kitchen(ctx, n) {
  const opts = []; const ds = doorSides(ctx);
  const sides = [0, 1, 2, 3].sort((a, b) => ctx.L[b] - ctx.L[a]);
  const run = (k, t0, len, placed) => {
    if (len < 60) return null;
    const c = onSide(ctx, 'counter', k, t0, false, { w: len, d: 60 });
    return backOnWall(ctx, c) && doorOn(ctx, c) === 0 && fits(ctx, c, placed, { looseClear: true }) ? c : null;
  };
  const fr = (k, t, placed) => { const c = onSide(ctx, 'fridge', k, t); return backOnWall(ctx, c) && doorOn(ctx, c) === 0 && fits(ctx, c, placed, { looseClear: true }) ? c : null; };
  for (const k of sides) {
    const L = ctx.L[k];
    // ליניארי
    for (const fl of [0, 1]) {
      const placed = []; const f = fr(k, fl ? L - 80 : 0, placed); if (!f) continue; placed.push(f);
      let c = null; for (let len = Math.min(L - 80, 420); len >= 120 && !c; len -= 20) c = run(k, fl ? L - 80 - len : 80, len, placed);
      if (!c) continue; placed.push(c);
      opts.push({ title: `מטבח ישר ליד ${SIDE_NAME[k]}`, score: 20 + c.w / 20, items: placed, notes: ['לתכנון מפורט של ארונות ומכשירים – עורך המטבח'] }); break;
    }
    // L
    for (const k2 of [(k + 1) % 4, (k + 3) % 4]) {
      const placed = []; const startAtEnd = k2 === (k + 1) % 4;
      const f = fr(k, startAtEnd ? 0 : L - 80, placed); if (!f) continue; placed.push(f);
      const c1 = run(k, startAtEnd ? 80 : 0, L - 80, placed); if (!c1) continue; placed.push(c1);
      const L2 = ctx.L[k2]; const t2 = (k2 === 1 || k2 === 2) ? (k === 0 || k === 3 ? 60 : 0) : 0;
      const c2 = run(k2, k2 === (k + 1) % 4 ? (k === 0 || k === 1 ? 60 : 0) : (k === 2 || k === 3 ? 0 : 60), Math.min(L2 - 60, 300), placed);
      if (!c2) continue; placed.push(c2);
      opts.push({ title: `מטבח L (ליד ${SIDE_NAME[k]})`, score: 30 + (c1.w + c2.w) / 25, items: placed, notes: ['לתכנון מפורט של ארונות ומכשירים – עורך המטבח'] }); break;
    }
    if (opts.length >= n) break;
  }
  return opts;
}
function bath(ctx, n, kind) {
  const opts = [];
  const wet = kind === 'bath' && Math.max(...ctx.L) >= 170 ? ['bathtub', 'shower90', 'shower80'] : ['shower90', 'shower80', 'shower120'];
  for (const wt of wet) {
    const anchors = rankAnchors(ctx, sideCands(ctx, wt, { step: 5, swap: wt === 'shower120' || wt === 'bathtub' }).filter(c => isCorner(ctx, c)), c => 30 - (distDoor(ctx, c) < 100 ? 10 : 0) + (FURN[wt].w > 100 ? 4 : 0), {}, 3);
    for (const a of anchors) {
      const placed = [a.it]; let s = a.s; const notes = [];
      const tl = bestOf(ctx, sideCands(ctx, ctx.area < 3.2 ? 'toilet_wall' : 'toilet', { step: 5 }), placed, c => 20 - (distDoor(ctx, c) < 70 ? 6 : 0) + (c._k !== a.it._k ? 3 : 0), { wall: true });
      if (tl) { placed.push(tl.it); s += tl.s; } else { notes.push('אין מקום לאסלה עם 40 ס״מ מהציר לצד ו-60 ס״מ מלפנים'); s -= 30; }
      const vn = bestOf(ctx, sideCands(ctx, ctx.area > 4 ? 'vanity80' : 'vanity60', { step: 5 }), placed, c => 15 - distDoor(ctx, c) / 50, { wall: true }) || bestOf(ctx, sideCands(ctx, 'sink_small', { step: 5 }), placed, () => 5, { wall: true });
      if (vn) { placed.push(vn.it); s += 10; } else { notes.push('אין מקום לכיור'); s -= 15; }
      if (ctx.area >= 5) { const wm = bestOf(ctx, sideCands(ctx, 'washer', { step: 5 }), placed, c => 5 + (isCorner(ctx, c) ? 3 : 0), { wall: true }); if (wm) placed.push(wm.it); }
      opts.push({ title: `${FURN[wt].name} בפינה, ליד ${SIDE_NAME[a.it._k]}`, score: s, items: placed, notes });
    }
    if (opts.length >= n) break;
  }
  return opts.sort((a, b) => b.score - a.score);
}
function wc(ctx, n) {
  const ds = doorSides(ctx);
  const anchors = rankAnchors(ctx, sideCands(ctx, ctx.area < 1.6 ? 'toilet_wall' : 'toilet', { step: 5 }), c => 30 + (ds.has((c._k + 2) % 4) ? 10 : 0) - centerOff(ctx, c) / 20, {}, n);
  return anchors.map(a => {
    const placed = [a.it];
    const sk = bestOf(ctx, sideCands(ctx, 'sink_small', { step: 5 }), placed, c => 5 - distDoor(ctx, c) / 100, { wall: true });
    if (sk) placed.push(sk.it);
    return { title: `אסלה ליד ${SIDE_NAME[a.it._k]}`, score: a.s, items: placed, notes: sk ? [] : ['אין מקום לכיור – אפשר כיור פינתי קטן או כיור מחוץ לתא'] };
  });
}
function laundry(ctx, n) {
  const anchors = rankAnchors(ctx, sideCands(ctx, 'washer', { step: 5 }), c => 20 + (isCorner(ctx, c) ? 5 : 0), {}, n);
  return anchors.map(a => {
    const placed = [a.it];
    const dr = bestOf(ctx, [onSide(ctx, 'dryer', a.it._k, a.it._t + 60), onSide(ctx, 'dryer', a.it._k, a.it._t - 60)], placed, () => 5, { wall: true });
    if (dr) placed.push(dr.it);
    const bs = bestOf(ctx, sideCands(ctx, 'basin', { step: 5 }), placed, () => 3, { wall: true }); if (bs) placed.push(bs.it);
    return { title: `מכונה ליד ${SIDE_NAME[a.it._k]}`, score: a.s, items: placed, notes: dr ? [] : ['אפשר להעמיד את המייבש מעל מכונת הכביסה'] };
  });
}
function balcony(ctx, n) {
  const opts = [];
  const tbl = [];
  for (const rot of [0, 90]) for (let x = ctx.bb.x0; x <= ctx.bb.x1; x += 10) for (let y = ctx.bb.y0; y <= ctx.bb.y1; y += 10) { const c = { type: 'out_table', x, y, w: 120, d: 80, rot }; if (fits(ctx, c, [])) tbl.push({ it: c, s: 20 - Math.hypot(x - ctx.c[0], y - ctx.c[1]) / 20 }); }
  tbl.sort((a, b) => b.s - a.s);
  for (const t of tbl) {
    if (opts.some(o => Math.hypot(o.items[0].x - t.it.x, o.items[0].y - t.it.y) < 80)) continue;
    const placed = [t.it];
    for (const sy of [-1, 1]) for (const lx of [-30, 30]) { const [x, y] = localRectPt(t.it, lx, sy * (40 + 12)); placed.push({ type: 'chair', x, y, w: 45, d: 50, rot: (t.it.rot + (sy < 0 ? 0 : 180)) % 360 }); }
    const pl = bestOf(ctx, sideCands(ctx, 'plant').filter(c => isCorner(ctx, c)), placed, () => 1, { wall: true }); if (pl) placed.push(pl.it);
    const lg = bestOf(ctx, sideCands(ctx, 'lounger', { swap: true }), placed, () => 1, { wall: true }); if (lg) placed.push(lg.it);
    opts.push({ title: 'פינת ישיבה' + (lg ? ' + כיסא נוח' : ''), score: t.s, items: placed, notes: [] });
    if (opts.length >= n) break;
  }
  return opts;
}
function corridor(ctx, n) {
  const anchors = rankAnchors(ctx, sideCands(ctx, 'shoe', { step: 10 }), c => 10 - Math.abs(distDoor(ctx, c) - 120) / 50, {}, n);
  return anchors.map(a => ({ title: `ארון נעליים ליד ${SIDE_NAME[a.it._k]}`, score: a.s, items: [a.it], notes: ['במסדרון להשאיר מעבר של 90 ס״מ לפחות'] }));
}

export function generate(room, floor, n = 4) {
  const fn = RECIPES[room.type];
  if (!fn) return { options: [], msg: 'אין מחולל העמדות לסוג חדר זה. אפשר להוסיף רהיטים ידנית מהקטלוג.' };
  const ctx = roomCtx(room, floor);
  let opts = [];
  try {
    opts = fn(ctx, n);
    if (!opts.length) { RELAX = true; try { opts = fn(ctx, n); } finally { RELAX = false; } for (const o of opts) o.notes.unshift('החדר קטן מהמומלץ – הועמד עם מרווחים מוקטנים'); }
  } catch (e) { RELAX = false; console.error(e); return { options: [], msg: 'שגיאה במחולל: ' + e.message }; }
  opts.sort((a, b) => b.score - a.score);
  opts = opts.slice(0, n);
  for (const o of opts) o.items = o.items.map(({ _k, _t, _len, ...it }) => ({ ...it, x: Math.round(it.x), y: Math.round(it.y), room: room.id }));
  return { options: opts, msg: opts.length ? '' : 'לא נמצאה העמדה שעומדת בכל המרווחים. אולי החדר קטן מדי לסוג שנבחר, או שהדלתות חוסמות. אפשר להעמיד ידנית.' };
}

// בדיקות לרהיטים קיימים (למצב עריכה)
export function checkFurniture(floor) {
  const out = []; const F = floor.furn || [];
  const roomOf = (it) => floor.rooms.find(r => r.id === it.room) || floor.rooms.find(r => pip([it.x, it.y], r.poly));
  const zones = [];
  for (const r of floor.rooms) for (const d of floor.doors || []) { const z = doorZone(d, r.poly); if (z) zones.push({ z, d, r }); }
  for (let i = 0; i < F.length; i++) {
    const a = F[i], A = corners(a), f = FURN[a.type] || {};
    const r = roomOf(a);
    if (!r) out.push({ sev: 'warn', msg: `${f.name || a.type} מחוץ לחדרים`, ids: [a.id] });
    else if (!insidePoly(A, r.poly, 3)) out.push({ sev: 'err', msg: `${f.name} נכנס לתוך קיר (${r.name || ''})`, ids: [a.id] });
    if (r && !f.soft) for (const z of clearZones(a)) if (!insidePoly(z, r.poly, 8)) { out.push({ sev: 'warn', msg: `אין מספיק מרווח שימוש מול/ליד ${f.name}`, ids: [a.id] }); break; }
    if (!f.flat) for (const { z, d } of zones) if (convexOverlap(A, z) > 3) { out.push({ sev: 'warn', msg: `${f.name} חוסם את פתיחת הדלת`, ids: [a.id, d.id] }); break; }
    for (let j = i + 1; j < F.length; j++) {
      const b = F[j]; if (pairOk(a, b)) continue;
      const B = corners(b);
      if (convexOverlap(A, B) > 1) { out.push({ sev: 'err', msg: `${f.name} מתנגש ב${FURN[b.type]?.name}`, ids: [a.id, b.id] }); continue; }
      if (!f.soft && !FURN[b.type]?.soft) {
        if (clearZones(a).some(z => convexOverlap(z, B) > 4)) out.push({ sev: 'warn', msg: `${FURN[b.type]?.name} חוסם את המעבר של ${f.name}`, ids: [a.id, b.id] });
        else if (clearZones(b).some(z => convexOverlap(z, A) > 4)) out.push({ sev: 'warn', msg: `${f.name} חוסם את המעבר של ${FURN[b.type]?.name}`, ids: [a.id, b.id] });
      }
    }
  }
  return out;
}
