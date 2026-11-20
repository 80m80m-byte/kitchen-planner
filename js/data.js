// נתוני בסיס: אופציה ב׳ מתוכנית מירי אזולאי. יחידות: ס"מ.
// מערכת צירים בתוכנית: x ימינה (0 = צד הכניסה/חצי האי), y למטה (0 = קיר המקרר).
export const PL = 10, BT = 87, CT = 90;

export const ROOM0 = { W: 363, D: 360, H: 266, Pend: 374, Px: 30 };

export const WALLS0 = {
  A: { name: 'קיר המקרר', len: 363, off: 10 },
  B: { name: 'קיר הכיריים', len: 360, off: 0 },
  C: { name: 'קיר החלון', len: 363, off: 0 },
  P: { name: 'חצי האי', len: 204, off: 0, overhang: 30, stools: 4 },
};
export const WALL_IDS = ['A', 'B', 'C', 'P'];
export const WALL_VIEW = {
  A: 'מבט אל קיר המקרר. שמאל = צד הכניסה, ימין = פינה מול קיר הכיריים',
  B: 'מבט אל קיר הכיריים. שמאל = פינת קיר המקרר, ימין = פינת קיר החלון',
  C: 'מבט אל קיר החלון. שמאל = פינת קיר הכיריים, ימין = צד חצי האי',
  P: 'מבט אל חצי האי מתוך המטבח. שמאל = הקצה שליד קיר החלון, ימין = הקצה שפונה למעבר',
};

export const ZONES = {
  shared: { name: 'משותף', color: '#9aa0a6' },
  meat: { name: 'בשרי', color: '#d9534f' },
  dairy: { name: 'חלבי', color: '#3b82f6' },
  split: { name: 'מחולק', color: '#8b5cf6' },
  water: { name: 'בר מים', color: '#14b8a6' },
  shabbat: { name: 'פינת שבת', color: '#f59e0b' },
};

export const PALS = [
  { id: 'white', name: 'לבן מט', base: '#F0EFEA', upper: '#F0EFEA', tall: '#F0EFEA', finish: 'matte' },
  { id: 'cream', name: 'שמנת וגרז׳', base: '#C9BFAE', upper: '#EDE6D8', tall: '#EDE6D8', finish: 'matte' },
  { id: 'stone', name: 'אפור אבן', base: '#8E8A83', upper: '#DAD7D1', tall: '#8E8A83', finish: 'matte' },
  { id: 'olive', name: 'ירוק זית', base: '#646E4E', upper: '#EEECE6', tall: '#646E4E', finish: 'matte' },
  { id: 'navy', name: 'כחול נייבי', base: '#24314A', upper: '#EFEEEA', tall: '#24314A', finish: 'matte' },
  { id: 'oak', name: 'אלון ולבן', base: '#B08656', upper: '#F1F0EB', tall: '#B08656', finish: 'oak' },
  { id: 'custom', name: 'צבעים שלי', base: '#7A8B7E', upper: '#F2F1EC', tall: '#7A8B7E', finish: 'matte' },
];
export const TOPS = [
  { id: 'quartz', name: 'קוורץ לבן', color: '#ECEBE7', kind: 'quartz' },
  { id: 'concrete', name: 'בטון', color: '#A09D97', kind: 'concrete' },
  { id: 'calacatta', name: 'שיש קלקטה', color: '#F4F1EA', kind: 'marble' },
];

export const STD_W = [30, 35, 40, 45, 50, 60, 70, 75, 80, 90, 100, 105, 120];

