// app/screens/log.js — מסך היומן, הדוח והשיתוף
import { MSG_DELETE } from '../../core/util.js';
import { idEq, newClientId, pendMark, pendTag, schedulePush, tombKill } from '../../core/sync.js';
import { ask, esc } from '../../core/ui.js';
import { MSG_CLEAR_ALL_BODY, MSG_CLEAR_ALL_TITLE, PK_ENTRY } from '../constants.js';
import { S } from '../state.js';
import { icon } from '../icons.js';
import { catCls, catLabelOf, cssQ, getCurrentDateKey, isLive, liveOnly, recTouch,
         saveRows, yaDayName, yaGreg, yaHeb, yaSortEntries } from '../domain.js';

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
      <button class="btn-sm btn-red" data-act="clear-all">${icon('del')}נקה</button>
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
  var filtered = liveOnly(S.ENTRIES).filter(function(e){ return e.entry_date === curKey; });
  cnt.textContent = filtered.length;
  if (!filtered.length) {
    list.innerHTML = '<div class="empty">📋<br>אין רשומות לתאריך זה</div>';
    return;
  }
  filtered = yaSortEntries(filtered);
  list.innerHTML = filtered.map(function(e) {
    var dateStr = [yaDayName(e.entry_date), yaHeb(e.entry_date), e.entry_date ? "("+yaGreg(e.entry_date)+")" : ""].filter(Boolean).join("  ");
    return '<div class="entry-row cat-edge ' + catCls(e.cat) + '">'
      + '<div class="entry-badge cat-fill"></div>'
      + '<div class="entry-body">'
      + '<div class="e-main">' + esc(catLabelOf(e)) + ' &larr; ' + esc(e.task) + (e.sub ? " &rarr; " + esc(e.sub) : "") + pendTag(PK_ENTRY + e.client_id) + '</div>'
      + (e.notes ? '<div class="e-sub">' + esc(e.notes) + '</div>' : '')
      + '<div class="e-meta">' + [dateStr, e.count ? "כמות: "+esc(e.count) : "", ].filter(Boolean).join(" | ") + '</div>'
      + '</div>'
      + '<div class="entry-acts">'
      + '<button data-act="entry-dup" data-id="' + esc(e.client_id) + '" class="entry-edit" aria-label="שכפול" title="שכפול">' + icon('dup') + '</button>'
      + '<button data-act="entry-edit" data-id="' + esc(e.client_id) + '" class="entry-edit" aria-label="עריכה" title="עריכה">' + icon('edit') + '</button>'
      + '<button class="del-btn" data-act="entry-del" data-id="' + esc(e.client_id) + '" aria-label="מחיקה" title="מחיקה">' + icon('del') + '</button>'
      + '</div>'
      + '</div>';
  }).join("");
}

function delEntry(id) {
  // tombstone ולא הסרה — מכשיר אחר רואה הסרה כ«רשומה שאינני מכיר» ומחזיר אותה לחיים.
  var deleted = S.ENTRIES.find(function(e){ return idEq(e.client_id, id) && isLive(e); });
  if (!deleted) return;
  tombKill(deleted);
  pendMark(PK_ENTRY + deleted.client_id);
  saveRows();
  renderLog();
  schedulePush();
}

function clearAll() {
  ask(MSG_CLEAR_ALL_TITLE, MSG_CLEAR_ALL_BODY, MSG_DELETE).then(function (yes) {
    if (!yes) return;
    var curKey = getCurrentDateKey();
    var ts = Date.now();
    S.ENTRIES.forEach(function(e){ if (e.entry_date === curKey && isLive(e)) { tombKill(e, ts); pendMark(PK_ENTRY + e.client_id); } });
    saveRows(); renderLog();
    schedulePush();
  });
}

function liveEntry(id) {
  return S.ENTRIES.find(function(x){ return idEq(x.client_id, id) && isLive(x); });
}

function entryRowOf(id) {
  // המזהה עובר ב-cssQ — מזהה טקסט לא מצוטט שובר את הבורר, והעריכה מתה בשקט.
  var btn = document.querySelector('[data-act="entry-edit"][data-id="' + cssQ(id) + '"]');
  return btn && btn.closest('.entry-row');
}

// טופס אחד לעריכה ולשכפול — save היא הפעולה שהכפתור מפעיל.
function entryFormEl(e, save) {
  var div = document.createElement('div');
  div.innerHTML =
    '<div data-editing class="ei-row" data-ks>' +
    '<input aria-label="משימה" id="ei_task" placeholder="משימה" class="ei-inp">' +
    '<input aria-label="תת-משימה" id="ei_sub" placeholder="תת-משימה" class="ei-inp">' +
    '<input aria-label="כמות" id="ei_count" type="text" inputmode="numeric" autocomplete="off" placeholder="כמות" class="ei-count">' +
    '<input aria-label="הערות" id="ei_notes" placeholder="הרחבה" class="ei-notes">' +
    '<button data-act="' + save + '" data-ksave data-id="' + esc(e.client_id) + '" class="ei-save">שמור</button>' +
    '<button data-act="entry-edit-cancel" data-kesc class="ei-cancel">ביטול</button>' +
    '</div>';
  // הערכים נקבעים ב-JS ולא בתוך ה-HTML — כך אין בעיית בריחה
  div.querySelector('#ei_task').value = e.task || '';
  div.querySelector('#ei_sub').value = e.sub || '';
  div.querySelector('#ei_count').value = e.count || '';
  div.querySelector('#ei_notes').value = e.notes || '';
  return div;
}

function editEntry(id) {
  var e = liveEntry(id), row = entryRowOf(id);
  if (!e || !row) return;
  row.innerHTML = '';
  row.appendChild(entryFormEl(e, 'entry-save'));
}

// השכפול נפתח בטופס מתחת למקור, ונכתב רק בשמירה — ביטול אינו משאיר עותק.
function dupEntry(id) {
  var e = liveEntry(id), row = entryRowOf(id);
  if (!e || !row) return;
  if (document.querySelector('[data-editing]')) renderLog();
  row = entryRowOf(id);
  var box = document.createElement('div');
  box.className = 'entry-row cat-edge ' + catCls(e.cat);
  box.appendChild(entryFormEl(e, 'entry-dup-save'));
  row.after(box);
  document.getElementById('ei_task').focus();
}

function readEntryForm(e) {
  e.task = document.getElementById('ei_task').value.trim() || e.task;
  e.sub = document.getElementById('ei_sub').value.trim();
  e.count = document.getElementById('ei_count').value.trim();
  e.notes = document.getElementById('ei_notes').value.trim();
}

function saveDupEntry(id) {
  var src = liveEntry(id);
  if (!src) return;
  var now = new Date();
  var e = {
    client_id: newClientId(),
    created_at: now.toISOString(),
    entry_date: src.entry_date,
    cat: src.cat,
    task: src.task, sub: src.sub, notes: src.notes, count: src.count
  };
  readEntryForm(e);
  e.updated_at = now.getTime();
  S.ENTRIES.unshift(e);
  pendMark(PK_ENTRY + e.client_id);
  saveRows();
  return true;
}

function saveEntry(id) {
  var e = liveEntry(id);
  if(!e) return;
  readEntryForm(e);
  recTouch(e); // בלי זה העדכון מפסיד במיזוג מול העותק הישן שבענן
  pendMark(PK_ENTRY + e.client_id);
  saveRows();
  return true;
}

export { clearAll, delEntry, dupEntry, editEntry, renderLog, saveDupEntry, saveEntry, screenLogHTML };
