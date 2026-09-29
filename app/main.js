// app/main.js — העלייה, בחירת הישיבה, מפת הפעולות והניווט
import { appConfigure, dayIso, dayNoon, getDeviceId } from '../core/util.js';
import { ctxEpoch, ctxStale, ctxSwitch, eraKeys, eraKick, idEq, pendAlertDismiss,
         pendBoot, pendCount, pendForget, pendHas, pendMark, pendReload, plBoot, plForget,
         pushDirty, pushTable, rtyBoot, runSave, tombBoot, tombKill } from '../core/sync.js';
import { hwBoot, hwDiskFilter, hwForget, hwNoteCloud, lsBoot, lsClearHorizons, lsGet,
         lsRemove, lsSet, lsSetArray } from '../core/storage.js';
import { bkBoot, logAwait } from '../core/backup.js';
import { actRun, closeAsk, closeModal, dragCancel, dragDown, dragMove, dragUp, esc, ksKey,
         modalBackdrop, modalEsc, openModal, pullRender, shellBare, swApply, swHideUpdate,
         toast } from '../core/ui.js';
import { hebrewDate } from '../core/hebrew.js';
import { CATS_RESET_KEY, CATS_RESET_LS, MSG_ALREADY_AT, MSG_BOOT_FAIL,
         MSG_DAY_ARCHIVED, MSG_OFFLINE_LOCAL, MSG_SWITCH_YESHIVA, MSG_SYNCED,
         MSG_SYNC_FAIL_LOCAL, MSG_SYNC_LOAD_FAIL, MSG_SYNC_PARTIAL, MSG_YESHIVA_UNKNOWN,
         PK_ARC, PK_ENTRY, PK_SET, PUSH_TABLES, SET_PUSH,
         YESHIVOT } from './constants.js';
import { S, shell } from './state.js';
import { _yaMarkPushed, _yaMarkSynced, _yaPushedThrough, _yaRecTs, _yaVerify,
         arcPutSnapshot, entryOrderTs, getSB, gregDateStr, isLive, liveOnly, lsRead, mergeArchive, mergeCats, mergeEntries,
         recTouch, sbGetResult, showEl, yaBkPrefix,
         yaLsBases, yaPendPrefix, yaPullFromCloud, yaRowsGet, yaSendRows,
         yaSendSettings, yaSetRows, yaSuffix, yaSyncLog, yaSyncPushNow,
         yaRecId, yaTableOf, yaYeshiva } from './domain.js';
import { shareReport } from './domain.report.js';
import { arcAddCatChange, arcAddEntry, arcDeleteEntry, arcEditEntry, arcGoDays, arcGoDetail,
         arcGoMonths, arcGoYears, arcSaveEntry, arcToggleEdit, exportArchivePDF, renderArcDetail,
         renderArchive, screenArchiveHTML } from './screens/archive.js';
import { addEntry, autoSelectTodayChip, buildCatGrid, buildSubBtns, buildTaskBtns,
         onGregDateChange, pickCat, pickDay, pickSub, pickTask,
         screenEntryHTML } from './screens/entry.js';
import { clearAll, delEntry, editEntry, renderLog, saveEntry,
         screenLogHTML } from './screens/log.js';
import { screenPickHTML, yaInfraOpen, yaInfraToggleAll } from './screens/pick.js';
import { addSub, addTask, editSubInline, editTaskInline, removeSub, removeTask,
         renderSettings, saveCatName, saveSettings, saveSubInline, saveTaskInline,
         screenSettingsHTML } from './screens/settings.js';

// ── החיווט ──
// החיווט נמסר בשומרי קריאה — ה-CFG מוגדרים בהמשך, והשומר קורא אותם בזמן הקריאה ולא בזמן המסירה.
appConfigure({
  get BK_CFG() { return BK_CFG; },
  get DEV_CFG() { return DEV_CFG; },
  get DOM_ACTIONS() { return DOM_ACTIONS; },
  get ERA_CFG() { return ERA_CFG; },
  get HW_CFG() { return HW_CFG; },
  get LS_CFG() { return LS_CFG; },
  get PEND_CFG() { return PEND_CFG; },
  get PL_CFG() { return PL_CFG; },
  get PUSH_CFG() { return PUSH_CFG; },
  get RTY_CFG() { return RTY_CFG; },
  get saveRefresh() { return saveRefresh; }
});

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
    { t: 'ya_cats',      why: 'קטגוריות ומשימותיהן — רשימה שנערכת בהגדרות, ⛔ ואינה גדלה עם הזמן' }
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
                 eq: ['yeshiva', S.YESHIVA], order: 'client_id', ts: 'updated_at' }];
    // name הוא המפתח בטבלת ההגדרות, בלי תחילית; key הוא מפתח הגיבוי ב-sh_backup המשותפת לפרויקט — ושם בלי תחילית שם מתנגש.
    return out.concat([
      { kind: 'kv', table: S.KV_TABLE, name: 'cats',      key: 'ya_cats' }
    ]);
  }
};