// group: קבוצה שבתוכה אפשר להחליף סוג. layer: base|blind|tall|upper|top|window
export const TYPES = {
  base_door: { name: 'בסיס – דלתות', group: 'base', layer: 'base', w: 60, d: 60, z: 0, h: 90, pre: 'B' },
  base_dr2: { name: 'בסיס – 2 מגירות', group: 'base', layer: 'base', w: 80, d: 60, z: 0, h: 90, pre: 'B' },
  base_dr3: { name: 'בסיס – 3 מגירות', group: 'base', layer: 'base', w: 60, d: 60, z: 0, h: 90, pre: 'B' },
  base_dr4: { name: 'בסיס – 4 מגירות', group: 'base', layer: 'base', w: 60, d: 60, z: 0, h: 90, pre: 'B' },
  base_sink: { name: 'ארון כיור', group: 'base', layer: 'base', w: 90, d: 60, z: 0, h: 90, pre: 'B' },
  base_corner: { name: 'בסיס פינה (מנגנון)', group: 'base', layer: 'base', w: 45, d: 60, z: 0, h: 90, pre: 'B' },
  base_pullout: { name: 'שולפן צר', group: 'base', layer: 'base', w: 30, d: 60, z: 0, h: 90, pre: 'B' },
  base_blind: { name: 'פינה עיוורת / מילוי', group: 'base', layer: 'blind', w: 60, d: 60, z: 0, h: 90, pre: 'X' },
  dw: { name: 'מדיח כלים', group: 'base', layer: 'base', w: 60, d: 60, z: 0, h: 90, appl: true, widths: [45, 60], pre: 'D' },
  base_oven: { name: 'תנור מתחת למשטח', group: 'base', layer: 'base', w: 60, d: 60, z: 0, h: 90, appl: true, pre: 'O' },
  upper_door: { name: 'עליון – דלתות', group: 'upper', layer: 'upper', w: 60, d: 35, z: 150, h: 116, pre: 'U' },
  upper_lift: { name: 'עליון – קלפה', group: 'upper', layer: 'upper', w: 80, d: 35, z: 150, h: 116, pre: 'U' },
  upper_open: { name: 'מדפים פתוחים', group: 'upper', layer: 'upper', w: 60, d: 30, z: 150, h: 116, pre: 'U' },
  upper_blind: { name: 'עליון פינה עיוור', group: 'upper', layer: 'upper', w: 35, d: 35, z: 150, h: 116, blind: true, pre: 'X' },
  upper_hood: { name: 'מנדף + ארון מעליו', group: 'upper', layer: 'upper', w: 80, d: 35, z: 155, h: 111, appl: true, pre: 'H' },
  upper_over: { name: 'ארון מעל מקרר', group: 'upper', layer: 'upper', w: 96, d: 60, z: 195, h: 71, pre: 'U' },
  tall_oven: { name: 'עמודת תנורים', group: 'tall', layer: 'tall', w: 60, d: 60, z: 0, h: 266, appl: true, pre: 'T' },
  tall_pantry: { name: 'מזווה גבוה', group: 'tall', layer: 'tall', w: 60, d: 60, z: 0, h: 266, pre: 'T' },
  tall_storage: { name: 'ארון גבוה', group: 'tall', layer: 'tall', w: 60, d: 60, z: 0, h: 266, pre: 'T' },
  fridge: { name: 'מקרר', group: 'tall', layer: 'tall', w: 91, d: 66, z: 0, h: 186, appl: true, widths: [60, 70, 84, 91], pre: 'F' },
  panel: { name: 'פנל צד', group: 'tall', layer: 'tall', w: 2, d: 60, z: 0, h: 266, pre: 'X' },
  cooktop: { name: 'כיריים אינדוקציה', group: 'top', layer: 'top', w: 80, d: 52, z: 90, h: 1, appl: true, widths: [60, 80, 90], pre: 'K' },
  sink: { name: 'כיור', group: 'top', layer: 'top', w: 80, d: 45, z: 90, h: 1, appl: true, pre: 'S' },
  water: { name: 'ברז בר מים', group: 'top', layer: 'top', w: 10, d: 10, z: 90, h: 28, appl: true, pre: 'W' },
  plata: { name: 'מקום לפלטה', group: 'top', layer: 'top', w: 56, d: 40, z: 90, h: 4, appl: true, pre: 'L' },
  urn: { name: 'מקום למיחם', group: 'top', layer: 'top', w: 22, d: 22, z: 90, h: 38, appl: true, pre: 'M' },
  window: { name: 'חלון', group: 'window', layer: 'window', w: 117, d: 0, z: 105, h: 120, pre: 'N' },
};

export const CATALOG = [
  { title: 'ארונות תחתונים', items: ['base_door', 'base_dr2', 'base_dr3', 'base_dr4', 'base_sink', 'base_corner', 'base_pullout', 'base_blind'] },
  { title: 'ארונות עליונים', items: ['upper_door', 'upper_lift', 'upper_open', 'upper_blind', 'upper_over'] },
  { title: 'ארונות גבוהים', items: ['tall_oven', 'tall_pantry', 'tall_storage', 'fridge', 'panel'] },
  { title: 'מכשירים ונקודות', items: ['cooktop', 'base_oven', 'dw', 'upper_hood', 'sink', 'water', 'plata', 'urn', 'window'] },
];

const I = (id, type, wall, s, w, extra = {}) => ({ id, type, wall, s, w, ...extra });

