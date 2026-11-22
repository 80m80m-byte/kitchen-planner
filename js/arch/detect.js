// טעינת תוכנית (PDF / תמונה) וזיהוי אוטומטי של קירות, חדרים, דלתות וחלונות – הכול בדפדפן
import { rdp, polyArea, centroid, bbox, uid, distPtSeg } from './geom.js';

let pdfjs = null;
async function lib() {
  if (pdfjs) return pdfjs;
  pdfjs = await import('../../vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  return pdfjs;
}
export async function openPdf(buf) { const L = await lib(); return L.getDocument({ data: buf }).promise; }

// מרנדר עמוד לתמונה. scale = פיקסלים לנקודת PDF
export async function renderPage(pdf, n, scale = 2.5) {
  const page = await pdf.getPage(n);
  const vp = page.getViewport({ scale });
  const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: g, viewport: vp }).promise;
  return { page, vp, canvas: c, scale };
}
export async function thumbPage(pdf, n, w = 160) {
  const page = await pdf.getPage(n); const v1 = page.getViewport({ scale: 1 });
  const vp = page.getViewport({ scale: w / v1.width });
  const c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height;
  await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  return c.toDataURL('image/jpeg', 0.7);
}

const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// חילוץ כל הקווים הווקטוריים מהעמוד (בפיקסלים של התמונה המרונדרת) עם עובי הקו
export async function extractVector(page, vp) {
  const L = await lib(); const O = L.OPS;
  const ol = await page.getOperatorList();
  let ctm = vp.transform.slice(), lw = 1; const stack = [];
  let path = [];
  const polys = [];
  const flush = (stroke) => {
    if (stroke) { const sc = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])); for (const p of path) if (p.length > 1) polys.push({ pts: p, w: Math.max(lw, 0) * sc, c: p.c ? 1 : 0 }); }
    path = [];
  };
  for (let i = 0; i < ol.fnArray.length; i++) {
    const fn = ol.fnArray[i], a = ol.argsArray[i];
    switch (fn) {
      case O.save: stack.push([ctm.slice(), lw]); break;
      case O.restore: if (stack.length) [ctm, lw] = stack.pop(); break;
      case O.transform: ctm = mul(ctm, a); break;
      case O.setLineWidth: lw = a[0]; break;
      case O.setGState: for (const [k, v] of a[0]) if (k === 'LW') lw = v; break;
      case O.constructPath: {
        const ops = a[0], cs = a[1]; let j = 0; let cur = null; let start = null;
        for (const op of ops) {
          if (op === O.moveTo) { const p = ap(ctm, cs[j++], cs[j++]); cur = [p]; start = p; path.push(cur); }
          else if (op === O.lineTo) { const p = ap(ctm, cs[j++], cs[j++]); if (!cur) { cur = [p]; path.push(cur); } else cur.push(p); }
          else if (op === O.curveTo || op === O.curveTo2 || op === O.curveTo3) {
            let x1, y1, x2, y2, x3, y3; const last = cur ? cur[cur.length - 1] : [0, 0];
            const inv = [ctm]; // הנקודות מומרות אחרי חישוב
            if (op === O.curveTo) { x1 = cs[j++]; y1 = cs[j++]; x2 = cs[j++]; y2 = cs[j++]; x3 = cs[j++]; y3 = cs[j++]; }
            else if (op === O.curveTo2) { x2 = cs[j++]; y2 = cs[j++]; x3 = cs[j++]; y3 = cs[j++]; x1 = null; }
            else { x1 = cs[j++]; y1 = cs[j++]; x3 = cs[j++]; y3 = cs[j++]; x2 = x3; y2 = y3; }
            const P1 = x1 == null ? last : ap(ctm, x1, y1), P2 = ap(ctm, x2, y2), P3 = ap(ctm, x3, y3);
            if (!cur) { cur = [last]; path.push(cur); }
            cur.c = 1;
            for (let t = 1; t <= 8; t++) { const s = t / 8, u = 1 - s; cur.push([u * u * u * last[0] + 3 * u * u * s * P1[0] + 3 * u * s * s * P2[0] + s * s * s * P3[0], u * u * u * last[1] + 3 * u * u * s * P1[1] + 3 * u * s * s * P2[1] + s * s * s * P3[1]]); }
          }
          else if (op === O.closePath) { if (cur && start) cur.push(start); }
          else if (op === O.rectangle) { const x = cs[j++], y = cs[j++], w = cs[j++], h = cs[j++]; const r = [ap(ctm, x, y), ap(ctm, x + w, y), ap(ctm, x + w, y + h), ap(ctm, x, y + h)]; r.push(r[0]); path.push(r); cur = null; }
        }
        break;
      }
      case O.stroke: case O.closeStroke: case O.fillStroke: case O.eoFillStroke: case O.closeFillStroke: case O.closeEOFillStroke: flush(true); break;
      case O.fill: case O.eoFill: case O.endPath: flush(false); break;
    }
  }
  return polys;
}

// ===== עבודה על רשת =====
class Grid {
  constructor(x0, y0, w, h, res) { this.x0 = x0; this.y0 = y0; this.w = w; this.h = h; this.res = res; this.a = new Uint8Array(w * h); }
  cx(x) { return Math.floor((x - this.x0) / this.res); } cy(y) { return Math.floor((y - this.y0) / this.res); }
  line(x1, y1, x2, y2, v, th = 1) {
    let i0 = this.cx(x1), j0 = this.cy(y1); const i1 = this.cx(x2), j1 = this.cy(y2);
    const di = Math.abs(i1 - i0), dj = Math.abs(j1 - j0), si = i0 < i1 ? 1 : -1, sj = j0 < j1 ? 1 : -1; let e = di - dj;
    const r = Math.floor((th - 1) / 2);
    for (let n = 0; n < 100000; n++) {
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) this.set(i0 + a, j0 + b, v);
      if (i0 === i1 && j0 === j1) break;
      const e2 = 2 * e; if (e2 > -dj) { e -= dj; i0 += si; } if (e2 < di) { e += di; j0 += sj; }
    }
  }
  set(i, j, v) { if (i >= 0 && j >= 0 && i < this.w && j < this.h) { const k = j * this.w + i; if (this.a[k] !== 1) this.a[k] = v; } }
  get(i, j) { return (i >= 0 && j >= 0 && i < this.w && j < this.h) ? this.a[j * this.w + i] : 255; }
}

