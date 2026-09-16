-- ============================================================================
-- 017_prefix_from_repo_name.sql — תחילית הטבלאות נגזרת משם הריפו
-- ============================================================================
--
-- ⛔ **רצה במסד** — ⚠️ הוחלה בסבב 148 ואומתה: ⭐ אפס אובייקט בשם ישן
--    ב-`pg_class`, ⛔ ו-99 מפתחות גיבוי שנשאו `tb_` נכתבו מחדש.
--
-- ⛔⛔ **מה הקובץ עושה:** ⚠️ מסב את שלוש טבלאות היומן מ-`tb_` ל-`ya_` —
--    ⭐ ראשי התיבות של `yoman-avoda`: ⛔ `rename` אינו העתקה, ⚠️ והנתונים,
--    האינדקסים, האילוצים והמדיניות נשמרים · ⛔ **ושתי טבלאות ההגדרות מקבלות
--    את תפקידן בשמן** — ⚠️ `kv` הוא המימוש ⛔ ולא התפקיד: ⭐ `ya_settings_rishon`
--    ו-`ya_settings_ramataviv`, ⛔ והתוספת אחרי התפקיד נגזרת מפיצול מוצרי
--    מוצהר — ⚠️ ליומן שתי ישיבות ולשאר אחת.
--
-- ⛔⛔ **הנימוק:** ⚠️ תחילית שאינה נגזרת משם הריפו אינה ניתנת לניחוש —
--    ⭐ ומי שמחפש את טבלאות היומן אינו יודע ש-`tb` הוא «טבלה»: ⛔ והשם
--    שנבחר פעם אחת חי בכל שאילתה, בכל מפתח גיבוי, ובכל מפתח אחסון מקומי.
--
-- ⛔ **ואין כאן מחיקת נתונים** — ⚠️ אפס `delete`, ⛔ ואפס `drop`.
-- ⚠️ **ובמסד רצה יחד עם המיגרציה המקבילה של ההנהלה, בעסקה אחת** — ⛔ שם ישן
--    ברשימת-ההיתר של הפינוי לרגע אחד הוא פינוי מושהה.
-- ============================================================================

alter table if exists public.tb_kv_rishon     rename to ya_settings_rishon;
alter table if exists public.tb_kv_ramataviv  rename to ya_settings_ramataviv;
alter table if exists public.tb_entries       rename to ya_entries;

-- ⛔ האילוצים והאינדקסים נגזרים ⛔ ואינם מוקלדים — ⚠️ `rename to` על טבלה
--    אינו נוגע בהם, ⭐ ושם אילוץ שנשאר ישן הוא השם היחיד שהמסד עוד נוקב בו.
--    ⛔ **והאילוץ קודם לאינדקס** — ⚠️ שינוי שם אילוץ משנה גם את האינדקס
--    שמגבה אותו, ⭐ והלולאה השנייה מוצאת רק את מה שנותר.
do $$
declare r record; nn text;
begin
  for r in
    select c.conname, c.conrelid::regclass::text rel
      from pg_constraint c
      join pg_namespace n on n.oid = c.connamespace
     where n.nspname = 'public' and c.conname like 'tb\_%'
  loop
    nn := replace(r.conname, 'tb_', 'ya_');
    execute format('alter table public.%I rename constraint %I to %I', r.rel, r.conname, nn);
  end loop;
  for r in
    select indexname from pg_indexes
     where schemaname = 'public' and indexname like 'tb\_%'
  loop
    nn := replace(r.indexname, 'tb_', 'ya_');
    execute format('alter index public.%I rename to %I', r.indexname, nn);
  end loop;
end $$;

-- ⛔ שתי המדיניות נושאות את שם הטבלה בשמן — ⚠️ ושם המימוש שירד איתו.
alter policy kv_rishon_all    on public.ya_settings_rishon    rename to ya_settings_rishon_all;
alter policy kv_ramataviv_all on public.ya_settings_ramataviv rename to ya_settings_ramataviv_all;

-- ⛔ מפתחות הגיבוי — ⚠️ שלושה מבני מפתח: `<טבלה>` · `<מוסד>_<טבלה>` · ועם
--    קידומת `ANCHOR:` · `DIFF:` · `pre-…:` — ⭐ ו-`replace` תופס את שלושתם.
update public.sh_backup set key = replace(key, 'tb_', 'ya_') where key like '%tb\_%';
