-- ═══ 000_schema.sql — יומן עבודה: הסכימה החיה ══════════════════════════

-- ─── יומן עבודה ────────────────────────────────────────────────────────

create table if not exists public.ya_entries (
  client_id text not null,
  yeshiva text not null,
  rec_key text not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  data jsonb not null,
  synced_at timestamp with time zone not null default now(),
  archived boolean not null default false,
  gdate text,
  deleted_at timestamp with time zone,
  deleted_by text,
  constraint ya_entries_pkey PRIMARY KEY (client_id)
);

create table if not exists public.ya_settings_ramataviv (
  key text not null,
  value text,
  updated_at bigint not null,
  client_id text,
  deleted boolean not null default false,
  deleted_at timestamp with time zone,
  deleted_by text,
  constraint ya_settings_ramataviv_pkey PRIMARY KEY (key),
  constraint ya_settings_ramataviv_value_json CHECK (((value IS NULL) OR ((value)::jsonb IS NOT NULL)))
);

create table if not exists public.ya_settings_rishon (
  key text not null,
  value text,
  updated_at bigint not null,
  client_id text,
  deleted boolean not null default false,
  deleted_at timestamp with time zone,
  deleted_by text,
  constraint ya_settings_rishon_pkey PRIMARY KEY (key),
  constraint ya_settings_rishon_value_json CHECK (((value IS NULL) OR ((value)::jsonb IS NOT NULL)))
);

create index if not exists ya_entries_yeshiva_archived_key ON public.ya_entries USING btree (yeshiva, archived, rec_key);
create index if not exists ya_entries_yeshiva_archived_updated_idx ON public.ya_entries USING btree (yeshiva, archived, updated_at DESC);
create UNIQUE index if not exists ya_entries_yeshiva_rec_key ON public.ya_entries USING btree (yeshiva, rec_key);
create index if not exists ya_entries_yeshiva_updated_idx ON public.ya_entries USING btree (yeshiva, updated_at DESC);

-- ⛔ revoke לפני grant — GRANT מוסיף ואינו מחליף, וטבלה חדשה ב-Supabase נולדת
--    עם DELETE ו-TRUNCATE ל-anon: המחיקה היא deleted=true, ולא DELETE.
revoke all on table public.ya_entries from anon, authenticated;
grant select, insert, update on table public.ya_entries to anon, authenticated;
grant all on table public.ya_entries to service_role;
revoke all on table public.ya_settings_ramataviv from anon, authenticated;
grant select, insert, update on table public.ya_settings_ramataviv to anon, authenticated;
grant all on table public.ya_settings_ramataviv to service_role;
revoke all on table public.ya_settings_rishon from anon, authenticated;
grant select, insert, update on table public.ya_settings_rishon to anon, authenticated;
grant all on table public.ya_settings_rishon to service_role;

alter table public.ya_entries enable row level security;
drop policy if exists ya_entries_all on public.ya_entries;
create policy ya_entries_all on public.ya_entries as permissive for all to anon, authenticated using (true) with check (true);
alter table public.ya_settings_ramataviv enable row level security;
drop policy if exists ya_settings_ramataviv_all on public.ya_settings_ramataviv;
create policy ya_settings_ramataviv_all on public.ya_settings_ramataviv as permissive for all to anon, authenticated using (true) with check (true);
alter table public.ya_settings_rishon enable row level security;
drop policy if exists ya_settings_rishon_all on public.ya_settings_rishon;
create policy ya_settings_rishon_all on public.ya_settings_rishon as permissive for all to anon, authenticated using (true) with check (true);
