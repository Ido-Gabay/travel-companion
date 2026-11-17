-- ---------------------------------------------------------------------------
-- Live Today (M9): how long the user plans to stay at a planned stop.
-- Null means "use the default for the place's category" (decided in the app),
-- so existing rows need no backfill. Used for free-time and leave-by estimates.
-- ---------------------------------------------------------------------------
alter table app.trip_places
  add column duration_minutes integer,
  add constraint trip_places_duration_range
    check (duration_minutes is null or (duration_minutes between 5 and 720));

comment on column app.trip_places.duration_minutes is
  'Planned visit length in minutes (5-720), or null for the category default.';
