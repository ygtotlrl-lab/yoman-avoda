// app/domain.js — הסנכרון, המיזוג, הארכיון והתאריכים
import { MSG_KV_BAD, MSG_SAVED_LOCAL, MSG_SERVER_ERR, MSG_SYNC_BACK, dayNoon, kvParse,
         uniqList, withTimeout } from '../core/util.js';
import { _rowsPaged, ctxEpoch, ctxStale, mergeCore, pendConfirmPush, pendHas, pendMark,
         plStampWrite, pushTable, sbWatch, schedulePush, tombAt } from '../core/sync.js';
import { hwDiskFilter, hwNoteCloud, lsGet, lsSetArray } from '../core/storage.js';
import { logAction } from '../core/backup.js';
import { pullRender, toast } from '../core/ui.js';
import { S } from './state.js';
import { MSG_CLOUD_NO_FANOUT, MSG_LOCAL_ONLY, MSG_SAVED_CLOUD, PL_CFG, SB_KEY, SB_URL,
         SET_PUSH, YA_ROW_TABLES } from './config.js';
import { renderArcDetail } from './screens/archive.js';
import { buildCatGrid, buildSubBtns, buildTaskBtns } from './screens/entry.js';
import { renderLog } from './screens/log.js';
import { renderSettings } from './screens/settings.js';
import { HE } from './main.js';

// סיומת מפתח האחסון פר-מוסד — בידוד אופליין
function yaSuffix(y) { return '_' + y; }

// בסיס שנכתב עם סיומת המוסד ואינו כאן — המפתח שלו נמחק בעלייה.
function yaLsBases() {
  return ['ya_entries', 'ya_archive', 'ya_cats', 'ya_subs', 'ya_subs_meta',
          CATS_RESET_LS, SUBS_RESET_LS, 'ya_last_day',
          'ya_pending', 'ya_last_backup', 'ya_log_queue'];
}

function _yaMarkPushed(kvKey) { S._yaPushedAt[kvKey] = Date.now(); }

function _yaPushedThrough(kvKey) { return S._yaPushedAt[kvKey] || 0; }

function _yaRecTs(r) {
  if (!r || typeof r !== 'object') return 0;
  if (r.updatedAt) return Number(r.updatedAt) || 0;
  return _yaGdateTs(r.gdate);
}

