// גאומטריה בסיסית. יחידות: ס"מ. ציר x ימינה, y למטה (כמו בתוכנית). סיבוב במעלות, חיובי = עם כיוון השעון במסך.
export const rad = (d) => d * Math.PI / 180;
export function corners(it) {
  const c = Math.cos(rad(it.rot || 0)), s = Math.sin(rad(it.rot || 0));
  const hw = it.w / 2, hd = it.d / 2;
  return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([x, y]) => [it.x + x * c - y * s, it.y + x * s + y * c]);
}
export function toWorld(it, lx, ly) { const c = Math.cos(rad(it.rot || 0)), s = Math.sin(rad(it.rot || 0)); return [it.x + lx * c - ly * s, it.y + lx * s + ly * c]; }
// אזור מקומי (מלבן ביחס לפריט) -> מצולע עולמי
export function localRect(it, x1, y1, x2, y2) { return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].map(([x, y]) => toWorld(it, x, y)); }
export function polyArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; a += x1 * y2 - x2 * y1; } return a / 2; }
export function centroid(p) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < p.length; i++) { const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length]; const f = x1 * y2 - x2 * y1; a += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f; }
  if (Math.abs(a) < 1e-6) return p[0];
  return [cx / (3 * a), cy / (3 * a)];
}
export function bbox(p) { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 }; }
export function pip(pt, poly) {
  const [x, y] = pt; let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) ins = !ins;
  }
  return ins;
}
function proj(poly, ax) { let mn = Infinity, mx = -Infinity; for (const [x, y] of poly) { const v = x * ax[0] + y * ax[1]; mn = Math.min(mn, v); mx = Math.max(mx, v); } return [mn, mx]; }
// חפיפה בין שני מצולעים קמורים (SAT). מחזיר עומק חפיפה מינימלי (0 = אין)
export function convexOverlap(a, b) {
  let min = Infinity;
  for (const poly of [a, b]) for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
    const l = Math.hypot(x2 - x1, y2 - y1) || 1; const ax = [-(y2 - y1) / l, (x2 - x1) / l];
    const [a0, a1] = proj(a, ax), [b0, b1] = proj(b, ax);
    const o = Math.min(a1, b1) - Math.max(a0, b0);
    if (o <= 0) return 0;
    min = Math.min(min, o);
  }
  return min;
}
export function segInter(p1, p2, p3, p4) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  return t > 0.001 && t < 0.999 && u > 0.001 && u < 0.999;
}
// האם מצולע קמור (רהיט) נמצא כולו בתוך מצולע החדר (עם סבולת)
export function insidePoly(rectPoly, room, tol = 1) {
  const c = centroid(rectPoly);
  // מכווצים מעט את המלבן כדי לאפשר נגיעה בקיר
  const sh = rectPoly.map(([x, y]) => { const dx = c[0] - x, dy = c[1] - y, l = Math.hypot(dx, dy) || 1; return [x + dx / l * tol, y + dy / l * tol]; });
  for (const p of sh) if (!pip(p, room)) return false;
  for (let i = 0; i < sh.length; i++) for (let j = 0; j < room.length; j++) if (segInter(sh[i], sh[(i + 1) % sh.length], room[j], room[(j + 1) % room.length])) return false;
  return true;
}
export function distPtSeg(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]; const l2 = dx * dx + dy * dy;
  let t = l2 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  const x = a[0] + t * dx, y = a[1] + t * dy; return { d: Math.hypot(p[0] - x, p[1] - y), t, x, y };
}
export function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  let dmax = 0, idx = 0; const a = pts[0], b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) { const d = distPtSeg(pts[i], a, b).d; if (d > dmax) { dmax = d; idx = i; } }
  if (dmax > eps) { const l = rdp(pts.slice(0, idx + 1), eps), r = rdp(pts.slice(idx), eps); return l.slice(0, -1).concat(r); }
  return [a, b];
}
export const uid = (p = 'i') => p + Math.random().toString(36).slice(2, 8);
export const r1 = (v) => Math.round(v * 10) / 10;