export function seedItems() {
  return [
    // קיר המקרר
    I('A1', 'tall_oven', 'A', 0, 60, { stack: { ovens: 2, mw: true, zones: ['dairy', 'meat'] }, note: 'תנור חלבי 10–70, תנור בשרי 70–130, מיקרוגל 130–175' }),
    I('A2', 'tall_pantry', 'A', 60, 60, { note: 'מזווה: 2 דלתות ומגירות פנימיות' }),
    I('X1', 'panel', 'A', 120, 2),
    I('F1', 'fridge', 'A', 122, 96, { h: 186, label: 'מקרר', note: 'נישה 96, מקרר עד 91' }),
    I('A3', 'upper_over', 'A', 122, 96, { note: 'ארון מעל המקרר' }),
    I('X2', 'panel', 'A', 218, 2),
    I('A4', 'base_door', 'A', 220, 38, { zone: 'water', note: 'מערכת בר המים' }),
    I('A5', 'base_corner', 'A', 258, 45, { zone: 'shabbat', note: 'פינת שבת מעל' }),
    I('X3', 'base_blind', 'A', 303, 60, { note: 'פינה עיוורת' }),
    I('UA1', 'upper_door', 'A', 220, 38, { zone: 'water', note: 'כוסות לבר המים' }),
    I('UA2', 'upper_door', 'A', 258, 70, { zone: 'shabbat', note: 'גימור עמיד לאדים מעל המיחם' }),
    I('X4', 'upper_blind', 'A', 328, 35),
    I('W1', 'water', 'A', 234, 10, { zone: 'water', label: 'בר מים' }),
    I('M1', 'urn', 'A', 268, 22, { zone: 'shabbat', label: 'מיחם' }),
    I('L1', 'plata', 'A', 300, 56, { zone: 'shabbat', label: 'פלטה' }),
    // קיר הכיריים
    I('X5', 'base_blind', 'B', 10, 60, { note: 'פינה (A5)' }),
    I('B1', 'base_dr3', 'B', 70, 75, { zone: 'dairy', note: 'סכו״ם וכלים חלביים' }),
    I('B2', 'base_dr2', 'B', 145, 80, { zone: 'dairy', note: 'סירים, מתחת לאינדוקציה' }),
    I('B3', 'base_pullout', 'B', 225, 30, { note: 'שמנים ותבלינים' }),
    I('B5', 'base_corner', 'B', 255, 45, { zone: 'dairy' }),
    I('X6', 'base_blind', 'B', 300, 60, { note: 'פינה עיוורת' }),
    I('X7', 'upper_blind', 'B', 10, 35),
    I('UB1', 'upper_door', 'B', 45, 100, { zone: 'dairy' }),
    I('UH', 'upper_hood', 'B', 145, 80, { label: 'מנדף 80' }),
    I('UB3', 'upper_door', 'B', 225, 100, { zone: 'dairy' }),
    I('X8', 'upper_blind', 'B', 325, 35),
    I('K1', 'cooktop', 'B', 145, 80, { label: 'אינדוקציה 80' }),
    // קיר החלון
    I('N1', 'window', 'C', 77, 117, { label: 'חלון', note: 'גובה החלון – הנחה' }),
    I('X9', 'base_blind', 'C', 0, 60, { note: 'פינה (B5)' }),
    I('C4', 'base_pullout', 'C', 60, 31, { note: 'מגבות וחומרי ניקוי' }),
    I('C3', 'base_sink', 'C', 91, 90, { zone: 'split', note: 'קערה חלבית ליד הכיריים, בשרית ליד חצי האי' }),
    I('C2', 'dw', 'C', 181, 60, { zone: 'meat', label: 'מדיח' }),
    I('C1', 'base_corner', 'C', 241, 32, { zone: 'meat' }),
    I('X10', 'base_blind', 'C', 273, 60, { note: 'פינה (חצי האי)' }),
    I('X11', 'base_blind', 'C', 333, 30, { note: 'קצה הבר' }),
    I('X12', 'upper_blind', 'C', 0, 35),
    I('UC2', 'upper_door', 'C', 35, 42, { zone: 'dairy' }),
    I('UC1', 'upper_door', 'C', 194, 79, { zone: 'meat' }),
    I('UC0', 'upper_door', 'C', 273, 60, { zone: 'meat' }),
    I('S1', 'sink', 'C', 96, 80, { zone: 'split', variant: 'double', label: 'כיור כפול' }),
    // חצי האי
    I('X13', 'base_blind', 'P', 0, 74, { note: 'פינה (C1)' }),
    I('P2', 'base_dr2', 'P', 74, 70, { zone: 'meat', note: 'סירים בשריים' }),
    I('P1', 'base_dr3', 'P', 144, 60, { zone: 'meat', note: 'סכו״ם בשרי' }),
  ];
}
