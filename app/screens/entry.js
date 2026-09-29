// app/screens/entry.js — מסך ההזנה
import { dayNoon, dayToday } from '../../core/util.js';
import { newClientId, pendMark, schedulePush } from '../../core/sync.js';
import { esc, toast } from '../../core/ui.js';
import { hebrewDate } from '../../core/hebrew.js';
import { DAY_VALUE_MAP, MSG_NEED_TASK, MSG_NO_CATS, MSG_PICK_CATEGORY,
         PK_ENTRY } from '../constants.js';
import { S, shell } from '../state.js';
import { catCls, catTasks, getCurrentDateKey, gregDateStr, liveOnly, parseGregLike,
         saveRows, taskSubs } from '../domain.js';

function screenEntryHTML() {
  return `
<div class="panel" id="panel-entry">
  <div class="card">
    <div class="card-ttl">תאריך ויום</div>
    <div class="date-row">
      <span class="date-lbl">יום:</span>
      <div class="day-chips">
        <button class="day-chip" data-act="pick-day" data-day="יום ראשון">ראשון</button>
        <button class="day-chip" data-act="pick-day" data-day="יום שני">שני</button>
        <button class="day-chip" data-act="pick-day" data-day="יום שלישי">שלישי</button>
        <button class="day-chip" data-act="pick-day" data-day="יום רביעי">רביעי</button>
        <button class="day-chip" data-act="pick-day" data-day="יום חמישי">חמישי</button>
        <button class="day-chip" data-act="pick-day" data-day="ערב שבת">ערב שבת</button>
        <button class="day-chip" data-act="pick-day" data-day="מוצאי שבת">מוצ"ש</button>
      </div>
      <!-- התאריך העברי של היום שנבחר — נגזר מהתאריך הלועזי ואינו נערך -->
      <input aria-label="תאריך עברי" class="heb-inp" id="hebDateInput" type="text" readonly tabindex="-1" placeholder="תאריך עברי..." />
      <!-- ⛔ בלי inputmode בכוונה — הפורמט המתקבל הוא dd/mm/yyyy,
           yyyy-mm-dd או הפורמט השמור, ומקלדת המספרים של iOS אינה מציעה
           «/» ולא «-»; ⚠️ ה-pattern הוא רמז הצורה, וההכרעה ב-parseGregLike,
           שנכשלת-סגור על כל קלט אחר ⭐ ומתורגמת לפורמט השמור. -->
      <input aria-label="תאריך לועזי" class="greg-inp heb-inp" id="gregDateInput" type="text" pattern="\d{1,2}/\d{1,2}/\d{4}|\d{4}-\d{2}-\d{2}|\d{1,2} [א-ת]+ \d{4}" autocomplete="off" placeholder="תאריך לועזי..." data-inp="greg-date" />
    </div>
  </div>

  <div class="card">
    <div class="card-ttl">קטגוריה ומשימה</div>
    <div class="cat-grid" id="catGrid"></div>
    <div class="qsec">
      <div class="qlbl">משימה</div>
      <div class="qrow" id="taskBtns"><span class="hint">בחר קטגוריה...</span></div>
    </div>
    <div class="qsec">
      <div class="qlbl">תת-משימה</div>
      <div class="qrow" id="subBtns"><span class="hint">בחר משימה...</span></div>
    </div>
    <div data-ks>
    <div class="inp-grid">
      <div class="fld"><label for="taskInput">משימה (ידנית)</label><input id="taskInput" type="text" placeholder="הקלד..." /></div>
      <div class="fld"><label for="subInput">תת-משימה / פרטים</label><input id="subInput" type="text" placeholder="פרטים..." /></div>
    </div>
    <div class="inp-grid">
      <div class="fld"><label for="notesInput">הרחבה / הערות</label><input id="notesInput" type="text" placeholder="הערות..." /></div>
      <div class="fld"><label for="countInput">כמות</label><input id="countInput" type="text" inputmode="numeric" autocomplete="off" placeholder="1" /></div>
    </div>
    <button class="btn-add" data-act="add-entry" data-ksave>+ הוסף לסדר היום</button>
    </div>

  </div>
</div>
`;
}

// getDay() מתחיל ב-0 = ראשון
var DAY_LABEL_MAP = ["ראשון","שני","שלישי","רביעי","חמישי","ערב שבת","מוצ\"ש"];

// היום בשבוע נבחר בשבב שלו — מהשעון בעלייה, ומהתאריך שהוקלד בשינוי השדה.
function selectDayChip(dow) {
  var label = DAY_LABEL_MAP[dow] || "";
  S.selDay = DAY_VALUE_MAP[dow] || "";
  document.querySelectorAll(".day-chip").forEach(function(b){
    b.classList.remove("active");
    if (b.textContent.trim() === label) b.classList.add("active");
  });
}

function autoSelectTodayChip() { selectDayChip(new Date().getDay()); }

function pickDay(el, day) {
  S.selDay = day;
  document.querySelectorAll(".day-chip").forEach(function(b){ b.classList.remove("active"); });
  el.classList.add("active");
  syncDatesToDay(day);
  shell.renderLog();
}

function syncDatesToDay(dayValue) {
  var targetDow = DAY_VALUE_MAP.indexOf(dayValue);
  if (targetDow < 0) return;
  var now = new Date();
  var currDow = now.getDay();
  var diff = targetDow - currDow;
  // נשאר בתוך השבוע הנוכחי — עד ±3 ימים
  if (diff > 3) diff -= 7;
  if (diff < -3) diff += 7;
  var target = dayNoon(dayToday(diff));
  document.getElementById("hebDateInput").value = hebrewDate(target) || hebrewDate(now);
  document.getElementById("gregDateInput").value = gregDateStr(target);
}