// המפתח הוא פונקציה — שני המוסדות חולקים localStorage, וסימון ממתין של אחד אינו תקף לשני.
var PEND_CFG = {
  key: function () { return 'ya_pending' + (typeof S.LS === 'string' ? S.LS : ''); },
  // מפה לכל ישיבה — עותק שנזרק בעידן נזרק לשתיהן, והממתינים של שתיהן נרשמים.
  keys: function () { return YESHIVOT.map(function (y) { return 'ya_pending' + yaSuffix(y.id); }); },
  // סימון ממתין שקידומתו אינה כאן יורד בעלייה — אין לו כותב, ואין שורה שתידחף ותוריד אותו.
  marks: function () { return [PK_ENTRY, PK_ARC, PK_SET]; },
  // בתום ההחזקה, תגית ממתין שנותרה צריכה להיכנס לשורות שכבר רונדרו — renderLog הוא האתר היחיד שמצייר אותה כאן.
  redraw: function () { try { renderLog(); } catch (e) { } }
};

// אין כאן תור אופליין: הריקון הוא yaSyncPushNow, אותה דחיפה של schedulePush בלי ההשהיה.
var RTY_CFG = {
  flush:   function () { return yaSyncPushNow(); },
  pending: function () { try { return pendCount() > 0; } catch (e) { return false; } },
};

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

var PUSH_CFG = {
  tables: PUSH_TABLES,
  chunk:  500,
  delay:  400,
  rows:   function (t, ctx) {
    if (!S.KV_TABLE || !S.YESHIVA) return null;
    if (t === SET_PUSH) { S._yaPushEp = ctxEpoch(); S._yaPushTbl = S.KV_TABLE; return yaSetRows(); }
    if (!yaTableOf(t)) return null;
    S._yaPushEp = ctxEpoch();
    return ctx || (t === 'ya_archive' ? S.ARCHIVE : S.ENTRIES);
  },
  key:    function (t, row) { return t === SET_PUSH ? PK_SET + row.key : yaPendPrefix(t) + row.client_id; },
  send:   function (t, rows) {
    return t === SET_PUSH ? yaSendSettings(S._yaPushTbl, rows, S._yaPushEp) : yaSendRows(t, rows, S._yaPushEp);
  },
  mark:   function (t) { if (!ctxStale(S._yaPushEp)) _yaMarkPushed(t); },
  run:    function () { yaSyncPushNow(); },
};

// החלון החם הוא archived=false: סנאפשוט ארכיון שאינו ממתין ואומת בענן מתפנה מהמכשיר.
// admin מחזירה תמיד אמת — אין כאן משתמשים, והמכשיר הוא של המנהל.
var HW_CFG = {
  enabled: true,
  admin: function () { return true; },
  specs: [{
    key: function () { return 'ya_archive' + S.LS; },
    label: 'ארכיון ימים',
    inWindow: function () { return false; },
    idOf: yaRecId,
    ts: function (r) { return _yaRecTs(r); },
    isPending: function (r) { return pendHas(PK_ARC + yaRecId(r)); },
    fetch: async function () {
      var r = await yaRowsGet('ya_archive');
      return (r && r.ok && Array.isArray(r.data)) ? { ok: true, rows: r.data }
                                                  : { ok: false, rows: [] };
    },
    rows: function () { return S.ARCHIVE; },
    apply: function (kept) { return lsSetArray('ya_archive' + S.LS, kept, _yaRecTs); }
  }]
};

var ERA_CFG = {
  prefix: self.APP.prefix,
  client: function () { return getSB(); },
  table:  function () { return S.KV_TABLE; },
  // המוחק מנקה את כל סיומות המוסד — העידן ברמת האפליקציה, ומוסד שלא היה פתוח היה נשאר בצורה הישנה.
  // ואופק הפינוי מתנקה איתם — אחרת הוא מסנן בכתיבה את מה שהמשיכה מחזירה.
  wipe:   function () {
    var bases = ['ya_entries', 'ya_archive', 'ya_cats'];
    try {
      for (var i = localStorage.length - 1; i >= 0; i--) {
        var k = localStorage.key(i);
        if (!k) continue;
        for (var j = 0; j < bases.length; j++) {
          if (k.indexOf(bases[j] + '_') === 0) { lsRemove(k); break; }
        }
      }
    } catch (e) { console.error('[era] מחיקת העותק המקומי נכשלה', e); }
    S.ENTRIES = []; S.ARCHIVE = []; S.CATS = [];
    lsClearHorizons();
  },
  // הדחיפה היא ראיה טרייה ולא זיכרון — מכשיר נקי מקבל ok עם still ריק.
  push:   function () { return pushDirty(null); },
  refresh: function () { return yaPullFromCloud(); },
  log:    function (action, entries) { return logAwait(action, entries); }
};

