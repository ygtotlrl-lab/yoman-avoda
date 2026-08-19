# יומן עבודה — קונטקסט פיתוח

## פרטי ריפו
- **ריפו:** `ygtotlrl-lab/yoman-avoda`
- **GitHub Pages:** `https://ygtotlrl-lab.github.io/yoman-avoda/`
- **טוקן:** מנוהל ב-Windows Credential Manager (host `github.com`) — לעולם לא בקובץ
- **קובץ ראשי:** `index.html`
- **Supabase:** project `kxbtskqobynewvnckaaz` (⚠️ **משותף** עם hanhala-ruchanit
  ועם schar-limud) | טבלאות `kv_rishon` / `kv_ramataviv` / `tb_entries` (ראה למטה)

---

## ⚠️ Supabase — GRANT חובה לטבלאות חדשות

כל טבלה חדשה שנוצרת ב-`public` schema חייבת לכלול GRANT מפורש — אחרת supabase-js
לא יוכל לגשת אליה. **⛔ והסדר הוא `revoke` ואז `grant`, ולא `grant` לבדו:**

```sql
revoke all on public.TABLE_NAME from anon, authenticated;
grant select, insert, update on public.TABLE_NAME to anon, authenticated;
grant all on public.TABLE_NAME to service_role;
alter table public.TABLE_NAME enable row level security;
```

⚠️ **הסיבה:** `GRANT` הוא **אדיטיבי בלבד ואינו מסיר דבר**, ופרויקט Supabase
סטנדרטי מגיע עם `alter default privileges … grant all on tables` — כלומר
**כל טבלה נולדת עם `DELETE` ו-`TRUNCATE`**. מחיקה בארגון היא תמיד `deleted=true`
או tombstone (כלל ברזל 6 סעיף 1), ולכן ההרשאות האלה מיותרות בהגדרה ומסוכנות
בפועל: מפתח ה-anon יושב גלוי ב-`index.html` הציבורי. ר' כלל ברזל 10 סעיף 9
ו-`migrations/001_revoke_delete_anon.sql`.

מקור האמת המלא לסכימה: `migrations/000_initial_schema.sql` (כלל קריטי 5).

---

## כללים קריטיים לפיתוח

1. **`node tools/check-js.mjs` לפני כל push** — חובה מוחלטת. הוא מחלץ את ה-JS
   המוטבע מ-`index.html`, מריץ `node --check` עליו ועל `sw.js`, ומריץ את כל
   שערי האחידות ואת חבילות בדיקות הסבבים.
2. **קידום `CACHE_NAME` ב-`sw.js` וגם `<meta name="app-version">`** בכל שינוי
   קוד — בלי שניהם העדכון לא מגיע למשתמשים ובאנר העדכון לא מופיע.
3. **מקור אמת יחיד = `index.html`** — ⛔ אין קובץ HTML כפול של האפליקציה, ואין
   נכסים מוטבעים במעטפת ה-APK (עותק `file://` הוא origin אחסון נפרד).
4. **מחיקה = tombstone** — `deleted:true` + `updatedAt`; היעדר רשומה אצל מכשיר
   **אינו** מחיקה (כלל ברזל 6 סעיף 1).
5. **`esc()`** על כל ערך משתמש שנכנס ל-`innerHTML`; ⛔ מזהה שנכנס למאפיין
   `onclick` עובר `idArg()` (ציטוט ורשימת-היתר של תווים, סבב 38).

```bash
node tools/check-js.mjs      # השער — חובה לפני כל push
```

---

## טבלאות

| טבלה | תפקיד | הערות |
|---|---|---|
| `kv_rishon` | ערכי `kv` של ראשון לציון | ⛔ הכתיבה הכפולה אליהם כובתה בסבב 35; נתיב חזרה בלבד |
| `kv_ramataviv` | ערכי `kv` של רמת אביב | אותו דבר; ההפרדה בין המוסדות היא **טבלה בענן וסיומת מפתח במכשיר** |
| `tb_entries` | היומן החי **והארכיון** | טבלה מאוחדת (סבב 32) — דגל `archived boolean` + עמודת `yeshiva` |
| `tb_archive` | הארכיון הישן | ⛔ שריד; נתיב חזרה בלבד, אינו נכתב מסבב 35 |
| `sync_log`, `kv_backup` | יומן וגיבוי | `INSERT`+`SELECT` בלבד — יומני ראיות (כלל ברזל 10 סעיף 9) |

⚠️ **פרויקט Supabase משותף:** `kv_backup`, `sync_log` ומשימת ה-`pg_cron` לפינוי
הגיבויים חיים בפרויקט **אחד** עם hanhala-ruchanit ועם schar-limud. לכן מיגרציית
הפינוי היא `hanhala-ruchanit/migrations/004` — **קובץ אחד לפרויקט אחד**, ולא
עותק בכל ריפו.

---

## מצב נוכחי
- יומן חי, ארכיון ועריכה inline ✅ · לוח עברי עם שנה מעוברת ✅
- ייצוא PDF ושיתוף וואטסאפ כתמונה ✅ (גשר מקורי מוגבל-origin במעטפת)
- עבודה אופליין מלאה: מיזוג ברמת רשומה, tombstones, סימון ⏳ ✅
- הייצוג בענן: `tb_entries` המאוחדת; הכתיבה הכפולה ל-`kv` כובתה ✅ (סבב 35)
- גיבוי יומי מטבלאות מובנות ויומן פעולות ✅ · חלון חם ושחזור מקומי ✅
- PWA + באנר עדכון + אוטו-אפדייט מבוסס `raw.githubusercontent` ✅
- מעטפת APK מסוג WebView ב-`android/` שטוענת מהרשת ✅

**מצב המיגרציות:** `000`–`005` — ר' הטבלה המלאה ב-CLAUDE.md.

## פרטי מערכת
- ⛔ **לעולם לא TWA ולא PWABuilder** — TWA מריץ את האתר בתוך כרום, וסינון התוכן
  במכשירי המשתמשים חוסם את כרום. זה נמדד: ה-TWA של gius פשוט לא נפתח.
- ⛔ **המפתח הישן שישב ב-`/tmp` אבד.** המפתח הקבוע היחיד הוא
  `signing/yoman.keystore` שבריפו; ⛔ לעולם לא ליצור keystore חדש.
- סנכרון: פולינג כל 3 שניות, משיכה ← מיזוג ← דחיפת מה שמקומי-וחדש-יותר.
  ⛔ אין תור פעולות (כלל ברזל 6).
- שני מוסדות חולקים localStorage אחד — כל מפתח נושא סיומת (`_rishon` /
  `_ramataviv`), ו⛔ סימון או עֵד סנכרון של מוסד אחד אינו תקף לשני.

הכללים המחייבים והתיעוד המלא — ב-[CLAUDE.md](CLAUDE.md).
