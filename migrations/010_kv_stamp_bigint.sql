-- ============================================================================
-- 010_kv_stamp_bigint.sql — החותמת היא `bigint` של המכשיר
-- ============================================================================
--
-- ⛔ **רץ במסד.**
--
-- ⛔⛔ **מה הקובץ עושה:** ⚠️ מסיר את טריגרי ה-`touch` משתי טבלאות ההגדרות
--    המוסדיות, ⛔ וממיר את `updated_at` מ-`timestamptz` ל-`bigint` —
--    ⭐ מילישניות מאז העידן, בדיוק מה ש-`Date.now()` מייצר.
--
-- ⛔⛔ **הנימוק:** ⚠️ חותמת שרת הופכת מכשיר שערך אופליין לחדש יותר בטעות
--    ודורסת את עריכתו האמיתית — ⭐ מנוע ההכרעה חייב מקור חותמת **אחד**,
--    ⛔ והוא המכשיר שערך. ⚠️ `tb_entries` כאן כבר נשאה `bigint` בלי טריגר,
--    ⛔ ושתי טבלאות ההגדרות לא: ⭐ ושני טיפוסים לאותו מושג הם שני מנועים.
--
-- ⚠️ **ואין `default`** — ⛔ ולא `now()` במילישניות: ⭐ ברירת מחדל בצד השרת
--    היא מקור חותמת שני שמתמלא בשקט כשהקוד שוכח. ⚠️ `not null` בלי ברירה
--    מפיל כתיבה כזו ברעש, ⛔ וזה הרצוי.
--
-- ⛔⛔ **וגם `default 0` יורדת** — ⚠️ מהטבלאות שכבר נשאו `bigint`: ⭐ אפס
--    אינו «לא ידוע» אלא **הישן ביותר**, ⛔ וכתיבה ששכחה את החותמת הייתה
--    מקבלת אותו בשקט וכל עריכה הייתה מנצחת אותה. ⚠️ **נמדד: אפס שורות
--    נושאות אפס** בשש הטבלאות, ⛔ ולכן הברירה מעולם לא נבחרה בפועל.
--
-- ⛔ **`kv_touch_updated_at()` נגרעת כאן** — ⚠️ שתי הטבלאות שהיא משרתת הן
--    של האפליקציה הזו בלבד, ⭐ ואין לה תלוי אחר.
--
-- ⛔ **נמדד לפני ההמרה:** ⚠️ 7 שורות בכל אחת מהשתיים.
-- ============================================================================

drop trigger if exists kv_rishon_touch    on public.kv_rishon;
drop trigger if exists kv_ramataviv_touch on public.kv_ramataviv;

drop function if exists public.kv_touch_updated_at();

do $$
declare t text;
begin
  foreach t in array array['kv_rishon','kv_ramataviv'] loop
    if (select data_type from information_schema.columns
          where table_schema = 'public' and table_name = t
            and column_name = 'updated_at') is distinct from 'bigint' then
      execute format('alter table public.%I alter column updated_at drop default', t);
      execute format('alter table public.%I alter column updated_at type bigint '
                     'using (extract(epoch from updated_at) * 1000)::bigint', t);
    end if;
  end loop;
end $$;

-- ⛔ הטבלה שכבר נשאה `bigint` — ⚠️ הברירה בלבד יורדת ממנה.
alter table public.tb_entries alter column updated_at drop default;
