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

מקור האמת המלא לסכימה: `migrations/000_initial_schema.sql`.

---

## מצב נוכחי
- יומן, ארכיון עברי, עריכה inline ✅
- ייצוא PDF ושיתוף הדוח כתמונה (גשר מקורי מוגבל ל-origin) ✅
- Supabase sync בפולינג של 3 שניות, מיזוג ברמת רשומה עם הגנת ⏳ ✅
- גיבוי יומי ל-`kv_backup` + יומן פעולות ל-`sync_log` ✅
- חלון חם ופינוי יזום מאומת מול הענן ✅
- PWA מותקן — שני מזהי גרסה, ⛔ והערכים עצמם ב-`sw.js` וב-`index.html` בלבד

---

⛔ **הקובץ הזה מחזיק לקוח וצורך בלבד** (כלל ברזל 23) — כללי הפיתוח,
הסכימה ופרטי המערכת יושבים ב-[README.md](README.md)
וב-[android/README.md](android/README.md). ⛔ תיאור שחוזר משם נסחף בשקט.
