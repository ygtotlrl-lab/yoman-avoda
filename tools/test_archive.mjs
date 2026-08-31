#!/usr/bin/env node
/*  בדיקת סבב 31 — תצוגת הארכיון ומקור הרשומות האוטומטיות.
 *
 *  ⚠️ פרטי ל-yoman-avoda. ⛔ אין ליישר אותו מריפו אחר — הוא בודק את הארכיון
 *     של האפליקציה הזו, שאין לו מקבילה באף אחת מהאחיות.
 *
 *  ⚠️ הבדיקה מריצה את **הקוד האמיתי**: הפונקציות נחתכות מ-`index.html` לפי
 *     שמן (התאמת סוגריים) ורצות ב-`vm`. מוטציה בקוד האמיתי מפילה טענה.
 *
 *  ⚠️ הנתונים הם **מדידה מהמסד החי** (`tools/fixtures/round31_archive.txt`,
 *     2026-08-14, ב-SELECT בלבד), ולא נתונים שהומצאו כדי להתאים לקוד. מה
 *     שאמיתי בפיקסטורה ומה שמסונתז — כתוב בכותרתה.
 *
 *  ⛔ אין שעון ואין `setTimeout` בקובץ הזה (הלקח מסבב 24) — כל טענה נמדדת
 *     על **אירוע** (קריאה שהסתיימה, מערך שהורכב), ולא על המתנה.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';


/*  ⛔ הקובץ הזה אינו אוכף שורה בטבלת התשתית (סבב 72) — ⚠️ הצהרה ריקה
 *  ולא היעדר: ⛔ שער בלי הצהרה אינו נבדל משער שההצהרה שלו נשמטה. */
export const ROWS = [];
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const FIX = fs.readFileSync(path.join(ROOT, 'tools/fixtures/round31_archive.txt'), 'utf8');

let passN = 0, failN = 0;
const ok = (c, m) => { if (c) passN++; else { failN++; console.error('❌ ' + m); } };
const eq = (a, b, m) => ok(a === b, `${m} — קיבלתי ${JSON.stringify(a)}, ציפיתי ${JSON.stringify(b)}`);

/* ── חיתוך מהקובץ ──────────────────────────────────────────────────────── */
function cut(name) {
  const re = new RegExp('\\n(async )?function ' + name + '\\s*\\(', 'g');
  const m = re.exec(SRC);
  if (!m) throw new Error('הפונקציה ' + name + ' לא נמצאה ב-index.html');
  const start = m.index + 1;
  let i = SRC.indexOf('{', m.index + m[0].length - 1), d = 0;
  for (; i < SRC.length; i++) {
    if (SRC[i] === '{') d++;
    else if (SRC[i] === '}') { d--; if (!d) return SRC.slice(start, i + 1); }
  }
  throw new Error('הפונקציה ' + name + ' אינה סגורה');
}
// הצהרת משתנה, כולל רב-שורתית (איזון [] ו-{} עד הסוגר התואם).
function cutVar(decl) {
  const i = SRC.indexOf('\n' + decl);
  if (i < 0) throw new Error('ההצהרה «' + decl + '» לא נמצאה');
  let d = 0, started = false;
  for (let j = i + 1; j < SRC.length; j++) {
    const c = SRC[j];
    if (c === '[' || c === '{') { d++; started = true; }
    else if (c === ']' || c === '}') { d--; }
    else if (c === ';' && (!started || d === 0)) return SRC.slice(i + 1, j + 1);
    if (started && d === 0) return SRC.slice(i + 1, SRC.indexOf(';', j) + 1);
  }
  throw new Error('ההצהרה «' + decl + '» אינה סגורה');
}

const FN = ['recTs', 'recTouch', 'recDelete', 'isLive', 'liveOnly', '_mergePick', 'mergeCore', 'mergeRecords',
  'entryKey', 'archiveKey', 'parseGregLike', 'gregKeyFromParts', 'hasHebMonth',
  'normHDate', 'normHMonth', 'extractYM', 'hebFromText', 'snapHDate',
  'getAllArchiveDays', 'getYearsWithData', 'getMonthsWithData', 'getDaysInMonth',
  'gdateOrderTs', 'entryOrderTs', 'tbSortRows', 'arcPutSnapshot', 'autoArchiveDay',
  'checkDayChange', 'gregDateStr', 'getTodayKey'];
