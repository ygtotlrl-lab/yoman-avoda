// app/screens/pick.js — בחירת הישיבה ומציג טבלת התשתית
import { errMsg, withTimeout } from '../../core/util.js';
import { esc, openModal } from '../../core/ui.js';
import { MSG_INFRA_TABLE, YESHIVOT } from '../constants.js';
import { S } from '../state.js';

// מציג הטבלה במסך הבחירה ולא בתוך הישיבה — הטבלה של הארגון, ומסך שנפתח מתוך מוסד נקרא כמתאר אותו.
function screenPickHTML() {
  return `
<div id="yeshivaSelect">
  <div class="ys-pick-card">
    <svg class="ys-pick-mark" viewBox="0 0 268 264" aria-hidden="true" focusable="false">
      <rect x="72" y="0" width="196" height="48" rx="24" opacity="0.6"></rect>
      <rect x="0" y="72" width="268" height="48" rx="24" opacity="0.73"></rect>
      <rect x="28" y="144" width="240" height="48" rx="24" opacity="0.87"></rect>
      <rect x="114" y="216" width="154" height="48" rx="24" opacity="1"></rect>
    </svg>
    <h1 class="ys-pick-h1">יומן עבודה</h1>
    <div class="ys-pick-lead">בחר ישיבה</div>
    <div class="ys-pick-btns">${YESHIVOT.map(function (y) {
      return '<button class="ys-pick-btn" data-act="pick-yeshiva" data-yeshiva="' + y.id + '">' + esc(y.name) + '</button>';
    }).join('')}</div>
    <div class="ys-pick-aside">
      <button class="ys-pick-alt" data-act="inf-open">📊 טבלת התשתית</button>
    </div>
  </div>
</div>
`;
}

// צרכנו היחיד של RAW_BASE הוא מציג טבלת התשתית — כתובת שנייה הייתה מקור אמת שני.
var GITHUB_USER = "ygtotlrl-lab";

var GITHUB_REPO = "yoman-avoda";

var RAW_BASE = "https://raw.githubusercontent.com/" + GITHUB_USER + "/" + GITHUB_REPO + "/main/";

// ── מציג טבלת התשתית ──
// הקובץ נמשך בזמן אמת ואינו מוטבע — עותק בקוד מתיישן; וכשל משיכה מוצג גלוי, שמסך ריק נקרא כאין נתונים.
var YA_INF_MD = RAW_BASE + 'TABLE.md';

// הפרדה על | משאירה תא ריק בשני הקצוות
function _infCells(line) {
  var p = line.split('|');
  if (p.length && p[0].trim() === '') p.shift();
  if (p.length && p[p.length - 1].trim() === '') p.pop();
  return p.map(function (x) { return x.trim(); });
}

