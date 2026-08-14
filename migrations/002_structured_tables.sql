-- ============================================================================
-- 002_structured_tables.sql — יומן העבודה עובר לטבלאות מובנות (סבב 30, שלב ב)
-- ============================================================================
-- ⛔⛔ **אין להריץ את הקובץ הזה לפני שהגיבוי היומי של שלב א רץ ואומת.**
--     המיגרציה הבאה (`003`) מפרקת 1.2MB של נתוני יומן לשורות, ובלי גיבוי
--     פעיל שנמדד בפועל אין נקודת חזרה. סדר ההרצה: שלב א ← אימות ש-
--     `kv_backup` קיבלה שורה טרייה עם `rishon_tb_archive` ← ורק אז 002+003.
--
-- ── מה זה פותר ─────────────────────────────────────────────────────────────
-- yoman-avoda היא היחידה בארגון שנתוניה אינם בטבלאות אלא כ-13 מפתחות
-- ב-`kv_rishon`/`kv_ramataviv`, כשכל מפתח הוא **ערך יחיד**:
--   kv_rishon.tb_archive     1,205,501 בתים · 164 סנאפשוטים
--   kv_rishon.tb_entries       110,709 בתים ·   452 רשומות
--   kv_ramataviv.tb_entries     66,337 · tb_archive 61,101
-- (נמדד מול המסד החי בסבב 30, ב-`SELECT` בלבד.)
-- המשמעות: עריכת רשומה בודדת דורסת את **מלוא** הערך, המיזוג בענן הוא ברמת
-- קובץ, ופינוי סלקטיבי אינו אפשרי בצד הענן.
--
-- ── ⭐ שלוש החלטות מבנה, וכל אחת נבחרה מול חלופה ────────────────────────────
--
-- 1. **עמודת `yeshiva`, ולא טבלה לכל מוסד.**
--    ⚠️ זו סטייה מכוונת מדפוס ה-`kv`, שבו ההפרדה בענן היא **טבלה לכל מוסד**
--    (`kv_rishon`/`kv_ramataviv`) — ולכן היא נרשמת ולא מונחת. הנימוק:
--    א. `kv` היא שק גנרי בלי סכימה, ושם הטבלה היה מרחב-השמות היחיד. כאן יש
--       סכימה אמיתית, ועמודה היא מרחב-שמות טוב יותר מהשם של האובייקט.
--    ב. הוספת מוסד שלישי דורשת כאן **אפס DDL**. בדפוס הקיים היא דורשת
--       טבלה חדשה, RLS, פוליסה, ו-`revoke`+`grant` משלה — וזו בדיוק
--       המלכודת שרשומה בקובץ ההתקנה («טבלה חדשה תיוולד שוב עם ההרשאות
--       המלאות»), כלומר צעד שקל לשכוח וההגנה נופלת בשקט.
--    ג. ⛔ ההפרדה לטבלאות **מעולם לא הייתה הגנה**: ה-RLS הוא `using (true)`
--       ומפתח ה-anon גלוי ב-`index.html`, ולכן מי שיכול לקרוא טבלה אחת
--       יכול לקרוא את השנייה. אין כאן ויתור על בידוד שהיה קיים.
--    ⚠️ ההפרדה **במכשיר** לא נגעה ולא תיגע: היא סיומת המפתח (`LS`), ו-
--    `tb_entries_rishon` ו-`tb_entries_ramataviv` נשארים שני מפתחות נפרדים
--    ב-localStorage. ⛔ אין לערבב בין שתי השכבות (סבב 13).
--
-- 2. **`client_id` נגזר ממפתח המיזוג, ואינו uuid חדש.**
--    ⛔ וזה **הפוך** מ-schar-limud בכוונה (סבב 30) — שם `id` הוא `SERIAL`
--    שהמסד מקצה, ולכן לרשומה לא הייתה זהות עד שראתה שרת, ו-uuid מהמכשיר
--    היה מה שסגר את הפער. כאן ההפך: לרשומה **כבר יש** זהות שנוצרה במכשיר —
--    `id` של הרשומה (חותמת `Date.now`) ו-`gdate` של הסנאפשוט — והיא זו
--    שמנוע המיזוג משתמש בה מאז סבב 3ב. uuid שני ועצמאי היה מאפשר לאותה
--    רשומה לוגית להתקיים פעמיים תחת שני מזהים — כלומר **בדיוק הכפילות**
--    שהעמודה באה למנוע.
--    לכן: `client_id = '<yeshiva>:<rec_key>'`, כש-`rec_key` הוא בדיוק מה
--    ש-`entryKey`/`archiveKey` מחזירות ב-`index.html`:
--      רשומה   → `<id>`
--      סנאפשוט → `g:<gdate>`, ובהיעדרו `i:<id>`
--    ⛔ אין לשנות את הנוסחה הזו בלי לשנות את שתי הפונקציות באותו סבב —
--    שני צדדים שמחשבים זהות אחרת יוצרים שתי שורות לאותה רשומה.
--
-- 3. **`updated_at` הוא `bigint` (אפוך מילישניות), ו⛔ אין עליו טריגר.**
--    מנוע המיזוג משווה את `updatedAt` המספרי של הרשומה, ו-`timestamptz`
--    היה מחייב המרה בשני הכיוונים בכל השוואה.
--    ⛔ ובמיוחד: **אין `BEFORE UPDATE` שדורס את החותמת** (סבב 30) — טריגר
--    כזה הוא בדיוק מה שמייצר את אובדן העריכה שכלל ברזל 6 מתאר («רשומה
--    מסומנת ⏳ מנצחת במיזוג»), ושלוש האחיות נאלצות להתגונן מפניו. כאן
--    החותמת של המכשיר היא האמת, ואין ממה להתגונן.
--
-- ⛔ אידמפוטנטית ואינה נוגעת בנתונים — מבנה בלבד (כלל ברזל 10 סעיף 7).
--    פירוק הנתונים עצמו נמצא ב-`003`, בקובץ נפרד ובכוונה.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. tb_entries — שורה לכל רשומת יומן
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ `data` מחזיקה את **גוף הרשומה כפי שהוא** (`cat`, `task`, `sub`, `day`,
--    `gdate`, `hdate`, `notes`, `count`, `catName`…). זו החלטה: מבנה הרשומה
--    השתנה לאורך הסבבים (שדות שנוספו ושדות אופציונליים), ופיצוץ שלו
--    לעמודות היה יוצר **מקור אמת שני לצורת הרשומה** — בדיוק מה שכלל קריטי 5
--    אוסר. העמודות שמחוץ ל-`data` הן אך ורק אלה שהמיזוג והפינוי נשענים
--    עליהן, והן משוכפלות מתוכה במכוון.
create table if not exists public.tb_entries (
  client_id  text primary key,
  yeshiva    text        not null,
  rec_key    text        not null,
  updated_at bigint      not null default 0,
  deleted    boolean     not null default false,
  data       jsonb       not null,
  synced_at  timestamptz not null default now()
);

