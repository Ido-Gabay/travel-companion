# API reference

Base URL in development: `http://<your-mac-ip>:3000` (use `localhost` from the Mac
itself). Application routes are under `/v1`; D1 adds trip routes under `/v2`
beside them (see [API v2](#api-v2-d1-visits-stays-time-zones)). Request and response bodies are
JSON. Response shapes are defined as zod schemas in `packages/shared`.

## Authentication

Send the Supabase access token of the signed-in user:

```
Authorization: Bearer <access_token>
```

Every route requires it except the health checks. Tokens expire (1 hour by
default); the mobile app refreshes them through Supabase Auth.

## Errors

Every non-2xx response has this body:

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Request validation failed.",
    "details": [{ "path": "locale", "message": "Invalid option: expected one of \"en\"|\"he\"" }]
  }
}
```

| HTTP | `code` | When |
| --- | --- | --- |
| 400 | `VALIDATION_FAILED` | Body or parameters fail validation, malformed JSON, or a value breaks a database constraint. `details` lists fields when available. |
| 401 | `UNAUTHENTICATED` | Missing, malformed, expired or foreign token. |
| 403 | `FORBIDDEN` | Authenticated but not allowed. |
| 404 | `NOT_FOUND` | Route or record does not exist (or is not yours). |
| 409 | `CONFLICT` | Duplicate record, a stale list, or (D1) a change v1 can't express: `details` = `[{ "path": "reason", "message": "USE_NEWER_APP" }]`. Other reasons: `CONFIRM_REQUIRED`, `DAY_CHANGED`, `ID_IN_USE`. |
| 409 | `INVALID_TRANSITION` | (v2 only) The visit can't change that way (e.g. skip a done visit). |
| 409 | `STAY_OVERLAP` | (v2 only) The nights overlap another stay, named in `details`. |
| 409 | `STOPS_OUTSIDE_DATES` | (v2 only) New trip dates would leave visits outside; `details` lists them. |
| 429 | `RATE_LIMITED` | A provider (Google) is busy; try again shortly. |
| 429 | `DAILY_LIMIT_REACHED` | Today's cost cap for Google or AI is used up (resets midnight UTC). |
| 503 | `NOT_CONFIGURED` | The server has no key for this integration. |
| 503 | `SERVICE_UNAVAILABLE` | Database or Supabase signing keys unreachable. |
| 500 | `INTERNAL` | Unexpected error. Details are in the server log only. |

`message` is English for developers. The app shows its own translated text
based on `code`.

## Health

### `GET /health` (public)

Liveness. `200 {"status":"ok"}`.

### `GET /health/ready` (public)

Readiness. `200 {"status":"ok","database":"ok"}` or `503 SERVICE_UNAVAILABLE`.

## Me

### `GET /v1/me`

The caller's profile and preferences. Creates them on first call if missing.

```json
{
  "id": "6f1c2b9e-3d4a-4b5c-8d7e-9f0a1b2c3d4e",
  "email": "you@example.com",
  "displayName": null,
  "createdAt": "2026-11-16T10:00:00.000Z",
  "updatedAt": "2026-11-16T10:00:00.000Z",
  "version": 1,
  "preferences": {
    "locale": "en",
    "distanceUnit": "km",
    "updatedAt": "2026-11-16T10:00:00.000Z",
    "version": 1
  }
}
```

`email` comes from the access token.

### `PATCH /v1/me`

Body: `{ "displayName": string | null }`. The name is trimmed and must be 1–80
characters; `null` clears it. Unknown keys are rejected. Returns the full `Me`
object.

### `GET /v1/me/preferences`

```json
{ "locale": "en", "distanceUnit": "km", "updatedAt": "…", "version": 1 }
```

### `PATCH /v1/me/preferences`

Body: any of `{ "locale": "en" | "he", "distanceUnit": "km" | "mi" }`, at least
one. Returns the updated preferences.

## Trips

### `GET /v1/trips`

The caller's trips that are not deleted, ordered by start date (undated last),
then newest first. At most 200 (pagination comes when needed).

```json
{
  "items": [
    {
      "id": "0b8f6c1a-2d3e-4f5a-9b8c-7d6e5f4a3b2c",
      "title": "New York",
      "destination": "New York, USA",
      "startDate": "2026-11-23",
      "endDate": "2026-11-29",
      "baseLocation": "Midtown Manhattan",
      "basePlaceId": "ChIJ…",
      "placeCount": 3,
      "createdAt": "2026-11-16T10:00:00.000Z",
      "updatedAt": "2026-11-16T10:00:00.000Z",
      "version": 1
    }
  ]
}
```

`startDate` and `endDate` are calendar dates (`YYYY-MM-DD`) or `null`.

### `POST /v1/trips`

Creates a trip owned by the caller. Returns `201` with the trip.

```json
{
  "title": "New York",
  "destination": "New York, USA",
  "startDate": "2026-11-23",
  "endDate": "2026-11-29"
}
```

- `title`: required, trimmed, 1–120 characters.
- `destination`: optional, up to 120 characters; blank becomes `null`.
- `startDate`, `endDate`: optional `YYYY-MM-DD` or `null`. When both are set, `endDate` must be on or after `startDate`.
- Unknown keys are rejected (`400 VALIDATION_FAILED`).

### `GET /v1/trips/:id`

One trip with its places, in the order they were added. `404 NOT_FOUND` if the
trip doesn't exist, is deleted, or belongs to someone else. A malformed id is
`400 VALIDATION_FAILED`.

```json
{
  "id": "0b8f6c1a-…",
  "title": "New York",
  "destination": "New York, USA",
  "startDate": "2026-11-23",
  "endDate": "2026-11-29",
  "placeCount": 1,
  "createdAt": "…",
  "updatedAt": "…",
  "version": 1,
  "places": [
    {
      "id": "1d2e…",
      "source": "google",
      "googlePlaceId": "ChIJ…",
      "name": null,
      "address": null,
      "notes": "Pastrami on rye. Keep the ticket!",
      "category": "food",
      "tags": ["must eat"],
      "visitedAt": null,
      "tripCount": 1,
      "createdAt": "…",
      "updatedAt": "…",
      "version": 1,
      "addedAt": "…"
    }
  ]
}
```

### `PATCH /v1/trips/:id`

Any of `title`, `destination`, `baseLocation` (where the user stays, in the
user's own words; sent to the AI), `basePlaceId` (the hotel pinned on Google
Maps: only the place ID is stored; "near my hotel" searches around its real
location; `null` unpins), `startDate`, `endDate`. `POST /v1/trips` accepts
`basePlaceId` too.
Blank or `null` clears a text field or date. End before start is
`400 VALIDATION_FAILED` (checked against the stored dates too). Returns the trip.

### `DELETE /v1/trips/:id`

Soft-deletes the trip and its stays. `204`. Places stay in the collection;
completed visits stay in place history (v2 can remove them too).

### `POST /v1/trips/:id/places`

Body `{ "placeId": "<uuid>" }`. Adds a place from the caller's collection to the
trip and returns the trip detail (`200`). Adding a place that's already in the
trip changes nothing. `404` if the trip or place isn't the caller's.

### `DELETE /v1/trips/:id/places/:placeId`

Takes the place out of the trip (it stays in the collection) with its planned
visits; visits that already happened stay in history. Returns the trip detail
(`200`). Idempotent.

### Itinerary (days)

Every place in a trip has `day` (`"YYYY-MM-DD"` or `null`), `startTime`
(`"HH:MM"` or `null`), `position` (order within the day) and
`durationMinutes` (planned visit length or `null`). `day: null` means
the place is on the trip's **wishlist**; a set day means it is **planned** for
that day. Trip detail lists planned days first (by day, then position), then the
wishlist.

#### `PATCH /v1/trips/:id/places/:placeId`

Body (send at least one):

```json
{ "day": "2026-11-24", "startTime": "09:30" }
```

- `day` set: plans the place for that day, appended at the end. The day must be
  within the trip dates; a trip without both dates can't be planned
  (`400 VALIDATION_FAILED`). A time the place already has is kept.
- `day: null`: back to the wishlist; also clears the time.
- `startTime`: 24-hour `HH:MM`, or `null` to clear. Needs a day.
- `durationMinutes`: planned visit length, 5–720, or `null` to use the
  category default (coffee 30, food 60, sights 90, shopping 60, nightlife 90,
  outdoors 60, other 45). Kept when the place moves between days; cleared when
  it leaves the trip. Used by Today for free time and leave-by estimates.

Returns the trip detail (`200`). `404` if the place isn't in the trip.

#### `PUT /v1/trips/:id/days/:day/order`

Body `{ "placeIds": ["<uuid>", ...] }`: every place planned for that day, in the
new order. Returns the trip detail. `409 CONFLICT` if the list doesn't match the
day's places exactly (the day changed elsewhere; refresh and retry).

D1: since the visits model, a trip's dates can't be changed while planned places
fall outside them (`400 VALIDATION_FAILED`): move them first. Nothing is
unplanned silently. Removing a place from a trip also drops its plan.

**D1 · v1 on top of visits.** The plan now lives in visits (see v2). v1 shows
each place's earliest visit; `visitedAt` is the place's "visited" mark, else its
latest completed visit. `PATCH …/places/:placeId` acts on the place's single
visit (creates it, moves it, or removes it for `day: null`); a place with
several visits, or a visit already done or skipped (except `highlight`), is
`409 CONFLICT` with reason `USE_NEWER_APP`. `baseLocation`/`basePlaceId` edit the
trip's whole-trip stay (`409 … USE_NEWER_APP` when it has stays for different
nights). `GET /v1/trips` and `GET /v1/trips/:id` answer exactly as before for
single-visit data (golden tests).

`PATCH /v1/trips/:id/places/:placeId` also accepts `highlight` (boolean, M15): star
the stop as a trip highlight. Trip places carry `highlight` (default `false`).

#### `GET /v1/trips/:id/journal` (M15)

`{ "days": [{ "day": "2026-11-23", "note": "…" | null, "rating": 1-5 | null, "updatedAt": "…" }] }`:
the trip days that have a note or a rating, by date. User content only.

#### `PUT /v1/trips/:id/journal/:day` (M15)

Body: any of `note` (≤ 4000 chars, trimmed; blank or `null` clears) and `rating`
(1–5 or `null`). Fields not sent are kept. Creates the day's entry on first write.
`400` if the day is outside the trip dates. Returns the day entry.

## Places (the global collection)

A place is either:

- **google**: only `googlePlaceId` is stored (Google's terms). `name` and
  `address` are always `null`; get the current name, address, location and type
  from `GET /v1/google/places/:googlePlaceId`.
- **custom**: typed in by the user; `name`/`address` are theirs.

Both carry the user's own `notes`, `myLabel` (M12a: the user's short label, typed by
them, never filled from Google; `null` when unset; older servers omit it and the app
defaults it to `null`), `category`, `tags` and `visitedAt`.
Categories: `food, coffee, sights, shopping, nightlife, outdoors, stay, other`.

### `GET /v1/places`

Newest first, at most 500. `{ "items": [Place, …] }` (shape as in the trip example above, without `addedAt`).

### `POST /v1/places/google`

Save Google places by ID, optionally into a trip's wishlist. One row per Google
place per user: saving again returns the same place (a deleted one is revived).

```json
{ "items": [{ "googlePlaceId": "ChIJ…", "category": "food" }], "tripId": "0b8f…" }
```

1–20 items. Returns `201 { "places": [Place, …] }`. `404` if the trip isn't the caller's.

### `POST /v1/places/:id/google`

Link one of the caller's own places (saved by name, e.g. imported) to the Google place they
picked: `{ "googlePlaceId": "ChIJ…" }`. Returns `200` with the place as it now is:

- the Google place isn't saved yet → the **same** place (same id, trips and visits), now
  `source: "google"`; the user's name becomes `myLabel`, their address is added to `notes`;
  name, address and pin are cleared (Google content is never stored);
- it is already saved (even deleted) → **that** place, revived, with this place's trips, visits
  and stays moved to it; this place is soft-deleted.

Same ID again = no change; a Google place or another ID = `409 CONFLICT`; not the caller's = `404`.
No Google call is made.

### `POST /v1/places`

A custom place: `{ "name", "address"?, "notes"?, "category"? }`. Returns `201` with the place.
D1: optional `latitude` + `longitude` (the user's own pin; never 0,0) and
`linkedGooglePlaceId` ("Use my own pin": the Google place it stands in for, ID
only; the Google place itself is never changed).

Places (outside v1 trip responses) carry `latitude`, `longitude` and
`linkedGooglePlaceId` (`null` for Google places).

### `GET /v1/places/:id/visits` (D1)

The place's visit history, newest first: `{ "items": [{ "source": "visit" | "legacy_mark",
"tripId", "tripTitle", "stopId", "day", "completedAt" }] }`. Completed visits of
deleted trips stay unless deleted with `deleteHistory`.

### `POST /v1/timezones/lookup` (D1)

`{ "latitude", "longitude" }` → `{ "timeZone", "alternatives", "certain", "dataset" }`.
A suggestion for the user to confirm; nothing is stored or logged. Uses bundled
open data (tzf-wasm 2.0.2, loaded on the first lookup; boundaries from
timezone-boundary-builder, © OpenStreetMap contributors, ODbL; `dataset` is the
release the library reports, e.g. `2026f`). `certain` is
false at sea, on borders or in disputed areas.

### `GET /v1/places/:id` · `DELETE /v1/places/:id`

One place / soft-delete it (also removes it from every trip, `204`).

### `PATCH /v1/places/:id`

Any of `notes`, `myLabel` (≤60 chars, trimmed; blank or `null` clears; allowed on
Google places too), `category`, `tags` (≤10, each ≤30 chars, de-duplicated),
`visited` (boolean), and for custom places `name`, `address`, and (D1)
`latitude` + `longitude` (`null` both to remove the pin). Sending
`name`/`address`/coordinates for a Google place is `400`. `visited` only sets or
clears the place's mark; it never creates or completes a visit.

## Google

### `GET /v1/google/places/:googlePlaceId?lang=en|he`

Fresh Place Details from Google (Pro fields only), for display. Never stored.

```json
{
  "placeId": "ChIJ…",
  "name": "Katz's Delicatessen",
  "address": "205 E Houston St, New York",
  "location": { "latitude": 40.7223, "longitude": -73.9874 },
  "primaryType": "deli",
  "typeLabel": "Deli",
  "googleMapsUri": "https://maps.google.com/?cid=…",
  "businessStatus": "OPERATIONAL",
  "timeZone": "America/New_York"
}
```

Counts against the `GOOGLE_PLACE_DETAILS_*` caps (daily and monthly). `404` if
Google no longer knows the place. `timeZone` (added in M10) is the place's IANA
zone; the app uses the pinned hotel's zone to schedule reminders. Older servers
omit it; the app treats a missing value as `null`.

### `POST /v1/google/routes?lang=en|he` (M16)

Real travel times. Body: `{ "legs": [{ "from": LatLng, "to": LatLng, "mode": "walk" | "transit",
"departAt"?: ISO datetime with offset }] }`, 1–10 legs. Response: `{ "legs": [RouteLeg | null],
"limited": boolean }`, one entry per leg in order; `RouteLeg = { minutes, meters, mode,
polyline | null }` (Google encoded polyline). A leg is `null` when Google has no route
(e.g. no transit) or a cap stopped it (`limited: true`). One Google Compute Routes
Essentials call per leg, each counted against `GOOGLE_ROUTES_*` caps (150/day,
2,000/month by default). Paid rate-limit class. Nothing is stored. `503 NOT_CONFIGURED`
without a key.

## Discover

Two steps so the app can show what it understood before searching.

### `POST /v1/discover/interpret`

```json
{ "query": "best Italian near our hotel", "tripId": "0b8f…", "clarifications": [{ "question": "Where is your hotel?", "answer": "Midtown" }] }
```

Claude (if configured) turns the request into a search plan, or asks one question:

```json
{ "action": "search", "summary": "Italian restaurants in Midtown Manhattan",
  "plan": { "textQuery": "best Italian restaurants in Midtown Manhattan, New York", "includedType": "italian_restaurant", "openNow": false, "category": "food" },
  "interpretedBy": "ai" }
