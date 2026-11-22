// תכנון אדריכלי: העלאת תוכנית, כיול, זיהוי חדרים, עריכה, מחולל העמדות, תלת-ממד
import { FURN, FURN_CATS, ROOM_TYPES, ROOM_ORDER } from './data.js';
import { corners, polyArea, centroid, bbox, pip, distPtSeg, uid, rad, toWorld } from './geom.js';
import { floorSVG, furnSymbol, miniSVG, printSVG, labelPt } from './plan.js';
import { generate, checkFurniture } from './generate.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const LS = 'arch-project-v1', LSB = 'arch-bg-v1';
const newFloor = (name) => ({ id: uid('f'), name, bg: null, walls: [], rooms: [], doors: [], windows: [], furn: [] });

let project = { v: 1, name: 'פרויקט חדש', floors: [newFloor('קומה א׳')], cur: 0 };
let bgStore = {};
const session = { pdf: {} };
let sel = { kind: null, id: null, vi: null };
let tool = 'select', viewMode = 'plan';
let view = { cx: 500, cy: 400, s: 1.5 };
let undoS = [], redoS = [];
let genCache = null; // {roomId, options}
let warnings = [];
let v3 = null, v3pending = false;
const svg = $('#plan'), dyn = $('#dyn'), ui = $('#ui'), bgImg = $('#bgImg');

const F = () => project.floors[project.cur];
const bgSrc = (key) => bgStore[key] || key;
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms); }

// ---------- שמירה / ביטול ----------
const snap = () => JSON.stringify(project);
function commit() { undoS.push(snap()); if (undoS.length > 120) undoS.shift(); redoS = []; }
function undo() { if (!undoS.length) return; redoS.push(snap()); project = JSON.parse(undoS.pop()); fixSel(); render(); save(); }
function redo() { if (!redoS.length) return; undoS.push(snap()); project = JSON.parse(redoS.pop()); fixSel(); render(); save(); }
function mutate(fn) { commit(); fn(); render(); save(); }
function fixSel() { const f = F(); if (!f) return; const L = { room: f.rooms, furn: f.furn, wall: f.walls, door: f.doors, window: f.windows }[sel.kind]; if (!L || !L.find(x => x.id === sel.id)) sel = { kind: null, id: null }; }
let saveT = 0;
function save() { clearTimeout(saveT); saveT = setTimeout(() => {
  try { localStorage.setItem(LS, snap()); } catch (e) { console.warn(e); }
  try { const used = {}; for (const f of project.floors) if (f.bg && bgStore[f.bg.key]) used[f.bg.key] = bgStore[f.bg.key]; localStorage.setItem(LSB, JSON.stringify(used)); } catch (e) { toast('התוכנית נשמרה, אבל תמונת הרקע גדולה מדי לשמירה בדפדפן – השתמש בייצוא'); }
}, 300); }
function load() {
  try { const p = JSON.parse(localStorage.getItem(LS)); if (p?.floors?.length) project = p; bgStore = JSON.parse(localStorage.getItem(LSB) || '{}'); return !!p; } catch (e) { return false; }
}