// המזהה אינו נושא סיומת מוסד — שני המוסדות חולקים מכשיר, וזה מזהה המכשיר.
var DEV_CFG = { key: 'ya_device_id' };

document.title = self.APP.name;

// mountView מציירת את המסכים לפני כל קוד שמחפש אלמנט בתוכם — אין להזיז את הקריאה אליה מטה.
function mountView() {
  var v = document.getElementById('view');
  if (!v) { console.error('[ui] אין מיכל תוכן — #view'); return; }
  v.innerHTML = screenPickHTML() + screenEntryHTML() + screenLogHTML() +
    screenSettingsHTML() + screenArchiveHTML();
}

mountView();

// ── הרישום ב-shell ──
// לפני כל אינטראקציה — מסך שמרנדר מסך אחר עובר דרכו.
shell.renderLog = renderLog;
shell.renderArcDetail = renderArcDetail;
shell.buildCatGrid = buildCatGrid;
shell.buildTaskBtns = buildTaskBtns;

// המדיניות נבנית בבחירת מוסד ומפנה את המוסד הפעיל בלבד — לעֵד של מוסד אחד אין תוקף לגבי השני.
// חותמת עריכה חדשה דוחה את הפינוי — רשומה שנערכה עכשיו אינה ישנה.
function lsRebuildPolicy() {
  LS_CFG.oldRecords = [
    { key: 'ya_archive' + S.LS, label: 'ארכיון ימים', ts: _yaRecTs,
      syncedThrough: function () { return _yaPushedThrough('ya_archive'); },
      idOf: yaRecId, verify: _yaVerify('ya_archive') },
    { key: 'ya_entries' + S.LS, label: 'רשומות היומן', ts: _yaRecTs,
      syncedThrough: function () { return _yaPushedThrough('ya_entries'); },
      idOf: yaRecId, verify: _yaVerify('ya_entries') }
  ];
}

// ── העברת מזהה ל-DOM ──