```

```json
{ "action": "clarify", "question": "Where is your hotel?", "options": ["Midtown", "SoHo", "Upper West Side"] }
```

`interpretedBy: "direct"` means no AI was used (no key, AI cap reached, or AI
error) and the user's words go to Google as typed. Claude receives only the
user's text and their own trip title/destination/dates, never Google data.

### `POST /v1/discover/search`

`{ "plan": SearchPlan, "tripId"?, "area"? }`, where the plan is validated (Google
type from a fixed list). Used by both modes:

- **Standard search** (the default in the app): the app builds the plan from what
  the user typed or the category chip they tapped, with no AI call, and sends an
  `area`:
  - `{ "kind": "near", "text": "Pod Times Square" }`: added to the text
    ("coffee near Pod Times Square"); used for the trip destination or hotel.
  - `{ "kind": "circle", "center": {lat,lng}, "radiusMeters": 100–50000 }`:
    biases results toward a point (the user's current location). The location
    is passed to Google for this search only and never stored.
  - `{ "kind": "bounds", "low": {lat,lng}, "high": {lat,lng} }`: only results
    inside the visible map ("Search this area").
- **AI search**: the plan from `/discover/interpret` (already names a location);
  no area.

Runs Google Text Search (Pro fields, 15 results, permanently closed places
removed) and marks what's already saved. `category` is our category for each
result, from Google's type (falling back to the plan's category):

```json
{ "results": [ { …GooglePlace, "savedPlaceId": null, "inTrip": false, "category": "coffee" } ] }
```

Counts against the `GOOGLE_TEXT_SEARCH_*` caps (daily and monthly).

## Trip assistant (D1)

### `POST /v1/assistant/extract-places`

Import: place names from text the user pasted (a chat message, recommendations).
`{ "text": "…" (1–4000), "locale": "en" | "he" }` → `200 { "action": "places", "places": [{ "name",
"note": string | null, "area": string | null }] }` (at most 100) or `{ "action": "unavailable" }`
(no key, over the `ai_interpret` caps, or an error). Names that aren't in the text are dropped. Rate
limited like other paid routes. The app reads lists and CSVs itself and calls this only for free text.

### `POST /v1/assistant/trip`

The user's request about their plan ("make Wednesday less busy", "תעביר את המוזיאון ליום
אחר") turned into planning instructions. Stateless: nothing is read or written in
the database. The app sends this only for requests its own rules can't read
(`features/assistant/rules.ts`, free and offline). Shapes: `packages/shared/src/trip-assistant.ts`.

```json
{ "message": "I want a calmer pace overall", "locale": "en",
  "context": { "today": "2026-11-23",
    "days": [{ "day": "2026-11-24", "visits": [{ "ref": "v1", "category": "sights", "label": "The Met", "start": null, "starred": true, "status": "planned" }] }],
    "wishlist": [] },
  "clarifications": [{ "question": "Which day?", "answer": "Tuesday" }] }