// ---------- תצוגה ----------
function vb() { const r = svg.getBoundingClientRect(); const w = Math.max(50, r.width), h = Math.max(50, r.height); return { x: view.cx - w * view.s / 2, y: view.cy - h * view.s / 2, w: w * view.s, h: h * view.s, pw: w, ph: h }; }
function applyView() { const v = vb(); svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`); }
function toWorldPt(e) { const r = svg.getBoundingClientRect(); const v = vb(); return [v.x + (e.clientX - r.left) * view.s, v.y + (e.clientY - r.top) * view.s]; }
function contentBox(f = F()) {
  const pts = f.rooms.flatMap(r => r.poly).concat(f.walls.flatMap(w => [[w.x1, w.y1], [w.x2, w.y2]]), f.furn.map(i => [i.x, i.y]));
  if (f.bg && !pts.length) pts.push([f.bg.x, f.bg.y], [f.bg.x + f.bg.w, f.bg.y + f.bg.h]);
  return pts.length ? bbox(pts) : { x0: 0, y0: 0, x1: 800, y1: 600, w: 800, h: 600 };
}
function fit() { const b = contentBox(); const r = svg.getBoundingClientRect(); view.cx = (b.x0 + b.x1) / 2; view.cy = (b.y0 + b.y1) / 2; view.s = Math.max((b.w + 120) / Math.max(100, r.width), (b.h + 120) / Math.max(100, r.height)); render(); }
function zoomAt(k, sx, sy) { const r = svg.getBoundingClientRect(); const v = vb(); const wx = v.x + (sx - r.left) * view.s, wy = v.y + (sy - r.top) * view.s; view.s = Math.min(20, Math.max(0.15, view.s * k)); view.cx = wx - ((sx - r.left) - r.width / 2) * view.s; view.cy = wy - ((sy - r.top) - r.height / 2) * view.s; renderPlan(); }

// ---------- ציור ----------
let draft = null; // {kind, pts}
function renderPlan() {
  applyView(); const f = F(); const px = view.s;
  if (f.bg && f.bg.show !== false) { bgImg.setAttribute('href', bgSrc(f.bg.key)); bgImg.setAttribute('x', f.bg.x); bgImg.setAttribute('y', f.bg.y); bgImg.setAttribute('width', f.bg.w); bgImg.setAttribute('height', f.bg.h); bgImg.setAttribute('opacity', f.bg.opacity ?? 0.6); bgImg.style.display = ''; }
  else bgImg.style.display = 'none';
  const bad = new Set(warnings.filter(w => w.sev === 'err' || w.sev === 'warn').flatMap(w => w.ids));
  dyn.innerHTML = floorSVG(f, { px, sel, bad, bgOn: !!(f.bg && f.bg.show !== false) });
  ui.innerHTML = handlesSVG(px) + draftSVG(px);
  $('#status').textContent = `${Math.round(100 / px)}% · ${tool === 'select' ? 'גרור רקע להזזה, גלגלת/צביטה לזום' : ''}`;
}
function handlesSVG(px) {
  const f = F(); const r = 6 * px; let s = '';
  const H = (x, y, h, i = '', shape = 'c') => shape === 'c' ? `<circle cx="${x}" cy="${y}" r="${r}" data-h="${h}" data-i="${i}" fill="#fff" stroke="#1565c0" stroke-width="2" vector-effect="non-scaling-stroke"/>` : `<rect x="${x - r}" y="${y - r}" width="${2 * r}" height="${2 * r}" data-h="${h}" data-i="${i}" fill="#1565c0" stroke="#fff" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`;
  if (sel.kind === 'room') { const rm = f.rooms.find(x => x.id === sel.id); if (rm) { rm.poly.forEach((p, i) => { const q = rm.poly[(i + 1) % rm.poly.length]; s += `<circle cx="${(p[0] + q[0]) / 2}" cy="${(p[1] + q[1]) / 2}" r="${r * .7}" data-h="m" data-i="${i}" fill="#1565c0" fill-opacity=".45" stroke="none"/>`; }); rm.poly.forEach((p, i) => s += H(p[0], p[1], 'v', i, sel.vi === i ? 's' : 'c')); } }
  if (sel.kind === 'furn') { const it = f.furn.find(x => x.id === sel.id); if (it) { const [rx, ry] = toWorld(it, 0, -it.d / 2 - 26 * px); const [bx, by] = toWorld(it, 0, -it.d / 2); s += `<line x1="${bx}" y1="${by}" x2="${rx}" y2="${ry}" stroke="#1565c0" stroke-width="1.5" vector-effect="non-scaling-stroke"/>` + H(rx, ry, 'rot'); const [wx, wy] = toWorld(it, it.w / 2, 0); s += H(wx, wy, 'rw', '', 's'); const [dx, dy] = toWorld(it, 0, it.d / 2); s += H(dx, dy, 'rd', '', 's'); } }
  if (sel.kind === 'wall') { const w = f.walls.find(x => x.id === sel.id); if (w) s += H(w.x1, w.y1, 'e', 1) + H(w.x2, w.y2, 'e', 2); }
  if (sel.kind === 'window') { const w = f.windows.find(x => x.id === sel.id); if (w) s += H(w.x1, w.y1, 'e', 1) + H(w.x2, w.y2, 'e', 2); }
  return s;
}
function draftSVG(px) {
  if (!draft) return ''; const st = `stroke="#1565c0" stroke-width="2" vector-effect="non-scaling-stroke"`;
  const P = (pts) => pts.map(p => p.join(',')).join(' ');
  if (draft.kind === 'rect') { const [a, b] = draft.pts; return `<rect x="${Math.min(a[0], b[0])}" y="${Math.min(a[1], b[1])}" width="${Math.abs(b[0] - a[0])}" height="${Math.abs(b[1] - a[1])}" fill="rgba(21,101,192,.12)" ${st}/>${dimTxt(a, b, px)}`; }
  if (draft.kind === 'poly') return `<polyline points="${P(draft.pts.concat(draft.hover ? [draft.hover] : []))}" fill="rgba(21,101,192,.08)" ${st}/>` + draft.pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${(i ? 3 : 6) * px}" fill="${i ? '#1565c0' : '#fff'}" ${st}/>`).join('') + (draft.hover ? segTxt(draft.pts[draft.pts.length - 1], draft.hover, px) : '');
  if (['wall', 'window', 'split', 'calib'].includes(draft.kind)) { const [a, b] = draft.pts; return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" ${st} stroke-dasharray="${draft.kind === 'split' ? '8 5' : ''}"/>` + `<circle cx="${a[0]}" cy="${a[1]}" r="${4 * px}" fill="#1565c0"/>` + segTxt(a, b, px); }
  return '';
}
const lbl = (x, y, t, px) => `<text x="${x}" y="${y}" font-size="${13 * px}" text-anchor="middle" fill="#1565c0" stroke="#fff" stroke-width="${3 * px}" paint-order="stroke" font-family="Arial">${t}</text>`;
const segTxt = (a, b, px) => b ? lbl((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 8 * px, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1])) + ' ס״מ', px) : '';
const dimTxt = (a, b, px) => lbl((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, `${Math.round(Math.abs(b[0] - a[0]))}×${Math.round(Math.abs(b[1] - a[1]))}`, px);

function render() {
  const f = F(); if (!f) return;
  warnings = checkFurniture(f);
  renderPlan(); renderTabs(); renderInsp(); renderWarn(); renderBgCtl();
  $('#projName').textContent = project.name;
  $('#bUndo').disabled = !undoS.length; $('#bRedo').disabled = !redoS.length;
  schedule3D();
}
function schedule3D() { if (!v3 || viewMode === 'plan') return; if (v3pending) return; v3pending = true; requestAnimationFrame(() => { v3pending = false; v3.update(F(), sel.kind === 'furn' ? sel.id : null); }); }

function renderTabs() {
  const el = $('#floorTabs');
  el.innerHTML = project.floors.map((f, i) => `<button data-i="${i}" class="${i === project.cur ? 'on' : ''}">${esc(f.name)}</button>`).join('') + `<button data-add="1" title="הוסף קומה">+ קומה</button>`;
}
function renderBgCtl() {
  const f = F(); const el = $('#bgCtl');
  if (!f.bg) { el.innerHTML = `<div class="kv">אין תוכנית רקע. העלה PDF או תמונה, או פתח את התוכנית שלך.</div>`; return; }
  const cmpx = f.bg.wPx ? (f.bg.w / f.bg.wPx) : 0; const N = f.bg.kind === 'pdf' && f.bg.renderScale ? Math.round(cmpx * f.bg.renderScale * 72 / 2.54) : null;
  el.innerHTML = `<div class="row"><label>שקיפות</label><input type="range" id="bgOp" min="0.1" max="1" step="0.05" value="${f.bg.opacity ?? .6}"></div>
  <div class="row"><label>הצג</label><input type="checkbox" id="bgShow" ${f.bg.show !== false ? 'checked' : ''} style="flex:none"></div>
  ${N ? `<div class="row"><label>קנה מידה 1:</label><input type="number" id="bgN" value="${N}" min="1" max="1000"><button id="bgNset">החל</button></div>` : ''}
  <div class="kv">רוחב התוכנית: ${(f.bg.w / 100).toFixed(1)} מ׳. לדיוק – כלי ״כיול״ על מידה ידועה.</div>
  <div class="btns"><button id="bDetect" class="pri">זיהוי אוטומטי של חדרים</button><button id="bDelUnc">מחק חדרים לא מאושרים</button></div>`;
}

// ---------- מאפיינים ----------
function renderInsp() {
  const f = F(); const el = $('#insp');
  if (sel.kind === 'room') {
    const r = f.rooms.find(x => x.id === sel.id); const a = Math.abs(polyArea(r.poly)) / 1e4, b = bbox(r.poly);
    const gc = genCache && genCache.roomId === r.id ? genCache : null;
    el.innerHTML = `<h3>חדר</h3>
    <div class="row"><label>שם</label><input id="rName" value="${esc(r.name)}"></div>
    <div class="row"><label>סוג</label><select id="rType">${ROOM_ORDER.map(k => `<option value="${k}" ${k === r.type ? 'selected' : ''}>${ROOM_TYPES[k].name}</option>`).join('')}</select></div>
    <div class="kv">${a.toFixed(1)} מ״ר · ${Math.round(b.w)}×${Math.round(b.h)} ס״מ · ${r.poly.length} נקודות</div>
    ${r.confirmed ? '<div class="kv" style="color:#2e7d32">✓ מאושר</div>' : `<div class="btns"><button id="rConfirm" class="pri">אשר סוג ושם</button><span class="kv" style="color:var(--warn)">הסוג נוחש אוטומטית – בדוק</span></div>`}
    <div class="btns"><button id="rGen" class="pri">הצע העמדות</button><button id="rClear">נקה רהיטים</button>${r.type === 'kitchen' ? '<a class="btn link" href="index.html">עורך המטבח המפורט</a>' : ''}</div>
    ${gc ? (gc.options.length ? `<div class="opts">${gc.options.map((o, i) => `<div class="opt" data-o="${i}">${miniSVG(r, o.items, f, 140)}<div>${i + 1}. ${esc(o.title)}</div>${o.notes.length ? `<div class="n">${esc(o.notes[0])}</div>` : ''}</div>`).join('')}</div><div class="kv">לחץ על חלופה כדי להחיל אותה (אפשר לבטל ב-↶)</div>` : `<div class="kv" style="color:var(--warn)">${esc(gc.msg)}</div>`) : ''}
    <div class="btns">${sel.vi != null ? '<button id="rDelV">מחק נקודה</button>' : ''}<button id="rDup">שכפל</button><button id="rDel" class="danger">מחק חדר</button></div>
    <div class="kv">גרור נקודות כחולות לשינוי צורה; נקודה קטנה באמצע צלע מוסיפה פינה.</div>`;
  } else if (sel.kind === 'furn') {
    const it = f.furn.find(x => x.id === sel.id); const fd = FURN[it.type];
    el.innerHTML = `<h3>${esc(fd?.name || it.type)}</h3>
    <div class="row"><label>רוחב</label><input type="number" id="fW" value="${Math.round(it.w)}"><label>עומק</label><input type="number" id="fD" value="${Math.round(it.d)}"></div>
    <div class="row"><label>סיבוב°</label><input type="number" id="fR" value="${Math.round(it.rot || 0)}"><input type="color" id="fC" value="${it.color || fd?.color || '#cccccc'}" style="flex:none;width:40px;padding:1px"></div>
    <div class="btns"><button id="fRL">⟲ 90°</button><button id="fRR">⟳ 90°</button><button id="fSnap">צמד לקיר</button><button id="fDup">שכפל</button><button id="fDel" class="danger">מחק</button></div>
    <div class="kv">גרור להזזה (נצמד לקירות), עיגול = סיבוב חופשי (קפיצות 5°), ריבועים = שינוי מידה. מקשים: R סיבוב, Delete מחיקה, Ctrl+D שכפול.</div>`;
  } else if (sel.kind === 'door') {
    const d = f.doors.find(x => x.id === sel.id);
    el.innerHTML = `<h3>דלת</h3><div class="row"><label>רוחב</label><select id="dW">${[60, 70, 80, 90, 100, 120].map(w => `<option ${Math.round(d.w) === w ? 'selected' : ''}>${w}</option>`).join('')}${[60, 70, 80, 90, 100, 120].includes(Math.round(d.w)) ? '' : `<option selected>${Math.round(d.w)}</option>`}</select></div>
    <div class="btns"><button id="dFlip">הפוך כיוון פתיחה</button><button id="dHinge">הפוך צד ציר</button><button id="dDel" class="danger">מחק</button></div><div class="kv">גרור להזזה. אזור הפתיחה נשמר פנוי ברהיטים.</div>`;
  } else if (sel.kind === 'window') {
    const w = f.windows.find(x => x.id === sel.id);
    el.innerHTML = `<h3>חלון</h3><div class="kv">אורך ${Math.round(Math.hypot(w.x2 - w.x1, w.y2 - w.y1))} ס״מ</div><div class="btns"><button id="wDel" class="danger">מחק</button></div>`;
  } else if (sel.kind === 'wall') {
    const w = f.walls.find(x => x.id === sel.id);
    el.innerHTML = `<h3>קיר</h3><div class="row"><label>עובי</label><input type="number" id="wT" value="${Math.round(w.t)}"></div><div class="kv">אורך ${Math.round(Math.hypot(w.x2 - w.x1, w.y2 - w.y1))} ס״מ</div><div class="btns"><button id="wlDel" class="danger">מחק</button></div>`;
  } else {
    const unc = f.rooms.filter(r => !r.confirmed).length;
    el.innerHTML = `<h3>קומה</h3><div class="row"><label>שם</label><input id="flName" value="${esc(f.name)}"></div>
    <div class="row"><label>פרויקט</label><input id="prName" value="${esc(project.name)}"></div>
    <div class="kv">${f.rooms.length} חדרים${unc ? ` (${unc} לא מאושרים)` : ''} · ${f.doors.length} דלתות · ${f.windows.length} חלונות · ${f.furn.length} רהיטים</div>
    <div class="btns"><button id="genAll" class="pri">העמד בכל החדרים</button><button id="flDel" class="danger">מחק קומה</button></div>
    <h3 style="margin-top:12px">חדרים</h3><div class="rlist">${f.rooms.map(r => `<div data-r="${r.id}" class="${r.confirmed ? '' : 'unc'}"><span>${esc(r.name || ROOM_TYPES[r.type]?.name)}</span><span>${(Math.abs(polyArea(r.poly)) / 1e4).toFixed(1)} מ״ר${r.confirmed ? '' : ' ?'}</span></div>`).join('') || '<span class="kv">אין עדיין חדרים</span>'}</div>
    <div class="kv" style="margin-top:8px">בחר חדר כדי לקבל הצעות העמדה. רהיט מהקטלוג נוסף לחדר הנבחר.</div>`;
  }
}
function renderWarn() {
  const f = F(); const unc = f.rooms.filter(r => !r.confirmed);
  const list = [...warnings]; if (unc.length) list.unshift({ sev: 'warn', msg: `${unc.length} חדרים עם סוג שלא אושר`, ids: [unc[0].id], room: true });
  $('#warnCount').textContent = list.length || '✓'; $('#warnCount').className = 'badge' + (list.some(w => w.sev === 'err') ? ' bad' : '');
  $('#warns').innerHTML = list.length ? list.slice(0, 60).map((w, i) => `<div class="${w.sev}" data-w="${i}">${w.sev === 'err' ? '⛔' : '⚠'} ${esc(w.msg)}</div>`).join('') : '<div class="ok">✓ אין התנגשויות, כל המעברים פנויים</div>';
  $('#warns').onclick = (e) => { const d = e.target.closest('[data-w]'); if (!d) return; const w = list[+d.dataset.w]; const id = w.ids[0]; const kind = f.furn.find(x => x.id === id) ? 'furn' : f.rooms.find(x => x.id === id) ? 'room' : f.doors.find(x => x.id === id) ? 'door' : null; if (kind) { sel = { kind, id }; render(); } };
}

// ---------- קטלוג ----------
let catSel = FURN_CATS[0];
function renderCat() {
  $('#catChips').innerHTML = FURN_CATS.map(c => `<button data-c="${c}" class="${c === catSel ? 'on' : ''}">${c}</button>`).join('');
  $('#catList').innerHTML = Object.entries(FURN).filter(([, v]) => v.cat === catSel).map(([k, v]) => { const m = Math.max(v.w, v.d) * 1.1; return `<div class="citem" data-k="${k}"><svg viewBox="${-m / 2} ${-m / 2} ${m} ${m}">${furnSymbol({ type: k, w: v.w, d: v.d, x: 0, y: 0, rot: 0 })}</svg>${esc(v.name)}<small>${v.w}×${v.d}</small></div>`; }).join('');
}
function addFurn(type) {
  const f = F(); const fd = FURN[type];
  let room = sel.kind === 'room' ? f.rooms.find(r => r.id === sel.id) : sel.kind === 'furn' ? f.rooms.find(r => r.id === f.furn.find(x => x.id === sel.id)?.room) : null;
  let x, y; if (room) [x, y] = labelPt(room.poly); else { x = view.cx; y = view.cy; room = f.rooms.find(r => pip([x, y], r.poly)); }
  const it = { id: uid('u'), type, x: Math.round(x), y: Math.round(y), w: fd.w, d: fd.d, rot: 0, room: room?.id || null };
  mutate(() => { f.furn.push(it); sel = { kind: 'furn', id: it.id }; });
  closeSheet(); toast(`${fd.name} נוסף – גרור למקום`);
}

// ---------- גאומטריה של עריכה ----------
const GRID = 5;
const g5 = (v) => Math.round(v / GRID) * GRID;
function snapPt(p, prev = null, skip = null) {
  const f = F(); const tol = 10 * view.s; let best = null, bd = tol;
  for (const r of f.rooms) for (let i = 0; i < r.poly.length; i++) { if (skip && skip.r === r.id && skip.i === i) continue; const q = r.poly[i]; const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = [q[0], q[1]]; } }
  for (const w of f.walls) for (const q of [[w.x1, w.y1], [w.x2, w.y2]]) { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = q; } }
  if (best) return best;
  let q = [g5(p[0]), g5(p[1])];
  if (prev) { const dx = q[0] - prev[0], dy = q[1] - prev[1]; const a = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI) % 90; if (a < 8 || a > 82) { if (Math.abs(dx) > Math.abs(dy)) q[1] = prev[1]; else q[0] = prev[0]; } }
  return q;
}
// כל הקווים שיכולים לשמש כקיר: קירות + צלעות חדרים
function wallLines() {
  const f = F(); const L = f.walls.map(w => ({ a: [w.x1, w.y1], b: [w.x2, w.y2], t: w.t }));
  for (const r of f.rooms) for (let i = 0; i < r.poly.length; i++) L.push({ a: r.poly[i], b: r.poly[(i + 1) % r.poly.length], t: 12 });
  return L;
}
function nearestLine(p) { let best = null; for (const l of wallLines()) { const d = distPtSeg(p, l.a, l.b); if (!best || d.d < best.d) best = { ...d, l }; } return best; }
function snapFurn(it) {
  const f = F(); const r = (((it.rot || 0) % 360) + 360) % 360; if (r % 90) return;
  const room = f.rooms.find(rm => pip([it.x, it.y], rm.poly)); if (!room) return;
  const B = bbox(corners(it)); const tol = 14 * Math.max(1, view.s); let dx = 0, dy = 0, bx = tol, by = tol;
  for (let i = 0; i < room.poly.length; i++) {
    const a = room.poly[i], b = room.poly[(i + 1) % room.poly.length];
    if (Math.abs(a[0] - b[0]) < 1) { const lo = Math.min(a[1], b[1]), hi = Math.max(a[1], b[1]); if (B.y1 < lo || B.y0 > hi) continue; for (const e of [B.x0, B.x1]) { const d = a[0] - e; if (Math.abs(d) < bx) { bx = Math.abs(d); dx = d; } } }
    if (Math.abs(a[1] - b[1]) < 1) { const lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]); if (B.x1 < lo || B.x0 > hi) continue; for (const e of [B.y0, B.y1]) { const d = a[1] - e; if (Math.abs(d) < by) { by = Math.abs(d); dy = d; } } }
  }
  it.x += dx; it.y += dy;
}
function snapToWall(it) {
  const f = F(); const room = f.rooms.find(rm => pip([it.x, it.y], rm.poly)) || f.rooms.find(r => r.id === it.room); if (!room) return toast('הרהיט לא בתוך חדר');
  let best = null;
  for (let i = 0; i < room.poly.length; i++) { const a = room.poly[i], b = room.poly[(i + 1) % room.poly.length]; const d = distPtSeg([it.x, it.y], a, b); if (!best || d.d < best.d.d) best = { a, b, d }; }
  const { a, b, d } = best; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; let n = [-u[1], u[0]];
  if (!pip([d.x + n[0] * 5, d.y + n[1] * 5], room.poly)) n = [-n[0], -n[1]];
  it.rot = Math.round(Math.atan2(-n[0], n[1]) * 180 / Math.PI + 360) % 360;
  const t = Math.min(L - it.w / 2, Math.max(it.w / 2, d.t * L));
  it.x = Math.round(a[0] + u[0] * t + n[0] * it.d / 2); it.y = Math.round(a[1] + u[1] * t + n[1] * it.d / 2); it.room = room.id;
}
function splitPoly(poly, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1]; const hits = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length]; const ex = q[0] - p[0], ey = q[1] - p[1];
    const den = dx * ey - dy * ex; if (Math.abs(den) < 1e-9) continue;
    const t = ((p[0] - a[0]) * ey - (p[1] - a[1]) * ex) / den, s = ((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / den;
    if (s >= 0 && s < 1) hits.push({ t, i, pt: [Math.round(a[0] + dx * t), Math.round(a[1] + dy * t)] });
  }
  hits.sort((x, y) => x.t - y.t);
  for (let k = 0; k + 1 < hits.length; k += 2) {
    const h1 = hits[k], h2 = hits[k + 1]; if (!(h1.t <= 0.5 && h2.t >= 0.5) && !(k === 0 && hits.length === 2)) continue;
    const [A, B] = h1.i < h2.i ? [h1, h2] : [h2, h1]; if (A.i === B.i) return null;
    const p1 = [A.pt, ...poly.slice(A.i + 1, B.i + 1), B.pt];
    const p2 = [B.pt, ...poly.slice(B.i + 1), ...poly.slice(0, A.i + 1), A.pt];
    const clean = (pp) => pp.filter((p, i) => { const q = pp[(i + 1) % pp.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.5; });
    return [clean(p1), clean(p2)];
  }
  return null;
}
async function guess(room) { const { guessType } = await import('./detect.js'); return guessType({ ...room, area: Math.abs(polyArea(room.poly)) / 1e4 }); }
async function addRoom(poly) {
  if (Math.abs(polyArea(poly)) < 2500) return toast('החדר קטן מדי');
  const r = { id: uid('r'), name: '', type: 'other', confirmed: false, poly };
  r.type = await guess(r); r.name = ROOM_TYPES[r.type].name;
  mutate(() => { F().rooms.push(r); sel = { kind: 'room', id: r.id }; });
  toast(`נוסף חדר – הסוג נוחש כ״${r.name}״. אשר או שנה במאפיינים.`);
}

// ---------- אינטראקציה בתוכנית ----------
const pointers = new Map(); let drag = null, pinch = null;
svg.addEventListener('pointerdown', (e) => {
  svg.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; if (drag?.moved && drag.undo) { /* כבר זז – משאירים */ } drag = null; draft = draft?.kind === 'poly' ? draft : null; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: view.s, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], cx: view.cx, cy: view.cy }; return; }
  if (pointers.size > 2) return;
  const p = toWorldPt(e); const f = F();
  const start = { x: e.clientX, y: e.clientY, p, moved: false };
  if (e.button === 1 || e.button === 2) { drag = { ...start, kind: 'pan', cx: view.cx, cy: view.cy }; return; }
  if (tool === 'select') {
    const h = e.target.closest('[data-h]');
    if (h) { drag = { ...start, kind: 'h', h: h.dataset.h, i: +h.dataset.i, orig: JSON.stringify(project) }; if (h.dataset.h === 'v') { sel.vi = +h.dataset.i; } return; }
    const g = e.target.closest('.furn,.door,.win,.wall,.room');
    if (g) {
      const id = g.dataset.id; const kind = g.classList.contains('furn') ? 'furn' : g.classList.contains('door') ? 'door' : g.classList.contains('win') ? 'window' : g.classList.contains('wall') ? 'wall' : 'room';
      const prevSel = sel.id; sel = { kind, id, vi: null }; if (prevSel !== id) genCache = null;
      if (kind === 'room') { drag = { ...start, kind: 'pan', cx: view.cx, cy: view.cy, clickSel: true }; render(); return; }
      const obj = { furn: f.furn, door: f.doors, window: f.windows, wall: f.walls }[kind].find(x => x.id === id);
      drag = { ...start, kind: 'move', obj, o: JSON.parse(JSON.stringify(obj)), orig: JSON.stringify(project) };
      render(); return;
    }
    drag = { ...start, kind: 'pan', cx: view.cx, cy: view.cy, clear: true }; return;
  }
  const sp = snapPt(p, draft?.kind === 'poly' ? draft.pts[draft.pts.length - 1] : null);
  if (tool === 'rect') draft = { kind: 'rect', pts: [sp, sp] };
  else if (tool === 'wall' || tool === 'split' || tool === 'calib') draft = { kind: tool, pts: [tool === 'calib' ? p : sp, tool === 'calib' ? p : sp] };
  else if (tool === 'window') { const n = nearestLine(p); const q = n && n.d < 40 ? [n.x, n.y] : sp; draft = { kind: 'window', pts: [q, q], line: n && n.d < 40 ? n.l : null }; }
  else if (tool === 'door') { placeDoor(p); return; }
  else if (tool === 'poly') {
    if (!draft) draft = { kind: 'poly', pts: [sp] };
    else { const f0 = draft.pts[0]; if (draft.pts.length >= 3 && Math.hypot(f0[0] - sp[0], f0[1] - sp[1]) < 12 * view.s) { const pts = draft.pts; draft = null; addRoom(pts); return; } draft.pts.push(sp); }
    renderPlan(); return;
  }
  drag = { ...start, kind: 'draw' }; renderPlan();
});
svg.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; view.s = Math.min(20, Math.max(0.15, pinch.s * pinch.d / Math.max(10, d))); view.cx = pinch.cx - (mid[0] - pinch.mid[0]) * view.s; view.cy = pinch.cy - (mid[1] - pinch.mid[1]) * view.s; renderPlan(); return; }
  const p = toWorldPt(e);
  if (!drag) { if (draft?.kind === 'poly') { draft.hover = snapPt(p, draft.pts[draft.pts.length - 1]); renderPlan(); } return; }
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
  drag.moved = true; const f = F();
  if (drag.kind === 'pan') { view.cx = drag.cx - (e.clientX - drag.x) * view.s; view.cy = drag.cy - (e.clientY - drag.y) * view.s; renderPlan(); return; }
  if (drag.kind === 'draw') {
    if (draft.kind === 'calib') draft.pts[1] = p;
    else if (draft.kind === 'window' && draft.line) { const d = distPtSeg(p, draft.line.a, draft.line.b); draft.pts[1] = [d.x, d.y]; }
    else draft.pts[1] = snapPt(p, draft.kind === 'rect' ? null : draft.pts[0]);
    renderPlan(); return;
  }
  const dx = p[0] - drag.p[0], dy = p[1] - drag.p[1];
  if (drag.kind === 'move') {
    const o = drag.o, obj = drag.obj;
    if (sel.kind === 'furn') { obj.x = Math.round(o.x + dx); obj.y = Math.round(o.y + dy); snapFurn(obj); }
    else if (sel.kind === 'door') { obj.x = Math.round(o.x + dx); obj.y = Math.round(o.y + dy); const n = nearestLine([obj.x, obj.y]); if (n && n.d < 25) { obj.x = Math.round(n.x); obj.y = Math.round(n.y); } }
    else { obj.x1 = o.x1 + dx; obj.y1 = o.y1 + dy; obj.x2 = o.x2 + dx; obj.y2 = o.y2 + dy; }
    renderPlan(); return;
  }
  if (drag.kind === 'h') {
    if (sel.kind === 'room') { const r = f.rooms.find(x => x.id === sel.id);
      if (drag.h === 'v') { r.poly[drag.i] = snapPt(p, null, { r: r.id, i: drag.i }); }
      else if (drag.h === 'm') { r.poly.splice(drag.i + 1, 0, snapPt(p)); drag.h = 'v'; drag.i = drag.i + 1; sel.vi = drag.i; }
    } else if (sel.kind === 'furn') { const it = f.furn.find(x => x.id === sel.id);
      if (drag.h === 'rot') { let a = Math.atan2(p[1] - it.y, p[0] - it.x) * 180 / Math.PI + 90; a = (Math.round(a / 5) * 5 + 360) % 360; for (const q of [0, 90, 180, 270, 360]) if (Math.abs(a - q) < 4) a = q % 360; it.rot = a; }
      else { const c = Math.cos(rad(it.rot)), s = Math.sin(rad(it.rot)); const lx = (p[0] - it.x) * c + (p[1] - it.y) * s, ly = -(p[0] - it.x) * s + (p[1] - it.y) * c;
        if (drag.h === 'rw') { const left = -it.w / 2; const nw = Math.max(20, g5(lx - left)); const shift = (nw - it.w) / 2; it.w = nw; it.x += shift * c; it.y += shift * s; }
        if (drag.h === 'rd') { const back = -it.d / 2; const nd = Math.max(20, g5(ly - back)); const shift = (nd - it.d) / 2; it.d = nd; it.x += -shift * s; it.y += shift * c; } }
    } else if (sel.kind === 'wall' || sel.kind === 'window') { const w = (sel.kind === 'wall' ? f.walls : f.windows).find(x => x.id === sel.id); const q = sel.kind === 'wall' ? snapPt(p, drag.i === 1 ? [w.x2, w.y2] : [w.x1, w.y1]) : p; if (drag.i === 1) { w.x1 = q[0]; w.y1 = q[1]; } else { w.x2 = q[0]; w.y2 = q[1]; } }
    renderPlan();
  }
});
const endPtr = (e) => {
  pointers.delete(e.pointerId); if (pinch) { if (pointers.size < 2) pinch = null; return; }
  if (!drag) return; const d = drag; drag = null;
  if (d.kind === 'pan') { if (!d.moved) { if (d.clear) { sel = { kind: null, id: null }; genCache = null; } render(); } return; }
  if (d.kind === 'draw') { finishDraw(); return; }
  if (d.moved && d.orig) { undoS.push(d.orig); redoS = []; if (sel.kind === 'furn') { const it = F().furn.find(x => x.id === sel.id); const r = F().rooms.find(rm => pip([it.x, it.y], rm.poly)); it.room = r?.id || null; } genCache = sel.kind === 'room' ? null : genCache; save(); }
  render();
};
svg.addEventListener('pointerup', endPtr); svg.addEventListener('pointercancel', endPtr);
svg.addEventListener('contextmenu', e => e.preventDefault());
svg.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(Math.exp(e.deltaY * 0.0015), e.clientX, e.clientY); }, { passive: false });
svg.addEventListener('dblclick', () => { if (draft?.kind === 'poly' && draft.pts.length >= 3) { const pts = draft.pts; draft = null; addRoom(pts); } });

