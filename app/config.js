// app/config.js — התצורה, הישיבות, שמות הטבלאות והמחרוזות
import { appConfigure, getDeviceId } from '../core/util.js';
import { ctxEpoch, ctxStale, eraKeys, pendCount, pendHas, pushDirty } from '../core/sync.js';
import { lsClearHorizons, lsRemove, lsSetArray } from '../core/storage.js';
import { S } from './state.js';
import { PK_ARC, PK_ENTRY, PK_SET, _yaMarkPushed, _yaMarkSynced, _yaRecTs, archiveKey,
         getSB, yaBkPrefix, yaDirtyRows, yaLsBases, yaPendPrefix, yaPullFromCloud,
         yaRowsGet, yaSendRows, yaSendSettings, yaSetDirtyRows, yaSuffix,
         yaSyncPushNow, yaTableOf } from './domain.js';
import { renderLog } from './screens/log.js';
import { DOM_ACTIONS, saveRefresh } from './main.js';

// התצורה נמסרת בשומרי קריאה — חלקה מוגדר בהמשך, והשומר קורא אותה בזמן הקריאה ולא בזמן המסירה.
appConfigure({
  get BK_CFG() { return BK_CFG; },
  get DATA_ERA() { return DATA_ERA; },
  get DEV_CFG() { return DEV_CFG; },
  get DOM_ACTIONS() { return DOM_ACTIONS; },
  get ERA_CFG() { return ERA_CFG; },
  get HW_CFG() { return HW_CFG; },
  get LS_CFG() { return LS_CFG; },
  get PEND_CFG() { return PEND_CFG; },
  get PL_CFG() { return PL_CFG; },
  get PUSH_CFG() { return PUSH_CFG; },
  get RTY_CFG() { return RTY_CFG; },
  get TOAST_DEFAULT_MS() { return TOAST_DEFAULT_MS; },
  get saveRefresh() { return saveRefresh; }
});

// אין ברירת מחדל לישיבה — ישיבה שאינה במפה אינה נבחרת כלל, ואינה נכתבת לטבלה של אחרת.
var YESHIVOT = [
  { id: 'rishon',    name: 'ראשון לציון',
    full: 'ישיבת תומכי תמימים ליובאוויטש ראשון לציון',
    table: 'ya_settings_rishon',    logo: 'logos/rishon.png' },
  { id: 'ramataviv', name: 'רמת אביב',
    full: 'ישיבת תומכי תמימים ליובאוויטש רמת אביב',
    table: 'ya_settings_ramataviv', logo: 'logos/ramataviv.png' },
];

// ── שכבת Supabase ועוזרים משותפים ──
const SB_URL = self.APP.supabase.url;

const SB_KEY = self.APP.supabase.key;

// ── הודעות פר-אפליקציה ──
var MSG_SYNCED = '✅ מסונכרן';

var MSG_SYNC_FAIL_LOCAL = '⚠️ הסנכרון נכשל — עובד עם הנתונים שבמכשיר';

var MSG_SYNC_PARTIAL = '⚠️ סנכרון חלקי — נכשל: ';

var MSG_OFFLINE_LOCAL = '⚠️ אין חיבור לאינטרנט — עובד עם הנתונים שבמכשיר';

var MSG_DAY_ARCHIVED = '📅 יום חדש! הרשומות הועברו לארכיון אוטומטית';

var MSG_PICK_CATEGORY = '⚠️ יש לבחור קטגוריה';

var MSG_NEED_TASK = '⚠️ יש להזין משימה';

var MSG_NO_ROWS = 'אין רשומות';

var MSG_PDF_PREP = 'מכין PDF...';

var MSG_POPUP_BLOCKED = '⚠️ החלון נחסם — אפשר חלונות קופצים לאתר ונסה שוב';

var MSG_IMG_OFFLINE = '⚠️ יצירת התמונה לא זמינה — נדרש חיבור לאינטרנט פעם אחת';

var MSG_IMG_FAIL = '⚠️ יצירת התמונה נכשלה — נסה שוב';

var MSG_LOCAL_ONLY = '⚠️ נשמר במכשיר בלבד — הענן לא עודכן';

var MSG_CLOUD_NO_FANOUT = '⚠️ נשמר בענן, אך מכשירים אחרים לא יעודכנו כעת';

var MSG_SAVED_CLOUD = '✅ נשמר בענן';

var MSG_SUBTASK_EXISTS = '⚠️ תת-המשימה כבר קיימת';

var MSG_TASK_EXISTS = '⚠️ המשימה כבר קיימת בקטגוריה';

var MSG_INFRA_TABLE = 'טבלת התשתית';

var MSG_SYNC_LOAD_FAIL = '⚠️ לא הצליח לטעון סנכרון';

