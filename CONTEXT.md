# יומן עבודה — קונטקסט פיתוח

## פרטי ריפו
- **ריפו:** `ygtotlrl-lab/yoman-avoda`
- **GitHub Pages:** `https://ygtotlrl-lab.github.io/yoman-avoda/`
- **טוקן:** מנוהל ב-Windows Credential Manager (host `github.com`) — לעולם לא בקובץ
- **קובץ ראשי:** `index.html`
- **Supabase:** project `kxbtskqobynewvnckaaz` | טבלאות `kv_rishon` / `kv_ramataviv`
  ו-`tb_entries` (ראה למטה)

---

<!-- SHARED:start id="context-grant" -->
## ⚠️ Supabase — GRANT חובה לטבלאות חדשות

כל טבלה חדשה שנוצרת ב-`public` schema חייבת לכלול GRANT מפורש — אחרת supabase-js
לא יוכל לגשת אליה. **⛔ וכאן הסדר הוא `revoke` ואז `grant`, ולא `grant` לבדו:**

```sql
revoke all on public.TABLE_NAME from anon, authenticated;
grant select, insert, update on public.TABLE_NAME to anon, authenticated;
grant all on public.TABLE_NAME to service_role;
alter table public.TABLE_NAME enable row level security;
```
<!-- SHARED:end -->

⚠️ **הסיבה:** `GRANT` הוא **אדיטיבי בלבד ואינו מסיר דבר**, ופרויקט Supabase
סטנדרטי מגיע עם `alter default privileges … grant all on tables` — כלומר
**כל טבלה נולדת עם `DELETE` ו-`TRUNCATE`**. מחיקה בארגון היא תמיד `deleted=true`
(כלל ברזל 6 סעיף 1), ולכן ההרשאות האלה מיותרות בהגדרה ומסוכנות בפועל: מפתח
ה-anon יושב גלוי ב-`index.html` הציבורי. ר' `migrations/001`.

מקור האמת המלא לסכימה: `migrations/000_initial_schema.sql` (כלל קריטי 5 ב-CLAUDE.md).

---

## כללים קריטיים לפיתוח

1. **`node tools/check-js.mjs` לפני כל push** — חובה מוחלטת. השער מחלץ את ה-JS
   המוטבע מ-`index.html`, מריץ `node --check` עליו ועל `sw.js`, ומריץ את כל
   שערי האחידות ואת חבילות בדיקות הסבבים.
2. **שני מזהי גרסה, ושניהם חובה בכל שינוי קוד** — `CACHE_NAME` ב-`sw.js`
   **וגם** `<meta name="app-version">` ב-`index.html`. קידום חלקי משאיר חצי
   מהמכשירים בלי העדכון, בלי סימן.
3. **מקור אמת יחיד = `index.html`** — ⛔ אין ליצור קובץ HTML כפול של האפליקציה,
   ואין להחזיר עותק מוטבע ל-`android/app/src/main/assets/` (origin אחסון נפרד).
4. **כתיבה ל-localStorage אך ורק דרך `lsSet`/`lsSetArray`** (כלל ברזל 1).
5. **`esc()`** על כל ערך משתמש שנכנס ל-`innerHTML`.

---

## טבלאות

| טבלה | תפקיד | הערות |
|---|---|---|
| `kv_rishon` / `kv_ramataviv` | ערכי `kv` פר-מוסד | ⛔ ההפרדה בין המוסדות היא **טבלה בענן וסיומת מפתח במכשיר** — אין טבלה לכל מוסד ברמת הנתונים המובנים |
| `tb_entries` | היומן החי **והארכיון**, שורה לרשומה | טבלה מאוחדת (סבב 32) עם דגל `archived` ועמודת `yeshiva`; «העברה לארכיון» היא דגל, לא העברה בין טבלאות |
| `sync_log` | יומן פעולות | `INSERT`+`SELECT` בלבד לשני התפקידים — יומן ראיות |
| `kv_backup` | גיבוי יומי | `INSERT`+`SELECT` בלבד; פינוי יומי ב-`pg_cron` |

