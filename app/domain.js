// app/domain.js — הסנכרון, המיזוג, הארכיון והתאריכים
import { HE_COLLATOR, MSG_KV_BAD, MSG_SAVED_LOCAL, MSG_SERVER_ERR, MSG_SYNC_BACK, app, dayIso,
         dayNoon, dayToday, kvParse, withTimeout } from '../core/util.js';
import { _rowsPaged, ctxEpoch, ctxStale, idEq, mergeCore, mergeWinner, pendConfirmPush, pendHas,
         pendMark, plStampWrite, pushTable, sbWatch, schedulePush } from '../core/sync.js';
import { hwDiskFilter, hwNoteCloud, lsGet, lsSetArray } from '../core/storage.js';
import { logAction } from '../core/backup.js';
import { pullRender, toast } from '../core/ui.js';
import { hebrewDate } from '../core/hebrew.js';
import { CATS_RESET_LS, DAY_VALUE_MAP, HMO, HUNKNOWN, MSG_CLOUD_NO_FANOUT, MSG_LOCAL_ONLY,
         MSG_SAVED_CLOUD, PK_ARC, PK_ENTRY, PK_SET, SB_KEY, SB_URL, SET_PUSH,
         YA_ROW_TABLES, YESHIVOT } from './constants.js';
import { S, shell } from './state.js';

// סיומת מפתח האחסון פר-מוסד — בידוד אופליין
function yaSuffix(y) { return '_' + y; }

// בסיס שנכתב עם סיומת המוסד ואינו כאן — המפתח שלו נמחק בעלייה.
function yaLsBases() {
  return ['ya_entries', 'ya_archive', 'ya_cats',
          CATS_RESET_LS, 'ya_last_day',
          'ya_pending', 'ya_last_backup', 'ya_log_queue'];
}

function _yaMarkPushed(kvKey) { S._yaPushedAt[kvKey] = Date.now(); }

function _yaPushedThrough(kvKey) { return S._yaPushedAt[kvKey] || 0; }

function _yaRecTs(r) {
  var t = r && typeof r === 'object' ? Number(r.updated_at) : NaN;
  return isFinite(t) ? t : 0;
}

// ── עדות סנכרון חלופית ──
// בדפדפן שרק קורא _yaPushedAt נשאר 0 לנצח — אז משווים פר-רשומה מול שורות הטבלה המובנית, בלי סיומת המוסד.
// נכשל סגור: נדרש מערך ולא רק ok — כשל רשת או timeout אינו מפנה דבר.
function _yaVerify(kvKey) {
  return function () {
    // העדות היא הטבלה ולא הערך השלם, ואין נפילה-חזרה אליו — הוא היה מפנה מהדיסק רשומה שהטבלה אינה מכירה.
    return yaRowsGet(kvKey).then(function (rr) {
      return (rr && rr.ok && Array.isArray(rr.data)) ? { ok: true, rows: rr.data }
                                                     : { ok: false, rows: [] };
    }, function () { return { ok: false, rows: [] }; });
  };
}

// שלוש שכבות שאין לערבב: KV_TABLE בענן, סיומת LS בדגל המקומי, וקידומת <מוסד>_ במפתח הגיבוי — אחרת שני המוסדות כותבים ל-sh_backup תחת אותו מפתח.
// sources ריק לפני בחירת מוסד — KV_TABLE הוא null עד selectYeshiva.
function yaBkPrefix(y) { return (y || 'unknown') + '_'; }

// עמודות ya_entries — שדה ברשומה שיש לו עמודה נקרא בשמה, ו-data נושא רק את השאר.
var YA_ROW_COLS = ['client_id', 'yeshiva', 'archived', 'entry_date', 'created_at', 'updated_at', 'deleted', 'deleted_at', 'deleted_by'];

// ── קריאה וכתיבה של kv ──
// KV_TABLE מפריד בין המוסדות בענן והסיומת מפרידה במכשיר — סיומת שנשכחה כותבת נתוני מוסד אחד למפתח של השני.
function getSB() {
  if (!S._sb) S._sb = sbWatch(supabase.createClient(SB_URL, SB_KEY));
  return S._sb;
}