function finishDraw() {
  const dr = draft; draft = null; const [a, b] = dr.pts; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const f = F();
  if (dr.kind === 'rect') { if (Math.abs(b[0] - a[0]) < 50 || Math.abs(b[1] - a[1]) < 50) { renderPlan(); return toast('גרור כדי לצייר מלבן'); } const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]); addRoom([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]); return; }
  if (L < 20) { renderPlan(); return; }
  if (dr.kind === 'wall') mutate(() => { const w = { id: uid('w'), x1: a[0], y1: a[1], x2: b[0], y2: b[1], t: 12 }; f.walls.push(w); sel = { kind: 'wall', id: w.id }; });
  if (dr.kind === 'window') mutate(() => { const w = { id: uid('n'), x1: Math.round(a[0]), y1: Math.round(a[1]), x2: Math.round(b[0]), y2: Math.round(b[1]) }; f.windows.push(w); sel = { kind: 'window', id: w.id }; });
  if (dr.kind === 'split') {
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; const r = f.rooms.find(rm => pip(mid, rm.poly)) || f.rooms.find(rm => rm.id === sel.id);
    const parts = r && splitPoly(r.poly, a, b); if (!parts) { renderPlan(); return toast('הקו צריך לחצות חדר אחד מקיר לקיר'); }
    mutate(() => { const big = Math.abs(polyArea(parts[0])) >= Math.abs(polyArea(parts[1])) ? 0 : 1; r.poly = parts[big]; const nr = { id: uid('r'), name: 'חדר חדש', type: 'other', confirmed: false, poly: parts[1 - big] }; f.rooms.push(nr); sel = { kind: 'room', id: nr.id }; genCache = null; });
    toast('החדר פוצל. תן שם וסוג לחלק החדש.');
  }
  if (dr.kind === 'calib') calibDialog(L);
}
function placeDoor(p) {
  const n = nearestLine(p); if (!n || n.d > 50) return toast('לחץ קרוב לקיר כדי להוסיף דלת');
  const { a, b } = n.l; const L = Math.hypot(b[0] - a[0], b[1] - a[1]); const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const w = 80; const hx = n.x - u[0] * w / 2, hy = n.y - u[1] * w / 2;
  const side = ((p[0] - n.x) * -u[1] + (p[1] - n.y) * u[0]) >= 0 ? 1 : -1;
  mutate(() => { const d = { id: uid('d'), x: Math.round(hx), y: Math.round(hy), ang: Math.round(Math.atan2(u[1], u[0]) * 180 / Math.PI), w, side }; F().doors.push(d); sel = { kind: 'door', id: d.id }; });
  toast('דלת נוספה – הדלת נפתחת לצד שבו לחצת. אפשר להפוך במאפיינים.');
}
function scaleFloor(f, k) {
  if (f.bg) { f.bg.x *= k; f.bg.y *= k; f.bg.w *= k; f.bg.h *= k; }
  for (const w of f.walls) { w.x1 *= k; w.y1 *= k; w.x2 *= k; w.y2 *= k; }
  for (const w of f.windows) { w.x1 *= k; w.y1 *= k; w.x2 *= k; w.y2 *= k; }
  for (const d of f.doors) { d.x *= k; d.y *= k; d.w *= k; }
  for (const r of f.rooms) r.poly = r.poly.map(([x, y]) => [Math.round(x * k), Math.round(y * k)]);
  for (const it of f.furn) { it.x *= k; it.y *= k; }
}