-- ⛔ **אינדקס מלא ולא חלקי** (הלקח מ-`migrations/007` של schar-limud):
--    אינדקס עם `WHERE` שובר את הסקת `ON CONFLICT`, ו-PostgREST אינו יכול
--    לצרף את התנאי — כלומר כל `upsert` נופל ב-42P10 והשמירה מפסיקה לעבוד.
--    ⛔ אין ליצור אינדקס חלקי על העמודות האלה בשום מיגרציה עתידית.
create unique index if not exists tb_entries_yeshiva_rec_key
  on public.tb_entries (yeshiva, rec_key);
create index if not exists tb_entries_yeshiva_updated_idx
  on public.tb_entries (yeshiva, updated_at desc);

alter table public.tb_entries enable row level security;
drop policy if exists allow_all on public.tb_entries;
create policy allow_all on public.tb_entries for all to anon using (true) with check (true);

-- ⛔ `SELECT, INSERT, UPDATE` ותו לא (כלל ברזל 10 סעיף 9, סבב 29) — מחיקה
--    כאן היא `deleted=true` + חותמת ולעולם לא הסרת שורה, ולכן ההרשאה
--    מיותרת בהגדרה. ⚠️ והסדר `revoke` ואז `grant` הוא מה שעובד: `GRANT`
--    אדיטיבי, וטבלה חדשה **נולדת** עם `delete` ו-`truncate` מברירות המחדל
--    של הפרויקט.
revoke all on public.tb_entries from anon, authenticated;
grant select, insert, update on public.tb_entries to anon, authenticated;
grant select, insert, update, delete, truncate, references, trigger
  on public.tb_entries to service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- 2. tb_archive — שורה לכל סנאפשוט יום
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ **שורה לסנאפשוט, ולא שורה לרשומה שבתוכו** — וזו החלטה מדודה. הסנאפשוט
--    הוא היחידה שמנוע המיזוג מכיר (`archiveKey` לפי `gdate`), הוא נושא
--    מטא-דאטה משלו (`name`/`count`/`auto`/`updatedAt`) ו-tombstone משלו,
--    ובתוכו כבר רץ מיזוג פר-רשומה. פירוק לרשומות היה מפצל ישות אחת לשתי
--    טבלאות ומחייב מנוע מיזוג חדש — בסבב שכבר מזיז 1.2MB.
--    המדידה: 164 סנאפשוטים בראשון לציון, ~7KB לסנאפשוט. כלומר עריכת יום
--    בודד כותבת ~7KB במקום 1.2MB.
create table if not exists public.tb_archive (
  client_id  text primary key,
  yeshiva    text        not null,
  rec_key    text        not null,
  gdate      text,
  updated_at bigint      not null default 0,
  deleted    boolean     not null default false,
  data       jsonb       not null,
  synced_at  timestamptz not null default now()
);

