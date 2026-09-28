// app/screens/archive.js — מסך הארכיון
import { MSG_SAVED } from '../../core/util.js';
import { idEq, newClientId, pendMark } from '../../core/sync.js';
import { esc, toast } from '../../core/ui.js';
import { hebrewDate } from '../../core/hebrew.js';
import { HMO, HUNKNOWN, MSG_EDIT_FORM_CLOSED, MSG_ROW_GONE, PK_ARC,
         PK_ENTRY } from '../constants.js';
import { S, shell } from '../state.js';
import { archiveKey, catCls, catNameOf, extractYM, getTodayKey, isLive, liveOnly,
         normHDate, recDelete, recTouch, saveArchive, saveEntries, showEl, snapHDate,
         yaSortEntries } from '../domain.js';
import { exportPDF } from '../domain.report.js';

function screenArchiveHTML() {
  return `
<div class="is-hidden panel" id="panel-archive">
  <div class="card">
    <div id="arc-breadcrumb" class="arc-crumbs"></div>
    <div id="arc-years"></div>
    <div id="arc-months" class="is-hidden"></div>
    <div id="arc-days" class="is-hidden"></div>
    <div id="arc-detail" class="is-hidden"></div>
  </div>
</div>
`;
}

function arcShowLevel(level) {
  ["years", "months", "days", "detail"].forEach(function (x) {
    showEl(document.getElementById("arc-" + x), x === level);
  });
}

function getAllArchiveDays() {
  var days = {};

  liveOnly(S.ARCHIVE).forEach(function(snap) {
    var k = String(snap.gdate || snap.id);
    // סנאפשוט ישן בלי gdate ממופתח לפי id — בלי key הכפתור היה שולח מחרוזת ריקה ופותח יום שגוי.
    if (!days[k]) days[k] = {key:k, gdate:snap.gdate||"", hdate:snapHDate(snap), day:snap.day||"",
      name:normHDate(snap.name||""), entries:[], seen:{}, snapId:snap.id};
    // בדיקת seen נדרשת גם כאן — שני סנאפשוטים לאותו יום היו סופרים רשומה משותפת פעמיים.
    (snap.entries||[]).forEach(function(e){
      if (e && e.id != null) {
        if (days[k].seen[String(e.id)]) return;
        days[k].seen[String(e.id)] = true; // כולל tombstones
      }
      if (isLive(e)) days[k].entries.push(e);
    });
  });

  // הסנאפשוט קובע לרשומה שכבר נכנסה אליו — אחרי סיום יום העותק החי הוא tombstone, והרשומה עדיין בארכיון.
  S.ENTRIES.forEach(function(e) {
    var k = String(e.gdate || "");
    if (!days[k]) {
      if (!isLive(e)) return;
      days[k] = {key:k, gdate:e.gdate||"", hdate:snapHDate(e), day:e.day||"",
        name:normHDate([e.day,e.hdate,e.gdate?"| "+e.gdate:""].filter(Boolean).join(" ")), entries:[], seen:{}, snapId:null};
    }
    if (days[k].seen[String(e.id)]) return;
    days[k].seen[String(e.id)] = true;
    if (isLive(e)) days[k].entries.push(e);
  });

  return days;
}

function getYearsWithData() {
  var days = getAllArchiveDays();
  var years = {};
  Object.values(days).forEach(function(d) {
    var ym = extractYM(d.hdate);
    if (ym.year) years[ym.year] = true;
  });
  return years;
}

function monthsWithData(year) {
  var days = getAllArchiveDays();
  var months = {};
  Object.values(days).forEach(function(d) {
    var ym = extractYM(d.hdate);
    if (ym.year === year) months[ym.month] = true;
  });
  return months;
}

function getDaysInMonth(year, month) {
  var days = getAllArchiveDays();
  var result = [];
  Object.values(days).forEach(function(d) {
    if (!d.entries.length) return;
    var ym = extractYM(d.hdate);
    if (ym.year === year && ym.month === month) result.push(d);
  });
  var HEB_ORD = {"א":1,"ב":2,"ג":3,"ד":4,"ה":5,"ו":6,"ז":7,"ח":8,"ט":9,"י":10,"יא":11,"יב":12,"יג":13,"יד":14,"טו":15,"טז":16,"יז":17,"יח":18,"יט":19,"כ":20,"כא":21,"כב":22,"כג":23,"כד":24,"כה":25,"כו":26,"כז":27,"כח":28,"כט":29,"ל":30};
  function hdayNum(hdate) {
    var d = (hdate||"").split(" ")[0].replace(/[׳״]/g,"");
    return HEB_ORD[d] || 999;
  }
  result.sort(function(a,b){ return hdayNum(a.hdate) - hdayNum(b.hdate); });
  return result;
}

