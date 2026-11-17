-- Phase 1 foundation: private `app` schema with profiles, preferences and trips.
--
-- Design notes
-- * `app` is NOT in the Data API's exposed schemas, so the publishable key in the
--   mobile app cannot read these tables directly. All access goes through NestJS.
-- * RLS is still enabled on every table as defense in depth. NestJS runs each
--   user request inside a transaction as the `authenticated` role with the
--   caller's JWT claims set, so these policies apply to API queries too.
-- * Every row has stable UUIDs, created_at/updated_at, a `version` counter and
--   (where rows can be removed) `deleted_at` for soft deletes. These columns are
--   what a future sync layer (PowerSync) needs; nothing else is built for it yet.

create schema if not exists app;

revoke all on schema app from public;
revoke all on schema app from anon;
grant usage on schema app to authenticated;
grant usage on schema app to service_role;

-- ---------------------------------------------------------------------------
-- Shared trigger: keep updated_at, version and created_at honest on update.
-- ---------------------------------------------------------------------------
create or replace function app.touch_row()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := old.created_at;
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user.
-- ---------------------------------------------------------------------------
create table app.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  constraint profiles_display_name_valid check (
    display_name is null
    or (char_length(display_name) between 1 and 80 and display_name = btrim(display_name))
  ),
  constraint profiles_version_positive check (version > 0)
);

comment on table app.profiles is 'Application profile for each auth user. Owner: the user (id = auth.uid()).';

create trigger profiles_touch
before update on app.profiles
for each row execute function app.touch_row();

-- ---------------------------------------------------------------------------
-- user_preferences: one row per profile.
-- ---------------------------------------------------------------------------
create table app.user_preferences (
  user_id uuid primary key references app.profiles (id) on delete cascade,
  locale text not null default 'en',
  distance_unit text not null default 'km',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint user_preferences_locale_valid check (locale in ('en', 'he')),
  constraint user_preferences_distance_unit_valid check (distance_unit in ('km', 'mi')),
  constraint user_preferences_version_positive check (version > 0)
);

comment on table app.user_preferences is 'Per-user app settings. Owner: the user (user_id = auth.uid()).';

create trigger user_preferences_touch
before update on app.user_preferences
for each row execute function app.touch_row();

-- ---------------------------------------------------------------------------
-- trips: owned by one user. Sharing/collaboration is out of scope for now.
-- ---------------------------------------------------------------------------
create table app.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references app.profiles (id) on delete cascade,
  title text not null,
  destination text,
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  constraint trips_title_valid check (
    char_length(title) between 1 and 120 and title = btrim(title)
  ),
  constraint trips_destination_valid check (
    destination is null
    or (char_length(destination) between 1 and 120 and destination = btrim(destination))
  ),
  constraint trips_dates_ordered check (
    start_date is null or end_date is null or end_date >= start_date
  ),
  constraint trips_version_positive check (version > 0)
);

comment on table app.trips is 'A user''s trip. Owner: owner_id = auth.uid(). Soft-deleted via deleted_at.';

create index trips_owner_active_idx
  on app.trips (owner_id, start_date)
  where deleted_at is null;

create trigger trips_touch
before update on app.trips
for each row execute function app.touch_row();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Users can read, create and update only their own rows. There are no DELETE
-- policies: profiles go away with the auth user, trips are soft-deleted.
-- ---------------------------------------------------------------------------
alter table app.profiles enable row level security;
alter table app.user_preferences enable row level security;
alter table app.trips enable row level security;

create policy profiles_select_own on app.profiles
  for select to authenticated
  using ((select auth.uid()) = id);

create policy profiles_insert_own on app.profiles
  for insert to authenticated
  with check ((select auth.uid()) = id);

create policy profiles_update_own on app.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create policy user_preferences_select_own on app.user_preferences
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy user_preferences_insert_own on app.user_preferences
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy user_preferences_update_own on app.user_preferences
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy trips_select_own on app.trips
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy trips_insert_own on app.trips
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy trips_update_own on app.trips
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- Privileges. anon gets nothing; authenticated gets no DELETE.
-- ---------------------------------------------------------------------------
revoke all on all tables in schema app from public, anon;
grant select, insert, update on app.profiles, app.user_preferences, app.trips to authenticated;
grant all on all tables in schema app to service_role;

revoke all on function app.touch_row() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Create profile + preferences whenever an auth user is created.
-- display_name is taken from sign-up metadata when present and valid.
-- ---------------------------------------------------------------------------
create or replace function app.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_name text := nullif(
    btrim(left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 80)),
    ''
  );
begin
  insert into app.profiles (id, display_name)
  values (new.id, requested_name)
  on conflict (id) do nothing;

  insert into app.user_preferences (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

revoke all on function app.handle_new_auth_user() from public, anon, authenticated;

create trigger app_on_auth_user_created
after insert on auth.users
for each row execute function app.handle_new_auth_user();

-- Backfill users that existed before this migration.
insert into app.profiles (id)
select id from auth.users
on conflict (id) do nothing;

insert into app.user_preferences (user_id)
select id from app.profiles
on conflict (user_id) do nothing;
