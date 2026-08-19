#!/usr/bin/env node
/*  test_round38_ids_yoman.mjs — סבב 38: מזהה רשומת יומן עובר ל-uuid.
 *
 *  ⚠️ פרטי ל-yoman-avoda — היא היחידה שהמזהה שלה היה `Date.now()`.
 *
 *  ⛔ **מזהים קיימים אינם מומרים** (סבב 38), ולכן הדרישה אינה «uuid» אלא
 *  **דו-קיום**: רשומה ישנה (מספרית) ורשומה חדשה (uuid) חייבות לעבוד יחד
 *  — סדר נכון, עריכה ומחיקה על שתיהן — לנצח.
 *
 *  שלושת הממדים שנבדקים כאן הם בדיוק שלושת אלה שחסמו את ההמרה עד היום:
 *    א. מיון   — `entryOrderTs` במקום `b.id - a.id` / `Number(x.id)`
 *    ב. ציטוט  — `idArg` במאפייני `onclick`
 *    ג. השוואה — `idEq` במקום `===` מול מספר
 *
 *  ארבע מוטציות, אחת לכל ממד ואחת ליצירה.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'index.html'), 'utf8');

let failed = 0;
const ok = (m) => console.log('  ok   ' + m);
const bad = (m) => { failed++; console.error('  FAIL ' + m); };
const assert = (c, m) => (c ? ok(m) : bad(m));

/* חיתוך פונקציה מהמקור בהתאמת סוגריים — אותו עוזר כמו בסבב 37. */
function cut(name, src) {
  const re = new RegExp('\\n(async )?function ' + name + '\\s*\\(', 'g');
  const m = re.exec(src);
  if (!m) throw new Error('הפונקציה ' + name + ' לא נמצאה');
  const start = m.index + 1;
  let i = src.indexOf('{', m.index + m[0].length - 1), d = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}') { d--; if (!d) return src.slice(start, i + 1); }
  }
  throw new Error('הפונקציה ' + name + ' אינה סגורה');
}

const NAMES = ['idEq', 'entryOrderTs', 'idArg', 'entryKey', 'gdateOrderTs',
               'parseGregLike', 'tbSortRows', 'archiveKey'];
function build(src) {
  const ctx = { console, Number, String, Array, Object, isFinite, Date, JSON, Math };
  vm.createContext(ctx);
  vm.runInContext(NAMES.map((n) => cut(n, src)).join('\n'), ctx);
  return ctx;
}
const c = build(SRC);

/* רשומות הדו-קיום: ישנה = מזהה מספרי שהוא גם חותמת היצירה; חדשה = uuid. */
const OLD_ID = 1755500000000;                       // Date.now() היסטורי
const NEW_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f607';
const oldRec = { id: OLD_ID, updatedAt: OLD_ID + 5, task: 'ישנה' };
const newRec = { id: NEW_ID, createdAt: OLD_ID + 1000, updatedAt: OLD_ID + 1000, task: 'חדשה' };

console.log('· סבב 38 — מזהה רשומת יומן (yoman-avoda)');

/* ── א. מיון ───────────────────────────────────────────────────────────── */
assert(c.entryOrderTs(oldRec) === OLD_ID,
  '1 · רשומה ישנה — הסדר נגזר מה-`id`, שהוא עצמו חותמת היצירה');
assert(c.entryOrderTs(newRec) === OLD_ID + 1000,
  '2 · רשומה חדשה — הסדר נגזר מ-`createdAt`');
assert(c.entryOrderTs({ id: NEW_ID, updatedAt: 7 }) === 7,
  '3 · uuid בלי `createdAt` נופל ל-`updatedAt` ⛔ ולא ל-NaN');
