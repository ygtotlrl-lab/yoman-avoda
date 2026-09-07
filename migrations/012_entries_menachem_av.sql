-- ============================================================================
-- 012_entries_menachem_av.sql — שם החודש בצורה אחת
-- ============================================================================
--
-- ⛔ **רץ במסד.**
--
-- ⛔⛔ **מה הקובץ עושה:** ⚠️ ממיר את שם החודש «אב» ל«מנחם אב» בשלושת
--    השדות שנושאים תאריך עברי ב-`tb_entries` — `hdate` · `name` ·
--    ו-`hdate` של כל רשומה בתוך `entries`.
--
-- ⛔⛔ **הנימוק:** ⚠️ שם החודש הוא מפתח הקיבוץ של הארכיון, ⭐ ושתי צורות
--    שלו הן שני דליים: ⛔ עד היום גישרה עליהן טבלת מיפוי בקוד, ⚠️ והיא
--    מקור אמת שני שמתיישן — ⭐ ההמרה כאן היא מה שמתיר להסיר אותה.
--
-- ⛔ **והחותמת נשמרת** — ⚠️ `updated_at` אינו מקודם: ⭐ ההמרה אינה עריכה,
--    ⛔ וקידום חותמת היה מציג לכל מכשיר מאות רשומות כאילו נערכו עכשיו.
--
-- ⛔ **אידמפוטנטי** — ⚠️ ערך שכבר נושא «מנחם אב» אינו נוגע בו שוב:
--    ⭐ התנאי הוא על הערך, ⛔ ולא על מספר ההרצה.
--
-- ⛔ **נמדד לפני השינוי:** ⚠️ 337 שורות נושאות « אב ה׳תש» — ⭐ 11 מהן גם
--    ב-`name`, ⛔ ובתוכן 164 רשומות מקוננות; ⚠️ ואפס «אדר א»/«אדר ב»
--    בכל צורה שהיא.
-- ============================================================================

-- 1 · השדות שברמת הרשומה
update tb_entries
   set data = jsonb_set(data, '{hdate}',
              to_jsonb(replace(data->>'hdate', ' אב ה׳תש', ' מנחם אב ה׳תש')))
 where data->>'hdate' like '% אב ה׳תש%'
   and data->>'hdate' not like '%מנחם אב%';

update tb_entries
   set data = jsonb_set(data, '{name}',
              to_jsonb(replace(data->>'name', ' אב ה׳תש', ' מנחם אב ה׳תש')))
 where data->>'name' like '% אב ה׳תש%'
   and data->>'name' not like '%מנחם אב%';

-- 2 · הרשומות שבתוך הסנאפשוט
-- ⚠️ המערך נבנה מחדש **בסדרו** — ⛔ `with ordinality` ו-`order by`:
--    ⭐ סדר הרשומות בסנאפשוט הוא מה שהמסך מציג, ⛔ ו-`jsonb_agg` בלי
--    סדר מוצהר אינו מבטיח אותו.
update tb_entries t
   set data = jsonb_set(t.data, '{entries}', (
         select coalesce(jsonb_agg(
                  case when e->>'hdate' like '% אב ה׳תש%'
                        and e->>'hdate' not like '%מנחם אב%'
                       then jsonb_set(e, '{hdate}', to_jsonb(
                              replace(e->>'hdate', ' אב ה׳תש', ' מנחם אב ה׳תש')))
                       else e end
                order by ord), '[]'::jsonb)
           from jsonb_array_elements(t.data->'entries') with ordinality as a(e, ord)))
 where jsonb_typeof(t.data->'entries') = 'array'
   and exists (select 1 from jsonb_array_elements(t.data->'entries') x(e)
                where x.e->>'hdate' like '% אב ה׳תש%'
                  and x.e->>'hdate' not like '%מנחם אב%');
