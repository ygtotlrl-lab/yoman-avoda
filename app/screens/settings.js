// app/screens/settings.js — מסך העריכה
import { uniqHas } from '../../core/util.js';
import { lsSet } from '../../core/storage.js';
import { esc, toast } from '../../core/ui.js';
import { S } from '../state.js';
import { MSG_SUBTASK_EXISTS, MSG_TASK_EXISTS } from '../config.js';
import { catCls, isLive, metaDel, recTouch, subKey, yaSetDirty } from '../domain.js';
import { buildCatGrid, buildTaskBtns } from './entry.js';

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

// חותמת פר-משימה — בלעדיה מיזוג ברמת רשומה מחליף את מערך המשימות כולו.
function touchTask(cat, name) {
  if (!cat || name == null) return;
  if (!cat.tasksMeta || typeof cat.tasksMeta !== 'object') cat.tasksMeta = {};
  cat.tasksMeta[String(name)] = Date.now();
}

// מחיקת משימה היא סימון ולא היעדר — מכשיר שלא קיבל את המחיקה מחזיר את המשימה.
function delTaskMeta(cat, name, ts) {
  if (!cat || name == null) return;
  if (!cat.tasksMeta || typeof cat.tasksMeta !== 'object') cat.tasksMeta = {};
  cat.tasksMeta[String(name)] = metaDel(ts);
}

function touchSubKey(sk) { if (sk != null) S.SUBS_META[String(sk)] = Date.now(); }

// מחיקת מפתח היא סימון ב-SUBS_META ולא היעדר — מכשיר שלא קיבל אותה קורא היעדר כ«אין לי» ומחזיר את המפתח.
function delSubKey(sk, ts) {
  if (sk == null) return;
  var k = String(sk);
  S.SUBS_META[k] = metaDel(ts);
  delete S.SUBS[k];
}

function saveSubs() {
  lsSet("ya_subs"+S.LS, JSON.stringify(S.SUBS));
  lsSet("ya_subs_meta"+S.LS, JSON.stringify(S.SUBS_META));
  // שני המפתחות הם אירוע אחד ומסומנים יחד.
  yaSetDirty(['subs', 'subs_meta']);
}

// ── מסך ההגדרות ──
// הסדר נקרא מהעץ אחרי הגרירה ולא מצמד מאיפה-לאן — גרירה על פני כמה שורות אינה קפיצה אחת.
// מדד שאינו מספר אינו נכנס לסדר.
function domOrder(list, kind, attr) {
  var out = [];
  for (var i = 0; i < list.children.length; i++) {
    var x = list.children[i];
    if (x.dataset && x.dataset.drag === kind) out.push(+x.dataset[attr]);
  }
  return out;
}

// קטגוריה מחוקה אינה ברשימה אך שומרת את מקומה במערך — סידור שמתעלם ממנה היה מזיז אותה.
function reorderKeep(arr, order) {
  var slots = order.slice().sort(function (a, b) { return a - b; });
  var out = arr.slice();
  for (var i = 0; i < order.length; i++) out[slots[i]] = arr[order[i]];
  return out;
}

function applyCatOrder(list, kind) {
  S.CATS = reorderKeep(S.CATS, domOrder(list, kind, 'idx'));
  saveCats();
  renderSettings();
  buildCatGrid();
}

function applyTaskOrder(list, kind) {
  var order = domOrder(list, kind, 'ti');
  var ci = +list.querySelector('[data-drag="' + kind + '"]').dataset.ci;
  S.CATS[ci].tasks = reorderKeep(S.CATS[ci].tasks, order);
  recTouch(S.CATS[ci]); // סדר המשימות הוא חלק מרשומת הקטגוריה
  saveCats();
  renderSettings();
}

function applySubOrder(list, kind) {
  var one = list.querySelector('[data-drag="' + kind + '"]');
  var ci = +one.dataset.ci, ti = +one.dataset.ti;
  var taskName = S.CATS[ci].tasks[ti];
  var sk = subKey(ci, taskName);
  if (!S.SUBS[sk]) { S.SUBS[sk] = S.SUBS[taskName] || []; }
  S.SUBS[sk] = reorderKeep(S.SUBS[sk], domOrder(list, kind, 'si'));
  touchSubKey(sk);
  saveSubs();
  renderSettings();
}