assert(c.entryOrderTs(null) === 0 && c.entryOrderTs({}) === 0,
  '4 · רשומה ריקה ⇒ 0, בלי לזרוק');
{
  const sorted = [oldRec, newRec].slice()
    .sort((a, b) => c.entryOrderTs(b) - c.entryOrderTs(a));
  assert(sorted[0] === newRec && sorted[1] === oldRec,
    '5 · ⭐ ישנה וחדשה יחד — החדשה קודם, בסדר יורד');
}
{
  // ⛔ הסדר של רשומות העבר לא זז: שלוש רשומות מספריות, אותו סדר כמו
  //    `b.id - a.id` הישן.
  const legacy = [{ id: 100 }, { id: 300 }, { id: 200 }];
  const now = legacy.slice().sort((a, b) => c.entryOrderTs(b) - c.entryOrderTs(a));
  const then = legacy.slice().sort((a, b) => b.id - a.id);
  assert(JSON.stringify(now) === JSON.stringify(then),
    '6 · ⛔ סדר רשומות העבר זהה בדיוק לזה שהיה');
}
{
  const rows = c.tbSortRows('tb_entries', [oldRec, newRec]);
  assert(rows[0].task === 'חדשה' && rows[1].task === 'ישנה',
    '7 · `tbSortRows` ממיינת נכון גם כשהמזהים מעורבים');
  const a = c.tbSortRows('tb_entries', [oldRec, newRec]).map((r) => String(r.id));
  const b = c.tbSortRows('tb_entries', [newRec, oldRec]).map((r) => String(r.id));
  assert(JSON.stringify(a) === JSON.stringify(b), '8 · ⭐ והיא דטרמיניסטית');
}

/* ── ב. ציטוט ──────────────────────────────────────────────────────────── */
assert(c.idArg(NEW_ID) === "'" + NEW_ID + "'", '9 · uuid מצוטט כמחרוזת');
assert(c.idArg(OLD_ID) === "'" + OLD_ID + "'", '10 · וגם מזהה מספרי ישן');
assert(c.idArg("a'b\"c<d>") === "'abcd'",
  '11 · ⛔ רשימת-היתר של תווים — גרש, מרכאה וסוגר-זווית נחתכים');
