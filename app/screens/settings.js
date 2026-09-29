// app/screens/settings.js — מסך העריכה
import { uniqHas } from '../../core/util.js';
import { lsSet } from '../../core/storage.js';
import { dragDef, dragOrder, esc, toast } from '../../core/ui.js';
import { MSG_SUBTASK_EXISTS, MSG_TASK_EXISTS } from '../constants.js';
import { S, shell } from '../state.js';
import { tombKill } from '../../core/sync.js';
import { catCls, catTasks, isLive, recTouch, taskOf, yaSetDirty } from '../domain.js';

function screenSettingsHTML() {
  return `
<div class="is-hidden panel" id="panel-settings">
  <div class="card">
    <div class="card-ttl">עריכת קטגוריות ומשימות</div>
    <div id="settingsEditor"></div>
    <button class="btn-save" data-act="save-settings">💾 שמור שינויים</button>
  </div>
</div>
`;
}

function saveCats() {
  lsSet("ya_cats"+S.LS, JSON.stringify(S.CATS));
  yaSetDirty(['cats']);
}

// משימה היא פריט בקטגוריה — id הוא שמה, ו-subs מפתחות-המשנה שלה; כל שינוי בה נחתם בחותמתה.
function taskAt(ci, ti) { var c = S.CATS[ci]; return (c && Array.isArray(c.tasks)) ? c.tasks[ti] : null; }

// פריט שנמחק באותו שם מוחלף — שני פריטים באותו מפתח הם כפילות בתוך צד אחד.
function taskPut(cat, item, at) {
  cat.tasks = (cat.tasks || []).filter(function (t) { return !(t && t.id === item.id && !isLive(t)); });
  if (typeof at === 'number' && at >= 0 && at <= cat.tasks.length) cat.tasks.splice(at, 0, item);
  else cat.tasks.push(item);
}

// ── מסך ההגדרות ──
// הסדר נקרא מהעץ אחרי הגרירה ולא מצמד מאיפה-לאן — גרירה על פני כמה שורות אינה קפיצה אחת.
function domOrder(list, kind, attr) { return dragOrder(list, kind, attr).map(Number); }

// קטגוריה מחוקה אינה ברשימה אך שומרת את מקומה במערך — סידור שמתעלם ממנה היה מזיז אותה.
function reorderKeep(arr, order) {
  var slots = order.slice().sort(function (a, b) { return a - b; });
  var out = arr.slice();
  for (var i = 0; i < order.length; i++) out[slots[i]] = arr[order[i]];
  return out;
}

function applyCatOrder(list, kind) {
  S.CATS = reorderKeep(S.CATS, domOrder(list, kind, 'data-idx'));
  saveCats();
  renderSettings();
  shell.buildCatGrid();
}

function applyTaskOrder(list, kind) {
  var order = domOrder(list, kind, 'data-ti');
  var ci = +list.querySelector('[data-drag="' + kind + '"]').dataset.ci;
  S.CATS[ci].tasks = reorderKeep(S.CATS[ci].tasks, order);
  recTouch(S.CATS[ci]); // סדר המשימות הוא חלק מרשומת הקטגוריה
  saveCats();
  renderSettings();
}

function applySubOrder(list, kind) {
  var one = list.querySelector('[data-drag="' + kind + '"]');
  var t = taskAt(+one.dataset.ci, +one.dataset.ti);
  if (!t || !Array.isArray(t.subs)) return;
  t.subs = reorderKeep(t.subs, domOrder(list, kind, 'data-si'));
  recTouch(t);
  saveCats();
  renderSettings();
}

dragDef('cat', applyCatOrder);
dragDef('task', applyTaskOrder);
dragDef('sub', applySubOrder);

function editSubInline(ci, ti, si, oldVal, taskName) {
  var lbl = document.getElementById("sub-lbl-"+ci+"-"+ti+"-"+si);
  if (!lbl) return;
  var inp = document.createElement("input");
  inp.defaultValue = oldVal;
  inp.className = "inl-inp";
  inp.setAttribute("aria-label", "תת-משימה");
  inp.setAttribute("data-kent", "");
  inp.dataset.blr = "sub-edit";
  inp.dataset.ci = ci; inp.dataset.si = si; inp.dataset.task = taskName;
  lbl.replaceWith(inp);
  inp.focus();
  inp.select();
}

