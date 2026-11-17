-- ---------------------------------------------------------------------------
-- 1. The trip's hotel as a Google place. base_location stays the user's own
--    words (sent to the AI); base_google_place_id pins the exact place so
--    "near my hotel" searches around its real location. Only the place ID is
--    stored (Google allows storing place IDs); name and location are fetched
--    fresh from Google when needed.
-- ---------------------------------------------------------------------------
alter table app.trips
  add column base_google_place_id text,
  add constraint trips_base_google_place_id_format
    check (base_google_place_id is null or base_google_place_id ~ '^[A-Za-z0-9_-]{10,255}$');

comment on column app.trips.base_google_place_id is
  'Google place ID of where the user stays (pinned hotel). Only the ID is stored.';

-- ---------------------------------------------------------------------------
-- 2. Monthly usage lookups for cost caps and the usage report.
-- ---------------------------------------------------------------------------
create index if not exists provider_usage_metric_day_idx on app.provider_usage (metric, day);