// תיוג רכיבים קשירים של תאים ריקים (4-שכנות)
function label(G, freeFn) {
  const { w, h } = G; const lab = new Int32Array(w * h).fill(-1); const comps = [];
  const q = new Int32Array(w * h);
  for (let k = 0; k < w * h; k++) {
    if (lab[k] !== -1 || !freeFn(G.a[k])) continue;
    const id = comps.length; let qh = 0, qt = 0; q[qt++] = k; lab[k] = id;
    let n = 0, border = false, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    while (qh < qt) {
      const c = q[qh++]; n++; const i = c % w, j = (c / w) | 0;
      if (i === 0 || j === 0 || i === w - 1 || j === h - 1) border = true;
      if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j;
      const nb = [c - 1, c + 1, c - w, c + w];
      for (let t = 0; t < 4; t++) {
        const m = nb[t]; if (t === 0 && i === 0) continue; if (t === 1 && i === w - 1) continue; if (m < 0 || m >= w * h) continue;
        if (lab[m] === -1 && freeFn(G.a[m])) { lab[m] = id; q[qt++] = m; }
      }
    }
    comps.push({ id, n, border, x0, y0, x1, y1 });
  }
  return { lab, comps };
}
// מרחק (בתאים) מהתא הלא-ריק הקרוב – chamfer
function distT(lab, w, h, id) {
  const D = new Float32Array(w * h); const INF = 1e9;
  for (let k = 0; k < w * h; k++) D[k] = lab[k] === id ? INF : 0;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) { const k = j * w + i; if (!D[k]) continue; let m = D[k]; if (i > 0) m = Math.min(m, D[k - 1] + 1); if (j > 0) m = Math.min(m, D[k - w] + 1); if (i > 0 && j > 0) m = Math.min(m, D[k - w - 1] + 1.414); if (i < w - 1 && j > 0) m = Math.min(m, D[k - w + 1] + 1.414); D[k] = m; }
  for (let j = h - 1; j >= 0; j--) for (let i = w - 1; i >= 0; i--) { const k = j * w + i; if (!D[k]) continue; let m = D[k]; if (i < w - 1) m = Math.min(m, D[k + 1] + 1); if (j < h - 1) m = Math.min(m, D[k + w] + 1); if (i < w - 1 && j < h - 1) m = Math.min(m, D[k + w + 1] + 1.414); if (i > 0 && j < h - 1) m = Math.min(m, D[k + w - 1] + 1.414); D[k] = m; }
  return D;
}
// מתאר חיצוני של רכיב – לפי צלעות התאים, ואז פישוט
function trace(lab, w, h, id, c) {
  const edges = new Map(); // מפתח נקודת התחלה -> נקודת סיום
  const key = (x, y) => x * 100000 + y;
  for (let j = c.y0; j <= c.y1; j++) for (let i = c.x0; i <= c.x1; i++) {
    if (lab[j * w + i] !== id) continue;
    const ins = (a, b) => a >= 0 && b >= 0 && a < w && b < h && lab[b * w + a] === id;
    if (!ins(i, j - 1)) edges.set(key(i, j), [i + 1, j]);
    if (!ins(i + 1, j)) edges.set(key(i + 1, j), [i + 1, j + 1]);
    if (!ins(i, j + 1)) edges.set(key(i + 1, j + 1), [i, j + 1]);
    if (!ins(i - 1, j)) edges.set(key(i, j + 1), [i, j]);
  }
  let best = [];
  const used = new Set();
  for (const [k0] of edges) {
    if (used.has(k0)) continue;
    const loop = []; let k = k0; let guard = 0;
    while (!used.has(k) && edges.has(k) && guard++ < 1e6) { used.add(k); const x = Math.floor(k / 100000), y = k % 100000; loop.push([x, y]); const n = edges.get(k); k = key(n[0], n[1]); }
    if (loop.length > best.length) best = loop;
  }
  return best;
}
function orthogonalize(poly) {
  // מיישר צלעות כמעט אופקיות/אנכיות
  const n = poly.length; const p = poly.map(q => q.slice());
  for (let it = 0; it < 2; it++) for (let i = 0; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n]; const dx = b[0] - a[0], dy = b[1] - a[1];
    const ang = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI) % 180;
    if (ang < 10 || ang > 170) { const y = (a[1] + b[1]) / 2; a[1] = y; b[1] = y; }
    else if (Math.abs(ang - 90) < 10) { const x = (a[0] + b[0]) / 2; a[0] = x; b[0] = x; }
  }
  // הסרת נקודות קו-ליניאריות
  const out = [];
  for (let i = 0; i < n; i++) { const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n]; const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); if (Math.abs(cr) > 1e-3 * (1 + Math.hypot(b[0] - a[0], b[1] - a[1]) * Math.hypot(c[0] - b[0], c[1] - b[1]))) out.push(b); }
  return out.length >= 3 ? out : p;
}
// מלבנים מתוך מסכה בינארית (פירוק חמדני) -> קירות
function rects(mask, w, h) {
  const used = new Uint8Array(w * h); const out = [];
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const k = j * w + i; if (!mask[k] || used[k]) continue;
    let i2 = i; while (i2 + 1 < w && mask[j * w + i2 + 1] && !used[j * w + i2 + 1]) i2++;
    let j2 = j; outer: while (j2 + 1 < h) { for (let a = i; a <= i2; a++) if (!mask[(j2 + 1) * w + a] || used[(j2 + 1) * w + a]) break outer; j2++; }
    for (let b = j; b <= j2; b++) for (let a = i; a <= i2; a++) used[b * w + a] = 1;
    out.push([i, j, i2 + 1, j2 + 1]);
  }
  return out;
}