// כתיבת אות הבדיקה המחזורית בלבד — ההגדרות עוברות בשכבת הדחיפה.
// supabase-js אינו זורק בכשל רשת או הרשאה אלא מחזיר res.error — try/catch לבדו אינו רואה כשל.
async function sbSet(key, value) {
  // הטבלה וההקשר נלכדים בשורה הראשונה — await שיתווסף מעל הכתיבה יסיט אותה בשקט לטבלת המוסד החדש.
  var tbl = S.KV_TABLE, _ep = ctxEpoch();
  try {
    var sb = getSB();
    var res = await withTimeout(sb.from(tbl).upsert({key: key, value: JSON.stringify(value), updated_at: Date.now()}, {onConflict: "key"}));
    // ההקשר התחלף: ok:true היה מזכה את עד הפינוי של המוסד החדש בדחיפה שלא נעשתה עבורו.
    if (ctxStale(_ep)) return { ok: false, error: "ההקשר התחלף", ctxStale: true };
    if (res.error) {
      console.error('[sync] sbSet error', key, res.error.message, res.error);
      return { ok: false, error: res.error.message || MSG_SERVER_ERR };
    }
    console.log('[sync] sbSet ok', key);
    return { ok: true, error: null };
  } catch(e) {
    console.error('[sync] sbSet exception', key, e);
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

// מפתח חסר (PGRST116 מ-single()) הוא תוצאה ריקה ולא כשל.
async function sbGetResult(key) {
  var tbl = S.KV_TABLE; // נלכדת בכניסה — החלפת מוסד באמצע ההמתנה משנה את הגלובלי
  try {
    var sb = getSB();
    var res = await withTimeout(sb.from(tbl).select("value").eq("key", key).single());
    if (res.error) {
      var missing = res.error.code === "PGRST116";
      if (!missing) console.error("[sync] sbGet error [" + key + "]:", res.error.message, res.error);
      return { ok: missing, data: null, error: missing ? null : (res.error.message || MSG_SERVER_ERR) };
    }
    if (!res.data) return { ok: true, data: null, error: null };
    var pr = kvParse(key, res.data.value);
    return { ok: pr.ok, data: pr.value, bad: pr.bad, error: pr.bad ? MSG_KV_BAD : null };
  } catch(e) {
    console.error("[sync] sbGet exception [" + key + "]:", e);
    return { ok: false, data: null, error: (e && e.message) || String(e) };
  }
}

async function sbGet(key) {
  var r = await sbGetResult(key);
  return r.data;
}

// ── מנוע המיזוג ברמת רשומה ──
// היעדר רשומה אצל צד אחד אינו מחיקה — מחיקה היא deleted:true עם updated_at.
// רשומה בלי updated_at מקבלת 0 ומפסידה לכל רשומה מתוארכת, אך אינה נופלת מהמיזוג.
function recTs(r) { return _yaRecTs(r); }

function recTouch(r, ts) {
  if (r && typeof r === 'object') r.updated_at = (typeof ts === 'number') ? ts : Date.now();
  return r;
}

function isLive(r) { return !!r && !r.deleted; }

function liveOnly(arr) { return (Array.isArray(arr) ? arr : []).filter(isLive); }

// ── סדר רשומות היומן ──
// מפתח הסדר הוא created_at — רגע ב-ISO — ולא client_id: המזהה הוא uuid ואינו ניתן להשוואה.
function entryOrderTs(e) {
  var t = e ? Date.parse(e.created_at) : NaN;
  return isFinite(t) ? t : 0;
}

// אותם מפתחות משמשים את PUSH_CFG.key ואת HW_CFG.specs[].isPending — שלוש הנקודות חייבות לקרוא אותו מפתח.
function pendEntry(k) { return pendHas(PK_ENTRY + k); }

function pendArc(k) { return pendHas(PK_ARC + k); }

function yaRecId(r) { return r ? r.client_id : null; }

function mergeEntries(local, remote) { return mergeCore(local, remote, { isPending: pendEntry }); }

// סנאפשוט מזוהה ביומו — שני מכשירים שארכבו אותו יום מגיעים לאותה שורה.
function snapClientId(date) { return S.YESHIVA + ':' + date; }

// סנאפשוט נושא רק רשומות של יומו — רשומה או מצבה של יום אחר אינה נגררת אליו.
function snapOwnEntries(date, arr) {
  return (Array.isArray(arr) ? arr : []).filter(function (e) { return e && e.entry_date === date; });
}

// הרשומות שבתוך הסנאפשוט ממוזגות אחת-אחת — אחרת שני מכשירים שהוסיפו לאותו יום דורסים זה את זה.
function mergeArchive(local, remote) {
  return mergeCore(local, remote, { isPending: pendArc, mergePair: function(loc, rem, k, pend) {
    var base = mergeWinner(loc, rem, pend);
    var out = {};
    Object.keys(base).forEach(function(kk){ out[kk] = base[kk]; });
    out.entries = snapOwnEntries(base.entry_date, mergeCore(loc.entries, rem.entries, { isPending: pendEntry }));
    return out;
  } });
}

// ── הקטגוריות והמשימות ──
// קטגוריה ממוזגת במפתח id, והמשימות שבתוכה פריט-פריט במפתח id — שם המשימה, ובה updated_at ומפתחות-המשנה שלה.
// מיזוג ברמת רשומה היה מחליף את מערך המשימות כולו; והסדר נוסע עם הבסיס שהוכרע.
function catTasks(cat) { return liveOnly(cat && cat.tasks); }

function taskOf(cat, name) {
  var l = catTasks(cat);
  for (var i = 0; i < l.length; i++) if (l[i].id === name) return l[i];
  return null;
}

function taskSubs(cat, name) {
  var t = taskOf(cat, name);
  return (t && Array.isArray(t.subs)) ? t.subs : [];
}

// משימות הקטגוריה אחרי מיזוג — בסדר הבסיס, ומשימה שאינה בו נוספת בסופו.
function yaSortTasks(items, base) {
  var pos = {};
  (Array.isArray(base) ? base : []).forEach(function (t, i) { if (t && !(t.id in pos)) pos[t.id] = i; });
  return items.map(function (t, i) { return { t: t, i: (t && t.id in pos) ? pos[t.id] : 1e6 + i }; })
    .sort(function (a, b) { return a.i - b.i; }).map(function (x) { return x.t; });
}

function mergeCats(local, remote) {
  return mergeCore(local, remote, { key: 'id', isPending: function () { return pendHas(PK_SET + 'cats'); },
    mergePair: function (loc, rem, k, pend) {
      var base = mergeWinner(loc, rem, pend);
      var out = {};
      Object.keys(base).forEach(function (kk) { out[kk] = base[kk]; });
      out.tasks = yaSortTasks(mergeCore(loc.tasks, rem.tasks, { key: 'id', isPending: function () { return pend; } }), base.tasks);
      return out;
    } });
}

function yaTableOf(kvKey) { return YA_ROW_TABLES[kvKey]; }

function yaArchivedFlag(kvKey) { return kvKey === 'ya_archive'; }

function yaPendPrefix(kvKey) { return (kvKey === 'ya_archive') ? PK_ARC : PK_ENTRY; }

function yaRowOf(kvKey, rec) {
  if (!rec || rec.client_id == null) return null;
  var data = {};
  Object.keys(rec).forEach(function (k) { if (YA_ROW_COLS.indexOf(k) < 0) data[k] = rec[k]; });
  return {
    client_id: String(rec.client_id),
    yeshiva: S.YESHIVA,
    archived: yaArchivedFlag(kvKey),
    entry_date: rec.entry_date || null,
    // שורת סנאפשוט אינה רשומה — הרגע יושב בפריטים שבתוכה.
    created_at: (yaArchivedFlag(kvKey) || !rec.created_at) ? null : rec.created_at,
    updated_at: Math.round(recTs(rec)),
    deleted: !!rec.deleted,
    deleted_at: rec.deleted_at == null ? null : rec.deleted_at,
    deleted_by: rec.deleted_by == null ? null : String(rec.deleted_by),
    data: data
  };
}

// הרשומה בזיכרון היא העמודות ו-data יחד — שדה שיש לו עמודה נקרא בשמה, ו-data נושא רק את השאר.
function yaRecOf(r) {
  if (!r || r.client_id == null || !r.data || typeof r.data !== 'object') return null;
  var rec = {};
  Object.keys(r.data).forEach(function (k) { if (YA_ROW_COLS.indexOf(k) < 0) rec[k] = r.data[k]; });
  rec.client_id = String(r.client_id);
  if (r.entry_date) rec.entry_date = String(r.entry_date);
  if (r.created_at) rec.created_at = String(r.created_at);
  rec.updated_at = Number(r.updated_at) || 0;
  if (r.deleted) rec.deleted = true;
  if (r.deleted_at != null) rec.deleted_at = r.deleted_at;
  if (r.deleted_by != null) rec.deleted_by = r.deleted_by;
  return rec;
}

// ── הארכיון: ימים, שנים וחודשים ──
// ימי החודש — הראשון ראשון, לפי מפתח היום.
function yaSortDays(list) {
  return list.slice().sort(function (a, b) { return a.key < b.key ? -1 : a.key > b.key ? 1 : 0; });
}

// שנים — הראשונה ראשונה, ושנה שאינה ידועה בסוף.
function yaSortYears(list) {
  return list.slice().sort(function (a, b) {
    if (a === HUNKNOWN) return 1;
    if (b === HUNKNOWN) return -1;
    return a > b ? 1 : -1;
  });
}

// חודשים — בסדר השנה העברית, וחודש שאינו ברשימה בסוף.
function yaSortMonths(list) {
  var at = function (m) { var i = HMO.indexOf(m); return i < 0 ? 999 : i; };
  return list.slice().sort(function (a, b) { return at(a) - at(b); });
}

// ── סדר טעינה יציב ──
// Postgres אינו מבטיח סדר בלי ORDER BY — והמיון בקוד, כי client_id אינו סדר תאריכים.
function yaSortRows(kvKey, arr) {
  var a = (Array.isArray(arr) ? arr : []).slice();
  if (kvKey === 'ya_archive') {
    a.sort(function (x, y) {
      var tx = String((x && x.entry_date) || ''), ty = String((y && y.entry_date) || '');
      if (tx !== ty) return tx < ty ? 1 : -1;
      return String(x.client_id) < String(y.client_id) ? -1 : 1;
    });
  } else {
    a.sort(function (x, y) {
      // entryOrderTs ולא Number(client_id) — המזהה הוא uuid, ו-Number עליו הוא NaN
      var ix = entryOrderTs(x), iy = entryOrderTs(y);
      if (ix !== iy) return iy - ix;
      return String(x.client_id) < String(y.client_id) ? -1 : 1;
    });
  }
  return a;
}

// ok:false פירושו «אין ראיה» — אין להחזיר ok:true על תשובה שאינה מערך: מערך ריק ייקרא «הענן ריק» וימחק.
async function yaRowsGet(kvKey) {
  var t = yaTableOf(kvKey);
  if (!t || !S.KV_TABLE || !S.YESHIVA) return { ok: false, data: null };
  // המוסד נלכד בכניסה — _rowsPaged קורא לסגור אחרי כל await, והחלפת מוסד באמצע הייתה משרשרת עמודים של שני מוסדות.
  var yesh = S.YESHIVA, _ep = ctxEpoch();
  try {
    var sb = getSB();
    if (!sb) return { ok: false, data: null };
    // החלון הוא דגל archived — היומן החי והארכיון הם שני מסלולי משיכה באותה טבלה.
    var rows = await _rowsPaged(function () {
      var q = sb.from(t).select('client_id,entry_date,created_at,updated_at,deleted,deleted_at,deleted_by,data').eq('yeshiva', yesh);
      if (t === 'ya_entries') q = q.eq('archived', yaArchivedFlag(kvKey));
      return q;
    }, 'client_id', null);
    if (!rows) return { ok: false, data: null };
    var out = [];
    rows.forEach(function (r) {
      var rec = yaRecOf(r);
      if (rec) out.push(rec);
    });
    if (ctxStale(_ep)) return { ok: false, data: null };
    return { ok: true, data: yaSortRows(kvKey, out) };
  } catch (e) { return { ok: false, data: null }; }
}

// upsert עם onConflict: 'client_id' ולא insert — ניסיון חוזר אחרי תשובה שאבדה ברשת חייב להיות אידמפוטנטי.
// rows הן הרשומות המקומיות, וצורת השורה נגזרת כאן — מפתח הסימון נקרא מהן ולא מהשורה שנשלחה.
async function yaSendRows(kvKey, recs, ep) {
  var t = yaTableOf(kvKey);
  var sb = getSB();
  // היעדר לקוח נרשם ככשל רשת ולא ככשל סמכותי — השורה כלל לא נשלחה, והסימון חייב להישאר.
  if (!sb) throw new Error('failed to reach cloud');
  if (ctxStale(ep)) throw new Error('failed to reach cloud');
  var rows = recs.map(function (rec) { return yaRowOf(kvKey, rec); }).filter(function (r) { return !!r; });
  var res = await withTimeout(sb.from(t).upsert(rows, { onConflict: 'client_id' }));
  if (!res || res.error) return res || { error: { message: 'upsert failed' } };
  return {};
}

// ── ההגדרות ──
// הכתיבה אינה פונה לענן — המפתח מסומן ממתין ונדחף ב-schedulePush.
// מפתח שנכתב מקומית ואינו ב-YA_SET_VALUES לא עולה לעולם.
var YA_SET_VALUES = {
  cats:      function () { return S.CATS; }
};

function yaSetDirty(keys) {
  keys.forEach(function (k) { pendMark(PK_SET + k); });
  schedulePush();
}

// הערך נלקח מהזיכרון ברגע הדחיפה — שתי כתיבות לפני הדחיפה הן מחזור אחד; הסינון לממתין בשכבת הדחיפה.
function yaSetRows() {
  return Object.keys(YA_SET_VALUES).map(function (k) {
    return { key: k, value: JSON.stringify(YA_SET_VALUES[k]()), updated_at: Date.now() };
  });
}

// הטבלה נלכדה עם ההקשר — החלפת מוסד באמצע מחזירה כשל רשת, והסימון נשאר.
async function yaSendSettings(tbl, rows, ep) {
  var sb = getSB();
  if (!sb || !tbl || ctxStale(ep)) throw new Error('failed to reach cloud');
  return withTimeout(sb.from(tbl).upsert(rows, { onConflict: 'key' }));
}

// ── המיון היחיד לרשומות היומן ──
// שש רמות — משווה שעוצר אחרי תת-המשימה משאיר רשומות זהות בסדר ההכנסה.
// המזהה הוא הרמה האחרונה — בלעדיו רשומות זהות מתחלפות בין רינדור לרינדור.
function yaSortEntries(list) {
  var arr = Array.isArray(list) ? list.slice() : [];
  var catOrder = {};
  S.CATS.forEach(function (cat, ci) { catOrder[cat.id] = ci; });
  // קטגוריה שאינה ברשימה נופלת לסוף — קטגוריה שנמחקה משאירה רשומות היסטוריות.
  var rank = function (e) {
    var ca = catOrder[e.cat] !== undefined ? catOrder[e.cat] : 99;
    var cat = S.CATS.find(function (c) { return c.id === e.cat; });
    var ta = cat ? catTasks(cat).map(function (t) { return t.id; }).indexOf(e.task) : -1;
    var sa = cat ? taskSubs(cat, e.task).indexOf(e.sub) : -1;
    return [ca, ta === -1 ? 999 : ta, sa === -1 ? 999 : sa];
  };
  // המספר מושווה כמספר ולא כמחרוזת — «10» קטן מ-«9» בהשוואת מחרוזות; רשומה בלי מספר יורדת לסוף.
  var num = function (e) {
    var n = parseFloat(String(e && e.count != null ? e.count : '').replace(/[^0-9.\-]/g, ''));
    return isFinite(n) ? n : Infinity;
  };
  return arr.sort(function (a, b) {
    var ra = rank(a), rb = rank(b);
    for (var i = 0; i < 3; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    var na = String((a && a.notes) || ''), nb = String((b && b.notes) || '');
    if (na !== nb) return HE_COLLATOR.compare(na, nb);
    var qa = num(a), qb = num(b);
    if (qa !== qb) return qa - qb;
    var ia = String((a && a.client_id) || ''), ib = String((b && b.client_id) || '');
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  });
}

function saveEntries() {
  // t0 לפני הצילום — רשומה שתסומן אחריו אינה במה שנשלח עכשיו.
  var _t0 = Date.now();
  // ההקשר נלכד לפני ההמתנה — עד הפינוי וסימון הממתין שאחריה הם פר-מוסד.
  var _ep = ctxEpoch();
  lsSetArray("ya_entries"+S.LS, S.ENTRIES, _yaRecTs);
  (async function(){
    var _rows = await pushTable('ya_entries', S.ENTRIES);
    if (ctxStale(_ep)) return;
    // עד הפינוי מסומן בשכבה המשותפת ואינו נכתב כאן שוב — שני אתרי סימון הם שתי הכרעות על אותה ראיה.
    var _ok = _rows.ok;
    if (_ok) pendConfirmPush(PK_ENTRY, _t0);
    if (_ok && _rows.n) yaSyncLog('push', 'ya_entries', _rows.n);
    // אות הבדיקה המחזורית מקודם בשכבת הדחיפה רק כשנכתב משהו — קידום כאן היה חותם גם על דחיפה ריקה.
  })();
}

function saveArchive() {
  var _t0 = Date.now();
  var _ep = ctxEpoch(); // נלכד לפני ההמתנה — עד הפינוי ואישור הממתין הם פר-מוסד
  lsSetArray("ya_archive"+S.LS, hwDiskFilter('ya_archive'+S.LS, S.ARCHIVE), _yaRecTs);
  (async function(){
    // ya_archive נדחף ל-ya_entries עם archived=true — הארכוב הוא דגל על השורה.
    var _rows = await pushTable('ya_archive', S.ARCHIVE);
    if (ctxStale(_ep)) return;
    var _ok = _rows.ok;
    if (_ok) pendConfirmPush(PK_ARC, _t0);
    if (_ok && _rows.n) yaSyncLog('push', 'ya_archive', _rows.n);
    // אות הבדיקה המחזורית מקודם בשכבת הדחיפה בלבד — רק כשנכתב משהו.
  })();
}

// ── התאריך ──
// היום נשמר ב-entry_date בצורת ISO — צורה אחת; התאריך העברי, היום בשבוע והתאריך הלועזי לתצוגה נגזרים ממנו.
var GREG_MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

// פענוח הקלט בשדה התאריך בלבד: dd/mm/yyyy, yyyy-mm-dd וצורת התצוגה («25 נובמבר 2025»).
function parseGregLike(s) {
  s = String(s == null ? "" : s).trim();
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return _gregValid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return _gregValid(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{1,2}) (\S+) (\d{4})$/);
  var i = m ? GREG_MONTHS_HE.indexOf(m[2]) : -1;
  return (i >= 0) ? _gregValid(+m[1], i + 1, +m[3]) : null;
}

// «31/02» אינו יום — Date היה מגלגל אותו ל-3 במרץ בשקט.
function _gregValid(d, m, y) {
  var t = dayNoon(y, m - 1, d);
  return (t.getDate() === d && t.getMonth() === m - 1) ? {d:d, m:m, y:y} : null;
}

function isoFromParts(p) { return p ? dayIso(dayNoon(p.y, p.m - 1, p.d)) : ""; }

// הנגזרות — עוגן צהריים לפני כל חשבון יום.
function yaGreg(iso) { return iso ? gregDateStr(dayNoon(iso)) : ""; }
function yaHeb(iso) { return iso ? (hebrewDate(dayNoon(iso)) || "") : ""; }
function yaDayName(iso) { return iso ? (DAY_VALUE_MAP[dayNoon(iso).getDay()] || "") : ""; }

// תקתוק המשיכה אינו נרשם — הוא רץ כל 3 שניות, ו-sh_sync_log היא insert בלבד ואי-אפשר לדלל אותה.
// הרישום fire-and-forget ולעולם אינו חוסם.
function yaSyncLog(action, key, recordCount, details) {
  try { logAction(action, key, recordCount, details); } catch (e) { }
}

// ── שם החודש העברי ──
// הקיבוץ בארכיון לפי החודש העברי הנגזר — «מרחשון» ו«חשון» הם חודש אחד.
function normHDate(h) {
  if (!h) return h || "";
  return String(h).replace(/מרחשוו?ן/g, "חשון").replace(/חשוון/g, "חשון");
}

function monthKeyOf(m) {
  return normHDate(m).trim().replace(/\s+/g, " ");
}

// הפלטה יושבת ב-CSS — כאן רק סדר האותיות, והמחלקה שנגזרת ממנו מציבה את --cat.
const CAT_LETTERS = 'אבגדהוזח';

function catCls(id) {
  var i = CAT_LETTERS.indexOf(id);
  return 'cat-' + (i < 0 ? 0 : i + 1);
}

// השם נגזר מ-CATS הנוכחי — שם ששמור ברשומה מתיישן ונושא את שם המוסד שבו נוצרה; קטגוריה שאינה ברשימה מוצגת במזהה שלה.
function catLabelOf(e) {
  var c = S.CATS.find(function (x) { return x.id === e.cat; });
  return c ? c.name : e.cat;
}

function getCurrentDateKey() {
  var g = document.getElementById("gregDateInput");
  var p = parseGregLike(g ? g.value : "");
  // היום שנבחר בצורת ISO, ובהיעדרו היום — יום ריק שובר את הארכוב ואת סינון היומן.
  return p ? isoFromParts(p) : dayToday();
}

function gregDateStr(jsDate) {
  var d = jsDate.getDate(), m = jsDate.getMonth()+1, y = jsDate.getFullYear();
  return d + " " + GREG_MONTHS_HE[m-1] + " " + y;
}

// ── בניית סנאפשוט ארכיון ──
// מסלול יצירה אחד ל-autoArchiveDay ול-checkDayChange, וסנאפשוט ליום אחד — המפתח נגזר מהיום, כך ששני מכשירים מגיעים לאותה שורה.
// אינה כותבת לענן — checkDayChange חייבת להישאר מקומית עד המיזוג שאחריה.
function arcPutSnapshot(date, dayEntries, ts) {
  if (!date) return null;
  var cid = snapClientId(date);
  var existIdx = S.ARCHIVE.findIndex(function(a){ return a && a.client_id === cid; });
  var exist = existIdx >= 0 ? S.ARCHIVE[existIdx] : null;
  // מיזוג ולא החלפה: הסנאפשוט הקיים הוא הצד המרוחק — רשומה שאורכבה לא נמחקת כשעותקה החי הפך ל-tombstone,
  // אבל מחיקה אמיתית עם updated_at חדש יותר עוברת.
  var mine = snapOwnEntries(date, JSON.parse(JSON.stringify(dayEntries)));
  var snapshot = {
    client_id: cid,
    entry_date: date,
    entries: snapOwnEntries(date, mergeCore(mine, exist && isLive(exist) ? (exist.entries || []) : [])),
    updated_at: ts
  };
  if (exist) S.ARCHIVE[existIdx] = snapshot; else S.ARCHIVE.unshift(snapshot);
  pendMark(PK_ARC + cid);
  return snapshot;
}

function autoArchiveDay(date) {
  if (!date) return;
  // כולל tombstones — כך שמחיקה מהיומן מגיעה גם לסנאפשוט של אותו יום
  var dayEntries = S.ENTRIES.filter(function(e){ return e.entry_date === date; });
  if (!dayEntries.length) return;
  if (arcPutSnapshot(date, dayEntries, Date.now())) saveArchive();
}

// גוף הדחיפה בלי ההשהיה, בפונקציה משלו — כדי שמודול הניסיון החוזר יקרא לאותה דחיפה בדיוק.
async function yaSyncPushNow() {
    // t0 לפני הצילום — הורדת הסימון מרשומה שסומנה אחריו הייתה מאבדת אותה בשקט.
    var _t0 = Date.now();
    // ההקשר נלכד בכניסה — המסלול נקרא גם מהתקתוק המושהה וגם מהניסיון החוזר, ושניהם יכולים להתעורר בזמן ההחלפה.
    var _ep = ctxEpoch();
    var rEntries = await pushTable("ya_entries", S.ENTRIES);
    if (ctxStale(_ep)) return;
    var rArchive = await pushTable("ya_archive", S.ARCHIVE);
    if (ctxStale(_ep)) return;
    var rSet = await pushTable(SET_PUSH);
    if (ctxStale(_ep)) return;
    // אישור הממתין פר-קטגוריה גם כאן — זה מסלול הריקון האוטומטי, ובלעדיו הסימון שורד דחיפה שהצליחה והניסיון החוזר חוזר לנצח.
    // פר-קטגוריה ולא גורף — הצלחה באחת אינה ראיה לשנייה.
    if (rEntries.ok) pendConfirmPush(PK_ENTRY, _t0);
    if (rArchive.ok) pendConfirmPush(PK_ARC, _t0);
    if (!rEntries.ok || !rArchive.ok || !rSet.ok) {
      // אין לחתום last_changed על נתון שלא הגיע — מכשירים אחרים היו מושכים עותק ענני ישן מעל רשומות חדשות.
      // בלי רשת השמירה הצליחה במכשיר ואינה שגיאה; כשל עם רשת הוא שגיאה.
      if (!navigator.onLine) toast(MSG_SAVED_LOCAL, null, 'good');
      else toast(MSG_LOCAL_ONLY, null, 'bad');
      return;
    }
    // החותמת נכתבת אחרי הנתונים — מכשיר שרואה אותה מושך נתון שכבר בענן.
    // כאן, בשונה מ-plTouch(), הקורא זקוק לתוצאה כדי להזהיר את המשתמש.
    var stampTs = Date.now();
    var rTs = await plStampWrite(stampTs);
    if (ctxStale(_ep)) return;
    if (!rTs.ok) { toast(MSG_CLOUD_NO_FANOUT, null, 'bad'); return; }
    app.PL_CFG.note(stampTs);
    toast(MSG_SAVED_CLOUD, null, 'good');
}

// החודש והשנה העבריים מתוך התאריך העברי הנגזר.
function extractYM(heb) {
  function unknown() { return {year: HUNKNOWN, month: HUNKNOWN, order: 99}; }
  if (!heb) return unknown();
  if (!/ה׳תש/.test(heb)) return unknown();
  var parts = normHDate(heb).trim().split(" ");
  var year = "", month = "";
  for (var i = parts.length-1; i >= 0; i--) {
    if (parts[i].indexOf("׳") >= 0 && /ה׳תש/.test(parts[i])) { year = parts[i]; parts.splice(i,1); break; }
  }
  var hebrewParts = parts.filter(function(p) { return p && !/[0-9a-zA-Z]/.test(p); });
  month = monthKeyOf(hebrewParts.slice(1).join(" "));
  if (!year || HMO.indexOf(month) < 0) return unknown();
  return {year: year, month: month, order: HMO.indexOf(month)};
}

function _yaMarkSynced() {
  S._yaLastSyncAt = Date.now();
  // הכשל נשאר שקט (בדיקה מחזורית כל 3 שניות — טוסט בכל מחזור היה רעש), אבל החזרה נאמרת.
  if (S._yaNetWarned) { S._yaNetWarned = false; toast(MSG_SYNC_BACK, null, 'good'); }
  // הגיבוי והיומן אינם נתלים כאן — מנגנון שרץ רק כשהסנכרון רץ נעצר בדיוק כשאין סנכרון; הם מופעלים בעלייה.
}

// אין כאן בדיקת חותמת — מסלול שני שמכריע מתי למשוך היה מקור אמת שני מול plTick.
async function yaPullFromCloud() {
  // ההקשר נלכד כאן — המשיכה רצה כל 3 שניות, והחלפת מוסד בזמן משיכה בטיסה
  // הייתה כותבת רשומות של מוסד אחד למפתח של השני, אחרי שמפת החותמות כבר אופסה.
  var _ep = ctxEpoch(), _ls = S.LS;
  try {
    console.log("[sync] pulling data...");

    // מיזוג ברמת רשומה ולא החלפה — blob ישן עם חותמת חדשה היה מוחק עבודה שמכשיר אחר הרגע הקליד.
    // כשל מחזיר אין ראיה ולא ענן ריק — מיזוג מול מערך ריק מוחק את מה שטרם עלה.
    var _rowsE = await yaRowsGet('ya_entries');
    if (ctxStale(_ep)) { console.warn('[sync] ההקשר התחלף באמצע — המשיכה נעצרה'); return; }
    if (_rowsE.ok) {
      var cloudEntries = _rowsE.data;
      if (Array.isArray(cloudEntries)) {
        S.ENTRIES = mergeEntries(S.ENTRIES, cloudEntries);
        S.ENTRIES = yaSortRows('ya_entries', S.ENTRIES);
        lsSetArray("ya_entries"+_ls, S.ENTRIES, _yaRecTs);
        pullRender(shell.renderLog);
        console.log("[sync] merged, entries=" + liveOnly(S.ENTRIES).length +
                    " (+" + (S.ENTRIES.length - liveOnly(S.ENTRIES).length) + " tombstones)");
      }
    }
    var _rowsA = await yaRowsGet('ya_archive');
    if (ctxStale(_ep)) { console.warn('[sync] ההקשר התחלף באמצע — המשיכה נעצרה'); return; }
    if (_rowsA.ok) {
      hwNoteCloud('ya_archive'+_ls, _rowsA.data); // ראיה עננית לשער הדיסק
      var cloudArchive = _rowsA.data;
      if (Array.isArray(cloudArchive)) {
        S.ARCHIVE = mergeArchive(S.ARCHIVE, cloudArchive);
        lsSetArray("ya_archive"+_ls, hwDiskFilter('ya_archive'+_ls, S.ARCHIVE), _yaRecTs);
        var arcPanel = document.getElementById("panel-archive");
        if (arcPanel && !arcPanel.classList.contains("is-hidden") && S.arcSelDayKey) pullRender(shell.renderArcDetail);
      }
    }
  } catch(e) { S._yaNetWarned = true; console.error("[sync] error:", e); }
}

// ── בחירת מוסד ואתחול ──
// ערך פגום אחד ב-localStorage זורק לפני startApp ומשאיר מסך ריק — לכן נופלים לברירת המחדל וממשיכים לעלות.
function lsRead(key, fallback, kind) {
  var raw;
  try { raw = lsGet(key); } catch(e) { console.warn('[load] localStorage לא זמין:', e); return fallback; }
  if (raw == null || raw === "") return fallback;
  var val;
  try { val = JSON.parse(raw); } catch(e) {
    console.warn('[load] ערך פגום ב-' + key + ' — חוזרים לערך הנפילה-חזרה שנמסר', e);
    return fallback;
  }
  var ok = (kind === 'array') ? Array.isArray(val)
         : (kind === 'object') ? (val && typeof val === 'object' && !Array.isArray(val))
         : (val != null);
  if (!ok) { console.warn('[load] סוג לא צפוי ב-' + key + ' — חוזרים לערך הנפילה-חזרה שנמסר'); return fallback; }
  return val;
}

// ── משותף למסכים ──
function yaYeshiva(y) {
  for (var i = 0; i < YESHIVOT.length; i++) if (idEq(YESHIVOT[i].id, y)) return YESHIVOT[i];
  return null;
}

// בורר CSS למזהה ברשימת-היתר של תווים ולא בבריחה — ערך מסונן אינו יכול לסגור את הבורר ולהריץ בורר אחר.
function cssQ(v) {
  return String(v == null ? '' : v).replace(/[^A-Za-z0-9_-]/g, '');
}

// הסתרה במחלקה ולא ב-style.display — סגנון מוטבע גובר על כל מחלקה בגיליון.
function showEl(el, on) { if (el) el.classList.toggle("is-hidden", !on); }

export { _yaMarkPushed, _yaMarkSynced, _yaPushedThrough, _yaRecTs, _yaVerify, arcPutSnapshot,
         autoArchiveDay, catCls, catLabelOf, cssQ, entryOrderTs, extractYM, getCurrentDateKey,
         getSB, gregDateStr, isLive, isoFromParts, liveOnly, lsRead, mergeArchive, mergeCats,
         mergeEntries, parseGregLike, recTouch, saveArchive, saveEntries, sbGetResult, showEl,
         snapClientId, catTasks, taskOf, taskSubs, yaRecId, yaBkPrefix, yaDayName, yaGreg, yaHeb,
         yaLsBases, yaPendPrefix, yaPullFromCloud, yaRowsGet, yaSendRows, yaSendSettings,
         yaSetDirty, yaSetRows, yaSortDays, yaSortEntries, yaSortMonths, yaSortRows, yaSortYears,
         yaSuffix, yaSyncLog, yaSyncPushNow, yaTableOf, yaYeshiva };