function getNowHebYM() {
  var hd = hebrewDate(new Date());
  return extractYM(hd);
}

// ── שביל הניווט ──
function renderArcBreadcrumb() {
  var bc = document.getElementById("arc-breadcrumb");
  if (!bc) return;
  var parts = [];
  parts.push('<span class="arc-crumb" data-act="arc-go-years">שנים</span>');
  if (S.arcSelYear) {
    parts.push('<span class="arc-crumb-sep">›</span>');
    parts.push('<span class="arc-crumb" data-act="arc-nav-months" data-year="'+esc(S.arcSelYear)+'">' + esc(S.arcSelYear) + '</span>');
  }
  if (S.arcSelMonth) {
    parts.push('<span class="arc-crumb-sep">›</span>');
    parts.push('<span class="arc-crumb" data-act="arc-nav-days" data-year="'+esc(S.arcSelYear)+'" data-month="'+esc(S.arcSelMonth)+'">' + esc(S.arcSelMonth) + '</span>');
  }
  if (S.arcSelDayKey) {
    var days = getAllArchiveDays();
    var d = days[S.arcSelDayKey];
    var label = d ? (d.hdate||d.gdate||S.arcSelDayKey) : S.arcSelDayKey;
    var dayParts = label.split(" ");
    var shortLabel = dayParts.slice(0,2).join(" ");
    parts.push('<span class="arc-crumb-sep">›</span>');
    parts.push('<span class="arc-crumb active">' + esc(shortLabel) + '</span>');
  }
  bc.innerHTML = parts.join("");
}

// ── רמה 1: שנים ──
function arcGoYears() {
  S.arcSelYear = null; S.arcSelMonth = null; S.arcSelDayKey = null;
  arcShowLevel("years");
  renderArcYears();
  renderArcBreadcrumb();
}

function renderArcYears() {
  var el = document.getElementById("arc-years");
  var nowYM = getNowHebYM();
  var allYears = {};
  // רק שנים שיש בהן רשומות במוסד — טווח קבוע היה מציג שנים ריקות מדומות.
  var withData = getYearsWithData();
  Object.keys(withData).forEach(function(y){ allYears[y] = true; });
  // השנה הנוכחית נכללת תמיד, גם כשהיא ריקה.
  if (nowYM.year) allYears[nowYM.year] = true;

  var yearList = Object.keys(allYears).sort(function(a,b){
    if (a === HUNKNOWN) return 1;
    if (b === HUNKNOWN) return -1;
    return a > b ? 1 : -1;
  });

  var html = '<div class="arc-pick-label">בחר שנה:</div><div class="arc-grid">';
  yearList.forEach(function(y) {
    var isNow = (y === nowYM.year);
    var hasDat = !!withData[y];
    html += '<button class="arc-btn'+(isNow?" active":"")
          + '" data-act="arc-nav-months" data-year="'+esc(y)+'">' + esc(y) + '</button>';
  });
  html += '</div>';
  el.innerHTML = html;
}

// ── רמה 2: חודשים ──
function arcGoMonths(year) {
  S.arcSelYear = year; S.arcSelMonth = null; S.arcSelDayKey = null;
  arcShowLevel("months");
  renderArcMonths(year);
  renderArcBreadcrumb();
}

function renderArcMonths(year) {
  var el = document.getElementById("arc-months");
  var nowYM = getNowHebYM();

  var monthSet = {};
  var withData = monthsWithData(year);
  Object.keys(withData).forEach(function(m){ monthSet[m] = true; });

  var monthList = Object.keys(monthSet).sort(function(a,b){
    var ia = HMO.indexOf(a); if (ia < 0) ia = 999;
    var ib = HMO.indexOf(b); if (ib < 0) ib = 999;
    return ia - ib;
  });

  var html = '<div class="arc-pick-label">בחר חודש <b>' + esc(year) + '</b>:</div><div class="arc-grid">';
  monthList.forEach(function(m) {
    var isNow = (year === nowYM.year && m === nowYM.month);
    var hasDat = !!withData[m];
    html += '<button class="arc-btn'+(isNow?" active":"")
          + '" data-act="arc-nav-days" data-year="'+esc(year)+'" data-month="'+esc(m)+'">' + esc(m) + '</button>';
  });
  html += '</div>';
  el.innerHTML = html;
}