```

`context` holds only opaque refs, categories, times, stars, status and the
user's own words (`myLabel`, or the name of a place they created). Google names
and IDs are never sent (the schema is strict). Message ≤ 300 characters, ≤ 31
days, ≤ 150 items per list.

```json
{ "action": "plan", "summary": "Lighter Tuesday",
  "instructions": [{ "kind": "lighten", "day": "2026-11-24", "maxHours": null }] }
```

Instruction kinds: `lighten` (day, `maxHours` or null), `dayStart` / `dayEnd`
(`time`, `days`, `[]` = every day), `moreTime` (`category`, `extraMinutes` or
null), `keepFixed` (`starred` | `all`), `moveVisit` (`target` by ref / category /
text / day, `toDay` or null = best day), `findNearby` (`category`, English
`query`, `day`, `near`: `dayEnd` | `stay`; the search itself is a separate tap),
`catchUp` (no fields: running late today; visits whose time has passed get new
times from now, applied by the app to today only), `findPlace` (`query` = the
user's words naming a place or a kind, or null for "this place"; `category`,
`area` the user named, `nearPlanned`, `day`, `intent`: `locate` | `add`; the
app then searches Google Maps with `POST /v1/discover/search` only when the user
taps Search, and saves with `POST /v1/places/google` only on Apply). Live (on a
trip day): `skipVisit` (`target`, null = the next visit), `extendVisit` (`target`,
null = the one happening now; `extraMinutes` or null = 30), `closedVisit`
(`target`, null = the next one; the app offers skip / keep / an alternative
nearby), and `findPlace.nearHere` ("something interesting nearby": the app
searches around the user's one location reading, on tap).
The server drops instructions naming days or refs that aren't in the context.
Other answers: `{ "action": "clarify", "question", "options" }` (at most once;
after an answer it must plan) and `{ "action": "unavailable" }` (no key, AI cap
reached, Claude error or unusable output: the app keeps manual planning). The
instructions only shape the on-device proposal; the itinerary changes only when
the user applies it. Counts against the `AI_*` caps (`ai_interpret`).

### `GET /v1/google/places/:placeId/preview?lang=en|he`

The place preview: everything from the basic details plus `rating`,
`userRatingCount`, `openNow`, `openingPeriods` (M13: Google's regular weekly periods,
`{ open: { day, hour, minute }, close: … | null }`, day 0 = Sunday, place-local
time; `[]` when unknown or in a basic preview), `weekdayHours` (text lines in the requested
language) and `photos` (up to 10: `name`, size, author `attributions`, and
`googleMapsUri`, the photo on Google Maps, which the app links each shown photo to). One
Place Details Enterprise call (owner-approved, capped: `GOOGLE_PLACE_PREVIEW_*`).
When the cap is reached it returns the free basic fields with `detail: "basic"`
(otherwise `"full"`). No review text.

### `GET /v1/google/photos?name=places/…/photos/…&maxWidth=100–1200`

`{ "uri": "https://…" }`: a short-lived image URL for one photo from a preview
(no API key in it). One Place Details Photos call per request, capped
(`GOOGLE_PLACE_PHOTO_*`). Show the photo's author with it.

## Usage (cost monitoring)

### `GET /v1/usage`

This server's paid API usage (all users together; no user data):

```json
{ "day": "2026-11-17", "month": "2026-11", "items": [
  { "metric": "google_text_search", "sku": "Places API Text Search Pro", "today": 12, "month": 140,
    "dailyCap": 160, "monthlyCap": 4500, "freePerMonth": 5000, "usdPer1000": 32, "estimatedCostUsd": 0 } ] }
