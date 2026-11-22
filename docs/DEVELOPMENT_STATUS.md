# Development status

**Last updated: 2026-11-21 (D1 committed `b692bb1`, migrated, pushed and deployed).**
Update this file at the end of every milestone or meaningful change.

## Snapshot

- **2026-11-21 (supersedes the older lines below):** everything (M15, U2, M16, D1, U3–U5,
  import/link places, CSV picker) is committed as `b692bb1` and pushed to `main`.
  `npx supabase migration list --linked` showed all migrations through `20261118120000`
  applied; only `20261118150000_d1_visits_and_stays` was pending. Backup taken first
  (`psql \copy` of the 7 `app` tables to `~/travel-companion-backups/before-d1-20261121/`,
  because `supabase db dump` needs Docker); dry run listed only D1; applied with
  `npx supabase db push --remote --yes`. Backfill check: 12 visits = 12 scheduled
  memberships, 15 stays, 38 trips. Rollback: `docs/d1/20261118150000_d1_visits_and_stays.down.sql`.
  Render deployed: `/health` → `{"status":"ok"}`; new routes `POST /v1/places/:id/google`
  and `POST /v1/assistant/extract-places` return 401 without auth (a fake route returns 404).
  **Not run:** `pnpm smoke:api` against production (needs the test user's password;
  owner runs `API_URL=https://travel-companion-api-joqe.onrender.com pnpm smoke:api`).
  **Native rebuild required** (expo-document-picker, expo-file-system). GitHub CI result not checked.

- **Last commit seen on the Mac:** `9560555` "M14: screen tests + CI"; tag `trip-safe` = `37dbf49` (M12a).
- **Uncommitted when this was written:** M15 stage 1 (shared, API, app, migration `20261118120000_trip_journal`), U2 (map-first Today, app only), M16 (Routes API: shared, API, app) and these doc updates. Commit them together (see Exact next steps, step 0).
- **Native build:** the iOS project was regenerated after M10 (contains
  `expo-notifications`, entitlements empty = no push). M11 needs no native rebuild.
- **Current milestone:** M13 written. Still open: owner verification of M12a (migration
  push, deploy, airplane-mode checklist) and M13, then the iPhone Release install
  (R1, Nov 21–22). Neither adds a native dependency: no rebuild. If M13 isn't
  verified in time, install the `trip-safe` commit instead.
- **Trip:** New York, Nov 23–29, 2026. Install the Release build on Nov 21–22.

## What works (verified by the owner)

- Sign up/in, profile, language en/he with RTL, distance unit.
- Trips (create/edit/delete, dates, "Staying at"), places collection, trip wishlist.
- Discover (M8): Google-first search, categories, areas incl. pinned hotel and
  near me, map + "Search this area", place preview with rating/hours/photos,
  Ask AI with clarification, save to collection/wishlist with dedupe.
- Itinerary (M6), trip mode on Home (M7), cost caps + usage screen (M8).
- API deployed on Render; `pnpm smoke:api` passed after M8 (owner).

## Written but not yet verified by the owner

| Item | What is still unverified |
| --- | --- |
| M9 Today v1 | Owner reported "implemented" and committed it; no written confirmation of the Simulator walkthrough, `pnpm test`, the migration push (`20261117220000_visit_duration`) or the smoke test after deploy. |
| M10 reminders | Native rebuild done. Not confirmed: permission prompt, test reminder, real leave reminder timing, tap → Today, re-sync after edits, sign-out cancel. |
| Trip time zone (`googlePlace.timeZone`) | Deployed with the M10 push if Render deployed it; not checked against the live API. Older servers omit it and the app falls back to the phone's zone. |
| M11 | Everything: vitest on the Mac, deploy, Simulator check of Today with a pinned hotel, attribution labels, photo links, rate limits against the live API. |
| U1 redesign | Everything visual: no screen was rendered. Typecheck and logic tests only. See the U1 checklist in "Exact next steps". |

## UX/UI audit pass (U4; written, uncommitted; Simulator checks pending)

Written 2026-11-19. App only (no API, schema, data or dependency change). Every screen was
reviewed; the changes below remove repetition and show details only when they matter.

- **Today:** Done never appears in a preview (it changed real data before); only one Done at a
  time (the visit happening now has its own); the time chip mentions location only when it is
  off (locating, far away, stale); a saved place nearby shows one action ("Add to today") plus a
  "…" menu (directions, place details); the location privacy line shows only before location is
  used; the bottom "Discover nearby" button and the long footnote are gone (Discover stays in the
  "…" menu and appears under free time when nothing fits; a short ≈ note shows only when a time is
  an estimate).
- **Plan sheet:** the legend and general limits wait behind "How this plan works"; the repeated
  "The plan below includes this" note is gone; day status aligns to the end in Hebrew too (was a
  hard-coded `right`). **Find a place:** after a pick the other matches collapse behind "Change";
  the results list now carries Google attribution.
- **Trip:** "Search places" / "From saved" removed from the trip "…" menu (the Add places button
  already offers them). Day picker shows the planned count only when a day has visits. Stay sheet
  shows the "every night no other stay covers" hint only when the trip has another stay.
- **Discover:** three AI examples instead of six; the preview's rate-limit note no longer talks
  about Google's free limit. **Usage:** SKU, price and cap lines behind one toggle. **Reminders:**
  shorter intro and footnote (en already shortened in the working tree; he footnote aligned in pass 2).
- **Shared:** `Button size="sm"` adds a 4pt vertical `hitSlop` (44pt target).