// נקרא ביציאה מהשדה — Enter ו-Escape משחררים אותו, והשמירה אחת לשלושתם.
function saveSubInline(inp) {
  var ci = +inp.dataset.ci, si = +inp.dataset.si, taskName = inp.dataset.task;
  var newVal = inp.value.trim();
  var t = taskOf(S.CATS[ci], taskName);
  if (t && newVal && newVal !== inp.defaultValue) {
    if (!Array.isArray(t.subs)) t.subs = [];
    t.subs[si] = newVal;
    recTouch(t);
    saveCats();
  }
  renderSettings();
}

function removeSub(ci, taskName, si) {
  var t = taskOf(S.CATS[ci], taskName);
  if (!t || !Array.isArray(t.subs)) return;
  t.subs.splice(si, 1);
  recTouch(t); // המחיקה נרשמת בחותמת המשימה — אחרת היא נעלמת במיזוג
  saveCats();
  renderSettings();
}

function addSub(ci, ti) {
  var t = taskAt(ci, ti);
  var inp = document.getElementById("snewsub-" + ci + "-" + ti);
  if (!inp || !t) return;
  var val = inp.value.trim();
  if (!val) return;
  if (!Array.isArray(t.subs)) t.subs = [];
  if (uniqHas(t.subs, val)) { toast(MSG_SUBTASK_EXISTS, 4000, 'bad'); return; }
  t.subs.push(val);
  recTouch(t);
  inp.value = "";
  saveCats();
  renderSettings();
}

function editTaskInline(ci, ti) {
  var lbl = document.getElementById("task-lbl-"+ci+"-"+ti);
  if (!lbl) return;
  var inp = document.createElement("input");
  inp.defaultValue = taskAt(ci, ti).id;
  inp.className = "inl-inp inl-inp-task";
  inp.setAttribute("aria-label", "שם משימה");
  inp.setAttribute("data-kent", "");
  inp.dataset.blr = "task-edit";
  inp.dataset.ci = ci; inp.dataset.ti = ti;
  lbl.replaceWith(inp);
  inp.focus(); inp.select();
}

function saveTaskInline(inp) {
  var ci = +inp.dataset.ci, ti = +inp.dataset.ti, oldVal = inp.defaultValue;
  var newVal = inp.value.trim(), cat = S.CATS[ci], old = taskAt(ci, ti);
  if (old && newVal && newVal !== oldVal) {
    if (taskOf(cat, newVal)) { toast(MSG_TASK_EXISTS, 4000, 'bad'); renderSettings(); return; }
    // השם הוא המזהה — הפריט הישן נמחק, והחדש נושא את מפתחות-המשנה במקומו.
    var subs = Array.isArray(old.subs) ? old.subs.slice() : [];
    tombKill(old);
    taskPut(cat, { id: newVal, updated_at: old.updated_at, subs: subs }, cat.tasks.indexOf(old) + 1);
    saveCats();
  }
  renderSettings(); shell.buildCatGrid(); shell.buildTaskBtns();
}