// ===== ניתוח וקטורי =====
// polys בפיקסלי תמונה; cmPerPx להמרה לס"מ. מחזיר גאומטריה בס"מ
export function analyzeVector(polys, cmPerPx, opts = {}) {
  const t0 = performance.now();
  // 1. עובי הקירות: העובי העבה ביותר שיש ממנו מספיק אורך
  const byW = new Map();
  for (const p of polys) { const k = Math.round(p.w * 20) / 20; let L = 0; for (let i = 1; i < p.pts.length; i++) L += Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]); byW.set(k, (byW.get(k) || 0) + L * cmPerPx); }
  const ws = [...byW.entries()].sort((a, b) => b[0] - a[0]);
  const wallW = (ws.find(([w, L]) => L > 2500) || ws[0] || [0])[0];
  const segs = [];
  for (const p of polys) if (Math.abs(Math.round(p.w * 20) / 20 - wallW) < 0.03) for (let i = 1; i < p.pts.length; i++) {
    const a = p.pts[i - 1], b = p.pts[i]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) * cmPerPx < 0.5) continue;
    segs.push([a[0] * cmPerPx, a[1] * cmPerPx, b[0] * cmPerPx, b[1] * cmPerPx]);
  }
  if (segs.length < 8) return { ok: false, msg: 'לא נמצאו קווי קיר עבים בקובץ', wallW };
  let X0 = Infinity, Y0 = Infinity, X1 = -Infinity, Y1 = -Infinity;
  for (const s of segs) { X0 = Math.min(X0, s[0], s[2]); X1 = Math.max(X1, s[0], s[2]); Y0 = Math.min(Y0, s[1], s[3]); Y1 = Math.max(Y1, s[1], s[3]); }
  const res = opts.res || 2.5, M = 60;
  const G = new Grid(X0 - M, Y0 - M, Math.ceil((X1 - X0 + 2 * M) / res), Math.ceil((Y1 - Y0 + 2 * M) / res), res);
  const W = G.w, H = G.h, N = W * H;
  for (const s of segs) G.line(s[0], s[1], s[2], s[3], 1, 1);
  // 1ב. קירות מסומנים בקווקוו אלכסוני (hatch) – קווים דקים אלכסוניים וקצרים, ממלאים לגוש
  const HG = new Grid(G.x0, G.y0, W, H, res); let nh = 0;
  for (const p of polys) {
    if (p.c || !(p.w > wallW * 0.15 && p.w < wallW * 0.4)) continue;
    for (let i = 1; i < p.pts.length; i++) {
      const a = p.pts[i - 1], b = p.pts[i]; const dx = (b[0] - a[0]) * cmPerPx, dy = (b[1] - a[1]) * cmPerPx, L = Math.hypot(dx, dy);
      if (L < 1.5 || L > 90 || Math.min(Math.abs(dx), Math.abs(dy)) / L < 0.55) continue;
      HG.line(a[0] * cmPerPx, a[1] * cmPerPx, b[0] * cmPerPx, b[1] * cmPerPx, 1, 1); nh++;
    }
  }
  if (nh > 30) {
    const solid = morphClose(HG.a, W, H, Math.round(10 / res));
    const HL = new Grid(G.x0, G.y0, W, H, res); HL.a = solid;
    const { lab: hl, comps: hc } = label(HL, v => v === 1);
    const keep = new Set(hc.filter(c => c.n >= 60).map(c => c.id));
    for (let k = 0; k < N; k++) if (hl[k] >= 0 && keep.has(hl[k])) G.a[k] = 1;
  }
  // 2. סגירת פתחים (דלתות/חלונות): חיבור קצוות קווים שממשיכים זה את זה
  const ends = [];
  for (const s of segs) {
    const dx = s[2] - s[0], dy = s[3] - s[1], l = Math.hypot(dx, dy); if (l < 3) continue;
    ends.push({ x: s[0], y: s[1], ux: -dx / l, uy: -dy / l }); ends.push({ x: s[2], y: s[3], ux: dx / l, uy: dy / l });
  }
  const closings = [];
  const freeRatio = (a, b) => { let f = 0, n = 0; for (let t = 0.15; t <= 0.85; t += 0.05) { n++; const x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t; if (G.get(G.cx(x), G.cy(y)) !== 1) f++; } return f / n; };
  for (const e of ends) {
    let best = null, bd = 1e9;
    for (const q of ends) {
      if (q === e) continue;
      const dx = q.x - e.x, dy = q.y - e.y, d = Math.hypot(dx, dy);
      if (d < 35 || d > 150) continue;
      const fx = dx / d, fy = dy / d;
      if (fx * e.ux + fy * e.uy < 0.985) continue;      // ממשיך את כיוון הקו
      if (-(fx * q.ux + fy * q.uy) < 0.985) continue;   // והקו השני פונה חזרה
      if (d < bd) { bd = d; best = q; }
    }
    if (best && freeRatio(e, best) > 0.7) {
      const k = [e, best].map(p => `${Math.round(p.x)},${Math.round(p.y)}`).sort().join('|');
      if (!closings.find(c => c.k === k)) closings.push({ k, x1: e.x, y1: e.y, x2: best.x, y2: best.y, w: bd, band: 25 });
    }
  }
  for (const c of closings) G.line(c.x1, c.y1, c.x2, c.y2, 2, 1);
  // 2ב. סגירת פתחים ברסטר: רווח בין שני קצוות של אותו קיר (עובי דומה, ממשיכים זה את זה)
  {
    const MAXT = Math.round(55 / res), MINL = Math.round(35 / res), MAXL = Math.round(165 / res), CONT = 3;
    const runs = [];
    for (const hor of [true, false]) {
      const A = hor ? H : W, B = hor ? W : H;
      const get = hor ? (u, v) => G.get(u, v) : (u, v) => G.get(v, u);
      const perp = (u, v) => { let a = 0, b = 0; while (a <= MAXT && get(u, v - a - 1) === 1) a++; while (b <= MAXT && get(u, v + b + 1) === 1) b++; return [v - a, v + b]; };
      for (let v = 1; v < A - 1; v++) {
        let u = 0;
        while (u < B) {
          if (get(u, v) !== 1) { u++; continue; }
          const s0 = u + 1; if (s0 >= B) break; if (get(s0, v) === 1) { u = s0; continue; }
          let e = s0; let has2 = false; while (e < B && get(e, v) !== 1) { if (get(e, v) === 2) has2 = true; e++; }
          if (e >= B) break;
          const L = e - s0;
          if (L >= MINL && L <= MAXL && !has2) {
            let cont = true; for (let k = 1; k <= CONT && cont; k++) if (get(s0 - 1 - k, v) !== 1 || get(e + k, v) !== 1) cont = false;
            if (cont) {
              const pl = perp(s0 - 1, v), pr = perp(e, v); const tl = pl[1] - pl[0] + 1, tr = pr[1] - pr[0] + 1;
              const ov = Math.min(pl[1], pr[1]) - Math.max(pl[0], pr[0]) + 1;
              if (tl <= MAXT && tr <= MAXT && ov >= 0.5 * Math.min(tl, tr) && Math.abs(tl - tr) <= Math.max(3, 0.5 * Math.max(tl, tr))) runs.push({ hor, v, s: s0, e, t0: Math.min(pl[0], pr[0]), t1: Math.max(pl[1], pr[1]) });
            }
          }
          u = e;
        }
      }
    }
    for (const r of runs) for (let u = r.s; u < r.e; u++) { if (r.hor) G.set(u, r.v, 2); else G.set(r.v, u, 2); }
    // קיבוץ שורות סמוכות לפתח אחד
    const gm = new Map();
    for (const r of runs) { const k = `${r.hor}|${r.s}|${r.e}`; if (!gm.has(k)) gm.set(k, []); gm.get(k).push(r); }
    for (const list of gm.values()) {
      list.sort((a, b) => a.v - b.v); let grp = [list[0]];
      const flush = () => {
        const r = grp[0], v0 = grp[0].v, v1 = grp[grp.length - 1].v, vm = (v0 + v1 + 1) / 2;
        const a = r.s * res, b = r.e * res, c = vm * res;
        const cl = r.hor ? { x1: G.x0 + a, y1: G.y0 + c, x2: G.x0 + b, y2: G.y0 + c } : { x1: G.x0 + c, y1: G.y0 + a, x2: G.x0 + c, y2: G.y0 + b };
        cl.w = b - a; cl.band = Math.max(8, ((Math.max(...grp.map(g => g.t1)) - Math.min(...grp.map(g => g.t0)) + 1) * res) / 2 + 3); cl.raster = 1;
        const mx = (cl.x1 + cl.x2) / 2, my = (cl.y1 + cl.y2) / 2;
        if (!closings.some(o => Math.hypot((o.x1 + o.x2) / 2 - mx, (o.y1 + o.y2) / 2 - my) < 30 && Math.abs(o.w - cl.w) < 25)) closings.push(cl);
      };
      for (let i = 1; i < list.length; i++) { if (list[i].v === grp[grp.length - 1].v + 1) grp.push(list[i]); else { flush(); grp = [list[i]]; } }
      flush();
    }
  }
  // 3. חדרים: רכיבים ריקים שלא נוגעים בשוליים ורחבים מספיק
  const { lab, comps } = label(G, v => v === 0);
  const bbOf = (cells) => { let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; for (const k of cells) { const i = k % W, j = (k / W) | 0; if (i < x0) x0 = i; if (i > x1) x1 = i; if (j < y0) y0 = j; if (j > y1) y1 = j; } return { x0, y0, x1, y1 }; };
  const cand = [], thin = [];
  for (const c of comps) {
    if (c.border) continue;
    const area = c.n * res * res / 1e4; // מ"ר
    if (area < 0.95) { thin.push(c); continue; } // שברים קטנים (נישות, פירים) – לא חדר
    const D = distT(lab, W, H, c.id);
    let mx = 0; for (let j = c.y0; j <= c.y1; j++) for (let i = c.x0; i <= c.x1; i++) mx = Math.max(mx, D[j * W + i]);
    const width = mx * 2 * res;
    if (width < 45) { thin.push(c); continue; }
    let loop = trace(lab, W, H, c.id, c).map(([i, j]) => [G.x0 + i * res, G.y0 + j * res]);
    const pa = Math.abs(polyArea(loop)) / 1e4;
    if (pa > area * 1.5) { thin.push(c); continue; } // טבעת סביב חדר = פנים של קיר
    const cells = []; for (let j = c.y0; j <= c.y1; j++) for (let i = c.x0; i <= c.x1; i++) if (lab[j * W + i] === c.id) cells.push(j * W + i);
    cand.push({ cells, width });
  }
  // חלל שמכיל חדר אחר בתוך המתאר שלו = רצועה סביב חדר (פנים קיר / שטח שולי) – לא חדר
  for (const c of cand) { const b = bbOf(c.cells); c.bb = b; c.loop = null; }
  for (const c of cand) {
    const cc = comps[lab[c.cells[0]]]; c.loop = trace(lab, W, H, cc.id, cc).map(([i, j]) => [i + 0.5, j + 0.5]);
  }
  for (const c of cand) {
    if (c.drop) continue;
    for (const o of cand) {
      if (o === c || o.bb.x0 > c.bb.x1 || o.bb.x1 < c.bb.x0 || o.bb.y0 > c.bb.y1 || o.bb.y1 < c.bb.y0) continue;
      if (c.cells.length > 0.7 * Math.abs(polyArea(c.loop))) continue;
      const k = o.cells[o.cells.length >> 1]; const pt = [k % W + 0.5, ((k / W) | 0) + 0.5];
      if (pip(pt, c.loop)) { c.drop = true; thin.push(comps[lab[c.cells[0]]]); break; }
    }
  }
  for (let i = cand.length - 1; i >= 0; i--) if (cand[i].drop) cand.splice(i, 1);
  const thinIds = new Set(thin.map(c => c.id));
  const isWallish = (k) => G.a[k] !== 0 || thinIds.has(lab[k]);
  // 3ב. רכיב הקירות הראשי (8-שכנות); חדר שרוב גבולותיו פתחים מלאכותיים / לא שייכים לבניין הראשי – נזרק
  const WL = new Int32Array(N).fill(-1); const wsz = [];
  { const q = new Int32Array(N); for (let k = 0; k < N; k++) { if (WL[k] !== -1 || !isWallish(k)) continue; const id = wsz.length; let h = 0, t = 0; q[t++] = k; WL[k] = id; while (h < t) { const c = q[h++]; const i = c % W, j = (c / W) | 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const x = i + a, y = j + b; if (x < 0 || y < 0 || x >= W || y >= H) continue; const m = y * W + x; if (WL[m] === -1 && isWallish(m)) { WL[m] = id; q[t++] = m; } } } wsz.push(t); } }
  const mainW = wsz.indexOf(Math.max(...wsz));
  const roomsC = cand.filter(r => {
    let nMain = 0, nCl = 0, nAll = 0;
    for (const k of r.cells) { const i = k % W; for (const m of [k - 1, k + 1, k - W, k + W]) { if (m < 0 || m >= N) continue; if ((m === k - 1 && i === 0) || (m === k + 1 && i === W - 1)) continue; if (lab[m] >= 0 && !thinIds.has(lab[m])) continue; nAll++; if (WL[m] === mainW) nMain++; if (G.a[m] === 2) nCl++; } }
    r.clFrac = nCl / Math.max(1, nAll);
    return nMain / Math.max(1, nAll) >= 0.5 && r.clFrac <= 0.4;
  });
  // מסכת עזר לפעולות על תאים
  const tmp = new Int32Array(N).fill(-1);
  const areaOf = (r) => r.cells.length * res * res / 1e4;
  const adjacency = (A, B, R, viaOpen = false) => {
    for (const k of B.cells) tmp[k] = 1;
    let touch = 0; const bandCells = [];
    for (const k of A.cells) { const i = k % W, j = (k / W) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const band = []; for (let s = 1; s <= R; s++) { const m = (j + dj * s) * W + i + di * s; if (tmp[m] === 1) { if (s > 1) { touch++; bandCells.push(...band); } break; } if (!isWallish(m) || (G.a[m] === 2 && !viaOpen)) break; band.push(m); } } }
    for (const k of B.cells) tmp[k] = -1;
    return { touch, bandCells };
  };
  // 3ג. איחוד שברים קטנים (חדר רחצה שנחתך ע"י מחיצת זכוכית / קו דק) – סמוכים לאורך ≥40 ס"מ ע"פ קיר דק
  {
    const R = Math.round(8 / res);
    let changed = true, guard = 0;
    while (changed && guard++ < 20) {
      changed = false;
      for (let a = 0; a < roomsC.length && !changed; a++) for (let b = a + 1; b < roomsC.length && !changed; b++) {
        const A = roomsC[a], B = roomsC[b]; const aa = areaOf(A), ab = areaOf(B);
        if (Math.min(aa, ab) > 3 || aa + ab > 7.5) continue;
        const { touch, bandCells } = adjacency(A, B, R);
        if (touch * res >= 40) { A.cells = [...new Set(A.cells.concat(B.cells, bandCells))]; A.merged = 1; roomsC.splice(b, 1); changed = true; }
      }
    }
  }
  const fx = fixtures(polys, cmPerPx, wallW);
  const thinSegs = [];
  for (const p of polys) { if (p.w >= wallW * 0.9 || p.c) continue; for (let i = 1; i < p.pts.length; i++) { const a = p.pts[i - 1], b = p.pts[i]; const x1 = a[0] * cmPerPx, y1 = a[1] * cmPerPx, x2 = b[0] * cmPerPx, y2 = b[1] * cmPerPx; const dx = Math.abs(x2 - x1), dy = Math.abs(y2 - y1); if (dx < 0.3 && dy > 20) thinSegs.push({ v: 1, c: (x1 + x2) / 2, a: Math.min(y1, y2), b: Math.max(y1, y2) }); else if (dy < 0.3 && dx > 20) thinSegs.push({ v: 0, c: (y1 + y2) / 2, a: Math.min(x1, x2), b: Math.max(x1, x2) }); } }
  // 3ד. פיצול חללים פתוחים גדולים בקווי המשך של קירות (פינות קעורות)
  const polyOf = (cells) => {
    const c = bbOf(cells); for (const k of cells) tmp[k] = 7;
    let loop = trace(tmp, W, H, 7, c).map(([i, j]) => [G.x0 + i * res, G.y0 + j * res]);
    for (const k of cells) tmp[k] = -1;
    loop = rdp(loop.concat([loop[0]]), res * 1.6).slice(0, -1);
    return orthogonalize(loop).map(([x, y]) => [Math.round(x), Math.round(y)]);
  };
  const splitOnce = (r) => {
    const area = areaOf(r); if (area < 12) return null;
    const poly = polyOf(r.cells); const n = poly.length; if (n < 6) return null;
    const sA = Math.sign(polyArea(poly));
    const refl = [];
    for (let i = 0; i < n; i++) { const a = poly[(i - 1 + n) % n], b = poly[i], c = poly[(i + 1) % n]; const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]); if (Math.sign(cr) === -sA && Math.abs(cr) > 1) refl.push({ p: b, din: unit(a, b), dout: unit(b, c) }); }
    if (!refl.length) return null;
    const inR = new Set(r.cells);
    let best = null;
    for (const v of refl) for (const d of [v.din, [-v.dout[0], -v.dout[1]]]) {
      if (Math.abs(d[0]) > 0.01 && Math.abs(d[1]) > 0.01) continue;
      // הליכה ברסטר עד יציאה מהחדר
      let x = v.p[0] + d[0] * res * 0.5, y = v.p[1] + d[1] * res * 0.5; const ox = -d[1] * res * 0.5 * Math.sign(1), oy = d[0] * res * 0.5;
      const path = []; let L = 0; let ok = false;
      for (let s = 0; s < 2000; s++) {
        const k1 = G.cy(y + oy) * W + G.cx(x + ox), k2 = G.cy(y - oy) * W + G.cx(x - ox);
        const in1 = inR.has(k1), in2 = inR.has(k2);
        if (!in1 || !in2) { ok = s > 2; break; }
        path.push(k1, k2);
        x += d[0] * res; y += d[1] * res; L += res;
      }
      if (!ok || L < 60 || L > 600) continue;
      const end = [v.p[0] + d[0] * L, v.p[1] + d[1] * L];
      const stub = refl.some(o => o !== v && Math.hypot(o.p[0] - end[0], o.p[1] - end[1]) < 20);
      // חלוקה
      const cut = new Set(path); const rest = r.cells.filter(k => !cut.has(k));
      for (const k of rest) tmp[k] = 3;
      const parts = []; const q = [];
      for (const k0 of rest) { if (tmp[k0] !== 3) continue; const part = [k0]; tmp[k0] = 4; q.length = 0; q.push(k0); while (q.length) { const c = q.pop(); const i = c % W; for (const m of [c - 1, c + 1, c - W, c + W]) { if ((m === c - 1 && i === 0) || (m === c + 1 && i === W - 1)) continue; if (tmp[m] === 3) { tmp[m] = 4; part.push(m); q.push(m); } } } parts.push(part); }
      for (const k of rest) tmp[k] = -1;
      if (parts.length !== 2) continue;
      // תאי החיתוך מצורפים לחלק הראשון שנוגע בהם
      const a1 = parts[0].length * res * res / 1e4, a2 = parts[1].length * res * res / 1e4, amin = Math.min(a1, a2);
      const sh = (cells) => { const b = bbOf(cells); return Math.min(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1) * res; };
      const s1 = sh(parts[0]), s2 = sh(parts[1]);
      const okCut = (stub && amin >= 3.5 && L <= 1.05 * Math.max(s1, s2)) || (amin >= 5 && L <= 0.62 * Math.min(s1, s2));
      if (!okCut) continue;
      const score = L / Math.sqrt(amin) * (stub ? 0.6 : 1);
      if (!best || score < best.score) best = { score, parts, path };
    }
    if (!best) return null;
    const [p1, p2] = best.parts; const s1 = new Set(p1);
    const cutTo1 = [], cutTo2 = [];
    for (const k of best.path) (s1.has(k - 1) || s1.has(k + 1) || s1.has(k - W) || s1.has(k + W) ? cutTo1 : cutTo2).push(k);
    return [{ cells: p1.concat(cutTo1), fam: r.fam || r }, { cells: p2.concat(cutTo2), fam: r.fam || r }];
  };
  // חלוקה לאזורים לפי ריהוט (מטבח / פינת אוכל / סלון) – קו חיתוך ישר, קצר, שלא חוצה ריהוט
  const seedT = { burner: 'kitchen', island: 'kitchen', table: 'dining', sofa: 'living' };
  const seeds = fx.filter(o => seedT[o.t]).map(o => ({ ...o, z: seedT[o.t], k: G.cy(o.y) * W + G.cx(o.x) }));
  const zone = (r, depth = 0) => {
    const inR = new Set(r.cells); const ss = seeds.filter(o => inR.has(o.k));
    const types = new Set(ss.map(o => o.z));
    if (types.size < 2 || areaOf(r) < 14 || depth > 3) { if (types.size === 1 && depth > 0) r.zone = [...types][0]; return [r]; }
    const b = bbOf(r.cells); let best = null;
    for (let a = 0; a < ss.length; a++) for (let c = a + 1; c < ss.length; c++) {
      const A = ss[a], C = ss[c]; if (A.z === C.z) continue;
      for (const vert of [true, false]) {
        const pa = vert ? A.x : A.y, pc = vert ? C.x : C.y; if (Math.abs(pa - pc) < 120) continue;
        const lo = Math.min(pa, pc) + 50, hi = Math.max(pa, pc) - 50;
        for (let t = lo; t <= hi; t += res * 2) {
          const ci = vert ? G.cx(t) : G.cy(t); const cut = []; let mn = 1e9, mxx = -1e9;
          if (vert) { for (let j = b.y0; j <= b.y1; j++) { const k = j * W + ci; if (inR.has(k)) { cut.push(k); mn = Math.min(mn, j); mxx = Math.max(mxx, j); } } }
          else { for (let i = b.x0; i <= b.x1; i++) { const k = ci * W + i; if (inR.has(k)) { cut.push(k); mn = Math.min(mn, i); mxx = Math.max(mxx, i); } } }
          if (!cut.length) continue;
          const span0 = (vert ? G.y0 : G.x0) + mn * res, span1 = (vert ? G.y0 : G.x0) + (mxx + 1) * res;
          let cross = 0; for (const sg of thinSegs) if (sg.v === (vert ? 0 : 1) && sg.a < t && sg.b > t && sg.c > span0 && sg.c < span1) cross++;
          const cost = cut.length * res + 35 * cross;
          if (best && cost >= best.cost) continue;
          const cs = new Set(cut); const rest = r.cells.filter(k => !cs.has(k));
          const parts = floodParts(rest, W, tmp); if (parts.length < 2) continue;
          const big = parts.filter(p => p.length * res * res / 1e4 >= 3); if (big.length !== 2) continue;
          const s0 = new Set(big[0]); const inA = s0.has(A.k), inC = s0.has(C.k); if (inA === inC) continue;
          best = { cost, parts: big, cut, small: parts.filter(p => p.length * res * res / 1e4 < 3) };
        }
      }
    }
    if (!best) return [r];
    const [p1, p2] = best.parts; const s1 = new Set(p1); const extra = best.cut.concat(...best.small);
    const c1 = [], c2 = []; for (const k of extra) (s1.has(k - 1) || s1.has(k + 1) || s1.has(k - W) || s1.has(k + W) ? c1 : c2).push(k);
    const fam = r.fam || r;
    return [...zone({ cells: p1.concat(c1), fam, width: r.width }, depth + 1), ...zone({ cells: p2.concat(c2), fam, width: r.width }, depth + 1)];
  };
  for (let i = 0; i < roomsC.length; i++) { const z = zone(roomsC[i]); if (z.length > 1) { roomsC.splice(i, 1, ...z); i += z.length - 1; } }
  // אזורים מאותו סוג שנחתכו זה מזה – מאחדים בחזרה
  for (let a = 0; a < roomsC.length; a++) for (let b = roomsC.length - 1; b > a; b--) {
    const A = roomsC[a], B = roomsC[b]; if (!A.zone || A.zone !== B.zone || A.fam !== B.fam) continue;
    const sb = new Set(B.cells); if (!A.cells.some(k => sb.has(k + 1) || sb.has(k - 1) || sb.has(k + W) || sb.has(k - W))) continue;
    A.cells = A.cells.concat(B.cells); roomsC.splice(b, 1);
  }
  // רצועת מטבח (כיריים) שנפרדה מאזור המטבח בקו ארונות – מצרפים
  for (const K of roomsC.filter(r => r.zone === 'kitchen')) {
    for (let i = roomsC.length - 1; i >= 0; i--) {
      const S = roomsC[i]; if (S === K || S.zone || areaOf(S) > 8) continue;
      const inS = new Set(S.cells); if (!seeds.some(o => o.z === 'kitchen' && inS.has(o.k))) continue;
      const { touch, bandCells } = adjacency(S, K, Math.round(24 / res), true);
      if (touch * res >= 60) { K.cells = [...new Set(K.cells.concat(S.cells, bandCells))]; roomsC.splice(i, 1); }
    }
  }
  for (let i = 0; i < roomsC.length; i++) { if (roomsC[i].zone) continue; const sp = splitOnce(roomsC[i]); if (sp) { roomsC.splice(i, 1, ...sp); i--; } }
  // 3ה. פוליגונים + סמלי ריהוט/כלים סניטריים לניחוש סוג
  const rooms = [];
  const ri = new Int32Array(N).fill(-1);
  roomsC.forEach((r, idx) => { for (const k of r.cells) ri[k] = idx; });
  const famCount = new Map(); for (const r of roomsC) if (r.fam) famCount.set(r.fam, (famCount.get(r.fam) || 0) + 1);
  roomsC.forEach((r, idx) => {
    const poly = polyOf(r.cells); const pa = Math.abs(polyArea(poly)) / 1e4;
    // עובי קירות סביב וחשיפה החוצה
    let nb = 0, ext = 0; const th = [];
    for (const k of r.cells) {
      const i = k % W, j = (k / W) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const m0 = (j + dj) * W + i + di; if (!isWallish(m0) || ri[m0] === idx) continue;
        let s = 1, g = 0, reach = 0;
        while (s < 120) { const y = j + dj * s, x = i + di * s; if (x < 0 || y < 0 || x >= W || y >= H) { reach = 1; break; } const m = y * W + x; if (G.a[m] !== 0) { g++; s++; continue; } if (thinIds.has(lab[m])) { s++; continue; } if (lab[m] >= 0 && comps[lab[m]].border) reach = 1; else if (ri[m] >= 0 || lab[m] >= 0) reach = 2; break; }
        nb++;
        let t = 0; while (t < 40) { const y = j + dj * (t + 1), x = i + di * (t + 1); if (x < 0 || y < 0 || x >= W || y >= H) break; const m = y * W + x; if (!isWallish(m)) break; t++; }
        if (t < 40) th.push(t);
        if (reach === 1 && g * res <= 18) ext++;
      }
    }
    th.sort((a, b) => a - b);
    const med = th.length ? th[th.length >> 1] * res : 0;
    const f = { toilet: 0, basin: 0, burner: 0, tub: 0, bed1: 0, bed2: 0, stair: 0, table: 0, sofa: 0, island: 0 };
    for (const o of fx) { const k = G.cy(o.y) * W + G.cx(o.x); if (ri[k] === idx) f[o.t]++; }
    for (const k of r.cells) tmp[k] = 9; const bq = bbOf(r.cells); let mxd = 0;
    { const D = distT(tmp, W, H, 9); for (const k of r.cells) if (D[k] > mxd) mxd = D[k]; }
    for (const k of r.cells) tmp[k] = -1;
    const bp = bbox(poly);
    const room = { id: uid('r'), poly, area: pa, width: Math.round(mxd * 2 * res), aspect: +(Math.max(bp.w, bp.h) / Math.max(1, Math.min(bp.w, bp.h))).toFixed(2), zone: r.zone, fx: f, wallT: Math.round(med), extFrac: +(ext / Math.max(1, nb)).toFixed(2) };
    if (r.fam && famCount.get(r.fam) > 1) room.fam = roomsC.indexOf(r.fam) >= 0 ? 'x' : 'f' + [...famCount.keys()].indexOf(r.fam);
    rooms.push(room);
  });
  // סוג משוער לפי סמלים; חלקים של חלל פתוח: מטבח / סלון / פינת אוכל
  for (const r of rooms) r.fxType = typeFromFixtures(r);
  const fams = new Map(); for (const r of rooms) if (r.fam) { if (!fams.has(r.fam)) fams.set(r.fam, []); fams.get(r.fam).push(r); }
  for (const list of fams.values()) {
    const tot = list.reduce((s, r) => s + r.area, 0);
    const free = list.filter(r => !r.fxType);
    for (const r of free) if (r.extFrac >= 0.45) r.fxType = 'balcony';
    if (tot < 25 || !list.some(r => r.zone)) continue;
    const rest = free.filter(r => !r.fxType && r.width > 135).sort((a, b) => b.area - a.area);
    const has = new Set(list.map(r => r.fxType));
    rest.forEach(r => { const t = !has.has('living') ? 'living' : !has.has('dining') && r.area >= 7 ? 'dining' : null; if (t) { r.fxType = t; has.add(t); } });
  }
  // מעברים: חדר בלי סמלים שמחובר ל-3 פתחים ומעלה = מסדרון/מבואה
  const roomAt = (x, y) => { const i = G.cx(x), j = G.cy(y); if (i < 0 || j < 0 || i >= W || j >= H) return -1; return ri[j * W + i]; };
  const sideRooms = (c, extra) => { const L = Math.hypot(c.x2 - c.x1, c.y2 - c.y1) || 1; const nx = -(c.y2 - c.y1) / L, ny = (c.x2 - c.x1) / L; const mx = (c.x1 + c.x2) / 2, my = (c.y1 + c.y2) / 2; const out = new Set(); for (const sg of [1, -1]) for (let d = 5; d <= (c.band || 25) + extra; d += res) { const q = roomAt(mx + nx * d * sg, my + ny * d * sg); if (q >= 0) { out.add(q); break; } } return out; };
  const nOpen = new Array(rooms.length).fill(0);
  for (const c of closings) if (c.w >= 60 && c.w <= 130) { const sr = sideRooms(c, 20); if (sr.size === 2) for (const q of sr) nOpen[q]++; }
  rooms.forEach((r, i) => { r.openings = nOpen[i]; const f = r.fx; if (nOpen[i] >= 3 && r.width <= 210 && !f.toilet && !f.bed1 && !f.bed2 && !f.burner && !f.table && !f.island && !r.zone && r.area < 22 && r.fxType !== 'balcony') r.fxType = f.stair ? 'stairs' : 'corridor'; });
  // 4. קירות לתלת-ממד: קווי קיר + פנים הקירות (רכיבים צרים)
  const mask = new Uint8Array(N);
  for (let k = 0; k < N; k++) if (G.a[k] === 1 || thinIds.has(lab[k])) mask[k] = 1;
  const walls = rects(mask, W, H).filter(([a, b, c, d]) => (c - a) * (d - b) >= 3).map(([a, b, c, d]) => {
    const x1 = G.x0 + a * res, y1 = G.y0 + b * res, x2 = G.x0 + c * res, y2 = G.y0 + d * res;
    return (x2 - x1) >= (y2 - y1) ? { id: uid('w'), x1, y1: (y1 + y2) / 2, x2, y2: (y1 + y2) / 2, t: y2 - y1 } : { id: uid('w'), x1: (x1 + x2) / 2, y1, x2: (x1 + x2) / 2, y2, t: x2 - x1 };
  });
  // 5. דלתות: קשתות (מקווקוות או רציפות) בעובי דק – התאמת מעגל
  const doors = detectDoors(polys, cmPerPx, wallW, closings, G).filter(d => { const a = d.ang * Math.PI / 180; for (const t of [0.25, 0.5, 0.75]) for (const o of [-40, 0, 40]) { const x = d.x + Math.cos(a) * d.w * t - Math.sin(a) * o, y = d.y + Math.sin(a) * d.w * t + Math.cos(a) * o; if (roomAt(x, y) >= 0) return true; } return false; });
  // 6. חלונות: פתח שבתוכו קווים דקים מקבילים לקיר (זיגוג/מסגרת), או פתח חיצוני בלי דלת
  const glazing = (c) => {
    const vert = Math.abs(c.x2 - c.x1) < Math.abs(c.y2 - c.y1); const cc = vert ? (c.x1 + c.x2) / 2 : (c.y1 + c.y2) / 2;
    const a = vert ? Math.min(c.y1, c.y2) : Math.min(c.x1, c.x2), b = vert ? Math.max(c.y1, c.y2) : Math.max(c.x1, c.x2); const L = b - a;
    const offs = new Set();
    for (const s of thinSegs) { if (s.v !== (vert ? 1 : 0) || Math.abs(s.c - cc) > c.band) continue; const ov = Math.min(b, s.b) - Math.max(a, s.a); if (ov >= 0.75 * L && s.b - s.a <= L * 1.35 + 30) offs.add(Math.round(s.c)); }
    return offs.size;
  };
  const windows = [];
  for (const c of closings) {
    if (c.w < 40) continue;
    const mx = (c.x1 + c.x2) / 2, my = (c.y1 + c.y2) / 2;
    if (doors.some(d => Math.hypot(d.cx - mx, d.cy - my) < d.w * 0.9)) continue;
    const dx = (c.x2 - c.x1) / c.w, dy = (c.y2 - c.y1) / c.w;
    const side = (s) => { for (let r = 15; r <= 60; r += 7) { const x = mx - dy * r * s, y = my + dx * r * s; const k = G.cy(y) * W + G.cx(x); const l = lab[k]; if (l >= 0 && !thinIds.has(comps[l].id)) return comps[l]; } return null; };
    const A = side(1), B = side(-1);
    const ext = (A && A.border) || (B && B.border);
    if (!sideRooms(c, 40).size) continue; // פתח שלא שייך לאף חדר שזוהה (שרטוט חלופי / מחוץ לבניין)
    const gl = glazing(c);
    if (!(gl >= 2 || (ext && gl >= 1))) continue;
    // שני קווי המתאר של הקיר נותנים שני פתחים מקבילים – מאחדים לקו אחד באמצע
    const twin = windows.find(w => { const wx = (w.x1 + w.x2) / 2, wy = (w.y1 + w.y2) / 2; const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1); const ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L; return Math.abs(ux * dx + uy * dy) > 0.98 && Math.abs((mx - wx) * -uy + (my - wy) * ux) < 45 && Math.abs((mx - wx) * ux + (my - wy) * uy) < 20; });
    if (twin) { const sw = (twin.x2 - twin.x1) * dx + (twin.y2 - twin.y1) * dy < 0; const cx1 = sw ? c.x2 : c.x1, cy1 = sw ? c.y2 : c.y1, cx2 = sw ? c.x1 : c.x2, cy2 = sw ? c.y1 : c.y2; twin.x1 = (twin.x1 + cx1) / 2; twin.y1 = (twin.y1 + cy1) / 2; twin.x2 = (twin.x2 + cx2) / 2; twin.y2 = (twin.y2 + cy2) / 2; continue; }
    windows.push({ id: uid('n'), x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2 });
  }
  // חלון חייב להיות ישר (אופקי/אנכי) ובאורך סביר – אחרת זה זיווג שגוי של קווים
  const winsOk = windows.filter(w => { const dx = Math.abs(w.x2 - w.x1), dy = Math.abs(w.y2 - w.y1), L = Math.hypot(dx, dy); return L >= 40 && L <= 400 && Math.min(dx, dy) / L < 0.05; });
  windows.length = 0; windows.push(...winsOk);
  const ms = Math.round(performance.now() - t0);
  return { ok: true, wallW, rooms, walls, doors: doors.map(({ cx, cy, ...d }) => d), windows, closings: closings.length, ms, grid: { w: W, h: H } };
}
function floodParts(cells, W, tmp) {
  for (const k of cells) tmp[k] = 3;
  const parts = []; const q = [];
  for (const k0 of cells) { if (tmp[k0] !== 3) continue; const part = [k0]; tmp[k0] = 4; q.length = 0; q.push(k0); while (q.length) { const c = q.pop(); const i = c % W; for (const m of [c - 1, c + 1, c - W, c + W]) { if ((m === c - 1 && i === 0) || (m === c + 1 && i === W - 1)) continue; if (tmp[m] === 3) { tmp[m] = 4; part.push(m); q.push(m); } } } parts.push(part); }
  for (const k of cells) tmp[k] = -1;
  return parts;
}
const pip = (pt, poly) => { const [x, y] = pt; let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins; } return ins; };
const unit = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
// סגירה מורפולוגית (הרחבה ואז כרסום) בריבוע (2r+1) – מפרידה
function morphClose(a, W, H, r) {
  const pass = (src, dil, hor) => { const o = new Uint8Array(W * H); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { let v = dil ? 0 : 1; for (let t = -r; t <= r; t++) { const x = hor ? i + t : i, y = hor ? j : j + t; const inb = x >= 0 && y >= 0 && x < W && y < H; const s = inb ? src[y * W + x] : (dil ? 0 : 1); if (dil && s) { v = 1; break; } if (!dil && !s) { v = 0; break; } } o[j * W + i] = v; } return o; };
  return pass(pass(pass(pass(a, true, true), true, false), false, true), false, false);
}
// סמלים וקטוריים: אסלה/כיור (אליפסה סגורה), להבות כיריים (עיגולים קטנים), אמבטיה, מיטות (מלבנים), מדרגות
function fixtures(polys, cmPerPx, wallW) {
  const out = []; const small = []; const rectsL = []; const lines = []; const chairs = []; const curves = []; const sofas = [];
  for (const p of polys) {
    if (p.w >= wallW * 0.9) continue;
    const pts = p.pts; let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    const w = (x1 - x0) * cmPerPx, h = (y1 - y0) * cmPerPx, cx = (x0 + x1) / 2 * cmPerPx, cy = (y0 + y1) / 2 * cmPerPx;
    const closed = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) * cmPerPx < 2;
    const mn = Math.min(w, h), mx = Math.max(w, h);
    if (p.c) {
      if (closed && mn >= 6 && mx <= 30 && mx / Math.max(1, mn) < 1.2) small.push({ x: cx, y: cy, r: mx / 2 });
      else if (mx <= 70) curves.push({ a: [pts[0][0] * cmPerPx, pts[0][1] * cmPerPx], b: [pts[pts.length - 1][0] * cmPerPx, pts[pts.length - 1][1] * cmPerPx], x0: x0 * cmPerPx, y0: y0 * cmPerPx, x1: x1 * cmPerPx, y1: y1 * cmPerPx });
      continue;
    }
    if (closed && mn >= 28 && mx <= 62 && mx / Math.max(1, mn) < 1.6) chairs.push({ x: cx, y: cy });
    if (!closed && pts.length >= 4 && pts.length <= 12 && mx >= 160 && mx <= 340 && mn >= 70 && mn <= 110 && pts.every((q, i) => i === 0 || Math.abs(q[0] - pts[i - 1][0]) * cmPerPx < 0.5 || Math.abs(q[1] - pts[i - 1][1]) * cmPerPx < 0.5)) sofas.push({ x: cx, y: cy });
    if (pts.length === 5 && closed) {
      const axis = pts.every((q, i) => i === 0 || Math.abs(q[0] - pts[i - 1][0]) * cmPerPx < 0.5 || Math.abs(q[1] - pts[i - 1][1]) * cmPerPx < 0.5);
      if (axis) rectsL.push({ w, h, cx, cy, mn, mx });
    }
    if (pts.length === 2) { const dx = w, dy = h; if ((dx < 0.3 && dy >= 70 && dy <= 140) || (dy < 0.3 && dx >= 70 && dx <= 140)) lines.push({ v: dx < 0.3, c: dx < 0.3 ? cx : cy, a: dx < 0.3 ? y0 * cmPerPx : x0 * cmPerPx, L: Math.max(dx, dy), x: cx, y: cy }); }
  }
  // קשתות מחוברות לקבוצה (אסלה / כיור): איחוד לפי קצוות
  {
    const n = curves.length, par = new Int32Array(n).map((_, i) => i); const f = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    const idx = new Map(); const key = (q) => `${Math.round(q[0] / 2)},${Math.round(q[1] / 2)}`;
    curves.forEach((c, i) => { for (const q of [c.a, c.b]) { const k = key(q); if (!idx.has(k)) idx.set(k, []); idx.get(k).push(i); } });
    curves.forEach((c, i) => { for (const q of [c.a, c.b]) { const bx = Math.round(q[0] / 2), by = Math.round(q[1] / 2); for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const j of idx.get(`${bx + dx},${by + dy}`) || []) { const o = curves[j]; if (Math.hypot(o.a[0] - q[0], o.a[1] - q[1]) < 1.5 || Math.hypot(o.b[0] - q[0], o.b[1] - q[1]) < 1.5) par[f(i)] = f(j); } } });
    const grp = new Map(); curves.forEach((c, i) => { const r = f(i); if (!grp.has(r)) grp.set(r, []); grp.get(r).push(c); });
    const wets = [];
    for (const g of grp.values()) {
      const x0 = Math.min(...g.map(c => c.x0)), y0 = Math.min(...g.map(c => c.y0)), x1 = Math.max(...g.map(c => c.x1)), y1 = Math.max(...g.map(c => c.y1));
      const mn = Math.min(x1 - x0, y1 - y0), mx = Math.max(x1 - x0, y1 - y0);
      if (g.length >= 2 && mn >= 14 && mn <= 45 && mx >= 28 && mx <= 60) { const x = (x0 + x1) / 2, y = (y0 + y1) / 2; if (!wets.some(w => Math.hypot(w.x - x, w.y - y) < 30)) wets.push({ x, y }); }
    }
    for (const w of wets) out.push({ t: 'toilet', x: w.x, y: w.y });
  }
  for (const r of rectsL) {
    if (r.mx >= 185 && r.mx <= 215 && r.mn >= 85 && r.mn <= 120) out.push({ t: 'bed1', x: r.cx, y: r.cy });
    else if (r.mx >= 185 && r.mx <= 215 && r.mn >= 135 && r.mn <= 205) out.push({ t: 'bed2', x: r.cx, y: r.cy });
    if (r.mx >= 110 && r.mx <= 300 && r.mn >= 70 && r.mn <= 125) {
      const hw = r.w / 2 + 70, hh = r.h / 2 + 70;
      const near = (x, y) => Math.abs(x - r.cx) < hw && Math.abs(y - r.cy) < hh && !(Math.abs(x - r.cx) < r.w / 2 - 5 && Math.abs(y - r.cy) < r.h / 2 - 5);
      const nch = chairs.filter(c => near(c.x, c.y)).length + curves.filter(c => { const w = c.x1 - c.x0, h = c.y1 - c.y0, a = Math.max(w, h), b = Math.min(w, h); return a >= 30 && a <= 62 && b <= 25 && near((c.x0 + c.x1) / 2, (c.y0 + c.y1) / 2); }).length;
      if (nch >= 3) { for (let q = out.length - 1; q >= 0; q--) if ((out[q].t === 'bed1' || out[q].t === 'bed2') && Math.hypot(out[q].x - r.cx, out[q].y - r.cy) < 5) out.splice(q, 1); out.push({ t: 'table', x: r.cx, y: r.cy }); }
      else if (r.mx >= 170 && !(r.mx >= 185 && r.mx <= 215 && r.mn >= 85)) out.push({ t: 'sofa', x: r.cx, y: r.cy });
    }
  }
  // אמבטיה ששוכנת ליד שולחן/ספה היא כנראה ריהוט – משאירים, הסיווג לפי שטח החדר
  // להבות: ≥3 עיגולים קטנים בטווח 70 ס"מ
  const usedB = new Set();
  for (let i = 0; i < small.length; i++) {
    if (usedB.has(i)) continue; const grp = [i];
    for (let j = 0; j < small.length; j++) if (j !== i && !usedB.has(j) && Math.hypot(small[j].x - small[i].x, small[j].y - small[i].y) < 70 && Math.hypot(small[j].x - small[i].x, small[j].y - small[i].y) > 8) grp.push(j);
    const gx = grp.map(g => small[g].x), gy = grp.map(g => small[g].y);
    if (grp.length >= 3 && Math.max(...gx) - Math.min(...gx) >= 18 && Math.max(...gy) - Math.min(...gy) >= 18) { grp.forEach(g => usedB.add(g)); const x = grp.reduce((s, g) => s + small[g].x, 0) / grp.length, y = grp.reduce((s, g) => s + small[g].y, 0) / grp.length; out.push({ t: 'burner', x, y }); }
  }
  for (const so of sofas) if (!out.some(o => o.t === 'sofa' && Math.hypot(o.x - so.x, o.y - so.y) < 60)) out.push({ t: 'sofa', x: so.x, y: so.y });
  for (const o of out) if (o.t === 'table') { const d = Math.min(...out.filter(b => b.t === 'burner').map(b => Math.hypot(b.x - o.x, b.y - o.y))); const others = out.filter(t => t !== o && t.t === 'table'); if (d < 300 || (d < 500 && others.some(t => Math.min(...out.filter(b => b.t === 'burner').map(b => Math.hypot(b.x - t.x, b.y - t.y))) > d + 150))) o.t = 'island'; }
  // מדרגות: ≥5 קווים מקבילים באורך דומה במרווחים 20–35 ס"מ
  const usedS = new Set();
  lines.sort((a, b) => a.c - b.c);
  for (let i = 0; i < lines.length; i++) {
    if (usedS.has(i)) continue; const run = [i]; let last = lines[i];
    for (let j = i + 1; j < lines.length; j++) { const o = lines[j]; if (o.v !== last.v || Math.abs(o.L - last.L) > 6 || Math.abs(o.a - last.a) > 6) continue; const d = o.c - last.c; if (d < 18) continue; if (d > 36) break; run.push(j); last = o; }
    if (run.length >= 5) { run.forEach(r => usedS.add(r)); const m = lines[run[run.length >> 1]]; out.push({ t: 'stair', x: m.x, y: m.y }); }
  }
  return out;
}
function typeFromFixtures(r) {
  const f = r.fx, a = r.area;
  if (r.zone) return r.zone;
  if (f.burner && a >= 4) return 'kitchen';
  if (r.extFrac >= 0.45 && a >= 3 && !f.toilet && !f.bed1 && !f.bed2) return 'balcony';
  if ((f.bed1 || f.bed2) && a >= 6) return f.bed2 ? (a >= 13 ? 'master' : 'bedroom') : (r.wallT >= 28 ? 'mamad' : 'kids');
  const wet = a <= 8;
  if (wet && f.tub) return 'bath';
  if (wet && f.toilet && a < 2.6) return 'wc';
  if (wet && (f.toilet || f.basin)) return a < 3 && !f.basin ? 'wc' : (a < 3 ? 'wc' : 'shower');
  if (f.stair) return 'stairs';
  if (r.width <= 135 && r.aspect >= 2 && a < 15) return 'corridor';
  if (r.wallT >= 28 && a >= 6 && a <= 16 && r.extFrac < 0.3) return 'mamad';
  if (f.bed2) return a >= 13 ? 'master' : 'bedroom';
  if (f.bed1) return 'kids';
  if (r.extFrac >= 0.45 && a >= 3) return 'balcony';
  return null;
}

