import { TYPES, ZONES, WALL_IDS, CT } from './data.js';

export const T = (it) => TYPES[it.type] || TYPES.base_door;
export const dget = (it, k) => (it[k] ?? T(it)[k]);
export const iz = (it) => dget(it, 'z');
export const ih = (it) => dget(it, 'h');
export const id_ = (it) => dget(it, 'd');
export const layer = (it) => T(it).layer;
export const isBlind = (it) => T(it).layer === 'blind' || T(it).blind;
export const isBaseLevel = (it) => ['base', 'blind', 'tall'].includes(layer(it));

// מסגרת קיר: s לאורך הקיר (משמאל לימין במבט מהמטבח), t = מרחק מקו הקיר פנימה
export function frame(wall, st) {
  const { W, D, Pend, Px } = st.room;
  switch (wall) {
    case 'A': return { p: (s, t) => [s, t], n: [0, 1] };
    case 'B': return { p: (s, t) => [W - t, s], n: [-1, 0] };
    case 'C': return { p: (s, t) => [W - s, D - t], n: [0, -1] };
    case 'P': return { p: (s, t) => [Px + t, Pend - s], n: [1, 0] };
  }
}
export function inv(wall, st, x, y) {
  const { W, D, Pend, Px } = st.room;
  switch (wall) {
    case 'A': return [x, y];
    case 'B': return [y, W - x];
    case 'C': return [W - x, D - y];
    case 'P': return [Pend - y, x - Px];
  }
}
export function rectOf(it, st, t1 = null, t2 = null) {
  const off = st.walls[it.wall].off || 0;
  const a = t1 ?? off, b = t2 ?? off + id_(it);
  return rectST(it.wall, st, it.s, it.s + it.w, a, b);
}
export function rectST(wall, st, s1, s2, t1, t2) {
  const f = frame(wall, st);
  const p1 = f.p(s1, t1), p2 = f.p(s2, t2);
  return { x1: Math.min(p1[0], p2[0]), y1: Math.min(p1[1], p2[1]), x2: Math.max(p1[0], p2[0]), y2: Math.max(p1[1], p2[1]) };
}

const ov = (a1, a2, b1, b2) => Math.min(a2, b2) - Math.max(a1, b1);

// בדיקת חפיפה בין שני פריטים באותו קיר
function clash(a, b) {
  if (a.wall !== b.wall) return 0;
  const la = layer(a), lb = layer(b);
  if (la === 'window' || lb === 'window') return 0;
  if ((la === 'top') !== (lb === 'top')) return 0;
  const so = ov(a.s, a.s + a.w, b.s, b.s + b.w);
  if (so <= 0.5) return 0;
  const zo = ov(iz(a), iz(a) + ih(a), iz(b), iz(b) + ih(b));
  return zo > 0.5 ? so : 0;
}