// המסך הריק אינו מבטיח פעולה — אין במסך דרך להוסיף קטגוריה, וקטגוריות המוסד נבנות במסד.
var MSG_NO_CATS = '⚠️ אין קטגוריות למוסד הזה';

var MSG_SWITCH_YESHIVA = 'החלפת ישיבה';

var MSG_ALREADY_AT = 'כבר במוסד ';

var MSG_YESHIVA_UNKNOWN = '❌ הישיבה אינה מוכרת — לא נבחרה';

var MSG_BOOT_FAIL = '⚠️ שגיאה בעליית האפליקציה — נסה לרענן';

var MSG_NOTHING_TO_SHARE = 'אין רשומות לשיתוף להיום';

var MSG_IMG_PREP = 'מכין תמונה...';

var MSG_EDIT_FORM_CLOSED = '⚠️ טופס העריכה נסגר — נסה שוב';

var MSG_ROW_GONE = '⚠️ הרשומה לא נמצאה — לא נשמר';

var MSG_CLEAR_ALL_TITLE = '🗑 מחיקת כל הרשומות';

var MSG_CLEAR_ALL_BODY = 'האם למחוק את כל רשומות היום הנוכחי?';

// ── מדיניות האחסון המקומי ──
// עד שנבחר מוסד המדיניות ריקה — אין עֵד סנכרון למוסד שלא נטען.
var LS_CFG = {
  // cachePrefix נגזר משם האפליקציה שבתצורה ולא מקידומת האחסון — שם אחסון שישתנה היה מחזיר רשימה ריקה, והבאנר היה חוזר בכל טעינה.
  cachePrefix: self.APP.id + '-',
  logKey: 'ya_ls_log',
  hzPrefix: 'ya_ls_hz_',
  // הסימן נושא את תחילית האפליקציה — ה-origin משותף, וסימן אחד היה נדרס בכל דחייה.
  dismissKey: 'ya_sw_dismissed',
  // מפתח פר-מוסד מוצהר לכל המוסדות ולא לפעיל בלבד — המוסד שאינו פתוח הוא נתון שממתין, ולא שארית.
  keys: function () {
    var out = [LS_CFG.logKey, LS_CFG.dismissKey, DEV_CFG.key].concat(eraKeys());
    YESHIVOT.forEach(function (y) {
      var sfx = yaSuffix(y.id);
      yaLsBases().forEach(function (b) { out.push(b + sfx); });
    });
    return out;
  },

  // חלון הפינוי נגזר מסוג האפליקציה — אין מספר ימים באף רשומה.
  appType: { type: 'annual', why: 'החישוב שלה נפרש על שנה — ⚠️ דוח יום נבנה מרשומות היומן ומתצלומי הארכיון, ⛔ והם נקראים לאורך שנת העבודה' },

  // אין כאן מטמון-מהירות לזרוק — כל מפתח ya_ הוא העותק המקומי עצמו, ומחיקתו מרוקנת את המסך אופליין.
  wholeKeys: [],
  // oldRecords נבנית מחדש בכל בחירת מוסד — המפתחות נושאים סיומת מוסד.
  oldRecords: [],
  // מפתח שגדל ואינו בפינוי ממלא את האחסון המשותף וחונק את כל האפליקציות שעל ה-origin.
  fixedSize: [
    { t: 'ya_cats',      why: 'קטגוריות — אות לקטגוריה, ⛔ ואינן גדלות עם הזמן' },
    { t: 'ya_subs',      why: 'תתי-קטגוריות — רשימה קבועה שנערכת בהגדרות' },
    { t: 'ya_subs_meta', why: 'חותמת לכל תת-קטגוריה — כמספרן, ⛔ ולא כמספר הימים' }
  ],

  // אין כאן תור אופליין — העֵד לסנכרון הוא _yaPushedAt פר-מפתח.
  pending: function () { return false; },
  syncedThrough: function () { return 0; }
};

