-- 020_drop_legacy_kv_entries_archive.sql · רצה ואומתה במסד ב-2026-09-25
-- סבב 191 — המפתחות `entries` ו-`archive` בטבלאות ההגדרות מסומנים מחוקים
-- ⛔ רצה במסד «הישיבה» לפני מיזוג הקוד — ⚠️ אף קוד אינו קורא אותם, ⭐ וכל תוכנם ב-`ya_entries`
--    פרט לרשומה אחת, ⛔ שיורדת בהחלטת המנהל.
-- ⛔ מחיקה רכה ולא `delete` — ⚠️ המצבה היא מה שמגיע לכל מכשיר.

begin;

update ya_settings_rishon    set deleted = true, deleted_at = now(), deleted_by = 'סבב 191',
  updated_at = (extract(epoch from clock_timestamp())*1000)::bigint
  where key in ('entries','archive') and not deleted;
update ya_settings_ramataviv set deleted = true, deleted_at = now(), deleted_by = 'סבב 191',
  updated_at = (extract(epoch from clock_timestamp())*1000)::bigint
  where key in ('entries','archive') and not deleted;

commit;