// אין להוסיף שער סיסמה מעל מסך ההגדרות, ואין לזרוע ברירת מחדל לסיסמה או לתפקיד —
// בהתקנה טרייה שער כזה נופל לערך ידוע ונפתח לכל מקליד; וכאן אין משתמשים כלל — הכניסה היא בחירת מוסד.
function renderSettings() {
  var ed = document.getElementById("settingsEditor");
  ed.innerHTML = "";
  S.CATS.forEach(function(cat, ci) {
    if (!isLive(cat)) return; // ci ו-ti הם האינדקס הגולמי — הסידור שומר את מקום הפריט שנמחק
    var div = document.createElement("div");
    div.className = "set-card";
    div.dataset.idx = ci;
    div.dataset.drag = "cat";
    var hdr = '<div class="set-hdr ' + catCls(cat.id) + '">'
      + '<span class="drag-handle grip" data-grip>⠿</span>'
      + '<div class="set-badge cat-fill"></div>'
      + '<input aria-label="שם קטגוריה" class="set-name-inp" id="sname-' + ci + '" value="' + esc(cat.name) + '" placeholder="שם קטגוריה" data-kent data-blr="cat-name" data-ci="'+ ci +'" />'
      + '</div>';
    var tasksHTML = '<div class="set-lbl">משימות (גרור לשינוי סדר):</div>'
      + (cat.tasks || []).map(function(item, ti){
          if (!isLive(item)) return '';
          var t = item.id, subs = Array.isArray(item.subs) ? item.subs : [];
          var subsHTML = '';
          if(subs.length > 0) {
            subsHTML = '<div class="subs-lbl set-lbl">תתי משימות:</div>'
              + '<div class="sub-chips" data-drag-axis="x">'
              + subs.map(function(s,si){
                  return '<div class="chip chip-sub" '
                    + 'data-drag="sub" data-ci="'+ci+'" data-ti="'+ti+'" data-si="'+si+'">'
                    + '<span class="grip sub-grip" data-grip>⠿</span>'
                    + '<span id="sub-lbl-'+ci+'-'+ti+'-'+si+'">'+esc(s)+'</span>'
                    + '<button data-act="cat-sub-edit" data-ci="'+ci+'" data-ti="'+ti+'" data-si="'+si+'" data-sub="'+esc(s)+'" data-task="'+esc(t)+'" class="set-edit">✏️</button>'
                    + '<button data-act="cat-sub-del" data-ci="'+ci+'" data-task="'+esc(t)+'" data-si="'+si+'">×</button>'
                    + '</div>';
                }).join('')
              + '</div>';
          }
          var addSubRow = '<div class="sub-add-row" data-ks>'
            + '<input aria-label="תת-משימה חדשה" class="sub-add-inp set-add-inp" id="snewsub-'+ci+'-'+ti+'" placeholder="+ תת-משימה..." />'
            + '<button class="sub-add-btn btn-mini" data-act="cat-sub-add" data-ksave data-ci="'+ci+'" data-ti="'+ti+'">+ הוסף</button>'
            + '</div>';
          return '<div class="task-block" '
            + 'data-drag="task" data-ci="'+ci+'" data-ti="'+ti+'">'
            + '<div class="task-block-hdr">'
            + '<span class="task-drag-icon grip" data-grip>⠿</span>'
            + '<span class="task-name" id="task-lbl-'+ci+'-'+ti+'">'+esc(t)+'</span>'
            + '<button data-act="cat-task-edit" data-ci="'+ci+'" data-ti="'+ti+'" class="set-edit">✏️</button>'
            + '<button data-act="cat-task-del" data-ci="'+ci+'" data-ti="'+ti+'" class="task-del-btn">×</button>'
            + '</div>'
            + subsHTML
            + addSubRow
            + '</div>';
        }).join('')
      + '<div class="task-add-row set-add-row" data-ks>'
      + '<input aria-label="משימה חדשה" class="set-add-inp" id="snewtask-' + ci + '" placeholder="הוסף משימה..." />'
      + '<button class="btn-mini" data-act="cat-task-add" data-ksave data-ci="' + ci + '">+ הוסף</button>'
      + '</div>';
    div.innerHTML = hdr + tasksHTML;
    ed.appendChild(div);
  });
}

// מחיקה היא סימון על הפריט ולא הסרה — מכשיר שלא קיבל את המחיקה היה מחזיר את המשימה.
function removeTask(ci, ti) {
  var t = taskAt(ci, ti);
  if (!t) return;
  tombKill(t);
  saveCats();
  renderSettings();
}

function addTask(ci) {
  var inp = document.getElementById("snewtask-" + ci);
  var val = inp.value.trim();
  if (!val) return;
  // השם הוא מזהה הפריט — שתי משימות באותו שם הן פריט אחד.
  if (uniqHas(catTasks(S.CATS[ci]).map(function (t) { return t.id; }), val)) { toast(MSG_TASK_EXISTS, 4000, 'bad'); return; }
  taskPut(S.CATS[ci], { id: val, updated_at: Date.now(), subs: [] });
  inp.value = "";
  saveCats();
  renderSettings();
}

function saveCatName(ci) {
  var inp = document.getElementById("sname-" + ci);
  var v = inp ? inp.value.trim() : '';
  if (v && v !== S.CATS[ci].name) {
    S.CATS[ci].name = v;
    // השדה נשאר על המסך אחרי השמירה — Escape הבא מחזיר לשם השמור ולא לשם שנבנה איתו.
    inp.defaultValue = S.CATS[ci].name;
    recTouch(S.CATS[ci]);
    saveCats();
  }
}

function saveSettings() {
  S.CATS.forEach(function(cat, ci) {
    var inp = document.getElementById("sname-" + ci);
    if (inp) {
      var newName = inp.value.trim();
      if (newName && newName !== cat.name) {
        S.CATS[ci].name = newName;
        recTouch(S.CATS[ci]);
      }
    }
  });
  saveCats(); shell.buildCatGrid();
  return true;
}

export { addSub, addTask, editSubInline, editTaskInline, removeSub, removeTask,
         renderSettings, saveCatName, saveSettings, saveSubInline, saveTaskInline,
         screenSettingsHTML };
