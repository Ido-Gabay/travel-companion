-- ---------------------------------------------------------------------------
-- D1 · Data model V2 — EXPAND + BACKFILL (additive only).
--
-- What this adds:
--   1. app.places: user-owned coordinates (custom places only) and an optional
--      link to a Google place ID for "Use my own pin" places.
--   2. app.trips: a trip default time zone (+ where it came from).
--   3. app.trip_places: unique (id, trip_id), so visits can reference their
--      trip membership with a composite key. trip_places = "saved to this trip".
--   4. app.trip_stops (new): one row per visit. A place saved to a trip can be
--      visited 0..n times; each visit has its own lifecycle and time zone.
--   5. app.trip_stays (new): where the user sleeps, by nights, per trip.
--   6. app.place_visits (view): visit history, derived, never stored.
--   7. A compatibility mirror: while the legacy itinerary columns on
--      trip_places still exist, every visit change refreshes them from the
--      membership's earliest active visit, so older API/app builds keep reading
--      a truthful single-visit view (removed by the later contract migration).
--   8. Backfill from the legacy columns (see section 9).
--
-- What this never does:
--   - drop, rename or rewrite any existing column or row;
--   - change places.visited_at (it stays the legacy "marked visited" value);
--   - store Google content (only Google place IDs, as before).
--
-- Rollback: docs/d1/20261118150000_d1_visits_and_stays.down.sql (reviewed, not
-- part of the migration chain).
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. places: user-owned location for custom places
-- ---------------------------------------------------------------------------
alter table app.places
  add column latitude double precision,
  add column longitude double precision,
  add column linked_google_place_id text;

alter table app.places
  add constraint places_location_pair check ((latitude is null) = (longitude is null)),
  add constraint places_location_range check (
    latitude is null or (latitude between -90 and 90 and longitude between -180 and 180)
  ),
  add constraint places_location_not_null_island check (
    latitude is null or not (latitude = 0 and longitude = 0)
  ),
  -- Google places never carry stored coordinates (Google content is fetched live).
  add constraint places_location_custom_only check (latitude is null or google_place_id is null),
  -- "Use my own pin": a custom place may point back to a Google place by ID only.
  add constraint places_linked_google_custom_only check (
    linked_google_place_id is null or google_place_id is null
  ),
  add constraint places_linked_google_place_id_valid check (
    linked_google_place_id is null or linked_google_place_id ~ '^[A-Za-z0-9_-]{10,255}$'
  );

comment on column app.places.latitude is
  'User-owned latitude for a custom place, chosen by the user on a map. Never a Google coordinate.';
comment on column app.places.longitude is
  'User-owned longitude for a custom place, chosen by the user on a map. Never a Google coordinate.';
comment on column app.places.linked_google_place_id is
  'Optional Google place ID a custom place was created from ("Use my own pin"). ID only.';
comment on column app.places.visited_at is
  'Legacy "marked visited" (first time, still marked). Kept as-is by D1; visits from trips live in app.trip_stops.';

-- ---------------------------------------------------------------------------
-- 2. trips: default time zone
-- ---------------------------------------------------------------------------
alter table app.trips
  add column time_zone text,
  add column time_zone_source text;

alter table app.trips
  add constraint trips_time_zone_format check (
    time_zone is null or time_zone ~ '^(UTC|[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+){1,2})$'
  ),
  add constraint trips_time_zone_source_valid check (
    (time_zone is null) = (time_zone_source is null)
    and (time_zone_source is null or time_zone_source in ('derived', 'user'))
  );

comment on column app.trips.time_zone is
  'Trip default IANA time zone. derived = from user-owned coordinates; user = chosen or confirmed by the user.';

-- ---------------------------------------------------------------------------
-- 3. trip_places: membership ("saved to this trip")
-- ---------------------------------------------------------------------------
alter table app.trip_places
  add constraint trip_places_id_trip_unique unique (id, trip_id);

