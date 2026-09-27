// app/screens/log.js — מסך היומן, הדוח והשיתוף
import { MSG_DELETE } from '../../core/util.js';
import { idEq, pendMark, pendTag, schedulePush } from '../../core/sync.js';
import { ask, esc, toast } from '../../core/ui.js';
import { S } from '../state.js';
import { MSG_CLEAR_ALL_BODY, MSG_CLEAR_ALL_TITLE, MSG_IMG_FAIL, MSG_IMG_OFFLINE,
         MSG_IMG_PREP, MSG_NOTHING_TO_SHARE, MSG_NO_ROWS, MSG_PDF_PREP,
         MSG_POPUP_BLOCKED } from '../config.js';
import { PK_ENTRY, autoArchiveDay, catCls, catNameOf, getCurrentDateKey, isLive,
         liveOnly, recDelete, recTouch, saveEntries, yaSortEntries } from '../domain.js';
import { showEl } from './entry.js';
import { cssQ, yaYeshiva } from '../main.js';

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

// שם המוסד נקרא מההגדרות לכל הפלטים — שם קשיח מוציא דוחות של מוסד אחד בשם השני.
function instName() {
  var el = document.getElementById("instNameInput");
  var v = el && el.value ? el.value.trim() : '';
  if (v) return v;
  var y = yaYeshiva(S.YESHIVA);
  return y ? y.full : '';
}

// ── פלטים — PDF ותמונת הדוח ──
// הייצוא מצלם את הדוח ואינו בונה HTML חדש — מסמך שני מאבד את צבעי הקטגוריות שהמסך מראה.
function exportPDF() {
  var live = liveOnly(S.ENTRIES);
  if (!live.length) { toast(MSG_NO_ROWS); return; }
  // הכותרת נגזרת לפני הרינדור הא-סינכרוני — מסלול הארכיון משחזר את ENTRIES ואת שדה התאריך לפני שהרינדור מסתיים.
  var today = document.getElementById("hebDateInput").value || hebrewDate(new Date());
  var todayGreg = getCurrentDateKey();
  var fileTitle = "יומן עבודה " + today + " " + todayGreg;
  toast(MSG_PDF_PREP);
  _buildReportDiv(function (div) {
    _renderReport(div).then(function (canvas) {
      _hideReportDiv(div);
      _printCanvas(canvas, fileTitle);
    }).catch(function (e) { _reportError(div, e); });
  }, live);
}

// מעטפת הדפסה לצילום בלבד — אין בה טבלה, כותרת או צבע, רק הפיקסלים שנמדדו.
function _printCanvas(canvas, title) {
  var w = null;
  try { w = window.open("", "_blank", "width=900,height=700"); } catch (e) { w = null; }
  // חוסם חלונות קופצים מחזיר null — בלי הבדיקה הפונקציה נופלת בשקט.
  if (!w || !w.document) {
    toast(MSG_POPUP_BLOCKED, null, 'bad');
    return;
  }
  w.document.write('<!DOCTYPE html><html dir="rtl" lang="he"><head><meta charset="UTF-8">'
    + '<title>' + esc(title) + '</title><style>@page{size:A4 portrait;margin:10mm}'
    + 'html,body{margin:0;padding:0;background:var(--card)}img{width:100%;height:auto;display:block}'
    + '</style></head><body><img alt="' + esc(title) + '" src="' + canvas.toDataURL('image/png') + '">'
    + '<' + 'script>window.onload=function(){setTimeout(function(){window.print();},500);}<\/script>'
    + '</body></html>');
  w.document.close();
  setTimeout(function () { try { w.document.title = title; } catch (e) {} }, 80);
}

// ── רשת ביטחון לרינדור הדוח ──
// פאנל _rpDiv מוצג לפני הרינדור — אם הרינדור זורק (html2canvas לא נטען אופליין, או כשל canvas/CORS)
// הפאנל היה נשאר מעל האפליקציה עד רענון.
function _hideReportDiv(div){
  showEl(div, false);
}

function _reportError(div, e){
  _hideReportDiv(div);
  console.error('[report] rendering failed:', e);
  toast(
    (typeof html2canvas === 'undefined')
      ? MSG_IMG_OFFLINE
      : MSG_IMG_FAIL
  , null, 'bad');
}

// מחזירה תמיד promise ואינה זורקת סינכרונית — זריקה הייתה משאירה את פאנל הדוח על המסך.
function _renderReport(div){
  if (typeof html2canvas !== 'function') {
    return Promise.reject(new Error('html2canvas not loaded'));
  }
  try {
    return Promise.resolve(
      html2canvas(div,{scale:2,useCORS:true,backgroundColor:getComputedStyle(div).backgroundColor,logging:false})
    );
  } catch(e) {
    return Promise.reject(e);
  }
}

