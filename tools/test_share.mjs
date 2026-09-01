#!/usr/bin/env node
/*  test_share.mjs — שער מסלול השיתוף.
 *
 *  **מה נאכף:** שני האיסורים שכלל גשר השיתוף מצהיר — ⛔ הפעלה ישירה של
 *  יעד שנושא שם חבילה, ⛔ ודגל המשימה החדשה מהקשר Activity חי; ⛔ ולצידם
 *  שכל מוסד מקבל נקודת שיתוף משלו.
 *
 *  **הנימוק המדוד:** הכלל נכתב והורחב בשני סבבים, ⛔ ובכל זאת **שני**
 *  האיסורים היו בקוד — ⚠️ סבב אחד קיבל הוראה חלקית, השני תיקן מסלול אחד,
 *  ⛔ ומסלול השיתוף נשאר עם שניהם.
 *
 *  **מה יישבר בלעדיו:** ⛔ כלל מתועד בלי שער הוא הצהרה ולא אכיפה —
 *  ⚠️ הסתירה שרדה שני סבבים בלי שאף שער נפל עליה.
 *
 *  **מה אינו נאכף כאן:** ⛔ מה שקורה במכשיר בפועל — ⚠️ השער קורא את קוד
 *  ה-Java, ⭐ ובחירת היעד היא של מערכת ההפעלה.
 *
 *  ⚠️ פרטי ליומן, ⛔ וזו חריגה מדודה ולא סחיפה — גשר השיתוף קיים בה בלבד,
 *  ⚠️ ונמדד אפס קוד שיתוף בשלוש האחרות. ⭐ הכלל עצמו כן משותף בארבעתן.
 *  ⛔ המוטציות רצות על מחרוזת בזיכרון ⛔ ואינן נכתבות לעץ.
 */

import fs from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ── APP — הדבר היחיד שנבדל בין הריפו ──────────────────────────────────── */
const APP = {
  app: 'yoman-avoda',
  /*  ⚠️ המעטפת הפר-אפליקציתית — ⛔ ולא הליבה: `ShellActivity` זהה
      בית-לבית בארבעתן ואין בה שיתוף, והיא נחתמת ב-`coreSha`. */
  shell: 'android/app/src/main/java/com/yoman/avoda/MainActivity.java',
  /*  ⭐ ליומן יש גשר (שורת גשר השיתוף במטריצה). ⛔ אפליקציה בלי גשר אוכפת את
      ההיפך — שאין בה מסלול שיתוף כלל. */
  shareBridge: true,
};
/* ── סוף APP ───────────────────────────────────────────────────────────── */

/*  ⛔ הקובץ הזה אינו אוכף שורה בטבלת התשתית (סבב 72) — ⚠️ הצהרה ריקה
 *  ולא היעדר: ⛔ שער בלי הצהרה אינו נבדל משער שההצהרה שלו נשמטה. */
/*  ⛔ הרשימה ריקה בכוונה (סבב 72) — ⚠️ שורת גשר השיתוף נאכפת ב-MATRIX
 *  שב-`check-capabilities`, ⭐ והטענות כאן מוסיפות לה את החיווט פר-מוסד:
 *  ⛔ הצהרת ROWS כאן הייתה כפילות שהשער החוצה מפיל עליה. */
export const ROWS = [];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
const fail = (m) => { failures++; console.error('❌ ' + m); };
const pass = (m) => console.log('✅ ' + m);

const path = join(ROOT, APP.shell);
if (!fs.existsSync(path)) { fail(`${APP.shell} אינו קיים`); process.exit(1); }
const SRC = fs.readFileSync(path, 'utf8');

/*  ⚠️ טוקניזציה ולא ביטוי רגולרי (הלקח של סבב 40) — הערה שמזכירה
 *  `setPackage` כדי לאסור אותו אינה הפרה, ומחרוזת שמכילה `//` אינה
 *  פותחת הערה. ההליכה תו-תו, עם מצב מחרוזת ותו-בודד.                 */
function stripCode(text) {
  let out = '', i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i], d = text[i + 1];
    if (c === '/' && d === '/') { while (i < n && text[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && d === '*') { i += 2; while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i++; i += 2; continue; }
    if (c === '"') { i++; while (i < n && text[i] !== '"') { if (text[i] === '\\') i++; i++; } i++; out += '"§"'; continue; }
    if (c === "'") { i++; while (i < n && text[i] !== "'") { if (text[i] === '\\') i++; i++; } i++; out += "'§'"; continue; }
    out += c; i++;
  }
  return out;
}

/*  ⭐ מחלץ את הארגומנט של כל `startActivity(...)` — איזון סוגריים ולא
 *  regex, כדי ש-`startActivity(Intent.createChooser(a, b))` ייקרא כארגומנט
 *  אחד ולא ייחתך בפסיק הפנימי.                                        */