comment on table app.trip_places is
  'A place saved to a trip (membership). Independent of its visits: scheduling never removes it, removing a visit never deletes it. '
  'Legacy columns day/start_time/position/duration_minutes/highlight are read-only mirrors of the earliest active visit (D1) until the contract migration.';

-- ---------------------------------------------------------------------------
-- 4. trip_stops: visits
-- ---------------------------------------------------------------------------
create table app.trip_stops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references app.profiles (id) on delete cascade,
  trip_id uuid not null references app.trips (id) on delete cascade,
  trip_place_id uuid not null,
  day date not null,
  position integer not null default 0,
  start_time time(0),
  duration_minutes integer,
  time_zone text,
  status text not null default 'planned',
  arrived_at timestamptz,
  completed_at timestamptz,
  skipped_at timestamptz,
  completion_source text,
  highlight boolean not null default false,
  from_legacy boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  -- The visit's place must be saved to the same trip.
  constraint trip_stops_membership_fk foreign key (trip_place_id, trip_id)
    references app.trip_places (id, trip_id) on delete cascade,
  constraint trip_stops_position_nonnegative check (position >= 0),
  constraint trip_stops_duration_range check (duration_minutes is null or duration_minutes between 5 and 720),
  constraint trip_stops_time_zone_format check (
    time_zone is null or time_zone ~ '^(UTC|[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+){1,2})$'
  ),
  constraint trip_stops_status_valid check (status in ('planned', 'in_progress', 'completed', 'skipped')),
  constraint trip_stops_status_consistent check (
    case status
      when 'planned' then arrived_at is null and completed_at is null and skipped_at is null
      when 'in_progress' then arrived_at is not null and completed_at is null and skipped_at is null
      when 'completed' then completed_at is not null and skipped_at is null
      when 'skipped' then skipped_at is not null and completed_at is null
    end
  ),
  constraint trip_stops_completion_source_valid check (
    (completion_source is not null) = (status = 'completed')
    and (completion_source is null or completion_source in ('user', 'migrated'))
  ),
  constraint trip_stops_version_positive check (version > 0)
);

comment on table app.trip_stops is
  'A visit: an intention to be at a saved place on a day (planned), and what happened (in_progress, completed, skipped). '
  'Removal is a soft delete. Owner: owner_id = auth.uid(); the trip and membership must be theirs.';
comment on column app.trip_stops.time_zone is
  'IANA zone of the visit, stored only when derived from user-owned coordinates or confirmed by the user.';
comment on column app.trip_stops.from_legacy is 'Created by the D1 backfill from a legacy scheduled trip_places row.';

create index trip_stops_trip_day_idx on app.trip_stops (trip_id, day, position) where deleted_at is null;
create index trip_stops_trip_place_idx on app.trip_stops (trip_place_id);
create index trip_stops_completed_idx on app.trip_stops (owner_id, completed_at)
  where status = 'completed' and deleted_at is null;

create trigger trip_stops_touch
before update on app.trip_stops
for each row execute function app.touch_row();

-- ---------------------------------------------------------------------------
-- 5. trip_stays: accommodation by nights
-- ---------------------------------------------------------------------------
create table app.trip_stays (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references app.profiles (id) on delete cascade,
  trip_id uuid not null references app.trips (id) on delete cascade,
  place_id uuid references app.places (id) on delete cascade,
  label text,
  check_in date,
  check_out date,
  time_zone text,
  time_zone_source text,
  time_zone_dataset text,
  from_legacy boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  deleted_at timestamptz,
  -- Same rule as trips.base_location, so the user's "Staying at" text moves unchanged.
  constraint trip_stays_label_valid check (
    label is null or (char_length(label) between 1 and 200 and label = btrim(label))
  ),
  constraint trip_stays_has_place_or_label check (place_id is not null or label is not null),
  -- Both dates or neither (neither = the whole trip). Nights are [check_in, check_out).
  constraint trip_stays_dates_valid check (
    (check_in is null and check_out is null)
    or (check_in is not null and check_out is not null and check_out > check_in)
  ),
  constraint trip_stays_time_zone_format check (
    time_zone is null or time_zone ~ '^(UTC|[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+){1,2})$'
  ),
  constraint trip_stays_time_zone_source_valid check (
    (time_zone is null) = (time_zone_source is null)
    and (time_zone_source is null or time_zone_source in ('derived', 'user'))
  ),
  constraint trip_stays_time_zone_dataset_valid check (
    time_zone_dataset is null or (time_zone_source = 'derived' and time_zone_dataset ~ '^[0-9]{4}[a-z]$')
  ),
  constraint trip_stays_version_positive check (version > 0)
);

