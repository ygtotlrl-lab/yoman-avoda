// app/domain.report.js — הדוח היומי: בנייה, רינדור ושיתוף כתמונה
import { esc, toast } from '../core/ui.js';
import { shareFiles } from '../core/share.js';
import { MSG_IMG_FAIL, MSG_IMG_OFFLINE, MSG_IMG_PREP, MSG_NOTHING_TO_SHARE, MSG_NO_ROWS } from './constants.js';
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

// ── פלטים — תמונת הדוח ──
// הייצוא מצלם את הדוח ואינו בונה HTML חדש — מסמך שני מאבד את צבעי הקטגוריות שהמסך מראה.
// היום והרשומות נמסרים — הכותרת נגזרת מהיום, ואין מצב גלובלי שמוחלף בזמן הרינדור.
// יום מהארכיון — תמונה, באותה דרך של שיתוף הדוח (core/share.js): חלון הדפסה אינו עובד במעטפת.
function exportImage(date, entries) {
  var live = liveOnly(entries);
  if (!live.length) { toast(MSG_NO_ROWS); return; }
  _shareReport(live, date, "יומן עבודה " + yaHeb(date) + " " + yaGreg(date));
}

// ── החלוקה לחלקים ──
// עד RP_MAX רשומות — תמונה אחת; מעליהן — כמה תמונות בגודל דומה, כל אחת עד RP_MAX: תמונה ארוכה מדי אינה נקראת בטלפון.
// החיתוך בגבול משימה, ומשימה ארוכה מחלק שלם — בגבול שורה; המיון — כמו בדוח, והחלוקה אחריו.
var RP_MAX = 50;
// הרשומות בסדר שבו הן בטבלה: קטגוריה בסדר ההגדרות, ובתוכה המיון של yaSortEntries
function _rpOrdered(entries) {
  var sorted = yaSortEntries(entries), by = {};
  sorted.forEach(function (e) { (by[e.cat] = by[e.cat] || []).push(e); });
  return S.CATS.reduce(function (out, c) { return by[c.id] ? out.concat(by[c.id]) : out; }, []);
}
function _rpParts(rows) {
  if (rows.length <= RP_MAX) return [rows];
  // יחידות — קבוצה רצופה של קטגוריה ומשימה; משימה ארוכה מחלק שלם — כמה יחידות, בגבול שורה
  var units = [];
  rows.forEach(function (e) {
    var u = units[units.length - 1];
    if (u && u.cat === e.cat && u.task === (e.task || '')) u.rows.push(e);
    else units.push({ cat: e.cat, task: e.task || '', rows: [e] });
  });
  units = units.reduce(function (out, u) {
    if (u.rows.length <= RP_MAX) return out.concat([u.rows]);
    var k = Math.ceil(u.rows.length / RP_MAX), size = Math.ceil(u.rows.length / k);
    for (var i = 0; i < u.rows.length; i += size) out.push(u.rows.slice(i, i + size));
    return out;
  }, []);
  // מילוי עד תקרה: היחידה הבאה שאינה נכנסת — לחלק חדש
  function pack(cap) {
    var parts = [], cur = [];
    units.forEach(function (u) {
      if (cur.length && cur.length + u.length > cap) { parts.push(cur); cur = []; }
      cur = cur.concat(u);
    });
    if (cur.length) parts.push(cur);
    return parts;
  }
  // מספר החלקים — המזערי בתקרה של RP_MAX; והתקרה — הנמוכה ביותר שעוד נותנת אותו מספר: החלקים בגודל דומה
  var n = pack(RP_MAX).length, cap = Math.ceil(rows.length / n);
  while (cap < RP_MAX && pack(cap).length > n) cap++;
  return pack(cap);
}
// רינדור החלקים בזה אחר זה, באותו פאנל, ומשם לשיתוף אחד — כל החלקים יחד
function _shareReport(entries, date, title) {
  var rows = _rpOrdered(entries), parts = _rpParts(rows), n = parts.length, out = [], from = 1;
  // דוח שחולק — שם מלא לכל חלק, עם מספרו: בהורדה כל חלק הוא קובץ נפרד
  if (n > 1) title = "יומן עבודה " + yaHeb(date) + " " + yaGreg(date);
  toast(MSG_IMG_PREP);
  function next(i) {
    if (i >= n) {
      // מעטפת ישנה, בלי גשר הקבצים — ההודעה מבקשת לעדכן את האפליקציה המותקנת
      try { shareFiles(out); } catch (e) { toast(e.message, null, 'bad'); }
      return;
    }
    var part = parts[i], info = n > 1 ? { i: i + 1, n: n, a: from, b: from + part.length - 1, total: rows.length } : null;
    from += part.length;
    _buildReportDiv(function (div) {
      _renderReport(div).then(function (canvas) {
        _hideReportDiv(div);
        out.push({ b64: canvas.toDataURL('image/jpeg', 0.95).split(',')[1], mime: 'image/jpeg',
          name: title + (info ? ' - חלק ' + info.i + ' מתוך ' + info.n : '') + '.jpg' });
        next(i + 1);
      }).catch(function (e) { _reportError(div, e); });
    }, n > 1 ? part : entries, date, info);
  }
  next(0);
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
// html2canvas משכפל את כל הדף לפני הצריבה — רק הדוח, אבותיו וה-head נכנסים לשכפול: יומן מלא שורות ואייקונים האט פי עשרה.
function _renderReport(div){
  if (typeof html2canvas !== 'function') {
    return Promise.reject(new Error('html2canvas not loaded'));
  }
  try {
    return Promise.resolve(
      html2canvas(div,{scale:2,useCORS:true,backgroundColor:getComputedStyle(div).backgroundColor,logging:false,
        ignoreElements:function(el){
          return !(el === div || div.contains(el) || el.contains(div) || el.tagName === 'HEAD' || !!el.closest('head'));
        }})
    );
  } catch(e) {
    return Promise.reject(e);
  }
}

// entries אופציונלי — הייצוא מוסר את רשומות הארכיון, וסינון קשיח ליום הנוכחי היה מוציא דוח ריק.
// הדוח נצרב לתמונה ונושא את סגנונו מוטבע; שורשו .rp מחיל את הערכה הבהירה גם במצב כהה,
// וכל צבע הוא var(--…) — html2canvas קורא את הסגנון המחושב, והמשתנה נפתר לפני הצריבה.
function _buildReportDiv(cb, entries, date, part){
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
        if(cri===0)rowsHTML+='<td rowspan="'+data.list.length+'" class="'+catCls(cid)+' cat-fill rp-cat" style="color:var(--on-cat);font-size:var(--fs-3);text-align:center;vertical-align:middle;border:1px solid var(--border);padding:8px;min-width:65px">'+esc(data.name)+'</td>';
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
    // בדוח שחולק — בכל חלק: מספרו, טווח הרשומות שבו והסה״כ של כל הדוח
    var tail = part ? 'חלק ' + part.i + ' מתוך ' + part.n + ' · רשומות ' + part.a + '–' + part.b + ' · סה״כ ' + part.total + ' רשומות'
      : 'סה״כ ' + sortedPDF.length + ' רשומות';
    div.innerHTML += '<div style="margin-top:14px;text-align:center;font-size:10px;color:var(--text-3);border-top:1px solid var(--card-2);padding-top:10px;font-family:Heebo,Arial,sans-serif;">' + 'יחי אדוננו מורנו ורבינו מלך המשיח לעולם ועד! | ' + (part ? '<b style="color:var(--text-2)">' + tail + '</b>' : tail) + '</div>';
  showEl(div, true);cb(div);
}

// ── שיתוף הדוח כתמונה ──
// html2canvas לקובץ, ומשם לשיתוף — core/share.js: במעטפת הגשר, בדפדפן גיליון השיתוף, ובלעדיו הורדה.
function shareReport(){
  var curKey = getCurrentDateKey();
  var todayEntries = liveOnly(S.ENTRIES).filter(function(e){ return e.entry_date === curKey; });
  if(!todayEntries.length){ toast(MSG_NOTHING_TO_SHARE); return; }
  _shareReport(todayEntries, curKey, 'yoman');
}

export { exportImage, shareReport };
