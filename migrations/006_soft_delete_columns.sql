-- ============================================================================
-- 006_soft_delete_columns.sql — השלמת עמודות המחיקה הרכה
-- ============================================================================
--
-- ⛔⛔ **נכתב ולא רץ.** ⛔ ההרצה היא פעולת מנהל, ⛔ ואין להריץ מתוך סשן.
--
-- ⭐ **מה משתנה:** כל טבלה שנושאת `deleted` מקבלת גם `deleted_at` ו-`deleted_by`.
--    ⚠️ `deleted` לבדה מוחקת בלי לתעד מי ומתי — ⛔ ואין ממה לשחזר כשמתברר
--    שהמחיקה הייתה שגויה.
--
-- ⚠️ **הטיפוס של `deleted_at` הוא הטיפוס של `updated_at` באותה טבלה** —
--    ⛔ הבדל מכוון: החותמת כאן היא מילישניות מהמכשיר ב-`bigint`, ⛔ ו-`timestamptz` היה מפתח הכרעה בסולם שני.
--
-- ⛔ **אידמפוטנטי** — `add column if not exists`, ⚠️ והרצה חוזרת אינה משנה דבר.
-- ⛔ **ואינו ממלא ערך לשורות קיימות** — ⚠️ `null` הוא «לא נבדק», ⭐ וערך שהומצא
--    בדיעבד היה נקרא כעדות.
-- ============================================================================

alter table public.tb_entries add column if not exists deleted_at bigint;
alter table public.tb_entries add column if not exists deleted_by text;

alter table public.tb_archive add column if not exists deleted_at bigint;
alter table public.tb_archive add column if not exists deleted_by text;