comment on table app.trip_stays is
  'Where the user stays during a trip, by nights [check_in, check_out); no dates = the whole trip. '
  'label = the user''s own "Staying at" text. Owner: owner_id = auth.uid(); the trip (and place) must be theirs.';

create index trip_stays_trip_idx on app.trip_stays (trip_id, check_in) where deleted_at is null;
create index trip_stays_place_idx on app.trip_stays (place_id);

create trigger trip_stays_touch
before update on app.trip_stays
for each row execute function app.touch_row();

-- ---------------------------------------------------------------------------
-- 6. Row Level Security (owner-only; no delete policies: soft delete)
-- ---------------------------------------------------------------------------
alter table app.trip_stops enable row level security;
alter table app.trip_stays enable row level security;

create policy trip_stops_select_own on app.trip_stops
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy trip_stops_insert_own on app.trip_stops
  for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from app.trips t where t.id = trip_id and t.owner_id = (select auth.uid()))
    and exists (
      select 1 from app.trip_places tp
      where tp.id = trip_place_id and tp.trip_id = trip_stops.trip_id and tp.owner_id = (select auth.uid())
    )
  );

create policy trip_stops_update_own on app.trip_stops
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

create policy trip_stays_select_own on app.trip_stays
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy trip_stays_insert_own on app.trip_stays
  for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from app.trips t where t.id = trip_id and t.owner_id = (select auth.uid()))
    and (place_id is null or exists (select 1 from app.places p where p.id = place_id and p.owner_id = (select auth.uid())))
  );

create policy trip_stays_update_own on app.trip_stays
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check (
    (select auth.uid()) = owner_id
    and (place_id is null or exists (select 1 from app.places p where p.id = place_id and p.owner_id = (select auth.uid())))
  );

revoke all on app.trip_stops, app.trip_stays from public, anon;
grant select, insert, update on app.trip_stops, app.trip_stays to authenticated;
grant all on app.trip_stops, app.trip_stays to service_role;

-- ---------------------------------------------------------------------------
-- 7. Visit history view (derived; RLS applies to the caller)
-- ---------------------------------------------------------------------------
create view app.place_visits with (security_invoker = true) as
  select s.owner_id, tp.place_id, s.trip_id, s.id as stop_id, s.day, s.completed_at,
         'visit'::text as source
  from app.trip_stops s
  join app.trip_places tp on tp.id = s.trip_place_id
  where s.status = 'completed' and s.deleted_at is null
  union all
  -- The legacy mark, unless a migrated visit already carries exactly that moment.
  select p.owner_id, p.id as place_id, null::uuid, null::uuid, null::date, p.visited_at,
         'legacy_mark'::text
  from app.places p
  where p.visited_at is not null
    and p.deleted_at is null
    and not exists (
      select 1 from app.trip_stops s
      join app.trip_places tp on tp.id = s.trip_place_id
      where tp.place_id = p.id
        and s.completion_source = 'migrated'
        and s.completed_at = p.visited_at
        and s.deleted_at is null
    );

comment on view app.place_visits is
  'Visit history per place: completed visits (including those of deleted trips) plus the legacy mark when no migrated visit explains it.';

