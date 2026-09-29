// app/domain.report.js — הדוח היומי: בנייה, רינדור, הדפסה ושיתוף
import { esc, toast } from '../core/ui.js';
import { MSG_IMG_FAIL, MSG_IMG_OFFLINE, MSG_IMG_PREP, MSG_NOTHING_TO_SHARE, MSG_NO_ROWS,
         MSG_PDF_PREP, MSG_POPUP_BLOCKED } from './constants.js';
import { S } from './state.js';
import { catCls, catLabelOf, getCurrentDateKey, liveOnly, showEl, yaDayName, yaGreg, yaHeb, yaSortEntries,
         yaYeshiva } from './domain.js';

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
// היום והרשומות נמסרים — הכותרת נגזרת מהיום, ואין מצב גלובלי שמוחלף בזמן הרינדור.
function exportPDF(date, entries) {
  var live = liveOnly(entries);
  if (!live.length) { toast(MSG_NO_ROWS); return; }
  var fileTitle = "יומן עבודה " + yaHeb(date) + " " + yaGreg(date);
  toast(MSG_PDF_PREP);
  _buildReportDiv(function (div) {
    _renderReport(div).then(function (canvas) {
      _hideReportDiv(div);
      _printCanvas(canvas, fileTitle);
    }).catch(function (e) { _reportError(div, e); });
  }, live, date);
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
function _buildReportDiv(cb, entries, date){
  var div=document.getElementById('_rpDiv');
  if(!div){div=document.createElement('div');div.id='_rpDiv';document.body.appendChild(div);}
  // שורש הפלט שנצרב לתמונה נושא את סגנונו מוטבע, וכך כל ילדיו — מחלקה כאן הייתה מפצלת את הדוח בין הגיליון לבונה.
  div.className='rp';div.style.cssText='position:fixed;top:0;left:0;background:var(--card);padding:20px;width:900px;direction:rtl;font-family:Heebo,Arial,sans-serif;z-index:9999;';
  var today=yaHeb(date);
  var todayGreg=yaGreg(date);
  var dayLabel=yaDayName(date);
  var instTitle=instName();
  var logoEl=document.getElementById('appLogo')||document.querySelector('.hdr-logo');
  var logoUrl=logoEl?logoEl.src:'';
  var sortedPDF = yaSortEntries(entries);
  var byCAT={};sortedPDF.forEach(function(e){if(!byCAT[e.cat])byCAT[e.cat]={name:catLabelOf(e),list:[]};byCAT[e.cat].list.push(e);});
  var catIds=S.CATS.map(function(c){return c.id;}).filter(function(l){return !!byCAT[l];});
  var rowsHTML='';
  var globalTaskIdx = 0;
  catIds.forEach(function(cid){
    var data=byCAT[cid];
    var tgs=[];data.list.forEach(function(e){var last=tgs[tgs.length-1];if(last&&last.task===(e.task||''))last.items.push(e);else tgs.push({task:e.task||'',items:[e]});});
    var cri=0;
    tgs.forEach(function(tg,ti){
      var bg=(globalTaskIdx%2===0)?'var(--card)':'var(--bg)'; globalTaskIdx++;
      tg.items.forEach(function(e,ii){
        rowsHTML+='<tr>';
        if(cri===0)rowsHTML+='<td rowspan="'+data.list.length+'" class="'+catCls(letter)+' cat-fill rp-cat" style="color:var(--on-cat);font-size:var(--fs-3);text-align:center;vertical-align:middle;border:1px solid var(--border);padding:8px;min-width:65px">'+esc(data.name)+'</td>';
        if(ii===0)rowsHTML+='<td rowspan="'+tg.items.length+'" style="padding:6px 10px;border:1px solid var(--border);font-size:12px;font-weight:600;vertical-align:middle;background:'+bg+';">'+esc(tg.task)+'</td>';
        rowsHTML+='<td style="padding:6px 10px;border:1px solid var(--border);font-size:11px;background:'+bg+';">'+esc(e.sub||'')+'</td>';
        rowsHTML+='<td style="padding:6px 10px;border:1px solid var(--border);font-size:11px;text-align:center;background:'+bg+';">'+esc(e.count||'')+'</td>';
        rowsHTML+='<td style="padding:6px 10px;border:1px solid var(--border);font-size:11px;background:'+bg+';">'+esc(e.notes||'')+'</td>';
        rowsHTML+='</tr>';cri++;
      });
    });
  });
  var logoHTML=logoUrl?'<img src="'+esc(logoUrl)+'" style="width:50px;height:50px;object-fit:contain;border-radius:4px;">':'';
  div.innerHTML='<div style="display:flex;align-items:center;gap:14px;border-bottom:3px solid var(--text);padding-bottom:12px;margin-bottom:14px;">'+logoHTML
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
    +'</tr></thead><tbody>'+rowsHTML+'</tbody></table>';
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
  var todayEntries = liveOnly(S.ENTRIES).filter(function(e){ return e.entry_date === curKey; });
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
  }, todayEntries, curKey);
}

export { exportPDF, shareReport };