export function validate(st) {
  const out = [];
  const items = st.items;
  const add = (sev, msg, ids = []) => out.push({ sev, msg, ids });
  // חפיפות וחריגות
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    const L = st.walls[a.wall].len;
    if (a.s < -0.5 || a.s + a.w > L + 0.5) add('err', `${lbl(a)} חורג מאורך ${st.walls[a.wall].name} (${L} ס״מ) ב-${Math.round(a.s < 0 ? -a.s : a.s + a.w - L)} ס״מ`, [a.id]);
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      const c = clash(a, b);
      if (c) add('err', `חפיפה של ${Math.round(c)} ס״מ בין ${lbl(a)} ל-${lbl(b)}`, [a.id, b.id]);
    }
  }
  // חפיפה בפינות בין קירות (רק ארונות אמיתיים, לא פינות עיוורות)
  const solid = items.filter(i => isBaseLevel(i) && !isBlind(i));
  for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
    const a = solid[i], b = solid[j];
    if (a.wall === b.wall) continue;
    const ra = rectOf(a, st), rb = rectOf(b, st);
    if (ov(ra.x1, ra.x2, rb.x1, rb.x2) > 1 && ov(ra.y1, ra.y2, rb.y1, rb.y2) > 1) add('err', `התנגשות בפינה: ${lbl(a)} נכנס ל-${lbl(b)}`, [a.id, b.id]);
  }
  // מעברים
  const seen = new Set();
  for (const a of solid) for (const b of solid) {
    if (a.wall === b.wall || a.id >= b.id) continue;
    const ra = rectOf(a, st), rb = rectOf(b, st);
    let gap = null;
    if (ov(ra.x1, ra.x2, rb.x1, rb.x2) > 10) gap = Math.max(rb.y1 - ra.y2, ra.y1 - rb.y2);
    else if (ov(ra.y1, ra.y2, rb.y1, rb.y2) > 10) gap = Math.max(rb.x1 - ra.x2, ra.x1 - rb.x2);
    if (gap !== null && gap > 2 && gap < 100) {
      const k = [a.wall, b.wall].sort().join('');
      const key = k + Math.round(gap);
      if (seen.has(key)) continue; seen.add(key);
      add(gap < 90 ? 'err' : 'warn', `מעבר צר: ${Math.round(gap)} ס״מ בין ${lbl(a)} ל-${lbl(b)} (מומלץ 100 לפחות, 110–120 לשני מבשלים)`, [a.id, b.id]);
    }
  }
  // משטח: פריטי משטח חייבים לשבת על ארון תחתון
  const tops = items.filter(i => layer(i) === 'top');
  for (const t of tops) {
    const under = items.filter(b => b.wall === t.wall && ['base', 'blind'].includes(layer(b)) && ov(b.s, b.s + b.w, t.s, t.s + t.w) > 0);
    const cover = under.reduce((s, b) => s + ov(b.s, b.s + b.w, t.s, t.s + t.w), 0);
    if (cover < t.w - 1) add('err', `${lbl(t)} לא יושב כולו על ארון תחתון`, [t.id]);
    const tall = items.find(b => b.wall === t.wall && layer(b) === 'tall' && ov(b.s, b.s + b.w, t.s, t.s + t.w) > 0);
    if (tall) add('err', `${lbl(t)} נמצא מול ${lbl(tall)} (ארון גבוה)`, [t.id, tall.id]);
    if (t.type === 'cooktop') {
      const dw = under.find(b => b.type === 'dw');
      if (dw) add('err', `הכיריים מעל ${lbl(dw)} – אי אפשר להתקין כיריים מעל מדיח`, [t.id, dw.id]);
      const win = items.find(b => b.wall === t.wall && b.type === 'window' && ov(b.s, b.s + b.w, t.s, t.s + t.w) > 0);
      if (win) add('warn', `כיריים מתחת לחלון – לא מומלץ (וילון, רוח, ניקיון)`, [t.id, win.id]);
      const hood = items.find(b => b.wall === t.wall && b.type === 'upper_hood' && ov(b.s, b.s + b.w, t.s, t.s + t.w) >= Math.min(t.w, b.w) - 2);
      if (!hood && t.wall !== 'P') add('warn', `אין מנדף מעל ${lbl(t)}`, [t.id]);
      const ups = items.filter(b => b.wall === t.wall && layer(b) === 'upper' && b.type !== 'upper_hood' && ov(b.s, b.s + b.w, t.s, t.s + t.w) > 0 && iz(b) - CT < 65);
      for (const u of ups) add('warn', `${lbl(u)} נמוך מדי מעל הכיריים (פחות מ-65 ס״מ)`, [u.id, t.id]);
      const sink = tops.find(s => s.type === 'sink' && s.wall === t.wall && Math.min(Math.abs(s.s - (t.s + t.w)), Math.abs(t.s - (s.s + s.w))) < 30);
      if (sink) add('warn', 'הכיור צמוד מדי לכיריים – כדאי לפחות 30–40 ס״מ משטח ביניהם', [t.id, sink.id]);
      const tallNear = items.find(b => b.wall === t.wall && layer(b) === 'tall' && (Math.abs(b.s + b.w - t.s) < 20 || Math.abs(t.s + t.w - b.s) < 20));
      if (tallNear) add('warn', `${lbl(tallNear)} צמוד לכיריים – כדאי 20–30 ס״מ משטח בצד`, [t.id, tallNear.id]);
    }
    if (t.type === 'sink') {
      const cab = under.find(b => b.type === 'base_sink');
      if (!cab) add('warn', `${lbl(t)} לא נמצא מעל ארון כיור`, [t.id]);
    }
  }
  // מדיח ליד הכיור
  for (const dw of items.filter(i => i.type === 'dw')) {
    const sinks = tops.filter(s => s.type === 'sink' && s.wall === dw.wall);
    const d = sinks.length ? Math.min(...sinks.map(s => Math.max(0, Math.max(s.s - (dw.s + dw.w), dw.s - (s.s + s.w))))) : Infinity;
    if (d > 60) add('warn', `${lbl(dw)} רחוק מהכיור (${d === Infinity ? 'לא באותו קיר' : Math.round(d) + ' ס״מ'}) – עדיף צמוד לארון הכיור`, [dw.id]);
    const corner = items.find(b => b.wall === dw.wall && ['base_corner', 'base_blind'].includes(b.type) && (Math.abs(b.s - (dw.s + dw.w)) < 1 || Math.abs(b.s + b.w - dw.s) < 1) && b.w < 10);
    if (corner) add('info', `שים לב לפתיחת דלת המדיח ליד הפינה`, [dw.id]);
  }
  // עליונים מול חלון
  for (const win of items.filter(i => i.type === 'window')) {
    for (const u of items.filter(b => b.wall === win.wall && ['upper', 'tall'].includes(layer(b)))) {
      if (ov(u.s, u.s + u.w, win.s, win.s + win.w) > 0.5 && ov(iz(u), iz(u) + ih(u), iz(win), iz(win) + ih(win)) > 0.5) add('err', `${lbl(u)} מסתיר את החלון`, [u.id, win.id]);
    }
  }
  // כשרות
  const zs = new Set(items.map(i => i.zone));
  const sinks = tops.filter(s => s.type === 'sink');
  if (zs.has('meat') && zs.has('dairy')) {
    const dbl = sinks.some(s => (s.variant || 'single') === 'double') || (sinks.length >= 2);
    if (!dbl) add('warn', 'יש אזור בשרי וחלבי אבל רק קערת כיור אחת', sinks.map(s => s.id));
    const ovens = items.filter(i => i.type === 'base_oven').length + items.filter(i => i.type === 'tall_oven').reduce((s, i) => s + (i.stack?.ovens ?? 2), 0);
    if (ovens < 2) add('info', `יש ${ovens} תנור/ים – ביקשת שניים (בשרי וחלבי)`);
    if (!items.some(i => i.type === 'dw')) add('warn', 'אין מדיח כלים בתוכנית');
  }
  if (!items.some(i => i.type === 'plata')) add('info', 'אין מקום מסומן לפלטה של שבת');
  if (!items.some(i => i.type === 'water')) add('info', 'אין ברז בר מים');
  return out;
}