// ---------- דיאלוגים ----------
function dialog(html, bind) { const d = $('#dlg'); $('#dlgBody').innerHTML = html; bind?.(d); if (!d.open) d.showModal(); return d; }
function calibDialog(measured) {
  dialog(`<h2>כיול קנה מידה</h2><p class="kv">המרחק שסימנת: ${Math.round(measured)} יחידות. מה המרחק האמיתי?</p><div class="row"><input type="number" id="cReal" value="${Math.round(measured)}" style="font-size:18px"> <span>ס״מ</span></div><div class="btns"><button value="ok" class="pri" id="cOk">כייל</button><button value="cancel">ביטול</button></div>`, (d) => {
    setTimeout(() => $('#cReal').select(), 50);
    $('#cOk').onclick = (e) => { e.preventDefault(); const real = +$('#cReal').value; if (!(real > 0)) return; const k = real / measured; mutate(() => scaleFloor(F(), k)); d.close(); setTool('select'); fit(); toast(`כויל: פי ${k.toFixed(3)}`); };
  });
}
async function onUpload(file) {
  if (!file) return;
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    toast('טוען PDF…');
    const { openPdf, thumbPage } = await import('./detect.js');
    const pdf = await openPdf(await file.arrayBuffer());
    const n = pdf.numPages;
    dialog(`<h2>בחר עמוד (${n} עמודים)</h2><div class="pages" id="pgList">${Array.from({ length: n }, (_, i) => `<button type="button" data-p="${i + 1}"><img id="th${i + 1}" alt=""><span>עמוד ${i + 1}</span></button>`).join('')}</div><div class="btns"><button value="cancel">ביטול</button></div>`, (d) => {
      $('#pgList').onclick = (e) => { const b = e.target.closest('[data-p]'); if (!b) return; d.close(); usePdfPage(pdf, +b.dataset.p, file.name); };
    });
    for (let i = 1; i <= Math.min(n, 30); i++) { try { const url = await thumbPage(pdf, i, 160); const im = $('#th' + i); if (im) im.src = url; } catch (e) { } }
  } else if (file.type.startsWith('image/')) {
    const url = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
    const img = await loadImg(url); let src = url, w = img.naturalWidth, h = img.naturalHeight;
    if (Math.max(w, h) > 4000) { const k = 4000 / Math.max(w, h); const c = document.createElement('canvas'); c.width = w * k; c.height = h * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); src = c.toDataURL('image/jpeg', .85); w = c.width; h = c.height; }
    const cmPerPx = 1000 / w; // הנחה זמנית: רוחב התמונה = 10 מ׳
    setBg({ kind: 'image', key: 'bg' + uid(''), src, wPx: w, hPx: h, cmPerPx, name: file.name });
    dialog(`<h2>התמונה נטענה</h2><p>כדי שהמידות יהיו נכונות צריך לכייל: סמן שתי נקודות שהמרחק ביניהן ידוע (למשל קיר עם מידה רשומה) והקלד את המידה.</p><div class="btns"><button class="pri" id="goCal">כייל עכשיו</button><button id="goDet">זיהוי אוטומטי</button><button value="cancel">אחר כך</button></div>`, (d) => { $('#goCal').onclick = (e) => { e.preventDefault(); d.close(); setTool('calib'); }; $('#goDet').onclick = (e) => { e.preventDefault(); d.close(); autoDetect(); }; });
  }
}
const loadImg = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
async function usePdfPage(pdf, n, name) {
  toast('מעבד את העמוד…');
  const { renderPage } = await import('./detect.js');
  const r = await renderPage(pdf, n, 2.5);
  const src = r.canvas.toDataURL('image/jpeg', 0.8);
  dialog(`<h2>קנה מידה</h2><p>מה קנה המידה הרשום בתוכנית? (למשל 1:50)</p><div class="row"><span>1:</span><input type="number" id="sN" value="50" style="font-size:18px"></div><p class="kv">אם לא ידוע – השאר 50 וכייל אחר כך עם כלי ״כיול״.</p><div class="btns"><button class="pri" id="sOk">המשך וזהה חדרים</button><button id="sOk2">המשך בלי זיהוי</button></div>`, (d) => {
    const go = (det) => (e) => { e.preventDefault(); const N = +$('#sN').value || 50; d.close(); const cmPerPx = N * 2.54 / 72 / 2.5; const fid = setBg({ kind: 'pdf', key: 'bg' + uid(''), src, wPx: r.canvas.width, hPx: r.canvas.height, cmPerPx, name: `${name} · עמוד ${n}`, renderScale: 2.5, page: n }); session.pdf[fid] = r; if (det) autoDetect(); };
    $('#sOk').onclick = go(true); $('#sOk2').onclick = go(false);
  });
}
function setBg({ kind, key, src, wPx, hPx, cmPerPx, name, renderScale, page }) {
  bgStore[key] = src; let f = F();
  if (f.bg || f.rooms.length || f.furn.length) { commit(); f = newFloor(`קומה ${project.floors.length + 1}`); project.floors.push(f); project.cur = project.floors.length - 1; } else commit();
  f.bg = { kind, key, x: 0, y: 0, w: wPx * cmPerPx, h: hPx * cmPerPx, wPx, hPx, opacity: 0.6, show: true, name, renderScale, page };
  sel = { kind: null, id: null }; render(); fit(); save(); return f.id;
}
async function autoDetect() {
  const f = F(); if (!f.bg) return toast('אין תוכנית רקע');
  if (f.rooms.length && !confirm('הזיהוי יחליף את החדרים, הקירות, הדלתות והחלונות בקומה הזו. להמשיך?')) return;
  toast('מזהה קירות וחדרים…', 8000);
  const D = await import('./detect.js'); const cmPerPx = f.bg.w / f.bg.wPx; let res;
  try {
    const s = session.pdf[f.id];
    if (s) res = D.analyzeVector(await D.extractVector(s.page, s.vp), cmPerPx);
    if (!res || !res.ok || res.rooms.length < 2) {
      const img = await loadImg(bgSrc(f.bg.key)); const c = document.createElement('canvas'); c.width = f.bg.wPx; c.height = f.bg.hPx; const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
      const r2 = D.analyzeRaster(g.getImageData(0, 0, c.width, c.height), cmPerPx); if (!res || r2.rooms.length > res.rooms.length) res = r2;
    }
  } catch (e) { console.error(e); return toast('הזיהוי נכשל: ' + e.message); }
  const ox = f.bg.x, oy = f.bg.y; const sh = (p) => [Math.round(p[0] + ox), Math.round(p[1] + oy)];
  mutate(() => {
    f.rooms = res.rooms.map(r => { const t = D.guessType(r); return { id: r.id, name: ROOM_TYPES[t].name, type: t, confirmed: false, poly: r.poly.map(sh) }; });
    f.walls = res.walls.map(w => ({ ...w, x1: w.x1 + ox, y1: w.y1 + oy, x2: w.x2 + ox, y2: w.y2 + oy }));
    f.doors = res.doors.map(d => ({ ...d, x: d.x + ox, y: d.y + oy }));
    f.windows = res.windows.map(w => ({ ...w, x1: w.x1 + ox, y1: w.y1 + oy, x2: w.x2 + ox, y2: w.y2 + oy }));
    f.furn = f.furn.filter(it => f.rooms.some(r => pip([it.x, it.y], r.poly)));
    sel = { kind: null, id: null };
  });
  toast(`זוהו ${res.rooms.length} אזורים, ${res.doors.length} דלתות, ${res.windows.length} חלונות (${res.method || (session.pdf[f.id] ? 'וקטורי' : 'תמונה')}). בדוק כל חדר: מחק עודפים, פצל חללים פתוחים, ואשר סוג.`, 7000);
}

