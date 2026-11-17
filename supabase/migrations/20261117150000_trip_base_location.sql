-- Where the user is staying on a trip (hotel name or area), typed by the user.
-- Used to resolve "near my hotel" requests without a clarification question.

alter table app.trips add column base_location text;

alter table app.trips
  add constraint trips_base_location_valid check (
    base_location is null
    or (char_length(base_location) between 1 and 200 and base_location = btrim(base_location))
  );

comment on column app.trips.base_location is 'User-entered hotel or area for this trip (user-owned text).';