export function remaining(st) {
  const res = {};
  for (const w of WALL_IDS) {
    const L = st.walls[w].len;
    const lowItems = st.items.filter(i => i.wall === w && isBaseLevel(i));
    const upItems = st.items.filter(i => i.wall === w && ['upper', 'tall', 'window'].includes(layer(i)));
    res[w] = { len: L, low: L - union(lowItems), up: w === 'P' ? null : L - union(upItems) };
  }
  return res;
}
function union(arr) {
  const iv = arr.map(i => [Math.max(0, i.s), Math.min(i.s + i.w, 1e9)]).sort((a, b) => a[0] - b[0]);
  let tot = 0, cs = -1, ce = -1;
  for (const [s, e] of iv) { if (s > ce) { if (ce > cs) tot += ce - cs; cs = s; ce = e; } else ce = Math.max(ce, e); }
  if (ce > cs) tot += ce - cs;
  return tot;
}

export function lbl(it) { return it.label && it.label !== it.id ? `${it.id} (${it.label})` : it.id; }

export function frontsDesc(it) {
  const w = it.w;
  switch (it.type) {
    case 'base_door': return w > 60 ? '2 דלתות' : 'דלת';
    case 'base_dr2': return '2 מגירות';
    case 'base_dr3': return '3 מגירות';
    case 'base_dr4': return '4 מגירות';
    case 'base_sink': return w > 60 ? '2 דלתות, פחים' : 'דלת, פח';
    case 'base_corner': return 'דלת + מנגנון פינה';
    case 'base_pullout': return 'שולפן';
    case 'base_blind': return 'עיוור';
    case 'dw': return 'חזית אינטגרלית';
    case 'base_oven': return 'תנור + מגירה';
    case 'upper_door': return (w > 60 ? '2 דלתות' : 'דלת') + (ih(it) > 90 ? ' + שורה עליונה' : '');
    case 'upper_lift': return 'קלפה' + (ih(it) > 90 ? ' + שורה עליונה' : '');
    case 'upper_open': return 'מדפים פתוחים';
    case 'upper_blind': return 'עיוור';
    case 'upper_hood': return 'מנדף אינטגרלי + דלת';
    case 'upper_over': return w > 60 ? '2 דלתות' : 'דלת';
    case 'tall_oven': { const s = it.stack || {}; return `${s.ovens ?? 2} תנורים${s.mw !== false ? ' + מיקרוגל' : ''} + אחסון`; }
    case 'tall_pantry': return '2 דלתות + מגירות פנימיות';
    case 'tall_storage': return w > 60 ? '2 דלתות' : 'דלת';
    case 'fridge': return 'מקרר';
    case 'panel': return 'פנל';
    case 'sink': return (it.variant || 'single') === 'double' ? 'כפול' : 'קערה אחת';
    default: return '';
  }
}

