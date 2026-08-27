#!/usr/bin/env node
/*  בדיקת שלב ב של סבב 30 — מעבר נתוני היומן לטבלאות מובנות.
 *
 *  ⚠️ פרטי ל-yoman-avoda. ⛔ אין ליישר אותו מריפו אחר — הוא בודק את שכבת
 *     השורות של האפליקציה הזו, שאינה קיימת באף אחת מהאחיות.
 *
 *  ⚠️ הבדיקה מריצה את **הקוד האמיתי**: הפונקציות נחתכות מ-`index.html` לפי
 *     שמן (התאמת סוגריים) ורצות ב-`vm` מעל לקוח Supabase מדומה. מוטציה
 *     בקוד האמיתי מפילה טענה.
 *
 *  ⚠️ נוסחת הזהות (`client_id`/`rec_key`) נבדקת מול **מימוש עצמאי של
 *     ה-SQL** שב-`migrations/003` — שני צדדים שמחשבים זהות אחרת יוצרים שתי
 *     שורות לאותה רשומה, וזו התקלה היחידה כאן שאין ממנה חזרה שקטה.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const MIG = fs.readFileSync(path.join(ROOT, 'migrations/003_migrate_kv_to_rows.sql'), 'utf8');

let passN = 0, failN = 0;
const ok = (c, m) => { if (c) passN++; else { failN++; console.error('❌ ' + m); } };
const eq = (a, b, m) => ok(a === b, `${m} — קיבלתי ${JSON.stringify(a)}, ציפיתי ${JSON.stringify(b)}`);

/* ── חיתוך פונקציה מהקובץ לפי שם, בהתאמת סוגריים ───────────────────────── */
function cut(name) {
  const re = new RegExp('\\n(async )?function ' + name + '\\s*\\(', 'g');
  const m = re.exec(SRC);
  if (!m) throw new Error('הפונקציה ' + name + ' לא נמצאה ב-index.html');
  const start = m.index + 1;
  let i = SRC.indexOf('{', m.index + m[0].length - 1), d = 0;
  for (; i < SRC.length; i++) {
    const c = SRC[i];
    if (c === '{') d++;
    else if (c === '}') { d--; if (!d) return SRC.slice(start, i + 1); }
  }
  throw new Error('הפונקציה ' + name + ' אינה סגורה');
}
function cutVar(decl) {
  const i = SRC.indexOf('\n' + decl);
  if (i < 0) throw new Error('ההצהרה «' + decl + '» לא נמצאה');
  return SRC.slice(i + 1, SRC.indexOf('\n', i + 1));
}

const NAMES = ['recTs', 'isLive', 'liveOnly', '_mergePick', 'mergeCore', 'mergeRecords', 'entryKey',
  // ⚠️ נוספו בסבב 37 — פרדיקטי ה-⏳ שמנוע המיזוג מקבל. בלעדיהם
  //    `mergeEntries`/`mergeArchive` זורקות ReferenceError בסביבה.
  'pendEntry', 'pendArc', 'mergeEntries',
  'archiveKey', 'mergeArchive', 'tbRecKey', 'tbPendPrefix', 'tbRowOf',
  // ⚠️ נוספו בסבב 31 — `tbRowsGet` ממיינת את מה שנמשך, ובלעדיהן היא זורקת
  //    ונתפסת ב-catch שלה עצמה, כלומר הבדיקה הייתה מדווחת «אין רשת».
  // ⚠️ `entryOrderTs` נוספה בסבב 38 — `tbSortRows` ממיינת דרכה מאז שמזהה
  //    הרשומה הוא uuid; בלעדיה היא זורקת ונתפסת ב-catch של `tbRowsGet`.
  'parseGregLike', 'gdateOrderTs', 'entryOrderTs', 'tbSortRows',
  // ⚠️ נוספו בסבב 32 — `tbRowsGet`/`tbRowsPush` פונות דרכן לטבלה המאוחדת.
  'tbTableOf', 'tbArchivedFlag',
  'tbRowsGet', 'tbDirtyRows', 'tbRowsPush'];

