// app/screens/log.js — מסך היומן, הדוח והשיתוף
import { MSG_DELETE } from '../../core/util.js';
import { idEq, pendMark, pendTag, schedulePush } from '../../core/sync.js';
import { ask, esc } from '../../core/ui.js';
import { MSG_CLEAR_ALL_BODY, MSG_CLEAR_ALL_TITLE, PK_ENTRY } from '../constants.js';
import { S } from '../state.js';
import { autoArchiveDay, catCls, catNameOf, cssQ, getCurrentDateKey, isLive, liveOnly,
         recDelete, recTouch, saveEntries, yaSortEntries } from '../domain.js';

function screenLogHTML() {
  return `
<div class="is-hidden panel" id="panel-log">
  <div class="card">
    <div class="log-hd">
      <div class="log-ttl card-ttl">רשומות יומן</div>
      <div class="log-cnt" id="logCount">0</div>
    </div>
    <div id="logList"><div class="empty">📋<br>עוד אין רשומות</div></div>
    <div class="exp-row">
      <button class="btn-sm btn-red" data-act="clear-all">🗑 נקה</button>
      <span id="outputBtnSlot"></span>
    </div>
  </div>
</div>
`;
}

function renderLog() {
  var list = document.getElementById("logList");
  var cnt  = document.getElementById("logCount");
  var curKey = getCurrentDateKey();
  var filtered = liveOnly(S.ENTRIES).filter(function(e){ return e.gdate === curKey; });
  cnt.textContent = filtered.length;
  if (!filtered.length) {
    list.innerHTML = '<div class="empty">📋<br>אין רשומות לתאריך זה</div>';
    return;
  }
  filtered = yaSortEntries(filtered);
  list.innerHTML = filtered.map(function(e) {
    var dateStr = [e.day, e.hdate, e.gdate ? "("+e.gdate+")" : ""].filter(Boolean).join("  ");
    return '<div class="entry-row cat-edge ' + catCls(e.cat) + '">'
      + '<div class="entry-badge cat-fill"></div>'
      + '<div class="entry-body">'
      + '<div class="e-main">' + esc(catNameOf(e)) + ' &larr; ' + esc(e.task) + (e.sub ? " &rarr; " + esc(e.sub) : "") + pendTag(PK_ENTRY + e.id) + '</div>'
      + (e.notes ? '<div class="e-sub">' + esc(e.notes) + '</div>' : '')
      + '<div class="e-meta">' + [dateStr, e.count ? "כמות: "+esc(e.count) : "", ].filter(Boolean).join(" | ") + '</div>'
      + '</div>'
      + '<button data-act="entry-edit" data-id="' + esc(e.id) + '" class="entry-edit">✏️</button>'
      + '<button class="del-btn" data-act="entry-del" data-id="' + esc(e.id) + '">✕</button>'
      + '</div>';
  }).join("");
}

function delEntry(id) {
  // tombstone ולא הסרה — מכשיר אחר רואה הסרה כ«רשומה שאינני מכיר» ומחזיר אותה לחיים.
  var deleted = S.ENTRIES.find(function(e){ return idEq(e.id, id) && isLive(e); });
  if (!deleted) return;
  recDelete(deleted);
  pendMark(PK_ENTRY + deleted.id);
  saveEntries();
  autoArchiveDay(deleted.day, deleted.hdate, deleted.gdate);
  renderLog();
  schedulePush();
}

function clearAll() {
  ask(MSG_CLEAR_ALL_TITLE, MSG_CLEAR_ALL_BODY, MSG_DELETE).then(function (yes) {
    if (!yes) return;
    var curKey = getCurrentDateKey();
    var ts = Date.now();
    var sample = S.ENTRIES.find(function(e){ return e.gdate === curKey; });
    S.ENTRIES.forEach(function(e){ if (e.gdate === curKey && isLive(e)) recDelete(e, ts); });
    saveEntries(); renderLog();
    // ה-tombstones עוברים גם לסנאפשוט של אותו יום — אחרת הארכיון ממשיך להציג אותן
    if (sample) autoArchiveDay(sample.day, sample.hdate, curKey);
    schedulePush();
  });
}

function editEntry(id) {
  var e = S.ENTRIES.find(function(x){ return idEq(x.id, id) && isLive(x); });
  if(!e) return;
  // המזהה עובר ב-cssQ — מזהה טקסט לא מצוטט שובר את הבורר, והעריכה מתה בשקט.
  var sel = '[data-id="' + cssQ(id) + '"]';
  var row = document.querySelector('[data-act="entry-del"]' + sel);
  if(!row) { row = document.querySelector('[data-act="entry-edit"]' + sel); }
  if(!row) return;
  var container = row.closest('.entry-row');
  if(!container) return;
  var div = document.createElement('div');
  div.innerHTML =
    '<div data-editing class="ei-row ksave">' +
    '<input aria-label="משימה" id="ei_task" placeholder="משימה" class="ei-inp">' +
    '<input aria-label="תת-משימה" id="ei_sub" placeholder="תת-משימה" class="ei-inp">' +
    '<input aria-label="כמות" id="ei_count" type="text" inputmode="numeric" autocomplete="off" placeholder="כמות" class="ei-count">' +
    '<input aria-label="הערות" id="ei_notes" placeholder="הרחבה" class="ei-notes">' +
    '<button data-act="entry-save" data-ksave data-id="' + esc(id) + '" class="ei-save">שמור</button>' +
    '<button data-act="entry-edit-cancel" data-kesc class="ei-cancel">ביטול</button>' +
    '</div>';
  container.innerHTML = '';
  container.appendChild(div);
  // הערכים נקבעים ב-JS ולא בתוך ה-HTML — כך אין בעיית בריחה
  document.getElementById('ei_task').value = e.task || '';
  document.getElementById('ei_sub').value = e.sub || '';
  document.getElementById('ei_count').value = e.count || '';
  document.getElementById('ei_notes').value = e.notes || '';
}

function saveEntry(id) {
  var e = S.ENTRIES.find(function(x){ return idEq(x.id, id) && isLive(x); });
  if(!e) return;
  e.task = document.getElementById('ei_task').value.trim() || e.task;
  e.sub = document.getElementById('ei_sub').value.trim();
  e.count = document.getElementById('ei_count').value.trim();
  e.notes = document.getElementById('ei_notes').value.trim();
  recTouch(e); // בלי זה העדכון מפסיד במיזוג מול העותק הישן שבענן
  pendMark(PK_ENTRY + e.id);
  saveEntries();
  autoArchiveDay(e.day, e.hdate, e.gdate); // שהעריכה תגיע גם לסנאפשוט של אותו יום
  return true;
}

export { clearAll, delEntry, editEntry, renderLog, saveEntry, screenLogHTML };