// ההמרה אחרי esc — המרה לפניו הייתה מחזירה HTML מהקובץ אל תוך הדף.
function _infMd(t) {
  return esc(t).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
               .replace(/`([^`]+)`/g, '<code>$1</code>');
}

// תא שאינו אחד משלושת הסימנים מוצג כפי שהוא ואינו נבלע.
// שם אפליקציה בלי סמל מוצג באות הראשונה — אפליקציה שנוספה לטבלה אינה נעלמת.
var INF_ICONS = {
  'יומן': '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18"/><path d="M12 8h4M12 12h4M12 16h4"/>',
  'הנהלה': '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M15 11l2 2 4-4"/>',
  'שכר': '<ellipse cx="12" cy="6" rx="7" ry="2.5"/><path d="M5 6v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6"/><path d="M5 10v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4"/><path d="M5 14v4c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-4"/>',
  'גיוס': '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  'קופה': '<circle cx="12" cy="4.5" r="2.5"/><rect x="3" y="9" width="18" height="11" rx="2"/><path d="M9 13h6"/>'
};

function _infAppTh(a) {
  var icoSvg = INF_ICONS[a];
  var cellHtml = icoSvg
    ? '<svg class="inf-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + icoSvg + '</svg>'
    : '<span class="inf-ico-l" aria-hidden="true">' + esc(String(a).charAt(0)) + '</span>';
  return '<th class="inf-app" title="' + esc(a) + '" aria-label="' + esc(a) + '">' + cellHtml + '</th>';
}

function _infDot(cell) {
  if (cell === '✅') return '<span class="inf-dot ok" title="תקין"></span>';
  if (cell === '⭕') return '<span class="inf-dot gap" title="חסר-מנומק"></span>';
  if (cell === '❌') return '<span class="inf-dot bad" title="לא מטופל"></span>';
  return esc(cell);
}

// אין כאן סיכום כללים — הטבלה היא ההוראה, ואין פרק כללים לפרק.
function _infParse(md) {
  var lines = md.split('\n');
  var chaps = [], chap = null, cats = [], cur = null, rows = [], apps = null, width = 0;
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    // כל פרק נפתח בטבלה משלו — ולכן הקטגוריה שמעליו נסגרת כאן.
    if (l.indexOf('### ') === 0) {
      chap = { title: l.slice(4).trim(), cats: [] };
      chaps.push(chap);
      cur = null;
      continue;
    }
    if (l.charAt(0) !== '|') continue;
    var c = _infCells(l);
    // האפליקציות נגזרות מהעמודות שבין מה זה להערה — רשימה מוקלדת הייתה מציגה עמודה תחת כותרת של אחרת.
    if (c[0] === '#') { apps = c.slice(3, -1); width = c.length; continue; }
    if (!width || c.length !== width) continue;
    // שורת סדר-הפנים אינה שורת נתונים ואינה כותרת — בלי הענף הזה היא נקראת ונזרקת.
    if (c[0] === '' && cur && c[1].charAt(0) === '↳') {
      cur.order = c[1].slice(1).trim();
      continue;
    }
    // כותרת הקטגוריה מזוהה בתא המספר הריק ולא בהדגשה
    if (!chap) { chap = { title: '', cats: [] }; chaps.push(chap); }
    if (c[0] === '') {
      cur = { title: c[1].replace(/\*\*/g, ''), order: '', rows: [] };
      cats.push(cur);
      chap.cats.push(cur);
      continue;
    }
    if (!/^\d+$/.test(c[0])) continue;
    var row = { n: Number(c[0]), name: c[1], std: c[2],
                apps: c.slice(3, -1), note: c[c.length - 1] };
    rows.push(row);
    if (!cur) { cur = { title: '—', order: '', rows: [] }; cats.push(cur); chap.cats.push(cur); }
    cur.rows.push(row);
  }
  return { chaps: chaps, cats: cats, rows: rows, apps: apps || [] };
}

// הציור נפרד מהפירוק — פתח/סגור הכל מצייר מחדש בלי למשוך שוב.
function _infHtml(d) {
  var h = '<div class="inf">';
  h += '<div class="inf-hd"><b>טבלת התשתית</b>' +
       '<span>' + d.rows.length + ' שורות · נמשך מ-GitHub בזמן אמת</span></div>';

  h += '<div class="inf-card">' +
       '<div class="inf-bar"><button data-act="inf-all" data-open="1">פתח הכל</button>' +
       '<button data-act="inf-all" data-open="0">סגור הכל</button>' +
       '<span class="inf-tag"><span class="inf-dot ok"></span> תקין</span>' +
       '<span class="inf-tag"><span class="inf-dot gap"></span> חסר-מנומק</span>' +
       '<span class="inf-tag"><span class="inf-dot bad"></span> לא מטופל</span></div>';
  // כותרת הפרק אינה מתקפלת — פתח/סגור הכל חל על הקטגוריות בלבד.
  d.chaps.forEach(function (p) {
    if (p.title) h += '<h4 class="inf-chap">' + esc(p.title) + '</h4>';
    p.cats.forEach(function (c) {
      h += '<details class="inf-cat"' + (S._infOpen ? ' open' : '') + '>' +
           '<summary>' + esc(c.title) + ' — ' + c.rows.length + '</summary>' +
           (c.order ? '<div class="inf-ord">↳ ' + _infMd(c.order) + '</div>' : '') +
           '<div class="inf-wrap"><table class="inf-tbl">' +
           '<colgroup><col class="c-n"><col class="c-t"><col class="c-s">' +
           d.apps.map(function () { return '<col class="c-a">'; }).join('') +
           '<col class="c-r"></colgroup><thead><tr><th>#</th><th>כותרת</th><th>התקן</th>' +
           d.apps.map(_infAppTh).join('') +
           '<th>הערה</th></tr></thead><tbody>';
      c.rows.forEach(function (r) {
        h += '<tr><td>' + r.n + '</td><td>' + _infMd(r.name) + '</td><td>' + _infMd(r.std) + '</td>' +
             r.apps.map(function (a) { return '<td class="inf-app">' + _infDot(a) + '</td>'; }).join('') +
             '<td>' + _infMd(r.note) + '</td></tr>';
      });
      h += '</tbody></table></div></details>';
    });
  });
  h += '</div>';
  h += '</div>';
  return h;
}

async function yaInfraOpen() {
  S._infOpen = false;
  openModal(MSG_INFRA_TABLE,
    '<div class="inf"><div class="inf-hd"><b>טבלת התשתית</b>' +
    '<span>מושך מ-GitHub…</span></div></div>', '');
  var md = null;
  try {
    var res = await withTimeout(fetch(YA_INF_MD, { cache: 'no-store' }));
    if (!res || !res.ok) throw new Error('HTTP ' + (res ? res.status : '—'));
    md = await res.text();
  } catch (e) {
    var el = document.getElementById('modal-body');
    if (el) el.innerHTML = '<div class="inf"><div class="inf-err">' +
      '⚠️ המשיכה מ-GitHub נכשלה — ' + esc(errMsg(e)) +
      '<br>הטבלה נקראת בזמן אמת מהריפו, ואין עותק במכשיר.</div>' +
      '<div class="inf-bar"><button data-act="inf-open">↻ נסה שוב</button></div></div>';
    return;
  }
  S._infData = _infParse(md);
  _infPaint();
}

function _infPaint() {
  var el = document.getElementById('modal-body');
  if (el && S._infData) el.innerHTML = _infHtml(S._infData);
}

function yaInfraToggleAll(open) {
  S._infOpen = open;
  _infPaint();
}

export { screenPickHTML, yaInfraOpen, yaInfraToggleAll };