var DOM_ACTIONS = {
  'sw-apply':            function (el) { swApply(el); },
  'sw-dismiss':          function () { swHideUpdate(); },
  'pick-cat':            function (el) { pickCat(el.dataset.cat); },
  'pick-task':           function (el) { pickTask(el.dataset.task, el); },
  'pick-sub':            function (el) { pickSub(el.dataset.sub, el); },
  // התראות התשתית נבנות ב-JS — לכן הן מנותבות במפה ולא במאזין ישיר על הכפתור.
  'ls-alert-close':      function () { var el = document.getElementById('ls-alert'); if (el) el.remove(); },
  'pend-alert-ok':       function () { pendAlertDismiss(); },
  'entry-edit':     function (el) { editEntry(el.getAttribute('data-id')); },
  'entry-del':      function (el) { delEntry(el.getAttribute('data-id')); },
  'entry-save':     function (el) { return runSave(function () { return saveEntry(el.getAttribute('data-id')); }); },
  'arc-pdf':        function (el) { exportArchivePDF(el.getAttribute('data-id')); },
  'arc-entry-edit': function (el) { arcEditEntry(el.getAttribute('data-key'), el.getAttribute('data-id')); },
  'arc-entry-del':  function (el) { arcDeleteEntry(el.getAttribute('data-key'), el.getAttribute('data-id')); },
  'arc-entry-save': function (el) { arcSaveEntry(el.getAttribute('data-key'), el.getAttribute('data-id')); },
  // ci/ti/si הם אינדקסים במערך ולא מזהי טקסט — data-* מחזיר מחרוזת, ולכן ההמרה ל-Number מפורשת.
  'cat-task-add':   function (el) { addTask(Number(el.getAttribute('data-ci'))); },
  'cat-task-del':   function (el) { removeTask(Number(el.getAttribute('data-ci')),
                                               Number(el.getAttribute('data-ti'))); },
  'cat-task-edit':  function (el) { editTaskInline(Number(el.getAttribute('data-ci')),
                                                   Number(el.getAttribute('data-ti'))); },
  'cat-sub-edit':   function (el) { editSubInline(Number(el.getAttribute('data-ci')),
                                                  Number(el.getAttribute('data-ti')),
                                                  Number(el.getAttribute('data-si')),
                                                  el.getAttribute('data-sub'),
                                                  el.getAttribute('data-task')); },
  'cat-sub-add':    function (el) { addSub(Number(el.getAttribute('data-ci')),
                                           Number(el.getAttribute('data-ti'))); },
  // שם המשימה עובר ב-data-task ולא בתוך מחרוזת קוד — בריחת גרשיים ידנית מחטיאה שם שיש בו גרש.
  'cat-sub-del':    function (el) { removeSub(Number(el.getAttribute('data-ci')),
                                              el.getAttribute('data-task'),
                                              Number(el.getAttribute('data-si'))); },
  // מפתחות הארכיון נשארים מחרוזות — arcSelYear מושווה ומוצג כמחרוזת לכל אורך הארכיון, והמרה ל-Number הייתה יוצרת שני טיפוסים לאותו ערך.
  'arc-nav-months': function (el) { arcGoMonths(el.getAttribute('data-year')); },
  'arc-nav-days':   function (el) { arcGoDays(el.getAttribute('data-year'),
                                              el.getAttribute('data-month')); },
  'arc-nav-detail': function (el) { arcGoDetail(el.getAttribute('data-key')); },
  'show-tab':       function (el) { showTab(el.getAttribute('data-tab'), el); },
  'pick-day':       function (el) { pickDay(el, el.getAttribute('data-day')); },
  'pick-yeshiva':   function (el) { selectYeshiva(el.getAttribute('data-yeshiva')); },
  'open-yeshiva-picker': function () { yaPickYeshiva(); },
  'inf-open':       function () { return yaInfraOpen(); },
  'inf-all':        function (el) { yaInfraToggleAll(el.getAttribute('data-open') === '1'); },
  'switch-yeshiva': function (el) { yaConfirmSwitch(el.getAttribute('data-yeshiva')); },
  'add-entry':      function () { addEntry(); },
  'clear-all':      function () { clearAll(); },
  'save-settings':  function () { return runSave(saveSettings); },
  'share-report':   function () { shareReport(); },
  'arc-go-years':   function () { arcGoYears(); },
  'arc-toggle-edit': function () { arcToggleEdit(); },
  'arc-add-entry':  function () { arcAddEntry(); },
  // ביטול עריכה הוא רינדור מחדש ולא שחזור ערך — המסך נבנה מהמצב השמור, ומה שלא נשמר נעלם מעצמו.
  'entry-edit-cancel':     function () { renderLog(); },
  'arc-entry-edit-cancel': function () { renderArcDetail(); },
  'modal-close':    function () { closeModal(); },
  'ask-no':         function () { closeAsk(false); },
  'ask-yes':        function () { closeAsk(true); },
};

// סגירת הרקע קודמת לניתוב — לחיצה על הרקע אינה נושאת data-act.
document.addEventListener('click', function (ev) {
  if (modalBackdrop(ev)) return;
  var el = ev.target && ev.target.closest ? ev.target.closest('[data-act]') : null;
  if (!el) return;
  var fn = DOM_ACTIONS[el.getAttribute('data-act')];
  if (!fn) return;
  ev.preventDefault();
  actRun(el, fn);
});

// שמירה בשדה עריכה קודמת לסגירת חלון הדו-שיח — אחרת Escape בשדה שבתוך חלון דו-שיח היה סוגר אותו במקום לבטל את השדה.
document.addEventListener('keydown', function (e) {
  if (ksKey(e)) return;
  modalEsc(e);
});

document.addEventListener('input', function (e) {
  var el = e.target;
  if (el && el.dataset && el.dataset.inp === 'greg-date') onGregDateChange();
});

// blur אינו מתפשט — לכן focusout, שעולה בעץ.
document.addEventListener('focusout', function (e) {
  var el = e.target;
  if (!el || !el.dataset) return;
  var k = el.dataset.blr;
  if (k === 'cat-name') saveCatName(+el.dataset.ci);
  else if (k === 'sub-edit') saveSubInline(el);
  else if (k === 'task-edit') saveTaskInline(el);
});

document.addEventListener('change', function (e) {
  var el = e.target;
  if (el && el.dataset && el.dataset.chg === 'arc-add-cat') arcAddCatChange(el);
});

// הגרירה לסידור במנגנון שבליבה; המחילים לכל סוג — במסך ההגדרות.
document.addEventListener('pointerdown', dragDown);
document.addEventListener('pointermove', dragMove);
document.addEventListener('pointerup', dragUp);
document.addEventListener('pointercancel', dragCancel);

