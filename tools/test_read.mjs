#!/usr/bin/env node
/*  test_read.mjs — סבב 55: מתג המעבר: מקור הקריאה.
 *
 *  ⚠️ ביומן הקריאה עברה לטבלאות כבר בסבבים 30–32; מה שהסבב הזה מוסיף הוא
 *     **נעילה** של הדפוס — כדי שלא ייסחף — ושליפה בעמודים.
 *  שלושה חלקים: טענות סטטיות על חמשת אתרי הקריאה · הרצת `tbRowsGet`
 *  האמיתית ברתמת `vm` (עמודים, נכשל-סגור) · מוטציות.
 *
 *  ⚠️ **טריגר להסרה (⏳ מבחן מעבר) — סבב 68, כלל ברזל 14:** זהו מבחן **מעבר** — מסלול הקריאה עבר לטבלאות.
 *  ⛔ הוא יורד בסבב שסוגר את מסלול ה-`kv`: כיבוי דגל הכתיבה ← מחיקת
 *  מפתחות ה-`kv` מהמסד ← ואז המבחן הזה ושורתו ב-`APP.testsOnly`.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

/* ── APP — הדבר היחיד שנבדל בין הריפו ──────────────────────────────────── */
const APP = {
  rowsGet: 'tbRowsGet',
  keys: ['tb_entries', 'tb_archive'],
  // ⛔ שני מפתחות × שלושה מסלולים (syncFromCloud · tbPullFromCloud ·
  //    _tbVerify) ועוד ספק החלון החם — ר' הטענה 1ב.
  minRowsGet: 5,
  legacyOff: /var TB_KV_LEGACY_WRITE = false;/,
  // המפתחות שביתם היחיד בענן הוא ה-kv — ⛔ ולכן אין להם שכבת שורות.
  kvOnly: ['tb_cats', 'tb_subs', 'tb_subs_meta'],
};
/* ── סוף APP ───────────────────────────────────────────────────────────── */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'index.html'), 'utf8');

let failed = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { failed++; console.error('  FAIL ' + m); };
const assert = (c, m) => (c ? ok(m) : bad(m));

console.log('— סבב 55 (יומן): מקור הקריאה —');

/* ── 1. הדפוס: טבלאות תחילה, ה-kv רק כנפילה-חזרה ───────────────────────── */
const calls = (SRC.match(new RegExp(APP.rowsGet + "\\('", 'g')) || []).length;
assert(calls >= APP.minRowsGet,
  `1א · ${APP.rowsGet} נקראת ב-${calls} אתרים (≥${APP.minRowsGet})`);

/* ⛔ כל קריאה ל-kv של מפתח שעבר חייבת להיות **מותנית** בכישלון השורות.
   הצורה: `_rowsX.ok ? … : <kv>` — כלומר ה-kv יושב בענף ה-else. */
const kvReads = [];
const reKv = /(await pull\('(tb_entries|tb_archive)'|select\("value"\)\.eq\("key","(tb_entries|tb_archive)"\))/g;
let m;
while ((m = reKv.exec(SRC))) {
  const line = SRC.slice(SRC.lastIndexOf('\n', m.index) + 1, SRC.indexOf('\n', m.index));
  kvReads.push(line.trim());
}
assert(kvReads.length > 0, '1ב · נמצאו קריאות ה-kv של המפתחות שעברו (' + kvReads.length + ')');
const guarded = kvReads.filter((l) => /_rows[EA]\.ok \?/.test(l));
assert(guarded.length === kvReads.length,
  '1ג · ⛔ כל קריאת kv מותנית בכישלון השורות — אין מסלול kv-תחילה');
assert(kvReads.length >= 4, '1ד · ⛔ והנפילה-חזרה נשמרה בכל אחד מהם (' + kvReads.length + ')');
assert(APP.legacyOff.test(SRC),
  '1ה · ⛔ הכתיבה הכפולה ל-kv נשארה כבויה — הטבלאות הן המאסטר');
for (const k of APP.kvOnly) {
  assert(new RegExp("pull\\('" + k + "'").test(SRC),
    '1ו · ' + k + ' נקרא מ-kv — ⚠️ זה ביתו היחיד בענן, ולא סטייה');
}

/* ── 2. הרצת tbRowsGet האמיתית — עמודים ונכשל-סגור ─────────────────────── */
function cut(name) {
  const re = new RegExp('\\n(async )?function ' + name + '\\s*\\(', 'g');
  const mm = re.exec(SRC);
  if (!mm) throw new Error('לא נמצאה ' + name);
  const start = mm.index + 1;
  let i = SRC.indexOf('{', mm.index + mm[0].length - 1), d = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') d++;
    else if (SRC[i] === '}') { d--; if (!d) return SRC.slice(start, i + 1); }
  }
  throw new Error('לא נסגרה ' + name);
}
function cutVar(decl) {
  const i = SRC.indexOf('\n' + decl);
  if (i < 0) throw new Error('לא נמצאה ההצהרה ' + decl);
  return SRC.slice(i + 1, SRC.indexOf('\n', i + 1));
}
function env(total, mode) {
  const st = { pages: [] };
  const client = {
    from() {
      const q = { rng: null, arch: null };
      const api = {
        select() { return api; },
        eq(c, v) { if (c === 'archived') q.arch = v; return api; },
        order() { return api; },
        range(a, b) {
          q.rng = [a, b];
          st.pages.push(a);
          if (mode === 'error' && st.pages.length === 2) return Promise.resolve({ data: null, error: { message: 'net' } });
          if (mode === 'errorFirst') return Promise.resolve({ data: null, error: { message: 'net' } });
          const rows = [];
          for (let i = a; i <= b && i < total; i++) {
            rows.push({ rec_key: String(1e6 + i), updated_at: 1, data: { id: String(1e6 + i), updatedAt: 1 } });
          }
          return Promise.resolve({ data: rows, error: null });
        },
      };
      return api;
    },
  };
  const sb = {
    console, JSON, Date, Math, String, Number, Array, Object, Boolean, isFinite, parseInt, Promise, RegExp, Error,
    YESHIVA: 'rishon', KV_TABLE: 'kv_rishon',
    getSB: () => client, withTimeout: (p) => p,
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const d of ['var TB_ROWS = true;', 'var TB_ARC_UNIFIED = true;',
                   'var TB_ROW_TABLES = ', 'var TB_ROWS_PAGE = ', 'var _tbRemote = ']) {
    vm.runInContext(cutVar(d), sb);
  }
  for (const n of ['entryKey', 'archiveKey', 'parseGregLike', 'gdateOrderTs', 'entryOrderTs',
                   'tbSortRows', 'tbTableOf', 'tbArchivedFlag', 'tbRowsGet']) {
    vm.runInContext(cut(n), sb, { filename: n + '.js' });
  }
  vm.runInContext(cutVar('var GREG_MONTHS_HE = '), sb);
  return { sb, st };
}