export function bom(st) {
  const cab = [], appl = [];
  const order = { A: 0, B: 1, C: 2, P: 3 };
  const sorted = [...st.items].sort((a, b) => order[a.wall] - order[b.wall] || (layer(a) === 'upper') - (layer(b) === 'upper') || a.s - b.s);
  for (const it of sorted) {
    const t = T(it);
    const row = { id: it.id, wall: it.wall, type: t.name, dims: `${r(it.w)}×${r(ih(it))}×${r(id_(it))}`, fronts: frontsDesc(it), zone: ZONES[it.zone || 'shared']?.name || '', note: it.note || '', label: it.label || '' };
    if (['top', 'window'].includes(t.layer) || it.type === 'fridge') appl.push(row); else cab.push(row);
    if (it.type === 'tall_oven') {
      const s = it.stack || {};
      for (let k = 0; k < (s.ovens ?? 2); k++) appl.push({ id: it.id + '-O' + (k + 1), wall: it.wall, type: 'תנור בנוי', dims: '60×60×55', fronts: '', zone: ZONES[(s.zones || [])[k] || 'shared'].name, note: 'בעמודה ' + it.id, label: '' });
      if (s.mw !== false) appl.push({ id: it.id + '-MW', wall: it.wall, type: 'מיקרוגל בנוי', dims: '60×45×40', fronts: '', zone: 'משותף', note: 'בעמודה ' + it.id, label: '' });
    }
    if (it.type === 'dw' || it.type === 'base_oven' || it.type === 'upper_hood') appl.push({ ...row, type: { dw: 'מדיח אינטגרלי', base_oven: 'תנור בנוי', upper_hood: 'מנדף אינטגרלי' }[it.type], fronts: '' });
  }
  const sum = (f) => st.items.filter(f).reduce((s, i) => s + i.w, 0);
  const counters = counterRuns(st);
  const ctLen = counters.reduce((s, c) => s + (c.s2 - c.s1), 0);
  const ctArea = counters.reduce((s, c) => s + (c.s2 - c.s1) * c.depth, 0) / 10000;
  const frontArea = st.items.filter(i => !isBlind(i) && ['base', 'upper', 'tall'].includes(layer(i)) && !['fridge', 'panel'].includes(i.type)).reduce((s, i) => s + i.w * (layer(i) === 'base' ? 77 : ih(i)), 0) / 10000;
  return {
    cab, appl, summary: {
      base: sum(i => layer(i) === 'base' && i.type !== 'dw'), upper: sum(i => layer(i) === 'upper' && !isBlind(i)),
      tall: st.items.filter(i => ['tall_oven', 'tall_pantry', 'tall_storage'].includes(i.type)).length,
      ctLen, ctArea, frontArea,
    }
  };
}
const r = (v) => Math.round(v * 10) / 10;

// ריצות משטח: איחוד ארונות תחתונים רציפים לכל קיר
export function counterRuns(st) {
  const runs = [];
  for (const w of WALL_IDS) {
    const arr = st.items.filter(i => i.wall === w && ['base', 'blind'].includes(layer(i))).sort((a, b) => a.s - b.s);
    let cur = null;
    for (const it of arr) {
      const d = id_(it) + (st.walls[w].off || 0) + 2;
      if (cur && it.s <= cur.s2 + 0.5) { cur.s2 = Math.max(cur.s2, it.s + it.w); cur.depth = Math.max(cur.depth, d); }
      else { cur = { wall: w, s1: it.s, s2: it.s + it.w, depth: d }; runs.push(cur); }
    }
  }
  const P = runs.filter(r => r.wall === 'P');
  for (const r of P) { r.back = st.walls.P.overhang || 0; }
  return runs;
}