async function syncFromCloud() {
  var failed = [];
  // ההקשר נבדק אחרי כל await — הנקודה היחידה שבה הוא יכול להתחלף.
  var _ep = ctxEpoch();
  // מחזירה את מעטפת התוצאה ולא את הנתון — «נכשל» ו«אין בענן» הם שניהם null בנתון, ומפת חותמות חייבת להבחין.
  async function pullRes(key, label) {
    var r = await sbGetResult(key);
    // ערך פגום כבר דיווח על עצמו — הוספתו כאן הייתה טוסט שני לאותו אירוע.
    if (!r.ok) failed.push(label);
    return r;
  }
  async function pull(key, label) { return (await pullRes(key, label)).data; }
  try {
    // מיזוג ברמת קטגוריה ולא דריסה מהענן — קטגוריה שנוספה במכשיר לא-מסונכרן הייתה נעלמת.
    var cloudCats = await pull('cats', 'קטגוריות');
    var cloudCatsReset = String(await pull(CATS_RESET_KEY, 'חותמת ניקוי קטגוריות') || '');
    // ההקשר התחלף באמצע — הנתונים בזיכרון של המוסד הקודם, וכתיבה עכשיו הייתה כותבת אותם תחת החדש.
    if (ctxStale(_ep)) { console.warn('[sync] ההקשר התחלף באמצע — הסנכרון נעצר'); return; }
    if (cloudCats) {
      // חותמת ניקוי חדשה זורקת את הרשימה המקומית ואינה דוחפת — הדחיפה הייתה מחזירה לענן את מה שנוקה.
      // והיא נבדקת לפני האורך — רשימה שרוקנה בענן בכוונה מגיעה ריקה, ותנאי אורך קודם היה מדלג עליה.
      if (cloudCatsReset > S._catsResetSeen) {
        S.CATS = Array.isArray(cloudCats) ? cloudCats : [];
        S._catsResetSeen = cloudCatsReset;
        lsSet(CATS_RESET_LS+S.LS, JSON.stringify(cloudCatsReset));
        lsSet('ya_cats'+S.LS, JSON.stringify(S.CATS));
        console.log('[sync] ניקוי קטגוריות ' + cloudCatsReset + ' — העותק המקומי נזרק ונמשך מלא');
      } else if (cloudCats.length) {
        // כתיבה שמקורה במיזוג אינה מסומנת — עריכה מקומית שטרם עלתה כבר נושאת ⏳ מהפונקציה שכתבה אותה.
        S.CATS = mergeCats(S.CATS, cloudCats);
        lsSet('ya_cats'+S.LS, JSON.stringify(S.CATS));
      }
    }

    // מיזוג ברמת רשומה ולא איחוד לפי id — אחרת עדכון במכשיר אחד אינו גובר על הגרסה הישנה של השני.
    // כשל אינו נכנס לענף «הענן ריק» — דחיפת המקומי על סמך משיכה שנכשלה היא הכרעה בלי ידיעה.
    var _rowsE = await yaRowsGet('ya_entries');
    // ההקשר התחלף באמצע — הנתונים בזיכרון של המוסד הקודם, וכתיבה עכשיו הייתה כותבת אותם תחת החדש.
    if (ctxStale(_ep)) { console.warn('[sync] ההקשר התחלף באמצע — הסנכרון נעצר'); return; }
    if (!_rowsE.ok) failed.push('רשומות');
    else {
    var cloudEntries = _rowsE.data;
    if (cloudEntries && cloudEntries.length) {
      S.ENTRIES = mergeEntries(S.ENTRIES, cloudEntries);
      S.ENTRIES.sort(function(a,b){ return entryOrderTs(b) - entryOrderTs(a); });
      lsSetArray('ya_entries'+S.LS, S.ENTRIES, _yaRecTs);
      pushTable('ya_entries', S.ENTRIES);
    } else if (S.ENTRIES.length) {
      pushTable('ya_entries', S.ENTRIES);
    }
    }

    // מיזוג לפי יום ובתוכו פר-רשומה, ולא «למי שיש יותר רשומות» — אחרת הצד הקטן של אותו יום אובד.
    var _rowsA = await yaRowsGet('ya_archive');
    // ההקשר התחלף באמצע — הנתונים בזיכרון של המוסד הקודם, וכתיבה עכשיו הייתה כותבת אותם תחת החדש.
    if (ctxStale(_ep)) { console.warn('[sync] ההקשר התחלף באמצע — הסנכרון נעצר'); return; }
    if (!_rowsA.ok) failed.push('ארכיון');
    else {
    hwNoteCloud('ya_archive'+S.LS, _rowsA.data); // ראיה עננית לשער הדיסק
    var cloudArchive = _rowsA.data;
    if (cloudArchive && cloudArchive.length) {
      S.ARCHIVE = mergeArchive(S.ARCHIVE, cloudArchive);
      lsSetArray('ya_archive'+S.LS, hwDiskFilter('ya_archive'+S.LS, S.ARCHIVE), _yaRecTs);
      pushTable('ya_archive', S.ARCHIVE);
    } else if (S.ARCHIVE.length) {
      pushTable('ya_archive', S.ARCHIVE);
    }
    }

    // CATS הוחלף, וההפניה הישנה של selCat אינה במערך החדש
    if (S.selCat) {
      S.selCat = S.CATS.find(function(c){ return c.id === S.selCat.id && isLive(c); }) || null;
    }
    // הסימון לפני הרינדור — שורת המצב נבנית בתוך renderSettings.
    if (failed.length === 0) _yaMarkSynced();
    pullRender(yaPullDraw);
    if (failed.length === 0 && !S._yaPullLogged) { S._yaPullLogged = true; yaSyncLog('pull', null, null); }
    if (failed.length === 0) {
      toast(MSG_SYNCED, null, 'good');
    } else if (failed.length >= 5) {
      toast(MSG_SYNC_FAIL_LOCAL, null, 'bad');
    } else {
      toast(MSG_SYNC_PARTIAL + failed.join(", "), null, 'bad');
    }
  } catch(e) {
    console.error("[sync] syncFromCloud:", e);
    S._yaNetWarned = true;
    toast(MSG_OFFLINE_LOCAL, null, 'bad');
  }
}