const PAGE = Number((cutVar('var TB_ROWS_PAGE = ').match(/\d+/) || [0])[0]);
assert(PAGE > 0, '2א · TB_ROWS_PAGE מוגדר (' + PAGE + ')');
{
  const e = env(PAGE + 250);
  const r = await e.sb.tbRowsGet('tb_entries');
  assert(r.ok && r.data.length === PAGE + 250,
    '2ב · ⛔ יותר מעמוד אחד — כל השורות חוזרות (' + (r.ok ? r.data.length : 'ok=false') + ')');
  assert(e.st.pages.length === 2, '2ג · ונמשכו בדיוק שני עמודים');
}
{
  const e = env(50);
  const r = await e.sb.tbRowsGet('tb_entries');
  assert(r.ok && r.data.length === 50 && e.st.pages.length === 1,
    '2ד · עמוד חלקי עוצר מיד — בלי בקשה מיותרת');
}
{
  const e = env(PAGE + 250, 'error');
  const r = await e.sb.tbRowsGet('tb_entries');
  assert(r.ok === false && r.data === null,
    '2ה · ⛔ עמוד שנכשל מחזיר «אין ראיה» ולא תמונה חלקית');
}
{
  const e = env(10, 'errorFirst');
  const r = await e.sb.tbRowsGet('tb_archive');
  assert(r.ok === false, '2ו · כשל בעמוד הראשון ⇒ נפילה-חזרה ל-kv');
}

/* ── 3. מוטציות ────────────────────────────────────────────────────────── */
console.log('— מוטציות —');
// ⚠️ המוטציות כאן סטטיות — הן מודדות את **הדפוס** שהטענות 1ג/1ה נועלות.
{
  const bad1 = SRC.replace("var cloudEntries = _rowsE.ok ? _rowsE.data : await pull('tb_entries', 'רשומות');",
                           "var cloudEntries = await pull('tb_entries', 'רשומות');");
  const lines = [];
  const re2 = /(await pull\('(tb_entries|tb_archive)'|select\("value"\)\.eq\("key","(tb_entries|tb_archive)"\))/g;
  let mm2;
  while ((mm2 = re2.exec(bad1))) {
    lines.push(bad1.slice(bad1.lastIndexOf('\n', mm2.index) + 1, bad1.indexOf('\n', mm2.index)).trim());
  }
  assert(lines.some((l) => !/_rows[EA]\.ok \?/.test(l)),
    'מוטציה: ⛔ קריאת kv בלתי-מותנית נתפסת ע"י טענה 1ג');
}
{
  const bad2 = SRC.replace('var TB_KV_LEGACY_WRITE = false;', 'var TB_KV_LEGACY_WRITE = true;');
  assert(!APP.legacyOff.test(bad2), 'מוטציה: ⛔ החזרת הכתיבה הכפולה נתפסת ע"י טענה 1ה');
}
{
  const e = env(PAGE + 250);
  vm.runInContext('TB_ROWS_PAGE = 1e9;', e.sb);
  const r = await e.sb.tbRowsGet('tb_entries');
  assert(r.ok && e.st.pages.length === 1,
    'מוטציית-נגד: עמוד ענק מחזיר הכל בבקשה אחת — הלולאה אינה מיותרת אלא גבולית');
}

console.log(failed ? `\n✗ סבב 55 (מקור הקריאה) — ${failed} נכשלו` : '\n✓ סבב 55 (מקור הקריאה) — כל הטענות עברו');
process.exit(failed ? 1 : 0);
