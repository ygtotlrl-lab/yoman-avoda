-- ============================================================================
-- 003_migrate_kv_to_rows.sql — פירוק ערכי ה-kv לשורות
-- ============================================================================
--
-- ⛔ **רץ במסד.** ⛔ מיגרציה שכבר רצה אינה נערכת — ⚠️ המסד החיל אותה,
--    ועריכה שלה יוצרת מצב שבו הקובץ מתאר משהו אחר ממה שרץ; ⛔ שינוי מבני
--    נעשה בקובץ הבא בתור.
--
-- ⛔⛔ **תנאי מוקדם, ואין לעקוף אותו:**
--     1. הגיבוי היומי של שלב א רץ **ואומת בפועל** — יש ב-`kv_backup` שורה
--        טרייה עם המפתחות `rishon_tb_archive` ו-`rishon_tb_entries`
--        (ו-`ramataviv_*`). ⛔ בלי זה אין נקודת חזרה, והקובץ הזה מזיז 1.2MB.
--     2. `002_structured_tables.sql` רץ.
--     שאילתת האימות לתנאי 1 יושבת בסוף הקובץ, תחת «אימות מוקדם».
--
-- ── מה הקובץ עושה, ומה הוא **לא** עושה ─────────────────────────────────────
-- ⭐ **אדיטיבי בלבד.** הוא קורא מ-`kv_rishon`/`kv_ramataviv` וכותב ל-
--    `tb_entries`/`tb_archive`. ⛔ הוא **אינו נוגע** ב-`kv_rishon`
--    וב-`kv_ramataviv`: אין בו `update`, אין `delete` ואין `truncate`
--    עליהן, והמפתחות הישנים נשארים במקומם ככתבם וכלשונם. הם נקודת החזרה,
--    ומחיקתם **אינה בסבב הזה** (ר' «נתיב חזרה» ו«הפער והטריגר» למטה).
--
-- ⭐ **אידמפוטנטי, ו-`do nothing` ולא `do update`** — וזו ההחלטה החשובה
--    בקובץ: אחרי המעבר האפליקציה כותבת לטבלאות, ובלוק ה-`kv` הישן ממשיך
--    להיכתב גם הוא (כתיבה כפולה, ר' `TB_ROWS` ב-`index.html`). הרצה חוזרת
--    של הקובץ עם `do update` הייתה **דורסת שורה חדשה בערך ישן יותר** מתוך
--    ה-blob — כלומר מחזירה נתונים אחורה בשקט. `do nothing` הופך הרצה
--    חוזרת ל-no-op גמור.
--    ⛔ אין להחליף ל-`do update` בשום מצב.
--
-- ⚠️ רשומה בלי מזהה אינה ניתנת למיגרציה, והיא **מדולגת ולא מומצאת**:
--    רשומת יומן בלי `id`, וסנאפשוט בלי `gdate` ובלי `id`. שאילתת השקילות
--    שבסוף סופרת אותן במפורש — ⛔ אם המספר אינו 0, אין להמשיך בלי להבין
--    מה הן.
-- ============================================================================


-- ───────────────────────────────────────────────────────────────────────────
-- 1. רשומות היומן
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ `rec_key` הוא `id` כמחרוזת — בדיוק מה ש-`entryKey` מחזירה, ו-
--    `client_id` הוא `'<yeshiva>:' || rec_key`. שני הצדדים חייבים לחשב
--    אותו דבר; ר' ההסבר המלא בראש `002`.
insert into public.tb_entries (client_id, yeshiva, rec_key, updated_at, deleted, data)
select 'rishon:' || (e->>'id'), 'rishon', (e->>'id'),
       coalesce(nullif(e->>'updatedAt','')::bigint, 0),
       coalesce((e->>'deleted')::boolean, false),
       e
from public.kv_rishon k, lateral jsonb_array_elements(k.value::jsonb) e
where k.key = 'tb_entries' and nullif(e->>'id','') is not null
on conflict (client_id) do nothing;

insert into public.tb_entries (client_id, yeshiva, rec_key, updated_at, deleted, data)
select 'ramataviv:' || (e->>'id'), 'ramataviv', (e->>'id'),
       coalesce(nullif(e->>'updatedAt','')::bigint, 0),
       coalesce((e->>'deleted')::boolean, false),
       e
from public.kv_ramataviv k, lateral jsonb_array_elements(k.value::jsonb) e
where k.key = 'tb_entries' and nullif(e->>'id','') is not null
on conflict (client_id) do nothing;


-- ───────────────────────────────────────────────────────────────────────────
-- 2. סנאפשוטי הארכיון
-- ───────────────────────────────────────────────────────────────────────────
-- ⚠️ `rec_key` = `'g:' || gdate`, ובהיעדר `gdate` — `'i:' || id`. זהו בדיוק
--    `archiveKey` שב-`index.html`, כולל סדר הבדיקה. ⛔ אין להפוך את הסדר:
--    שני מכשירים שארכבו את אותו יום מייצרים `id` שונה, ו-`gdate` הוא מה
-- שמונע שני סנאפשוטים לאותו יום.
insert into public.tb_archive (client_id, yeshiva, rec_key, gdate, updated_at, deleted, data)
select 'rishon:' || rk, 'rishon', rk, nullif(s->>'gdate',''),
       coalesce(nullif(s->>'updatedAt','')::bigint, 0),
       coalesce((s->>'deleted')::boolean, false),
       s
from public.kv_rishon k,
     lateral jsonb_array_elements(k.value::jsonb) s,
     lateral (select case when nullif(s->>'gdate','') is not null
                          then 'g:' || (s->>'gdate')
                          when nullif(s->>'id','') is not null
                          then 'i:' || (s->>'id')
                     end) x(rk)
where k.key = 'tb_archive' and rk is not null
on conflict (client_id) do nothing;

insert into public.tb_archive (client_id, yeshiva, rec_key, gdate, updated_at, deleted, data)
select 'ramataviv:' || rk, 'ramataviv', rk, nullif(s->>'gdate',''),
       coalesce(nullif(s->>'updatedAt','')::bigint, 0),
       coalesce((s->>'deleted')::boolean, false),
       s
from public.kv_ramataviv k,
     lateral jsonb_array_elements(k.value::jsonb) s,
     lateral (select case when nullif(s->>'gdate','') is not null
                          then 'g:' || (s->>'gdate')
                          when nullif(s->>'id','') is not null
                          then 'i:' || (s->>'id')
                     end) x(rk)
where k.key = 'tb_archive' and rk is not null
on conflict (client_id) do nothing;


-- ============================================================================
-- אימות מוקדם — ⛔ להריץ **לפני** שני ה-INSERT שלמעלה
-- ============================================================================
--   select key, created_at, length(value) bytes
--   from public.kv_backup
--   where key in ('rishon_tb_archive','rishon_tb_entries',
--                 'ramataviv_tb_archive','ramataviv_tb_entries')
--   order by created_at desc limit 8;
--   -- ⛔ ריק ⇒ הגיבוי של שלב א לא רץ. **לעצור.**


-- ============================================================================
-- ⭐ בדיקת שקילות — שני הכיוונים. ⛔ תנאי למעבר לקוד החדש.
-- ============================================================================
-- ⚠️ שקילות **חד-כיוונית אינה שקילות**: «כל שורה בטבלה קיימת בערך הישן»
--    מתקיים גם בטבלה ריקה. שתי השאילתות רצות יחד, ושתיהן חייבות להחזיר 0.
--
-- כיוון א — כל רשומה בערך הישן קיימת בטבלה החדשה:
--
--   with old as (
--     select 'rishon' y, e->>'id' rk from public.kv_rishon k,
--            lateral jsonb_array_elements(k.value::jsonb) e
--       where k.key='tb_entries' and nullif(e->>'id','') is not null
--     union all
--     select 'ramataviv', e->>'id' from public.kv_ramataviv k,
--            lateral jsonb_array_elements(k.value::jsonb) e
--       where k.key='tb_entries' and nullif(e->>'id','') is not null
--   )
--   select count(*) as missing_in_table
--   from old left join public.tb_entries t
--     on t.yeshiva = old.y and t.rec_key = old.rk
--   where t.client_id is null;
--   -- ציפייה: 0
--
-- כיוון ב — כל שורה בטבלה קיימת בערך הישן:
--
--   with old as ( … אותה CTE בדיוק … )
--   select count(*) as extra_in_table
--   from public.tb_entries t left join old
--     on t.yeshiva = old.y and t.rec_key = old.rk
--   where old.rk is null;
--   -- ציפייה: 0 **מיד אחרי המיגרציה**.
--   -- ⚠️ ואחרי שהאפליקציה כבר רצה על הטבלאות, הכיוון הזה **אמור** לגדול:
--   --    רשומה חדשה נכתבת לשתיהן, אבל רשומה שנכתבה בזמן שהכתיבה הכפולה
--   --    ל-kv נכשלה תופיע רק בטבלה. ⛔ אין לפרש גידול כאן כשגיאה אחרי
--   --    שהמערכת חיה — הבדיקה תקפה כשער **ברגע המעבר**.
--
-- אותן שתי שאילתות לארכיון, עם `tb_archive` ועם:
--   rk = case when nullif(s->>'gdate','') is not null then 'g:'||(s->>'gdate')
--             when nullif(s->>'id','') is not null   then 'i:'||(s->>'id') end
--
-- ⚠️ ובנוסף — מה שלא ניתן היה למגר, וחייב להיות 0:
--
--   select count(*) from public.kv_rishon k,
--          lateral jsonb_array_elements(k.value::jsonb) e
--    where k.key='tb_entries' and nullif(e->>'id','') is null;
--   -- רשומות בלי `id`. ⛔ מספר שאינו 0 ⇒ לעצור ולהבין מה הן.
--
--   select count(*) from public.kv_rishon k,
--          lateral jsonb_array_elements(k.value::jsonb) s
--    where k.key='tb_archive'
--      and nullif(s->>'gdate','') is null and nullif(s->>'id','') is null;
--   -- סנאפשוטים בלי `gdate` ובלי `id`. ⛔ אותו כלל.
--
-- ⚠️ ולבסוף — ספירה משני הצדדים, כמספר אחד לעין:
--
--   select 'kv' src, jsonb_array_length(value::jsonb) n
--     from public.kv_rishon where key='tb_archive'
--   union all
--   select 'rows', count(*) from public.tb_archive where yeshiva='rishon';
--   -- ⚠️ ההפרש המותר היחיד הוא מספר הסנאפשוטים בלי מזהה שנספרו למעלה.


-- ============================================================================
-- ⚠️ נתיב חזרה — מה בדיוק צריך להחזיר
-- ============================================================================
-- 1. **בקוד:** `var TB_ROWS = true;` שבראש אזור הסנכרון ב-`index.html` →
--    `false`. זה הכל. הקריאה חוזרת לקרוא מ-`kv` בדיוק כמו קודם, הכתיבה
--    ממשיכה לכתוב לשם (היא לא הפסיקה), ולקדם `CACHE_NAME` +
--    `<meta name="app-version">` כדי שהמכשירים יקבלו את החזרה.
-- 2. **במסד:** ⛔ **אין מה להחזיר.** המפתחות `tb_entries`/`tb_archive`
--    ב-`kv_rishon`/`kv_ramataviv` לא נגעו ולא הפסיקו להתעדכן, ולכן הם
--    מעודכנים לרגע החזרה. שתי הטבלאות החדשות פשוט מפסיקות להיקרא.
-- 3. ⚠️ **מה כן ייאבד בחזרה:** רשומה שנכתבה בחלון שבו הכתיבה לטבלאות
--    הצליחה והכתיבה ל-`kv` נכשלה (רשת שנפלה בין שתיהן). היא מסומנת ⏳
--    במכשיר שכתב אותה, ותידחף משם בסנכרון הבא.
--
-- ============================================================================
-- ⛔ הפער והטריגר — מחיקת המפתחות הישנים
-- ============================================================================
-- ⛔ **מחיקת `tb_entries`/`tb_archive` מ-`kv_rishon`/`kv_ramataviv` אינה
--    בסבב הזה**, וגם לא הפסקת הכתיבה הכפולה אליהם.
-- **הטריגר:** שבועיים של עבודה תקינה על הטבלאות החדשות — כלומר בדיקת
-- השקילות שלמעלה נקייה, ו«⏳ ממתין לסנכרון» מציג 0 בשני המוסדות.
-- ⚠️ ורק אז, ובסבב ייעודי: קודם מפסיקים את הכתיבה הכפולה, ורק בסבב שאחריו
-- מוחקים את המפתחות — ⛔ ולא שניהם באותו סבב, אחרת אין חלון שבו אפשר
-- לגלות טעות ועדיין לחזור.