var BK_CFG = {
  client: function () { return getSB(); },
  flagKey: function () { return 'ya_last_backup' + S.LS; },
  logQueueKey: function () { return 'ya_log_queue' + S.LS; },
  prefix: function () { return yaBkPrefix(S.YESHIVA); },
  // המרשם מצהיר על מפתחות הגיבוי של כל המוסדות — המוסד שאינו פתוח הוא נתון שממתין, ולא שארית.
  prefixes: function () { return YESHIVOT.map(function (y) { return yaBkPrefix(y.id); }); },
  device: function () { try { return getDeviceId(); } catch (e) { return null; } },
  user: function () { return null; },
  // ריק בכוונה — אין טבלת משתמשים ואין סוד, ומנגנון הסינון נשאר דרוך.
  secrets: [],
  sources: function () {
    if (!S.KV_TABLE) return [];
    // היומן והארכיון מגובים מטבלת השורות המאוחדת, כולל שורות archived; שאר המפתחות מקורות kv — זה ביתם היחיד בענן.
    var out = [{ kind: 'table', name: 'ya_entries', key: 'ya_entries_rows',
                 eq: ['yeshiva', S.YESHIVA], order: 'rec_key', ts: 'updated_at' }];
    // name הוא המפתח בטבלת ההגדרות, בלי תחילית; key הוא מפתח הגיבוי ב-sh_backup המשותפת לפרויקט — ושם בלי תחילית שם מתנגש.
    return out.concat([
      { kind: 'kv', table: S.KV_TABLE, name: 'cats',      key: 'ya_cats' },
      { kind: 'kv', table: S.KV_TABLE, name: 'subs',      key: 'ya_subs' },
      { kind: 'kv', table: S.KV_TABLE, name: 'subs_meta', key: 'ya_subs_meta' }
    ]);
  }
};

// ── PEND_CFG ──
// המפתח הוא פונקציה — שני המוסדות חולקים localStorage, וסימון ממתין של אחד אינו תקף לשני.
var PEND_CFG = {
  app: 'yoman-avoda',
  key: function () { return 'ya_pending' + (typeof S.LS === 'string' ? S.LS : ''); },
  // סימון ממתין שקידומתו אינה כאן יורד בעלייה — אין לו כותב, ואין שורה שתידחף ותוריד אותו.
  marks: function () { return [PK_ENTRY, PK_ARC, PK_SET]; },
  // בתום ההחזקה, תגית ממתין שנותרה צריכה להיכנס לשורות שכבר רונדרו — renderLog הוא האתר היחיד שמצייר אותה כאן.
  redraw: function () { try { renderLog(); } catch (e) { } }
};

// ── RTY_CFG ──
// אין כאן תור אופליין: הריקון הוא yaSyncPushNow, אותה דחיפה של schedulePush בלי ההשהיה.
var RTY_CFG = {
  flush:   function () { return yaSyncPushNow(); },
  pending: function () { try { return pendCount() > 0; } catch (e) { return false; } },
};

// ── PL_CFG ──
// table() נקרא בכל כתיבה ואינו נלכד — ערך שנלכד בעלייה חותם את המוסד הראשון גם אחרי ההחלפה.
// ok() הוא חותמת תצוגה בלבד — אין להזין ממנו את עד הפינוי, שהוא _yaPushedAt פר-מפתח.
var PL_CFG = {
  every:  3000,
  active: function () { return !!S.YESHIVA; },
  seen:   function () { return S._lastKnownTimestamp; },
  note:   function (ts) { S._lastKnownTimestamp = ts; },
  ok:     function () { _yaMarkSynced(); },
  pull:   function () { return yaPullFromCloud(); },
  client: function () { return getSB(); },
  table:  function () { return S.KV_TABLE; },
};

// ── PUSH_CFG ──
// ya_entries לפני ya_archive — שתיהן נכתבות לאותה טבלה בדגל שונה, והסדר משאיר את הצילום אחרי החי.
// ya_settings הוא שם לוגי ולא טבלה — הכתיבה היא ל-KV_TABLE של המוסד שנלכד.
var SET_PUSH = 'ya_settings';

var PUSH_TABLES = ['ya_entries', 'ya_archive', SET_PUSH];

var PUSH_CFG = {
  tables: PUSH_TABLES,
  chunk:  500,
  delay:  400,
  dirty:  function (t, ctx) {
    if (!S.KV_TABLE || !S.YESHIVA) return null;
    if (t === SET_PUSH) { S._yaPushEp = ctxEpoch(); S._yaPushTbl = S.KV_TABLE; return yaSetDirtyRows(); }
    if (!yaTableOf(t)) return null;
    S._yaPushEp = ctxEpoch();
    return yaDirtyRows(t, ctx || (t === 'ya_archive' ? S.ARCHIVE : S.ENTRIES));
  },
  key:    function (t, row) { return t === SET_PUSH ? PK_SET + row.key : yaPendPrefix(t) + row.rec_key; },
  send:   function (t, rows) {
    return t === SET_PUSH ? yaSendSettings(S._yaPushTbl, rows, S._yaPushEp) : yaSendRows(t, rows, S._yaPushEp);
  },
  mark:   function (t) { if (!ctxStale(S._yaPushEp)) _yaMarkPushed(t); },
  run:    function () { yaSyncPushNow(); },
};

