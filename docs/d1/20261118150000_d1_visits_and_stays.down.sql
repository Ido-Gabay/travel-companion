-- ---------------------------------------------------------------------------
-- D1 · ROLLBACK for supabase/migrations/20261118150000_d1_visits_and_stays.sql
--
-- Reviewed rollback, NOT part of the migration chain (it lives in docs/ so
-- `supabase db push` never runs it). Run only with the owner's approval.
--
-- Safety:
--   - Refuses to run while any user data exists only in the D1 structures
--     (visits or stays created or edited after the migration, custom-place
--     coordinates, linked Google IDs, trip time zones). Export or decide first;
--     forcing requires: set app.d1_down_force = 'on' in the same session.
--   - Removes only the hotel places this migration created (recorded in
--     app.d1_backfill_created_places), and only when no trip saved them since.
--   - Never touches legacy columns; they were kept current by the mirror.
-- ---------------------------------------------------------------------------

do $$
declare
  reasons text[] := '{}';
begin
  if exists (select 1 from app.trip_stops where not from_legacy) then
    reasons := array_append(reasons, 'visits created after the migration');
  end if;
  if exists (select 1 from app.trip_stops where from_legacy and version > 1) then
    reasons := array_append(reasons, 'migrated visits edited after the migration');
  end if;
  if exists (select 1 from app.trip_stays where not from_legacy or version > 1) then
    reasons := array_append(reasons, 'stays created or edited after the migration');
  end if;
  if exists (select 1 from app.places where latitude is not null or linked_google_place_id is not null) then
    reasons := array_append(reasons, 'custom-place coordinates or linked Google IDs');
  end if;
  if exists (select 1 from app.trips where time_zone is not null) then
    reasons := array_append(reasons, 'trip time zones');
  end if;
  if cardinality(reasons) > 0 and coalesce(current_setting('app.d1_down_force', true), '') <> 'on' then
    raise exception 'D1 rollback refused: data exists only in D1 structures (%). Export it first, or set app.d1_down_force = on.',
      array_to_string(reasons, '; ');
  end if;
end;
$$;

drop trigger if exists trip_stops_mirror_legacy on app.trip_stops;
drop view if exists app.place_visits;
drop table if exists app.trip_stays;
drop table if exists app.trip_stops;

delete from app.places p
using app.d1_backfill_created_places c
where p.id = c.place_id
  and not exists (select 1 from app.trip_places tp where tp.place_id = p.id);
drop table if exists app.d1_backfill_created_places;

drop function if exists app.d1_trip_stops_mirror();

alter table app.trip_places drop constraint if exists trip_places_id_trip_unique;
comment on table app.trip_places is
  'Places added to a trip. Owner: owner_id = auth.uid(), and the trip and place must be theirs.';

alter table app.trips
  drop constraint if exists trips_time_zone_source_valid,
  drop constraint if exists trips_time_zone_format,
  drop column if exists time_zone_source,
  drop column if exists time_zone;

alter table app.places
  drop constraint if exists places_linked_google_place_id_valid,
  drop constraint if exists places_linked_google_custom_only,
  drop constraint if exists places_location_custom_only,
  drop constraint if exists places_location_not_null_island,
  drop constraint if exists places_location_range,
  drop constraint if exists places_location_pair,
  drop column if exists linked_google_place_id,
  drop column if exists longitude,
  drop column if exists latitude;
comment on column app.places.visited_at is null;

delete from supabase_migrations.schema_migrations where version = '20261118150000';
