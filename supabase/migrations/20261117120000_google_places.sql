-- Google places in the collection, categories, tags, visited, and usage caps.
--
-- Google Maps Platform terms: we may store the Google place ID indefinitely,
-- but not Google's names, addresses, ratings, photos, etc. So a Google place
-- row holds ONLY the place ID plus the user's own data (category, notes, tags,
-- visited, trips). The app fetches fresh details from Google for display.
-- Custom places (typed in by the user) keep their own name/address as before.

alter table app.places alter column name drop not null;

alter table app.places
  add column google_place_id text,
  add column category text not null default 'other',
  add column tags text[] not null default '{}',
  add column visited_at timestamptz;

alter table app.places
  -- Exactly one source: a Google place ID, or a user-typed name.
  add constraint places_one_source check ((google_place_id is null) <> (name is null)),
  -- Never store Google-controlled text on Google places.
  add constraint places_google_has_no_copied_text check (
    google_place_id is null or (name is null and address is null)
  ),
  add constraint places_google_place_id_valid check (
    google_place_id is null or google_place_id ~ '^[A-Za-z0-9_-]{10,300}$'
  ),
  add constraint places_category_valid check (
    category in ('food', 'coffee', 'sights', 'shopping', 'nightlife', 'outdoors', 'stay', 'other')
  ),
  add constraint places_tags_valid check (cardinality(tags) <= 10);

-- One collection entry per Google place per user (deleted rows are revived on re-save).
create unique index places_owner_google_uidx
  on app.places (owner_id, google_place_id)
  where google_place_id is not null;

comment on column app.places.google_place_id is
  'Google place ID (storable indefinitely per Google terms). Name/address/location are fetched fresh, never stored.';
comment on column app.places.category is 'User-owned category (our own list), not Google data.';

-- ---------------------------------------------------------------------------
-- provider_usage: daily request counters for paid third-party APIs. The API
-- refuses calls once a day's cap is reached so usage stays inside the free
-- monthly allowances. Written only by the API's service connection.
-- ---------------------------------------------------------------------------
create table app.provider_usage (
  day date not null,
  metric text not null,
  count integer not null default 0,
  primary key (day, metric),
  constraint provider_usage_count_nonnegative check (count >= 0)
);

comment on table app.provider_usage is
  'Per-day request counts for Google Places / Claude, used to enforce cost caps. No user data.';

alter table app.provider_usage enable row level security;
revoke all on app.provider_usage from public, anon, authenticated;
grant all on app.provider_usage to service_role;