function showTab(name, el) {
  document.querySelectorAll(".panel").forEach(function(p){ showEl(p, false); });
  document.querySelectorAll(".tab-btn").forEach(function(b){ b.classList.remove("active"); });
  showEl(document.getElementById("panel-"+name), true);
  el.classList.add("active");
  renderTab(name);
}

// מעבר לשונית ורענון אחרי שמירה מציירים דרך אותה נקודה — שני מרשמים נבדלים ביום שנוספת לשונית.
function renderTab(name) {
  if (name === "log") renderLog();
  if (name === "settings") renderSettings();
  if (name === "archive") renderArchive();
}

// רענון אינו ניווט — שמירה שמנווטת מוציאה את המשתמש מהמקום שבו הוא עומד.
function saveRefresh() {
  var on = document.querySelector(".tab-btn.active");
  var p = document.querySelector('.panel:not(.is-hidden)');
  if (p && p.id) renderTab(String(p.id).replace(/^panel-/, ""));
  else if (on) renderTab("log");
}

function checkDayChange() {
  var lastDay = lsGet("ya_last_day"+S.LS) || "";
  var today = new Date().toDateString();
  if (lastDay && lastDay !== today && liveOnly(S.ENTRIES).length > 0) {
    // ארכוב מקומי בלבד — syncFromCloud רץ מיד אחרי, ודחיפת ENTRIES ריק הייתה מוחקת רשומות שמכשיר אחר הוסיף להיום.
    var live = liveOnly(S.ENTRIES);
    // אותה חותמת לעותקים שבארכיון ול-tombstones — בשוויון הסנאפשוט מנצח, ולכן ארכוב אינו מחיקה מהארכיון.
    var ts = Date.now();
    // סנאפשוט לכל יום לפי entry_date שעל הרשומה — סנאפשוט אחד לכל החיות היה גורר רשומות של יום אחד ליום אחר.
    var byDay = {};
    live.forEach(function(e){
      var c = JSON.parse(JSON.stringify(e));
      recTouch(c, ts);
      if (!c.entry_date) c.entry_date = dayIso(dayNoon(new Date(lastDay)));
      (byDay[c.entry_date] = byDay[c.entry_date] || []).push(c);
    });
    // אותו בונה כמו המסלול הידני — שני בונים הם שני סנאפשוטים שונים לאותו יום.
    Object.keys(byDay).forEach(function(d){ arcPutSnapshot(d, byDay[d], ts); });
    lsSetArray("ya_archive"+S.LS, hwDiskFilter('ya_archive'+S.LS, S.ARCHIVE), _yaRecTs);
    // tombstones ולא ENTRIES = [] — אחרת הענן מחזיר את הרשומות לחיים
    S.ENTRIES.forEach(function(e){ if (isLive(e)) { tombKill(e, ts); pendMark(PK_ENTRY + e.client_id); } });
    lsSetArray("ya_entries"+S.LS, S.ENTRIES, _yaRecTs);
    toast(MSG_DAY_ARCHIVED, null, 'good');
  }
  lsSet("ya_last_day"+S.LS, today);
}