function editSubInline(ci, ti, si, oldVal, taskName) {
  var lbl = document.getElementById("sub-lbl-"+ci+"-"+ti+"-"+si);
  if (!lbl) return;
  var inp = document.createElement("input");
  inp.value = oldVal;
  inp.className = "inl-inp";
  lbl.replaceWith(inp);
  inp.focus();
  inp.select();
  function save() {
    var newVal = inp.value.trim();
    if (newVal && newVal !== oldVal) {
      var sk = subKey(ci, taskName);
      if (!S.SUBS[sk]) S.SUBS[sk] = S.SUBS[taskName] || [];
      S.SUBS[sk][si] = newVal;
      touchSubKey(sk);
      saveSubs();
    }
    renderSettings();
  }
  inp.onblur = save;
  inp.onkeydown = function(e){ if(e.key==="Enter") { inp.blur(); } if(e.key==="Escape") { inp.value=oldVal; inp.blur(); } };
}

function removeSub(ci, taskName, si) {
  var sk = subKey(ci, taskName);
  if (!S.SUBS[sk]) { if (!S.SUBS[taskName]) return; S.SUBS[sk] = S.SUBS[taskName]; }
  S.SUBS[sk].splice(si, 1);
  touchSubKey(sk); // המחיקה נרשמת בחותמת הרשימה — אחרת היא נעלמת במיזוג
  saveSubs();
  renderSettings();
}

function addSub(ci, ti) {
  var taskName = S.CATS[ci].tasks[ti];
  var inp = document.getElementById("snewsub-" + ci + "-" + ti);
  if (!inp) return;
  var val = inp.value.trim();
  if (!val) return;
  var sk = subKey(ci, taskName);
  if (!S.SUBS[sk]) S.SUBS[sk] = S.SUBS[taskName] ? [...S.SUBS[taskName]] : [];
  if (uniqHas(S.SUBS[sk], val)) { toast(MSG_SUBTASK_EXISTS, 4000, 'bad'); return; }
  S.SUBS[sk].push(val);
  touchSubKey(sk);
  inp.value = "";
  saveSubs();
  renderSettings();
}

function editTaskInline(ci, ti) {
  var lbl = document.getElementById("task-lbl-"+ci+"-"+ti);
  if (!lbl) return;
  var oldVal = S.CATS[ci].tasks[ti];
  var inp = document.createElement("input");
  inp.value = oldVal;
  inp.className = "inl-inp inl-inp-task";
  lbl.replaceWith(inp);
  inp.focus(); inp.select();
  function save() {
    var newVal = inp.value.trim();
    if (newVal && newVal !== oldVal) {
      // המפתח הוא ci::שם, ומפתח ישן בשם המשימה בלבד נקרא גם הוא
      var oldSk = subKey(ci, oldVal);
      var newSk = subKey(ci, newVal);
      if (S.SUBS[oldSk]) {
        S.SUBS[newSk] = S.SUBS[oldSk];
        delSubKey(oldSk);
      } else if (S.SUBS[oldVal]) {
        S.SUBS[newSk] = S.SUBS[oldVal];
        delSubKey(oldVal);
      }
      S.CATS[ci].tasks[ti] = newVal;
      delTaskMeta(S.CATS[ci], oldVal); touchTask(S.CATS[ci], newVal);
      recTouch(S.CATS[ci]); touchSubKey(newSk);
      saveCats(); saveSubs();
    }
    renderSettings(); buildCatGrid(); buildTaskBtns();
  }
  inp.onblur = save;
  inp.onkeydown = function(e){ if(e.key==="Enter") inp.blur(); if(e.key==="Escape"){ inp.value=oldVal; inp.blur(); } };
}

