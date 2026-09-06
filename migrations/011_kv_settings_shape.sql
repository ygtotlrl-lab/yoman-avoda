-- ============================================================================
-- 011_kv_settings_shape.sql — שתי טבלאות ההגדרות בצורה המשותפת
-- ============================================================================
--
-- ⛔ **רץ במסד.**
--
-- ⛔⛔ **מה הקובץ עושה:** ⚠️ מוסיף ל-`kv_rishon` ול-`kv_ramataviv` את
--    `client_id` ואת שלישיית המחיקה הרכה — `deleted` · `deleted_at` ·
--    `deleted_by`.
--
-- ⛔⛔ **הנימוק:** ⚠️ ארבע טבלאות הגדרות בארבע צורות אינן ניתנות להצלבה,
--    ⭐ ו**מחיקת מפתח היא חותמת ולא היעדר**: ⛔ בלי השלישייה מפתח שנמחק
--    במכשיר אחד נראה לשני כ«אין לי», ⚠️ והוא מחזיר אותו.
--
-- ⚠️ **והעמודות נוספות בסוף** — ⛔ ולא באמצע: ⭐ סדר העמודות של טבלת
--    ההגדרות המשותפת הוא `key` · `value` · `updated_at` · `client_id`
--    ואז השלישייה, ⛔ והוספה בסוף היא בדיוק מה ששומר עליו.
--
-- ⛔ **נמדד לפני השינוי:** ⚠️ 7 שורות בכל אחת מהשתיים.
-- ============================================================================

do $$
declare t text;
begin
  foreach t in array array['kv_rishon','kv_ramataviv'] loop
    execute format('alter table public.%I add column if not exists client_id  text', t);
    execute format('alter table public.%I add column if not exists deleted    boolean not null default false', t);
    execute format('alter table public.%I add column if not exists deleted_at timestamptz', t);
    execute format('alter table public.%I add column if not exists deleted_by text', t);
  end loop;
end $$;
