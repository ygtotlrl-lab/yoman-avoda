#!/usr/bin/env node
/*  שער מסלול השיתוף — סבב 59, אכיפת `share-bridge-rule`.
 *
 *  ⚠️ **הפער שנמדד (סבב 59):** בלוק `share-bridge-rule` נכתב בסבב 57
 *  והורחב בסבב 58, והוא אוסר שני דברים במפורש — ⛔ `startActivity` ישיר
 *  על intent שנושא `setPackage`, ו⛔ `FLAG_ACTIVITY_NEW_TASK` מהקשר
 *  Activity חי, «⛔ לא בבורר השיתוף». ⚠️ **ובכל זאת שניהם היו בקוד:**
 *  סבב 57 קיבל הוראה «הדגל בלבד», סבב 58 סעיף 1 הסיר את הדגל
 *  מ-`ShellActivity` (מסירת יעד חיצוני) — ⛔ ומסלול השיתוף שב-`MainActivity`
 *  נשאר עם `setPackage` + `startActivity` ישיר **וגם** עם הדגל.
 *
 *  ⛔ **כלל מתועד בלי שער הוא הצהרה ולא אכיפה** — בדיוק הכשל שכלל ברזל 8
 *  סעיף 6 מתאר, בציר אחר: כאן הבדיקה לא «לא נשמרה», היא **מעולם לא
 *  נכתבה**, והסתירה שרדה שני סבבים בלי שאף שער נפל עליה.
 *
 *  ⚠️ **פרטי ליומן, וזו חריגה מדודה ולא סחיפה** — גשר השיתוף קיים ביומן
 *  בלבד (מטריצה, שורות 8 ו-44), ⛔ ואין `ACTION_SEND` באף אחת מהשלוש
 *  האחרות (נמדד בסבב 59: אפס `setPackage`, אפס `shareImage` ואפס
 *  `AndroidShare` בקוד שלהן — תיעוד בלבד). ⚠️ הכלל עצמו כן משותף
 *  בארבעתן, וזה בדיוק מה ש-`share-bridge-rule` אומר.
 *
 *  ⛔ המוטציות אינן נכתבות לעץ (הלקח של סבב 42ג) — הן רצות על מחרוזת
 *  בזיכרון בלבד.
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
  /*  ⭐ ליומן יש גשר (מטריצה שורה 44). ⛔ אפליקציה בלי גשר אוכפת את
      ההיפך — שאין בה מסלול שיתוף כלל. */
  shareBridge: true,
};
/* ── סוף APP ───────────────────────────────────────────────────────────── */

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

/*  ── הבדיקה עצמה — מוחזרת כרשימת כשלים, כדי שהמוטציות יריצו אותה
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
  pass('מסלול השיתוף תואם ל-share-bridge-rule: createChooser בלבד, בלי setPackage ובלי FLAG_ACTIVITY_NEW_TASK');
} else {
  for (const b of real) fail(`⛔ ${b} — ר' share-bridge-rule ב-CLAUDE.md`);
}

/*  ⭐ והכלל נאכף על **הקובץ**, לא רק על המסלול המוכר: `ACTION_SEND` שייבנה
 *  מחר בפונקציה אחרת ייתפס באותן טענות, מפני שהן סורקות את כל הקובץ. */

/* ── מוטציות — ⛔ בזיכרון בלבד ──────────────────────────────────────────── */
const MUTATIONS = [
  { name: 'החזרת setPackage למסלול השיתוף',
    apply: (s) => s.replace('Intent toStart = Intent.createChooser(send,',
                            'send.setPackage(appPackage);\n                    Intent toStart = Intent.createChooser(send,') },
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
  ? `\n✅ test_round59_share: כל הטענות עברו (${MUTATIONS.length} מוטציות + מוטציית-נגד)`
  : `\n❌ test_round59_share: ${failures} כשלים`);
process.exit(failures === 0 ? 0 : 1);
