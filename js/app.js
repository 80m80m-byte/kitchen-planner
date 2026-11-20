import { ROOM0, WALLS0, WALL_IDS, TYPES, CATALOG, STD_W, PALS, TOPS, ZONES, seedItems } from './data.js';
import { T, iz, ih, id_, layer, isBlind, inv, validate, bom, points, PT_KIND, PT_COLOR, remaining, lbl } from './model.js';
import { planSVG, elevSVG, esc, pal, topOf, colorOf } from './render2d.js';

const KEY = 'kitchen-planner-v1';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clone = (o) => JSON.parse(JSON.stringify(o));

function fresh() {
  return { v: 1, room: clone(ROOM0), walls: clone(WALLS0), items: seedItems(), pal: 'white', top: 'quartz', custom: { base: '#7A8B7E', upper: '#F2F1EC', tall: '#7A8B7E' } };
}
const UI0 = { tab: 'plan', planLayer: 'low', zones: true, elevWall: 'all', addWall: 'A', points: false, mode3d: 'real', quality: null, labels3d: true };
let st = load();
let sel = null;
const undo = [], redo = [];

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.items)) { s.ui = { ...UI0, ...(s.ui || {}) }; s.room = { ...ROOM0, ...(s.room || {}) }; return s; }
  } catch (e) { }
  return { ...fresh(), ui: { ...UI0 } };
}
const core = () => JSON.stringify({ room: st.room, walls: st.walls, items: st.items, pal: st.pal, top: st.top, custom: st.custom });
let saveT = 0;
function save() { clearTimeout(saveT); saveT = setTimeout(() => { localStorage.setItem(KEY, JSON.stringify(st)); flash('נשמר'); }, 250); }
function snap() { undo.push(core()); if (undo.length > 150) undo.shift(); redo.length = 0; }
function commit(fn, opts = {}) { if (!opts.noUndo) snap(); fn(); render(); save(); }
function restore(json) { Object.assign(st, JSON.parse(json)); if (sel && !st.items.find(i => i.id === sel)) sel = null; render(); save(); }
function doUndo() { if (!undo.length) return; redo.push(core()); restore(undo.pop()); }
function doRedo() { if (!redo.length) return; undo.push(core()); restore(redo.pop()); }
const byId = (id) => st.items.find(i => i.id === id);

let flashT = 0;
function flash(t) { const el = $('#flash'); el.textContent = t; el.classList.add('on'); clearTimeout(flashT); flashT = setTimeout(() => el.classList.remove('on'), 900); }

// ===== מיקום פנוי ומזהים =====
function stackOverlap(a, b) {
  const la = layer(a), lb = layer(b);
  if (la === 'window' || lb === 'window') return false;
  if ((la === 'top') !== (lb === 'top')) return false;
  return Math.min(iz(a) + ih(a), iz(b) + ih(b)) - Math.max(iz(a), iz(b)) > 0.5;
}
function edgesFor(it, wall) {
  const e = [0, st.walls[wall].len];
  for (const o of st.items) if (o.wall === wall && o.id !== it.id && (stackOverlap(o, it) || (layer(it) === 'top' && ['base', 'blind'].includes(layer(o))) || (layer(it) === 'upper' && ['base', 'blind', 'tall'].includes(layer(o))))) e.push(o.s, o.s + o.w);
  return e;
}
function fits(it, wall, s) {
  if (s < -0.1 || s + it.w > st.walls[wall].len + 0.1) return false;
  return !st.items.some(o => o.id !== it.id && o.wall === wall && stackOverlap(o, it) && Math.min(o.s + o.w, s + it.w) - Math.max(o.s, s) > 0.5);
}
function findFree(it, wall, prefer = null) {
  const cands = [];
  if (prefer != null) cands.push(prefer);
  for (const e of edgesFor(it, wall)) cands.push(e, e - it.w);
  cands.sort((a, b) => prefer != null ? Math.abs(a - prefer) - Math.abs(b - prefer) : a - b);
  for (const c of cands) if (fits(it, wall, c)) return c;
  return null;
}
function nextId(it) {
  const t = T(it);
  let pre = ['base', 'blind', 'tall'].includes(t.layer) && !t.appl ? it.wall : t.layer === 'upper' && !t.appl ? 'U' + it.wall : t.pre;
  if (t.layer === 'blind' || t.blind || it.type === 'panel') pre = 'X';
  let n = 1; const re = new RegExp('^' + pre + '(\\d+)$');
  for (const o of st.items) { const m = o.id.match(re); if (m) n = Math.max(n, +m[1] + 1); }
  return pre + n;
}

