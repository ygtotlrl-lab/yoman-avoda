-- ============================================================================
-- 014_cats_subs_reset_stamps.sql — עידן ⟵ חותמת ניקוי, בשני המוסדות
-- ============================================================================
--
-- ⛔ **רץ במסד.**
--
-- ⛔⛔ **מה הקובץ עושה:** ⚠️ קובע `tb_cats_reset` ו-`tb_subs_reset` בשני
--    המוסדות — ⭐ ערכם חותמת ISO — ⛔ ומסמן את שני המפתחות הישנים
--    כמחוקים.
--
-- ⛔⛔ **הנימוק:** ⚠️ מספר סידורי אינו מתעד את עצמו — ⭐ מי שפותח את המסד
--    רואה «2» ואינו יודע מה נוקה, מתי, ולמה: ⛔ וחותמת אומרת את שלושתם.
--    ⚠️ **והשוואת מחרוזות ISO היא השוואה כרונולוגית**, ⭐ ולכן המנגנון
--    בקוד זהה ⛔ ואין בו המרה.
--
-- ⛔ **וההגירה במכשיר היא תופעת לוואי מכוונת** — ⚠️ מכשיר שראה `epoch=2`
--    מחזיק מחרוזת ריקה תחת המפתח החדש, ⭐ וכל חותמת גדולה ממנה:
--    ⛔ הוא זורק **פעם אחת** ומושך מלא, ⚠️ וזה בדיוק מה שנדרש.
--
-- ⛔ **והחותמת ליטרל ואינה `now()`** — ⚠️ הרצה שנייה של אותו קובץ הייתה
--    כותבת חותמת חדשה, ⭐ וכל המכשירים היו זורקים שוב: ⛔ אידמפוטנטיות
--    כאן היא הערך עצמו.
--
-- ⛔ **והמפתחות הישנים יורדים במחיקה רכה** — ⚠️ אין `DELETE` פיזי:
--    ⭐ שלישיית המחיקה הרכה כבר יושבת בשתי הטבלאות, ⛔ והיעדר שורה היה
--    נקרא במכשיר כ«אין לי» ולא כ«נמחק».
--
-- ⛔ **נמדד לפני השינוי:** ⚠️ `tb_cats_epoch` ו-`tb_subs_epoch` קיימים
--    בשני המוסדות, ⭐ ואין בהם אף מפתח שנגמר ב-`_reset`.
-- ============================================================================

-- ── א · חותמות הניקוי — ראשון לציון ────────────────────────────────────────
insert into public.kv_rishon (key, value, updated_at)
values ('tb_cats_reset', '2026-09-09T13:00:00Z', (extract(epoch from now()) * 1000)::bigint),
       ('tb_subs_reset', '2026-09-09T13:00:00Z', (extract(epoch from now()) * 1000)::bigint)
on conflict (key) do update
  set value = excluded.value, updated_at = excluded.updated_at;

-- ── ב · חותמות הניקוי — רמת אביב ───────────────────────────────────────────
insert into public.kv_ramataviv (key, value, updated_at)
values ('tb_cats_reset', '2026-09-09T13:00:00Z', (extract(epoch from now()) * 1000)::bigint),
       ('tb_subs_reset', '2026-09-09T13:00:00Z', (extract(epoch from now()) * 1000)::bigint)
on conflict (key) do update
  set value = excluded.value, updated_at = excluded.updated_at;

-- ── ג · המפתחות הישנים — מחיקה רכה בשני המוסדות ────────────────────────────
update public.kv_rishon
   set deleted = true,
       deleted_at = now(),
       deleted_by = 'migration',
       updated_at = (extract(epoch from now()) * 1000)::bigint
 where key in ('tb_cats_epoch', 'tb_subs_epoch') and deleted = false;

update public.kv_ramataviv
   set deleted = true,
       deleted_at = now(),
       deleted_by = 'migration',
       updated_at = (extract(epoch from now()) * 1000)::bigint
 where key in ('tb_cats_epoch', 'tb_subs_epoch') and deleted = false;