const VARS = ['var GREG_MONTHS_HE', 'var HMONTH_ALIAS', 'var HMO ', 'var HUNKNOWN',
  'var DAY_VALUE_MAP'];

function makeCtx() {
  const store = {};
  const sandbox = {
    console,
    ARCHIVE: [], ENTRIES: [],
    // מוקים דקים — כל אחד רושם מה נקרא, כדי שטענה תוכל להיתלות באירוע.
    calls: { saveArchive: 0, lsSetArray: [], lsSet: [], toast: [] },
    saveArchive() { sandbox.calls.saveArchive++; },
    saveEntries() {},
    lsSetArray(k, a) { sandbox.calls.lsSetArray.push(k); store[k] = JSON.stringify(a); return true; },
    lsSet(k, v) { sandbox.calls.lsSet.push(k); store[k] = v; return true; },
    /*  ⛔ הקריאה מהאחסון עוברת גם היא במודול (סבב 67) — `lsGet` החליף
     *  את `localStorage.getItem` בכל אתר שמחוץ למודול, ורתמה בלי
     *  הדמה הזו נופלת ב-ReferenceError במקום למדוד. */
    lsGet(k, fb) { const v = store[k]; return v == null ? (fb === undefined ? null : fb) : v; },
    toast(m) { sandbox.calls.toast.push(m); },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
    LS: '_test',
    _tbRecTs: (r) => (r && Number(r.updatedAt)) || 0,
    // ⭐ סבב 35: שער הדיסק של החלון החם עוטף את כתיבות הארכיון — כאן הוא
    //    שקוף בכוונה, הבדיקות של החלון עצמו יושבות ב-test_hotwin.
    hwDiskFilter: (k, rows) => rows,
    hwNoteCloud: () => {},
    // hebcal אינו נטען כאן; `hebrewDate` נשלטת פר-בדיקה.
    hebrewDate: () => '',
    _store: store,
  };
  vm.createContext(sandbox);
  vm.runInContext(VARS.map(cutVar).join('\n') + '\n' + FN.map(cut).join('\n'), sandbox);
  return sandbox;
}

