-- ---------------------------------------------------------------------------
-- Itinerary: a place in a trip can be planned for one day of the trip, with
-- an optional start time and an order within that day.
--
--   day is null        -> the place is on the trip's wishlist (not planned yet)
--   day is set         -> the place is planned for that calendar day
--   position           -> order within the day (0, 1, 2, ...)
--   start_time         -> optional, e.g. 09:30 for a breakfast reservation
--
-- The API checks that day is inside the trip's dates, and moves places back
-- to the wishlist when the trip's dates change and leave their day outside.
-- ---------------------------------------------------------------------------
alter table app.trip_places
  add column day date,
  add column start_time time(0),
  add column position integer not null default 0;

alter table app.trip_places
  add constraint trip_places_position_nonnegative check (position >= 0),
  add constraint trip_places_time_needs_day check (start_time is null or day is not null);

comment on column app.trip_places.day is
  'Calendar day this place is planned for, or null when it is only on the wishlist.';
comment on column app.trip_places.start_time is
  'Optional planned start time on that day (local time at the destination).';
comment on column app.trip_places.position is
  'Order within the day, starting at 0.';

create index trip_places_trip_day_idx
  on app.trip_places (trip_id, day, position)
  where deleted_at is null;
