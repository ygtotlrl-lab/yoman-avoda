-- 019_deleted_at_timestamptz.sql · רצה ואומתה במסד ב-2026-09-25
-- סבב 191 — `deleted_at` הוא `timestamptz`, ⭐ ונכתב בכל מחיקה
-- ⛔ רצה במסד «הישיבה» לפני מיזוג הקוד — ⚠️ הקוד כותב ISO, ⭐ ועמודת `bigint` הייתה דוחה אותו.
-- ⭐ שורה מחוקה בלי זמן מחיקה מקבלת את `updated_at` שלה — ⛔ חותמת המצבה היא רגע המחיקה.

begin;

alter table ya_entries alter column deleted_at type timestamptz
  using case when deleted_at is null then null else to_timestamp(deleted_at / 1000.0) end;
update ya_entries set deleted_at = to_timestamp(updated_at / 1000.0)
  where deleted and deleted_at is null;

commit;