function startActivityArgs(code) {
  const args = [];
  const re = /\bstartActivity\s*\(/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    let depth = 1, i = re.lastIndex;
    while (i < code.length && depth > 0) {
      if (code[i] === '(') depth++;
      else if (code[i] === ')') depth--;
      if (depth > 0) i++;
    }
    args.push(code.slice(re.lastIndex, i).trim());
  }
  return args;
}

/*  ────────────── הבדיקה עצמה — מוחזרת כרשימת כשלים, כדי שהמוטציות יריצו אותה
 *  על מחרוזת בזיכרון בלי לגעת בעץ.                                    */
function check(src) {
  const bad = [];
  const code = stripCode(src);

  /*  א. ⛔ אין `setPackage` — נעילה על אפליקציה אחת מסירה מהמשתמש את
      הבחירה שהמערכת נותנת בחינם (`share-bridge-rule`). */
  if (/\.setPackage\s*\(/.test(code)) bad.push('setPackage בקוד');

  /*  ב. ⛔ אין `FLAG_ACTIVITY_NEW_TASK` — ⛔ גם לא בבורר השיתוף. מהקשר
      Activity חי הוא מוציא את היעד לערמת משימות נפרדת. */
  if (/FLAG_ACTIVITY_NEW_TASK/.test(code)) bad.push('FLAG_ACTIVITY_NEW_TASK בקוד');

  /*  ג. ⭐ הטענה המרכזית — כל `startActivity` עובר בבורר. הארגומנט הוא
      `Intent.createChooser(...)` ישירות, או משתנה שהוצב ממנו. */
  const chooserVars = new Set();
  const asg = /(?:Intent\s+)?(\w+)\s*=\s*Intent\s*\.\s*createChooser\s*\(/g;
  let a;
  while ((a = asg.exec(code)) !== null) chooserVars.add(a[1]);

  const args = startActivityArgs(code);
  if (APP.shareBridge && args.length === 0) bad.push('אין אף startActivity — מסלול השיתוף נעלם');
  for (const arg of args) {
    const direct = /^Intent\s*\.\s*createChooser\s*\(/.test(arg);
    if (!direct && !chooserVars.has(arg)) bad.push(`startActivity ישיר בלי createChooser: ${arg}`);
  }

  /*  ד. ⚠️ ההרשאה נוסעת עם ה-intent ולא עם הדגל (`share-bridge-rule`) —
      בלי זה היעד מקבל content:// שאין לו גישה אליו. */
  if (APP.shareBridge && !/FLAG_GRANT_READ_URI_PERMISSION/.test(code)) {
    bad.push('אין FLAG_GRANT_READ_URI_PERMISSION על ה-ACTION_SEND');
  }
  return bad;
}

/* ── הרצה על הקוד האמיתי ───────────────────────────────────────────────── */
const real = check(SRC);
if (real.length === 0) {
  pass('מסלול השיתוף: createChooser בלבד, בלי setPackage ובלי FLAG_ACTIVITY_NEW_TASK');
} else {
  for (const b of real) fail(`⛔ ${b} — הבורר של המערכת הוא שבוחר, ונעילה על יעד אחד מסירה מהמשתמש את הבחירה`);
}

/*  ⭐ והכלל נאכף על **הקובץ**, לא רק על המסלול המוכר: `ACTION_SEND` שייבנה
 *  מחר בפונקציה אחרת ייתפס באותן טענות, מפני שהן סורקות את כל הקובץ. */

/* ── ד. נקודת שיתוף לכל מוסד — ⛔ בצד ה-web ─────────────────────────────── */
/*  ⛔ הגשר לבדו אינו יכולת (סבב 72) — ⚠️ הוא היה קיים ותקין בזמן שכפתור
 *  השיתוף הוצג למוסד אחד בלבד: ⭐ כפתור ראשון לציון ירד יחד עם יכולת
 *  הוואטסאפ שהפעילה אותו, ⛔ וה-probe שבדק «קיים `navigator.share`» אישר
 *  את המצב. ⭐ מה שנמדד כאן הוא **החיווט**: המילוי של `outputBtnSlot`
 *  אינו תלוי במוסד, ⛔ והוא קורא לפונקציית השיתוף. */
const HTML = fs.readFileSync(join(ROOT, 'index.html'), 'utf8');
export function slotWiring(src) {
  const bad = [];
  const i = src.indexOf('slot.innerHTML');
  if (i < 0) return ['אין מילוי ל-outputBtnSlot'];
  /*  ⚠️ הפסוקית מסתיימת ב-`;` **בסוף שורה** (סבב 72) — ⛔ ולא בנקודה-פסיק
      הראשונה: מאפיין `style` שבתוך המחרוזת מחזיק אחת, ⭐ וחיתוך לפיה
      היה עוצר לפני שם הפונקציה — והטענה נופלת על תקין. */
  const m = /;\s*\n/.exec(src.slice(i));
  const st = src.slice(i, i + (m ? m.index + 1 : 400));
  if (!/shareReport\s*\(\s*\)/.test(st)) bad.push('המילוי אינו קורא ל-shareReport');
  if (/ramataviv|rishon/.test(st)) bad.push('המילוי תלוי במוסד — מוסד אחד נשאר בלי כפתור');
  return bad;
}
{
  const bad = slotWiring(HTML);
  if (!bad.length) pass('נקודת שיתוף: `outputBtnSlot` מחווט לשני המוסדות באותו כפתור');
  else for (const b of bad) fail(`⛔ ${b} — נמדדה נקודת שיתוף חסרה והצפוי אחת לכל מוסד`);
}
/*  ⛔ מוטציה: החזרת התלות במוסד ⇒ מפילה. ⭐ ומוטציית-נגד: שינוי הטקסט
 *  שעל הכפתור ⛔ אינו מפיל — ⚠️ הטענה מודדת חיווט, ולא ניסוח. */
{
  const back = HTML.replace('slot.innerHTML =', "slot.innerHTML = (y === 'ramataviv') ? '' :");
  if (back !== HTML && slotWiring(back).length > 0) pass('⛔ מוטציה: תלות במוסד במילוי הכפתור — נתפסה');
  else fail('⛔ מוטציה: תלות במוסד לא נתפסה — נמדדו 0 ממצאים והצפוי אחד');
  const label = HTML.replace('📤 שיתוף הדוח', '📤 שיתוף');
  if (label !== HTML && slotWiring(label).length === 0) pass('⭐ מוטציית-נגד: שינוי תווית הכפתור ⛔ אינו מפיל');
  else fail('⭐ מוטציית-נגד נכשלה — נמדד שהטענה רגישה לניסוח והצפוי שתמדוד חיווט');
}


/* ── מוטציות — ⛔ בזיכרון בלבד ──────────────────────────────────────────── */
const MUTATIONS = [
  { name: 'החזרת setPackage למסלול השיתוף',
    apply: (s) => s.replace('Intent toStart = Intent.createChooser(send,',
                            'send.setPackage("com.example.target");\n                    Intent toStart = Intent.createChooser(send,') },
  { name: 'startActivity ישיר על ה-intent במקום על הבורר',
    apply: (s) => s.replace(/Intent toStart = Intent\.createChooser\(send,[^;]*;/, 'Intent toStart = send;') },
  { name: 'החזרת FLAG_ACTIVITY_NEW_TASK לבורר השיתוף',
    apply: (s) => s.replace('                    try {\n                        startActivity(toStart);',
                            '                    toStart.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);\n                    try {\n                        startActivity(toStart);') },
  { name: 'הסרת FLAG_GRANT_READ_URI_PERMISSION',
    apply: (s) => s.replace('send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);', '') },
];

for (const m of MUTATIONS) {
  const mutated = m.apply(SRC);
  if (mutated === SRC) { fail(`מוטציה «${m.name}» לא שינתה דבר — העוגן נרקב, דורש בדיקה ידנית`); continue; }
  if (check(mutated).length > 0) pass(`מוטציה «${m.name}» — נתפסה`);
  else fail(`⛔ מוטציה «${m.name}» עברה את הבדיקה — השער אינו אוכף את הכלל`);
}

/*  ⭐ מוטציית-נגד — שינוי הערה ומחרוזת בלבד ⛔ אינו מפיל. בלעדיה השער
 *  היה יכול להיות רגיש לניסוח במקום לזרימה, ו«פער נסגר» היה נקרא על
 *  עריכת טקסט (הלקח של כלל ברזל 15).                                   */
const counter = SRC
  .replace('שיתוף הדו\\"ח', 'שליחת הדו\\"ח')
  .replace('// ר\' share-bridge-rule ב-CLAUDE.md', '// ר\' הכלל המשותף');
if (counter === SRC) {
  fail('מוטציית-הנגד לא שינתה דבר — העוגן נרקב, דורש בדיקה ידנית');
} else if (check(counter).length === 0) {
  pass('מוטציית-נגד: שינוי הערה ומחרוזת ⛔ אינו מפיל — השער מודד זרימה');
} else {
  fail('⛔ מוטציית-הנגד הפילה — השער רגיש לניסוח ולא לזרימה');
}

console.log(failures === 0
  ? `\n✅ test_share: כל הטענות עברו (${MUTATIONS.length} מוטציות + מוטציית-נגד)`
  : `\n❌ test_share: ${failures} כשלים`);
process.exit(failures === 0 ? 0 : 1);