function initDate() {
  var now = new Date();
  var hd = hebrewDate(now);
  var gd = gregDateStr(now);
  document.getElementById("hebDateInput").value = hd;
  document.getElementById("gregDateInput").value = gd;
  autoSelectTodayChip();
}

S._infData = null;

S._infOpen = false;

// רץ רק אחרי שנבחר מוסד
function startApp() {
  checkDayChange();
  initDate();
  buildCatGrid();
  buildSubBtns();
  renderLog();
  function trySync(attempt) {
    if (typeof supabase !== 'undefined') {
      syncFromCloud();
    } else if (attempt < 10) {
      setTimeout(function(){ trySync(attempt + 1); }, 1000);
    } else {
      toast(MSG_SYNC_LOAD_FAIL, 2000, 'bad');
    }
  }
  setTimeout(function(){ trySync(0); }, 1500);
}

function loadLocalData() {
  try {
    S.CATS = lsRead("ya_cats"+S.LS, null, 'array') || [];
    S._catsResetSeen = String(lsRead(CATS_RESET_LS+S.LS, '') || '');
    S.ENTRIES = lsRead("ya_entries"+S.LS, null, 'array') || [];
    // רשומות זבל (null או לא-אובייקט) אינן מפילות את הרינדור
    S.ENTRIES = S.ENTRIES.filter(function(e){ return e && typeof e === 'object'; });
    // אין זרע מוטבע לארכיון — זרע שמוזרק בכל טעינה ומיזוג מנצח tombstone ומחזיר יום שנמחק.
    var arr = lsRead("ya_archive"+S.LS, null, 'array');
    S.ARCHIVE = arr ? arr.filter(function(s){ return s && typeof s === 'object'; }) : [];
  } catch(e) {
    console.error('[load] טעינת נתונים מקומיים נכשלה — עולים ריקים ומחכים לענן', e);
    if (!Array.isArray(S.CATS)) S.CATS = [];
    if (typeof S._catsResetSeen !== 'string') S._catsResetSeen = '';
    if (!Array.isArray(S.ENTRIES)) S.ENTRIES = [];
    if (!Array.isArray(S.ARCHIVE)) S.ARCHIVE = [];
  }
}

// ── החלפת מוסד ──
function yaNameOf(y) {
  var e = yaYeshiva(y);
  return e ? e.name : '';
}

// עד הדחיפה ואות הבדיקה המחזורית הם זיכרון בלי סיומת מוסד — אות שנשאר גורם למשיכה הראשונה לחשוב שאין מה למשוך.
// כל המצב הפר-מוסדי מאופס, לא רק משתני הסנכרון — אחרת דחיפה בחלון ההחלפה כותבת את נתוני הקודם תחת החדש.
// ואיפוס למערך ריק אינו מחיקה בענן — הדחיפה מעלה רק שורות מלוכלכות.
function yaResetTenantState() {
  ctxSwitch();
  // הדחיפה המושהית אינה מבוטלת כאן — שער ההקשר בשכבת הדחיפה עוצר אותה בהתעוררות.
  S._yaPushedAt = {};
  S._lastKnownTimestamp = 0;
  plForget();
  pendForget();
  hwForget();
  S._yaLastSyncAt = 0;
  S._yaNetWarned = false;
  S._yaPullLogged = false;
  S.ENTRIES = [];
  S.ARCHIVE = [];
  S.CATS = [];
  S._catsResetSeen = '';
  S.arcSelYear = null;
  S.arcSelMonth = null;
  S.arcSelDayKey = null;
}

function yaPickYeshiva() {
  var listHtml = '<div class="yeshiva-list">';
  for (var i = 0; i < YESHIVOT.length; i++) {
    var cur = idEq(YESHIVOT[i].id, S.YESHIVA);
    listHtml += '<button class="btn-sm yeshiva-pick' +
            (cur ? ' is-current' : '') + '" data-act="switch-yeshiva" data-yeshiva="' + YESHIVOT[i].id + '">' +
            esc(YESHIVOT[i].name) +
            (cur ? ' ✓' : '') + '</button>';
  }
  listHtml += '</div>';
  openModal(MSG_SWITCH_YESHIVA, listHtml, '');
}