// אין להוסיף שער סיסמה מעל מסך ההגדרות, ואין לזרוע ברירת מחדל לסיסמה או לתפקיד —
// בהתקנה טרייה שער כזה נופל לערך ידוע ונפתח לכל מקליד; וכאן אין משתמשים כלל — הכניסה היא בחירת מוסד.
function renderSettings() {
  var ed = document.getElementById("settingsEditor");
  ed.innerHTML = "";
  S.CATS.forEach(function(cat, ci) {
    if (!isLive(cat)) return; // ci חייב להישאר האינדקס הגולמי — עליו בנויים מפתחות SUBS
    var div = document.createElement("div");
    div.className = "set-card";
    div.dataset.idx = ci;
    div.dataset.drag = "cat";
    var hdr = '<div class="set-hdr ' + catCls(cat.letter) + '">'
      + '<span class="drag-handle grip">⠿</span>'
      + '<div class="set-badge cat-fill"></div>'
      + '<input aria-label="שם קטגוריה" class="set-name-inp" id="sname-' + ci + '" value="' + esc(cat.name) + '" placeholder="שם קטגוריה" data-blr="cat-name" data-ci="'+ ci +'" />'
      + '</div>';
    var tasksHtml = '<div class="set-lbl">משימות (גרור לשינוי סדר):</div>'
      + cat.tasks.map(function(t, ti){
          var subs = S.SUBS[subKey(ci, t)] || S.SUBS[t] || [];
          var subsHtml = '';
          if(subs.length > 0) {
            subsHtml = '<div class="subs-lbl set-lbl">תתי משימות:</div>'
              + '<div class="sub-chips" data-drag-axis="x">'
              + subs.map(function(s,si){
                  return '<div class="chip chip-sub" '
                    + 'data-drag="sub" data-ci="'+ci+'" data-ti="'+ti+'" data-si="'+si+'">'
                    + '<span class="grip sub-grip">⠿</span>'
                    + '<span id="sub-lbl-'+ci+'-'+ti+'-'+si+'">'+esc(s)+'</span>'
                    + '<button data-act="cat-sub-edit" data-ci="'+ci+'" data-ti="'+ti+'" data-si="'+si+'" data-sub="'+esc(s)+'" data-task="'+esc(t)+'" class="set-edit">✏️</button>'
                    + '<button data-act="cat-sub-del" data-ci="'+ci+'" data-task="'+esc(t)+'" data-si="'+si+'">×</button>'
                    + '</div>';
                }).join('')
              + '</div>';
          }
          var addSubRow = '<div class="sub-add-row ksave">'
            + '<input aria-label="תת-משימה חדשה" class="sub-add-inp set-add-inp" id="snewsub-'+ci+'-'+ti+'" placeholder="+ תת-משימה..." />'
            + '<button class="sub-add-btn btn-mini" data-act="cat-sub-add" data-ksave data-ci="'+ci+'" data-ti="'+ti+'">+ הוסף</button>'
            + '</div>';
          return '<div class="task-block" '
            + 'data-drag="task" data-ci="'+ci+'" data-ti="'+ti+'">'
            + '<div class="task-block-hdr">'
            + '<span class="task-drag-icon grip">⠿</span>'
            + '<span class="task-name" id="task-lbl-'+ci+'-'+ti+'">'+esc(t)+'</span>'
            + '<button data-act="cat-task-edit" data-ci="'+ci+'" data-ti="'+ti+'" class="set-edit">✏️</button>'
            + '<button data-act="cat-task-del" data-ci="'+ci+'" data-ti="'+ti+'" class="task-del-btn">×</button>'
            + '</div>'
            + subsHtml
            + addSubRow
            + '</div>';
        }).join('')
      + '<div class="task-add-row set-add-row ksave">'
      + '<input aria-label="משימה חדשה" class="set-add-inp" id="snewtask-' + ci + '" placeholder="הוסף משימה..." />'
      + '<button class="btn-mini" data-act="cat-task-add" data-ksave data-ci="' + ci + '">+ הוסף</button>'
      + '</div>';
    div.innerHTML = hdr + tasksHtml;
    ed.appendChild(div);
  });
}

function removeTask(ci, ti) {
  // משימה היא מחרוזת בלי מזהה — ההסרה נרשמת כעדכון הקטגוריה, ולכן מנצחת במיזוג ואינה נעלמת.
  var gone = S.CATS[ci].tasks[ti];
  S.CATS[ci].tasks.splice(ti, 1);
  delTaskMeta(S.CATS[ci], gone);
  recTouch(S.CATS[ci]);
  // מפתח שנשאר בלי משימתו חוזר תחת משימה חדשה באותה קטגוריה ובאותו שם.
  delSubKey(subKey(ci, gone));
  saveCats(); saveSubs();
  renderSettings();
}

function addTask(ci) {
  var inp = document.getElementById("snewtask-" + ci);
  var val = inp.value.trim();
  if (!val) return;
  // ההשוואה על הערך ולא על מזהה — השם הוא מפתח החותמת ומפתח תתי-המשימות, ושתי שורות באותו שם חולקות אותם.
  if (uniqHas(S.CATS[ci].tasks, val)) { toast(MSG_TASK_EXISTS, 4000, 'bad'); return; }
  S.CATS[ci].tasks.push(val);
  touchTask(S.CATS[ci], val);
  recTouch(S.CATS[ci]);
  inp.value = "";
  saveCats();
  renderSettings();
}

function saveCatName(ci) {
  var inp = document.getElementById("sname-" + ci);
  if (inp && inp.value.trim()) {
    S.CATS[ci].name = inp.value.trim();
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
        if (S.SUBS[cat.name]) { S.SUBS[newName] = S.SUBS[cat.name]; delSubKey(cat.name); touchSubKey(newName); }
        S.CATS[ci].name = newName;
        recTouch(S.CATS[ci]);
      }
    }
  });
  saveCats(); saveSubs(); buildCatGrid();
  return true;
}

export { addSub, addTask, applyCatOrder, applySubOrder, applyTaskOrder, editSubInline,
         editTaskInline, removeSub, removeTask, renderSettings, saveCatName,
         saveSettings, screenSettingsHTML };