function detectDoors(polys, cmPerPx, wallW, closings, G) {
  // מקטעים קצרים ודקים (קווקוו של קשת)
  const frags = [];
  for (const p of polys) {
    if (p.w >= wallW * 0.9) continue;
    let L = 0; for (let i = 1; i < p.pts.length; i++) L += Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]);
    L *= cmPerPx;
    if (L > 0.3 && L < 20) frags.push(p.pts.map(([x, y]) => [x * cmPerPx, y * cmPerPx]));
  }
  const arcs = [];
  for (const p of polys) {
    if (!p.c || p.w >= wallW * 0.9) continue;
    let L = 0; for (let i = 1; i < p.pts.length; i++) L += Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]);
    L *= cmPerPx; if (L >= 70 && L <= 210) arcs.push(p.pts.map(([x, y]) => [x * cmPerPx, y * cmPerPx]));
  }
  // שרשור לפי קרבת קצוות והמשכיות כיוון
  const used = new Uint8Array(frags.length); const chains = [];
  const dir = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  const cellK = (x, y) => `${Math.floor(x / 12)},${Math.floor(y / 12)}`;
  const idx = new Map();
  frags.forEach((f, i) => { for (const p of [f[0], f[f.length - 1]]) { const k = cellK(p[0], p[1]); if (!idx.has(k)) idx.set(k, []); idx.get(k).push(i); } });
  const near = (p) => { const out = []; const ci = Math.floor(p[0] / 12), cj = Math.floor(p[1] / 12); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const i of idx.get(`${ci + a},${cj + b}`) || []) out.push(i); return out; };
  for (let i = 0; i < frags.length; i++) {
    if (used[i]) continue; used[i] = 1; let ch = frags[i].slice();
    for (const end of [1, 0]) {
      let grow = true;
      while (grow) {
        grow = false;
        const tip = end ? ch[ch.length - 1] : ch[0], prev = end ? ch[ch.length - 2] : ch[1];
        const td = dir(prev, tip);
        for (const j of near(tip)) {
          if (used[j]) continue; const f = frags[j];
          for (const rev of [false, true]) {
            const g = rev ? f.slice().reverse() : f; const s = g[0];
            const gap = Math.hypot(s[0] - tip[0], s[1] - tip[1]); if (gap > 9) continue;
            const gd = dir(g[0], g[g.length - 1]);
            const dd = gap > 0.5 ? dir(tip, s) : gd;
            if (td[0] * dd[0] + td[1] * dd[1] < 0.8 || td[0] * gd[0] + td[1] * gd[1] < 0.75) continue;
            used[j] = 1; ch = end ? ch.concat(g) : g.slice().reverse().concat(ch); grow = true; break;
          }
          if (grow) break;
        }
      }
    }
    if (ch.length >= 6) chains.push(ch);
  }
  const doors = [];
  for (const ch of chains.concat(arcs)) {
    const c = fitCircle(ch); if (!c) continue;
    const { cx, cy, r } = c; if (r < 55 || r > 125) continue;
    let err = 0; for (const p of ch) err = Math.max(err, Math.abs(Math.hypot(p[0] - cx, p[1] - cy) - r)); if (err > 4) continue;
    const a0 = Math.atan2(ch[0][1] - cy, ch[0][0] - cx), a1 = Math.atan2(ch[ch.length - 1][1] - cy, ch[ch.length - 1][0] - cx);
    let sweep = Math.abs(a1 - a0); if (sweep > Math.PI) sweep = 2 * Math.PI - sweep;
    if (sweep < 1.1 || sweep > 1.9) continue;
    // איזה קצה הוא מצב "סגור" (בתוך הפתח בקיר)
    const ends = [ch[0], ch[ch.length - 1]];
    const score = (p) => { const m = [(p[0] + cx) / 2, (p[1] + cy) / 2]; let best = 1e9; for (const cl of closings) if (!cl.raster) best = Math.min(best, distPtSeg(m, [cl.x1, cl.y1], [cl.x2, cl.y2]).d); return best; };
    // הכנף הסגורה עוברת בתוך הפתח (תאי סגירה/קיר), הפתוחה – בחלל החדר
    // הכנף הסגורה חוצה את הפתח: בקצה שלה משקוף (קיר), ולאורכה אין קיר; הפתוחה צמודה לקיר או באוויר
    const gv = (x, y) => G ? G.get(G.cx(x), G.cy(y)) : 0;
    const closedScore = (p) => { if (!G) return 0; let jamb = 0, along = 0; for (let t = 1.04; t <= 1.3; t += 0.06) { const v = gv(cx + (p[0] - cx) * t, cy + (p[1] - cy) * t); if (v === 1) { jamb = 1; break; } } for (let t = 0.15; t <= 0.9; t += 0.075) if (gv(cx + (p[0] - cx) * t, cy + (p[1] - cy) * t) === 1) along++; return jamb * 10 - along; };
    let s0 = score(ends[0]), s1 = score(ends[1]);
    if (Math.min(s0, s1) > 30) { const sr = (p) => { const m = [(p[0] + cx) / 2, (p[1] + cy) / 2]; let b = 1e9; for (const cl of closings) b = Math.min(b, distPtSeg(m, [cl.x1, cl.y1], [cl.x2, cl.y2]).d); return b; }; s0 = sr(ends[0]); s1 = sr(ends[1]); }
    const c0 = closedScore(ends[0]), c1 = closedScore(ends[1]);
    if (Math.abs(c0 - c1) >= 5) { s0 = c0 > c1 ? 0 : 1; s1 = 1 - s0; }
    const closed = s0 <= s1 ? ends[0] : ends[1], open = s0 <= s1 ? ends[1] : ends[0];
    const ang = Math.atan2(closed[1] - cy, closed[0] - cx);
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    const side = ((open[0] - cx) * nx + (open[1] - cy) * ny) >= 0 ? 1 : -1;
    if (doors.some(d => Math.hypot(d.x - cx, d.y - cy) < 20)) continue;
    doors.push({ id: uid('d'), x: Math.round(cx), y: Math.round(cy), ang: Math.round(ang * 180 / Math.PI), w: Math.round(r / 5) * 5, side, cx: cx + Math.cos(ang) * r / 2, cy: cy + Math.sin(ang) * r / 2 });
  }
  return doors;
}
function fitCircle(pts) {
  // התאמה אלגברית (Kasa)
  let sx = 0, sy = 0, n = pts.length; for (const [x, y] of pts) { sx += x; sy += y; } const mx = sx / n, my = sy / n;
  let suu = 0, svv = 0, suv = 0, suuu = 0, svvv = 0, suvv = 0, svuu = 0;
  for (const [x, y] of pts) { const u = x - mx, v = y - my; suu += u * u; svv += v * v; suv += u * v; suuu += u * u * u; svvv += v * v * v; suvv += u * v * v; svuu += v * u * u; }
  const det = suu * svv - suv * suv; if (Math.abs(det) < 1e-9) return null;
  const b1 = (suuu + suvv) / 2, b2 = (svvv + svuu) / 2;
  const uc = (b1 * svv - b2 * suv) / det, vc = (suu * b2 - suv * b1) / det;
  return { cx: uc + mx, cy: vc + my, r: Math.sqrt(uc * uc + vc * vc + (suu + svv) / n) };
}