// ---------- פעולות ----------
function applyOption(room, o) { mutate(() => { const f = F(); f.furn = f.furn.filter(it => it.room !== room.id && !(it.room == null && pip([it.x, it.y], room.poly))); for (const it of o.items) f.furn.push({ ...it, id: uid('u'), room: room.id }); }); toast('ההעמדה הוחלה'); }
function genAll() {
  const f = F(); let n = 0, skip = [];
  mutate(() => { for (const r of f.rooms) { const g = generate(r, f, 1); if (g.options.length) { f.furn = f.furn.filter(it => it.room !== r.id); for (const it of g.options[0].items) f.furn.push({ ...it, id: uid('u'), room: r.id }); n++; } else if (!['storage', 'stairs', 'other'].includes(r.type)) skip.push(r.name); } });
  toast(`הועמדו ${n} חדרים${skip.length ? ` · ללא הצעה: ${skip.slice(0, 4).join(', ')}` : ''}`, 5000);
}
function delSel() {
  const f = F(); if (!sel.kind) return;
  mutate(() => { const L = { room: 'rooms', furn: 'furn', wall: 'walls', door: 'doors', window: 'windows' }[sel.kind]; f[L] = f[L].filter(x => x.id !== sel.id); if (sel.kind === 'room') f.furn = f.furn.filter(it => it.room !== sel.id); sel = { kind: null, id: null }; });
}
function dupSel() {
  const f = F();
  if (sel.kind === 'furn') { const it = f.furn.find(x => x.id === sel.id); const n = { ...it, id: uid('u'), x: it.x + 30, y: it.y + 30 }; mutate(() => { f.furn.push(n); sel = { kind: 'furn', id: n.id }; }); }
  if (sel.kind === 'room') { const r = f.rooms.find(x => x.id === sel.id); const n = { ...r, id: uid('r'), name: r.name + ' 2', poly: r.poly.map(([x, y]) => [x + 50, y + 50]) }; mutate(() => { f.rooms.push(n); sel = { kind: 'room', id: n.id }; }); }
}
function rotSel(d) { const it = F().furn.find(x => x.id === sel.id); if (it) mutate(() => { it.rot = ((it.rot || 0) + d + 360) % 360; }); }