assert(c.idArg(null) === "''", '12 · `null` ⇒ מחרוזת ריקה, בלי לזרוק');
{
  const attrs = SRC.match(/onclick="(editEntry|delEntry|saveEntry|arcEditEntry|arcDeleteEntry|arcSaveEntry)\([^"]*"/g) || [];
  assert(attrs.length >= 6, '13 · כל שישה מאפייני ה-`onclick` נמצאו (' + attrs.length + ')');
  assert(attrs.every((a) => /idArg\(/.test(a)),
    '14 · ⛔ ובכולם המזהה עובר ב-`idArg` — אין הזרקה בלי מרכאות');
}

/* ── ג. השוואה ─────────────────────────────────────────────────────────── */
assert(c.idEq(OLD_ID, String(OLD_ID)), '15 · ⭐ מספר מול מחרוזת — מתאימים');
assert(c.idEq(NEW_ID, NEW_ID), '16 · uuid מול עצמו — מתאים');
assert(!c.idEq(OLD_ID, OLD_ID + 1), '17 · מזהים שונים אינם מתאימים');
assert(!c.idEq(null, null) && !c.idEq(undefined, 1),
  '18 · ⛔ `null` לעולם אינו מתאים — אחרת רשומה בלי מזהה הייתה נמצאת ראשונה');
{
  // מסלול העריכה/מחיקה: המזהה חוזר מהמאפיין כ**מחרוזת**.
  const ENTRIES = [oldRec, newRec];
  const fromAttr = (r) => c.idArg(r.id).slice(1, -1);
  assert(ENTRIES.find((e) => c.idEq(e.id, fromAttr(oldRec))) === oldRec,
    '19 · ⭐ עריכה של רשומה **ישנה** מוצאת אותה אחרי מעבר במאפיין');
  assert(ENTRIES.find((e) => c.idEq(e.id, fromAttr(newRec))) === newRec,
    '20 · ⭐ ושל רשומה **חדשה** — אותו מסלול בדיוק');
}
assert(!/\.id === (id|e\.id|entryId)\b/.test(SRC),
  '21 · ⛔ לא נשארה בקוד השוואת `===` על מזהה רשומה');
assert(!/return b\.id - a\.id/.test(SRC),
  '22 · ⛔ ולא נשאר מיון מספרי על מזהה');

/* ── ד. היצירה ─────────────────────────────────────────────────────────── */
assert((SRC.match(/id: newClientId\(\)/g) || []).length === 2,
  '23 · ⭐ שני אתרי היצירה קוראים ל-`newClientId()`');
assert((SRC.match(/createdAt: /g) || []).length >= 2,
  '24 · ושניהם כותבים `createdAt` נפרד');
assert(!/id: now\.getTime\(\)/.test(SRC) && !/\bid: Date\.now\(\),/.test(SRC),
  '25 · ⛔ ואף אתר יצירה אינו משתמש עוד בחותמת זמן כמזהה');

/* ── ה. מוטציות ────────────────────────────────────────────────────────── */
console.log('  — מוטציות —');
{
  // מיון: חזרה למצב שלפני סבב 38 — `Number(id)` בלבד, בלי `createdAt`
  // ובלי נפילה-חזרה. אצל רשומת uuid זה `NaN`, כלומר 0.
  const body = /function entryOrderTs\(e\) \{[\s\S]*?\n\}/.exec(SRC)[0];
  const mut = build(SRC.replace(body,
    'function entryOrderTs(e) {\n  return Number(e && e.id) || 0;\n}'));
  const sorted = [oldRec, newRec].slice().sort((a, b) => mut.entryOrderTs(b) - mut.entryOrderTs(a));
  assert(mut.entryOrderTs(newRec) === 0 && sorted[0] === oldRec,
    '26 · מוטציה: מיון לפי המזהה מציב את החדשה בסוף — טענה 5 הייתה נכשלת');
}
{
  // ציטוט: הסרת המרכאות — הארגומנט חוזר להיות שם משתנה.
  const mut = build(SRC.replace(
    'return "\'" + String(v == null ? \'\' : v).replace(/[^A-Za-z0-9_-]/g, \'\') + "\'";',
    'return String(v == null ? \'\' : v);'));
  assert(mut.idArg(NEW_ID) === NEW_ID && mut.idArg(NEW_ID).indexOf("'") === -1,
    '27 · מוטציה: הסרת הציטוט מפילה את טענה 9');
}
{
  // השוואה: חזרה ל-`===` — המזהה שחוזר מהמאפיין כמחרוזת אינו נמצא.
  const mut = build(SRC.replace('return String(a) === String(b);', 'return a === b;'));
  assert(!mut.idEq(OLD_ID, String(OLD_ID)),
    '28 · מוטציה: השוואה מספרית מפילה את טענה 15');
  const ENTRIES = [oldRec, newRec];
  assert(ENTRIES.find((e) => mut.idEq(e.id, String(OLD_ID))) === undefined,
    '29 · ⛔ ובמוטנט העריכה של רשומה ישנה מפסיקה למצוא אותה — טענה 19');
}
{
  // יצירה: חזרה לחותמת זמן כמזהה — טענות 23 ו-25 נשענות על הקוד עצמו,
  // ולכן המוטציה היא על המקור ולא על ערך מחושב.
  const mut = SRC.replace(/id: newClientId\(\)/g, 'id: now.getTime()');
  assert((mut.match(/id: newClientId\(\)/g) || []).length === 0 &&
         /id: now\.getTime\(\)/.test(mut),
    '30 · מוטציה: החזרת חותמת זמן כמזהה מפילה את טענות 23 ו-25');
}

console.log((failed ? '✗' : '✓') + ` סבב 38 (מזהי יומן) — ${30 - failed} טענות עברו, ${failed} נכשלו`);
process.exit(failed ? 1 : 0);
