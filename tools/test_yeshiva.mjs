/* ───────────────────────────────────────────────────────────────────────────
   test_yeshiva.mjs — החלפת ישיבה, ומסך הבחירה
   ───────────────────────────────────────────────────────────────────────────
   **מה נאכף:** ההחלפה בין שני המוסדות עוברת בלוגו ⟵ `openModal` ⟵ איפוס
   המצב הפר-מוסדי ⟵ `selectYeshiva`, **בסדר הזה** ⛔ ובלי אישור שני; ⛔ ומסך הבחירה
   נושא את חמשת ערכי האייקון — שני צבעי המדרג, זווית המדרג, צבע הדיו,
   וארבעת פסי הסמל — ⛔ כפי שהם מוצהרים ב-`APP` שב-`gen-icons.mjs`.

   **הנימוק המדוד:** עד סבב 81 לא היה מנגנון החלפה כלל — ⚠️ הבחירה נעשתה
   פעם אחת בעלייה, ⛔ ולהחליף היה צריך לסגור ולפתוח. ⭐ ומה שהופך החלפה
   בזיכרון למסוכנת הוא שהרשומות נטענות מחדש לפי סיומת המפתח, ⛔ אבל עֵד
   הדחיפה ואות הפולינג הם זיכרון בלי סיומת: ⚠️ אות פולינג שנשאר גורם
   למשיכה הראשונה של המוסד החדש לחשוב שאין מה למשוך.

   **מה יישבר בלעדיו:** ⛔ החלפה שאינה מאפסת מערבבת את שני המוסדות —
   ⚠️ הכשל שקט לחלוטין: המסך נראה תקין, ⭐ והנתון החסר מתגלה ימים אחר כך.
   ⛔ ומסך בחירה שצבעיו נכתבו ביד הוא מקור שני לגוון האפליקציה, ⚠️ והוא
   נסחף מהאייקון בלי שאיש מודד.

   **מה אינו נאכף כאן:** ⛔ מראה המסך — ⚠️ נמדדים **ערכים** ולא פיקסלים ·
   ⛔ ופנים האפליקציה, ⭐ שהכחול הבהיר שלו הוא החלטה נפרדת ואינו גוון
   האייקון. ⚠️ והשער פרטי ליומן — ⛔ הוא המוסד היחיד שיש בו שתי ישיבות,
   ⭐ ובשלוש האחרות אין מה להחליף.

   ⛔ המוטציות רצות על עותק בתיקייה זמנית ואינן נכתבות לעץ.
   ──────────────────────────────────────────────────────────────────────── */

