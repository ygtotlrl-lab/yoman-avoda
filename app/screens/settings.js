// app/screens/settings.js — מסך העריכה
import { uniqHas } from '../../core/util.js';
import { lsSet } from '../../core/storage.js';
import { dragDef, dragOrder, esc, toast } from '../../core/ui.js';
import { MSG_SUBTASK_EXISTS, MSG_TASK_EXISTS } from '../constants.js';
import { S, shell } from '../state.js';
import { catCls, isLive, metaDel, metaLive, recTouch, subKey, yaSetDirty } from '../domain.js';

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
  if (!cat.tasks_meta || typeof cat.tasks_meta !== 'object') cat.tasks_meta = {};
  cat.tasks_meta[String(name)] = metaLive();
}

// מחיקת משימה היא סימון ולא היעדר — מכשיר שלא קיבל את המחיקה מחזיר את המשימה.
function delTaskMeta(cat, name, ts) {
  if (!cat || name == null) return;
  if (!cat.tasks_meta || typeof cat.tasks_meta !== 'object') cat.tasks_meta = {};
  cat.tasks_meta[String(name)] = metaDel(ts);
}

function touchSubKey(sk) { if (sk != null) S.SUBS_META[String(sk)] = metaLive(); }

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
function domOrder(list, kind, attr) { return dragOrder(list, kind, attr).map(Number); }

// קטגוריה מחוקה אינה ברשימה אך שומרת את מקומה במערך — סידור שמתעלם ממנה היה מזיז אותה.
function reorderKeep(arr, order) {
  var slots = order.slice().sort(function (a, b) { return a - b; });
  var out = arr.slice();
  for (var i = 0; i < order.length; i++) out[slots[i]] = arr[order[i]];
  return out;
}

// מפתח תתי-המשימות נושא את מקום הקטגוריה — סידור שאינו מעביר את המפתחות היה משאיר אותם תחת קטגוריה אחרת.
function moveSubKeys(before, after) {
  var subs = {}, ts = Date.now();
  Object.keys(S.SUBS).forEach(function (k) {
    var i = k.indexOf('::'), ci = +k.slice(0, i), to = after.indexOf(before[ci]);
    if (i < 0 || to < 0) return;
    var nk = subKey(to, k.slice(i + 2));
    subs[nk] = S.SUBS[k];
    if (nk !== k) S.SUBS_META[nk] = metaLive(ts);
  });
  Object.keys(S.SUBS).forEach(function (k) { if (!(k in subs)) S.SUBS_META[k] = metaDel(ts); });
  S.SUBS = subs;
}

function applyCatOrder(list, kind) {
  var before = S.CATS.slice();
  S.CATS = reorderKeep(S.CATS, domOrder(list, kind, 'data-idx'));
  moveSubKeys(before, S.CATS);
  saveSubs();
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
  var ci = +one.dataset.ci, ti = +one.dataset.ti;
  var taskName = S.CATS[ci].tasks[ti];
  var sk = subKey(ci, taskName);
  if (!S.SUBS[sk]) return;
  S.SUBS[sk] = reorderKeep(S.SUBS[sk], domOrder(list, kind, 'data-si'));
  touchSubKey(sk);
  saveSubs();
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
  if (newVal && newVal !== inp.defaultValue) {
    var sk = subKey(ci, taskName);
    if (!S.SUBS[sk]) S.SUBS[sk] = [];
    S.SUBS[sk][si] = newVal;
    touchSubKey(sk);
    saveSubs();
  }
  renderSettings();
}

function removeSub(ci, taskName, si) {
  var sk = subKey(ci, taskName);
  if (!S.SUBS[sk]) return;
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
  if (!S.SUBS[sk]) S.SUBS[sk] = [];
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
  var inp = document.createElement("input");
  inp.defaultValue = S.CATS[ci].tasks[ti];
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
  var newVal = inp.value.trim();
  if (newVal && newVal !== oldVal) {
    // המפתח הוא ci::שם — שינוי השם מעביר את תתי-המשימות, והמפתח הישן נמחק בסימון.
    var oldSk = subKey(ci, oldVal);
    var newSk = subKey(ci, newVal);
    if (S.SUBS[oldSk]) S.SUBS[newSk] = S.SUBS[oldSk];
    delSubKey(oldSk);
    S.CATS[ci].tasks[ti] = newVal;
    delTaskMeta(S.CATS[ci], oldVal); touchTask(S.CATS[ci], newVal);
    recTouch(S.CATS[ci]); touchSubKey(newSk);
    saveCats(); saveSubs();
  }
  renderSettings(); shell.buildCatGrid(); shell.buildTaskBtns();
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
      + '<span class="drag-handle grip" data-grip>⠿</span>'
      + '<div class="set-badge cat-fill"></div>'
      + '<input aria-label="שם קטגוריה" class="set-name-inp" id="sname-' + ci + '" value="' + esc(cat.name) + '" placeholder="שם קטגוריה" data-kent data-blr="cat-name" data-ci="'+ ci +'" />'
      + '</div>';
    var tasksHtml = '<div class="set-lbl">משימות (גרור לשינוי סדר):</div>'
      + cat.tasks.map(function(t, ti){
          var subs = S.SUBS[subKey(ci, t)] || [];
          var subsHtml = '';
          if(subs.length > 0) {
            subsHtml = '<div class="subs-lbl set-lbl">תתי משימות:</div>'
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
            + subsHtml
            + addSubRow
            + '</div>';
        }).join('')
      + '<div class="task-add-row set-add-row" data-ks>'
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
  saveCats(); saveSubs(); shell.buildCatGrid();
  return true;
}

export { addSub, addTask, editSubInline, editTaskInline, removeSub, removeTask,
         renderSettings, saveCatName, saveSettings, saveSubInline, saveTaskInline,
         screenSettingsHTML };