Tests (real runs, 2026-11-19): `pnpm typecheck` clean; app logic 246 passed (28 files); app
screens 55 passed (16 suites), then the two Today suites again (16 passed) after adding checks
(no Done in preview; the nearby row's "…" menu). API and shared not re-run (untouched).
Simulator: only the Home screen was seen (screenshot); nothing changed there.

**Second pass (2026-11-19):**

- **Home trip card (during the trip):** progress moved into the eyebrow ("Day 1 of 3 · Today · 1 of 3
  done"); the next stop is one tappable block (opens the place) with a "…" menu for Directions and
  Done; one primary button (Open Today) and a quiet "View itinerary" link.
- **Place details:** order is name/address → map + Directions → own pin → In trips → Your visits
  (history + the Visited switch) → My notes; label, category and (own places) name/address edit
  wait behind "Label, category and more".
- **Nearby on Today:** one entry, in the "…" menu (and under free time when nothing fits). Live it
  is "Find something nearby" (finder near you, added only through the preview + Apply); in a preview
  it opens Discover. "Something changed?" now holds only plan changes (closed, longer, skip, late).
  Discover itself stays reachable from the trip screen and the Discover tab.
- **Touch targets:** `compactHitSlop` on CategoryChips, Discover chips, TimeSheet chips, New trip
  neighborhood chips and reminder lead chips; "Open now" uses `hitSlop`; the itinerary time chip
  reaches 44pt; chip rows pad vertically so the target isn't clipped.
- **Tokens:** new `weights`, `compactHitSlop` and the colors listed in DESIGN_SYSTEM.md; literal
  colors/weights replaced in the files touched by U4.

Tests (real runs): `pnpm typecheck` clean; app logic 246 passed; app screens 57 passed in 16 suites
(new: Home next-stop menu marks Done offline; Today nearby entry only in "…"; Place details
"more" disclosure). Simulator: the Home trip card (during a trip, English, iPhone 15 Pro Max) was
seen in a screenshot after the change; its "…" menu, Place details, Today, chips and Hebrew/RTL
were not.

**Checks (Simulator, en + he, small and large iPhones):** Today live and preview (peek, chip,
nearby row menu), plan sheet "How this plan works", Find a place → pick → Change, trip "…"
menu, day picker, stay sheet, Discover AI examples, Usage toggle.

## Plan sheet compact + map in "Find on Google Maps" (written 2026-11-22, uncommitted; Simulator checks pending)

- **Find on Google Maps:** a List / Map switch once results are back. The map draws the results' own
  coordinates from the one search as numbered pins (the list is numbered the same) plus the trip's stay
  for reference (own pin or coordinates already saved on the phone; never a lookup). Tapping a pin shows
  that result under the map with Link. No extra Google call (`GoogleLinkSheet.tsx`, `useStayPin`).
- **Plan my entire trip:** each day is one list (`PlanVisitRow`): travel, time, name, tags; a proposed
  stop (new / moved here / added anyway) is its own on/off row, and a left-out one stays in its day with
  no time. Day pills (All days / each day) when there are 3+ days. "Doesn't fit (N)" is folded; open,
  one helper line and one row per place (name + "Add to Tue, Nov 24" or a short reason).
- **Start times:** "Start day one at 16:00 and the rest at 8" (also "the first day … the other days",
  Hebrew "היום הראשון … שאר הימים", and the same for finish times) now gives day one 16:00 and the other
  days 08:00 (`rules.ts` `firstAndRest`). Before, the whole clause became one start for every day.
  A time it can't read sends the message to the AI instead of guessing.

Tests (real runs, 2026-11-22): `pnpm typecheck` clean; shared 60; app logic 280 (+1 `rules.spec`, +1
`request.spec`); app screens 80 in 19 suites (new `google-link-map.test.tsx` ×2; `trip-plan.test.tsx`
+3: day pills, folded "Doesn't fit", day one 4 PM / other days 8 AM; existing ones updated for one row
per stop); API 193. The day-one screen test also ran against the old `rules.ts` and failed there.
App only (JS): no API deploy, no migration, no native rebuild; a new Release build is needed for the phone.

## Category on link + upcoming vs active trip (written 2026-11-22, uncommitted; Simulator checks pending)

- **Category on link:** `linkGooglePlaceSchema` gains optional `category`. The app sends
  `categoryForGoogleType(result.primaryType)` for the picked result (place details, trip Places menu)
  and import's linked rows save with it instead of `other`. Server (`PlacesService.linkGoogle`): it
  replaces only `other`; a chosen category stays (also when merging into an already-saved Google place).
  `saveGoogle`: saving an already-saved place again fills an `other` category, never a chosen one.
  No Google call, no migration. **The API must be deployed before the app** (the old API rejects the new
  field: strict schema → 400).
- **Upcoming vs active:** Home's `TripModeCard` re-derives the phase with the trip's own "today"
  (stored zone, else the hotel's) via `tripMode`, so a trip is active only once its first day has started
  where the trip is. Today's preview (before/after the trip or `preview=1`) shows the plan only: no
  progress, "You're at", "now" status, leave-by / "behind", late / may-not-fit hints or time-available
  suggestions; the next stop shows "Be there by". No new strings.

Tests (real runs, 2026-11-22): `pnpm typecheck` clean; shared 60; app logic 278 (+1 `itinerary.spec`
zone case); app screens 75 in 18 suites (+3: Today preview has no late/leave/progress/free time; Home
upcoming in the trip's zone while the phone's date is day 1; unclassified place shows Food after linking;
updated: link sends the category, import link saves `outdoors`); API 193 (+3 in `places-d1.spec.ts`).
The two new screen tests were also run against the old code and failed there. Not seen on a screen.

## Link places to Google Maps + Saved by trip (written 2026-11-21, uncommitted; Simulator checks pending)

- **API** `POST /v1/places/:id/google` `{ googlePlaceId }` (`linkGooglePlaceSchema`, `PlacesService.linkGoogle`):
  links one of the user's own places (saved by name, e.g. imported) to the Google place they picked.
  Not saved yet → the same row becomes the Google place (same id, trips and visits kept); the user's name
  becomes their label, their address goes to notes; Google text and location are never stored. Already
  saved (also deleted) → that row is revived and takes the trips, visits and stays; the own row is
  soft-deleted. Same ID again = no-op; another ID = 409. No migration (existing constraints hold).
- **App** `GoogleLinkSheet` (same search-and-pick as pinning a hotel; one Text Search only on tap,
  results primed into the details cache): "Link to Google Maps" on a place saved by name (place details,
  and the trip's Places row menu), and "Find on Google Maps" per row in Import's review (linked rows are
  saved with `saveGooglePlaces(tripId)`, the user's name/note kept as label/notes). Own pins are not offered.
- **Saved** tab: a "Show places from" pill (All saved places / a trip). A trip narrows the list to the
  places saved to it (from the trip detail, works from the saved copy); categories and map still apply.

Tests (real runs): typecheck clean; app logic 277; app screens 69 (new `place-link.test.tsx`: link from
the place, no link for Google places, Saved by trip; import: link a row → saved by Google ID, one search);
shared 60; API `places-d1.spec.ts` 9 (4 new: convert in place, merge into the saved Google place with
visits moved, revive a deleted one, another user's place = 404). Not seen on a screen.

## Import places (written 2026-11-20, uncommitted; Simulator checks pending)

Trip → Add places → "Import a list" (`app/trips/[id]/import.tsx`, modal). Two modes: paste a list
(default) or a Google Takeout saved-places CSV; then a review list (already in trip = shown, not
selectable; already in your places = reused; select all / clear) and "Add N places to wishlist".

- Reading: `features/places/place-import.ts` (+ spec): RFC 4180 CSV, Takeout headers in English
  (`Title`, `Note`, `Comment`) and Hebrew (`כותרת`, `הערה`, `תגובה`); the URL column is ignored; line or
  bullet lists, "name - note", "name (area)", one comma-separated line; dedupe by normalized name;
  matching against the user's places by their own names/labels (Google names only if already in memory).
- Free text (a chat message): one Claude call on tap, `POST /v1/assistant/extract-places`
  (`place-import.ts` contract in shared; `AiService.extractPlaces`, same `ai_interpret` caps and paid
  rate-limit class). The prompt forbids invented facts, and names not found in the text are dropped
  server-side. Offline / no AI → a message, the text stays, lists still work.
- Saving (`use-import-places.ts`): reuse the saved place or `createPlace` (name, note → notes, area →
  address, category other), then `addTripMember` (idempotent). Online, one at a time; a retry reuses
  places already created. No Google call anywhere in the flow.
- **Not done (needs the owner):** choosing a file directly needs `expo-document-picker` (a new native
  module + rebuild; P15 says no new native dependency before the trip), so the CSV mode asks the user
  to paste the file's contents. Imported places have no location; "Find locations" only resolves
  Google IDs, so resolving them by name would need Text Search per place (cost approval).
- **Update Nov 21:** "Choose CSV file" added (`expo-document-picker` ~58.0.5 + `expo-file-system`
  ~58.0.14, T20; `features/places/pick-csv.ts`): read on the phone, cancel = no change, unreadable / too
  big / not a Takeout list = a message, paste stays as fallback. **Native rebuild required**
  (`cd apps/mobile && npx expo prebuild --platform ios && cd ../.. && pnpm ios`). Places without a
  location are linked one by one with "Link to Google Maps" (see the section above).

Tests (real runs): typecheck clean; app logic 277 (12 new); app screens 65 (5 new: list import with
dedupe and no Google calls, AI message, offline, Hebrew CSV and a wrong CSV, retry without duplicates);
shared 60 (2 new); API 186 in 20 files (8 new in `extract-places.spec.ts`).
Not seen on a screen; the API on Render doesn't have the new route until deployed.

## Plan sheet redesign (U5; written, uncommitted; Simulator checks pending)

Written 2026-11-19. App only; the planner (`trip-plan.ts`, `smart-plan.ts`, `complete-plan.ts`),
the assistant, Find a place and the change queue are unchanged.

- `features/planning/PlanParts.tsx`: `Tag` (short pill), `LoadBar` (thin day-load bar with "3 h free"
  or "1 h over"; the "x of y planned" numbers are its VoiceOver label) and `ChangeRow` (a proposed change
  is a row with a check: included by default, one tap leaves it out and says "Left out"; reasons are tags
  such as "Near MoMA · 5 min", "−12 min travel", "You asked"). Replaces the switches in the trip plan sheet.
- `plan-summary.ts` (+ spec): `loadState`, `planOutcome`. The footer shows what saving does as tags
  ("+3 places", "1 moved", "4 time & order updates") above "Save to my itinerary" ("Update today" when
  replanning today; "Add X to Tue, Nov 24" when the plan is one new place).
- Day cards: day + one status tag (Too full / Better order / Past), one line (visits · travel · ends), the
  load bar, "Before: …" only when the day changes, its changes, then the visits with New / Moved / Done tags.
- Google lookups: one "For a sharper plan" row with "Find locations" and "Check opening hours" (tap only,
  no counts or quota copy); assumptions (no location, hours unknown), the legend and the rules moved behind
  "How this plan works". Find a place: day options as tags + load bar; no "one search" / lookup copy.

Tests (real runs): typecheck clean; app logic 262 (new `plan-summary.spec`); app screens 59 (plan, assistant,
replan, find-a-place and Today tests updated for the row control, the outcome footer and tags).

**"Start every day at …" fix (same day):** an earlier start than the usual 9:30 was ignored (`Math.max`
with the default); now any requested start is used (today never before a little after now). The note
now says what happened: suggested times move, or "all N visits already have a time", or nothing to change.
On a day where every open visit has a time, a `ChangeRow` (off by default) offers to move the whole day to
the new start, keeping the gaps (`DayShift`, `shiftKey`, sent as time changes through the queue).
Tests: app logic 265, app screens 60 (new: earlier start, the timed-day offer, never before now, and the
screen flow off → on → saved). Not seen on a screen.
Not run: anything on a screen. **Checks (Simulator, en + he, SE and Pro Max):** Plan my entire trip on a
busy trip (tags wrap, bar direction in Hebrew, footer above the home indicator and the keyboard), leave
a change out and back, Find a place day list, Today → Something changed? sheets.

## Fix: repeat visits and map numbering (2026-11-19; written, uncommitted)

**Root cause (reproduced on the local preview DB):** no place or membership was duplicated (the
unique indexes on `places (owner_id, google_place_id)` and `trip_places (trip_id, place_id)` held).
The day had 17 *visits* to 5 places: 14 extra visits created ~1 s apart from the "Add to day"
sheet. Each tap planned another visit (repeat visits are allowed by design, D1), the sheet stays
open, and a place just added moves to its "Visit again" group with no sign it was added. On the map,
every visit got its own marker, so several numbered markers sat on the same coordinates; their
key included the label, so a remount changed which one was drawn on top (the "jumping numbers").

**Fix:**
- `AddToDaySheet`: a place added in the sheet is marked "Added to this day" and further taps do
  nothing until the sheet is reopened; a second visit on a day that already has the place asks
  first ("Plan another visit"). Repeat visits stay possible.
- `features/trips/map-markers.ts` (+ spec): one marker per place (`place:<placeId>`, stable), carrying
  every visit's number in day order, labelled "1·6+2"; a repeated or missing visit id is never drawn
  twice; numbers are the list's numbers (position in the day).
- Itinerary `DayMap` uses it; the route line follows the visits (a return to a place is drawn).
  `PlacesMap` gets a `path` prop and a deterministic `zIndex` (earlier points on top).
- Today's map (`buildTodayMap`): one pin per spot standing for the visit that matters (now, next,
  later, done; ties by order), showing all its numbers; the dashed path keeps every open visit;
  `zIndex` by kind then order; VoiceOver adds "Also stop N of the day".
- Existing data was left untouched (extra visits are real records; remove them from the day's
  row menu if unwanted). Server idempotency was already in place (client visit ids, `on conflict`
  for places and memberships) and is now covered by tests.

Tests (real runs): typecheck clean; app logic 257 (new `map-markers.spec`, Today map repeat case);
app screens 59 (two new: repeat taps add once, offline; same-day second visit asks first); API 178
(four new in `v2.spec.ts`: same Google place twice, same custom place twice, same place in two trips,
two visits same day). Simulator (iPhone 15 Pro Max, English): the reported trip's day shows four
markers "1·6+2", "2·4+5", "3·9+2", "12·17", unchanged across two screenshots several seconds apart.
Not seen: Today's map, the add sheet's new states, Hebrew.

## New trip redesign (U3; written, uncommitted; Simulator checks pending)

Written 2026-11-19. App only (no API, schema or data change; `createTripSchema` and
`useCreateTrip` unchanged; Edit trip uses the same form without "Staying at").

- `features/trips/TripForm.tsx`: a ticket at the top ("Where to?" + a large destination input,
  a perforation, first and last day with the number of days); local destination suggestions
  while typing (`destinations.ts`: ~50 cities, en/he, free and offline, our own data → written as
  "New York, USA"; any other place can be typed); "When" with `DateRangePicker.tsx` (one month,
  Sunday first, band between the days, today underlined, clear dates; `date-range.ts` makes an
  end before the start impossible); "Where you're staying" (optional) with neighborhood chips for
  listed cities; "Trip name" suggested as "New York in November" until the user types one; the
  primary action pinned at the bottom, above the keyboard. Flat surfaces per DESIGN_SYSTEM.md.
- No Google lookup is made for the destination (no cost, nothing from Google stored).

Tests (real runs, 2026-11-19): `pnpm typecheck` clean; app logic 246 (incl. `date-range.spec`,
`destinations.spec`), app screens 55 in 16 suites (incl. new `new-trip.test.tsx`; the Edit trip
test in `visits.test.tsx` still passes). Not run: any device rendering.

**Checks (Simulator):** Home → New trip, on an iPhone SE / mini and a Pro Max, in English and
Hebrew: keyboard up on open with the destination focused; suggestions under the ticket; the
calendar band in RTL; the button stays above the keyboard while typing the stay and name.

## Live trip adjustments (D1-D; written, uncommitted; Simulator checks pending)

Written 2026-11-19 on the trip assistant, Replan the rest of today and Find a place. App +
shared contract + AI prompt/parser; no migration, no new endpoint, no new dependency.

- **Something changed?** (Today, collapsed sheet, for the visit happening now or the next one):
  It's closed · We're staying longer · Skip it · We're running late ("Find something nearby"
  moved to Today's "…" menu in U4). Each opens the focused trip plan sheet with the request already read. The same works
  typed, in English and Hebrew ("the Frick is closed", "let's skip the Met", "we're staying
  another hour at MoMA", "נשארים עוד שעה במוזיאון", "anything interesting nearby?").
- **Closed:** "Skip X (closed)" switch (on; off = keep) + "Or find an alternative nearby": the
  place finder searches the same kind around the closed place (one Text Search, on tap), pick
  one → proposed for that day at its cheapest spot with a suggested time; Apply saves it
  (collection + trip, deduped) and queues the visit.
- **Staying longer:** the visit gets +30 min (or what was said) on its own switch; later timed
  visits it now overlaps get new times from its new end (switch each); what no longer fits can be
  proposed for another day; if today is still too full, long flexible visits can be shortened
  by 30 min (off by default). Saved places with room can be proposed for today as before.
- **Skip:** a switch; Apply marks the visit skipped (it stays in the trip and place history).
- **Saved places near you:** `nearby-saved.ts` + a Today section and a peek alert ("You saved X:
  ≈ 6 min walk from here"): trip places not on any day, ≤ ≈ 15 min walk from the one location
  reading, fits-the-free-time first, closed ones left out when hours are already known; Add to
  today (focused sheet → Apply), Directions, Open, dismiss (per day). Location: read on opening
  Today live or on "Check what's near me" / "Show my location"; never in the background.

Tests (real runs, 2026-11-19): `pnpm typecheck` clean; shared 58; API 174 (incl. live
instructions parsing); app logic 240 (incl. `nearby-saved.spec`, live rules en/he, live
`request.spec`: skip on/off, closed → next visit, longer + re-timing, optional shorten); app
screens 52 in 15 suites (incl. new `today-live.test.tsx`: nearby saved with why + peek alert +
Add through Apply only; dismiss; closed → skip switch + alternative search, Apply = status
skipped; staying longer preview). Not run: real location, Google, Claude, the Simulator.

**Checks (Simulator, local API, Features → Location → Custom Location in SoHo):** a trip day with
a timed visit later and a wishlist place nearby → Today: peek alert and "Saved places near you" →
Add to today → Apply; dismiss another; "Something changed?" → It's closed → Search → pick →
Apply; → We're staying longer → later times move; Hebrew typed requests; airplane mode: skip /
longer still apply (queued), alternatives need a connection.

**Known limits:** "nearby" uses straight-line walking estimates; hours only when already known;
one location reading (no updates while walking unless the user refreshes); dismissals are per
day on this phone; the in-progress visit is projected from the plan's start for today.

## Find a place and plan it in (D1-C; written, uncommitted; Simulator checks pending)

Written 2026-11-19 on the trip assistant. Shared contract (`findPlace`), AI prompt/parser,
app; no migration, no new endpoint (reuses `/v1/discover/search`, `/v1/places/google`,
the preview and the change queue).

- **Understanding:** `features/assistant/rules.ts` reads named places, kinds, areas, days,
  "near the places we're visiting" and "where is it / which day" follow-ups in English and
  Hebrew (curly apostrophes normalized); the AI understands `findPlace` too (user's words only).
- **Finding:** `PlaceFinder.tsx` in the trip plan sheet: editable query, "Search Google Maps"
  (one Text Search, only on tap; destination / named area / circle around planned visits,
  `place-finder.ts`), "Which one do you mean?" when several match.
- **Where it is:** map with the place and planned visits, address and type (Google, with
  attribution), nearest planned visits and the stay with ≈ estimates.
- **Which day:** `compareDays()` in `trip-plan.ts`: every day as fits / too full / closed / past,
  travel added, nearest visit, load after vs available, best fit; tap another day (a full day
  shows a warning). "Check opening hours" = one preview call for that place. No day with room:
  explained, plus "Just save it to the trip's wishlist".
- **Proposal:** `addRequests` in `planTrip` (never overloads a day unless the user picked it;
  never a past day), only that place is proposed, at its cheapest spot in the route
  (`bestPosition`, never before done visits); the day's other visits keep their order and times
  unless the user switches those on; the new place's suggested time has its own switch.
- **Apply:** saves the place (collection + trip, deduped by place ID; online), then the visit
  and the day order go through the change queue. A place already saved to the trip is planned
  as is; one already planned says so. "Where is X?" shows no Apply.

Tests (real runs, 2026-11-19): `pnpm typecheck` clean; shared 58 (findPlace schema checks
added), API 173 (incl. `findPlace` parsing), app logic 228 (incl. `place-finder.spec`, rules,
`compareDays`/`addRequests`/`bestPosition`), app screens 48 in 14 suites (incl. new
`find-place.test.tsx`: search only on tap, "which one?", best day + too-full day, Apply saves
then queues one visit with a time and moves nothing; "where is" changes nothing).
Not run: real Google search/preview, real Claude, the Simulator.

**Checks (Simulator, local API):** NY trip → Plan the whole trip → "I also want to visit SUMMIT
One Vanderbilt. Where is it, and which day would be best to add it?" → Search → pick → map and
≈ distances → day list with "best fit" → tap another day → Apply → the place is in Saved, the
trip's wishlist/plan on that day, other visits unchanged. Also "Where is the Frick?", "Add
another shopping stop near SoHo", "תוסיף עוד מסעדה ליד סוהו ביום חמישי", and Profile → Usage (one text
search per Search tap, one preview per "Check opening hours").

**Known limits:** opening hours are only used after "Check opening hours"; one place per
request; travel is estimated (≈), not routed; Apply needs a connection (saving the place);
the area is passed to Google as text ("SoHo, New York"), not a boundary.

## Replan the rest of today (D1-B; written, uncommitted; device checks pending)

Written 2026-11-19 on top of the trip assistant. App + shared contract + API prompt; no migration.

- **Today** (live trip day, something not done): full sheet → "Replan the rest of today"
  opens the trip plan sheet focused on today (`TripPlanSheet` `focusDay`): only today and
  the days its changes reach are planned and shown; other days get no order/times.
- **Behind schedule** (a planned visit whose time has passed): the sheet starts with
  "I'm running late" already read (`catchUp`). Those visits lose their passed time, stay on
  today (`keepDay`) and get a new time from now; each has its own switch ("The Met: 10:00 →
  11:30" / "keep 10:00"). Times still ahead, done and happening-now visits never change;
  what no longer fits can be proposed for another day. Typed requests work the same way
  ("we overslept, finish by 6", "אני מאחר"; AI understands `catchUp` too).
- **Planner fix:** a day start other than the default (today's "not before now", or the
  user's "start at 10") is now a floor for suggested times also after earlier (done) visits
  (`projectDay`). Days with the default start behave as before.
- Apply → change queue (works offline, syncs with conflict checks). Live only (not in
  Today's preview mode).

Tests (real runs, 2026-11-19): `pnpm typecheck` clean; `pnpm test` exit 0 (app logic 216
incl. 5 new catch-up/rules tests; app screens 46 in 13 suites incl. new
`replan-today.test.tsx`; shared 58; API `trip-assistant.spec` 8/8 incl. `catchUp`).
Not run: anything on a screen or against real Claude.

**Checks (Simulator, on a trip day):** give a stop a time 1 h ago and leave it not done →
Today → swipe up → "Replan the rest of today" → "I'm running late" box, the late stop with
a new time, only today shown; switch it off → "keep …"; Apply → the time changes, other
stops keep theirs; airplane mode → same, syncs later. In Hebrew: type "התעכבנו, לסיים עד 18:00".

## D1 trip assistant (accepted Nov 19 on code + automated tests; uncommitted; device checks pending)

Updated 2026-11-19. Part of the uncommitted D1 working tree (visits/stays, API v2,
complete trip plan; migration `20261118150000_d1_visits_and_stays` applied to
production on 2026-11-21, see Snapshot). Decision P20.

- **Where:** itinerary → "Plan the whole trip" sheet → text field at the top
  (`features/assistant/AssistantPanel.tsx`, shown by `features/planning/TripPlanning.tsx`).
- **Reading the request:** `features/assistant/rules.ts` reads common English and
  Hebrew requests on the phone (free, offline; a weekday that occurs twice asks
  "Which day?"). Anything else goes once to `POST /v1/assistant/trip`
  (`apps/api/src/assistant`, `ai/trip-assistant-*.ts`): Claude returns validated
  instructions or one question; `unavailable` (no key, cap, error) keeps manual planning.
  Offline, unreadable requests say so and change nothing.
- **Proposal:** `features/assistant/request.ts` turns instructions into planner input
  (day limits/windows, pinned visits, requested moves, longer visits) for the existing
  `trip-plan.ts` → `smart-plan.ts` → `complete-plan.ts`. The sheet shows what each
  instruction did, "which one?" choices, "Now: …" before each changed day, and every
  suggestion (moves, adds, longer visits, order, times) on its own switch. Apply
  queues the chosen changes (`useApplyTripPlan`, incl. `durationMinutes`), so it works
  offline and syncs with conflict checks. "Find … near" opens Discover only on tap.
- **Privacy/cost:** Claude gets refs, categories, times, stars, status and the user's
  own labels only (strict schema); shares the `AI_*` caps; `/v1/assistant/*` is a paid
  route for rate limits. No Google call is made by the assistant.

Tests (real `pnpm test` / `pnpm typecheck` on the Mac, 2026-11-19): shared 58 (incl.
2 new trip-assistant schema tests), API 171 (incl. `trip-assistant.spec`), app logic 211
(incl. `rules.spec`, `request.spec`), app screens 44 in 12 suites (incl.
`trip-assistant.test.tsx`: rules path offline + Apply through the queue, longer visit,
offline fallback, and new: AI clarify → answer → plan with no Google IDs sent and no
changes before Apply, `unavailable`, rules don't call the AI); typecheck clean.
**Not run:** anything against real Claude, the deployed API, or on a screen.

**Known limits:** "finish by" lowers the day's capacity and suggested times, but a
visit the user already timed later is kept (not moved or flagged as past the end);
keep-fixed visits are not given suggested times; Hebrew reading is pattern-based
(less common phrasing goes to the AI, or is unavailable offline).

**D1 trip assistant checks (Simulator, after deploying the API):** open the NY trip →
"Plan the whole trip": "Make Tuesday less busy" → "Understood on your phone", moves
marked "you asked for this", starred/timed visits not moved, "Now: …" line; "Give me
more time for shopping" → longer-visit switches; "תעביר את המוזיאון ליום אחר" in
Hebrew; a free-form request online → "Understood by AI" (Usage: AI count +1); turn
switches off and Apply → only those changes; airplane mode → rules still work, AI
requests say offline.

## M16 – Real travel times (Routes API Essentials; written, owner setup pending)

Approved by the owner on Nov 18 (SKU **Routes: Compute Routes Essentials**, 10,000
free/month, then $5 per 1,000; our caps 150/day, 2,000/month). See DECISIONS P19.
- **API:** `POST /v1/google/routes` (≤ 10 legs, one Compute Routes call per leg,
  walk or transit, field mask duration + distance + polyline only; never
  traffic-aware, waypoint optimization or intermediates). Counted in
  `provider_usage` as `google_routes` (Usage screen shows it). Past a cap the
  remaining legs come back null (`limited: true`).
- **App:** Today and "Plan this day" (times, warnings) ask for the legs on screen
  when online; real legs show without "≈" and with "Google Maps"; the next leg is
  drawn as the real (solid) route. Offline, capped or on any error: the on-device
  estimate, as before. Results are memory-only (20 min), never saved.
- **Unchanged on purpose:** reminders and "Shorter order" stay on estimates
  (reminders must not depend on the network).

Tests (real `pnpm test`, scratch copy): shared 50 (+3), API 57 (+5
`google-routes.spec`: Essentials-only body, field mask, transit time window,
mapping), app logic 155 (+9: `route-legs` 6, `today-map` +2, `day-planner` +1), app
screens 26 (+3: real route shown without ≈ and leave-by follows it; cap/error → estimate
silently; offline → no calls); `pnpm typecheck` clean; en/he parity clean.

**Owner setup before it works (else the app just keeps estimates):**
1. Google Cloud → APIs & Services → Library → enable **Routes API** (same project).
2. Credentials → the server key → API restrictions → add **Routes API** (or create a
   separate server key and set `GOOGLE_ROUTES_API_KEY` in Render).
3. Render → deploy the API (new env defaults `GOOGLE_ROUTES_DAILY_CAP=150`,
   `GOOGLE_ROUTES_MONTHLY_CAP=2000` come from render.yaml, or add them by hand).
4. Optional safety net: Routes API → Quotas → *ComputeRoutes requests per day* ≈ 150.
**M16 checks:** online, open Today on a trip day → travel line without "≈" plus
"Google Maps", solid route to the next stop; Profile → Usage → "Travel times (routes)"
counts a few calls; airplane mode → "≈" estimates again; "Plan this day" → the note
says times use Google Maps routes.

## U2 – Live Companion redesign: map-first Today (written; device checks pending)

Today is now a full-screen Google map with a three-height bottom sheet (approved
Nov 18; decisions P18). Same engine, same actions, same rules (no auto changes,
one-shot location, no paid APIs, offline via the M12a saved copy).

- **Map** (`features/companion/TodayMap.tsx`, model `today-map.ts`): pins show the
  day's progress (done = small grey check, next = large accent number, now = green,
  later = white number), the hotel, the next leg (dashed accent) and the rest of
  the day (faint dots). Lines are straight and labeled "Lines are direct, not
  routes"; Directions opens the real route. Quiet map style (`theme/map-style.ts`,
  free). `mapPadding` follows the sheet so Google's logo stays visible.
- **Location:** "Show my location" reads once (no tracking). The dot turns hollow
  grey after 2 minutes ("Last known location, N min ago").
- **Sheet** (`components/ui/MapSheet.tsx`, RN Animated + PanResponder, no native
  module): collapsed = progress, next stop, the leave-by time, travel (or
  "unavailable"), Directions / Done, and up to two alerts (needs a choice, running
  late, may not fit today, offline + waiting changes, free time); half = the day;
  full = preview controls, offline status, hints with their choices, the day,
  free time + suggestions, Discover nearby, footnote. Handle: tap to cycle, drag or
  flick, VoiceOver adjustable; Reduce Motion snaps. Opens at half when nothing can
  be drawn or in preview.
- **Lists ↔ map:** tap a pin → half sheet, row highlighted; tap a row → map centers
  on it; tap the selected row again → place details.
- **Home:** tapping the trip card opens Today (live during the trip, preview
  before); "View itinerary" keeps a path to the plan.
- **Data accuracy:** `reliableTravel` rejects invalid coordinates (NaN, out of
  range, 0,0) and hops over 60 km or 180 min. Today shows "Travel time unavailable"
  and "Be there by HH:MM" instead of a leave time that assumed zero travel (the
  engine no longer computes leave-by or free time without a reliable estimate).
  The day planner and reminders use the same guard, so bad coordinates fall into
  their existing "unknown travel" paths.

Tests (real `pnpm test` in the scratch copy): shared 47, API 52, app logic 146 (+8:
`today-map.spec`), app screens 23 (+10: Today 9 incl. all three sheet states, alerts,
travel unavailable, Done offline, list/pin selection, preview; Home +2 card opens
Today live/preview); `pnpm typecheck` clean; en/he parity clean. No native rebuild.

**U2 checks (Simulator, then iPhone):** open Today on a trip day → map fits the day,
next pin stands out, Google logo visible above the sheet; drag the sheet through
three heights, flick, tap the handle; VoiceOver: swipe up/down on the handle; Reduce
Motion on → snaps; tap a pin ↔ row; "Show my location" → dot, wait 2+ min → hollow
"last known"; airplane mode → "Offline" alert in the collapsed sheet, Done →
"1 change will sync"; Hebrew → top bar, controls and sheet mirror, map does not;
largest text size → collapsed sheet grows (never above half); Home card → Today.

## M15 – Trip journal + recap, stage 1 (written; device checks pending)

Day journal under each day's stops (from the day itself, or earlier if written):
1–5 rating, note (sheet), what you did (stops marked Done, in order, with times).
Stop menu: "Mark as a highlight" (star on the row). Trip "…" → "Trip recap": days,
places visited of planned, ≈ distance between places, highlights, each day's
rating/route/note, "Share recap" (system share sheet, plain text). All edits work
offline (change queue: `journal` ops; highlight is a `schedule` field) and the
journal is in the offline saved copy.

Tests (real `pnpm test` in the scratch copy): shared 47 (+2), API 52 (+1), app logic
138 (+9: `recap` 4, `pending-ops` +2, `sync` +2, `trip-cache` +1), app screens 13 (+2:
journal offline, recap + share); `pnpm typecheck` clean; en/he parity clean.
A screen test caught a real bug, fixed: offline, a note written before the journal had
ever loaded wasn't shown (the journal query now starts empty).
**M15 checks (Simulator):** a trip day in the past/today → rate, add a note, see
"What you did"; star a stop (star on the row); trip "…" → Trip recap → Share
(share sheet opens with the text). Offline: same, then reconnect → synced.
Stage 2 (photos) waits for the owner's choice (see DECISIONS P17).

## M14 – Screen tests + CI (written)

`jest-expo` + React Native Testing Library for screens (`src/test/screens`), shared
fakes and helpers (`src/test/setup.ts`, `src/test/render.tsx`); `pnpm test` runs
logic (Vitest) and screens (Jest); CI runs both on every push. Owner steps: `pnpm
install` (new dev packages, lockfile updated), `pnpm test`, commit, push; check the
GitHub CI run is green. No app runtime change except the two Profile fixes and the
menu fallback (no native change, no rebuild).

## M13 – Smart day planning (written; device checks pending)

| Part | Code | Tests run in session | Unverified |
| --- | --- | --- | --- |
| Planner (summary, warnings, shorter order, fill in times) | ✅ `features/planning/day-planner.ts` | `day-planner` 11/11 | On screen |
| Opening hours (weekly periods → day windows; hours-aware times and warnings) | ✅ `opening-hours.ts`; API mask `regularOpeningHours` + mapper `openingPeriods` | `opening-hours` 6/6; API `google-places` 11/11 (+1) | Real Google response; deploy |
| UI: summary line, warnings, "Plan this day" sheet (Apply via the change queue), "Check opening hours" | ✅ `DayPlanning.tsx` in the itinerary day | `tsc` clean; i18n parity clean | Everything visual |

**M13 checks (Simulator, after deploying the API):** open the NY trip → a day with
3+ stops: the summary line shows stops, visits, travel and end time; give two stops
times too close together → "Things to check" lists it; "Plan this day" → toggles for
a shorter order (if any) and "Fill in times"; preview shows suggested times in teal;
Apply → order and times change (also works offline; then syncs); timed stops kept
their times. "Check opening hours" → "Opening hours found for N of M"; a museum on its
closed day shows "closed that day"; Profile → Usage shows the preview count went up by
the number of places.

## M12a – Offline-tolerant trip mode (written; device checks pending)

Stages (owner's priority order) and their state. Design: docs/ARCHITECTURE.md → "Offline-tolerant trip mode".

| Stage | Scope | Code | Tests run in session | Unverified |
| --- | --- | --- | --- | --- |
| 1 | Reminder reliability: never cancel because data failed to load; offline keeps reminders scheduled earlier (only stops changed offline are replaced) | ✅ written | `reminders.spec.ts` 21/21 (10 new); app `tsc` clean; i18n parity clean | On-device: airplane-mode launch keeps reminders |
| 2 | Offline viewing: per-user saved copy (AsyncStorage) of trip list, trip details, profile; restored before screens render; Home/Trip/Itinerary/Today/place show the copy when refresh fails, with an "Offline · saved copy from …" line; category names offline; Google coordinates ≤ 30 days (auto-deleted); wiped on sign-out | ✅ written | `coords` 6/6, `trip-cache` 7/7, `offline-today` 3/3 (all new); `today-engine` 18/18, `reminders` 21/21, `logic` 13/13; app `tsc` clean; i18n parity clean | Everything on a device (airplane mode) |
| 3 | Offline edits + sync: Done, reorder, time, length and day are recorded on the phone first (shown at once, saved before sending) and synced with a three-way check (already there → drop; unchanged on server → send; changed → conflict kept for the user: Keep mine / Use the server's / Discard). One sync at a time; edits made during a sync are kept. Status lines for pending changes and conflicts; a marker on stops with an unsynced change; sign-out warns about unsynced changes | ✅ written | `pending-ops` 8/8, `sync` 8/8 (all new); app `tsc` clean; i18n parity clean | Everything on a device; real API round trips (the sync tests use an in-memory API stand-in with the server's rules) |
| 4 | `myLabel`: user-typed label on places (migration `20261118090000_place_my_label`, shared schema with default null, API select/update, place screen "Your label" sheet, never prefilled from Google); shown offline instead of the category | ✅ written | shared `schemas.spec` 45/45 (+1), API `mappers` 6/6 (+1) and other API specs 32/32; shared build + `tsc` clean for shared, API, app | Migration push; deploy; label round trip on a device |

## Tests

How tests are organized and written: docs/TESTING.md.

### Executed in the M14 session (2026-11-18): first real run

For the first time the suites ran on the **real tools**, in a separate copy of the
repo on the Mac's Linux shell (Node 24.22, pnpm 10.28, its own `node_modules`), with
the committed lockfile and then the updated one:

| Command | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` (updated lockfile) | OK |
| `pnpm test` → shared (Vitest) | 45 passed |
| `pnpm test` → API (Vitest) | 51 passed (incl. `auth.spec`, which the earlier stand-in could not run) |
| `pnpm test` → app logic (Vitest) | 129 passed (16 files) |
| `pnpm test` → app screens (Jest, jest-expo 58.0.15, RNTL 14.1.0) | 11 passed (6 files) |
| `pnpm typecheck` (shared, API, app incl. test files) | clean |

Earlier sessions' numbers (below) came from a stand-in runner; these supersede them.
Screen tests found two real bugs, fixed: Profile showed an error offline instead of
the saved copy, and its error-screen "Sign out" skipped the unsynced-changes warning.
Also hardened: the action menu ran the chosen item only from iOS `Modal.onDismiss`;
it now has a 600 ms fallback (never runs twice). Not run: anything on a real device.

### Executed in the M13 session (2026-11-17)

App **129 passed** (M12a's 112 + `day-planner` 11 + `opening-hours` 6); shared
`schemas.spec` 45; API **39** (`google-places` 11 incl. the opening-periods mapper);
`tsc` clean for shared (+ build), API and app; en/he parity clean. Same stand-in
method as below (not real vitest). Not run: anything on a screen or against Google.
Note: during this session a scripted edit briefly corrupted `places/queries.ts`; it
was restored from git `HEAD` and re-edited, then type-checked and tested.

### Executed in the M12a session (2026-11-17)

Same method (Node TypeScript mode + vitest stand-in on the Mac's Linux shell; real spec files, real code):

| Suite | Result |
| --- | --- |
| App: `reminders` 21, `today-engine` 18, `logic` 13, `itinerary` 8, `zoned-time` 6, `search-presets` 4, `auth-errors` 4, `geo` 3, `resources` 3; new offline suites `coords` 6, `trip-cache` 7, `offline-today` 3, `pending-ops` 8, `sync` 8 | **112 passed, 0 failed** |
| `packages/shared` `schemas.spec.ts` (against the freshly built `dist`) | 45 passed, 0 failed |
| API: `mappers` 6, `google-places` 10, `interpret` 10, `app-config` 3, `common` 5, `rate-limit` 4 | 38 passed, 0 failed |
| Translation parity (en/he) | clean |
| `tsc --noEmit` for `packages/shared`, `apps/api`, `apps/mobile`; shared `tsc -p tsconfig.build.json` | all clean |

What these tests cover for M12a (owner's list): opening Today and the itinerary from
the saved copy with no network (`offline-today`); marking Done, reordering, time and
length offline and syncing after reconnecting, duplicate prevention, conflicts
(`pending-ops`, `sync`); reminders kept offline and never cancelled because data
failed to load (`reminders`); per-user isolation, sign-out wipe, no Google names
stored, 30-day coordinate expiry (`trip-cache`, `coords`).
**Not covered by tests:** React screens and hooks (no component test setup), the
real API (sync uses an in-memory stand-in), real notifications, AsyncStorage on a
device. These are in the airplane-mode checklist below.

### Executed in the U1 session (2026-11-17)

Same method (Node TypeScript mode + vitest stand-in on the Mac's Linux shell):
app specs **70 passed, 0 failed** (`logic` now 13 with the new `pastTrips` test;
others unchanged: `auth-errors` 4, `geo` 3, `reminders` 11, `today-engine` 18,
`zoned-time` 6, `search-presets` 4, `itinerary` 8, `resources` 3);
translation parity clean (no missing/extra/empty keys, placeholders match);
`tsc --noEmit` clean for `apps/mobile`. API and shared code were not changed and
were not re-run. Not run: real vitest, any UI rendering, the Simulator.

### Executed in the M11 session (2026-11-17)

Same method as below (Node TypeScript mode + vitest stand-in on the Mac's Linux shell):
app 69 (incl. `zonedNow` 3 new), shared 44, API 37 (incl. `rate-limit` 4 new) =
**150 passed, 0 failed**; translation parity clean; `tsc --noEmit` clean for
shared, API and app. Not run: `auth.spec.ts`, real vitest, anything on a device
or against the live API.

### Executed in the M10 session (2026-11-17)

Run on the owner's Mac through a Linux shell with Node 22's TypeScript mode
and a minimal vitest stand-in (the session could not run vitest itself). Real
spec files, real code:

| Suite | Result |
| --- | --- |
| Mobile pure logic: `zoned-time` 3, `reminders` 11, `today-engine` 18, `geo` 3, `itinerary` 8, `search-presets` 4, `logic` 12, `auth-errors` 4, `resources` (i18n) 3 | 66 passed, 0 failed |
| `packages/shared` `schemas.spec.ts` (against the built `dist`) | 44 passed, 0 failed |
| API: `mappers` 5, `google-places` 10, `interpret` 10, `app-config` 3, `common` 5 | 33 passed, 0 failed |
| Translation parity check (en/he keys, empty strings, placeholders) | clean |
| `tsc --noEmit` for `packages/shared`, `apps/api`, `apps/mobile` (with the real `expo-notifications` types) | all clean |
| `expo config --type introspect`: iOS entitlements | `{}` with our config; `{aps-environment: development}` when push is switched on (proves the check works) |

### Not executed

- `apps/api/src/auth/auth.spec.ts` (needs decorators; vitest only).
- `pnpm test` / `pnpm typecheck` with real vitest on the Mac after M10 (owner to run).
- Anything needing a device, the database or the network: Simulator/iPhone
  UI, notifications, `pnpm smoke:api`, migrations.
- There are no UI component tests; screens are verified by hand.

## Database migrations (`supabase/migrations`, applied with `npx supabase db push --remote`)

| Migration | Purpose | Status |
| --- | --- | --- |
| `20261116120000_phase1_foundation` | `app` schema, profiles, preferences, trips, RLS, sign-up trigger, `touch_row` | Applied |
| `20261117090000_places` | `places`, `trip_places` | Applied |
| `20261117120000_google_places` | Google place ID, category, tags, visited, `provider_usage` | Applied |
| `20261117130000_fix_place_id_check` | Place ID regex `{10,255}` | Applied |
| `20261117150000_trip_base_location` | `trips.base_location` | Applied |
| `20261117180000_itinerary` | `trip_places.day/start_time/position` | Applied |
| `20261117200000_trip_base_place_and_usage` | `trips.base_google_place_id`, usage index | Applied (M8 verified) |
| `20261117220000_visit_duration` | `trip_places.duration_minutes` | Applied (seen in `migration list --linked`, Nov 21) |
| `20261118090000_place_my_label` | `places.my_label` (user-typed, 1–60 chars, trimmed) | Applied (seen Nov 21) |
| `20261118120000_trip_journal` | `trip_places.highlight`, `app.trip_journal_days` (+ RLS) | Applied (seen Nov 21) |
| `20261118150000_d1_visits_and_stays` | Visits/stays (expand + backfill) | Applied 2026-11-21 after a CSV backup; rollback in `docs/d1/` |

M10 adds no migration.

## Deployment status

| Piece | Where | State |
| --- | --- | --- |
| API | Render Free, Singapore, `https://travel-companion-api-joqe.onrender.com`, auto-deploys `main` | Running `b692bb1` (D1) since 2026-11-21: health ok, new routes present; smoke test not run |
| Database + Auth | Supabase Free, project ref `nmerwskzfceigcmedgxo`, Singapore | Running |
| CI | GitHub Actions (`.github/workflows/ci.yml`): `pnpm test`, `pnpm typecheck` on push | Was red on the M8 commit (one stale test), fixed in `bd777ca`; current state not checked |
| iPhone | Not installed yet (free Apple ID, 7-day builds) | Planned for Nov 21–22 |

## Environment variables (names only; never commit values)

- `apps/api/.env` (server, also in Render): `SUPABASE_URL`, `DATABASE_URL`,
  `DATABASE_SSL`, `DATABASE_POOL_MAX`, `JWT_AUDIENCE`, `HOST`, `PORT`,
  `NODE_ENV`, `GOOGLE_PLACES_API_KEY`, `ANTHROPIC_API_KEY`, `AI_MODEL`, and the
  caps `GOOGLE_TEXT_SEARCH_*`, `GOOGLE_PLACE_DETAILS_*`, `GOOGLE_PLACE_PREVIEW_*`,
  `GOOGLE_PLACE_PHOTO_*`, `AI_*` (`_DAILY_CAP` / `_MONTHLY_CAP`). See `apps/api/.env.example`.
- `apps/mobile/.env` (public values only): `EXPO_PUBLIC_SUPABASE_URL`,
  `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_API_URL`, and
  `GOOGLE_MAPS_IOS_API_KEY` (build-time, restricted to the bundle ID). See `apps/mobile/.env.example`.

## Known bugs, limitations and technical debt

- **Time zones:** everything uses the trip's zone from the pinned hotel; without
  a pinned hotel, the phone's zone (so pin the hotel before the trip).
- **Travel times are estimates** (no Routes API); subway/taxi estimate is coarse. Unreliable estimates (bad coordinates, > 60 km or > 180 min) are shown as unavailable. Online, Today and day planning use real Google routes (M16, capped); reminders and "Shorter order" still use estimates; real routes need a connection (never stored).
- **U2 map-first Today:** map lines are straight (no route geometry: that would need the paid Routes/Directions API); offline, the map may show no tiles (pins and the sheet still work); the sheet's drag runs on the JS thread (RN Animated + PanResponder, no Reanimated), so it can feel less smooth while the JS thread is busy; the map isn't rendered in tests (mocked), so map visuals are device checks only.
- **Reminders follow the plan only** (no location); they refresh when the app
  opens or the itinerary changes. A plan edited on another device won't update
  this phone's reminders until the app opens here.
- **Google attribution** is the text "Google Maps" (allowed where space is
  limited, styled per Google's rules); the official logo is optional polish.
- **Rate limits are in memory** per API instance (fine for one Render instance;
  restarts reset them).
- **Session storage** is AsyncStorage (not encrypted).
- **Email confirmation links** don't open the app; keep "Confirm email" off for development.
- **Usage counters** use UTC days/months; Google's billing month may differ slightly (monthly caps keep a 10% margin).
- **Render cold start** (~1 min after 15 min idle); **Supabase Free pause** after ~1 week idle.
- **Free Apple ID**: rebuild every 7 days; after `expo prebuild --clean` set the signing Team again in Xcode.
- The iOS Maps key was once shared in a chat; the owner may regenerate it (restricted to the bundle ID).
- **Offline (M12a) limits:** the saved copy covers trips, the itinerary, Today and
  the profile; Discover, maps, photos, adding/removing places, editing/deleting trips
  and accepting Today suggestions need a connection. Offline, Google places show the
  user's label or category (Google names may not be stored); maps have no tiles.
  The saved copy is unencrypted AsyncStorage in the app sandbox (included in device
  backups); encryption is D15 (later). A change made offline before the trip uses the
  phone's time zone for its new reminder (the trip zone comes from Google and isn't
  stored); during the trip the phone is on New York time. Conflict check has a
  seconds-long window between reading and writing (fine for one user). Full
  offline-first (PowerSync/SQLite) is still later (D5a/D11/D15/D17).

## Exact next steps

0. **Owner: commit M15 + U2 + M16 (Nov 18)** — one commit: they touch the same files
   (en/he strings, test helpers), so splitting them isn't clean. `trip-safe` stays the fallback.
   ```sh
   cd ~/Programing/travel-companion
   pnpm test && pnpm typecheck
   npx supabase db push --remote            # trip_journal (and my_label if not yet pushed) BEFORE the API deploy
   git add -A && git commit -m "M15 journal + recap, U2 map-first Today, M16 real travel times" && git push
   # check the GitHub CI run is green; Render deploys the API (M15 endpoints)
   pnpm ios                                  # no native rebuild (U2 adds no native module)
   ```
   Then the M16 Google setup (section M16), and the M15, U2 and M16 checks.

1. **Owner: test, migrate, commit, deploy**
   ```sh
   cd ~/Programing/travel-companion
   pnpm test && pnpm typecheck
   npx supabase db push --remote            # applies 20261118090000_place_my_label
   npx supabase migration list --linked      # also confirms visit_duration is applied
   git add -A && git commit -m "M12a: offline-tolerant trip mode" && git push
   pnpm smoke:api                            # after Render shows the new deploy as Live
   pnpm ios                                  # no native rebuild needed (no new native module)
   ```
   Push the migration **before** the API deploy (the API now selects `my_label`).
2. **U1 checklist** (English, then Profile → Language → עברית; small and large iPhone):
   - Tabs: Home · Discover (magnifier) · Saved · Profile.
   - Home: trip card with one primary button; "Your trips"/"Other trips" list; "New trip"; past trips.
   - Trip: "…" menu (edit, pin hotel, search, from saved, delete with confirm); "Add places" menu;
     itinerary row tap → menu (each item works, incl. earlier/later, move day, mute, remove time);
     number toggles done; time chip opens time sheet; wishlist "…" menu; hide/show visited.
   - Today: next stop, Done, hints only when late, ≤ 2 suggestions, Discover nearby, preview pills.
   - Discover: "Ask AI" pill ↔ "Back to search"; context line opens the sheet; category chips; list/map; save bar.
   - Preview: one primary button; Directions / Google Maps; rating · open · distance line.
   - Saved: "+" menu; chips; list/map icon. Place: "…" (Google Maps, delete); Visited switch; "Your label".
   - Profile: name row → sheet; language and distance menus; Reminders; Usage; Sign out.
3. **M12a airplane-mode checklist** (Simulator: turn the Mac's Wi-Fi off, or on the
   iPhone: Airplane Mode on, Wi-Fi off). Prepare online first: sign in, open the NY
   trip, its itinerary and Today once; give one stop a label ("Your label"); turn
   reminders on; time a stop ~20 min ahead on a trip day that includes today (or use
   "Send a test reminder").
   1. **Cold launch offline:** force-quit the app, go offline, open it. Expected: no
      endless spinner; Home shows the trips with "Offline · saved copy from HH:MM".
   2. **Home and a trip:** open the NY trip. Dates, "Staying at", Itinerary/Wishlist load.
   3. **Today:** opens; next stop, times, lengths, Done status; leave-by time shown if
      coordinates were cached online (≤ 30 days); names = your label or the category.
   4. **Itinerary and hotel:** days, order, times, lengths, notes (tap a stop → Open
      place), "Staying at …" line.
   5. **Done offline:** mark a stop Done. It shows at once; "Changes waiting to sync: 1";
      a cloud marker on the stop.
   6. **Reorder offline:** stop menu → Move earlier. Order changes at once.
   7. **Time and length offline:** time chip → change both → Save. Shown at once.
   8. **Reminders offline:** Profile → Reminders: "Offline: reminders scheduled
      earlier are kept…"; the scheduled list still shows them; the test/real reminder
      fires while offline. Reminders of the stop you changed are updated.
   9. **Reconnect and sync:** go online, reopen the app (or wait ≤ 30 s / tap "Sync
      now"). The waiting line disappears; on another device or after a fresh
      launch online, the server has Done, the new order, time and length.
   10. **Conflict:** go offline on the phone and change stop X's time to 11:00. On the
       Simulator/another session (online) change the same stop's time to 09:00. Go
       online on the phone. Expected: "Changes that need your choice: 1" → Review shows
       "Yours: 11:00 · Now on the server: 09:00". Try "Keep mine" (server becomes 11:00)
       and, in a second run, "Use the server's" (stays 09:00, nothing lost silently).
   11. **Sign-out isolation:** with a change waiting, Sign out → a warning lists the
       unsynced changes; confirm. Sign in (online) as a second test user, then go offline
       and relaunch: none of the first user's trips appear. Sign back in as the owner
       online: trips load again from the server (the first user's saved copy was wiped).
4. **R1 (Nov 21–22):** set Team in Xcode, `pnpm ios:release`, walk the R1 checklist
   (cellular only; sign in; pin hotel; Discover near hotel; save; plan days with
   times; Today; reminders test; relaunch keeps session; Hebrew) **and repeat steps
   3.1–3.9 on the iPhone**.

## How Claude sessions worked on this repo (useful context for any assistant)

The Claude sessions edited files in a cloud sandbox **without npm registry or
GitHub access** and synced them to the Mac through a device bridge. Therefore
the owner runs installs, `pnpm test`, native builds, migrations and pushes. A
Linux shell on the Mac was used to run `tsc` and pure-logic specs (Node
`--experimental-transform-types` + a tiny vitest stand-in). Any assistant with
a normal terminal on the Mac should simply run `pnpm test` and `pnpm typecheck`.

## History

- 2026-11-16: M0–M2 written; migration pushed (`db push --remote`); API starts;
  `/health/ready` ok; `pnpm smoke:api` 6/6 with a real user (proves the per-request
  `authenticated` role/RLS path). Supabase project is in ap-southeast-1 (Singapore).
- 2026-11-16: M3+M4 written (Expo Router tabs, tokens/components, en/he with
  immediate RTL flip, Supabase email auth, typed API client, Create Trip). `POST /v1/trips`.
- 2026-11-17: App builds with Xcode 26.4 and runs in the Simulator; fixed RN 0.88
  strict types; `redirectTo` on protected routes (SDK 58).
- 2026-11-17: Places slice (`places`, `trip_places`, `/v1/places`, trip detail,
  add-places, Open in Maps); smoke 18/18. Root scripts rebuild `packages/shared`
  first. Zero-cost hosting decided; `render.yaml`, CI, cold-start handling.
- 2026-11-17: Discovery v1 (Google Places Text Search + Place Details with Pro
  field masks and daily caps; Claude Haiku interpretation with clarification and
  direct fallback; Discover tab; collection/wishlist with maps). Verified end to
  end. Fixed: place ID regex over Postgres' 255 limit (migration
  `20261117130000`); map crash fixed by `expo prebuild --clean`. Added edit trip,
  "staying at", visited progress.
- 2026-11-17: M6 itinerary (`trip_places.day/start_time/position`, schedule and
  reorder endpoints, Plan/Places/Map tabs). Verified by the owner.
- 2026-11-17: M7 trip mode on Home. App-only.
- 2026-11-17: M8 Google-first Discover, place preview (approved Enterprise
  fields: rating, count, hours, photos; no review text), hotel pin, monthly caps,
  `GET /v1/usage`, location module, Live Companion design. Owner verified; CI fix `bd777ca`.
- 2026-11-17: M9 Live Today v1 (`duration_minutes`, travel estimates, `computeToday`
  engine, Today screen with preview mode). Committed `4ef298a`.
- 2026-11-17: M10 committed (`52c49b6`); iOS project regenerated (notifications module, no push entitlement).
- 2026-11-17: M11 trip readiness written: `zonedNow` + trip time zone for Today/Home/itinerary; per-user rate
  limits (`RateLimitGuard`, 240/60 per min); `GoogleAttribution` per Google's text rules on all Google content,
  photo `googleMapsUri` links, notification subtitle attribution; shorter Hebrew tab label. 150 tests pass (stand-in runner).
- 2026-11-17: M10 local reminders written: `expo-notifications` (installed by the
  owner, `~58.1.9`) with `enableRemoteNotifications: false`; trip time zone from
  the pinned hotel (`timeZone`, Pro field); pure planner + diff with tests;
  `ReminderSync` at the root; Reminders settings screen; per-stop mute; tap →
  Today. Documentation restructured for AI handoff (this file replaces
  `docs/PROGRESS.md`).
- 2026-11-17: U1 UX/UI redesign (audit + direction + implementation): design
  system doc, flat list-based UI kit, action menu, four tabs, all main screens.
- 2026-11-19: U4 UX/UI audit pass (app only): less repetition on Today, the plan sheet, Find a
  place, trip menu, Discover, Usage and Reminders; no Done in Today preview. Tests pass; uncommitted.
- 2026-11-21: CI #18/#19 red: `import-places.test.tsx` hit Jest's 5 s timeout on the slower GitHub
  runner (passes locally). Screen tests now use `testTimeout` 20 s and RNTL `asyncUtilTimeout` 5 s.
  CI #20 green. Owner ran `pnpm smoke:api` against the deployed API (D1 build): all checks passed
  (v1, v2 visits/stays, AI interpret, Google search/save/preview).
- 2026-11-22: linking to Google fills an unclassified (`other`) category from the picked result;
  Home's card is active only from the trip's first day in its zone; Today's preview shows no live/late
  signals. Tests pass; uncommitted; API deploy needed before the app.
- 2026-11-21: CSV file picker for import (T20). Committed `b692bb1` (all D1 work), D1 migration
  applied after a backup, pushed, Render deployed (health + new routes checked). Tests: app logic 277,
  screens 72, API 190, shared 60, typecheck clean. Smoke test and Simulator checks not run.
