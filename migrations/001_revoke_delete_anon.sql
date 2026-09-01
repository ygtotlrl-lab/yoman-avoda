-- ============================================================================
-- 001_revoke_delete_anon.sql — גריעת `delete`/`truncate` מ-`anon` ומ-`authenticated`
-- ============================================================================
--
-- ⛔ **רץ במסד.** ⛔ מיגרציה שכבר רצה אינה נערכת — ⚠️ המסד החיל אותה,
--    ועריכה שלה יוצרת מצב שבו הקובץ מתאר משהו אחר ממה שרץ; ⛔ שינוי מבני
--    נעשה בקובץ הבא בתור.
--
-- ⭐ **זו המיגרציה הראשונה כאן מאז קובץ ההתקנה** (`000_initial_schema.sql`,
--). היא מפעילה את ההצעה שנרשמה שם מוערת בסוף הקובץ
--    («⚠️ הצעה שלא בוצעה — הקשחת ההרשאות») — **בהחלטת המנהל**.
--
-- **הבעיה.** מיפוי `information_schema.role_table_grants` מול המסד
-- החי מצא ש-`anon` מחזיק על `kv_rishon` ועל `kv_ramataviv`:
--     DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- כלומר גם **מחיקת שורות** וגם **ריקון טבלה שלמה**. מפתח ה-anon יושב גלוי
-- ב-`index.html` בריפו ציבורי, וה-RLS כאן הוא `using (true)` — ולכן מי
-- שמחזיק בו יכול תיאורטית לרוקן מוסד שלם: `tb_entries`, `tb_archive`
-- וכל שאר מפתחות היומן יושבים כשורות בשתי הטבלאות האלה.
--
-- ⚠️ **מאיפה זה הגיע:** לא מקובץ ההתקנה. פרויקט Supabase סטנדרטי מגיע עם
--     alter default privileges in schema public grant all on tables
--       to anon, authenticated, service_role;
-- ולכן **כל טבלה שנוצרה כאן נולדה עם DELETE ו-TRUNCATE**, וה-`grant` שבקובץ
-- ההתקנה רק תיאר את המצב הזה. ⛔ **GRANT הוא אדיטיבי בלבד** ואינו יכול
-- להסיר דבר; רק `revoke` מסיר.
--
-- **למה ההסרה בטוחה.** ⛔ אין באפליקציה שום מסלול מחיקה
-- מול המסד: סריקה של כל קבצי הריפו מצאה **אפס** קריאות `.delete()` ל-
-- PostgREST (ההתאמה היחידה היא `caches.delete()` של ה-service worker).
-- כל כתיבה עוברת ב-`sbSet`, שהוא `upsert`, ומחיקה של רשומת יומן היא
-- **tombstone בתוך הערך** — `deleted:true` + `updatedAt` בתוך ה-JSON —
-- ולא הסרת שורה. ההרשאה מיותרת לחלוטין, והסרתה אינה שוברת דבר.
--
-- **מה נשאר ל-anon:** `select, insert, update` — בדיוק מה ש-`sbSet` צריך.
--
-- ⚠️ **הפרויקט משותף** עם hanhala-ruchanit (`kv`, `ys_users`) ועם
-- schar-limud (`sl_*`). המיגרציה הזו נוגעת **רק** בשתי טבלאות היומן; לכל
-- אחת מהאחיות מיגרציה מקבילה משלה, באותו סבב.
-- ⛔ **ובפרט אין לגעת כאן ב-`sync_log` וב-`kv_backup`** — הן של האחיות,
-- ומחזיקות `insert, select` בלבד ל-anon: היעדר ה-update שם הוא **הגנה
-- מכוונת** (יומן ראיות שאי אפשר לזייף בו רישום קיים). ר' כלל ברזל 10
-- סעיף 9.
--
-- אדיטיבית, אידמפוטנטית, ⛔ **ואינה נוגעת בנתונים** — הרשאות בלבד. אין
-- כאן `insert`, `update` או `delete` על אף שורה.
--
-- ⚠️ **מוסד שלישי בעתיד:** טבלת `kv_<מוסד>` חדשה תיוולד שוב עם ההרשאות
-- המלאות, ולכן היא חייבת `revoke` משלה — ר' רשימת ארבעת הצעדים בקובץ
-- ההתקנה.
-- ============================================================================

begin;

do $$
declare t text;
begin
  foreach t in array array['kv_rishon', 'kv_ramataviv']
  loop
    -- ⛔ revoke ואז grant, בסדר הזה. `grant select, insert, update` לבדו
    -- אינו מסיר את delete/truncate שכבר קיימים — הוא רק מוסיף.
    execute format(
      'revoke delete, truncate, references, trigger on table public.%I from anon, authenticated', t);
    execute format(
      'grant select, insert, update on table public.%I to anon, authenticated', t);
  end loop;
end $$;

-- טבלה עתידית בסכימה הזו לא תיוולד עם ההרשאות האלה.
-- ⚠️ **אינו תחליף לשורות שלמעלה:** `alter default privileges` משפיע רק על
-- ברירות מחדל שבבעלות התפקיד שמריץ אותו, ורק על טבלאות שייווצרו **מכאן
-- והלאה**. אם ברירות המחדל של Supabase נקבעו ע"י תפקיד אחר, זהו no-op.
-- ⛔ ולכן הכלל נשאר: **כל מוסד חדש חייב revoke מפורש משלו** — ⚠️ טבלה
--    שנולדת עם ההרשאות המלאות אינה משאירה סימן, ואיש אינו מודד אותה.
alter default privileges in schema public
  revoke delete, truncate on tables from anon, authenticated;

commit;

-- ============================================================================
-- אימות אחרי ההרצה
-- ============================================================================
--   select table_name,
--          string_agg(distinct privilege_type, ', ' order by privilege_type)
--   from information_schema.role_table_grants
--   where grantee = 'anon' and table_schema = 'public'
--     and table_name in ('kv_rishon','kv_ramataviv')
--   group by table_name order by table_name;
--
-- מצופה, לשתי השורות: INSERT, SELECT, UPDATE

-- ============================================================================
-- ⚠️ `authenticated` צומצם כאן יחד עם `anon`
-- ============================================================================
-- לתפקיד הזה היו בדיוק אותן הרשאות מלאות, מאותה ירושה. הבקשה המקורית הייתה
-- על המפתח הציבורי בלבד, וההרחבה נעשתה **בהחלטת המנהל**: התפקיד קיים ומחזיק
-- הרשאות עודפות **היום**, ופתיחת signup או Auth בעתיד הייתה פוערת את ההגנה
-- בשקט. ⚠️ זהו גם **יישור ל-gius**, שמיגרציה 0002 שלה כבר צמצמה את שניהם.
--
-- ⚠️ **הצמצום נעשה כשאין משתמשי Auth כלל** — `select count(*) from auth.users`
-- מחזיר 0, ולכן הוא **אינו נבדק מול מסלול חי**. אם ייפתח Auth בעתיד, יש
-- לוודא ש-`select, insert, update` מספיקים למסלול שייבנה.
--
-- אימות:
--   select grantee, table_name,
--          string_agg(distinct privilege_type, ', ' order by privilege_type)
--   from information_schema.role_table_grants
--   where table_schema = 'public' and grantee in ('anon','authenticated')
--     and table_name in ('kv_rishon', 'kv_ramataviv')
--   group by grantee, table_name order by table_name, grantee;
--
-- מצופה, לכל השורות: INSERT, SELECT, UPDATE
-- ⛔ `service_role` לא נגע ואינו אמור להשתנות — הוא תפקיד השרת.
