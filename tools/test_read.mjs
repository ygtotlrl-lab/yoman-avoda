#!/usr/bin/env node
/*  test_read.mjs — מקור הקריאה: טבלאות בלבד.
 *
 *  **מה נאכף:** ⛔ אפס קריאות ערך-שלם למפתחות שעברו לטבלה · ⛔ המיזוג יושב
 *  **בתוך** שער ה-`ok` · ⛔ הכתיבה הכפולה כבויה · ⛔ והמפתחות שביתם היחיד
 *  בענן הוא המפתח-ערך נקראים משם, ⚠️ וזו אינה סטייה. ⛔ ולצידם רתמת `vm`
 *  שמריצה את שליפת העמודים האמיתית ⛔ ומודדת נכשל-סגור.
 *
 *  **הנימוק המדוד:** השקילות אומתה מול המסד בשני המוסדות — ⛔ הטבלה
 *  מחזיקה יותר רשומות מהערך השלם בשניהם, ⚠️ והבלוק חדל להיות רשת ביטחון
 *  והפך למקור אמת שני.
 *
 *  **מה יישבר בלעדיו:** ⛔ כשל שנקרא כ«הענן ריק» מוחק את מה שלא הספיק
 *  לעלות — ⚠️ מיזוג מול מערך ריק, ⭐ בלי שגיאה ובלי סימן.
 *
 *  **מה אינו נאכף כאן:** ⛔ קיום המפתחות שנותרו במסד — ⚠️ הוא אינו נראה
 *  מהריפו, ⭐ ומחיקתם היא פעולת מנהל.
 *
 *  ⚠️ **אינו מבחן מעבר:** מה שהמבחן נועל הוא **היעדר** הנפילה-חזרה —
 *  ⚠️ נתיב שיוחזר «ליתר ביטחון» הוא מקור אמת שני, ⭐ והוא נכנס בשקט.
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
  //    _tbVerify) ועוד ספק החלון החם — ר' הטענה 1א.
  minRowsGet: 5,
  // ⛔ שני המסלולים שנמדדים בטענה 1ג — ⚠️ שמם הוא מה שקושר את המשיכה לשער
  //    ה-`ok` שלה, ⛔ ובלעדיו הטענה מודדת דפוס ולא אתר.
  rowsVars: ['_rowsE', '_rowsA'],
  legacyOff: /var TB_KV_LEGACY_WRITE = false;/,
  // המפתחות שביתם היחיד בענן הוא ה-kv — ⛔ ולכן אין להם שכבת שורות.
  kvOnly: ['tb_cats', 'tb_subs', 'tb_subs_meta'],
};
/* ── סוף APP ───────────────────────────────────────────────────────────── */

/*  ⛔ הקובץ הזה אינו אוכף שורה בטבלת התשתית (סבב 72) — ⚠️ הצהרה ריקה
 *  ולא היעדר: ⛔ שער בלי הצהרה אינו נבדל משער שההצהרה שלו נשמטה. */
export const ROWS = [];

/*  ⛔ המוטציות אינן ברירת המחדל (סבב 92) — ⚠️ כל מוטציה היא שינוי ⟵ הרצה
 *  ⟵ שחזור, ⭐ ושני שערים לבדם היו רוב זמן הסט: ⛔ הן רצות ברמה המלאה
 *  (`--full`), בסוף הסבב ולפני מיזוג, ⚠️ ולא בכל הרצה בזמן העבודה. */
const RUN_MUT = process.env.GATE_MUT === '1';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'index.html'), 'utf8');

let failed = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { failed++; console.error('  FAIL ' + m); };
const assert = (c, m) => (c ? ok(m) : bad(m));

console.log('— סבב 55 (יומן): מקור הקריאה —');

/* ── 1. הדפוס: טבלאות בלבד, ⛔ ובלי נפילה-חזרה ──────────────────────────── */
const calls = (SRC.match(new RegExp(APP.rowsGet + "\\('", 'g')) || []).length;
assert(calls >= APP.minRowsGet,
  `1א · ${APP.rowsGet} נקראת ב-${calls} אתרים (≥${APP.minRowsGet})`);

/* ⛔ אין קריאת ערך-שלם למפתח שעבר לטבלה — ⚠️ לא כמסלול ראשי ולא כנפילה-חזרה:
   ⭐ הבלוק חדל להיות רשת ביטחון והפך למקור אמת שני. */