document.addEventListener('click', (e) => {
  const t = e.target; const f = F(); const id = t.id;
  const tb = t.closest('#tools [data-t]'); if (tb) { setTool(tb.dataset.t); closeSheet(); return; }
  const ft = t.closest('#floorTabs button'); if (ft) { if (ft.dataset.add) mutate(() => { project.floors.push(newFloor(`קומה ${project.floors.length + 1}`)); project.cur = project.floors.length - 1; sel = { kind: null }; }); else { project.cur = +ft.dataset.i; sel = { kind: null, id: null }; genCache = null; render(); fit(); save(); } return; }
  const vs = t.closest('#viewSeg [data-v]'); if (vs) { setView(vs.dataset.v); return; }
  const ch = t.closest('#catChips [data-c]'); if (ch) { catSel = ch.dataset.c; renderCat(); return; }
  const ci = t.closest('.citem'); if (ci) { addFurn(ci.dataset.k); return; }
  const op = t.closest('.opt'); if (op && genCache) { const r = f.rooms.find(x => x.id === genCache.roomId); applyOption(r, genCache.options[+op.dataset.o]); return; }
  const rl = t.closest('.rlist [data-r]'); if (rl) { sel = { kind: 'room', id: rl.dataset.r }; genCache = null; render(); return; }
  const mt = t.closest('#mtabs button'); if (mt) { toggleSheet(mt.dataset.m, mt.dataset.s); return; }
  const p3 = t.closest('.v3bar [data-p]'); if (p3) { if (p3.dataset.p === 'eye' && v3?.opts().cut) { v3.setOpts({ cut: false }); const b = $('#v3cut'); b.classList.remove('on'); b.textContent = 'קירות מלאים'; } v3?.preset(p3.dataset.p); return; }
  const room = sel.kind === 'room' ? f.rooms.find(x => x.id === sel.id) : null;
  const it = sel.kind === 'furn' ? f.furn.find(x => x.id === sel.id) : null;
  const door = sel.kind === 'door' ? f.doors.find(x => x.id === sel.id) : null;
  switch (id) {
    case 'bSample': openSample(); break;
    case 'bNew': if (confirm('להתחיל פרויקט חדש? (הפרויקט הנוכחי יימחק מהדפדפן – אפשר לייצא קודם)')) { commit(); project = { v: 1, name: 'פרויקט חדש', floors: [newFloor('קומה א׳')], cur: 0 }; sel = { kind: null }; render(); fit(); save(); } break;
    case 'bUndo': undo(); break; case 'bRedo': redo(); break;
    case 'bExport': exportJSON(); break; case 'bPrint': doPrint(); break;
    case 'zIn': zoomAt(1 / 1.3, ...centerScr()); break; case 'zOut': zoomAt(1.3, ...centerScr()); break; case 'zFit': fit(); break;
    case 'bDetect': autoDetect(); break;
    case 'bDelUnc': mutate(() => { const keep = f.rooms.filter(r => r.confirmed); f.rooms = keep; }); break;
    case 'bgNset': { const N = +$('#bgN').value; const cur = f.bg.w / f.bg.wPx * f.bg.renderScale * 72 / 2.54; mutate(() => scaleFloor(f, N / cur)); fit(); break; }
    case 'rConfirm': mutate(() => { room.confirmed = true; }); break;
    case 'rGen': { const g = generate(room, f, 4); genCache = { roomId: room.id, ...g }; renderInsp(); break; }
    case 'rClear': mutate(() => { f.furn = f.furn.filter(x => x.room !== room.id); }); break;
    case 'rDel': case 'fDel': case 'dDel': case 'wDel': case 'wlDel': delSel(); break;
    case 'rDup': case 'fDup': dupSel(); break;
    case 'rDelV': if (room.poly.length > 3) mutate(() => { room.poly.splice(sel.vi, 1); sel.vi = null; }); break;
    case 'fRL': rotSel(-90); break; case 'fRR': rotSel(90); break;
    case 'fSnap': mutate(() => snapToWall(it)); break;
    case 'dFlip': mutate(() => { door.side = -door.side; }); break;
    case 'dHinge': mutate(() => { const u = [Math.cos(rad(door.ang)), Math.sin(rad(door.ang))]; door.x += u[0] * door.w; door.y += u[1] * door.w; door.ang = (door.ang + 180) % 360; door.side = -door.side; }); break;
    case 'genAll': genAll(); break;
    case 'flDel': if (project.floors.length > 1 && confirm('למחוק את הקומה?')) mutate(() => { project.floors.splice(project.cur, 1); project.cur = 0; sel = { kind: null }; }); break;
    case 'v3cut': { const on = !v3.opts().cut; v3.setOpts({ cut: on }); t.classList.toggle('on', on); t.textContent = on ? 'קירות חתוכים' : 'קירות מלאים'; break; }
    case 'v3lab': { const on = !v3.opts().labels; v3.setOpts({ labels: on }); t.classList.toggle('on', on); break; }
    case 'v3q': { const q = v3.opts().quality === 'high' ? 'low' : 'high'; v3.setOpts({ quality: q }); t.textContent = 'איכות: ' + (q === 'high' ? 'גבוהה' : 'נמוכה'); break; }
    case 'v3png': { const a = document.createElement('a'); a.href = v3.snapshot(); a.download = `${project.name}-${F().name}-3d.png`; a.click(); break; }
  }
});
document.addEventListener('change', (e) => {
  const t = e.target, f = F(); const room = sel.kind === 'room' ? f.rooms.find(x => x.id === sel.id) : null; const it = sel.kind === 'furn' ? f.furn.find(x => x.id === sel.id) : null;
  switch (t.id) {
    case 'fileIn': onUpload(t.files[0]); t.value = ''; break;
    case 'importIn': importJSON(t.files[0]); t.value = ''; break;
    case 'rName': mutate(() => { room.name = t.value; }); break;
    case 'rType': mutate(() => { const old = ROOM_TYPES[room.type].name; if (!room.name || room.name === old || room.name === 'חדר חדש') room.name = ROOM_TYPES[t.value].name; room.type = t.value; room.confirmed = true; genCache = null; }); break;
    case 'fW': mutate(() => { it.w = Math.max(10, +t.value); }); break; case 'fD': mutate(() => { it.d = Math.max(10, +t.value); }); break;
    case 'fR': mutate(() => { it.rot = ((+t.value % 360) + 360) % 360; }); break; case 'fC': mutate(() => { it.color = t.value; }); break;
    case 'dW': mutate(() => { f.doors.find(x => x.id === sel.id).w = +t.value; }); break;
    case 'wT': mutate(() => { f.walls.find(x => x.id === sel.id).t = Math.max(2, +t.value); }); break;
    case 'flName': mutate(() => { f.name = t.value; }); break; case 'prName': mutate(() => { project.name = t.value; }); break;
    case 'bgShow': mutate(() => { f.bg.show = t.checked; }); break;
  }
});
document.addEventListener('input', (e) => { if (e.target.id === 'bgOp') { F().bg.opacity = +e.target.value; bgImg.setAttribute('opacity', e.target.value); save(); } });
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input,select,textarea')) return;
  const k = e.key.toLowerCase();
  if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if ((e.ctrlKey || e.metaKey) && k === 'y') { e.preventDefault(); redo(); }
  else if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); dupSel(); }
  else if (k === 'delete' || k === 'backspace') { if (sel.kind === 'room' && sel.vi != null) { const r = F().rooms.find(x => x.id === sel.id); if (r.poly.length > 3) mutate(() => { r.poly.splice(sel.vi, 1); sel.vi = null; }); } else delSel(); }
  else if (k === 'escape') { draft = null; setTool('select'); }
  else if (k === 'enter' && draft?.kind === 'poly' && draft.pts.length >= 3) { const pts = draft.pts; draft = null; addRoom(pts); }
  else if (k === 'r' && sel.kind === 'furn') rotSel(e.shiftKey ? -90 : 90);
  else if (k === 'v') setTool('select');
});
const centerScr = () => { const r = svg.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
const HINTS = { select: 'לחץ לבחירה, גרור להזזה. גרירת רקע מזיזה את התצוגה.', rect: 'גרור מלבן כדי ליצור חדר (נצמד לרשת 5 ס״מ ולפינות קיימות).', poly: 'לחץ פינה אחרי פינה. סיום: לחיצה על הנקודה הראשונה, לחיצה כפולה או Enter.', split: 'גרור קו שחוצה חדר מקיר לקיר (למשל בין סלון לפינת אוכל).', wall: 'גרור כדי לצייר קיר.', door: 'לחץ ליד קיר, בצד שאליו הדלת נפתחת.', window: 'גרור לאורך קיר.', calib: 'גרור בין שתי נקודות שהמרחק ביניהן ידוע, ואז הקלד את המידה.' };
function setTool(t) { tool = t; draft = null; document.querySelectorAll('#tools [data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === t)); svg.setAttribute('class', 't-' + t); $('#toolHint').textContent = HINTS[t] || ''; renderPlan(); }
async function setView(v) {
  viewMode = v; document.querySelectorAll('#viewSeg [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === v));
  $('#planWrap').hidden = v === '3d'; $('#planWrap').style.display = v === '3d' ? 'none' : ''; $('#v3wrap').hidden = v === 'plan';
  if (v !== 'plan') { if (!v3) { const { create3D } = await import('./view3d.js'); v3 = create3D($('#v3'), { onPick: (id) => { sel = id ? { kind: 'furn', id } : { kind: null, id: null }; render(); }, roomCenter: () => { const f = F(); const r = (sel.kind === 'room' && f.rooms.find(x => x.id === sel.id)) || (sel.kind === 'furn' && f.rooms.find(x => x.id === f.furn.find(i => i.id === sel.id)?.room)) || [...f.rooms].sort((a, b) => Math.abs(polyArea(b.poly)) - Math.abs(polyArea(a.poly)))[0]; return r ? labelPt(r.poly) : null; } }); window.__v3 = v3; if (v3.opts().quality === 'low') $('#v3q').textContent = 'איכות: נמוכה'; } v3.start(); v3.resize(); v3.update(F(), sel.kind === 'furn' ? sel.id : null); }
  else v3?.stop();
  setTimeout(() => { applyView(); renderPlan(); v3?.resize(); }, 30);
}
function toggleSheet(pid, s) { const p = $('#' + pid); const was = p.classList.contains('open') && p.classList.contains('s-' + s); document.querySelectorAll('.panel').forEach(x => x.classList.remove('open', 's-tools', 's-cat', 's-insp', 's-warn')); if (!was) p.classList.add('open', 's-' + s); }
function closeSheet() { if (matchMedia('(max-width:820px)').matches) document.querySelectorAll('.panel').forEach(x => x.classList.remove('open')); }

// ---------- קבצים ----------
function exportJSON() {
  const used = {}; for (const f of project.floors) if (f.bg && bgStore[f.bg.key]) used[f.bg.key] = bgStore[f.bg.key];
  const blob = new Blob([JSON.stringify({ project, bgStore: used }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (project.name || 'project') + '.json'; a.click();
}
async function importJSON(file) {
  if (!file) return; try { const j = JSON.parse(await file.text()); const p = j.project || j; if (!p.floors) throw new Error('קובץ לא תקין'); commit(); project = p; bgStore = { ...bgStore, ...(j.bgStore || {}) }; sel = { kind: null }; render(); fit(); save(); toast('הפרויקט נטען'); } catch (e) { toast('שגיאה בייבוא: ' + e.message); }
}
async function openSample() {
  if ((F().rooms.length || F().bg) && !confirm('לפתוח את התוכנית שלך (דוגמה מוכנה)? הפרויקט הנוכחי יוחלף – אפשר לבטל ב-↶.')) return;
  const j = await (await fetch('samples/sample.json', { cache: 'no-cache' })).json();
  commit(); project = j.project; bgStore = { ...bgStore }; sel = { kind: null }; genCache = null; render(); fit(); save();
  toast('נפתחה התוכנית שלך (קומה א׳ + ב׳) עם העמדה אוטומטית. בחר חדר ולחץ ״הצע העמדות״ לחלופות נוספות.', 6000);
}
function doPrint() {
  const pa = $('#printArea');
  pa.innerHTML = project.floors.map(f => {
    const rows = f.rooms.map(r => `<tr><td>${esc(r.name)}</td><td>${ROOM_TYPES[r.type]?.name || ''}</td><td>${(Math.abs(polyArea(r.poly)) / 1e4).toFixed(1)}</td><td>${f.furn.filter(i => i.room === r.id).map(i => FURN[i.type]?.name).join(', ')}</td></tr>`).join('');
    return `<div class="pfloor"><h2>${esc(project.name)} – ${esc(f.name)}</h2>${printSVG(f)}<table><tr><th>חדר</th><th>סוג</th><th>מ״ר</th><th>ריהוט</th></tr>${rows}</table></div>`;
  }).join('');
  setTimeout(() => window.print(), 50);
}

// ---------- אתחול ----------
renderCat(); setTool('select');
const had = load();
window.__arch = { get project() { return project; }, get sel() { return sel; }, set sel(v) { sel = v; render(); }, render, fit, generate, F, setTool, setView, autoDetect, session, get warnings() { return warnings; }, view };
new ResizeObserver(() => renderPlan()).observe(svg);
render(); setTimeout(fit, 30);
if (!had) setTimeout(() => toast('התחל: ״פתח את התוכנית שלי״ או ״העלה תוכנית״ (PDF/תמונה)', 5000), 400);
