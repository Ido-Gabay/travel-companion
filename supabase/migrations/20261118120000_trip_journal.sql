-- ---------------------------------------------------------------------------
-- M15 trip journal.
-- 1. trip_places.highlight: the user starred a stop as a trip highlight.
-- 2. app.trip_journal_days: the user's note and 1-5 rating for one trip day.
--    One row per (trip, day); created on first write. User content only.
-- ---------------------------------------------------------------------------
alter table app.trip_places
  add column highlight boolean not null default false;

comment on column app.trip_places.highlight is 'User starred this stop as a trip highlight (M15).';

create table app.trip_journal_days (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references app.profiles (id) on delete cascade,
  trip_id uuid not null references app.trips (id) on delete cascade,
  day date not null,
  note text,
  rating smallint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint trip_journal_days_unique unique (trip_id, day),
  constraint trip_journal_days_note_valid
    check (note is null or (char_length(note) between 1 and 4000 and note = btrim(note))),
  constraint trip_journal_days_rating_range check (rating is null or rating between 1 and 5),
  constraint trip_journal_days_version_positive check (version > 0)
);

comment on table app.trip_journal_days is
  'Trip journal: the user''s note and rating per trip day. Owner: owner_id = auth.uid(), trip must be theirs.';

create index trip_journal_days_trip_idx on app.trip_journal_days (trip_id, day);

create trigger trip_journal_days_touch
before update on app.trip_journal_days
for each row execute function app.touch_row();

alter table app.trip_journal_days enable row level security;

create policy trip_journal_days_select_own on app.trip_journal_days
  for select to authenticated
  using ((select auth.uid()) = owner_id);

create policy trip_journal_days_insert_own on app.trip_journal_days
  for insert to authenticated
  with check (
    (select auth.uid()) = owner_id
    and exists (select 1 from app.trips t where t.id = trip_id and t.owner_id = (select auth.uid()))
  );

create policy trip_journal_days_update_own on app.trip_journal_days
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

revoke all on app.trip_journal_days from public, anon;
grant select, insert, update on app.trip_journal_days to authenticated;
grant all on app.trip_journal_days to service_role;
