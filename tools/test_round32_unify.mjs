#!/usr/bin/env node
/*  בדיקת סבב 32 — איחוד הארכיון לטבלה אחת עם דגל `archived`.
 *
 *  ⚠️ פרטי ל-yoman-avoda. ⛔ אין ליישר אותו מריפו אחר — הוא בודק את שכבת
 *     השורות של האפליקציה הזו, שאינה קיימת באף אחת מהאחיות.
 *
 *  ⚠️ הבדיקה מריצה את **הקוד האמיתי**: הפונקציות נחתכות מ-`index.html` לפי
 *     שמן (התאמת סוגריים) ורצות ב-`vm` מעל לקוח Supabase מדומה. מוטציה
 *     בקוד האמיתי מפילה טענה.
 *
 *  ⚠️ ומה שאי אפשר להריץ כאן — המיגרציות — נבדק כטקסט: ההנחות שהקוד נשען
 *     עליהן (`archived` לא-null, אינדקס מלא, `do nothing`, אי-נגיעה
 *     ב-`tb_archive`) חייבות להיות כתובות גם ב-SQL. ⛔ שני צדדים שמניחים
 *     דברים שונים הם בדיוק התקלה שאין ממנה חזרה שקטה.
 *
 *  ⛔ אין שעון ואין `setTimeout` כאן (הלקח מסבב 24) — כל טענה נמדדת על
 *     אירוע שהסתיים.
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const M4 = fs.readFileSync(path.join(ROOT, 'migrations/004_entries_archived_flag.sql'), 'utf8');
const M5 = fs.readFileSync(path.join(ROOT, 'migrations/005_merge_archive_into_entries.sql'), 'utf8');

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

const NAMES = ['recTs', 'isLive', 'liveOnly', 'mergeRecords', 'entryKey', 'mergeEntries',
  'archiveKey', 'mergeArchive', 'tbRecKey', 'tbPendPrefix', 'tbTableOf', 'tbArchivedFlag',
  'tbRowOf', 'parseGregLike', 'gdateOrderTs', 'tbSortRows',
  'tbRowsGet', 'tbDirtyRows', 'tbRowsPush'];

/* ── לקוח Supabase מדומה ────────────────────────────────────────────────
   `cols` מדמה את **עמודות הטבלה**: `upsert` של שדה שאינו בהן נכשל, בדיוק
   כמו PostgREST. ⚠️ זה מה שמאפשר לבדוק את «בטוח לפרוס לפני שהמיגרציה רצה»
   ואת האיסור לכתוב `archived` לטבלה הישנה. */
const COLS_UNIFIED = ['client_id', 'yeshiva', 'rec_key', 'gdate', 'updated_at', 'deleted', 'data', 'archived'];
const COLS_LEGACY = ['client_id', 'yeshiva', 'rec_key', 'gdate', 'updated_at', 'deleted', 'data'];