// ===== ניתוח תמונה (רסטר) =====
// עובד טוב כשהקירות מצוירים כקווים עבים/מלאים. imageData של התמונה כולה
export function analyzeRaster(img, cmPerPx, opts = {}) {
  const t0 = performance.now();
  const res = opts.res || 3; const step = res / cmPerPx; // פיקסלים לתא
  const W = Math.floor(img.width / step), H = Math.floor(img.height / step);
  const G = new Grid(0, 0, W, H, res);
  const dark = new Uint8Array(W * H);
  const d = img.data;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    let n = 0, m = 0;
    for (let y = Math.floor(j * step); y < Math.floor((j + 1) * step); y += Math.max(1, Math.floor(step / 3))) for (let x = Math.floor(i * step); x < Math.floor((i + 1) * step); x += Math.max(1, Math.floor(step / 3))) { const k = (y * img.width + x) * 4; const l = 0.3 * d[k] + 0.59 * d[k + 1] + 0.11 * d[k + 2]; m++; if (l < 110) n++; }
    dark[j * W + i] = n / Math.max(1, m) > 0.35 ? 1 : 0;
  }
  // פתיחה מורפולוגית: משאירים רק קווים עבים מ-~8 ס"מ
  const r = Math.max(1, Math.round(4 / res));
  const erode = (a, rr) => { const o = new Uint8Array(W * H); for (let j = rr; j < H - rr; j++) for (let i = rr; i < W - rr; i++) { let ok = 1; for (let b = -rr; b <= rr && ok; b++) for (let c = -rr; c <= rr; c++) if (!a[(j + b) * W + i + c]) { ok = 0; break; } o[j * W + i] = ok; } return o; };
  const dilate = (a, rr) => { const o = new Uint8Array(W * H); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { if (!a[j * W + i]) continue; for (let b = -rr; b <= rr; b++) for (let c = -rr; c <= rr; c++) { const y = j + b, x = i + c; if (x >= 0 && y >= 0 && x < W && y < H) o[y * W + x] = 1; } } return o; };
  let wallM = dilate(erode(dark, r), r);
  let cnt = 0; for (const v of wallM) cnt += v;
  let usedThin = false;
  if (cnt < W * H * 0.004) { wallM = dark; usedThin = true; }
  // סגירת פתחים: הרחבת הקירות בכ-45 ס"מ, זיהוי חדרים, ואז החזרה
  const g = Math.round(42 / res);
  const big = dilate(wallM, g);
  for (let k = 0; k < W * H; k++) G.a[k] = big[k];
  const { lab, comps } = label(G, v => v === 0);
  const rooms = [];
  for (const c of comps) {
    if (c.border) continue;
    // מחזירים את הרכיב לגודלו (הרחבה בתוך שטח לא-קיר)
    const m = new Uint8Array(W * H); for (let k = 0; k < W * H; k++) if (lab[k] === c.id) m[k] = 1;
    const grown = dilate(m, g); const lab2 = new Int32Array(W * H).fill(-1); let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let k = 0; k < W * H; k++) if (grown[k] && !wallM[k]) { lab2[k] = 0; n++; const i = k % W, j = (k / W) | 0; x0 = Math.min(x0, i); x1 = Math.max(x1, i); y0 = Math.min(y0, j); y1 = Math.max(y1, j); }
    const area = n * res * res / 1e4; if (area < 1) continue;
    let loop = trace(lab2, W, H, 0, { x0, y0, x1, y1 }).map(([i, j]) => [i * res, j * res]);
    loop = rdp(loop.concat([loop[0]]), res * 2).slice(0, -1);
    const poly = orthogonalize(loop).map(([x, y]) => [Math.round(x), Math.round(y)]);
    rooms.push({ id: uid('r'), poly, area: Math.abs(polyArea(poly)) / 1e4 });
  }
  return { ok: rooms.length > 0, rooms, walls: [], doors: [], windows: [], usedThin, ms: Math.round(performance.now() - t0), msg: rooms.length ? '' : 'לא זוהו חדרים סגורים בתמונה' };
}

// ניחוש סוג חדר לפי שטח וצורה
export function guessType(room, all) {
  if (room.fxType) return room.fxType;
  const a = room.area ?? Math.abs(polyArea(room.poly)) / 1e4;
  const b = bbox(room.poly); const narrow = Math.min(b.w, b.h), aspect = Math.max(b.w, b.h) / Math.max(1, narrow);
  if (narrow < 130 && aspect > 2.6) return 'corridor';
  if (a < 1.5) return 'storage';
  if (a < 2.6) return 'wc';
  if (a < 4.5) return 'bath';
  if (a < 6.5) return narrow < 170 ? 'laundry' : 'shower';
  if (a < 10.5) return 'kids';
  if (a < 14.5) return 'bedroom';
  if (a < 20) return 'master';
  return 'living';
}