// נקודות חשמל ומים
export function points(st) {
  const pts = [];
  const W = st.walls;
  const add = (kind, what, wall, s, z, note = '') => pts.push({ kind, what, wall, s: Math.round(s), z, note });
  for (const it of st.items) {
    const c = it.s + it.w / 2;
    switch (it.type) {
      case 'tall_oven': {
        const s = it.stack || {}; const n = s.ovens ?? 2;
        for (let k = 0; k < n; k++) add('dedicated', `תנור ${ZONES[(s.zones || [])[k] || 'shared'].name} (${it.id})`, it.wall, c, k ? 100 : 40, 'מעגל נפרד 16A, שקע בארון הסמוך');
        if (s.mw !== false) add('dedicated', `מיקרוגל (${it.id})`, it.wall, c, 190, 'בתוך ארון האחסון שמעל');
        break;
      }
      case 'base_oven': add('dedicated', `תנור מתחת למשטח (${it.id})`, it.wall, c, 40, 'מעגל נפרד 16A'); break;
      case 'cooktop': add('dedicated', `כיריים אינדוקציה ${it.w} (${it.id})`, it.wall, c, 60, 'תלת-פאזי 3×16A או חד-פאזי 32A, לפי הדגם'); break;
      case 'upper_hood': add('power', `מנדף (${it.id})`, it.wall, c, 235, 'בתוך הארון שמעל'); break;
      case 'dw': {
        const sink = st.items.find(s => s.type === 'base_sink' && s.wall === it.wall && Math.abs((s.s + s.w / 2) - c) < 120);
        add('dedicated', `מדיח (${it.id})`, it.wall, sink ? sink.s + sink.w * 0.8 : c, 40, sink ? `בתוך ארון הכיור ${sink.id}` : 'בארון הסמוך');
        break;
      }
      case 'sink': add('water', `מים חמים וקרים לכיור (${it.id})`, it.wall, c, 50); add('drain', `ניקוז כיור${st.items.some(d => d.type === 'dw' && d.wall === it.wall) ? ' ומדיח' : ''}`, it.wall, c + 12, 40); break;
      case 'fridge': {
        add('power', `שקע למקרר (${it.id})`, it.wall, c, 205, 'בארון שמעל המקרר');
        const wb = st.items.find(w => w.type === 'water' && w.wall === it.wall && Math.abs(w.s - c) < 200);
        if (wb) add('water', 'ברז ניל למקרר (מתקן קרח)', it.wall, wb.s, 45, 'מאותו קו של בר המים');
        break;
      }
      case 'water': add('water', `מים קרים לבר המים (${it.id})`, it.wall, c, 45); add('power', 'שקע למערכת בר המים', it.wall, c + 10, 55, 'רק אם המערכת חשמלית'); break;
      case 'plata': add('timer', `שקע לפלטה על שעון שבת (${it.id})`, it.wall, c, 110, 'מעגל נפרד 16A לפינת השבת'); break;
      case 'urn': add('dedicated', `שקע למיחם (${it.id})`, it.wall, c, 110, 'על מעגל השבת, בלי שעון'); break;
    }
  }
  // שקעים כפולים במשטח הפנוי
  for (const run of counterRuns(st)) {
    if (run.wall === 'P') continue;
    const blockers = st.items.filter(i => i.wall === run.wall && (['top'].includes(layer(i)) || layer(i) === 'tall' || i.type === 'window'));
    let free = [[run.s1, run.s2]];
    for (const b of blockers) {
      const pad = b.type === 'sink' ? 15 : b.type === 'cooktop' ? 10 : 0;
      const b1 = b.s - pad, b2 = b.s + b.w + pad;
      free = free.flatMap(([a, e]) => (b2 <= a || b1 >= e) ? [[a, e]] : [[a, b1], [b2, e]].filter(([x, y]) => y - x > 0));
    }
    for (const [a, e] of free) {
      if (e - a < 40) continue;
      const n = Math.max(1, Math.round((e - a) / 120));
      for (let k = 0; k < n; k++) add('power', 'שקע כפול למשטח', run.wall, a + (e - a) * (k + 0.5) / n, 110);
    }
  }
  for (const w of ['A', 'B', 'C']) if (st.items.some(i => i.wall === w && i.type.startsWith('upper') && !isBlind(i))) add('light', 'פס לד מתחת לעליונים', w, null, 148, 'ספק כוח מעל הארונות');
  if (st.walls.P.len) add('light', `${Math.max(1, Math.round(st.walls.P.len / 70))} נקודות תלייה מעל חצי האי`, 'P', null, 'תקרה', 'כ-75 ס״מ מעל המשטח');
  const order = { A: 0, B: 1, C: 2, P: 3 };
  pts.sort((a, b) => order[a.wall] - order[b.wall] || (a.s ?? 999) - (b.s ?? 999));
  const counters = { power: 'E', dedicated: 'E', timer: 'E', water: 'W', drain: 'D', light: 'L' };
  const cnt = {};
  for (const p of pts) { const k = counters[p.kind]; cnt[k] = (cnt[k] || 0) + 1; p.id = k + cnt[k]; }
  return pts;
}
export const PT_KIND = { power: 'חשמל', dedicated: 'חשמל – מעגל נפרד', timer: 'חשמל – שעון שבת', water: 'מים', drain: 'ניקוז', light: 'תאורה' };
export const PT_COLOR = { power: '#e8a317', dedicated: '#d9534f', timer: '#8b5cf6', water: '#2b7de9', drain: '#5b6b7a', light: '#f4c430' };