// ── רמה 3: ימים ──
function arcGoDays(year, month) {
  S.arcSelYear = year; S.arcSelMonth = month; S.arcSelDayKey = null;
  arcShowLevel("days");
  renderArcDays(year, month);
  renderArcBreadcrumb();
}

function renderArcDays(year, month) {
  var el = document.getElementById("arc-days");
  var days = getDaysInMonth(year, month);
  var nowKey = getTodayKey();

  if (!days.length) {
    el.innerHTML = '<div class="arc-empty-month">אין רשומות לחודש זה</div>';
    return;
  }

  var html = '<div class="arc-pick-label">בחר יום ב<b>' + esc(month) + ' ' + esc(year) + '</b>:</div><div class="arc-grid">';
  days.forEach(function(d) {
    var parts = (d.hdate||"").split(" ");
    var dayNum = parts[0] || d.gdate || d.key || "?";
    var isNow = (d.gdate === nowKey);
    // הניווט לפי d.key ולא לפי d.gdate — סנאפשוט ישן בלי gdate ממופתח לפי id.
    html += '<button class="arc-btn'+(isNow?" active":"")
          + '" data-act="arc-nav-detail" data-key="'+esc(d.key)+'" title="'+esc(d.hdate||d.name||"")+'">'
          + esc(dayNum) + '<br><small class="day-count">' + (d.entries.length) + ' רש׳</small></button>';
  });
  html += '</div>';
  el.innerHTML = html;
}

// ── רמה 4: פירוט יום ועריכה ──
function arcGoDetail(gdateKey) {
  S.arcSelDayKey = gdateKey;
  arcShowLevel("detail");
  S.arcEditMode = false;
  renderArcDetail();
  renderArcBreadcrumb();
}

// ── הארכיון: מסך היום ועריכה ──
function renderArcDetail() {
  var el = document.getElementById("arc-detail");
  var days = getAllArchiveDays();
  var d = days[S.arcSelDayKey];
  if (!d) { el.innerHTML = '<div class="empty">לא נמצא</div>'; return; }

  var sortedE = yaSortEntries(d.entries);

  var html = '<div class="arc-day-card'+(S.arcEditMode?" editing":"")+'">'+
    '<div class="arc-day-head">'+
    '<div class="arc-day-id">'+
      '<div class="arc-day-hdate">' + esc(d.hdate||d.gdate||S.arcSelDayKey) + '</div>'+
      '<div class="arc-day-gdate">' + esc((d.day||"") + (d.gdate ? " | " + d.gdate : "")) + '</div>'+
    '</div>'+
    '<button class="arc-edit-btn btn-sm'+(S.arcEditMode?" btn-blue":"")+'" data-act="arc-toggle-edit">'+(S.arcEditMode?"✓ סיים עריכה":"✏️ ערוך")+'</button>'+
    (d.snapId ? '<button class="arc-pdf-btn btn-sm hide-mobile" data-act="arc-pdf" data-id="'+esc(d.snapId)+'">📄 PDF</button>' : '')+
    '</div>';

  if (!sortedE.length) {
    html += '<div class="arc-empty-day">אין רשומות</div>';
  } else {
    sortedE.forEach(function(e, ei) {
      html += '<div class="arc-entry-row ' + catCls(e.cat) + '">'+
        (S.arcEditMode ? '<button data-act="arc-entry-edit" data-key="'+esc(S.arcSelDayKey)+'" data-id="'+esc(e.id)+'" class="entry-edit" title="ערוך">✏️</button>' +
        '<button class="arc-entry-del" data-act="arc-entry-del" data-key="'+esc(S.arcSelDayKey)+'" data-id="'+esc(e.id)+'">×</button>' : '')+
        '<div class="arc-dot cat-fill"></div>'+
        '<span class="arc-cat">'+esc(catNameOf(e))+'</span>'+
        '<span class="arc-muted">←</span>'+
        '<span class="arc-task">'+esc(e.task)+'</span>'+
        (e.sub ? '<span class="arc-muted">→</span><span class="arc-muted">'+esc(e.sub)+'</span>' : '')+
        (e.notes ? '<span class="arc-notes"> · '+esc(e.notes)+'</span>' : '<span class="arc-spacer"></span>')+
        (e.count ? '<span class="arc-count">×'+esc(e.count)+'</span>' : '')+
        '</div>';
    });
  }

  if (S.arcEditMode) {
    html += '<div class="arc-add">'+
      '<div class="arc-add-ttl">+ הוסף רשומה</div>'+
      '<div class="arc-add-row" data-ks>'+
      '<select aria-label="קטגוריה להוספה לארכיון" id="arc-add-cat" class="arc-add-sel" data-chg="arc-add-cat">'+
      liveOnly(S.CATS).map(function(cat){ return '<option value="'+esc(cat.letter)+'">'+esc(cat.name)+'</option>'; }).join("")+
      '</select>'+
      '<select aria-label="משימה להוספה לארכיון" id="arc-add-task" class="arc-add-sel">'+
      (liveOnly(S.CATS)[0]?liveOnly(S.CATS)[0].tasks.map(function(t){ return '<option>'+esc(t)+'</option>'; }).join(""):"")+
      '</select>'+
      '<input aria-label="הערה לרשומת הארכיון" id="arc-add-notes" placeholder="הערה..." class="arc-add-notes" />'+
      '<button class="arc-add-btn btn-mini" data-act="arc-add-entry" data-ksave>+ הוסף</button>'+
      '</div></div>';
  }

  html += '</div>';
  el.innerHTML = html;
}

