-- Places: the user's global collection, and which places belong to which trip.
--
-- Everything here is user-owned content (name, area/address text, notes the
-- user typed). No third-party place data (e.g. Google) is stored. A later
-- migration may add an optional provider place id, which the terms allow.
--
-- Same conventions as the foundation migration: private `app` schema, UUIDs,
-- created_at/updated_at/version via app.touch_row(), soft delete with
-- deleted_at, RLS per owner, no DELETE privilege for `authenticated`.

-- ---------------------------------------------------------------------------
-- places
-- ---------------------------------------------------------------------------
create table app.places (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references app.profiles (id) on delete cascade,
  name text not null,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  constraint places_name_valid check (
    char_length(name) between 1 and 120 and name = btrim(name)
  ),
  constraint places_address_valid check (
    address is null
    or (char_length(address) between 1 and 200 and address = btrim(address))
  ),
  constraint places_notes_valid check (
    notes is null or char_length(notes) between 1 and 2000
  ),
  constraint places_version_positive check (version > 0)
);

comment on table app.places is
  'A place in the user''s global collection. User-entered text only. Owner: owner_id = auth.uid().';

create index places_owner_active_idx
  on app.places (owner_id, created_at desc)
  where deleted_at is null;

create trigger places_touch
before update on app.places
for each row execute function app.touch_row();

-- ---------------------------------------------------------------------------
-- trip_places: a place added to a trip. One row per (trip, place); removing
-- sets deleted_at, adding again clears it.
-- ---------------------------------------------------------------------------
create table app.trip_places (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references app.profiles (id) on delete cascade,
  trip_id uuid not null references app.trips (id) on delete cascade,
  place_id uuid not null references app.places (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  constraint trip_places_unique unique (trip_id, place_id),
  constraint trip_places_version_positive check (version > 0)
);

comment on table app.trip_places is
  'Places added to a trip. Owner: owner_id = auth.uid(), and the trip and place must be theirs.';

create index trip_places_trip_active_idx
  on app.trip_places (trip_id, created_at)
  where deleted_at is null;

create index trip_places_place_idx on app.trip_places (place_id);

create trigger trip_places_touch
before update on app.trip_places
for each row execute function app.touch_row();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table app.places enable row level security;
alter table app.trip_places enable row level security;

create policy places_select_own on app.places
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy places_insert_own on app.places
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

create policy places_update_own on app.places
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy trip_places_select_own on app.trip_places
  for select to authenticated
  using ((select auth.uid()) = owner_id);

-- A link can only join the caller's own trip to the caller's own place.
create policy trip_places_insert_own on app.trip_places
  for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from app.trips t where t.id = trip_id and t.owner_id = (select auth.uid()))
    and exists (select 1 from app.places p where p.id = place_id and p.owner_id = (select auth.uid()))
  );

create policy trip_places_update_own on app.trip_places
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- ---------------------------------------------------------------------------
-- Privileges
-- ---------------------------------------------------------------------------
revoke all on app.places, app.trip_places from public, anon;
grant select, insert, update on app.places, app.trip_places to authenticated;
grant all on app.places, app.trip_places to service_role;