// ── HW_CFG ──
// החלון החם הוא archived=false: סנאפשוט ארכיון שאינו ממתין ואומת בענן מתפנה מהמכשיר.
// admin מחזירה תמיד אמת — אין כאן משתמשים, והמכשיר הוא של המנהל.
var HW_CFG = {
  enabled: true,
  admin: function () { return true; },
  specs: [{
    key: function () { return 'ya_archive' + S.LS; },
    label: 'ארכיון ימים',
    inWindow: function () { return false; },
    idOf: function (r) { return archiveKey(r); },
    ts: function (r) { return _yaRecTs(r); },
    isPending: function (r) { return pendHas(PK_ARC + archiveKey(r)); },
    fetch: async function () {
      var r = await yaRowsGet('ya_archive');
      return (r && r.ok && Array.isArray(r.data)) ? { ok: true, rows: r.data }
                                                  : { ok: false, rows: [] };
    },
    rows: function () { return S.ARCHIVE; },
    apply: function (kept) { return lsSetArray('ya_archive' + S.LS, kept, _yaRecTs); }
  }]
};

// ── ERA_CFG ──
// העידן עולה רק בשינוי צורת שורה, ושינוי שם טבלה הוא שינוי כזה — המראה ממופתחת בשם.
// העידן מקודם אחרי ההגירה המקומית ולא לפניה — סדר הפוך זורק תור שטרם הוגר.
var DATA_ERA = 3;

var ERA_CFG = {
  prefix: self.APP.prefix,
  client: function () { return getSB(); },
  table:  function () { return S.KV_TABLE; },
  // המוחק מנקה את כל סיומות המוסד — העידן ברמת האפליקציה, ומוסד שלא היה פתוח היה נשאר בצורה הישנה.
  // ואופק הפינוי מתנקה איתם — אחרת הוא מסנן בכתיבה את מה שהמשיכה מחזירה.
  wipe:   function () {
    var bases = ['ya_entries', 'ya_archive', 'ya_cats', 'ya_subs', 'ya_subs_meta'];
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (!k) continue;
        for (var j = 0; j < bases.length; j++) {
          if (k.indexOf(bases[j] + '_') === 0) { lsRemove(k); break; }
        }
      }
    } catch (e) { console.error('[era] מחיקת העותק המקומי נכשלה', e); }
    S.ENTRIES = []; S.ARCHIVE = []; S.CATS = []; S.SUBS = {}; S.SUBS_META = {};
    lsClearHorizons();
  },
  // הדחיפה היא ראיה טרייה ולא זיכרון — מכשיר נקי מקבל ok עם still ריק.
  push:   function () { return pushDirty(null); },
  refresh: function () { return yaPullFromCloud(); }
};

// ── DEV_CFG ──
// המזהה אינו נושא סיומת מוסד — שני המוסדות חולקים מכשיר, וזה מזהה המכשיר.
var DEV_CFG = { key: 'ya_device_id' };

// ── שכבת השורות בענן ──
// היומן והארכיון בטבלה אחת ומופרדים בעמודת archived; הסנאפשוט הוא יחידת הארכיון — שורה ליום.
// ya_archive הוא מפתח localStorage ולא טבלה; cats, subs ו-subs_meta נשארים ב-kv, ביתם היחיד בענן.
var YA_ROW_TABLES = { ya_entries: 'ya_entries', ya_archive: 'ya_entries' };

// הערך זהה במקרה ל-LS_SUCCESS_MUTE_MS אך הוא מושג אחר (משך תצוגה מול חלון השתקה) — אין לאחד.
var TOAST_DEFAULT_MS = 2500;

export { LS_CFG, MSG_ALREADY_AT, MSG_BOOT_FAIL, MSG_CLEAR_ALL_BODY,
         MSG_CLEAR_ALL_TITLE, MSG_CLOUD_NO_FANOUT, MSG_DAY_ARCHIVED,
         MSG_EDIT_FORM_CLOSED, MSG_IMG_FAIL, MSG_IMG_OFFLINE, MSG_IMG_PREP,
         MSG_INFRA_TABLE, MSG_LOCAL_ONLY, MSG_NEED_TASK, MSG_NOTHING_TO_SHARE,
         MSG_NO_CATS, MSG_NO_ROWS, MSG_OFFLINE_LOCAL, MSG_PDF_PREP, MSG_PICK_CATEGORY,
         MSG_POPUP_BLOCKED, MSG_ROW_GONE, MSG_SAVED_CLOUD, MSG_SUBTASK_EXISTS,
         MSG_SWITCH_YESHIVA, MSG_SYNCED, MSG_SYNC_FAIL_LOCAL, MSG_SYNC_LOAD_FAIL,
         MSG_SYNC_PARTIAL, MSG_TASK_EXISTS, MSG_YESHIVA_UNKNOWN, PL_CFG, SB_KEY,
         SB_URL, SET_PUSH, YA_ROW_TABLES, YESHIVOT };
