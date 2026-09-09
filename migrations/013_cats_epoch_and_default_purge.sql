-- ============================================================================
-- 013_cats_epoch_and_default_purge.sql — עידן ל-`tb_cats`, וניקוי מה שהמיזוג החזיר
-- ============================================================================
--
-- ⛔ **רץ במסד.**
--
-- ⛔⛔ **מה הקובץ עושה:** ⚠️ (א) גורע מ-`kv_rishon.tb_cats` את עשר המשימות
--    שהוזרקו בכל טעינה מתוך אוסף קבוע שבקוד, ⛔ ו-(ב) קובע `tb_cats_epoch`
--    בשני המוסדות — ⭐ המספר שמכשיר מיושן זורק מולו את העותק המקומי שלו.
--
-- ⛔⛔ **הנימוק:** ⚠️ האוסף הקבוע ירד מהקוד בסבב הקודם, ⛔ אבל תיקון בקוד
--    אינו מנקה מכשיר שכבר מזוהם: ⭐ מכשיר שמחזיק את המשימות ממזג אותן
--    לענן בכל מחזור, ⛔ והענן מחזיר אותן לכל השאר. ⚠️ **והעידן הוא הכלי
--    היחיד שמגיע אל אותו מכשיר מהענן** — ⭐ הוא זורק את הרשימה המקומית
--    ומושך מלא, ⛔ בלי מיזוג ובלי דחיפה.
--
-- ⛔ **והשניים באותה כתיבה** — ⚠️ גריעה בלי עידן היא מיזוג שמחזיר את
--    המשימות תוך שניות, ⭐ ועידן בלי גריעה מפיץ את הזיהום עצמו.
--
-- ⚠️ **ואין כאן תמונות-קבר** — ⛔ העידן זורק את הרשימה כולה, ⭐ ולכן אין
--    היעדר שמכשיר יקרא כ«אין לי».
--
-- ⛔ **נמדד לפני השינוי:** ⚠️ `tb_cats_epoch` אינו קיים באף אחד מהשניים;
--    ⭐ `tb_subs_epoch` קיים בשניהם בערך 1; ⛔ ולעשר המשימות **אפס**
--    מפתחות תת-משימה ב-`tb_subs`, ⚠️ ולכן אין מה לגרוע שם.
--
-- ⛔ **ורמת אביב אינה נגרעת** — ⚠️ נמדד שהקטגוריות שלה הן שלה, ⭐ והעידן
--    נקבע גם שם כדי שהמנגנון יהיה דרוך בשני המוסדות.
-- ============================================================================

-- ── א · גריעת עשר המשימות מ-`kv_rishon.tb_cats` ────────────────────────────
with kill(letter, task) as (values
  ('ב','אסיפת תקציב'), ('ב','עמותה'), ('ב','תזרים תקציבי'),
  ('ד','סטטוס'), ('ד','גיליונות חודשיים'),
  ('ה','קליטת רישום'), ('ה','הנפקות גירסא'), ('ה','זימון לאסיפות'),
  ('ו','רכש'), ('ח','חבד אל נידו')
), cleaned as (
  select jsonb_agg(
           case when c.x ? 'tasks'
                then jsonb_set(c.x, '{tasks}', coalesce((
                       select jsonb_agg(t.v order by t.o)
                       from jsonb_array_elements_text(c.x->'tasks') with ordinality t(v, o)
                       where not exists (select 1 from kill k
                                         where k.letter = c.x->>'letter' and k.task = t.v)
                     ), '[]'::jsonb))
                else c.x end
           order by c.o) as v
  from public.kv_rishon k, jsonb_array_elements(k.value::jsonb) with ordinality c(x, o)
  where k.key = 'tb_cats'
)
update public.kv_rishon k
   set value = (select v::text from cleaned),
       updated_at = (extract(epoch from now()) * 1000)::bigint
 where k.key = 'tb_cats';

-- ── ב · העידן — ⛔ אחרי הגריעה, ⚠️ ובאותה טרנזקציה ──────────────────────────
insert into public.kv_rishon (key, value, updated_at)
values ('tb_cats_epoch', '1', (extract(epoch from now()) * 1000)::bigint)
on conflict (key) do update
  set value = excluded.value, updated_at = excluded.updated_at;

insert into public.kv_ramataviv (key, value, updated_at)
values ('tb_cats_epoch', '1', (extract(epoch from now()) * 1000)::bigint)
on conflict (key) do update
  set value = excluded.value, updated_at = excluded.updated_at;
