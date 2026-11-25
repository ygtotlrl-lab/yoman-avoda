-- migrations/000_schema.sql — יומן עבודה: הסכימה החיה

-- ── יומן עבודה ──

create table if not exists public.ya_entries (
  client_id text not null,
  yeshiva text not null,
  updated_at bigint not null,
  deleted boolean not null default false,
  data jsonb not null,
  archived boolean not null default false,
  deleted_at timestamp with time zone,
  deleted_by text,
  entry_date date,
  created_at timestamp with time zone,
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

create table if not exists public.ya_users (
  client_id text not null,
  login text not null,
  full_name text not null,
  role text not null,
  active boolean not null default true,
  notify boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at bigint not null,
  constraint ya_users_pkey PRIMARY KEY (client_id),
  constraint ya_users_login_key UNIQUE (login),
  constraint ya_users_login_check CHECK ((login = lower(login))),
  constraint ya_users_role_check CHECK ((role = ANY (ARRAY['admin'::text, 'manager'::text, 'junior'::text])))
);

create index if not exists ya_entries_yeshiva_archived_client_idx ON public.ya_entries USING btree (yeshiva, archived, client_id);
create index if not exists ya_entries_yeshiva_archived_updated_idx ON public.ya_entries USING btree (yeshiva, archived, updated_at DESC);
create index if not exists ya_entries_yeshiva_updated_idx ON public.ya_entries USING btree (yeshiva, updated_at DESC);

CREATE OR REPLACE FUNCTION public.ya_is_user()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ select exists (select 1 from public.ya_users u where u.login = lower(auth.jwt() ->> 'email') and u.active) $function$;
revoke all on function public.ya_is_user() from public, anon, authenticated, service_role;
grant execute on function public.ya_is_user() to authenticated, service_role;

-- revoke לפני grant — GRANT מוסיף ואינו מחליף, וטבלה חדשה ב-Supabase נולדת עם DELETE ו-TRUNCATE ל-anon.
revoke all on table public.ya_entries from anon, authenticated;
grant select, insert, update on table public.ya_entries to anon, authenticated;
grant all on table public.ya_entries to service_role;
revoke all on table public.ya_settings_ramataviv from anon, authenticated;
grant select, insert, update on table public.ya_settings_ramataviv to anon, authenticated;
grant all on table public.ya_settings_ramataviv to service_role;
revoke all on table public.ya_settings_rishon from anon, authenticated;
grant select, insert, update on table public.ya_settings_rishon to anon, authenticated;
grant all on table public.ya_settings_rishon to service_role;
revoke all on table public.ya_users from anon, authenticated;
grant select on table public.ya_users to authenticated;
grant all on table public.ya_users to service_role;

alter table public.ya_entries enable row level security;
drop policy if exists ya_entries_users on public.ya_entries;
create policy ya_entries_users on public.ya_entries as permissive for all to authenticated using (ya_is_user()) with check (ya_is_user());
alter table public.ya_settings_ramataviv enable row level security;
drop policy if exists ya_settings_ramataviv_users on public.ya_settings_ramataviv;
create policy ya_settings_ramataviv_users on public.ya_settings_ramataviv as permissive for all to authenticated using (ya_is_user()) with check (ya_is_user());
alter table public.ya_settings_rishon enable row level security;
drop policy if exists ya_settings_rishon_users on public.ya_settings_rishon;
create policy ya_settings_rishon_users on public.ya_settings_rishon as permissive for all to authenticated using (ya_is_user()) with check (ya_is_user());
alter table public.ya_users enable row level security;
drop policy if exists ya_users_select on public.ya_users;
create policy ya_users_select on public.ya_users as permissive for select to authenticated using (ya_is_user());

drop trigger if exists ya_entries_history on public.ya_entries;
create trigger ya_entries_history AFTER INSERT OR DELETE OR UPDATE ON public.ya_entries FOR EACH ROW EXECUTE FUNCTION sh_history_log('client_id');
drop trigger if exists ya_settings_ramataviv_history on public.ya_settings_ramataviv;
create trigger ya_settings_ramataviv_history AFTER INSERT OR DELETE OR UPDATE ON public.ya_settings_ramataviv FOR EACH ROW EXECUTE FUNCTION sh_history_log('key');
drop trigger if exists ya_settings_rishon_history on public.ya_settings_rishon;
create trigger ya_settings_rishon_history AFTER INSERT OR DELETE OR UPDATE ON public.ya_settings_rishon FOR EACH ROW EXECUTE FUNCTION sh_history_log('key');
drop trigger if exists ya_users_history on public.ya_users;
create trigger ya_users_history AFTER INSERT OR DELETE OR UPDATE ON public.ya_users FOR EACH ROW EXECUTE FUNCTION sh_history_log('client_id');