// entries אופציונלי — הייצוא מוסר את רשומות הארכיון, וסינון קשיח ליום הנוכחי היה מוציא דוח ריק.
// הדוח נצרב לתמונה ונושא את סגנונו מוטבע; שורשו .rp מחיל את הערכה הבהירה גם במצב כהה,
// וכל צבע הוא var(--…) — html2canvas קורא את הסגנון המחושב, והמשתנה נפתר לפני הצריבה.
function _buildReportDiv(cb, entries){
  var div=document.getElementById('_rpDiv');
  if(!div){div=document.createElement('div');div.id='_rpDiv';document.body.appendChild(div);}
  // שורש הפלט שנצרב לתמונה נושא את סגנונו מוטבע, וכך כל ילדיו — מחלקה כאן הייתה מפצלת את הדוח בין הגיליון לבונה.
  div.className='rp';div.style.cssText='position:fixed;top:0;left:0;background:var(--card);padding:20px;width:900px;direction:rtl;font-family:Heebo,Arial,sans-serif;z-index:9999;';
  var today=document.getElementById("hebDateInput")?document.getElementById("hebDateInput").value:hebrewDate(new Date());
  var todayGreg=getCurrentDateKey();
  var dayLabel=document.getElementById("dayNameEl")?document.getElementById("dayNameEl").textContent:'';
  var instTitle=instName();
  var logoEl=document.getElementById('appLogo')||document.querySelector('.hdr-logo');
  var logoUrl=logoEl?logoEl.src:'';
  var curKey = getCurrentDateKey();
  var src = Array.isArray(entries) ? entries
          : liveOnly(S.ENTRIES).filter(function(e){ return e.gdate === curKey; });
  var sortedPDF = yaSortEntries(src);
  var byCAT={};sortedPDF.forEach(function(e){if(!byCAT[e.cat])byCAT[e.cat]={name:catNameOf(e),list:[]};byCAT[e.cat].list.push(e);});
  var catLetters=S.CATS.map(function(c){return c.letter;}).filter(function(l){return !!byCAT[l];});
  var rowsHtml='';
  var globalTaskIdx = 0;
  catLetters.forEach(function(letter){
    var data=byCAT[letter];
    var tgs=[];data.list.forEach(function(e){var last=tgs[tgs.length-1];if(last&&last.task===(e.task||''))last.items.push(e);else tgs.push({task:e.task||'',items:[e]});});
    var cri=0;
    tgs.forEach(function(tg,ti){
      var bg=(globalTaskIdx%2===0)?'var(--card)':'var(--bg)'; globalTaskIdx++;
      tg.items.forEach(function(e,ii){
        rowsHtml+='<tr>';
        if(cri===0)rowsHtml+='<td rowspan="'+data.list.length+'" class="'+catCls(letter)+' cat-fill rp-cat" style="color:var(--on-cat);font-size:var(--fs-3);text-align:center;vertical-align:middle;border:1px solid var(--border);padding:8px;min-width:65px">'+esc(data.name)+'</td>';
        if(ii===0)rowsHtml+='<td rowspan="'+tg.items.length+'" style="padding:6px 10px;border:1px solid var(--border);font-size:12px;font-weight:600;vertical-align:middle;background:'+bg+';">'+esc(tg.task)+'</td>';
        rowsHtml+='<td style="padding:6px 10px;border:1px solid var(--border);font-size:11px;background:'+bg+';">'+esc(e.sub||'')+'</td>';
        rowsHtml+='<td style="padding:6px 10px;border:1px solid var(--border);font-size:11px;text-align:center;background:'+bg+';">'+esc(e.count||'')+'</td>';
        rowsHtml+='<td style="padding:6px 10px;border:1px solid var(--border);font-size:11px;background:'+bg+';">'+esc(e.notes||'')+'</td>';
        rowsHtml+='</tr>';cri++;
      });
    });
  });
  var logoHtml=logoUrl?'<img src="'+esc(logoUrl)+'" style="width:50px;height:50px;object-fit:contain;border-radius:4px;">':'';
  div.innerHTML='<div style="display:flex;align-items:center;gap:14px;border-bottom:3px solid var(--text);padding-bottom:12px;margin-bottom:14px;">'+logoHtml
    +'<div style="flex:1;text-align:center;"><div style="font-size:10px;color:var(--text-3);letter-spacing:2px;">ב"ה | ימות המשיח</div>'
    +'<div style="font-size:26px;font-weight:900;color:var(--text);">יומן עבודה</div>'
    +'<div style="font-size:11px;color:var(--text-2);">'+esc(instTitle)+'</div></div>'
    +'<div style="text-align:left;min-width:80px;"><div style="font-size:13px;font-weight:700;color:var(--text);">'+esc(dayLabel)+'</div>'
    +'<div style="font-size:11px;color:var(--text);">'+esc(today)+'</div><div style="font-size:10px;color:var(--text-3);">'+esc(todayGreg)+'</div></div></div>'
    +'<table style="width:100%;border-collapse:collapse;font-family:Heebo,Arial,sans-serif;"><thead><tr style="background:var(--text);color:var(--card);">'
    +'<th style="padding:9px 10px;text-align:right;font-size:12px;">קטגוריה</th>'
    +'<th style="padding:9px 10px;text-align:right;font-size:12px;">משימה</th>'
    +'<th style="padding:9px 10px;text-align:right;font-size:12px;">תת-משימה</th>'
    +'<th style="padding:9px 10px;text-align:center;font-size:12px;">כמות</th>'
    +'<th style="padding:9px 10px;text-align:right;font-size:12px;">הרחבה</th>'
    +'</tr></thead><tbody>'+rowsHtml+'</tbody></table>';
    // הסיכום הוא בדיוק השורות שבטבלה ולא כל ENTRIES — אחרת הדוח מציג סיכום שאינו תואם את שורותיו.
    div.innerHTML += '<div style="margin-top:14px;text-align:center;font-size:10px;color:var(--text-3);border-top:1px solid var(--card-2);padding-top:10px;font-family:Heebo,Arial,sans-serif;">' + 'יחי אדוננו מורנו ורבינו מלך המשיח לעולם ועד! | סה״כ ' + sortedPDF.length + ' רשומות</div>';
  showEl(div, true);cb(div);
}