function makeEnv(opts = {}) {
  const env = { rows: opts.rows || [], net: opts.net !== false, upserts: [], selects: [] };
  const client = {
    from(t) {
      const q = { t, cols: null, y: null, arch: null, order: null, range: null };
      const api = {
        select(c) { q.cols = c; return api; },
        // ⚠️ `archived` נוסף בסבב 32 — השליפה המסוננת של הטבלה המאוחדת.
        eq(c, v) { if (c === 'yeshiva') q.y = v; if (c === 'archived') q.arch = v; return api; },
        // ⚠️ נוסף בסבב 31 — המשיכה מבקשת סדר מפורש מהמסד. מוק בלי `order`
        //    היה זורק, ובדיקה שנופלת על המוק אינה בודקת את הקוד.
        order(c, o) { q.order = { col: c, opts: o }; return api; },
        // ⚠️ נוסף בסבב 55 — המשיכה עוברת בעמודים. מוק בלי `range` היה
        //    זורק, ובדיקה שנופלת על המוק אינה בודקת את הקוד.
        range(a, b) { q.range = [a, b]; return api; },
        then(res, rej) {
          env.selects.push({ table: q.t, cols: q.cols, yeshiva: q.y, archived: q.arch, order: q.order });
          const rows = env.rows.filter((r) => r._t === q.t && r.yeshiva === q.y
            && (q.arch === null || !!r.archived === q.arch));
          const paged = q.range ? rows.slice(q.range[0], q.range[1] + 1) : rows;
          const out = env.net
            ? { data: paged, error: null }
            // ⚠️ `errWithData` מדמה תשובה שיש בה **גם** `error` וגם מערך — זו
            //    הצורה שמפילה קוד שבודק רק `Array.isArray(data)`.
            : (env.errWithData ? { data: paged, error: { message: 'net' } }
                               : { data: null, error: { message: 'net' } });
          return Promise.resolve(out).then(res, rej);
        },
        upsert(rows, o) {
          env.upserts.push({ table: q.t, rows, opts: o });
          if (!env.net) return Promise.resolve({ data: null, error: { message: 'net' } });
          return Promise.resolve({ data: rows, error: null });
        },
      };
      return api;
    },
  };
  const sandbox = {
    console, JSON, Date, Math, String, Number, Array, Object, Boolean, isFinite, parseInt, Promise, RegExp, Error,
    YESHIVA: opts.yeshiva || 'rishon',
    KV_TABLE: 'kv_rishon',
    LS: '_rishon',
    PK_ENTRY: 'entry:', PK_ARC: 'arc:',
    getSB: () => (opts.noClient ? null : client),
    withTimeout: (p) => p,
    pendHas: (k) => !!(opts.pending || {})[k],
    sbGetResult: () => Promise.resolve({ ok: false, data: null }),
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(cutVar('var GREG_MONTHS_HE = '), sandbox);   // דרוש ל-parseGregLike (סבב 31)
  vm.runInContext(cutVar('var TB_ROWS = true;'), sandbox);
  vm.runInContext(cutVar('var TB_ARC_UNIFIED = true;'), sandbox);
  vm.runInContext(cutVar('var TB_ARC_LEGACY_WRITE = false;'), sandbox);
    vm.runInContext(cutVar("var TB_ROW_TABLES = "), sandbox);
  // ⚠️ נוסף בסבב 55 — `tbRowsGet` מושכת בעמודים, ובלי הקבוע היא זורקת
  //    ונתפסת ב-catch שלה עצמה, כלומר הבדיקה הייתה מדווחת «אין רשת».
  vm.runInContext(cutVar("var TB_ROWS_PAGE = "), sandbox);
  vm.runInContext(cutVar("var _tbRemote = "), sandbox);
  if (opts.tbRows === false) sandbox.TB_ROWS = false;
  for (const n of NAMES) vm.runInContext(cut(n), sandbox, { filename: n + '.js' });
  env.sb = sandbox;
  return env;
}

/* ── מימוש עצמאי של נוסחת ה-SQL, לצורך השוואה בלבד ─────────────────────── */
function sqlEntryKey(e) { return (e && e.id !== undefined && e.id !== null && String(e.id) !== '') ? String(e.id) : null; }
function sqlArchiveKey(s) {
  const g = s && s.gdate ? String(s.gdate) : '';
  if (g !== '') return 'g:' + g;
  const i = s && s.id !== undefined && s.id !== null ? String(s.id) : '';
  return i !== '' ? 'i:' + i : null;
}

const E = (id, ts, extra = {}) => Object.assign({ id, updatedAt: ts, cat: 'א', task: 'ת' }, extra);
const S = (gdate, ts, entries = []) => ({ id: 1000 + gdate.length, gdate, updatedAt: ts, entries, count: entries.length });

/* ══════════════════════════════════════════════════════════════════════════
   1 · ⭐ שקילות — כל רשומה בערך הישן קיימת בשורות, ולהיפך
   ══════════════════════════════════════════════════════════════════════════ */
function t1() {
  const env = makeEnv();
  const sb = env.sb;
  const OLD = [E(1, 100), E(2, 200), E(3, 0, { deleted: true }), E(4, 300, { notes: 'x' })];
  const rows = OLD.map((r) => sb.tbRowOf('tb_entries', r));
  eq(rows.filter(Boolean).length, OLD.length, '1א · כל רשומה הפכה לשורה');

  // כיוון א — כל רשומה בערך הישן נמצאת בשורות
  const byKey = {};
  rows.forEach((r) => { byKey[r.rec_key] = r; });
  let missing = 0;
  OLD.forEach((r) => { if (!byKey[String(sqlEntryKey(r))]) missing++; });
  eq(missing, 0, '1ב · ⭐ כיוון א — אפס רשומות חסרות בטבלה');

  // כיוון ב — כל שורה נמצאת בערך הישן
  const oldKeys = new Set(OLD.map((r) => String(sqlEntryKey(r))));
  let extra = 0;
  rows.forEach((r) => { if (!oldKeys.has(r.rec_key)) extra++; });
  eq(extra, 0, '1ג · ⭐ כיוון ב — אפס שורות עודפות');

  // ⚠️ שקילות חד-כיוונית אינה שקילות: טבלה ריקה עוברת את כיוון ב לבדו
  let extraEmpty = 0;
  [].forEach(() => { extraEmpty++; });
  eq(extraEmpty, 0, '1ד · ⚠️ וטבלה ריקה אכן «עוברת» את כיוון ב — ולכן שניהם נדרשים');
  let missingEmpty = 0;
  OLD.forEach((r) => { if (!({})[String(sqlEntryKey(r))]) missingEmpty++; });
  eq(missingEmpty, 4, '1ה · ⭐ וכיוון א הוא זה שתופס אותה');

  // הגוף נשמר במלואו — ⛔ אין איבוד שדות
  eq(JSON.stringify(rows[3].data), JSON.stringify(OLD[3]), '1ו · `data` מחזיקה את הרשומה כפי שהיא');
  eq(rows[2].deleted, true, '1ז · tombstone עובר כ-deleted=true');
  eq(rows[0].updated_at, 100, '1ח · החותמת נשמרת כמספר');
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · ⛔ נוסחת הזהות זהה לזו שב-migrations/003 — שתי נוסחאות = שתי שורות
   ══════════════════════════════════════════════════════════════════════════ */
function t2() {
  const sb = makeEnv().sb;
  const cases = [E(1, 10), E('12345', 10), E(1785324660377, 10)];
  cases.forEach((r, i) => {
    const row = sb.tbRowOf('tb_entries', r);
    eq(row.rec_key, sqlEntryKey(r), `2א.${i} · rec_key של רשומה זהה לנוסחת ה-SQL`);
    eq(row.client_id, 'rishon:' + sqlEntryKey(r), `2ב.${i} · client_id = '<yeshiva>:<rec_key>'`);
  });
  const snaps = [S('3/09/2025', 10), { id: 7, updatedAt: 5 }, { gdate: '', id: 9 }];
  snaps.forEach((r, i) => {
    const row = sb.tbRowOf('tb_archive', r);
    eq(row.rec_key, sqlArchiveKey(r), `2ג.${i} · rec_key של סנאפשוט זהה לנוסחת ה-SQL`);
  });
  eq(sb.tbRowOf('tb_archive', {}), null, '2ד · סנאפשוט בלי gdate ובלי id — אין לו שורה');
  eq(sb.tbRowOf('tb_entries', {}), null, '2ה · ורשומה בלי id — גם כן');
  ok(/'g:' \|\| \(s->>'gdate'\)/.test(MIG), '2ו · ⛔ הנוסחה `g:`+gdate כתובה גם ב-migrations/003');
  ok(/'i:' \|\| \(s->>'id'\)/.test(MIG), '2ז · ⛔ וכך גם הנפילה-חזרה ל-`i:`+id');
  ok(/on conflict \(client_id\) do nothing/.test(MIG), '2ח · ⛔ והמיגרציה היא do nothing ולא do update');
  ok(!/\bdelete\s+from\s+public\.kv_/i.test(MIG), '2ט · ⛔ והיא אינה מוחקת דבר מ-kv');
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · מיזוג ברמת רשומה — שני מכשירים, ואף אחד לא נמחק
   ══════════════════════════════════════════════════════════════════════════ */
function t3() {
  const sb = makeEnv().sb;
  const local = [E(1, 100), E(2, 500)];
  const remote = [E(1, 900, { notes: 'cloud' }), E(3, 100)];
  const merged = sb.mergeEntries(local, remote);
  eq(merged.length, 3, '3א · שלוש הרשומות שרדו');
  eq(merged.find((r) => r.id === 1).notes, 'cloud', '3ב · החדשה יותר מנצחת');
  eq(merged.find((r) => r.id === 2).updatedAt, 500, '3ג · ⛔ רשומה שיש רק מקומית אינה נמחקת');
  ok(merged.some((r) => r.id === 3), '3ד · ורשומה שיש רק בענן נכנסת');

  // tombstone חדש מנצח רשומה חיה ישנה
  const m2 = sb.mergeEntries([E(1, 100)], [E(1, 900, { deleted: true })]);
  eq(m2[0].deleted, true, '3ה · tombstone חדש יותר מנצח');
  const m3 = sb.mergeEntries([E(1, 900, { notes: 'new' })], [E(1, 100, { deleted: true })]);
  eq(m3[0].deleted, undefined, '3ו · ועריכה חדשה מנצחת tombstone ישן');

  // ארכיון — מיזוג הרשומות שבתוך אותו יום
  const a = sb.mergeArchive([S('1/01/2026', 100, [E(1, 10)])], [S('1/01/2026', 100, [E(2, 10)])]);
  eq(a.length, 1, '3ז · אותו יום — סנאפשוט אחד');
  eq(a[0].entries.length, 2, '3ח · ⭐ ורשומות שני המכשירים מוזגו בתוכו');
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · דחיפה — רק מה שהשתנה, ומה שמסומן ⏳ תמיד
   ══════════════════════════════════════════════════════════════════════════ */
async function t4() {
  const env = makeEnv();
  const sb = env.sb;
  const arr = [E(1, 100), E(2, 200), E(3, 300)];

  // ⛔ מפה null (טרם נמשך) ⇒ הכל דחוף — דילוג היה משאיר רשומה בלי עותק בענן
  eq(sb.tbDirtyRows('tb_entries', arr).length, 3, '4א · ⛔ לפני משיכה — הכל נחשב לדחיפה');

  sb._tbRemote.tb_entries = { '1': 100, '2': 200, '3': 300 };
  eq(sb.tbDirtyRows('tb_entries', arr).length, 0, '4ב · הכל מסונכרן ⇒ אין מה לדחוף');

  arr[1] = E(2, 250);
  const d = sb.tbDirtyRows('tb_entries', arr);
  eq(d.length, 1, '4ג · רק מה שהשתנה');
  eq(d[0].rec_key, '2', '4ד · והוא הנכון');

  // רשומה חדשה לגמרי
  arr.push(E(9, 50));
  eq(sb.tbDirtyRows('tb_entries', arr).length, 2, '4ה · רשומה שאינה בענן נדחפת גם עם חותמת ישנה');

  // ⚠️ רשומה מסומנת ⏳ מנצחת במיזוג (כלל ברזל 6)
  const env2 = makeEnv({ pending: { 'entry:1': 1 } });
  env2.sb._tbRemote.tb_entries = { '1': 999 };
  eq(env2.sb.tbDirtyRows('tb_entries', [E(1, 100)]).length, 1,
    '4ו · ⛔ רשומה מסומנת ⏳ נדחפת גם כשחותמת הענן חדשה יותר');

  // הדחיפה עצמה
  const r = await sb.tbRowsPush('tb_entries', arr);
  eq(r.ok, true, '4ז · הדחיפה הצליחה');
  eq(env.upserts.length, 1, '4ח · קריאת upsert אחת');
  eq(env.upserts[0].opts.onConflict, 'client_id', '4ט · ⚠️ upsert על client_id — אידמפוטנטי');
  eq(env.upserts[0].table, 'tb_entries', '4י · לטבלה הנכונה');
  eq(sb.tbDirtyRows('tb_entries', arr).length, 0, '4יא · ואחריה אין מה לדחוף');
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · ⛔ אופליין — נכשל סגור, ומנסה שוב
   ══════════════════════════════════════════════════════════════════════════ */
async function t5() {
  const env = makeEnv({ net: false });
  const sb = env.sb;
  const g = await sb.tbRowsGet('tb_entries');
  eq(g.ok, false, '5א · ⛔ משיכה שנכשלה מחזירה ok:false — «אין ראיה»');
  // ⛔ תשובה עם `error` **וגם** מערך תקין — הצורה שמפילה בדיקה רופפת
  const envE = makeEnv({ net: false, rows: [{ _t: 'tb_entries', yeshiva: 'rishon', rec_key: '1', updated_at: 5, data: E(1, 5) }] });
  envE.errWithData = true;
  eq((await envE.sb.tbRowsGet('tb_entries')).ok, false,
    '5א2 · ⛔ `error` שמלווה במערך תקין עדיין נכשל סגור');
  eq(g.data, null, '5ב · ובלי נתונים, כדי שאתר הקריאה ייפול-חזרה לבלוק');
  eq(sb._tbRemote.tb_entries, null, '5ג · ⛔ ומפת הענן לא נדרסה במפה ריקה');

  const p = await sb.tbRowsPush('tb_entries', [E(1, 100)]);
  eq(p.ok, false, '5ד · דחיפה שנכשלה מחזירה ok:false');
  eq(sb.tbDirtyRows('tb_entries', [E(1, 100)]).length, 1, '5ה · ⭐ והרשומה נשארת «לדחיפה» — תנוסה שוב');

  // הרשת חוזרת
  env.net = true;
  eq((await sb.tbRowsPush('tb_entries', [E(1, 100)])).ok, true, '5ו · וכשהרשת חוזרת — נדחפת');

  // בלי לקוח / בלי מוסד
  const env2 = makeEnv({ noClient: true });
  eq((await env2.sb.tbRowsGet('tb_entries')).ok, false, '5ז · בלי לקוח — ok:false');
  const env3 = makeEnv();
  env3.sb.YESHIVA = null;
  eq((await env3.sb.tbRowsGet('tb_entries')).ok, false, '5ח · ⛔ ולפני בחירת מוסד — לא נוגעים ברשת');
  eq(env3.selects.length, 0, '5ט · ואפס שאילתות');
}

/* ══════════════════════════════════════════════════════════════════════════
   6 · ⭐ נתיב החזרה — TB_ROWS=false מחזיר את ההתנהגות הישנה
   ══════════════════════════════════════════════════════════════════════════ */
async function t6() {
  const env = makeEnv({ tbRows: false });
  const sb = env.sb;
  eq((await sb.tbRowsGet('tb_entries')).ok, false, '6א · ⭐ בכיבוי — אין קריאה מהשורות');
  eq((await sb.tbRowsPush('tb_entries', [E(1, 1)])).ok, false, '6ב · ואין דחיפה');
  eq(env.selects.length + env.upserts.length, 0, '6ג · ⛔ ואפס נגיעה ברשת');
  ok(/var TB_ROWS = true;/.test(SRC), '6ד · והדגל קיים בקוד כדגל יחיד');
}

/* ══════════════════════════════════════════════════════════════════════════
   7 · משיכה מוצלחת — מפת החותמות והמסננים
   ══════════════════════════════════════════════════════════════════════════ */
async function t7() {
  const env = makeEnv({
    rows: [
      { _t: 'tb_entries', yeshiva: 'rishon', rec_key: '1', updated_at: 100, data: E(1, 100) },
      { _t: 'tb_entries', yeshiva: 'rishon', rec_key: '2', updated_at: 200, data: E(2, 200) },
      { _t: 'tb_entries', yeshiva: 'ramataviv', rec_key: '9', updated_at: 1, data: E(9, 1) },
    ],
  });
  const g = await env.sb.tbRowsGet('tb_entries');
  eq(g.ok, true, '7א · משיכה מוצלחת');
  eq(g.data.length, 2, '7ב · ⛔ רק שורות המוסד הפעיל — אין דליפה בין מוסדות');
  eq(env.selects[0].yeshiva, 'rishon', '7ג · והסינון נעשה בשאילתה עצמה');
  eq(env.sb._tbRemote.tb_entries['2'], 200, '7ד · מפת החותמות נבנתה מהמשיכה');
  // ⚠️ מסבב 31 המשיכה מחזירה **ממוין** — רשומות לפי id יורד — ולכן הראשון
  //    הוא 2 ולא 1. הטענה בודקת שהנתונים הם גוף הרשומה, ועכשיו גם את הסדר.
  eq(g.data[0].id, 2, '7ה · והנתונים הם גוף הרשומה, בסדר יורד לפי id');
  eq(g.data[1].id, 1, '7ו · והרשומה השנייה אחריה');
  eq(env.selects[0].order && env.selects[0].order.col, 'rec_key',
    '7ז · ⛔ הסדר נדרש מהמסד עצמו ולא רק בקוד (סבב 31)');
}

/* ── הרצה ──────────────────────────────────────────────────────────────── */
const tests = [t1, t2, t3, t4, t5, t6, t7];
for (const t of tests) {
  try { await t(); }
  catch (e) { failN++; console.error(`❌ ${t.name} זרקה: ${(e && e.stack) || e}`); }
}
console.log(`\n[yoman-avoda] שלב ב — ${passN} עברו, ${failN} נכשלו`);
process.exit(failN ? 1 : 0);