// gdate בצורת gregDateStr («25 נובמבר 2025») ולא ISO, ומעוגן בצהריים מקומיים — חצות ועוד כפולות של 24 שעות נופל ליום הקודם.
function _yaGdateTs(g) {
  var p = gdateParse(g);
  if (!p) return 0;
  var d = dayNoon(p.y, p.m - 1, p.d);
  var t = d.getTime();
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

// ── חיבור לשכבת הדחיפה ──
// pushTable שהחזירה ok מאשרת כל רשומה שסומנה לפני הצילום — ולא _lastKnownTimestamp, שמתעדכן גם במשיכה.
var PK_ENTRY = 'entry:', PK_ARC = 'arc:', PK_SET = 'setting:';

// ── קריאה וכתיבה של kv ──
// KV_TABLE מפריד בין המוסדות בענן והסיומת מפרידה במכשיר — סיומת שנשכחה כותבת נתוני מוסד אחד למפתח של השני.
function getSB() {
  if (!S._sb) S._sb = sbWatch(supabase.createClient(SB_URL, SB_KEY));
  return S._sb;
}

// כתיבת אות הפולינג בלבד — ההגדרות עוברות בשכבת הדחיפה.
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
// היעדר רשומה אצל צד אחד אינו מחיקה — מחיקה היא deleted:true עם updatedAt.
// רשומה בלי updatedAt מקבלת 0 ומפסידה לכל רשומה מתוארכת, אך אינה נופלת מהמיזוג.
function recTs(r) {
  return (r && typeof r === 'object' && typeof r.updatedAt === 'number') ? r.updatedAt : 0;
}

function recTouch(r, ts) {
  if (r && typeof r === 'object') r.updatedAt = (typeof ts === 'number') ? ts : Date.now();
  return r;
}

function recDelete(r, ts) {
  if (r && typeof r === 'object') { r.deleted = true; r.updatedAt = (typeof ts === 'number') ? ts : Date.now(); }
  return r;
}

function isLive(r) { return !!r && !r.deleted; }

function liveOnly(arr) { return (Array.isArray(arr) ? arr : []).filter(isLive); }

// isPending נדרש — בענן החותמת היא של המכשיר שדחף, ובלעדיו עריכה מקומית שטרם עלתה נמחקת בשקט.
// dedupe: true נדרש — שתי קריאות autoArchiveDay על אותו יום מייצרות שני סנאפשוטים לאותו gdate.
// remoteDupe: 'ts' — בכפילות בתוך המערך המרוחק מנצחת החותמת הגבוהה, ובשוויון המאוחרת.
function mergeRecords(local, remote, getKey, mergePair, isPending) {
  return mergeCore(local, remote, {
    getKey: getKey, ts: recTs, mergePair: mergePair, isPending: isPending,
    keepUnversionedLocal: true, dedupe: true, remoteDupe: 'ts'
  });
}

// ── סדר רשומות היומן ──
// מפתח הסדר הוא createdAt ולא id — id הוא uuid ואינו ניתן להשוואה מספרית; updatedAt הוא הנפילה-חזרה.
function entryOrderTs(e) {
  if (!e) return 0;
  var c = Number(e.createdAt);
  if (isFinite(c) && c > 0) return c;
  var u = Number(e.updatedAt);
  return (isFinite(u) && u > 0) ? u : 0;
}

function entryKey(e) { return (e && e.id != null) ? e.id : null; }

// אותם מפתחות משמשים את yaDirtyRows ואת HW_CFG.specs[].isPending — שלוש הנקודות חייבות לקרוא אותו מפתח.
function pendEntry(k) { return pendHas(PK_ENTRY + k); }

function pendArc(k) { return pendHas(PK_ARC + k); }

function mergeEntries(local, remote) { return mergeRecords(local, remote, entryKey, null, pendEntry); }

// סנאפשוט מזוהה ב-gdate בלבד — שני מכשירים שארכבו אותו יום מייצרים id שונה.
function archiveKey(s) {
  return (s && s.gdate) ? 'g:' + s.gdate : null;
}

// הרשומות שבתוך הסנאפשוט ממוזגות אחת-אחת — אחרת שני מכשירים שהוסיפו לאותו יום דורסים זה את זה.
function mergeArchive(local, remote) {
  return mergeRecords(local, remote, archiveKey, function(loc, rem, k, pend) {
    var base = (pend || recTs(loc) > recTs(rem)) ? loc : rem; // שוויון — הענן; ממתין — המקומי
    var out = {};
    Object.keys(base).forEach(function(kk){ out[kk] = base[kk]; });
    out.entries = mergeRecords(loc.entries, rem.entries, entryKey, null, pendEntry);
    out.count = liveOnly(out.entries).length;
    return out;
  }, pendArc);
}

// tasks ממוזג פר-פריט לפי tasksMeta — מיזוג ברמת רשומה היה מחליף את המערך כולו.
// tasksMeta: מספר לפריט חי ו-{deleted, updatedAt} למחיקה — היעדר נקרא «אין לי» ולא «נמחק».
// הסדר נוסע עם הקטגוריה ומוכרע ב-updatedAt שלה.
function catKey(c) { return (c && c.letter != null) ? c.letter : null; }

function catMeta(c) { return (c && c.tasksMeta && typeof c.tasksMeta === 'object') ? c.tasksMeta : {}; }

// צד שאינו מכיר את המשימה אינו מכריע עליה — אחרת משימה שנוספה אופליין יורדת במשיכה הראשונה.
function mergeTasks(locList, locMeta, remList, remMeta) {
  var L = Array.isArray(locList) ? locList : [], R = Array.isArray(remList) ? remList : [];
  var Lm = locMeta || {}, Rm = remMeta || {};
  var lHas = {}, rHas = {}, meta = {};
  L.forEach(function (t) { lHas[t] = 1; });
  R.forEach(function (t) { rHas[t] = 1; });
  var order = uniqList(R.concat(L));
  var out = [];
  order.forEach(function (t) {
    var lKnows = !!lHas[t] || (t in Lm), rKnows = !!rHas[t] || (t in Rm);
    var useLocal = !rKnows ? true : !lKnows ? false : metaTs(Lm[t]) > metaTs(Rm[t]);
    var mv = useLocal ? Lm[t] : Rm[t];
    if (metaDeleted(mv)) { meta[t] = mv; return; }
    if (!(useLocal ? lHas[t] : rHas[t])) return;
    out.push(t);
    if (mv !== undefined) meta[t] = mv;
  });
  // סימוני מחיקה בלי פריט נשארים — כך המחיקה מתפשטת הלאה
  Object.keys(Lm).forEach(function (t) { if (!(t in meta) && metaDeleted(Lm[t])) meta[t] = Lm[t]; });
  Object.keys(Rm).forEach(function (t) {
    if (metaDeleted(Rm[t]) && (!(t in meta) || metaTs(Rm[t]) > metaTs(meta[t]))) meta[t] = Rm[t];
  });
  return { tasks: out, meta: meta };
}

function mergeCats(local, remote) {
  return mergeRecords(local, remote, catKey, function (loc, rem, k, pend) {
    var base = (pend || recTs(loc) > recTs(rem)) ? loc : rem; // שוויון — הענן
    var out = {};
    Object.keys(base).forEach(function (kk) { out[kk] = base[kk]; });
    var m = mergeTasks(loc.tasks, catMeta(loc), rem.tasks, catMeta(rem));
    out.tasks = m.tasks;
    out.tasksMeta = m.meta;
    return out;
  });
}

// מחיקת פריט מורידה אותו מהמערך ומקדמת את חותמת המפתח; מחיקת מפתח שלם היא סימון ב-SUBS_META ולא היעדר.
// המפתחות מקודדים לפי מספר הקטגוריה — מפתח שדולף באיחוד עיוור נוחת תחת קטגוריה אחרת.
// צד שאינו מכיר את המפתח אינו מכריע עליו — אחרת מפתח שנוצר אופליין יורד במשיכה הראשונה.
function mergeSubs(localSubs, localMeta, remoteSubs, remoteMetaRes) {
  var Ls = (localSubs && typeof localSubs === 'object') ? localSubs : {};
  var Rs = (remoteSubs && typeof remoteSubs === 'object') ? remoteSubs : {};
  var Lm = (localMeta && typeof localMeta === 'object') ? localMeta : {};
  var Rm = yaMetaMap(remoteMetaRes) || {};
  var subs = {}, meta = {}, keys = {};
  [Ls, Rs, Lm, Rm].forEach(function(m){
    Object.keys(m).forEach(function(k){ keys[k] = 1; });
  });
  Object.keys(keys).forEach(function(k){
    var lKnows = (k in Ls) || (k in Lm);
    var rKnows = (k in Rs) || (k in Rm);
    // «אין לי» אינו «נמחק»; ובשוויון חותמות מנצח הענן
    var useLocal = !rKnows ? true : !lKnows ? false : metaTs(Lm[k]) > yaMetaTs(remoteMetaRes, k);
    var mv = useLocal ? Lm[k] : Rm[k];
    // הסימון נשאר במפת החותמות והמפתח יורד — כך המחיקה מתפשטת הלאה
    if (metaDeleted(mv)) { meta[k] = mv; return; }
    var list = useLocal ? Ls[k] : Rs[k];
    if (list === undefined) return;
    subs[k] = uniqList(list);
    meta[k] = (mv === undefined) ? 0 : mv;
  });
  return { subs: subs, meta: meta };
}

function yaTableOf(kvKey) { return YA_ROW_TABLES[kvKey]; }

function yaArchivedFlag(kvKey) { return kvKey === 'ya_archive'; }

function yaRecKey(kvKey, rec) {
  return (kvKey === 'ya_archive') ? archiveKey(rec) : entryKey(rec);
}

function yaPendPrefix(kvKey) { return (kvKey === 'ya_archive') ? PK_ARC : PK_ENTRY; }

function yaRowOf(kvKey, rec) {
  var k = yaRecKey(kvKey, rec);
  if (k == null) return null;
  var row = {
    client_id: S.YESHIVA + ':' + k,
    yeshiva: S.YESHIVA,
    rec_key: String(k),
    updated_at: Math.round(Number(recTs(rec)) || 0),
    deleted: !!(rec && rec.deleted),
    deleted_at: (rec && rec.deleted) ? tombAt(recTs(rec)) : null,
    data: rec
  };
  // gdate נשמר לסנאפשוט כעמודת הסינון של הארכיון בענן; ברשומות יומן הוא null.
  if (kvKey === 'ya_archive') row.gdate = (rec && rec.gdate) ? String(rec.gdate) : null;
  row.archived = yaArchivedFlag(kvKey);
  return row;
}

// ── סדר טעינה יציב ──
// Postgres אינו מבטיח סדר בלי ORDER BY, ו-getAllArchiveDays לוקחת מטא-דאטה מהסנאפשוט הראשון ליום.
// order() לבדו אינו מספיק — rec_key הוא מחרוזת, ומיונה הלקסיקוגרפי אינו סדר תאריכים.
function gdateOrderTs(g) {
  var p = gdateParse(g);
  if (!p) return -1;
  return Date.UTC(p.y, p.m - 1, p.d);
}

function yaSortRows(kvKey, arr) {
  var a = (Array.isArray(arr) ? arr : []).slice();
  if (kvKey === 'ya_archive') {
    a.sort(function (x, y) {
      var tx = gdateOrderTs(x && x.gdate), ty = gdateOrderTs(y && y.gdate);
      if (tx !== ty) return ty - tx;
      return String(archiveKey(x)) < String(archiveKey(y)) ? -1 : 1;
    });
  } else {
    a.sort(function (x, y) {
      // entryOrderTs ולא Number(id) — id הוא uuid, ו-Number עליו הוא NaN
      var ix = entryOrderTs(x), iy = entryOrderTs(y);
      if (ix !== iy) return iy - ix;
      return String(entryKey(x)) < String(entryKey(y)) ? -1 : 1;
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
    // החלון הוא דגל archived ולא טווח תאריכים — gdate חלקית ובשני כתיבים, ו-.gte עליה מחזיר תמונה חלקית שנראית שלמה.
    var rows = await _rowsPaged(function () {
      var q = sb.from(t).select('rec_key,updated_at,data').eq('yeshiva', yesh);
      if (t === 'ya_entries') q = q.eq('archived', yaArchivedFlag(kvKey));
      return q;
    }, 'rec_key', null);
    if (!rows) return { ok: false, data: null };
    var map = {}, out = [];
    rows.forEach(function (r) {
      if (!r || !r.data) return;
      map[String(r.rec_key)] = Number(r.updated_at) || 0;
      out.push(r.data);
    });
    // מפת החותמות היא מצב פר-מוסד — כתיבה אחרי החלפה הייתה ממלאת אותה בחותמות המוסד הקודם.
    if (ctxStale(_ep)) return { ok: false, data: null };
    S._yaRemote[kvKey] = map;
    return { ok: true, data: yaSortRows(kvKey, out) };
  } catch (e) { return { ok: false, data: null }; }
}

// רשומה ממתינה נחשבת תמיד לדחיפה — בלי בדיקת הממתין היא נשארת מסומנת לנצח ואינה נדחפת.
function yaDirtyRows(kvKey, arr) {
  var map = S._yaRemote[kvKey], pre = yaPendPrefix(kvKey), out = [];
  (Array.isArray(arr) ? arr : []).forEach(function (rec) {
    var k = yaRecKey(kvKey, rec);
    if (k == null) return;
    var ts = Math.round(Number(recTs(rec)) || 0);
    var known = map ? map[String(k)] : undefined;
    if (map === null || known === undefined || ts > known || pendHas(pre + k)) {
      var row = yaRowOf(kvKey, rec);
      if (row) out.push(row);
    }
  });
  return out;
}

// upsert עם onConflict: 'client_id' ולא insert — ניסיון חוזר אחרי תשובה שאבדה ברשת חייב להיות אידמפוטנטי.
async function yaSendRows(kvKey, rows, ep) {
  var t = yaTableOf(kvKey);
  var sb = getSB();
  // היעדר לקוח נרשם ככשל רשת ולא ככשל סמכותי — השורה כלל לא נשלחה, והסימון חייב להישאר.
  if (!sb) throw new Error('failed to reach cloud');
  var res = await withTimeout(sb.from(t).upsert(rows, { onConflict: 'client_id' }));
  if (!res || res.error) return res || { error: { message: 'upsert failed' } };
  // ההקשר התחלף: מילוי מפת החותמות כאן היה משווה את המוסד החדש מול חותמות הקודם.
  if (ctxStale(ep)) return {};
  var map = S._yaRemote[kvKey] || (S._yaRemote[kvKey] = {});
  rows.forEach(function (r) { map[r.rec_key] = r.updated_at; });
  return {};
}

// ── ההגדרות ──
// הכתיבה אינה פונה לענן — המפתח מסומן ממתין ונדחף ב-schedulePush.
// מפתח שנכתב מקומית ואינו ב-YA_SET_VALUES לא עולה לעולם.
var YA_SET_VALUES = {
  cats:      function () { return S.CATS; },
  subs:      function () { return S.SUBS; },
  subs_meta: function () { return S.SUBS_META; }
};

function yaSetDirty(keys) {
  keys.forEach(function (k) { pendMark(PK_SET + k); });
  schedulePush();
}

// הערך נלקח מהזיכרון ברגע הדחיפה — שתי כתיבות לפני הדחיפה הן מחזור אחד.
function yaSetDirtyRows() {
  return Object.keys(YA_SET_VALUES).filter(function (k) { return pendHas(PK_SET + k); })
    .map(function (k) {
      return { key: k, value: JSON.stringify(YA_SET_VALUES[k]()), updated_at: Date.now() };
    });
}

// הטבלה נלכדה עם ההקשר — החלפת מוסד באמצע מחזירה כשל רשת, והסימון נשאר.
async function yaSendSettings(tbl, rows, ep) {
  var sb = getSB();
  if (!sb || !tbl || ctxStale(ep)) throw new Error('failed to reach cloud');
  return withTimeout(sb.from(tbl).upsert(rows, { onConflict: 'key' }));
}

// ערך חי הוא מספר ופריט שנמחק הוא {deleted, updatedAt} — החי נשאר מספר כדי שגרסה קודמת תקרא אותו כפי שקראה.
// קידוד אחד לשתי מפות החותמות — שני קידודים לאותו מושג הם שני מסלולי הכרעה.
function metaTs(v) {
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  var t = v && Number(v.updatedAt);
  return (isFinite(t) && t > 0) ? t : 0;
}

function metaDeleted(v) { return !!(v && typeof v === 'object' && v.deleted); }

// משיכה שנכשלה או ערך שאינו מפה מחזירים null — «אין ראיה»; מפתח שאינו בענן מחזיר מפה ריקה — «נמדד ואין».
// אין לקרוס את השניים — משיכה שנכשלה כמפה ריקה דורסת עריכה מקומית ומחזירה לענן מפתח שנמחק.
function yaMetaMap(res) {
  if (!res || res.ok !== true) return null;
  var m = res.data;
  if (m === null || m === undefined) return {};
  return (typeof m === 'object') ? m : null;
}

// כשל מחזיר 0 — «אין ראיה שהענן חדש יותר»: אפס מפסיד לכל עריכה מתוארכת, והזריקה אינה עוצרת את המיזוג.
function yaMetaTs(res, key) {
  try {
    var m = yaMetaMap(res);
    return m ? metaTs(m[key]) : 0;
  } catch (e) { return 0; }
}

function metaDel(ts) { return { deleted: true, updatedAt: (typeof ts === 'number') ? ts : Date.now() }; }

// חותמת ניקוי שנקבעת בענן ביד אחרי ניקוי: מכשיר שראה חותמת חדשה משלו זורק את העותק המקומי ומושך מלא, פעם אחת.
// חותמת ISO ולא מונה — השוואת מחרוזות ISO היא כרונולוגית; subs_meta חולק את חותמת subs כדי שלא ייזרקו בנפרד.
// _KEY הוא המפתח בענן בלי תחילית ו-_LS המפתח במכשיר עם תחילית — האחסון המקומי משותף לכל ה-origin.
var CATS_RESET_KEY = 'cats_reset';

var CATS_RESET_LS = 'ya_cats_reset';

var SUBS_RESET_KEY = 'subs_reset';

var SUBS_RESET_LS = 'ya_subs_reset';

function subKey(ci, taskName) { return ci + "::" + taskName; }

// ── המיון היחיד לרשומות היומן ──
// שש רמות — משווה שעוצר אחרי תת-המשימה משאיר רשומות זהות בסדר ההכנסה.
// המזהה הוא הרמה האחרונה — בלעדיו רשומות זהות מתחלפות בין רינדור לרינדור.
function yaSortEntries(list) {
  var arr = Array.isArray(list) ? list.slice() : [];
  var catOrder = {};
  S.CATS.forEach(function (cat, ci) { catOrder[cat.letter] = ci; });
  // קטגוריה שאינה ברשימה נופלת לסוף — קטגוריה שנמחקה משאירה רשומות היסטוריות.
  var rank = function (e) {
    var ca = catOrder[e.cat] !== undefined ? catOrder[e.cat] : 99;
    var cat = S.CATS.find(function (c) { return c.letter === e.cat; });
    var ta = cat ? cat.tasks.indexOf(e.task) : -1;
    var ci2 = cat ? S.CATS.indexOf(cat) : -1;
    var sk = ci2 >= 0 ? subKey(ci2, e.task) : e.task;
    var subs = S.SUBS[sk] || S.SUBS[e.task] || [];
    var sa = subs.indexOf(e.sub);
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
    if (na !== nb) return HE.compare(na, nb);
    var qa = num(a), qb = num(b);
    if (qa !== qb) return qa - qb;
    var ia = String((a && a.id) != null ? a.id : ''), ib = String((b && b.id) != null ? b.id : '');
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
    // אות הפולינג מקודם בשכבת הדחיפה רק כשנכתב משהו — קידום כאן היה חותם גם על דחיפה ריקה.
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
    // אות הפולינג מקודם בשכבת הדחיפה בלבד — רק כשנכתב משהו.
  })();
}

// ── התאריך הלועזי ──
// gdate נשמר בצורה אחת, זו של gregDateStr («25 נובמבר 2025») — הוא מפתח היום בארכיון, ושתי צורות הן שני ימים.
var GREG_MONTHS_HE = ["ינואר","פברואר","מרץ","אפריל","מאי","יוני","יולי","אוגוסט","ספטמבר","אוקטובר","נובמבר","דצמבר"];

// בפורמט השמור בלבד — כל צורה אחרת מחזירה null.
function gdateParse(s) {
  var m = String(s == null ? "" : s).trim().match(/^(\d{1,2}) (\S+) (\d{4})$/);
  var i = m ? GREG_MONTHS_HE.indexOf(m[2]) : -1;
  return (i >= 0) ? _gregValid(+m[1], i + 1, +m[3]) : null;
}

// פענוח הקלט בשדה התאריך בלבד: dd/mm/yyyy, yyyy-mm-dd והפורמט השמור — והקלט מתורגם לפורמט השמור לפני השמירה.
function parseGregLike(s) {
  s = String(s == null ? "" : s).trim();
  var m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return _gregValid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return _gregValid(+m[3], +m[2], +m[1]);
  return gdateParse(s);
}

// «31/02» אינו יום — Date היה מגלגל אותו ל-3 במרץ בשקט.
function _gregValid(d, m, y) {
  var t = dayNoon(y, m - 1, d);
  return (t.getDate() === d && t.getMonth() === m - 1) ? {d:d, m:m, y:y} : null;
}

// בדיוק הצורה של gregDateStr — כדי שמפתח משוחזר יתלכד עם מפתחות חדשים.
function gregKeyFromParts(p) { return p ? (p.d + " " + GREG_MONTHS_HE[p.m-1] + " " + p.y) : ""; }

// בלי חודש עברי מזוהה אי אפשר לנווט אל הרשומה בארכיון.
function hasHebMonth(h) { return extractYM(h).year !== HUNKNOWN; }

// תקתוק המשיכה אינו נרשם — הוא רץ כל 3 שניות, ו-sh_sync_log היא insert בלבד ואי-אפשר לדלל אותה.
// הרישום fire-and-forget ולעולם אינו חוסם.
function yaSyncLog(action, key, recordCount, details) {
  try { logAction(action, key, recordCount, details); } catch (e) { }
}

// הגדרות ושורות יומן נבנים מחדש, ולכן הציור עובר ב-pullRender — שדה פתוח בהם היה נמחק.
function yaPullDraw() {
  buildCatGrid(); buildTaskBtns(); buildSubBtns(); renderLog(); renderSettings();
}

// ── שם החודש העברי ──
// שם החודש הוא מפתח הקיבוץ של הארכיון ונכתב בצורה אחת — שינוי בו הוא המרה במסד ולא מיפוי בקוד.

// בנתונים מופיע «מרחשון» והקוד מייצר «חשון» — בלי איחוד נוצרים שני כפתורי חודש באותה שנה.
// הנרמול לקריאה ולתצוגה בלבד: הרשומות נשארות כפי שהן.
function normHDate(h) {
  if (!h) return h || "";
  return String(h).replace(/מרחשוו?ן/g, "חשון").replace(/חשוון/g, "חשון");
}

// גרש עברי ׳ בלבד, לא אפוסטרוף ולא מרכאה — שתי צורות הן שני דליים בארכיון.
function monthKeyOf(m) {
  return normHDate(m).trim().replace(/\s+/g, " ");
}

// הפלטה יושבת ב-CSS — כאן רק סדר האותיות, והמחלקה שנגזרת ממנו מציבה את --cat.
const CAT_LETTERS = 'אבגדהוזח';

function catCls(letter) {
  var i = CAT_LETTERS.indexOf(letter);
  return 'cat-' + (i < 0 ? 0 : i + 1);
}

// השם נגזר מ-CATS הנוכחי — שם ששמור ברשומה מתיישן ונושא את שם המוסד שבו נוצרה.
// נפילה-חזרה לשם השמור כשהאות נמחקה — בארכיון יושבות רשומות תחת אות שאינה קיימת.
function catNameOf(e) {
  var c = S.CATS.find(function (x) { return x.letter === e.cat; });
  return c ? c.name : (e.catName || e.cat);
}

function getCurrentDateKey() {
  var g = document.getElementById("gregDateInput");
  var p = parseGregLike(g ? g.value : "");
  // הקלט נשמר בפורמט השמור בלבד, ובהיעדרו מפתח היום — gdate ריק שובר את הארכוב ואת סינון היומן.
  return p ? gregKeyFromParts(p) : getTodayKey();
}

function getTodayKey() {
  return gregDateStr(new Date());
}

function gregDateStr(jsDate) {
  var d = jsDate.getDate(), m = jsDate.getMonth()+1, y = jsDate.getFullYear();
  return d + " " + GREG_MONTHS_HE[m-1] + " " + y;
}

// ── בניית סנאפשוט ארכיון ──
// מסלול יצירה אחד ל-autoArchiveDay ול-checkDayChange — סנאפשוט בלי gdate, hdate ו-day נופל לדלי «לא ידוע».
// אינה כותבת לענן — checkDayChange חייבת להישאר מקומית עד המיזוג שאחריה.
function arcPutSnapshot(dayKey, hdate, gdate, dayEntries, ts, extra) {
  if (!gdate) return null; // סנאפשוט עם gdate ריק הוא זבל בלי מפתח מיזוג
  var existIdx = S.ARCHIVE.findIndex(function(a){ return a.gdate === gdate && isLive(a); });
  var exist = existIdx >= 0 ? S.ARCHIVE[existIdx] : null;
  // מיזוג ולא החלפה: הסנאפשוט הקיים הוא הצד המרוחק — רשומה שאורכבה לא נמחקת כשעותקה החי הפך ל-tombstone,
  // אבל מחיקה אמיתית עם updatedAt חדש יותר עוברת.
  var mergedEntries = mergeRecords(
    JSON.parse(JSON.stringify(dayEntries)),
    exist ? (exist.entries || []) : [],
    entryKey
  );
  var snapshot = {
    id: exist ? exist.id : ts,
    name: hdate || (exist ? exist.name : "") || "",
    hdate: hdate || (exist ? exist.hdate : "") || "",
    gdate: gdate,
    day: dayKey || (exist ? exist.day : "") || "",
    date: gdate,
    entries: mergedEntries,
    count: liveOnly(mergedEntries).length,
    updatedAt: ts
  };
  if (extra) Object.keys(extra).forEach(function(k){ snapshot[k] = extra[k]; });
  if (exist) S.ARCHIVE[existIdx] = snapshot; else S.ARCHIVE.unshift(snapshot);
  return snapshot;
}

function autoArchiveDay(dayKey, hdate, gdate) {
  // סינון לפי gdate ולא לפי שם היום — שמות ימים חוזרים בכל שבוע.
  if (!gdate) return;
  // כולל tombstones — כך שמחיקה מהיומן מגיעה גם לסנאפשוט של אותו יום
  var dayEntries = S.ENTRIES.filter(function(e){ return e.gdate === gdate; });
  if (!dayEntries.length) return;
  if (arcPutSnapshot(dayKey, hdate, gdate, dayEntries, Date.now(), null)) saveArchive();
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
    PL_CFG.note(stampTs);
    toast(MSG_SAVED_CLOUD, null, 'good');
}

// אין בו מרחשון — monthKeyOf ממפה אותו לחשון, אחרת לאותה שנה שני כפתורי חשוון.
// אדר ואדר א׳/ב׳ חיים זה לצד זה — בכל שנה מופיע רק אחד מהם.
var HMO = ["תשרי","חשון","כסלו","טבת","שבט","אדר","אדר א׳","אדר ב׳","ניסן","אייר","סיון","תמוז","מנחם אב","אלול"];

// הדלי לא ידוע אינו נשמט מרשימת השנים — אחרת הרשומות שבו בלתי נגישות.
var HUNKNOWN = "לא ידוע";

function extractYM(hdate) {
  function unknown() { return {year: HUNKNOWN, month: HUNKNOWN, order: 99}; }
  if (!hdate) return unknown();
  if (!/ה׳תש/.test(hdate)) return unknown();
  var parts = normHDate(hdate).trim().split(" ");
  var year = "", month = "";
  for (var i = parts.length-1; i >= 0; i--) {
    if (parts[i].indexOf("׳") >= 0 && /ה׳תש/.test(parts[i])) { year = parts[i]; parts.splice(i,1); break; }
  }
  var hebrewParts = parts.filter(function(p) { return p && !/[0-9a-zA-Z]/.test(p); });
  month = monthKeyOf(hebrewParts.slice(1).join(" "));
  if (!year || HMO.indexOf(month) < 0) return unknown();
  return {year: year, month: month, order: HMO.indexOf(month)};
}

// ── שחזור התאריך העברי ──
// סדר הנפילה-חזרה: hdate תקין, חילוץ מתוך name, ורק אז לא ידוע; זו גזירת תצוגה ואינה כותבת לסנאפשוט.
// החיתוך אחרי אסימון השנה והשלה משמאל — extractYM קורא את החודש כ-slice(1), וכל תחילית מזיזה אותו.
function hebFromText(txt) {
  var t = normHDate(String(txt == null ? "" : txt))
            .replace(/\([^)]*\)/g, " ").replace(/\|/g, " ")
            .replace(/\s+/g, " ").trim();
  if (!t) return "";
  var p = t.split(" ");
  for (var j = 0; j < p.length; j++) {
    if (/ה׳תש/.test(p[j])) { p = p.slice(0, j + 1); break; } // hdate תקין נגמר בשנה
  }
  for (var i = 0; i < p.length; i++) {
    var cand = p.slice(i).join(" ");
    if (extractYM(cand).year !== HUNKNOWN) return cand;
  }
  return "";
}

function snapHDate(rec) {
  var h = normHDate((rec && rec.hdate) || "");
  if (extractYM(h).year !== HUNKNOWN) return h;
  var t = hebFromText(rec && rec.name);
  if (t) return t;
  // נפילה-חזרה שלישית מ-gdate — תצוגה בלבד; כתיבה לסנאפשוט הייתה משנה נתוני מסד בלי שהמנהל ביקש.
  var g = gdateParse(rec && rec.gdate);
  if (g) {
    // עוגן בצהריים מקומיים — מעבר לשעון חורף מפיל חצות ליום הקודם
    var hd = hebrewDate(dayNoon(g.y, g.m - 1, g.d));
    if (hd && extractYM(hd).year !== HUNKNOWN) return hd;
  }
  return h;
}

function _yaMarkSynced() {
  S._yaLastSyncAt = Date.now();
  // הכשל נשאר שקט (פולינג כל 3 שניות — טוסט בכל מחזור היה רעש), אבל החזרה נאמרת.
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
        S.ENTRIES.sort(function(a,b){ return entryOrderTs(b) - entryOrderTs(a); });
        lsSetArray("ya_entries"+_ls, S.ENTRIES, _yaRecTs);
        pullRender(renderLog);
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
        if (arcPanel && !arcPanel.classList.contains("is-hidden") && S.arcSelDayKey) pullRender(renderArcDetail);
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

export { CATS_RESET_KEY, CATS_RESET_LS, HMO, HUNKNOWN, PK_ARC, PK_ENTRY, PK_SET,
         SUBS_RESET_KEY, SUBS_RESET_LS, _yaMarkPushed, _yaMarkSynced, _yaPushedThrough,
         _yaRecTs, _yaVerify, arcPutSnapshot, archiveKey, autoArchiveDay, catCls,
         catNameOf, entryKey, entryOrderTs, extractYM, getCurrentDateKey, getSB,
         getTodayKey, gregDateStr, hasHebMonth, isLive, liveOnly, lsRead, mergeArchive,
         mergeCats, mergeEntries, mergeSubs, metaDel, normHDate, parseGregLike,
         recDelete, recTouch, saveArchive, saveEntries, sbGetResult, snapHDate, subKey,
         yaBkPrefix, yaDirtyRows, yaLsBases, yaMetaMap, yaPendPrefix, yaPullDraw,
         yaPullFromCloud, yaRowsGet, yaSendRows, yaSendSettings, yaSetDirty,
         yaSetDirtyRows, yaSortEntries, yaSuffix, yaSyncLog, yaSyncPushNow, yaTableOf };