// אין כאן פרמטר יעד — בורר המערכת בוחר; והחתימה היא חוזה עם Java, ומשתנה בשני הצדדים יחד.
// AndroidShareBridge (addWebMessageListener) נוסה ראשון — בו WebView עצמו אוכף את רשימת המקורות;
// AndroidShare (addJavascriptInterface) נשאר ל-WebView ישן מ-88, והמעטפת מאמתת בו את מקור הדף.
function _androidShareImage(canvas){
  try {
    var br = window.AndroidShareBridge;
    if (br && typeof br.postMessage === 'function') {
      br.postMessage(JSON.stringify({
        data: canvas.toDataURL('image/jpeg',0.95).split(',')[1],
        mime: 'image/jpeg'
      }));
      return true;
    }
    if (window.AndroidShare && typeof window.AndroidShare.shareImage === 'function') {
      var b64 = canvas.toDataURL('image/jpeg',0.95).split(',')[1];
      window.AndroidShare.shareImage(b64, 'image/jpeg');
      return true;
    }
  } catch(e) { /* נופל לשיתוף של הדפדפן */ }
  return false;
}

// הורדה בלבד, בלי קישור-עומק ליעד — קישור כזה הוא מסלול שיתוף שני שאיש אינו בודק, ונשבר בשקט.
function _shareDownloadFallback(canvas){
  var dataUrl = canvas.toDataURL('image/jpeg',0.95);
  var a=document.createElement('a');
  a.href=dataUrl;
  a.download='yoman.jpg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── שיתוף הדוח כתמונה ──
// html2canvas לקובץ, ומשם לגיליון השיתוף של המערכת; בדסקטופ — הורדת התמונה.
function shareReport(){
  var curKey = getCurrentDateKey();
  var todayEntries = liveOnly(S.ENTRIES).filter(function(e){ return e.gdate === curKey; });
  if(!todayEntries.length){ toast(MSG_NOTHING_TO_SHARE); return; }
  toast(MSG_IMG_PREP);
  _buildReportDiv(function(div){
    _renderReport(div).then(function(canvas){
      _hideReportDiv(div);
      if (_androidShareImage(canvas)) return;
      canvas.toBlob(function(blob){
        var file = new File([blob], 'yoman.jpg', {type:'image/jpeg'});
        if (navigator.canShare && navigator.canShare({files:[file]})) {
          navigator.share({files:[file]}).catch(function(err){
            if (err && err.name !== 'AbortError') _shareDownloadFallback(canvas);
          });
          return;
        }
        _shareDownloadFallback(canvas);
      },'image/jpeg',0.95);
    }).catch(function(e){ _reportError(div, e); });
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

export { clearAll, delEntry, editEntry, exportPDF, renderLog, saveEntry, screenLogHTML,
         shareReport };
