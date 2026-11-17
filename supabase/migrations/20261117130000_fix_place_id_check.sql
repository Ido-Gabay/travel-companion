-- Fix: Postgres regular expressions allow repetition counts up to 255 only.
-- The previous check used {10,300}, which failed at runtime ("invalid
-- repetition count") the first time a Google place ID was saved.
-- Google place IDs are ~27 characters; 255 is plenty.

alter table app.places drop constraint places_google_place_id_valid;

alter table app.places
  add constraint places_google_place_id_valid check (
    google_place_id is null or google_place_id ~ '^[A-Za-z0-9_-]{10,255}$'
  );