function arcAddCatChange(sel) {
  var cat = S.CATS.find(function(c){ return c.letter === sel.value; });
  var taskSel = document.getElementById("arc-add-task");
  if (cat && taskSel) taskSel.innerHTML = cat.tasks.map(function(t){ return '<option>'+esc(t)+'</option>'; }).join("");
}

function arcToggleEdit() {
  S.arcEditMode = !S.arcEditMode;
  renderArcDetail();
}

function arcDeleteEntry(gdateKey, entryId) {
  // tombstone בכל מקום שבו הרשומה מופיעה — בסנאפשוטים ובחי — באותה חותמת
  var ts = Date.now();
  S.ARCHIVE.forEach(function(snap) {
    var hit = false;
    (snap.entries||[]).forEach(function(e){ if (idEq(e.id, entryId) && isLive(e)) { recDelete(e, ts); hit = true; } });
    if (hit) { snap.count = liveOnly(snap.entries).length; recTouch(snap, ts); }
  });
  saveArchive();
  S.ENTRIES.forEach(function(e){ if (idEq(e.id, entryId) && isLive(e)) recDelete(e, ts); });
  saveEntries();
  renderArcDetail();
  renderArcBreadcrumb();
}

function arcAddEntry(gdateKey) {
  var days = getAllArchiveDays();
  var d = days[S.arcSelDayKey];
  if (!d) return;
  var catSel = document.getElementById("arc-add-cat");
  var taskSel = document.getElementById("arc-add-task");
  var notesSel = document.getElementById("arc-add-notes");
  if (!catSel || !taskSel) return;
  var letter = catSel.value;
  if (!S.CATS.some(function(c){ return c.letter === letter; })) return;
  // createdAt נפרד לסדר — uuid אינו ניתן להשוואה מספרית.
  var _now = Date.now();
  var newEntry = {
    id: newClientId(),
    createdAt: _now,
    day: d.day, hdate: d.hdate, gdate: d.gdate,
    cat: letter,
    task: taskSel.value, sub: "", notes: notesSel ? notesSel.value.trim() : "", count: "",
    updatedAt: _now
  };
  // יום בלי gdate מותאם לפי snapId — התאמה לפי gdate ריק הייתה בוחרת סנאפשוט שגוי.
  var snap = S.ARCHIVE.find(function(s){
    return isLive(s) && (d.gdate ? s.gdate === d.gdate : (d.snapId != null && idEq(s.id, d.snapId)));
  });
  if (snap) {
    snap.entries = snap.entries || [];
    snap.entries.unshift(newEntry);
    snap.count = liveOnly(snap.entries).length;
    recTouch(snap);
    saveArchive();
  } else {
    S.ENTRIES.unshift(newEntry);
    saveEntries();
  }
  renderArcDetail();
}

function renderArchive() {
  var nowYM = getNowHebYM();
  S.arcSelYear = nowYM.year || null;
  S.arcSelMonth = null;
  S.arcSelDayKey = null;
  S.arcEditMode = false;

  arcShowLevel("years");

  renderArcYears();
  renderArcBreadcrumb();

  if (S.arcSelYear) {
    arcGoMonths(S.arcSelYear);
    if (nowYM.month) {
      arcGoDays(S.arcSelYear, nowYM.month);
    }
  }
}