// ===== תצוגה =====
function render() {
  document.body.dataset.tab = st.ui.tab;
  $$('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === st.ui.tab));
  $('#undo').disabled = !undo.length; $('#redo').disabled = !redo.length;
  $('#pal').value = st.pal; $('#top').value = st.top;
  renderPlan();
  renderElev();
  renderWarnings();
  renderInspector();
  if (st.ui.tab === 'list') renderList();
  if (st.ui.tab === '3d') render3D(); else dirty3d = true;
  $$('#planLayer button').forEach(b => b.classList.toggle('on', b.dataset.v === st.ui.planLayer));
  $('#zonesT').checked = st.ui.zones; $('#ptsT').checked = st.ui.points;
  document.body.classList.toggle('has-sel', !!sel);
}
function renderPlan() { $('#planBox').innerHTML = planSVG(st, sel); }
function renderElev() {
  const walls = st.ui.elevWall === 'all' ? WALL_IDS : [st.ui.elevWall];
  $('#elevBox').innerHTML = walls.map(w => `<div class="elevWrap">${elevSVG(st, w, sel, { points: st.ui.points })}</div>`).join('');
  $$('#elevWall button').forEach(b => b.classList.toggle('on', b.dataset.v === st.ui.elevWall));
}
function renderWarnings() {
  const v = validate(st);
  const ic = { err: '⛔', warn: '⚠️', info: 'ℹ️' };
  const ord = { err: 0, warn: 1, info: 2 };
  v.sort((a, b) => ord[a.sev] - ord[b.sev]);
  const errs = v.filter(x => x.sev === 'err').length, warns = v.filter(x => x.sev === 'warn').length;
  const rem = remaining(st);
  $('#warnings').innerHTML = `<div class="wh"><b>בדיקות</b> <span class="pill ${errs ? 'err' : 'ok'}">${errs} שגיאות</span> <span class="pill ${warns ? 'warn' : 'ok'}">${warns} אזהרות</span>
    <span class="remline">${WALL_IDS.map(w => `<span class="rem ${rem[w].low < 0 ? 'neg' : ''}">${st.walls[w].name}: ${rem[w].low < 0 ? 'חריגה ' : 'פנוי '}${Math.abs(Math.round(rem[w].low))}</span>`).join('')}</span></div>
    <ul>${v.map(x => `<li class="${x.sev}" data-ids="${x.ids.join(',')}">${ic[x.sev]} ${esc(x.msg)}</li>`).join('') || '<li class="ok">✅ אין בעיות</li>'}</ul>`;
  $('#tabWarn').textContent = errs ? errs : '';
}

function widthChips(it) {
  const ws = T(it).widths || STD_W;
  return `<div class="chips">${ws.map(w => `<button data-w="${w}" class="${it.w === w ? 'on' : ''}">${w}</button>`).join('')}</div>`;
}
function renderInspector() {
  const box = $('#inspector');
  const it = sel && byId(sel);
  if (!it) { box.innerHTML = roomPanel(); bindRoom(); return; }
  const t = T(it);
  const group = Object.entries(TYPES).filter(([k, v]) => v.group === t.group);
  const fieldN = (k, label, val, step = 1) => `<label class="f"><span>${label}</span><input type="number" data-k="${k}" value="${Math.round(val * 10) / 10}" step="${step}"></label>`;
  const zoneOpts = Object.entries(ZONES).map(([k, z]) => `<option value="${k}" ${(it.zone || 'shared') === k ? 'selected' : ''}>${z.name}</option>`).join('');
  const swatches = [...new Set(PALS.flatMap(p => [p.base, p.upper]))];
  let extra = '';
  if (it.type === 'tall_oven') {
    const s = it.stack || { ovens: 2, mw: true, zones: ['dairy', 'meat'] };
    extra = `<div class="sub"><b>עמודת תנורים</b>
      <label class="f"><span>מספר תנורים</span><select data-stack="ovens"><option ${s.ovens == 1 ? 'selected' : ''}>1</option><option ${s.ovens != 1 ? 'selected' : ''}>2</option></select></label>
      <label class="f chk"><input type="checkbox" data-stack="mw" ${s.mw !== false ? 'checked' : ''}> מיקרוגל בעמודה</label>
      ${[0, 1].slice(0, s.ovens ?? 2).map(k => `<label class="f"><span>תנור ${k + 1} (${k ? 'עליון' : 'תחתון'})</span><select data-ozone="${k}">${['dairy', 'meat', 'shared'].map(z => `<option value="${z}" ${(s.zones || [])[k] === z ? 'selected' : ''}>${ZONES[z].name}</option>`).join('')}</select></label>`).join('')}</div>`;
  }
  if (it.type === 'sink') extra = `<label class="f"><span>סוג כיור</span><select data-k="variant"><option value="single" ${(it.variant || 'single') === 'single' ? 'selected' : ''}>קערה אחת</option><option value="double" ${it.variant === 'double' ? 'selected' : ''}>כפול (בשרי/חלבי)</option></select></label>`;
  box.innerHTML = `<div class="insp">
    <div class="ih"><b>${esc(it.id)}</b> <span>${esc(t.name)}</span><button class="x" id="deselect" title="סגור">✕</button></div>
    <div class="acts"><button id="dup">⧉ שכפול</button><button id="rot">↻ לקיר הבא</button><button id="del" class="danger">🗑 מחיקה</button></div>
    <label class="f"><span>שם / תווית</span><input type="text" data-k="label" value="${esc(it.label || '')}" placeholder="${esc(it.id)}"></label>
    <label class="f"><span>סוג</span><select id="typeSel">${group.map(([k, v]) => `<option value="${k}" ${k === it.type ? 'selected' : ''}>${v.name}</option>`).join('')}</select></label>
    <label class="f"><span>קיר</span><select id="wallSel">${WALL_IDS.map(w => `<option value="${w}" ${w === it.wall ? 'selected' : ''}>${st.walls[w].name}</option>`).join('')}</select></label>
    <div class="f"><span>מיקום מתחילת הקיר (משמאל)</span><div class="nudge"><button data-n="-5">−5</button><button data-n="-1">−1</button><input type="number" data-k="s" value="${Math.round(it.s * 10) / 10}" step="0.5"><button data-n="1">+1</button><button data-n="5">+5</button></div></div>
    <div class="f"><span>רוחב (ס״מ)</span>${widthChips(it)}<input type="number" data-k="w" value="${it.w}" step="0.5" min="1"></div>
    <div class="row3">${fieldN('d', 'עומק', id_(it))}${fieldN('h', 'גובה', ih(it))}${fieldN('z', 'מהרצפה', iz(it))}</div>
    <label class="f"><span>אזור כשרות / שימוש</span><select data-k="zone">${zoneOpts}</select></label>
    ${extra}
    ${['window', 'top'].includes(t.layer) || it.type === 'fridge' ? '' : `<div class="f"><span>צבע חזית</span>
      <label class="chk"><input type="checkbox" id="usePal" ${it.color ? '' : 'checked'}> לפי הצבע הכללי</label>
      <div class="sw">${swatches.map(c => `<button data-c="${c}" style="background:${c}" class="${it.color === c ? 'on' : ''}"></button>`).join('')}<input type="color" id="colorPick" value="${colorOf(it, st).startsWith('#') ? colorOf(it, st) : '#ffffff'}"></div></div>`}
    <label class="f"><span>הערה</span><textarea data-k="note" rows="2">${esc(it.note || '')}</textarea></label>
  </div>`;
  bindInspector(it);
}
function bindInspector(it) {
  const box = $('#inspector');
  const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  $$('[data-k]', box).forEach(inp => inp.addEventListener('change', () => {
    const k = inp.dataset.k; let v = inp.value;
    if (['s', 'w', 'd', 'h', 'z'].includes(k)) { v = num(v); if (v == null) return; if (k === 'w' && v < 1) v = 1; }
    commit(() => { const o = byId(it.id); if (k === 'zone' && v === 'shared') delete o.zone; else if (v === '' && ['label', 'note'].includes(k)) delete o[k]; else o[k] = v; });
  }));
  $$('.chips button', box).forEach(b => b.addEventListener('click', () => commit(() => { byId(it.id).w = +b.dataset.w; })));
  $$('.nudge button', box).forEach(b => b.addEventListener('click', () => commit(() => { const o = byId(it.id); o.s = Math.round((o.s + +b.dataset.n) * 10) / 10; })));
  $('#typeSel', box).addEventListener('change', (e) => commit(() => {
    const o = byId(it.id); const nt = TYPES[e.target.value];
    o.type = e.target.value;
    for (const k of ['d', 'h', 'z']) delete o[k];
    if (o.type === 'tall_oven' && !o.stack) o.stack = { ovens: 2, mw: true, zones: ['dairy', 'meat'] };
    if (nt.widths && !nt.widths.includes(o.w)) o.w = nt.w;
  }));
  $('#wallSel', box).addEventListener('change', (e) => commit(() => { const o = byId(it.id); const w = e.target.value; const s = findFree(o, w, o.s); o.wall = w; o.s = s ?? 0; }));
  $('#dup', box).addEventListener('click', () => commit(() => {
    const o = clone(byId(it.id)); o.id = nextId(o);
    const s = findFree(o, o.wall, o.s + o.w); o.s = s ?? o.s + o.w;
    st.items.push(o); sel = o.id;
  }));
  $('#rot', box).addEventListener('click', () => commit(() => {
    const o = byId(it.id); const L = layer(o);
    let order = WALL_IDS.filter(w => !(w === 'P' && ['upper', 'window'].includes(L)));
    const w = order[(order.indexOf(o.wall) + 1) % order.length];
    const s = findFree(o, w, o.s); o.wall = w; o.s = s ?? 0;
  }));
  $('#del', box).addEventListener('click', () => commit(() => { st.items = st.items.filter(o => o.id !== it.id); sel = null; }));
  $('#deselect', box).addEventListener('click', () => { sel = null; render(); });
  $$('[data-stack]', box).forEach(inp => inp.addEventListener('change', () => commit(() => {
    const o = byId(it.id); o.stack = o.stack || { ovens: 2, mw: true, zones: ['dairy', 'meat'] };
    if (inp.dataset.stack === 'ovens') o.stack.ovens = +inp.value; else o.stack.mw = inp.checked;
  })));
  $$('[data-ozone]', box).forEach(inp => inp.addEventListener('change', () => commit(() => { const o = byId(it.id); o.stack.zones = o.stack.zones || []; o.stack.zones[+inp.dataset.ozone] = inp.value; })));
  const up = $('#usePal', box);
  if (up) {
    up.addEventListener('change', () => commit(() => { const o = byId(it.id); if (up.checked) delete o.color; else o.color = $('#colorPick', box).value; }));
    $$('.sw button', box).forEach(b => b.addEventListener('click', () => commit(() => { byId(it.id).color = b.dataset.c; })));
    $('#colorPick', box).addEventListener('change', (e) => commit(() => { byId(it.id).color = e.target.value; }));
  }
}
function roomPanel() {
  const p = pal(st);
  return `<div class="insp">
    <div class="ih"><b>המטבח כולו</b><span>בחר פריט כדי לערוך אותו</span></div>
    <div class="f"><span>צבע חזיתות</span><div class="pals">${PALS.map(x => { const c = x.id === 'custom' ? st.custom : x; return `<button data-pal="${x.id}" class="${st.pal === x.id ? 'on' : ''}"><i style="background:linear-gradient(${c.upper} 0 45%, ${c.base} 45% 100%)"></i>${x.name}</button>`; }).join('')}</div></div>
    ${st.pal === 'custom' ? `<div class="row3">${['base', 'upper', 'tall'].map(k => `<label class="f"><span>${{ base: 'תחתונים', upper: 'עליונים', tall: 'גבוהים' }[k]}</span><input type="color" data-cust="${k}" value="${st.custom[k]}"></label>`).join('')}</div>` : ''}
    <div class="f"><span>משטח</span><div class="pals">${TOPS.map(x => `<button data-top="${x.id}" class="${st.top === x.id ? 'on' : ''}"><i style="background:${x.color}"></i>${x.name}</button>`).join('')}</div></div>
    <div class="sub"><b>מידות החדר</b>
      <div class="row3">${WALL_IDS.map(w => `<label class="f"><span>${st.walls[w].name}</span><input type="number" data-wlen="${w}" value="${st.walls[w].len}"></label>`).join('')}</div>
      <div class="row3"><label class="f"><span>הרחקה מקיר המקרר</span><input type="number" data-room="offA" value="${st.walls.A.off}"></label>
      <label class="f"><span>בליטת בר</span><input type="number" data-room="overhang" value="${st.walls.P.overhang}"></label>
      <label class="f"><span>כיסאות בר</span><input type="number" data-room="stools" value="${st.walls.P.stools}" min="0" max="6"></label>
      <label class="f"><span>גובה תקרה</span><input type="number" data-room="H" value="${st.room.H}"></label></div>
      <p class="hint">שינוי אורך קיר משנה את מגבלת הארונות ואת הבדיקות. השרטוט של הקירות עצמם נשאר לפי התוכנית של מירי.</p>
    </div>
    <div class="sub legend"><b>מקרא אזורים</b><div>${Object.values(ZONES).map(z => `<span><i style="background:${z.color}"></i>${z.name}</span>`).join('')}</div></div>
    <div class="sub help"><b>איך משתמשים</b><ul>
      <li>גוררים ארון בתוכנית או בחזית כדי להזיז אותו. הוא נצמד לקירות ולארונות השכנים.</li>
      <li>גוררים לקיר אחר כדי להעביר אותו לשם.</li>
      <li>לוחצים על ארון כדי לשנות סוג (מגירות↔דלתות), רוחב, צבע ואזור בשרי/חלבי.</li>
      <li>"עליונים" בסרגל התוכנית – כדי לגרור ארונות עליונים.</li>
      <li>הכול נשמר אוטומטית בדפדפן. ↶ ביטול, ↷ חזרה.</li></ul></div>
  </div>`;
}
function bindRoom() {
  const box = $('#inspector');
  $$('[data-pal]', box).forEach(b => b.addEventListener('click', () => commit(() => { st.pal = b.dataset.pal; })));
  $$('[data-top]', box).forEach(b => b.addEventListener('click', () => commit(() => { st.top = b.dataset.top; })));
  $$('[data-cust]', box).forEach(i => i.addEventListener('change', () => commit(() => { st.custom[i.dataset.cust] = i.value; })));
  $$('[data-wlen]', box).forEach(i => i.addEventListener('change', () => commit(() => { const v = +i.value; if (v > 30) st.walls[i.dataset.wlen].len = v; })));
  $$('[data-room]', box).forEach(i => i.addEventListener('change', () => commit(() => {
    const v = +i.value; const k = i.dataset.room;
    if (k === 'offA') st.walls.A.off = Math.max(0, v); else if (k === 'overhang') st.walls.P.overhang = Math.max(0, v); else if (k === 'stools') st.walls.P.stools = Math.max(0, Math.min(6, Math.round(v))); else if (k === 'H' && v > 200) st.room.H = v;
  })));
}

function renderCatalog() {
  $('#catalog').innerHTML = `<div class="cath"><b>הוספת פריט</b><button class="x mobile-only" id="catClose">✕</button></div>
  <label class="f"><span>להוסיף אל</span><select id="addWall">${WALL_IDS.map(w => `<option value="${w}" ${st.ui.addWall === w ? 'selected' : ''}>${st.walls[w].name}</option>`).join('')}</select></label>
  ${CATALOG.map(g => `<div class="catg"><h4>${g.title}</h4><div class="catitems">${g.items.map(k => `<button data-add="${k}"><i class="ico ico-${TYPES[k].layer}"></i>${TYPES[k].name}<small>${TYPES[k].w} ס״מ</small></button>`).join('')}</div></div>`).join('')}
  <p class="hint">אחרי ההוספה אפשר לשנות רוחב (30–120 או כל מידה), סוג וצבע בחלונית העריכה.</p>`;
  $('#addWall').addEventListener('change', (e) => { st.ui.addWall = e.target.value; save(); });
  $('#catClose')?.addEventListener('click', () => document.body.classList.remove('cat-open'));
  $$('[data-add]').forEach(b => b.addEventListener('click', () => addItem(b.dataset.add)));
}
function addItem(type) {
  const t = TYPES[type];
  let wall = st.ui.addWall;
  if (type === 'window' && wall === 'P') wall = 'C';
  if (t.layer === 'upper' && wall === 'P') wall = 'A';
  const it = { id: '', type, wall, s: 0, w: t.w };
  if (type === 'tall_oven') it.stack = { ovens: 2, mw: true, zones: ['dairy', 'meat'] };
  if (type === 'sink') it.variant = 'double';
  it.id = nextId(it);
  const s = findFree(it, wall);
  it.s = s ?? 0;
  commit(() => { st.items.push(it); sel = it.id; });
  document.body.classList.remove('cat-open');
  flash(s == null ? `נוסף ${it.id} – אין מקום פנוי, הזז אותו` : `נוסף ${it.id}`);
}

// ===== רשימות =====
function renderList() {
  const b = bom(st), p = points(st);
  const s = b.summary;
  const W = (w) => ({ A: 'המקרר', B: 'הכיריים', C: 'החלון', P: 'חצי האי' }[w]);
  $('#listBox').innerHTML = `
  <div class="cards">
    <div><b>${s.base}</b><span>ס״מ ארונות תחתונים</span></div>
    <div><b>${s.upper}</b><span>ס״מ ארונות עליונים</span></div>
    <div><b>${s.tall}</b><span>ארונות גבוהים</span></div>
    <div><b>${Math.round(s.ctLen)}</b><span>ס״מ משטח (${s.ctArea.toFixed(2)} מ״ר)</span></div>
    <div><b>${s.frontArea.toFixed(1)}</b><span>מ״ר חזיתות (הערכה)</span></div>
    <div><b>${pal(st).name}</b><span>חזיתות · ${topOf(st).name}</span></div>
  </div>
  <h3>רשימת ארונות</h3>
  <div class="tw"><table><thead><tr><th>מס׳</th><th>קיר</th><th>סוג</th><th>ר×ג×ע</th><th>חזיתות</th><th>אזור</th><th>הערות</th></tr></thead><tbody>
  ${b.cab.map(r => `<tr data-id="${r.id}"><td>${esc(r.id)}</td><td>${W(r.wall)}</td><td>${esc(r.type)}</td><td class="num">${r.dims}</td><td>${esc(r.fronts)}</td><td>${esc(r.zone)}</td><td>${esc([r.label, r.note].filter(Boolean).join(' · '))}</td></tr>`).join('')}
  </tbody></table></div>
  <h3>מכשירים וכלים</h3>
  <div class="tw"><table><thead><tr><th>מס׳</th><th>קיר</th><th>מה</th><th>מידה</th><th>אזור</th><th>הערה</th></tr></thead><tbody>
  ${b.appl.map(r => `<tr data-id="${r.id.split('-')[0]}"><td>${esc(r.id)}</td><td>${W(r.wall)}</td><td>${esc(r.type)}${r.fronts ? ' – ' + esc(r.fronts) : ''}</td><td class="num">${r.dims}</td><td>${esc(r.zone)}</td><td>${esc([r.label, r.note].filter(Boolean).join(' · '))}</td></tr>`).join('')}
  </tbody></table></div>
  <h3>נקודות חשמל, מים ותאורה <small>(נוצר אוטומטית – לאשר מול חשמלאי/אינסטלטור)</small></h3>
  <div class="tw"><table><thead><tr><th>מס׳</th><th>סוג</th><th>מה</th><th>קיר</th><th>ס״מ מתחילת הקיר</th><th>גובה</th><th>הערה</th></tr></thead><tbody>
  ${p.map(r => `<tr><td><i class="dot" style="background:${PT_COLOR[r.kind]}"></i>${r.id}</td><td>${PT_KIND[r.kind]}</td><td>${esc(r.what)}</td><td>${W(r.wall)}</td><td class="num">${r.s ?? '—'}</td><td class="num">${r.z}</td><td>${esc(r.note)}</td></tr>`).join('')}
  </tbody></table></div>`;
  $$('#listBox tr[data-id]').forEach(tr => tr.addEventListener('click', () => { if (byId(tr.dataset.id)) { sel = tr.dataset.id; render(); } }));
}

// ===== 3D =====
let v3 = null, dirty3d = true, loading3d = null;
async function ensure3D() {
  if (v3) return v3;
  if (!loading3d) loading3d = import('./view3d.js').then(m => {
    v3 = m.create3D($('#threeBox'), { onSelect: (id) => { sel = id; render(); } });
    if (st.ui.quality) v3.setQuality(st.ui.quality);
    v3.setMode(st.ui.mode3d);
    v3.setLabels(st.ui.labels3d);
    v3.update(st, sel); v3.preset('iso');
    window.__v3 = v3;
    sync3dUI();
    return v3;
  }).catch(e => { $('#threeBox').innerHTML = `<p class="err3d">התצוגה התלת-ממדית לא נטענה במכשיר הזה (${esc(e.message)})</p>`; console.error(e); });
  return loading3d;
}
async function render3D() {
  const v = await ensure3D(); if (!v) return;
  v.update(st, sel); dirty3d = false;
}
function sync3dUI() {
  $$('#mode3d button').forEach(b => b.classList.toggle('on', b.dataset.v === st.ui.mode3d));
  $$('#qual3d button').forEach(b => b.classList.toggle('on', b.dataset.v === (v3 ? v3.quality : st.ui.quality)));
  $('#lab3d').checked = st.ui.labels3d;
}

// ===== גרירה =====
function svgPt(svg, e) { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
function snapS(it, wall, s) {
  const tol = matchMedia('(pointer: coarse)').matches ? 8 : 5;
  const raw = Math.round(s * 2) / 2;
  const cands = [];
  for (const e of edgesFor(it, wall)) cands.push(e, e - it.w);
  // 1) הצמדה לקצה קרוב שבו אין חפיפה
  let best = null, bd = tol;
  for (const c of cands) { const d = Math.abs(c - s); if (d < bd && fits(it, wall, c)) { bd = d; best = c; } }
  if (best != null) return best;
  // 2) אם המיקום החופשי פנוי – נשארים בו
  if (fits(it, wall, raw)) return raw;
  // 3) דוחפים למקום הפנוי הקרוב (עד חצי רוחב)
  bd = Math.max(20, it.w / 2);
  for (const c of cands) { const d = Math.abs(c - s); if (d < bd && fits(it, wall, c)) { bd = d; best = c; } }
  if (best != null) return best;
  // 4) אחרת – הצמדה רגילה (ותוצג אזהרת חפיפה)
  bd = tol;
  for (const c of cands) { const d = Math.abs(c - s); if (d < bd) { bd = d; best = c; } }
  return best ?? raw;
}
function pickWall(it, x, y, cur) {
  let best = cur, bd = Infinity, curD = Infinity;
  const L = layer(it);
  for (const w of WALL_IDS) {
    if (w === 'P' && ['upper', 'window'].includes(L)) continue;
    if (it.type === 'window' && w !== 'C' && w !== 'B' && w !== 'A') continue;
    const [s, t] = inv(w, st, x, y);
    const len = st.walls[w].len;
    if (s < -40 || s > len + 40) continue;
    const mid = (st.walls[w].off || 0) + (L === 'window' ? 0 : id_(it) / 2);
    const d = Math.abs(t - mid);
    if (w === cur) curD = d;
    if (d < bd) { bd = d; best = w; }
  }
  return curD < bd + 25 ? cur : best;
}
function bindDrag(container, kind) {
  let dg = null;
  container.addEventListener('pointerdown', (e) => {
    const g = e.target.closest('g.it');
    if (!g || g.classList.contains('inactive')) {
      if (!e.target.closest('g.it') && e.button === 0) { dg = { bg: true, x: e.clientX, y: e.clientY }; }
      return;
    }
    const svg = g.ownerSVGElement; const it = byId(g.dataset.id); if (!it) return;
    const p = svgPt(svg, e);
    const sNow = kind === 'plan' ? inv(it.wall, st, p.x, p.y)[0] : p.x;
    dg = { id: it.id, x: e.clientX, y: e.clientY, grab: sNow - it.s, moved: false, wall: it.wall, origS: it.s, pushed: false, elevWall: svg.dataset.wall, riders: riders(it) };
    if (sel !== it.id) { sel = it.id; renderPlan(); renderElev(); renderInspector(); document.body.classList.add('has-sel'); if (v3) v3.select(sel); }
    container.setPointerCapture(e.pointerId);
    e.preventDefault();
  });
  container.addEventListener('pointermove', (e) => {
    if (!dg || dg.bg) return;
    if (!dg.moved && Math.hypot(e.clientX - dg.x, e.clientY - dg.y) < 5) return;
    dg.moved = true;
    if (!dg.pushed) { snap(); dg.pushed = true; }
    const it = byId(dg.id);
    const svg = container.querySelector(kind === 'plan' ? 'svg' : `svg[data-wall="${dg.elevWall}"]`);
    if (!svg) return;
    const p = svgPt(svg, e);
    let wall = it.wall, s;
    if (kind === 'plan') {
      wall = pickWall(it, p.x, p.y, it.wall);
      const sw = inv(wall, st, p.x, p.y)[0];
      s = sw - (wall === dg.wall ? dg.grab : it.w / 2);
    } else s = p.x - dg.grab;
    s = snapS(it, wall, s);
    if (it.s !== s || it.wall !== wall) {
      it.s = s; it.wall = wall;
      moveRiders(it, dg.riders);
      if (kind === 'plan') renderPlan(); else renderElev();
      const live = $('#dragInfo'); live.textContent = `${it.id}: ${st.walls[wall].name}, ${Math.round(s * 10) / 10} ס״מ מתחילת הקיר`; live.classList.add('on');
    }
  });
  const end = (e) => {
    if (dg && dg.bg) { if (Math.hypot(e.clientX - dg.x, e.clientY - dg.y) < 5 && sel) { sel = null; render(); } dg = null; return; }
    if (!dg) return;
    const moved = dg.moved; const d0 = dg; dg = null;
    if (moved) trySwap(d0);
    $('#dragInfo').classList.remove('on');
    if (moved) { render(); save(); } else renderWarnings();
  };
  container.addEventListener('pointerup', end);
  container.addEventListener('pointercancel', end);
}

// פריטי משטח (כיור, כיריים) זזים יחד עם הארון שמתחתיהם
function riders(it) {
  if (layer(it) !== 'base') return [];
  return st.items.filter(t => layer(t) === 'top' && t.wall === it.wall && t.s >= it.s - 0.5 && t.s + t.w <= it.s + it.w + 0.5).map(t => ({ id: t.id, rel: t.s - it.s }));
}
function moveRiders(it, rs) { for (const r of rs) { const t = byId(r.id); if (t) { t.wall = it.wall; t.s = it.s + r.rel; } } }
// גרירה על ארון שכן באותו קיר = החלפת מקומות
function trySwap(d) {
  const it = byId(d.id); if (!it || it.wall !== d.wall) return;
  const ov = st.items.filter(o => o.id !== it.id && o.wall === it.wall && stackOverlap(o, it) && Math.min(o.s + o.w, it.s + it.w) - Math.max(o.s, it.s) > 0.5);
  if (ov.length !== 1) return;
  const o = ov[0];
  const amount = Math.min(o.s + o.w, it.s + it.w) - Math.max(o.s, it.s);
  if (amount < Math.min(o.w, it.w) * 0.4) return;
  const oRiders = riders(o);
  const save = [it.s, o.s];
  const pp = d.origS, q = o.s;
  if (pp < q) { const g = Math.max(0, q - (pp + it.w)); o.s = pp; it.s = pp + o.w + g; }
  else { const g = Math.max(0, pp - (q + o.w)); it.s = q; o.s = q + it.w + g; }
  if (!fits(it, it.wall, it.s) || !fits(o, o.wall, o.s)) { it.s = save[0]; o.s = save[1]; return; }
  moveRiders(it, d.riders); moveRiders(o, oRiders);
  flash(`${it.id} ↔ ${o.id} הוחלפו`);
}

// ===== ייצוא/ייבוא/הדפסה =====
function exportJSON() {
  const blob = new Blob([JSON.stringify({ app: 'kitchen-planner', ...JSON.parse(core()) }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `kitchen-plan-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function importJSON(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.items) || !d.walls) throw new Error('קובץ לא תקין');
      commit(() => { st.items = d.items; st.walls = d.walls; st.room = { ...ROOM0, ...(d.room || {}) }; st.pal = d.pal || st.pal; st.top = d.top || st.top; if (d.custom) st.custom = d.custom; sel = null; });
      flash('התכנון נטען');
    } catch (e) { alert('לא הצלחתי לקרוא את הקובץ: ' + e.message); }
  };
  r.readAsText(file);
}
function buildPrint() {
  const b = $('#printBox');
  const old = st.ui.tab;
  renderList();
  b.innerHTML = `<h1>המטבח של משפחת עובדיה – תכנון (אופציה ב׳)</h1><p>${new Date().toLocaleDateString('he-IL')} · חזיתות: ${pal(st).name} · משטח: ${topOf(st).name}</p>
    <div class="pplan">${planSVG({ ...st, ui: { ...st.ui, planLayer: 'low' } }, null)}</div>
    ${WALL_IDS.map(w => `<div class="pel">${elevSVG(st, w, null, { points: true })}</div>`).join('')}
    <div class="plist">${$('#listBox').innerHTML}</div>
    <div class="pwarn">${$('#warnings').innerHTML}</div>`;
}

// ===== אתחול =====
function init() {
  $('#pal').innerHTML = PALS.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  $('#top').innerHTML = TOPS.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  $('#pal').addEventListener('change', (e) => commit(() => { st.pal = e.target.value; }));
  $('#top').addEventListener('change', (e) => commit(() => { st.top = e.target.value; }));
  $('#undo').addEventListener('click', doUndo); $('#redo').addEventListener('click', doRedo);
  addEventListener('keydown', (e) => {
    if (e.target.closest('input,textarea,select')) return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); doRedo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sel && st.ui.tab !== '3d') { const id = sel; commit(() => { st.items = st.items.filter(o => o.id !== id); sel = null; }); }
    else if (e.key === 'Escape') { sel = null; render(); }
    else if (sel && st.ui.tab !== '3d' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); const d = (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 5 : 1); commit(() => { const o = byId(sel); o.s += d; }); }
  });
  $$('.tabs button').forEach(b => b.addEventListener('click', () => { st.ui.tab = b.dataset.tab; save(); render(); scrollTo({ top: 0 }); }));
  $$('#planLayer button').forEach(b => b.addEventListener('click', () => { st.ui.planLayer = b.dataset.v; save(); render(); }));
  $$('#elevWall button').forEach(b => b.addEventListener('click', () => { st.ui.elevWall = b.dataset.v; save(); render(); }));
  $('#zonesT').addEventListener('change', (e) => { st.ui.zones = e.target.checked; save(); render(); });
  $('#ptsT').addEventListener('change', (e) => { st.ui.points = e.target.checked; save(); render(); });
  $('#menuBtn').addEventListener('click', (e) => { e.stopPropagation(); $('#menu').classList.toggle('open'); });
  document.addEventListener('click', () => $('#menu').classList.remove('open'));
  $('#mExport').addEventListener('click', exportJSON);
  $('#mImport').addEventListener('click', () => $('#importFile').click());
  $('#importFile').addEventListener('change', (e) => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ''; });
  $('#mReset').addEventListener('click', () => { if (confirm('לחזור לתכנון המקורי (אופציה ב׳)? אפשר לבטל עם ↶')) commit(() => { const f = fresh(); Object.assign(st, { ...f, ui: st.ui }); sel = null; }); });
  $('#mPrint').addEventListener('click', () => { buildPrint(); setTimeout(() => print(), 50); });
  $('#printBtn').addEventListener('click', () => { buildPrint(); setTimeout(() => print(), 50); });
  addEventListener('beforeprint', buildPrint);
  $('#fabAdd').addEventListener('click', () => document.body.classList.add('cat-open'));
  $('#warnings').addEventListener('click', (e) => { const li = e.target.closest('li[data-ids]'); if (li && li.dataset.ids) { sel = li.dataset.ids.split(',')[0]; render(); } });
  // 3D
  $$('#mode3d button').forEach(b => b.addEventListener('click', async () => { st.ui.mode3d = b.dataset.v; save(); const v = await ensure3D(); v?.setMode(st.ui.mode3d); sync3dUI(); }));
  $$('#qual3d button').forEach(b => b.addEventListener('click', async () => { st.ui.quality = b.dataset.v; save(); const v = await ensure3D(); v?.setQuality(b.dataset.v); sync3dUI(); }));
  $$('#cam3d button').forEach(b => b.addEventListener('click', async () => { const v = await ensure3D(); v?.preset(b.dataset.v); document.body.classList.toggle('walking', b.dataset.v === 'eye'); }));
  $('#lab3d').addEventListener('change', async (e) => { st.ui.labels3d = e.target.checked; save(); const v = await ensure3D(); v?.setLabels(e.target.checked); });
  $('#shot3d').addEventListener('click', async () => { const v = await ensure3D(); v?.snapshot(`kitchen-${st.ui.mode3d}.png`); });
  $$('#walkPad button').forEach(b => {
    const h = JSON.parse(b.dataset.h);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); v3?.setHold(h); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => b.addEventListener(ev, () => v3?.setHold(null)));
  });
  bindDrag($('#planBox'), 'plan');
  bindDrag($('#elevBox'), 'elev');
  renderCatalog();
  render();
  window.__app = { get st() { return st; }, render, select: (id) => { sel = id; render(); } };
}
init();