create unique index if not exists tb_archive_yeshiva_rec_key
  on public.tb_archive (yeshiva, rec_key);
create index if not exists tb_archive_yeshiva_updated_idx
  on public.tb_archive (yeshiva, updated_at desc);

alter table public.tb_archive enable row level security;
drop policy if exists allow_all on public.tb_archive;
create policy allow_all on public.tb_archive for all to anon using (true) with check (true);

revoke all on public.tb_archive from anon, authenticated;
grant select, insert, update on public.tb_archive to anon, authenticated;
grant select, insert, update, delete, truncate, references, trigger
  on public.tb_archive to service_role;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. ברירות מחדל לטבלאות עתידיות
-- ────────────────────────────────────────────────────────────────────────────
-- ⚠️ **אינו תחליף ל-`revoke` המפורש** (סבב 29) — הוא משפיע רק על ברירות
--    מחדל שבבעלות התפקיד שמריץ אותו, ורק על טבלאות שייווצרו מכאן והלאה.
--    ⛔ הכלל נשאר: כל מיגרציה שמוסיפה טבלה חייבת `revoke` משלה.
alter default privileges in schema public
  revoke delete, truncate on tables from anon, authenticated;


-- ============================================================================
-- אימות אחרי ההרצה (SELECT בלבד)
-- ============================================================================
--   select table_name, string_agg(distinct privilege_type, ', ' order by privilege_type)
--   from information_schema.role_table_grants
--   where table_schema='public' and table_name in ('tb_entries','tb_archive')
--     and grantee in ('anon','authenticated')
--   group by table_name;
--   -- ציפייה: INSERT, SELECT, UPDATE — ⛔ אפס DELETE ואפס TRUNCATE.
--
--   select indexname, indexdef from pg_indexes
--   where schemaname='public' and tablename in ('tb_entries','tb_archive');
--   -- ⛔ ציפייה: אין `WHERE` באף `indexdef` — כל האינדקסים מלאים.