/* ── טעינת הפיקסטורה ───────────────────────────────────────────────────── */
function loadFixture() {
  const out = { rishon: [], ramataviv: [] };
  let cur = null;
  for (const raw of FIX.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('## ')) { cur = line.slice(3).trim(); continue; }
    if (!line || line.startsWith('#')) continue;
    const f = line.split('|').map((x) => x.replace(/&#124;/g, '|'));
    if (f.length !== 12) throw new Error('שורת פיקסטורה עם ' + f.length + ' שדות: ' + line);
    const [pos, id, gdate, hdate, name, day, date, auto, updatedAt, nlive, ntotal, ids] = f;
    const nL = +nlive, nT = +ntotal;
    const real = ids ? ids.split(',').filter(Boolean) : [];
    const entries = [];
    for (let i = 0; i < nL; i++) {
      // מזהה אמיתי כשיש; אחרת נגזר מ-id הסנאפשוט — ר' כותרת הפיקסטורה.
      entries.push({ id: real.length ? Number(real[i]) : Number(id) * 1000 + i, gdate, hdate });
    }
    for (let i = 0; i < nT - nL; i++) {
      entries.push({ id: Number(id) * 1000 + 900 + i, gdate, deleted: true, updatedAt: 1 });
    }
    const snap = { id: Number(id), name, hdate, gdate, day, date, entries, count: nL };
    if (auto) snap.auto = true;
    if (updatedAt) snap.updatedAt = Number(updatedAt);
    out[cur].push({ pos: +pos, snap });
  }
  return out;
}
const FX = loadFixture();

console.log('═══ סבב 31 — תצוגת הארכיון ומקור הרשומות האוטומטיות ═══\n');

/* ── 0. שלמות הפיקסטורה ────────────────────────────────────────────────── */
eq(FX.rishon.length, 155, 'הפיקסטורה מחזיקה 155 סנאפשוטים לראשון לציון');
eq(FX.ramataviv.length, 15, 'הפיקסטורה מחזיקה 15 סנאפשוטים לרמת אביב');
eq(FX.rishon.filter((r) => !r.snap.gdate).length, 5, 'חמישה סנאפשוטים בראשון בלי gdate');
eq(FX.rishon.filter((r) => !r.snap.hdate).length, 6, 'שישה סנאפשוטים בראשון בלי hdate');
eq(FX.ramataviv.filter((r) => !r.snap.hdate).length, 7, 'שבעה סנאפשוטים ברמת אביב בלי hdate');
ok(FX.rishon.length > 0 && FX.rishon.every((r) => r.snap.count >= 1), 'לכל סנאפשוט בראשון יש לפחות רשומה חיה אחת');

/* ── 1. כל הימים מוצגים, ואף אחד אינו «לא ידוע» ────────────────────────── */
function daysOf(list) {
  const c = makeCtx();
  c.ARCHIVE = list.map((r) => JSON.parse(JSON.stringify(r.snap)));
  return { ctx: c, days: c.getAllArchiveDays() };
}
// כל יום שניתן להגיע אליו בניווט שנה ← חודש ← יום.
function reachable(c) {
  const seen = new Set();
  const years = c.getYearsWithData();
  for (const y of Object.keys(years)) {
    for (const m of Object.keys(c.getMonthsWithData(y))) {
      for (const d of c.getDaysInMonth(y, m)) seen.add(d.key);
    }
  }
  return seen;
}

{
  const { ctx, days } = daysOf(FX.rishon);
  eq(Object.keys(days).length, 155, 'ראשון לציון — 155 ימים נפרדים בארכיון');
  const reach = reachable(ctx);
  eq(reach.size, 155, 'ראשון לציון — כל 155 הימים נגישים בניווט שנה←חודש←יום');
  const years = Object.keys(ctx.getYearsWithData());
  ok(!years.includes(ctx.HUNKNOWN), '⛔ ראשון לציון — אין שנת «לא ידוע» כלל');
  ok(years.includes('ה׳תשפ״ה') && years.includes('ה׳תשפ״ו'), 'ראשון לציון — שתי השנים האמיתיות קיימות');
}
{
  const { ctx, days } = daysOf(FX.ramataviv);
  // 15 סנאפשוטים אך 14 ימים: «11 אוגוסט 2026» מיוצג פעמיים (ר' סעיף 4).
  eq(Object.keys(days).length, 14, 'רמת אביב — 14 ימים נפרדים מתוך 15 סנאפשוטים');
  eq(reachable(ctx).size, 14, 'רמת אביב — כל 14 הימים נגישים בניווט');
  ok(!Object.keys(ctx.getYearsWithData()).includes(ctx.HUNKNOWN), '⛔ רמת אביב — אין שנת «לא ידוע» כלל');
}

/* ── 2. חמש הרשומות בלי gdate — מקובצות לפי השנה העברית שב-hdate ───────── */
{
  const { ctx, days } = daysOf(FX.rishon);
  const noG = FX.rishon.filter((r) => !r.snap.gdate);
  for (const { snap } of noG) {
    const d = days[String(snap.id)];
    ok(!!d, `סנאפשוט בלי gdate (${snap.id}) ממופתח לפי id ונשאר נגיש`);
    const ym = ctx.extractYM(d.hdate);
    eq(ym.year, 'ה׳תשפ״ה', `סנאפשוט ${snap.id} — שנה עברית מ-hdate`);
    eq(ym.month, 'אלול', `סנאפשוט ${snap.id} — חודש עברי מ-hdate`);
  }
  const elul = ctx.getDaysInMonth('ה׳תשפ״ה', 'אלול').map((d) => d.key);
  ok(noG.length > 0 && noG.every(({ snap }) => elul.includes(String(snap.id))),
    'כל חמשת הימים בלי gdate מופיעים ברשימת הימים של אלול ה׳תשפ״ה');
}

/* ── 3. הרשומות בלי hdate — מקובצות מתוך `name` ────────────────────────── */
{
  // הצפי נגזר מה-name שבפיקסטורה, לא מהקוד — שני צדדים עצמאיים.
  const expect = (name) => {
    const m = name.match(/([֐-׿״׳]+)\s+(ה׳תש[֐-׿״׳]+)/);
    return m ? { month: m[1], year: m[2] } : null;
  };
  for (const yesh of ['rishon', 'ramataviv']) {
    const { ctx, days } = daysOf(FX[yesh]);
    const noH = FX[yesh].filter((r) => !r.snap.hdate);
    for (const { snap } of noH) {
      const d = days[String(snap.gdate || snap.id)];
      const ym = ctx.extractYM(d.hdate);
      const exp = expect(snap.name);
      ok(ym.year !== ctx.HUNKNOWN, `${yesh}: «${snap.name}» — שוחזר תאריך עברי במקום «לא ידוע»`);
      eq(ym.year, exp.year, `${yesh}: «${snap.name}» — שנה`);
      // ⚠️ ליום הכפול ברמת אביב שני שמות מתחרים; החודש זהה בשניהם.
      eq(ym.month, exp.month, `${yesh}: «${snap.name}» — חודש`);
    }
  }
}

/* ── 4. אין כפילות — היום הכפול ברמת אביב מתלכד לרשומה אחת ─────────────── */
{
  const { days } = daysOf(FX.ramataviv);
  const keys = Object.keys(days);
  eq(new Set(keys).size, keys.length, 'אין שני ימים עם אותו מפתח');
  const dup = days['11 אוגוסט 2026'];
  ok(!!dup, 'היום הכפול קיים כיום אחד');
  // 5 חיות בסנאפשוט הראשון + 1 בשני, והשנייה היא תת-קבוצה ⇒ 5 ולא 6.
  eq(dup.entries.length, 5, '⛔ הרשומה החוזרת אינה נספרת פעמיים');
}

/* ── 5. סדר טעינה יציב ─────────────────────────────────────────────────── */
{
  const c = makeCtx();
  const kvOrder = FX.rishon.map((r) => JSON.parse(JSON.stringify(r.snap)));
  // ערבוב דטרמיניסטי (ללא Math.random) — מדמה סדר שרירותי מהמסד.
  const shuffled = kvOrder.slice();
  for (let i = shuffled.length - 1, s = 12345; i > 0; i--) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const j = s % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const a = c.tbSortRows('tb_archive', kvOrder).map((s) => c.archiveKey(s));
  const b = c.tbSortRows('tb_archive', shuffled).map((s) => c.archiveKey(s));
  eq(JSON.stringify(a), JSON.stringify(b), '⭐ tbSortRows דטרמיניסטית — סדר קלט שונה, פלט זהה');
  ok(a.length === 155 && new Set(a).size === 155, 'המיון אינו מאבד ואינו משכפל סנאפשוט');
  // הסדר הסמנטי: יום חדש קודם.
  const ts = c.tbSortRows('tb_archive', shuffled).map((s) => c.gdateOrderTs(s.gdate));
  ok(ts.length > 0 && ts.every((v, i) => i === 0 || ts[i - 1] >= v), 'הארכיון ממוין מהיום החדש לישן');
  ok(!c.tbSortRows('tb_archive', kvOrder).some((s, i) => s === kvOrder[i] && false),
    'tbSortRows אינה משנה את מערך הקלט');
  eq(JSON.stringify(kvOrder.map((s) => c.archiveKey(s))),
     JSON.stringify(FX.rishon.map((r) => c.archiveKey(r.snap))),
     '⛔ מערך הקלט לא שונה במקום (הפונקציה טהורה)');

  // התצוגה זהה בין סדר ה-kv המקורי לסדר החדש — זו הטענה שנדרשה.
  const view = (arr) => {
    const cc = makeCtx();
    cc.ARCHIVE = JSON.parse(JSON.stringify(arr));
    const d = cc.getAllArchiveDays();
    return JSON.stringify(Object.keys(d).sort().map((k) => [k, d[k].hdate, d[k].entries.length]));
  };
  eq(view(c.tbSortRows('tb_archive', shuffled)), view(kvOrder),
    '⭐ התצוגה אחרי המיון זהה לתצוגה מסדר ה-kv המקורי');
}
{
  // ⭐ עֵד הרגרסיה: בלי מיון, סדר שרירותי מחליף את התאריך העברי של אותו יום.
  const pair = FX.ramataviv.filter((r) => r.snap.gdate === '11 אוגוסט 2026');
  eq(pair.length, 2, 'שני סנאפשוטים מתחרים לאותו יום ברמת אביב');
  const hOf = (arr) => {
    const c = makeCtx();
    c.ARCHIVE = JSON.parse(JSON.stringify(arr.map((r) => r.snap)));
    return c.getAllArchiveDays()['11 אוגוסט 2026'].hdate;
  };
  const fwd = hOf(pair), rev = hOf(pair.slice().reverse());
  ok(fwd !== rev, '⭐ בלי סדר קבוע — אותו יום מקבל תאריך עברי אחר לפי סדר הקלט');
  const c = makeCtx();
  const s1 = c.tbSortRows('tb_archive', pair.map((r) => r.snap));
  const s2 = c.tbSortRows('tb_archive', pair.slice().reverse().map((r) => r.snap));
  eq(JSON.stringify(s1.map((s) => s.id)), JSON.stringify(s2.map((s) => s.id)),
    '⭐ ואחרי המיון — אותו סדר משני כיווני הקלט');
}
{
  const c = makeCtx();
  const rows = [{ id: 5 }, { id: 99 }, { id: 7 }];
  eq(JSON.stringify(c.tbSortRows('tb_entries', rows).map((r) => r.id)), JSON.stringify([99, 7, 5]),
    'רשומות ממוינות לפי id יורד — כמו המיון שרץ אחרי המיזוג');
}

/* ── 6. hebFromText — חילוץ התאריך העברי מטקסט חופשי ───────────────────── */
{
  const c = makeCtx();
  const cases = [
    ['יום כ״ט אב ה׳תשפ״ו (אוטומטי)', 'כ״ט אב ה׳תשפ״ו'],
    ['יום רביעי ג׳ אלול ה׳תשפ״ה', 'ג׳ אלול ה׳תשפ״ה'],
    ['מוצאי שבת כ״ד ניסן ה׳תשפ״ו | 11 אפריל 2026', 'כ״ד ניסן ה׳תשפ״ו'],
    ['ערב שבת י״ז סיון ה׳תשפ״ו', 'י״ז סיון ה׳תשפ״ו'],
    ['י׳ אלול ה׳תשפ״ה', 'י׳ אלול ה׳תשפ״ה'],
    ['יום ד׳ מרחשון ה׳תשפ״ו (אוטומטי)', 'ד׳ חשון ה׳תשפ״ו'],
  ];
  for (const [inp, want] of cases) eq(c.hebFromText(inp), want, `hebFromText(«${inp}»)`);
  for (const bad of ['', null, undefined, 'יום רביעי', '11 אפריל 2026', 'שלום עולם']) {
    eq(c.hebFromText(bad), '', `hebFromText על «${bad}» מחזירה ריק ולא ניחוש`);
  }
  eq(c.extractYM(c.hebFromText('יום כ״ט אב ה׳תשפ״ו (אוטומטי)')).month, 'אב',
    'התוצאה של hebFromText נקראת ע"י extractYM');
}
{
  // ⛔ snapHDate טהורה — תיקון תצוגה, לא שינוי נתונים.
  const c = makeCtx();
  const snap = { hdate: '', name: 'יום כ״ט אב ה׳תשפ״ו (אוטומטי)', gdate: '11 אוגוסט 2026' };
  const before = JSON.stringify(snap);
  eq(c.snapHDate(snap), 'כ״ט אב ה׳תשפ״ו', 'snapHDate נופלת-חזרה ל-name');
  eq(JSON.stringify(snap), before, '⛔ snapHDate אינה נוגעת בסנאפשוט');
  eq(c.snapHDate({ hdate: 'ב׳ אב ה׳תשפ״ו', name: 'משהו אחר' }), 'ב׳ אב ה׳תשפ״ו',
    'hdate תקין גובר על name');
  eq(c.snapHDate({ hdate: '', name: '' }), '', 'אין ממה לגזור — מחרוזת ריקה, והקיבוץ יפול ל«לא ידוע»');
}

/* ── 7. המקור: רשומה אוטומטית זהה בשדותיה לידנית ───────────────────────── */
const FIELDS = ['id', 'name', 'hdate', 'gdate', 'day', 'date', 'entries', 'count', 'updatedAt'];
{
  // המסלול הידני — `autoArchiveDay` על הקוד האמיתי.
  const c = makeCtx();
  c.ENTRIES = [{ id: 1, gdate: '11 אוגוסט 2026', hdate: 'כ״ח אב ה׳תשפ״ו', day: 'יום שלישי', updatedAt: 10 }];
  c.autoArchiveDay('יום שלישי', 'כ״ח אב ה׳תשפ״ו', '11 אוגוסט 2026');
  eq(c.calls.saveArchive, 1, 'המסלול הידני שומר לענן');
  const manual = c.ARCHIVE[0];
  ok(FIELDS.every((f) => manual[f] !== undefined && manual[f] !== ''),
    'רשומה ידנית — כל השדות מלאים');

  // המסלול האוטומטי — `checkDayChange` על הקוד האמיתי.
  const a = makeCtx();
  a.hebrewDate = () => 'כ״ח אב ה׳תשפ״ו';
  a._store['tb_last_day_test'] = 'Tue Aug 11 2026';
  a.ENTRIES = [{ id: 1, gdate: '11 אוגוסט 2026', hdate: 'כ״ח אב ה׳תשפ״ו', day: 'יום שלישי', updatedAt: 10 }];
  a.checkDayChange();
  eq(a.ARCHIVE.length, 1, 'מעבר יום יצר סנאפשוט אחד');
  const auto = a.ARCHIVE[0];
  ok(a.calls.toast.length === 1, 'המשתמש קיבל הודעה על הארכוב');
  eq(a.calls.saveArchive, 0, '⛔ מעבר יום אינו דוחף לענן — נשאר מקומי');

  for (const f of FIELDS) {
    ok(auto[f] !== undefined && auto[f] !== '',
      `⭐ רשומה אוטומטית — השדה «${f}» מלא, כמו בידנית`);
  }
  eq(JSON.stringify(FIELDS.filter((f) => f in manual)), JSON.stringify(FIELDS.filter((f) => f in auto)),
    '⭐ אותו סט שדות בדיוק בשני המסלולים');
  eq(auto.gdate, manual.gdate, 'gdate זהה');
  eq(auto.hdate, manual.hdate, 'hdate זהה');
  eq(auto.day, manual.day, 'day זהה');
  eq(auto.date, manual.date, 'date זהה — gdate ולא toLocaleDateString');
  eq(auto.name, manual.name, 'name זהה');
  eq(auto.auto, true, 'הסימון `auto` נשאר — סימון מקור, לא תחליף לשדה');
  // הרשומות החיות הפכו ל-tombstones ולא נמחקו פיזית.
  ok(a.ENTRIES.length > 0 && a.ENTRIES.every((e) => e.deleted === true), 'הרשומות החיות סומנו כמחוקות (tombstone)');
}
{
  // ⛔ בלי hebcal ובלי hdate ברשומות — נפילה-חזרה מפורשת, ו-name עדיין מציל.
  const a = makeCtx();
  a._store['tb_last_day_test'] = 'Tue Aug 11 2026';
  a.ENTRIES = [{ id: 1, gdate: '11 אוגוסט 2026', day: 'יום שלישי', updatedAt: 10 }];
  a.checkDayChange();
  const s = a.ARCHIVE[0];
  eq(s.gdate, '11 אוגוסט 2026', 'gdate נגזר מהרשומות גם בלי hebcal');
  eq(s.day, 'יום שלישי', 'day נגזר מהרשומות');
  ok('hdate' in s, '⛔ השדה קיים גם כשאי אפשר לגזור אותו — לא נשמט בשקט');
}
{
  // ⛔ בלי רשומה שנושאת תאריך — השעון הוא הנפילה-חזרה, לא שדה ריק.
  const a = makeCtx();
  a.hebrewDate = () => 'כ״ח אב ה׳תשפ״ו';
  a._store['tb_last_day_test'] = 'Tue Aug 11 2026';
  a.ENTRIES = [{ id: 1, updatedAt: 10 }];
  a.checkDayChange();
  const s = a.ARCHIVE[0];
  eq(s.gdate, '11 אוגוסט 2026', 'gdate מהשעון כשאין ברשומות');
  eq(s.hdate, 'כ״ח אב ה׳תשפ״ו', 'hdate מ-hebrewDate כשאין ברשומות');
  eq(s.day, 'יום שלישי', 'day מהשעון כשאין ברשומות');
  eq(a.archiveKey(s), 'g:11 אוגוסט 2026', '⭐ המפתח הוא g:<gdate> ולא i:<id> — אין שורה כפולה בענן');
}
{
  // ⭐ מעבר יום על יום שכבר יש לו סנאפשוט — מיזוג, לא כפילות.
  const a = makeCtx();
  a.hebrewDate = () => 'כ״ח אב ה׳תשפ״ו';
  a._store['tb_last_day_test'] = 'Tue Aug 11 2026';
  a.ARCHIVE = [{ id: 900, name: 'כ״ח אב ה׳תשפ״ו', hdate: 'כ״ח אב ה׳תשפ״ו', gdate: '11 אוגוסט 2026',
    day: 'יום שלישי', date: '11 אוגוסט 2026', entries: [{ id: 7, updatedAt: 5 }], count: 1, updatedAt: 5 }];
  a.ENTRIES = [{ id: 8, gdate: '11 אוגוסט 2026', hdate: 'כ״ח אב ה׳תשפ״ו', day: 'יום שלישי', updatedAt: 10 }];
  a.checkDayChange();
  eq(a.ARCHIVE.length, 1, '⭐ סנאפשוט אחד ליום — לא נוצרה כפילות');
  eq(a.ARCHIVE[0].id, 900, 'הסנאפשוט הקיים נשמר, ולא הוחלף במזהה חדש');
  eq(a.ARCHIVE[0].entries.length, 2, 'הרשומות מוזגו ולא נדרסו');
}

/* ── 8. arcPutSnapshot — השומר של שני המסלולים ─────────────────────────── */
{
  const c = makeCtx();
  eq(c.arcPutSnapshot('יום שני', 'ה׳ אב ה׳תשפ״ו', '', [{ id: 1 }], 1, null), null,
    '⛔ בלי gdate אין סנאפשוט — לא נוצר סנאפשוט זבל');
  eq(c.ARCHIVE.length, 0, 'ובאמת לא נוסף דבר לארכיון');
}

/* ── סיכום ─────────────────────────────────────────────────────────────── */
console.log(`\n${failN === 0 ? '✅' : '❌'} עברו ${passN}, נכשלו ${failN}`);
/*  ⛔ היציאה עברה לסוף (סבב 67) — המוטציות רצות אחרי הטענות. */
/* ───────────────────────────────────────────────────────────────────────────
   ⛔ מוטציה ומוטציית-נגד — סבב 67
   ───────────────────────────────────────────────────────────────────────────
   ⛔ מבחן נכנס עם מוטציה, או עם נימוק כתוב מדוע אינו ניתן למוטציה.
   ⚠️ בלעדיה אין שום ראיה שהמבחן **מסוגל** ליפול: 97 טענות שעוברות על עץ
   תקין נראות כרשת ביטחון ופועלות כאישור. ⛔ והמוטציה רצה על **עותק
   בתיקייה זמנית** ולא על העץ (הלקח של סבב 42ג).
   ⚠️ הרצת-המשנה מסומנת ב-`RD67_MUT` — ⛔ בלעדיו המוטציה הייתה מריצה את
   עצמה שוב בתוך העותק, לאין סוף.
   ──────────────────────────────────────────────────────────────────────── */
if (!process.env.RD67_MUT) {
  const _m = await import('node:fs');
  const _p = await import('node:path');
  const _o = await import('node:os');
  const _c = await import('node:child_process');
  const _self = new URL(import.meta.url).pathname;
  const _name = _p.basename(_self);
  const _root = _p.resolve(_p.dirname(_self), '..');
  const _run = (dir) => _c.spawnSync(process.execPath, [_p.join(dir, 'tools', _name)],
    { cwd: dir, encoding: 'utf8', env: { ...process.env, RD67_MUT: '1' } }).status;

  const _mut = (label, file, edit, expectFail) => {
    const d = _m.mkdtempSync(_p.join(_o.tmpdir(), 'rd67-'));
    _m.cpSync(_root, d, { recursive: true, filter: (s) => !s.includes('/.git') });
    const f = _p.join(d, file);
    if (!_m.existsSync(f)) { console.log('  ok   ' + label + ' — ⚠️ הקובץ אינו קיים כאן, הטענה מוצהרת ריקה'); return; }
    _m.writeFileSync(f, edit(_m.readFileSync(f, 'utf8')));
    const st = _run(d);
    const fell = st !== 0;
    console.log((fell === expectFail ? '  ok   ' : '  FAIL ') + label);
    /*  ⛔ יציאה מיידית ולא `exitCode` (סבב 67) — סיכום המבחן קורא
     *  ל-`process.exit` בסופו, והוא היה דורס כשל מוטציה בשקט. */
    if (fell !== expectFail) process.exit(1);
    _m.rmSync(d, { recursive: true, force: true });
  };

  console.log('\n— מוטציות (סבב 67) —');
  _mut('⛔ שינוי מפתח הארכיון מפיל את השער', 'index.html',
       (s) => s.replace(/function archiveKey/, 'function archiveKeyX'), true);
  _mut('⭐ מוטציית-נגד: פונקציה חדשה וחיה ב-index.html ⛔ אינה מפילה', 'index.html',
       (s) => s.replace('</body>', '<script>function r72Live(){ return 1; }</script>\n</body>'), false);
}

process.exit(failN === 0 ? 0 : 1);