revoke all on app.place_visits from public, anon;
grant select on app.place_visits to authenticated;
grant select on app.place_visits to service_role;

-- ---------------------------------------------------------------------------
-- 8. Compatibility mirror (legacy trip_places itinerary columns)
--    Refreshes the membership's legacy columns from its earliest active visit,
--    and only when a value actually changes (no version bump otherwise).
--    With no active visit the legacy row is unscheduled the way the old API
--    did it (day, start_time cleared; position 0); duration and highlight kept.
-- ---------------------------------------------------------------------------
-- Runs as the caller (RLS applies to the trip_places update: the caller owns
-- the membership, as enforced on the visit). No nested function call, so no
-- EXECUTE grant to `authenticated` is needed.
create or replace function app.d1_trip_stops_mirror()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  memberships uuid[] := '{}';
  membership uuid;
  first_stop record;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    memberships := memberships || old.trip_place_id;
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.trip_place_id <> old.trip_place_id) then
    memberships := memberships || new.trip_place_id;
  end if;

  foreach membership in array memberships loop
    select s.day, s.start_time, s.position, s.duration_minutes, s.highlight
      into first_stop
    from app.trip_stops s
    where s.trip_place_id = membership and s.deleted_at is null
    order by s.day, s.position, s.created_at, s.id
    limit 1;

    if found then
      update app.trip_places tp
         set day = first_stop.day,
             start_time = first_stop.start_time,
             position = first_stop.position,
             duration_minutes = first_stop.duration_minutes,
             highlight = first_stop.highlight
       where tp.id = membership
         and (tp.day, tp.start_time, tp.position, tp.duration_minutes, tp.highlight)
             is distinct from
             (first_stop.day, first_stop.start_time, first_stop.position, first_stop.duration_minutes, first_stop.highlight);
    else
      -- No active visit: unscheduled the way the old API did it; duration and highlight kept.
      update app.trip_places tp
         set day = null, start_time = null, position = 0
       where tp.id = membership
         and (tp.day is not null or tp.start_time is not null or tp.position <> 0);
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function app.d1_trip_stops_mirror() from public, anon, authenticated;

create trigger trip_stops_mirror_legacy
after insert or update or delete on app.trip_stops
for each row execute function app.d1_trip_stops_mirror();

-- ---------------------------------------------------------------------------
-- 9. Backfill (runs once, inside this migration)
-- ---------------------------------------------------------------------------