```

Metrics: `google_text_search`, `google_place_details`, `google_place_preview`,
`google_place_photo`, `ai_interpret` (Ask AI and the trip assistant). When a cap is used up, the feature answers
`429 DAILY_LIMIT_REACHED` or `429 MONTHLY_LIMIT_REACHED`.

## Rate limits

Every signed-in user may make **240 requests per minute** across the API and
**60 per minute** on the paid routes (`/v1/discover/*`, `/v1/google/*`, `/v1/assistant/*`).
Above that the API answers `429 RATE_LIMITED`, with
`details: [{ "path": "retryAfterSeconds", "message": "<seconds>" }]`. Limits are
per API instance and in memory (one Render instance today). Configure with
`RATE_LIMIT_PER_MINUTE` and `RATE_LIMIT_PAID_PER_MINUTE`. The daily/monthly cost
caps (`DAILY_LIMIT_REACHED`, `MONTHLY_LIMIT_REACHED`) apply on top.

## API v2 (D1: visits, stays, time zones)

Same authentication and error format. Shapes: `packages/shared/src/stop.ts`,
`stay.ts`, `trip-v2.ts`, `timezone.ts`. Every create accepts an optional
client-generated `id` (offline): repeating it is a no-op.

| Route | What |
| --- | --- |
| `GET /v2/trips/:id` | `{ trip, places, stops, stays }`. `trip` has `timeZone`/`timeZoneSource`, no base fields. `places` are the saved places (`tripPlaceId`, `savedAt`). |
| `PATCH /v2/trips/:id` | `title`, `destination`, dates, `timeZone` (stored as the user's choice; `null` clears). Dates leaving visits outside: `409 STOPS_OUTSIDE_DATES` with the list, unless `unscheduleOutside: true` (removes planned visits; visits that started, were done or skipped are never removed). A stay covering exactly the old dates follows the new ones. |
| `DELETE /v2/trips/:id[?deleteHistory=1]` | Soft-deletes the trip and its stays; completed visits stay in place history unless `deleteHistory`. |
| `POST /v2/trips/:id/places` · `DELETE /v2/trips/:id/places/:tripPlaceId` | Save a place to the trip (`200`, trip detail) / remove it with its planned visits. |
| `POST /v2/trips/:id/stops` | A visit: `{ tripPlaceId, day, startTime?, durationMinutes?, highlight?, timeZone?, location? }` → `201 { stop, timeZoneSuggestion }`. A place can have any number of visits. |
| `PATCH /v2/trips/:id/stops/:stopId` | `day`, `startTime`, `durationMinutes`, `tripPlaceId` (planned/in-progress only), `highlight`, `timeZone`. |
| `POST /v2/trips/:id/stops/:stopId/{arrive,complete,skip,reset}` | Lifecycle; optional `{ at }` (when it happened, not in the future). Repeating the current state is a no-op; anything else that doesn't fit is `409 INVALID_TRANSITION`. |
| `DELETE /v2/trips/:id/stops/:stopId[?confirm=1]` | Removes a visit (soft); a completed one needs `confirm`. |
| `PUT /v2/trips/:id/days/:day/order` | `{ stopIds }`: the day's visits in order (`409` if stale). |
| `POST/PATCH/DELETE /v2/trips/:id/stays[/:stayId]` | Stays: `placeId` and/or `label` (the user's text, unchanged), `checkIn`/`checkOut` (both or neither = whole trip). Shared nights: `409 STAY_OVERLAP`. Each stay carries its `place` (the hotel; Google places by ID only). v1's `baseLocation`/`basePlaceId` follow the stay of the first night. |

**Time zones (D1 Q3).** A zone the user sends is stored as `user`. For a custom
place with the user's own pin the server derives the zone and stores it as
`derived` (with the boundary data release) when unambiguous. A `location` the app
sends (e.g. a Google place's coordinates) only produces a `timeZoneSuggestion`
in the response; nothing is stored until the user confirms it.

## Versioning

`/v1` changes only in backward-compatible ways (new optional fields, new
routes); since D1 it is an adapter over the visits model and stays until no
installed app uses it. New trip work goes to `/v2`. Every record carries `version` and
`updatedAt` for future conflict handling and sync.