⛔ **אין כאן טבלת משתמשים, אין מסך כניסה ואין תפקידים** — הכניסה היא בחירת מוסד.
⚠️ הכתיבה הכפולה למפתחות ה-`kv` של היומן ולטבלה `tb_archive` **כובתה בסבב 35**;
המפתחות עצמם נשארו כנתיב חזרה.

---

## מצב נוכחי
- יומן, ארכיון עברי, עריכה inline ✅
- ייצוא PDF ושיתוף הדוח כתמונה (גשר מקורי מוגבל ל-origin) ✅
- Supabase sync בפולינג של 3 שניות, מיזוג ברמת רשומה עם הגנת ⏳ ✅
- גיבוי יומי ל-`kv_backup` + יומן פעולות ל-`sync_log` ✅
- חלון חם ופינוי יזום מאומת מול הענן ✅
- PWA מותקן — שני מזהי גרסה, ⛔ והערכים עצמם ב-`sw.js` וב-`index.html` בלבד

## פרטי מערכת
- מעטפת APK: **WebView מקורי** ב-`android/` שטוען מהרשת — ⛔ לא TWA ולא PWABuilder
- חתימה: `signing/yoman.keystore` (alias `yoman`) — ⛔ המפתח הקבוע, לעולם לא להחליף
- סנכרון: `autoSyncData`/`syncFromCloud` בפולינג של 3 שניות, מיזוג ולא החלפה
- שני מוסדות חולקים localStorage אחד — כל מפתח נושא סיומת מוסד (`_rishon` / `_ramataviv`)

---

<!-- SHARED:start id="context-smali-scope" -->
## תיקון URL ב-APK קיים ובנוי (בלי מקור) — smali בלבד

⚠️ **הפרק הזה רלוונטי רק ל-APK ישן שנבנה לפני `android/`.** בנייה רגילה היום
היא מ-`android/` דרך `.github/workflows/build-apk.yml`, והמעטפת טוענת מהרשת —
ולכן אין בה URL שצריך לתקן.
⛔ **smali בלבד — לא binary patch.** עריכה בינארית של ה-APK שוברת את החתימה
ואינה ניתנת לאימות, ⛔ והחתימה מחדש היא במפתח הקבוע של הריפו בלבד — ר' הפרק
«חתימת APK» ב-CLAUDE.md.
<!-- SHARED:end -->

```bash
apktool d <app>.apk -o /tmp/yw_work -f
# תקן את ה-URL ב-MainActivity.smali ו-MainActivity$2.smali
rm -rf /tmp/yw_work/build          # חובה לפני בנייה חוזרת
apktool b /tmp/yw_work -o built.apk
zipalign -f 4 built.apk aligned.apk
apksigner sign --ks signing/yoman.keystore --ks-key-alias yoman \
  --ks-pass pass:yoman123 --key-pass pass:yoman123 --out output.apk aligned.apk
```

⚠️ **המפתח הישן שישב ב-`/tmp/yoman.keystore` אבד**; המפתח הקבוע הוא
`signing/yoman.keystore` שבריפו.

<!-- SHARED:start id="context-cache-apk" -->
### ⚠️ Cache APK — כלל זהב

שם קובץ חוזר נתפס במטמון — של הדפדפן, של מנהל ההורדות ושל המכשיר — והמשתמש
מתקין שוב את הבנייה **הקודמת** בלי לדעת. ⛔ **תמיד שם חדש בכל בנייה**, עם
חותמת זמן:
<!-- SHARED:end -->

```bash
TS=$(date +%s) && apksigner sign ... --out yoman-avoda-${TS}.apk
```

הכללים המחייבים והתיעוד המלא — ב-[CLAUDE.md](CLAUDE.md).