import { readFileSync, writeFileSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

/* ── APP — הדבר היחיד שנבדל בין הריפו ──────────────────────────────────── */
const APP = {
  name: 'yoman-avoda',
};
/* ── סוף APP ───────────────────────────────────────────────────────────── */

/*  ⛔ הקובץ הזה אינו אוכף שורה בטבלת התשתית — ⚠️ הצהרה ריקה ולא היעדר:
 *  ⭐ החלפת מוסד היא לוגיקה עסקית של יומן, ⛔ ולוגיקה עסקית אינה נכנסת
 *  לטבלה. */
export const ROWS = [];

/*  ⛔ המוטציות אינן ברירת המחדל (סבב 92) — ⚠️ כל מוטציה היא שינוי ⟵ הרצה
 *  ⟵ שחזור, ⭐ ושני שערים לבדם היו רוב זמן הסט: ⛔ הן רצות ברמה המלאה
 *  (`--full`), בסוף הסבב ולפני מיזוג, ⚠️ ולא בכל הרצה בזמן העבודה. */
const RUN_MUT = process.env.GATE_MUT === '1';

/*  ⛔ המצב הפר-מוסדי שחי בזיכרון בלבד — ⚠️ מפתחות האחסון נושאים סיומת
 *  מוסד ולכן נטענים מחדש, ⭐ ואלה אינם: ⛔ כל שם כאן חייב להיות משתנה
 *  ברמת הקובץ **וגם** מאופס בפונקציית האיפוס, ⚠️ ושם שאינו אחד מהם
 *  מפיל — ⭐ כך ששינוי שם אינו מדלג בשקט. */
const TENANT_STATE = ['_tbPushedAt', '_lastKnownTimestamp', '_plFullAt',
                      '_pendMap', '_tombPrunePending'];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const t = (n, cond, m) => { if (cond) { pass++; console.log(`  ok   ${n} · ${m}`); }
                            else { fail++; console.log(`  FAIL ${n} · ${m}`); } };

const hex = (a) => '#' + a.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
/*  ⛔ גוף פונקציה בהתאמת סוגריים ⛔ ולא חלון תווים קבוע — ⚠️ חלון קבוע
 *  מפספס פונקציה ארוכה ממנו, ⭐ והטענה על הסדר שבתוכה עוברת על ריק. */
function bodyOf(page, name) {
  const at = page.indexOf('function ' + name + '(');
  if (at < 0) return '';
  let i = page.indexOf('{', at), d = 0;
  for (let k = i; k < page.length; k++) {
    if (page[k] === '{') d++;
    else if (page[k] === '}' && --d === 0) return page.slice(i, k + 1);
  }
  return '';
}

/* ── הביקורת — רצה על שורש כלשהו ───────────────────────────────────────── */
function audit(root) {
  const v = [];
  const page = readFileSync(join(root, 'index.html'), 'utf8');
  const gen  = readFileSync(join(root, 'tools', 'gen-icons.mjs'), 'utf8');
  const appBlk = (/\/\* ── APP[\s\S]*?\/\* ── סוף APP/.exec(gen) || [''])[0];
  const nums = (name) => {
    const m = new RegExp(name + ':\\s*\\[([^\\]]*)\\]').exec(appBlk);
    return m ? m[1].split(',').map((x) => Number(x.trim())) : null;
  };

  /* א. הלוגו הוא כפתור אמיתי, ושתי הפעולות מנותבות בדלגציה */
  const trigger = /<button class="hdr-logo-btn" data-act="open-yeshiva-picker"/.test(page);
  if (!trigger) v.push({ kind: 'trigger', msg: 'הלוגו אינו כפתור שנושא `open-yeshiva-picker`' });
  for (const act of ['open-yeshiva-picker', 'switch-yeshiva']) {
    const routed = new RegExp("'" + act + "':\\s*function").test(page);
    if (!routed) v.push({ kind: 'route', msg: `הפעולה «${act}» אינה מנותבת ב-DOM_ACTIONS` });
  }

  /* ב. הבורר עובר ב-`openModal`, והאישור ב-`ask` */
  const picker = bodyOf(page, 'ysPickYeshiva');
  if (!/openModal\(/.test(picker))
    v.push({ kind: 'modal', msg: 'הבורר אינו נפתח ב-`openModal`' });

  /*  ג. סדר המעבר — איפוס ואז ההחלפה, ⛔ ובלי אישור שני (סבב 82):
      ⚠️ הבחירה במוסד בבורר **היא** האישור, ⭐ ושני דיאלוגים לפעולה אחת
      מלמדים ללחוץ «כן» בלי לקרוא — ⛔ ואז גם האישור שכן חשוב נלחץ כך. */
  const conf = bodyOf(page, 'ysConfirmSwitch');
  const iRst = conf.indexOf('ysResetTenantState()');
  const iSel = conf.indexOf('selectYeshiva(');
  if (iRst < 0 || iSel < 0 || !(iRst < iSel))
    v.push({ kind: 'order', msg:
      `הסדר במעבר — איפוס ${iRst} · selectYeshiva ${iSel}; הצפוי עולה` });
  if (/(?<![\w$])ask\s*\(/.test(conf))
    v.push({ kind: 'order', msg:
      'אישור שני במעבר — נמדדה קריאת `ask` ב-`ysConfirmSwitch` והצפוי אפס' });

  /* ד. האיפוס מכסה את כל המצב הפר-מוסדי */
  const reset = bodyOf(page, 'ysResetTenantState');
  const missReset = TENANT_STATE.filter((n) => !new RegExp('(?<![\\w$])' + n + '\\s*=').test(reset));
  const missVar = TENANT_STATE.filter((n) => !new RegExp('(?:var|let)\\s[^;\\n]*(?<![\\w$])' + n + '\\b').test(page));
  if (missReset.length)
    v.push({ kind: 'reset', msg: `אינם מאופסים: ${missReset.join(' · ')}` });
  if (missVar.length)
    v.push({ kind: 'reset', msg: `מוצהרים כאן ואינם משתנים בקובץ: ${missVar.join(' · ')}` });

  /* ה. חמשת ערכי האייקון — נגזרים מ-`gen-icons` ומושווים למסך הבחירה */
  const start = nums('start'), end = nums('end'), ink = nums('ink');
  const p1 = nums('p1'), p2 = nums('p2');
  if (!start || !end || !ink || !p1 || !p2) {
    v.push({ kind: 'palette', msg: 'לא נחלצו ערכי `APP` מ-`gen-icons`' });
  } else {
    const ang = Math.round(180 - Math.atan2(p2[0] - p1[0], p2[1] - p1[1]) * 180 / Math.PI);
    const want = `linear-gradient(${ang}deg,${hex(start)} 0%,${hex(end)} 100%)`;
    if (page.indexOf(want) < 0)
      v.push({ kind: 'palette', msg: `מדרג מסך הבחירה — הצפוי «${want}»` });
    if (page.indexOf('color:' + hex(ink) + ';') < 0)
      v.push({ kind: 'palette', msg: `צבע הדיו — הצפוי «color:${hex(ink)};»` });
    if (page.indexOf('fill:' + hex(ink) + ';') < 0)
      v.push({ kind: 'palette', msg: `מילוי הסמל — הצפוי «fill:${hex(ink)};»` });
  }

  /* ו. מוטיב הפסים — ארבעת המלבנים כפי שהם ב-`APP.mark.shapes` */
  const shapes = [...appBlk.matchAll(
    /\{ kind: 'rect', x: (-?\d+),\s*y: (-?\d+),\s*w: (\d+), h: (\d+), r: (\d+), alpha: ([\d.]+) \}/g)]
    .map((m) => m.slice(1).map(Number));
  const rects = [...page.matchAll(
    /<rect x="(-?\d+)" y="(-?\d+)" width="(\d+)" height="(\d+)" rx="(\d+)" opacity="([\d.]+)"><\/rect>/g)]
    .map((m) => m.slice(1).map(Number));
  if (!shapes.length)
    v.push({ kind: 'mark', msg: 'לא נחלצו צורות מ-`APP.mark.shapes`' });
  else if (rects.length !== shapes.length)
    v.push({ kind: 'mark', msg: `נמדדו ${rects.length} מלבנים במסך והצפוי ${shapes.length}` });
  else
    for (let i = 0; i < shapes.length; i++)
      if (shapes[i].join(',') !== rects[i].join(','))
        v.push({ kind: 'mark', msg:
          `פס ${i + 1} — נמדד [${rects[i]}] והצפוי [${shapes[i]}]` });

  return v;
}

export { audit };
const SELF = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (SELF) {

console.log(`\n── סבב 81 — החלפת ישיבה ומסך הבחירה (${APP.name}) ─────────────────────`);
const base = audit(ROOT);
const of = (k) => base.filter((x) => x.kind === k).map((x) => x.msg).join(' · ');
let n = 1;
t(n++, !base.some((x) => x.kind === 'trigger' || x.kind === 'route'),
  `א. הלוגו הוא כפתור, ושתי הפעולות מנותבות בדלגציה ${of('trigger')}${of('route')}`);
t(n++, !base.some((x) => x.kind === 'modal'),
  `ב. הבורר נפתח ב-openModal — מיכל אחד ומסלול סגירה יחיד ${of('modal')}`);
t(n++, !base.some((x) => x.kind === 'order'),
  `ג. הסדר במעבר — איפוס ואז ההחלפה, ובלי אישור שני ${of('order')}`);
t(n++, !base.some((x) => x.kind === 'reset'),
  `ד. ${TENANT_STATE.length} שמות המצב הפר-מוסדי מאופסים ומוצהרים בקובץ ${of('reset')}`);
t(n++, !base.some((x) => x.kind === 'palette'),
  `ה. שלושת צבעי מסך הבחירה נגזרים מ-gen-icons ${of('palette')}`);
t(n++, !base.some((x) => x.kind === 'mark'),
  `ו. ארבעת פסי הסמל זהים ל-APP.mark.shapes ${of('mark')}`);

if (RUN_MUT) {
/* ── מוטציות — על עותק בתיקייה זמנית ───────────────────────────────────── */
const tmp = mkdtempSync(join(tmpdir(), 'r81ysv-'));
cpSync(ROOT, tmp, { recursive: true, filter: (s) => {
  const p = relative(ROOT, s).split(sep);
  return !p.includes('.git') && !p.includes('node_modules');
} });
t(n++, audit(tmp).length === 0, 'נגד: עותק נקי עובר את הביקורת');

const PAGE = join(tmp, 'index.html');
const orig = readFileSync(PAGE, 'utf8');
const mutate = (label, fn, kinds) => {
  writeFileSync(PAGE, fn(orig));
  const got = audit(tmp).map((x) => x.kind);
  const want = kinds.includes('__none__') ? got.length === 0 : kinds.every((k) => got.includes(k));
  t(n++, want, `${label} — נתפסה כ-[${got.join(',') || 'כלום'}]`);
  writeFileSync(PAGE, orig);
};

/*  ⛔ המוטציות שוברות את המנגנון ⛔ ולא את הצורה — ⚠️ שורת איפוס שנמחקת,
 *  סדר שמתהפך, וערך צבע שזז בגוון אחד. */
mutate('מ1 · מוטציה: שורת האיפוס של אות הפולינג נמחקת — טענה ד נופלת',
  (s) => s.replace('  _lastKnownTimestamp = 0;\n', ''), ['reset']);

mutate('מ2 · מוטציה: האיפוס אחרי ההחלפה במקום לפניה — טענה ג נופלת',
  (s) => s.replace('  ysResetTenantState();\n  selectYeshiva(y, true);',
                   '  selectYeshiva(y, true);\n  ysResetTenantState();'), ['order']);

/*  ⛔ החזרת האישור השני היא מוטציה על המנגנון — ⚠️ הכפתור ממשיך לעבוד,
 *  ⭐ ולכן רק שער תופס את הדיאלוג הכפול שחזר. */
mutate('מ2ב · מוטציה: אישור שני חוזר ל-ysConfirmSwitch — טענה ג נופלת',
  (s) => s.replace('  ysResetTenantState();\n  selectYeshiva(y, true);',
                   "  if (!ask('החלפת ישיבה', 'להחליף?')) return;\n" +
                   '  ysResetTenantState();\n  selectYeshiva(y, true);'), ['order']);

/*  ⭐ מוטציית-נגד: שורה שנוספה בלי `ask` ⛔ אינה מפילה — ⚠️ הנמדד הוא
 *  הדיאלוג הכפול, ⛔ ולא כל תוספת לגוף הפונקציה. */
mutate('נ2ב · ⭐ מוטציית-נגד: שורה שנוספה בלי אישור ⛔ אינה מפילה',
  (s) => s.replace('  ysResetTenantState();\n  selectYeshiva(y, true);',
                   "  console.log('switch');\n" +
                   '  ysResetTenantState();\n  selectYeshiva(y, true);'), ['__none__']);

mutate('מ3 · מוטציה: הבורר עוקף את openModal — טענה ב נופלת',
  (s) => s.replace("  openModal('החלפת ישיבה', body, '');",
                   "  document.getElementById('modal-body').innerHTML = body;"), ['modal']);

mutate('מ4 · מוטציה: צבע המדרג זז בגוון אחד — טענה ה נופלת',
  (s) => s.replace('linear-gradient(141deg,#2A4E8C 0%', 'linear-gradient(141deg,#2A4E8D 0%'),
  ['palette']);

mutate('מ5 · מוטציה: רוחב פס אחד בסמל משתנה — טענה ו נופלת',
  (s) => s.replace('<rect x="28" y="144" width="240"', '<rect x="28" y="144" width="238"'),
  ['mark']);

mutate('מ6 · מוטציה: הלוגו מפסיק לנתב את הבורר — טענה א נופלת',
  (s) => s.replace('<button class="hdr-logo-btn" data-act="open-yeshiva-picker"',
                   '<button class="hdr-logo-btn" data-act="noop-yeshiva-picker"'), ['trigger']);

/*  ⭐ מוטציות-נגד — ⛔ שינויים חיים שאסור להם להפיל: ⚠️ שורת איפוס
 *  שנוספת, וניסוח הודעה שמשתנה. */
mutate('נ1 · ⭐ מוטציית-נגד: שורת איפוס **נוספת** ⛔ אינה מפילה את טענה ד',
  (s) => s.replace('  _tombPrunePending = false;\n',
                   '  _tombPrunePending = false;\n  _plBusy = false;\n'), ['__none__']);

/*  ⭐ מוטציית-נגד חיה: ניסוח ההודעה שאחרי ההחלפה — ⛔ מחרוזת שקיימת בקובץ,
 *  ⚠️ ולא כזו שנעלמה ממנו: ⛔ מוטציה שהחלפתה אינה מחליפה דבר אינה רצה. */
mutate('נ2 · ⭐ מוטציית-נגד: ניסוח ההודעה שאחרי ההחלפה ⛔ אינו מפיל את טענה ג',
  (s) => s.replace("toast('הוחלף ל' + ysNameOf(y));",
                   "toast('המוסד הוחלף ל' + ysNameOf(y));"), ['__none__']);

rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${fail ? '❌' : '✅'} סבב 81 (החלפת ישיבה ומסך הבחירה) — ${pass} טענות עברו, ${fail} נכשלו`);
process.exit(fail ? 1 : 0);
}
