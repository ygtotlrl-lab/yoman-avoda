-- ============================================================================
-- יומן עבודה — קובץ ההתקנה המלא (סבב 28)
-- פרויקט Supabase: kxbtskqobynewvnckaaz
-- הרצה: Supabase SQL Editor →
--   https://supabase.com/dashboard/project/kxbtskqobynewvnckaaz/sql
-- ============================================================================
--
-- ⭐ זהו **מקור האמת היחיד לסכימה** של האפליקציה הזו (סבב 28). הרצתו על מסד
--    ריק נותנת התקנה עובדת; הרצה חוזרת על מסד קיים מתכנסת אליו בלי לגעת
--    בנתונים.
--
-- ⚠️ `supabase-multitenant.sql` **נמחק בסבב 33.** הוא היה קובץ **הגירה
--    חד-פעמי** מ-`public.kv` הישנה — הוא הסתיים ב-`insert … select … from
--    public.kv`, ולכן הרצה חוזרת שלו על פרויקט נקי נכשלה שם ממילא. הסכימה
--    שהוא יצר (`kv_rishon` / `kv_ramataviv` עם RLS, פוליסות והרשאות) מכוסה
--    כאן במלואה, ולכן הוא לא היה יכול לשמש עוד לשום דבר מלבד להיקרא בטעות
--    כהוראת הפעלה. ⛔ אין לשחזר אותו: ההגירה בוצעה, ו-`public.kv` אינה
--    מקור נתונים של האפליקציה הזו.
--
-- ⚠️ אידמפוטנטיות אמיתית (כלל ברזל 10 סעיף 7, נלמד בסבב 27):
--    `create table if not exists` **מדלג על טבלה קיימת ועל כל מה שבתוכה** —
--    עמודה, אינדקס, פוליסה או הרשאה. לכן כל אובייקט כאן מקבל **גם** שורת
--    התכנסות: `drop policy if exists` + `create policy`, ו-`grant` מפורש.
--    ⛔ ואין לגעת בנתונים — מבנה בלבד. אין בקובץ הזה אף `insert`, `update`
--    או `delete`.
--
-- ⛔ אין כאן משתמש, סיסמה או טוקן — גם לא «לדוגמה» (כלל ברזל 10 סעיף 8).
--    ⚠️ ליומן עבודה **אין בכלל טבלת משתמשים ואין מסך כניסה**: הכניסה היא
--    בחירת מוסד, ולכן אין מה לזרוע ואין מה לאמת. ⛔ ואין להוסיף כאן טבלת
--    משתמשים או שער סיסמה «ליישור מול האחיות» — זו הייתה שכבת הרשאה שלמה
--    יש מאין (כלל ברזל 10 סעיף 2).
--
-- ⚠️ מקור הנתונים של הקובץ: **מיפוי מלא מול המסד החי בסבב 28** —
--    `information_schema.columns`, `pg_indexes`, `pg_constraint`, `pg_policies`,
--    `information_schema.role_table_grants` ו-`information_schema.triggers`.
--    ⛔ הוא **לא** נכתב מתוך קריאת קוד האפליקציה.
--
-- ⚠️ הפרויקט משותף עם hanhala-ruchanit (`kv`, `ys_users`, `sync_log`,
--    `kv_backup`) ועם schar-limud (`sl_*`). הקובץ הזה יוצר **רק** את שתי
--    טבלאות היומן ואינו נוגע בהן.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- הפרדה דו-מוסדית — טבלה לכל ישיבה
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ **ההפרדה בין המוסדות היא ברמת הטבלה, לא ברמת המפתח.** שמות המפתחות
--    זהים בשתיהן (`tb_entries`, `tb_archive`, …), ומה שקובע לאיזה מוסד הם
--    שייכים הוא `KV_TABLE` שבקוד. ⛔ אין למזג אותן לטבלה אחת עם עמודת מוסד:
--    זה בדיוק המצב שממנו נמלטנו — `public.kv` המשותפת — ושהוליד את ההגירה
--    החד-פעמית שבוצעה בזמנו (הקובץ עצמו נמחק בסבב 33).
-- ⚠️ במכשיר ההפרדה היא **בסיומת המפתח** (`_rishon` / `_ramataviv`) מפני
--    ששני המוסדות חולקים localStorage אחד. שתי ההפרדות אינן אותו מנגנון
--    ואין לערבב ביניהן.
--
-- המפתחות שהאפליקציה כותבת לשתיהן: `tb_entries` (רשומות היומן) ·
-- `tb_archive` (סנאפשוטים יומיים) · `tb_cats` (קטגוריות) · `tb_subs`
-- (תתי-משימות) · `tb_subs_meta` (חותמות המיזוג של `tb_subs`) ·
-- `tb_last_changed` (חותמת הסנכרון).


-- ── ראשון לציון ─────────────────────────────────────────────────────────────
create table if not exists public.kv_rishon (
  key   text primary key,
  value text
);

