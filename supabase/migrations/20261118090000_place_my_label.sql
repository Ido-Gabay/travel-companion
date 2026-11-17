-- ---------------------------------------------------------------------------
-- M12a: the user's own short label for a place ("Grandma's favorite bakery").
-- Typed by the user only; the app never fills it from Google data. Shown when
-- Google details can't be loaded (offline), since Google names may not be stored.
-- Nullable, no backfill; older apps simply don't send or read it.
-- ---------------------------------------------------------------------------
alter table app.places
  add column my_label text,
  add constraint places_my_label_valid
    check (my_label is null or (char_length(my_label) between 1 and 60 and my_label = btrim(my_label)));

comment on column app.places.my_label is
  'User-provided label (1-60 chars, trimmed). Never populated from Google content.';