const kvReads = [];
const reKv = /(await pull\('(tb_entries|tb_archive)'|select\("value"\)\.eq\("key","(tb_entries|tb_archive)"\))/g;
let m;
while ((m = reKv.exec(SRC))) {
  const line = SRC.slice(SRC.lastIndexOf('\n', m.index) + 1, SRC.indexOf('\n', m.index));
  kvReads.push(line.trim());
}
assert(kvReads.length === 0,
  '1ב · ⛔ אפס קריאות ערך-שלם למפתחות שעברו — נמדד ' + kvReads.length +
  (kvReads.length ? ' · ' + kvReads[0] : ''));
/* ⛔ וכשל מחזיר «אין ראיה» ⛔ ולא «הענן ריק» — ⚠️ המיזוג יושב **בתוך** שער
   ה-`ok`: ⭐ מיזוג מול מערך ריק מוחק את מה שלא הספיק לעלות. */
/*  ⛔ והשורה **היחידה** שמותר לה לשבת בין ההמתנה לשער ה-`ok` היא שער
    ההקשר (סבב 89) — ⚠️ הטענה היא שהמיזוג יושב **בתוך** `if (v.ok)`,
    ⭐ ולא ששתי השורות צמודות: ⛔ והמותר הוא שורה מוצהרת אחת ⚠️ ולא
    «כל דבר ביניהן» — ⭐ אחרת השער מאשר גם מיזוג שנדחף לשם. */
const ungated = APP.rowsVars.filter((v) => !new RegExp(
  'var ' + v + ' = await ' + APP.rowsGet +
  "\\('\\w+'\\);\\s*\\n(\\s*if \\(ysTenantStale\\(_ep\\)\\)[^\\n]*\\n)?\\s*if \\(" +
  v + '\\.ok\\) \\{').test(SRC));
assert(ungated.length === 0,
  '1ג · ⛔ המיזוג יושב בתוך שער ה-`ok` — נמדד בלי שער: ' +
  (ungated.join(', ') || 'אף אחד') + '. עוטפים את המיזוג ב-if (<res>.ok)');
assert(APP.legacyOff.test(SRC),
  '1ה · ⛔ הכתיבה הכפולה ל-kv נשארה כבויה — הטבלאות הן המאסטר');
for (const k of APP.kvOnly) {
  assert(new RegExp("pull\\('" + k + "'").test(SRC),
    '1ו · ' + k + ' נקרא מ-kv — ⚠️ זה ביתו היחיד בענן, ולא סטייה');
}

/* ── 2. הרצת tbRowsGet האמיתית — עמודים ונכשל-סגור ─────────────────────── */
function cut(name, src) {
  src = src || SRC;
  const re = new RegExp('\\n(async )?function ' + name + '\\s*\\(', 'g');
  const mm = re.exec(src);
  if (!mm) throw new Error('לא נמצאה ' + name);
  const start = mm.index + 1;
  let i = src.indexOf('{', mm.index + mm[0].length - 1), d = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (!d) return src.slice(start, i + 1); }
  }
  throw new Error('לא נסגרה ' + name);
}
function cutVar(decl) {
  const i = SRC.indexOf('\n' + decl);
  if (i < 0) throw new Error('לא נמצאה ההצהרה ' + decl);
  return SRC.slice(i + 1, SRC.indexOf('\n', i + 1));
}
function env(total, mode, mutSrc) {
  const st = { pages: [], asked: [] };
  const client = {
    from() {
      const q = { rng: null, arch: null };
      const api = {
        select() { return api; },
        eq(c, v) { if (c === 'archived') q.arch = v; if (c === 'yeshiva') st.asked.push(v); return api; },
        order() { return api; },
        range(a, b) {
          q.rng = [a, b];
          st.pages.push(a);
          if (mode === 'switch' && st.pages.length === 1) st.bump();
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
    /*  ⛔ המוסד שהסביבה מחזירה בכל עמוד נרשם (סבב 89) — ⚠️ הסגור נקרא
     *  פעם אחת לכל עמוד, ⭐ וזה מה שמאפשר למדוד עם מי הוא בא במגע. */
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  for (const d of ['var TB_ROWS = true;', 'var TB_ARC_UNIFIED = true;',
                   'var TB_ROW_TABLES = ', 'var YS_ROWS_PAGE = ', 'var YS_ROWS_CAP = ',
                   'var _tbRemote = ']) {
    vm.runInContext(cutVar(d), sb);
  }
  /*  ⛔ העימוד עבר למודול המשותף (סבב 87) — ⚠️ הסביבה טוענת אותו כמו כל
   *  פונקציה אחרת, ⭐ ולכן הטענות למטה מודדות את **אותו** קוד שרץ באפליקציה. */
  vm.runInContext(cutVar('var _tbEpoch = 0;'), sb);
  for (const n of ['_ysRowsPaged', 'entryKey', 'archiveKey', 'parseGregLike', 'gdateOrderTs', 'entryOrderTs',
                   'tbSortRows', 'tbTableOf', 'tbArchivedFlag', 'ysTenantEpoch', 'ysTenantStale', 'tbRowsGet']) {
    vm.runInContext(cut(n, mutSrc), sb, { filename: n + '.js' });
  }
  /*  ⛔ ההחלפה היא קידום המונה **האמיתי** ⛔ ולא דגל של הסביבה — ⚠️ זה
   *  בדיוק מה ש-`ysResetTenantState` עושה בהחלפת מוסד. */
  st.bump = () => { sb.YESHIVA = 'ramataviv'; vm.runInContext('_tbEpoch++;', sb); };
  vm.runInContext(cutVar('var GREG_MONTHS_HE = '), sb);
  return { sb, st };
}

const PAGE = Number((cutVar('var YS_ROWS_PAGE = ').match(/\d+/) || [0])[0]);
assert(PAGE > 0, '2א · YS_ROWS_PAGE מוגדר (' + PAGE + ')');
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
  assert(r.ok === false, '2ו · כשל בעמוד הראשון ⇒ «אין ראיה», ⛔ ולא מערך ריק');
}
/*  ⛔⛔ דליפת העימוד (סבב 89) — ⚠️ הנימוק המדוד: הסגור שמועבר לשכבת
 *  העימוד נקרא **פעם אחת לכל עמוד**, ⭐ וקריאת הגלובלי בתוכו מושכת
 *  עמודים עבור המוסד החדש, ⛔ והתוצאה חוזרת `ok:true` עם שורות של
 *  **שני** המוסדות. */
{
  const e = env(PAGE + 250, 'switch');
  const r = await e.sb.tbRowsGet('tb_entries');
  const uniq = [...new Set(e.st.asked)];
  assert(uniq.length === 1 && uniq[0] === 'rishon',
    '2ז · ⛔ כל העמודים נמשכו עבור המוסד שנלכד בכניסה — נמדד ' + uniq.join(',') +
    ' והצפוי rishon בלבד. לוכדים את המוסד בכניסה ומשתמשים בו בתוך הסגור');
  assert(r.ok === false && r.data === null,
    '2ח · ⛔ והחלפת הקשר באמצע העימוד מחזירה «אין ראיה» — נמדד ok=' + r.ok +
    ' והצפוי false. בודקים את ההקשר לפני הרישום ל-_tbRemote');
}

if (RUN_MUT) {
/*  ⛔ מכאן ולמטה מוטציות ובדיקות שלמות (סבב 92) — ⚠️ הן רצות ברמה
 *  המלאה בלבד: ⛔ הרמה המהירה עוצרת כאן עם קוד היציאה של הטענות
 *  שכבר רצו, ⭐ והכיסוי שלהן אינו יורד. */
if (!RUN_MUT) {
  console.log('\n⏭ test_read: המוטציות רצות ברמה המלאה (--full)');
  process.exit(failed ? 1 : 0);
}
/* ── 3. מוטציות ────────────────────────────────────────────────────────── */
console.log('— מוטציות —');
/*  ⛔ מוטציה **חיה** ולא סטטית (סבב 89) — ⚠️ הסגור חוזר לקרוא את המוסד
 *  מהגלובלי, ⭐ והרתמה מריצה את הגוף המוטנטי עצמו: ⛔ זה בדיוק הקוד
 *  השבור עצמו, ⚠️ ומה שנמדד בו הוא שרשור עמודים של שני מוסדות. */
{
  const bad = SRC.replace(".eq('yeshiva', yesh)", ".eq('yeshiva', YESHIVA)");
  assert(bad !== SRC, 'מוטציה: הסגור אותר והוחזר לקריאת הגלובלי');
  const e = env(PAGE + 250, 'switch', bad);
  const r = await e.sb.tbRowsGet('tb_entries');
  const uniq = [...new Set(e.st.asked)];
  assert(uniq.length > 1,
    'מוטציה: קריאת הגלובלי בסגור משרשרת שני מוסדות (' + uniq.join(',') + ') — טענה 2ז הייתה נכשלת');
  assert(r.ok === false,
    'מוטציה: ⛔ ושער ההקשר שאחרי ההמתנה הוא מה שעוצר את התוצאה — טענה 2ח');
}
{
  /*  ⛔ ומוטציה שנייה: הסרת השער שאחרי ההמתנה — ⚠️ התוצאה חוזרת `ok:true`
   *  עם שורות של שני המוסדות, ⭐ תמונה מעורבת שנראית שלמה. */
  const bad = SRC.replace(".eq('yeshiva', yesh)", ".eq('yeshiva', YESHIVA)")
                 .replace('    if (ysTenantStale(_ep)) return { ok: false, data: null };\n', '');
  const e = env(PAGE + 250, 'switch', bad);
  const r = await e.sb.tbRowsGet('tb_entries');
  assert(r.ok === true,
    'מוטציה: ⛔ בלי השער התוצאה המעורבת חוזרת כ-ok:true — טענה 2ח הייתה נכשלת');
}
// ⚠️ המוטציות כאן סטטיות — הן מודדות את **הדפוס** שהטענות 1ב/1ג/1ה נועלות.
{
  /* ⛔ החזרת הנפילה-חזרה — ⚠️ בדיוק השינוי ש«ליתר ביטחון» היה מכניס. */
  const bad1 = SRC.replace('      var cloudEntries = _rowsE.data;',
    '      var cloudEntries = _rowsE.data || JSON.parse((await sb.from(KV_TABLE)' +
    '.select("value").eq("key","tb_entries").single()).data.value);');
  const re2 = /(await pull\('(tb_entries|tb_archive)'|select\("value"\)\.eq\("key","(tb_entries|tb_archive)"\))/g;
  assert((bad1.match(re2) || []).length > 0,
    'מוטציה: ⛔ החזרת הנפילה-חזרה ל-kv נתפסת ע"י טענה 1ב');
}
{
  /* ⛔ הוצאת המיזוג מחוץ לשער ה-`ok` — ⚠️ «הענן ריק» במקום «אין ראיה». */
  const bad1b = SRC.replace(`    var _rowsA = await tbRowsGet('tb_archive');
    if (_rowsA.ok) {`, `    var _rowsA = await tbRowsGet('tb_archive');
    {`);
  const still = new RegExp("var _rowsA = await tbRowsGet\\('\\w+'\\);\\s*\\n\\s*if \\(_rowsA\\.ok\\) \\{").test(bad1b);
  assert(!still, 'מוטציה: ⛔ מיזוג מחוץ לשער ה-`ok` נתפס ע"י טענה 1ג');
}
{
  const bad2 = SRC.replace('var TB_KV_LEGACY_WRITE = false;', 'var TB_KV_LEGACY_WRITE = true;');
  assert(!APP.legacyOff.test(bad2), 'מוטציה: ⛔ החזרת הכתיבה הכפולה נתפסת ע"י טענה 1ה');
}
{
  const e = env(PAGE + 250);
  vm.runInContext('YS_ROWS_PAGE = 1e9;', e.sb);
  const r = await e.sb.tbRowsGet('tb_entries');
  assert(r.ok && e.st.pages.length === 1,
    'מוטציית-נגד: עמוד ענק מחזיר הכל בבקשה אחת — הלולאה אינה מיותרת אלא גבולית');
}
{
  /* ⛔ מוטציית-נגד לטענה 1ב — ⚠️ אתר קריאה **נוסף** מהטבלה הוא שינוי חי,
     ⭐ ואסור לו להפיל: הטענה אוסרת את הערך השלם ⛔ ולא את שכבת השורות. */
  const good = SRC.replace("    var _rowsA = await tbRowsGet('tb_archive');",
    "    await tbRowsGet('tb_entries');\n    var _rowsA = await tbRowsGet('tb_archive');");
  assert((good.match(reKv) || []).length === 0 &&
         (good.match(new RegExp(APP.rowsGet + "\\('", 'g')) || []).length === calls + 1,
    'מוטציית-נגד: אתר קריאה נוסף מהטבלה — אינו מפיל את 1ב');
}

}

console.log(failed ? `\n✗ סבב 55 (מקור הקריאה) — ${failed} נכשלו` : '\n✓ סבב 55 (מקור הקריאה) — כל הטענות עברו');
process.exit(failed ? 1 : 0);
