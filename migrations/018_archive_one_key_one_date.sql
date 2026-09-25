-- 018_archive_one_key_one_date.sql · רצה ואומתה במסד ב-2026-09-25
-- סבב 190 — ארכיון היומן: פורמט תאריך אחד, מפתח יום אחד, createdAt לכל רשומה
-- ⛔ רצה במסד «הישיבה» לפני מיזוג הקוד — ⚠️ הקוד החדש נשען על הנתונים המלאים.
-- ⭐ יום שמשנה מפתח נוצר מחדש במפתח הנכון, והישן מקבל מצבת מחיקה —
--    המצבה מוחקת אותו גם מכל מכשיר במשיכה הבאה.

begin;

create temp table _now on commit drop as
  select (extract(epoch from clock_timestamp()) * 1000)::bigint as ts;

create temp table _m (name text, num int) on commit drop;
insert into _m values ('ינואר',1),('פברואר',2),('מרץ',3),('אפריל',4),('מאי',5),('יוני',6),
  ('יולי',7),('אוגוסט',8),('ספטמבר',9),('אוקטובר',10),('נובמבר',11),('דצמבר',12);

-- א · 2 ביולי 2026 — העותק בלי התאריך הוא השלם (376 רשומות, והחדשות יותר):
--     הרשומות מתאחדות לשורה עם התאריך, לפי מזהה, והגרסה החדשה מנצחת
with a as (select data->'entries' e from ya_entries where client_id = 'rishon:i:1783407198980'),
     b as (select data->'entries' e from ya_entries where client_id = 'rishon:g:2 יולי 2026'),
     ea as (select x, x->>'id' id, ord from a, jsonb_array_elements(a.e) with ordinality t(x, ord)),
     eb as (select x, x->>'id' id from b, jsonb_array_elements(b.e) t(x)),
     u as (
       select ea.ord,
              case when eb.x is not null and coalesce((eb.x->>'updatedAt')::bigint,0) > coalesce((ea.x->>'updatedAt')::bigint,0)
                   then eb.x else ea.x end as x
       from ea left join eb on eb.id = ea.id
       union all
       select 1000000 + row_number() over (), eb.x from eb where not exists (select 1 from ea where ea.id = eb.id)
     )
update ya_entries set
  data = data || jsonb_build_object(
           'entries', (select jsonb_agg(x order by ord) from u),
           'count',   (select count(*) from u),
           'updatedAt', coalesce((data->>'updatedAt')::bigint,0) + 1),
  updated_at = (select ts from _now), synced_at = now()
where client_id = 'rishon:g:2 יולי 2026';

-- ב · עותקים ישנים וכפולים — מצבת מחיקה:
--     ראשון בלי תאריך (הגרסה המתוקנת קיימת עם תאריך) · ו-2 ביולי שאוחד
--     ורמת אביב — ארבעה ימים של ראשון שהועתקו אליה, אותן רשומות בדיוק
update ya_entries set deleted = true, deleted_at = (select ts from _now), deleted_by = 'סבב 190',
  updated_at = (select ts from _now), synced_at = now()
where not deleted and client_id in (
  'rishon:i:3000076','rishon:i:3000077','rishon:i:3000078','rishon:i:3000079',
  'rishon:i:1776402448823','rishon:i:1773858450911','rishon:i:1780785962499','rishon:i:1783407198980',
  'ramataviv:g:30 נובמבר 2025','ramataviv:g:27 נובמבר 2025','ramataviv:g:26 נובמבר 2025','ramataviv:g:25 נובמבר 2025');

-- ג · מפתח חדש לכל יום שאינו בפורמט של היום:
--     5 ימי אלול (תאריך עברי בלבד — מאומת מול יום השבוע שבשורה)
--     ו-81 ימים בפורמט מספרי (d/mm/yyyy · d/m/yyyy)
create temp table _rekey (old_id text, newg text) on commit drop;
insert into _rekey values
  ('rishon:i:3000080','27 אוגוסט 2025'),   -- יום רביעי ג׳ אלול ה׳תשפ״ה
  ('rishon:i:3000081','28 אוגוסט 2025'),   -- יום חמישי ד׳ אלול ה׳תשפ״ה
  ('rishon:i:3000082','31 אוגוסט 2025'),   -- יום ראשון ז׳ אלול ה׳תשפ״ה
  ('rishon:i:3000083','1 ספטמבר 2025'),    -- יום שני ח׳ אלול ה׳תשפ״ה
  ('rishon:i:3000084','2 ספטמבר 2025');    -- יום שלישי ט׳ אלול ה׳תשפ״ה
insert into _rekey
  select client_id,
         split_part(gdate,'/',1)::int::text || ' ' ||
         (select name from _m where num = split_part(gdate,'/',2)::int) || ' ' ||
         split_part(gdate,'/',3)
  from ya_entries
  where archived and not deleted and gdate ~ '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$';

insert into ya_entries (client_id, yeshiva, rec_key, updated_at, deleted, data, synced_at, archived, gdate, deleted_at, deleted_by)
select s.yeshiva || ':g:' || r.newg, s.yeshiva, 'g:' || r.newg, (select ts from _now), false,
       s.data || jsonb_build_object('gdate', r.newg, 'date', r.newg,
                                    'updatedAt', coalesce((s.data->>'updatedAt')::bigint,0) + 1),
       now(), true, r.newg, null, null
from _rekey r join ya_entries s on s.client_id = r.old_id
on conflict (client_id) do update set
  deleted = false, deleted_at = null, deleted_by = null,
  data = excluded.data, gdate = excluded.gdate, rec_key = excluded.rec_key,
  archived = true, updated_at = excluded.updated_at, synced_at = excluded.synced_at;

update ya_entries set deleted = true, deleted_at = (select ts from _now), deleted_by = 'סבב 190',
  updated_at = (select ts from _now), synced_at = now()
where client_id in (select old_id from _rekey) and not deleted;

-- ד · createdAt לכל רשומה בתוך ימי הארכיון — המזהה הישן הוא חותמת היצירה,
--     אותו ערך שהסדר משתמש בו היום; ו-updatedAt מתקדם באחד כדי שהענן ינצח במיזוג
update ya_entries set
  data = data || jsonb_build_object(
    'entries', (select jsonb_agg(
                  case when x->>'id' ~ '^[0-9]+$' and not (x ? 'createdAt')
                       then x || jsonb_build_object('createdAt', (x->>'id')::bigint,
                                                    'updatedAt', coalesce((x->>'updatedAt')::bigint,0) + 1)
                       else x end order by ord)
                from jsonb_array_elements(data->'entries') with ordinality t(x, ord)),
    'updatedAt', coalesce((data->>'updatedAt')::bigint,0) + 1),
  updated_at = (select ts from _now), synced_at = now()
where archived and not deleted
  and exists (select 1 from jsonb_array_elements(coalesce(data->'entries','[]'::jsonb)) x
              where x->>'id' ~ '^[0-9]+$' and not (x ? 'createdAt'));

commit;