alter table public.kv_rishon enable row level security;
drop policy if exists kv_rishon_all on public.kv_rishon;
create policy kv_rishon_all on public.kv_rishon using (true) with check (true);

-- ⚠️ ההרשאות של `anon` צומצמו בסבב 29, בהחלטת המנהל (`migrations/001`).
--    ⛔ **`revoke` לפני `grant`, ואין לקצר לשורת `grant` אחת:** פרויקט
--    Supabase סטנדרטי מגיע עם `alter default privileges … grant all`, ולכן
--    הטבלה **נולדת** עם `delete` ו-`truncate` ל-anon — ו-GRANT הוא אדיטיבי
--    בלבד ואינו מסיר אותם. השורה הזו היא גם שורת ההתכנסות להתקנה שנוצרה
--    לפני סבב 29.
-- ⛔ אין להחזיר ל-anon את `delete`/`truncate` (סבב 29) — האפליקציה אינה
--    מוחקת שורות בשום מסלול (`sbSet` הוא `upsert`, ומחיקת רשומה היא
--    tombstone בתוך הערך), ולכן ההרשאה מיותרת ורק פותחת ריקון של מוסד שלם
--    למי שמחזיק את המפתח הציבורי.
revoke delete, truncate, references, trigger on public.kv_rishon from anon, authenticated;
grant select, insert, update on public.kv_rishon to anon, authenticated;
grant select, insert, update, delete, truncate, references, trigger
  on public.kv_rishon to service_role;


-- ── רמת אביב ────────────────────────────────────────────────────────────────
create table if not exists public.kv_ramataviv (
  key   text primary key,
  value text
);

alter table public.kv_ramataviv enable row level security;
drop policy if exists kv_ramataviv_all on public.kv_ramataviv;
create policy kv_ramataviv_all on public.kv_ramataviv using (true) with check (true);

-- ⚠️ אותו דפוס כמו ב-`kv_rishon` שלמעלה, ומאותה סיבה — ר' ההסבר שם.
revoke delete, truncate, references, trigger on public.kv_ramataviv from anon, authenticated;
grant select, insert, update on public.kv_ramataviv to anon, authenticated;
grant select, insert, update, delete, truncate, references, trigger
  on public.kv_ramataviv to service_role;


-- ============================================================================
-- ⚠️ מוסד נוסף — מה צריך להשתנות
-- ============================================================================
-- הוספת ישיבה שלישית אינה שורת SQL בלבד. נדרשים, יחד ובאותו סבב:
--   1. טבלה `kv_<מוסד>` כאן, עם אותם RLS, פוליסה והרשאות.
--   2. ערך חדש ב-`KV_TABLE` וב-`LS` שבקוד (סיומת המפתחות המקומיים).
--   3. `lsRebuildPolicy()` — מדיניות הפינוי היא פר-מוסד, ועֵד הסנכרון של
--      מוסד אחד אינו תקף לנתוני השני.
--   4. `pendReload()` בבחירת המוסד — סימוני ⏳ הם פר-מוסד גם הם.
-- ⛔ מי מהם שיישכח ייצור מוסד שנראה עובד ומסתנכרן לטבלה של מוסד אחר.


-- ============================================================================
-- ✅ ההצעה מסבב 28 — בוצעה בסבב 29
-- ============================================================================
-- בסוף הקובץ הזה ישבה עד סבב 28 הצעה מוערת לצמצם את `delete`/`truncate`
-- של `anon` על שתי הטבלאות. **המנהל אישר, והיא מיושמת** — גם כאן (השורות
-- שליד כל טבלה) וגם ב-`migrations/001_revoke_delete_anon.sql` להתקנה
-- קיימת. מה שנמדד לפני הביצוע: **אפס** קריאות `.delete()` ל-PostgREST
-- בכל הריפו.
--
-- ⚠️ **`authenticated` צומצם יחד עם `anon`**, בהחלטת המנהל: לתפקיד היו
-- בדיוק אותן הרשאות מלאות, מאותה ירושה, ופתיחת signup או Auth בעתיד הייתה
-- פוערת את ההגנה בשקט. זהו גם **יישור ל-gius**, שמיגרציה 0002 שלה כבר
-- צמצמה את שניהם.
-- ⚠️ **הצמצום נעשה כשאין משתמשי Auth כלל** (`auth.users` ריקה), ולכן הוא
-- **אינו נבדק מול מסלול חי**. אם ייפתח Auth בעתיד — יש לוודא
-- ש-`select, insert, update` מספיקים למסלול שייבנה.
-- ⛔ `service_role` לא נגע — הוא תפקיד השרת.
--
-- ⛔ **ובפרויקט המשותף יש שתי טבלאות שאין לגעת בהן:** `sync_log`
-- ו-`kv_backup` (של האחיות) מקבלות `insert`+`select` בלבד ל-anon —
-- **בלי `update`** — כדי שלא ניתן יהיה לזייף רישום ביומן ראיות.
-- ר' כלל ברזל 10 סעיף 9.