function onGregDateChange() {
  var inp = document.getElementById("gregDateInput");
  var p = parseGregLike(inp.value);
  if (p) {
    var d = dayNoon(p.y, p.m - 1, p.d);
    selectDayChip(d.getDay());
    document.getElementById("hebDateInput").value = hebrewDate(d) || document.getElementById("hebDateInput").value;
    shell.renderLog();
  }
}

function buildCatGrid() {
  var g = document.getElementById("catGrid");
  g.innerHTML = "";
  var live = liveOnly(S.CATS);
  // מצב ריק מוצג כריק — רשימה מומצאת הייתה מתמזגת חזרה לענן.
  if (!live.length) {
    g.innerHTML = '<span class="hint">' + esc(MSG_NO_CATS) + '</span>';
    return;
  }
  live.forEach(function(cat) {
    var btn = document.createElement("button");
    btn.className = "cat-btn " + catCls(cat.id) +
      ((S.selCat && S.selCat.id === cat.id) ? " sel" : "");
    btn.innerHTML = "<span class=\"cat-btn-name\">" + esc(cat.name) + "</span>";
    btn.dataset.act = 'pick-cat';
    btn.dataset.cat = cat.id;
    g.appendChild(btn);
  });
}

// הקטגוריה נמצאת לפי המזהה שב-DOM — סגור פר-כפתור הוא מאזין ישיר, בדיוק מה שההאצלה מונעת.
function pickCat(id) {
  var hit = null;
  S.CATS.forEach(function (c) { if (c && String(c.id) === String(id)) hit = c; });
  if (!hit) { console.error('[cat] אין קטגוריה למזהה: ' + id); return; }
  S.selCat = hit; S.selTask = null; S.selSub = null;
  buildCatGrid(); buildTaskBtns(); buildSubBtns();
}

function buildTaskBtns() {
  var el = document.getElementById("taskBtns");
  el.innerHTML = "";
  if (!S.selCat) { el.innerHTML = '<span class="hint">בחר קטגוריה...</span>'; return; }
  catTasks(S.selCat).map(function (x) { return x.id; }).forEach(function(t) {
    var b = document.createElement("button");
    b.className = "qbtn" + (S.selTask === t ? " active" : "");
    b.textContent = t;
    b.dataset.act = 'pick-task';
    b.dataset.task = t;
    el.appendChild(b);
  });
}

// הכפתור מגיע כארגומנט — בהאצלה currentTarget הוא document, וההבזק היה נצבע על כל הדף.
function pickTask(t, btn) {
  S.selTask = t; S.selSub = null;
  tapFlash(btn);
  document.getElementById("taskInput").value = t;
  buildTaskBtns(); buildSubBtns();
}

function buildSubBtns() {
  var el = document.getElementById("subBtns");
  el.innerHTML = "";
  var subs = (S.selTask && S.selCat) ? taskSubs(S.selCat, S.selTask) : [];
  if (!subs.length) {
    el.innerHTML = '<span class="hint">' + (S.selTask ? "אין תת-משימות" : "בחר משימה...") + '</span>';
    return;
  }
  subs.forEach(function(s) {
    var b = document.createElement("button");
    b.className = "qbtn" + (S.selSub === s ? " active" : "");
    b.textContent = s;
    b.dataset.act = 'pick-sub';
    b.dataset.sub = s;
    el.appendChild(b);
  });
}

function pickSub(s, btn) {
  S.selSub = s;
  tapFlash(btn);
  document.getElementById("subInput").value = s;
  buildSubBtns();
}

function tapFlash(btn) {
  if (!btn) return;
  btn.classList.add("tapped");
  setTimeout(function(){ btn.classList.remove("tapped"); }, 600);
}

function addEntry() {
  var task = document.getElementById("taskInput").value.trim() || S.selTask || "";
  var sub  = document.getElementById("subInput").value.trim() || S.selSub || "";
  var notes = document.getElementById("notesInput").value.trim();
  var count = document.getElementById("countInput").value.trim();
  if (!S.selCat) { toast(MSG_PICK_CATEGORY, null, 'bad'); return; }
  if (!task)   { toast(MSG_NEED_TASK, null, 'bad'); return; }
  var now = new Date();
  var entry = {
    // newClientId ולא השעון — שני מכשירים באותה מילישנייה היו מקבלים אותו מזהה.
    client_id: newClientId(),
    // created_at נפרד מהמזהה — הסדר נגזר ממנו, ו-uuid אינו ניתן להשוואה.
    created_at: now.toISOString(),
    entry_date: getCurrentDateKey(),
    cat: S.selCat.id,
    task: task, sub: sub, notes: notes, count: count,
    updated_at: now.getTime() // בלעדיה הרשומה נחשבת ותיקה במיזוג
  };
  S.ENTRIES.unshift(entry);
  pendMark(PK_ENTRY + entry.client_id);
  saveRows();
  clearForm();
  // אין טוסט כאן — הדחיפה שאחרי מודיעה את התוצאה.
  schedulePush();
}

function clearForm() {
  document.getElementById("taskInput").value = "";
  document.getElementById("subInput").value = "";
  document.getElementById("notesInput").value = "";
  document.getElementById("countInput").value = "";
  S.selTask = null; S.selSub = null;
  buildTaskBtns(); buildSubBtns();
}

export { addEntry, autoSelectTodayChip, buildCatGrid, buildSubBtns, buildTaskBtns,
         onGregDateChange, pickCat, pickDay, pickSub, pickTask, screenEntryHTML };