function makeEnv(opts = {}) {
  const env = {
    rows: opts.rows || [], net: opts.net !== false, upserts: [], selects: [],
    // ברירת מחדל: המיגרציה רצה. `noArchivedCol` מדמה את המצב שלפניה.
    cols: { tb_entries: opts.noArchivedCol ? COLS_LEGACY : COLS_UNIFIED, tb_archive: COLS_LEGACY },
    legacyFails: !!opts.legacyFails,
  };
  const client = {
    from(t) {
      const q = { t, cols: null, y: null, arch: null, order: null };
      const api = {
        select(c) { q.cols = c; return api; },
        eq(c, v) { if (c === 'yeshiva') q.y = v; if (c === 'archived') q.arch = v; return api; },
        order(c, o) { q.order = { col: c, opts: o }; return api; },
        then(res, rej) {
          env.selects.push({ table: q.t, yeshiva: q.y, archived: q.arch, order: q.order });
          if (!env.net) return Promise.resolve({ data: null, error: { message: 'net' } }).then(res, rej);
          if (q.arch !== null && !env.cols[q.t].includes('archived')) {
            return Promise.resolve({ data: null, error: { message: 'column "archived" does not exist' } }).then(res, rej);
          }
          const rows = env.rows.filter((r) => r._t === q.t && r.yeshiva === q.y
            && (q.arch === null || !!r.archived === q.arch));
          return Promise.resolve({ data: rows, error: null }).then(res, rej);
        },
        upsert(rows, o) {
          env.upserts.push({ table: q.t, rows, opts: o });
          if (!env.net) return Promise.resolve({ data: null, error: { message: 'net' } });
          if (env.legacyFails && q.t === 'tb_archive') {
            return Promise.resolve({ data: null, error: { message: 'legacy gone' } });
          }
          const allowed = env.cols[q.t];
          for (const r of rows) {
            for (const k of Object.keys(r)) {
              if (!allowed.includes(k)) {
                return Promise.resolve({ data: null, error: { message: 'column "' + k + '" does not exist' } });
              }
            }
          }
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
    getSB: () => client,
    withTimeout: (p) => p,
    pendHas: (k) => !!(opts.pending || {})[k],
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(cutVar('var GREG_MONTHS_HE = '), sandbox);
  vm.runInContext(cutVar('var TB_ROWS = true;'), sandbox);
  vm.runInContext(cutVar('var TB_ARC_UNIFIED = true;'), sandbox);
  vm.runInContext(cutVar('var TB_ARC_LEGACY_WRITE = true;'), sandbox);
  vm.runInContext(cutVar('var TB_ROW_TABLES = '), sandbox);
  vm.runInContext(cutVar('var _tbRemote = '), sandbox);
  if (opts.unified === false) sandbox.TB_ARC_UNIFIED = false;
  if (opts.legacyWrite === false) sandbox.TB_ARC_LEGACY_WRITE = false;
  for (const n of NAMES) vm.runInContext(cut(n), sandbox, { filename: n + '.js' });
  env.sb = sandbox;
  return env;
}

const E = (id, ts, extra = {}) => Object.assign({ id, updatedAt: ts, cat: 'א', task: 'ת' }, extra);
const S = (gdate, ts, entries = []) => ({ id: 1000 + gdate.length, gdate, updatedAt: ts, entries, count: entries.length });
const row = (t, y, rec_key, ts, data, archived) => ({ _t: t, yeshiva: y, rec_key, updated_at: ts, data, archived: !!archived });

/* ══════════════════════════════════════════════════════════════════════════
   1 · ⭐ ניתוב הטבלה — שני סוגי הרשומות לטבלה אחת
   ══════════════════════════════════════════════════════════════════════════ */
function t1() {
  const sb = makeEnv().sb;
  eq(sb.tbTableOf('tb_entries'), 'tb_entries', '1א · רשומות היומן — tb_entries');
  eq(sb.tbTableOf('tb_archive'), 'tb_entries', '1ב · ⭐ והארכיון — לאותה טבלה');
  eq(sb.tbArchivedFlag('tb_entries'), false, '1ג · הדגל של רשומת יומן — false');
  eq(sb.tbArchivedFlag('tb_archive'), true, '1ד · והדגל של סנאפשוט — true');

  // ⭐ נתיב החזרה
  const back = makeEnv({ unified: false }).sb;
  eq(back.tbTableOf('tb_archive'), 'tb_archive', '1ה · ⭐ TB_ARC_UNIFIED=false ⇒ חזרה לטבלה הישנה');
  eq(back.tbTableOf('tb_entries'), 'tb_entries', '1ו · ורשומות היומן לא מושפעות מהחזרה');
  ok(/var TB_ARC_UNIFIED = true;/.test(SRC), '1ז · והדגל קיים בקוד כדגל יחיד');
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · השורה — `archived` נכתב רק ליעד שיש בו את העמודה
   ══════════════════════════════════════════════════════════════════════════ */
function t2() {
  const sb = makeEnv().sb;
  const e = sb.tbRowOf('tb_entries', E(7, 100));
  eq(e.archived, false, '2א · רשומת יומן — archived=false');
  eq(e.rec_key, '7', '2ב · והמפתח לא השתנה');

  const a = sb.tbRowOf('tb_archive', S('3/09/2025', 200));
  eq(a.archived, true, '2ג · ⭐ סנאפשוט — archived=true');
  eq(a.rec_key, 'g:3/09/2025', '2ד · והמפתח נשאר `g:<gdate>`');
  eq(a.gdate, '3/09/2025', '2ה · ⚠️ ו-gdate נשמר גם בטבלה המאוחדת — העברה מלאה');
  eq(a.client_id, 'rishon:g:3/09/2025', '2ו · client_id לא השתנה — נתיב החזרה סימטרי');

  // ⛔ יעד ישן — בלי `archived`
  const legacy = sb.tbRowOf('tb_archive', S('3/09/2025', 200), 'tb_archive');
  eq('archived' in legacy, false, '2ז · ⛔ שורה לטבלה הישנה אינה נושאת archived');
  eq(legacy.gdate, '3/09/2025', '2ח · אבל כן את gdate');

  // ובנתיב החזרה, `tbRowOf` בלי ארגומנט שלישי כבר מכוונת לישנה
  const backSb = makeEnv({ unified: false }).sb;
  eq('archived' in backSb.tbRowOf('tb_archive', S('1/01/2026', 5)), false,
    '2ט · ⭐ ובחזרה — גם בלי ארגומנט מפורש');
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · ⛔ מרחבי המפתחות זרים — ההנחה ש-005 נשען עליה
   ══════════════════════════════════════════════════════════════════════════
   שתי הצורות חיות מעכשיו באותו `unique (yeshiva, rec_key)`. התנגשות אחת
   פירושה שסנאפשוט ורשומת יומן חולקים שורה. */
function t3() {
  const sb = makeEnv().sb;
  const entries = [E(1, 1), E(1785324660377, 1), E('12345', 1)];
  const snaps = [S('3/09/2025', 1), { id: 7, updatedAt: 1 }, { gdate: '11/08/2026', id: 9 }];
  const ek = entries.map((r) => String(sb.entryKey(r)));
  const ak = snaps.map((r) => String(sb.archiveKey(r)));
  eq(ek.filter((k) => ak.includes(k)).length, 0, '3א · ⛔ אפס חפיפה בין שני מרחבי המפתחות');
  ok(ak.every((k) => /^[gi]:/.test(k)), '3ב · מפתחות הארכיון תמיד בקידומת g:/i:');
  ok(ek.every((k) => !/^[gi]:/.test(k)), '3ג · ומפתחות היומן לעולם לא');
  ok(/join public\.tb_entries e/.test(M5) && /raise exception/.test(M5),
    '3ד · ⛔ ו-005 בודק את זה במסד ולא מניח — שער התנגשות שזורק');
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · ⭐ השליפה המסוננת — רק מה שמוצג
   ══════════════════════════════════════════════════════════════════════════ */
async function t4() {
  const env = makeEnv({
    rows: [
      row('tb_entries', 'rishon', '1', 100, E(1, 100), false),
      row('tb_entries', 'rishon', '2', 200, E(2, 200), false),
      row('tb_entries', 'rishon', 'g:3/09/2025', 300, S('3/09/2025', 300), true),
      row('tb_entries', 'rishon', 'g:4/09/2025', 400, S('4/09/2025', 400), true),
      row('tb_entries', 'ramataviv', '9', 1, E(9, 1), false),
    ],
  });
  const g = await env.sb.tbRowsGet('tb_entries');
  eq(g.ok, true, '4א · משיכת רשומות היומן הצליחה');
  eq(g.data.length, 2, '4ב · ⭐ והחזירה **רק** את הלא-מאורכבות של המוסד');
  eq(env.selects[0].archived, false, '4ג · ⭐ הסינון נעשה בשאילתה עצמה — לא בקוד');
  eq(env.selects[0].yeshiva, 'rishon', '4ד · ⛔ ולצדו סינון המוסד — אין דליפה');

  const a = await env.sb.tbRowsGet('tb_archive');
  eq(a.ok, true, '4ה · ומשיכת הארכיון מאותה טבלה הצליחה');
  eq(a.data.length, 2, '4ו · ⭐ והחזירה רק את המאורכבות');
  eq(env.selects[1].table, 'tb_entries', '4ז · ⭐ מאותה טבלה בדיוק');
  eq(env.selects[1].archived, true, '4ח · עם הדגל ההפוך');
  eq(env.selects[1].order && env.selects[1].order.col, 'rec_key',
    '4ט · ⛔ והסדר עדיין נדרש מהמסד (סבב 31) — לא נשמט באיחוד');
  eq(a.data[0].gdate, '4/09/2025', '4י · ⛔ והמיון הסמנטי נשמר — היום החדש קודם');
  eq(env.sb._tbRemote.tb_archive['g:3/09/2025'], 300, '4יא · מפת החותמות נבנתה בנפרד לכל סוג');
  eq(env.sb._tbRemote.tb_entries['1'], 100, '4יב · ואינה מעורבבת עם זו של היומן');
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · הדחיפה — טבלה מאוחדת + כתיבה כפולה לנתיב החזרה
   ══════════════════════════════════════════════════════════════════════════ */
async function t5() {
  const env = makeEnv();
  const r = await env.sb.tbRowsPush('tb_archive', [S('3/09/2025', 100)]);
  eq(r.ok, true, '5א · הדחיפה הצליחה');
  eq(env.upserts.length, 2, '5ב · ⭐ שתי כתיבות — המאוחדת והישנה');
  eq(env.upserts[0].table, 'tb_entries', '5ג · הראשונה לטבלה המאוחדת');
  eq(env.upserts[0].rows[0].archived, true, '5ד · עם הדגל');
  eq(env.upserts[0].opts.onConflict, 'client_id', '5ה · ⚠️ upsert על client_id — אידמפוטנטי');
  eq(env.upserts[1].table, 'tb_archive', '5ו · ⭐ והשנייה לטבלה הישנה — נתיב החזרה');
  eq('archived' in env.upserts[1].rows[0], false, '5ז · ⛔ בלי העמודה שאין לה');
  eq(env.upserts[1].rows[0].client_id, env.upserts[0].rows[0].client_id,
    '5ח · ⭐ ואותו client_id בשתיהן — מה שהופך את החזרה לסימטרית');

  // רשומת יומן — כתיבה אחת בלבד
  const env2 = makeEnv();
  await env2.sb.tbRowsPush('tb_entries', [E(1, 100)]);
  eq(env2.upserts.length, 1, '5ט · ⛔ רשומת יומן אינה נכתבת פעמיים');

  // ⛔ כשל בכתיבה הישנה אינו הופך את הדחיפה לכושלת
  const env3 = makeEnv({ legacyFails: true });
  const r3 = await env3.sb.tbRowsPush('tb_archive', [S('3/09/2025', 100)]);
  eq(r3.ok, true, '5י · ⛔ כשל בטבלה הישנה אינו מפיל את הדחיפה');
  eq(env3.sb._tbRemote.tb_archive['g:3/09/2025'], 100, '5יא · ומפת החותמות כן התעדכנה');

  // כיבוי הכתיבה הכפולה — הצעד הראשון לקראת מחיקת הטבלה
  const env4 = makeEnv({ legacyWrite: false });
  await env4.sb.tbRowsPush('tb_archive', [S('3/09/2025', 100)]);
  eq(env4.upserts.length, 1, '5יב · ⭐ TB_ARC_LEGACY_WRITE=false ⇒ כתיבה אחת בלבד');
  eq(env4.upserts[0].table, 'tb_entries', '5יג · ולטבלה המאוחדת');
}

/* ══════════════════════════════════════════════════════════════════════════
   6 · ⭐ בטוח לפרוס לפני שהמיגרציה רצה
   ══════════════════════════════════════════════════════════════════════════ */
async function t6() {
  const env = makeEnv({
    noArchivedCol: true,
    rows: [row('tb_entries', 'rishon', '1', 100, E(1, 100), false)],
  });
  const g = await env.sb.tbRowsGet('tb_entries');
  eq(g.ok, false, '6א · ⭐ בלי העמודה — המשיכה מחזירה ok:false, ואתר הקריאה נופל-חזרה ל-kv');
  eq(g.data, null, '6ב · ובלי נתונים');
  eq(env.sb._tbRemote.tb_entries, null, '6ג · ⛔ ומפת הענן לא נדרסה במפה ריקה');

  const p = await env.sb.tbRowsPush('tb_entries', [E(1, 100)]);
  eq(p.ok, false, '6ד · והדחיפה נכשלת — עֵד הפינוי ואישור ה-⏳ לא יינתנו');
  eq(env.sb.tbDirtyRows('tb_entries', [E(1, 100)]).length, 1,
    '6ה · ⭐ והרשומה נשארת «לדחיפה» — תנוסה שוב אחרי המיגרציה');
}

/* ══════════════════════════════════════════════════════════════════════════
   7 · ⛔ אינווריאנטות של סבבים קודמים ששרדו את האיחוד
   ══════════════════════════════════════════════════════════════════════════ */
async function t7() {
  // ⏳ מנצח בבחירת מה לדחוף (כלל ברזל 6)
  const env = makeEnv({ pending: { 'arc:g:3/09/2025': 1 } });
  env.sb._tbRemote.tb_archive = { 'g:3/09/2025': 999 };
  eq(env.sb.tbDirtyRows('tb_archive', [S('3/09/2025', 100)]).length, 1,
    '7א · ⛔ סנאפשוט מסומן ⏳ נדחף גם כשחותמת הענן חדשה יותר');
  eq(env.sb.tbPendPrefix('tb_archive'), 'arc:', '7ב · והקידומת לא השתנתה באיחוד');

  // אופליין — נכשל סגור
  const off = makeEnv({ net: false });
  eq((await off.sb.tbRowsGet('tb_archive')).ok, false, '7ג · ⛔ אופליין — אין ראיה');
  eq((await off.sb.tbRowsPush('tb_archive', [S('1/01/2026', 1)])).ok, false, '7ד · ואין דחיפה');

  // TB_ROWS=false — נתיב החזרה הרחב של סבב 30 לא נשבר
  const envOff = makeEnv();
  envOff.sb.TB_ROWS = false;
  eq((await envOff.sb.tbRowsGet('tb_archive')).ok, false, '7ה · ⛔ TB_ROWS=false עדיין מנתק הכל');
  eq(envOff.selects.length + envOff.upserts.length, 0, '7ו · ואפס נגיעה ברשת');
}

/* ══════════════════════════════════════════════════════════════════════════
   8 · המיגרציות — ההנחות שהקוד נשען עליהן כתובות גם ב-SQL
   ══════════════════════════════════════════════════════════════════════════ */
function t8() {
  // 004 — העמודות והאינדקס
  ok(/add column if not exists archived boolean not null default false/.test(M4),
    '8א · ⭐ 004 מוסיף `archived` — not null עם ברירת מחדל false');
  ok(/add column if not exists gdate text/.test(M4), '8ב · ו-gdate, כדי שההעברה תהיה מלאה');
  ok(/create index if not exists tb_entries_yeshiva_archived/.test(M4),
    '8ג · ואינדקס שתומך בשליפה המסוננת');
  ok(!/create\s+index[^;]*\bwhere\b/i.test(M4.replace(/^\s*--.*$/gm, '')),
    '8ד · ⛔ ואין בו אינדקס חלקי — הלקח מ-007 של schar');
  ok(!/create unique index[^;]*archived/i.test(M4.replace(/^\s*--.*$/gm, '')),
    '8ה · ⛔ ו-`archived` אינו נכנס לאינדקס הייחודי — אחרת ההתנגשות מותרת');

  // 005 — אדיטיביות ואידמפוטנטיות
  const body5 = M5.replace(/^\s*--.*$/gm, '');
  ok(/insert into public\.tb_entries/.test(body5) && /from public\.tb_archive/.test(body5),
    '8ו · 005 מעביר מ-tb_archive ל-tb_entries');
  ok(/on conflict \(client_id\) do nothing/.test(body5),
    '8ז · ⛔ `do nothing` ולא `do update` — הרצה חוזרת אינה דורסת שורה חדשה');
  ok(/,\s*true\b/.test(body5), '8ח · והדגל נכתב true');
  ok(!/\b(delete\s+from|truncate|drop\s+table)\b[^;]*tb_archive/i.test(body5),
    '8ט · ⛔ ו-005 אינו מוחק את tb_archive — היא נתיב החזרה');

  // 005 — שקילות דו-כיוונית
  ok(/missing_in_unified/.test(M5), '8י · ⭐ כיוון א נמדד — מה שלא הגיע');
  ok(/extra_in_unified/.test(M5), '8יא · ⭐ וכיוון ב — מה שעודף');
  ok(/body_mismatch/.test(M5), '8יב · וגם הגוף עצמו, ולא רק המפתח');
  ok(/raise exception/.test(M5) && /raise notice/.test(M5),
    '8יג · ⚠️ והחומרה אינה סימטרית — אובדן זורק, עודף מדווח');

  // נתיב חזרה וטריגר כתובים
  ok(/TB_ARC_UNIFIED/.test(M5), '8יד · נתיב החזרה מפנה לדגל שבקוד');
  ok(/שבועיים/.test(M5), '8טו · והטריגר למחיקת tb_archive כתוב');
  ok(/002/.test(M4) && /003/.test(M4) && /004/.test(M4) && /005/.test(M4),
    '8טז · ⛔ וסדר ההרצה של ארבע המיגרציות כתוב ב-004');
}

/* ── הרצה ──────────────────────────────────────────────────────────────── */
console.log('\n═══ סבב 32 — איחוד הארכיון לטבלה אחת ═══\n');
const tests = [t1, t2, t3, t4, t5, t6, t7, t8];
for (const t of tests) {
  try { await t(); }
  catch (e) { failN++; console.error(`❌ ${t.name} זרקה: ${(e && e.stack) || e}`); }
}
console.log(`\n[yoman-avoda] סבב 32 — ${passN} עברו, ${failN} נכשלו`);
process.exit(failN ? 1 : 0);