// אין אישור שני — הבחירה בבורר היא האישור.
function yaConfirmSwitch(y) {
  if (!yaNameOf(y)) return;
  closeModal();
  if (idEq(y, S.YESHIVA)) { toast(MSG_ALREADY_AT + yaNameOf(y)); return; }
  selectYeshiva(y);
  // הארכיון חוזר לשורש — שנה שנבחרה במוסד הקודם אינה קיימת בהכרח בחדש.
  try { arcGoYears(); } catch (e) { console.warn('[arc] arcGoYears', e); }
}

// again מסמן מעבר בין מוסדות — pendBoot מוסיף מאזיני רשת בכל קריאה, ושאר ה-boot שומרים על עצמם.
function selectYeshiva(y) {
  // האיפוס כאן ולא אצל הקורא — לפונקציה שני קוראים, וקורא ששוכח לאפס מנטרל את כל שערי ההקשר.
  // הכניסה החוזרת נגזרת ואינה נמסרת — פרמטר שנשכח היה מריץ pendBoot פעמיים.
  var ent = yaYeshiva(y);
  if (!ent) { console.error('[switch] ישיבה שאינה במפה:', y); toast(MSG_YESHIVA_UNKNOWN, null, 'bad'); return; }
  var reentry = !!S.YESHIVA;
  if (reentry) yaResetTenantState();
  var again = reentry;
  S.YESHIVA  = y;
  S.KV_TABLE = ent.table;
  S.LS       = yaSuffix(y);

  var logoEl = document.getElementById('appLogo');
  if (logoEl) {
    var logo = ent.logo;
    if (logo) { logoEl.src = logo; logoEl.alt = 'לוגו'; }
    else { logoEl.removeAttribute('src'); logoEl.alt = ''; }
  }
  var sub = document.getElementById('hdrSub');
  if (sub) sub.textContent = ent.full;
  // כפתור שיתוף זהה בשני המוסדות — היעד נבחר בגיליון השיתוף של המערכת.
  var slot = document.getElementById('outputBtnSlot');
  if (slot) slot.innerHTML =
    '<button class="share-btn btn-sm" ' +
    'data-act="share-report">📤 שיתוף הדוח</button>';

  // המדיניות נבנית רק עכשיו כי המפתחות תלויי-מוסד; והפינוי לפני loadLocalData — כדי שהמיזוג יכתוב לאחסון שיש בו מקום.
  try { lsRebuildPolicy(); lsBoot(); } catch (e) { console.warn('[ls] lsBoot', e); }
  // הטעינה לפני כל boot שיכול לדחוף ואחרי lsBoot — אחרת דחיפה רצה כש-LS כבר חדש והזיכרון עדיין ישן.
  loadLocalData();
  // pendReload — מפתח הסימונים נושא סיומת מוסד, וסימון של מוסד אחד אינו תקף לשני.
  try { pendReload(); if (!again) pendBoot(); } catch (e) { console.warn('[pend] pendBoot', e); }
  try { tombBoot(); } catch (e) { console.warn('[tomb] tombBoot', e); }
  try { eraKick(); } catch (e) { console.warn('[era] eraKick', e); }
  // כאן ולא מוקדם יותר — BK_CFG.sources נשענת על KV_TABLE, שהוא null עד שנבחר מוסד.
  // ואין להעביר למסלול סנכרון — גיבוי שתלוי בסנכרון נעצר בדיוק כשאין סנכרון.
  try { bkBoot(); } catch (e) { console.warn('[bk] bkBoot', e); }
  try { hwBoot(); } catch (e) { console.warn('[hw] hwBoot', e); }
  try { rtyBoot(); } catch (e) { console.warn('[rty] rtyBoot', e); }
  // כאן ולא מוקדם יותר — KV_TABLE הוא null עד שנבחר מוסד, ותקתוק לפני כן היה שואל טבלה שאינה קיימת.
  try { plBoot(); } catch (e) { console.warn('[pl] plBoot', e); }
  var ov = document.getElementById('yeshivaSelect');
  showEl(ov, false);
  shellBare(false);
  // מסך הבחירה כבר נסגר — כישלון כאן חייב להשאיר אפליקציה שמישה ולא מסך ריק
  try {
    startApp();
  } catch(e) {
    console.error('[boot] startApp נכשל', e);
    toast(MSG_BOOT_FAIL, null, 'bad');
  }
}

window.bootOk();

// הגדרות ושורות יומן נבנים מחדש, ולכן הציור עובר ב-pullRender — שדה פתוח בהם היה נמחק.
function yaPullDraw() {
  buildCatGrid(); buildTaskBtns(); buildSubBtns(); renderLog(); renderSettings();
}