function exportArchivePDF(id) {
  var snap = S.ARCHIVE.find(function(s){ return idEq(s.id, id); });
  if (!snap) return;
  var savedEntries = S.ENTRIES;
  S.ENTRIES = liveOnly(snap.entries);
  var savedDay = S.selDay;
  S.selDay = snap.name;
  var origHeb = document.getElementById("hebDateInput").value;
  document.getElementById("hebDateInput").value = snap.name;
  exportPDF();
  S.ENTRIES = savedEntries;
  S.selDay = savedDay;
  document.getElementById("hebDateInput").value = origHeb;
}

function arcEditEntry(gdateKey, entryId) {
  var days = getAllArchiveDays();
  var d = days[gdateKey];
  if(!d) return;
  var e = d.entries.find(function(x){ return idEq(x.id, entryId); });
  if(!e) return;
  // ההשוואה בערך ולא בבורר — מפתח היום עברי, ו-cssQ מסנן אותו לספרות בלבד.
  var target = null;
  document.querySelectorAll('[data-act="arc-entry-edit"]').forEach(function (b) {
    if (b.getAttribute('data-key') === gdateKey && idEq(b.getAttribute('data-id'), entryId)) target = b.closest('.arc-entry-row');
  });
  if(!target) return;
  target.innerHTML =
    '<div data-editing class="aei-row" data-ks>' +
    '<input aria-label="משימה" id="aei_task" value="' + esc(e.task||'') + '" placeholder="משימה" class="aei-inp">' +
    '<input aria-label="תת-משימה" id="aei_sub" value="' + esc(e.sub||'') + '" placeholder="תת-משימה" class="aei-inp">' +
    '<input aria-label="כמות" id="aei_count" type="text" inputmode="numeric" autocomplete="off" value="' + esc(e.count||'') + '" placeholder="כמות" class="aei-count">' +
    '<input aria-label="הערות" id="aei_notes" value="' + esc(e.notes||'') + '" placeholder="הרחבה" class="aei-notes">' +
    '<button data-act="arc-entry-save" data-ksave data-key="' + esc(gdateKey) + '" data-id="' + esc(entryId) + '" class="ei-save">שמור</button>' +
    '<button data-act="arc-entry-edit-cancel" data-kesc class="ei-cancel">בטל</button>' +
    '</div>';
}

function arcSaveEntry(gdateKey, entryId) {
  // גם ENTRIES — רשומה של יום שטרם אורכב הייתה no-op שמציג נשמר.
  var ts = Date.now();
  function fld(id) { var el = document.getElementById(id); return el ? el.value.trim() : null; }
  var vals = { task: fld('aei_task'), sub: fld('aei_sub'), count: fld('aei_count'), notes: fld('aei_notes') };
  if (vals.task === null) { toast(MSG_EDIT_FORM_CLOSED, null, 'bad'); return; }
  function apply(e) {
    e.task = vals.task; e.sub = vals.sub; e.count = vals.count; e.notes = vals.notes;
    recTouch(e, ts);
  }
  var hits = 0, touchedArc = [];
  S.ARCHIVE.forEach(function(snap) {
    var hit = false;
    (snap.entries||[]).forEach(function(e) {
      if (e && idEq(e.id, entryId)) { apply(e); hit = true; hits++; }
    });
    if (hit) { recTouch(snap, ts); touchedArc.push(archiveKey(snap)); }
  });
  S.ENTRIES.forEach(function(e) {
    if (e && idEq(e.id, entryId)) { apply(e); hits++; }
  });
  if (!hits) {
    console.warn('[arc] arcSaveEntry — רשומה לא נמצאה:', entryId, gdateKey);
    renderArcDetail();
    toast(MSG_ROW_GONE, null, 'bad');
    return;
  }
  pendMark(PK_ENTRY + entryId);
  // הסימון במפתח PK_ARC + archiveKey ולא במפתח המפה (gdate גולמי) — זה המפתח שהמיזוג, הדחיפה ושער הפינוי קוראים;
  // סימון במפתח אחר אינו נראה להם, והסנאפשוט הערוך עלול להתפנות לפני שעלה.
  touchedArc.forEach(function(k) { if (k != null) pendMark(PK_ARC + k); });
  saveEntries();
  saveArchive();
  renderArcDetail();
  shell.renderLog();
  toast(MSG_SAVED, null, 'good');
}

export { arcAddCatChange, arcAddEntry, arcDeleteEntry, arcEditEntry, arcGoDays, arcGoDetail,
         arcGoMonths, arcGoYears, arcSaveEntry, arcToggleEdit, exportArchivePDF, renderArcDetail,
         renderArchive, screenArchiveHTML };
