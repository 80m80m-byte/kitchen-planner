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
    if (stroke) { const sc = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2])); for (const p of path) if (p.length > 1) polys.push({ pts: p, w: Math.max(lw, 0) * sc }); }
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
  for (const s of segs) G.line(s[0], s[1], s[2], s[3], 1, 1);
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
      if (!closings.find(c => c.k === k)) closings.push({ k, x1: e.x, y1: e.y, x2: best.x, y2: best.y, w: bd });
    }
  }
  for (const c of closings) G.line(c.x1, c.y1, c.x2, c.y2, 2, 1);
  // 3. חדרים: רכיבים ריקים שלא נוגעים בשוליים ורחבים מספיק
  const { lab, comps } = label(G, v => v === 0);
  const rooms = [], thin = [];
  for (const c of comps) {
    if (c.border) continue;
    const area = c.n * res * res / 1e4; // מ"ר
    if (area < 0.6) { thin.push(c); continue; }
    const D = distT(lab, G.w, G.h, c.id);
    let mx = 0; for (let j = c.y0; j <= c.y1; j++) for (let i = c.x0; i <= c.x1; i++) mx = Math.max(mx, D[j * G.w + i]);
    const width = mx * 2 * res;
    if (width < 45) { thin.push(c); continue; }
    let loop = trace(lab, G.w, G.h, c.id, c).map(([i, j]) => [G.x0 + i * res, G.y0 + j * res]);
    loop = rdp(loop.concat([loop[0]]), res * 1.6).slice(0, -1);
    const poly = orthogonalize(loop).map(([x, y]) => [Math.round(x), Math.round(y)]);
    const pa = Math.abs(polyArea(poly)) / 1e4;
    if (pa > area * 1.5) { thin.push(c); continue; } // טבעת סביב חדר = פנים של קיר
    rooms.push({ id: uid('r'), poly, area: pa, width });
  }
  // 4. קירות לתלת-ממד: קווי קיר + פנים הקירות (רכיבים צרים)
  const mask = new Uint8Array(G.w * G.h);
  for (let k = 0; k < mask.length; k++) if (G.a[k] === 1) mask[k] = 1;
  const thinIds = new Set(thin.map(c => c.id));
  for (let k = 0; k < mask.length; k++) if (thinIds.has(lab[k])) mask[k] = 1;
  const walls = rects(mask, G.w, G.h).filter(([a, b, c, d]) => (c - a) * (d - b) >= 3).map(([a, b, c, d]) => {
    const x1 = G.x0 + a * res, y1 = G.y0 + b * res, x2 = G.x0 + c * res, y2 = G.y0 + d * res;
    return (x2 - x1) >= (y2 - y1) ? { id: uid('w'), x1, y1: (y1 + y2) / 2, x2, y2: (y1 + y2) / 2, t: y2 - y1 } : { id: uid('w'), x1: (x1 + x2) / 2, y1, x2: (x1 + x2) / 2, y2, t: x2 - x1 };
  });
  // 5. דלתות: קשתות מקווקוות בעובי דק – שרשור מקטעים קצרים והתאמת מעגל
  const doors = detectDoors(polys, cmPerPx, wallW, closings);
  // 6. חלונות: פתחים סגורים שלא שייכים לדלת וצד אחד שלהם פונה החוצה
  const windows = [];
  for (const c of closings) {
    if (c.w < 40) continue;
    const mx = (c.x1 + c.x2) / 2, my = (c.y1 + c.y2) / 2;
    if (doors.some(d => Math.hypot(d.cx - mx, d.cy - my) < d.w * 0.9)) continue;
    const dx = (c.x2 - c.x1) / c.w, dy = (c.y2 - c.y1) / c.w;
    const side = (s) => { for (let r = 15; r <= 60; r += 7) { const x = mx - dy * r * s, y = my + dx * r * s; const k = G.cy(y) * G.w + G.cx(x); const l = lab[k]; if (l >= 0 && !thinIds.has(comps[l].id)) return comps[l]; } return null; };
    const A = side(1), B = side(-1);
    const ext = (A && A.border) || (B && B.border);
    if (!ext) continue;
    // שני קווי המתאר של הקיר נותנים שני פתחים מקבילים – מאחדים לקו אחד באמצע
    const twin = windows.find(w => { const wx = (w.x1 + w.x2) / 2, wy = (w.y1 + w.y2) / 2; const L = Math.hypot(w.x2 - w.x1, w.y2 - w.y1); const ux = (w.x2 - w.x1) / L, uy = (w.y2 - w.y1) / L; return Math.abs(ux * dx + uy * dy) > 0.98 && Math.abs((mx - wx) * -uy + (my - wy) * ux) < 45 && Math.abs((mx - wx) * ux + (my - wy) * uy) < 20; });
    if (twin) { const sw = (twin.x2 - twin.x1) * dx + (twin.y2 - twin.y1) * dy < 0; const cx1 = sw ? c.x2 : c.x1, cy1 = sw ? c.y2 : c.y1, cx2 = sw ? c.x1 : c.x2, cy2 = sw ? c.y1 : c.y2; twin.x1 = (twin.x1 + cx1) / 2; twin.y1 = (twin.y1 + cy1) / 2; twin.x2 = (twin.x2 + cx2) / 2; twin.y2 = (twin.y2 + cy2) / 2; continue; }
    windows.push({ id: uid('n'), x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2 });
  }
  const ms = Math.round(performance.now() - t0);
  return { ok: true, wallW, rooms, walls, doors: doors.map(({ cx, cy, ...d }) => d), windows, closings: closings.length, ms, grid: { w: G.w, h: G.h } };
}

function detectDoors(polys, cmPerPx, wallW, closings) {
  // מקטעים קצרים ודקים (קווקוו של קשת)
  const frags = [];
  for (const p of polys) {
    if (p.w >= wallW * 0.9) continue;
    let L = 0; for (let i = 1; i < p.pts.length; i++) L += Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]);
    L *= cmPerPx;
    if (L > 0.3 && L < 20) frags.push(p.pts.map(([x, y]) => [x * cmPerPx, y * cmPerPx]));
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
  for (const ch of chains) {
    const c = fitCircle(ch); if (!c) continue;
    const { cx, cy, r } = c; if (r < 55 || r > 125) continue;
    let err = 0; for (const p of ch) err = Math.max(err, Math.abs(Math.hypot(p[0] - cx, p[1] - cy) - r)); if (err > 4) continue;
    const a0 = Math.atan2(ch[0][1] - cy, ch[0][0] - cx), a1 = Math.atan2(ch[ch.length - 1][1] - cy, ch[ch.length - 1][0] - cx);
    let sweep = Math.abs(a1 - a0); if (sweep > Math.PI) sweep = 2 * Math.PI - sweep;
    if (sweep < 1.1 || sweep > 1.9) continue;
    // איזה קצה הוא מצב "סגור" (בתוך הפתח בקיר)
    const ends = [ch[0], ch[ch.length - 1]];
    const score = (p) => { const m = [(p[0] + cx) / 2, (p[1] + cy) / 2]; let best = 1e9; for (const cl of closings) best = Math.min(best, distPtSeg(m, [cl.x1, cl.y1], [cl.x2, cl.y2]).d); return best; };
    const s0 = score(ends[0]), s1 = score(ends[1]);
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