-- 9a. Places this migration creates, so the reviewed down script can remove
--     exactly these and nothing else. Service-only bookkeeping, no user content.
create table app.d1_backfill_created_places (
  place_id uuid primary key references app.places (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table app.d1_backfill_created_places enable row level security;
revoke all on app.d1_backfill_created_places from public, anon, authenticated;
grant all on app.d1_backfill_created_places to service_role;

-- 9b. Visits: one per scheduled, non-deleted membership (any trip, deleted
--     trips included so nothing is lost). Completed only when unambiguous:
--     the place has exactly one scheduled membership across all trips, the
--     trip has dates, and the legacy mark's UTC date is within the trip
--     (+/- 1 day for time zones). Otherwise planned; the legacy mark is kept.
insert into app.trip_stops (
  owner_id, trip_id, trip_place_id, day, position, start_time, duration_minutes, highlight,
  status, completed_at, completion_source, from_legacy
)
select
  tp.owner_id, tp.trip_id, tp.id, tp.day, tp.position, tp.start_time, tp.duration_minutes, tp.highlight,
  case when attach.ok then 'completed' else 'planned' end,
  case when attach.ok then p.visited_at end,
  case when attach.ok then 'migrated' end,
  true
from app.trip_places tp
join app.trips t on t.id = tp.trip_id
join app.places p on p.id = tp.place_id
cross join lateral (
  select (
    p.visited_at is not null
    and t.start_date is not null and t.end_date is not null
    and (p.visited_at at time zone 'UTC')::date between t.start_date - 1 and t.end_date + 1
    and (
      select count(*) from app.trip_places o
      where o.place_id = tp.place_id and o.day is not null and o.deleted_at is null
    ) = 1
  ) as ok
) attach
where tp.day is not null and tp.deleted_at is null;

-- 9c. Hotel places for trips that pinned a Google hotel and don't have it in
--     the collection yet (any state). Created as category 'stay' (shown under
--     the Stays filter). Soft-deleted when every trip using it is deleted.
with needed as (
  select t.owner_id, t.base_google_place_id as gid,
         case when bool_or(t.deleted_at is null) then null else max(t.deleted_at) end as deleted_at
  from app.trips t
  where t.base_google_place_id is not null
    and not exists (
      select 1 from app.places p
      where p.owner_id = t.owner_id and p.google_place_id = t.base_google_place_id
    )
  group by t.owner_id, t.base_google_place_id
),
created as (
  insert into app.places (owner_id, google_place_id, category, deleted_at)
  select owner_id, gid, 'stay', deleted_at from needed
  returning id
)
insert into app.d1_backfill_created_places (place_id) select id from created;

-- 9d. Stays: one per trip with a pinned hotel or "Staying at" text, deleted
--     trips included (soft-deleted with the trip). The label is the user's
--     text, unchanged. Nights = trip dates; a one-day or undated trip gets a
--     whole-trip stay (no dates).
insert into app.trip_stays (owner_id, trip_id, place_id, label, check_in, check_out, from_legacy, deleted_at)
select
  t.owner_id, t.id,
  (select p.id from app.places p
    where p.owner_id = t.owner_id and p.google_place_id = t.base_google_place_id),
  t.base_location,
  case when t.end_date > t.start_date then t.start_date end,
  case when t.end_date > t.start_date then t.end_date end,
  true,
  t.deleted_at
from app.trips t
where t.base_google_place_id is not null or t.base_location is not null;

-- 9e. Invariants: abort the whole migration if any fails.
do $$
declare
  scheduled bigint;
  backfilled bigint;
  bad bigint;
begin
  select count(*) into scheduled from app.trip_places where day is not null and deleted_at is null;
  select count(*) into backfilled from app.trip_stops where from_legacy;
  if scheduled <> backfilled then
    raise exception 'D1 backfill: % scheduled memberships but % visits', scheduled, backfilled;
  end if;

  select count(*) into bad from app.trips t
  where (t.base_google_place_id is not null or t.base_location is not null)
    and (select count(*) from app.trip_stays s where s.trip_id = t.id and s.from_legacy) <> 1;
  if bad > 0 then
    raise exception 'D1 backfill: % trips without exactly one legacy stay', bad;
  end if;

  select count(*) into bad from app.trip_stays s join app.trips t on t.id = s.trip_id
  where s.from_legacy and s.label is distinct from t.base_location;
  if bad > 0 then
    raise exception 'D1 backfill: % stay labels differ from the trip''s Staying at text', bad;
  end if;

  select count(*) into bad from app.trip_stays s join app.trips t on t.id = s.trip_id
  where s.from_legacy and t.base_google_place_id is not null
    and (s.place_id is null or not exists (
      select 1 from app.places p where p.id = s.place_id and p.google_place_id = t.base_google_place_id));
  if bad > 0 then
    raise exception 'D1 backfill: % stays do not point to their trip''s hotel', bad;
  end if;

  select count(*) into bad from app.trip_stops s
  join app.trip_places tp on tp.id = s.trip_place_id
  where s.from_legacy and (s.day, s.position, s.start_time, s.duration_minutes, s.highlight)
    is distinct from (tp.day, tp.position, tp.start_time, tp.duration_minutes, tp.highlight);
  if bad > 0 then
    raise exception 'D1 backfill: % visits differ from their legacy rows', bad;
  end if;
end;
$$;
