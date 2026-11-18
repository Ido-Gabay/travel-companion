# API reference

Base URL in development: `http://<your-mac-ip>:3000` (use `localhost` from the Mac
itself). All application routes are under `/v1`. Request and response bodies are
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
| 409 | `CONFLICT` | Duplicate record. |
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

Soft-deletes the trip. `204`. Places stay in the collection.

### `POST /v1/trips/:id/places`

Body `{ "placeId": "<uuid>" }`. Adds a place from the caller's collection to the
trip and returns the trip detail (`200`). Adding a place that's already in the
trip changes nothing. `404` if the trip or place isn't the caller's.

### `DELETE /v1/trips/:id/places/:placeId`

Takes the place out of the trip (it stays in the collection). Returns the trip
detail (`200`). Idempotent.

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

Changing a trip's dates moves places whose day falls outside the new dates back
to the wishlist. Removing a place from a trip also drops its plan.

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

### `POST /v1/places`

A custom place: `{ "name", "address"?, "notes"?, "category"? }`. Returns `201` with the place.

### `GET /v1/places/:id` · `DELETE /v1/places/:id`

One place / soft-delete it (also removes it from every trip, `204`).

### `PATCH /v1/places/:id`

Any of `notes`, `myLabel` (≤60 chars, trimmed; blank or `null` clears; allowed on
Google places too), `category`, `tags` (≤10, each ≤30 chars, de-duplicated),
`visited` (boolean), and for custom places `name`, `address`. Sending
`name`/`address` for a Google place is `400`.

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
`google_place_photo`, `ai_interpret`. When a cap is used up, the feature answers
`429 DAILY_LIMIT_REACHED` or `429 MONTHLY_LIMIT_REACHED`.

## Rate limits

Every signed-in user may make **240 requests per minute** across the API and
**60 per minute** on the paid routes (`/v1/discover/*`, `/v1/google/*`).
Above that the API answers `429 RATE_LIMITED`, with
`details: [{ "path": "retryAfterSeconds", "message": "<seconds>" }]`. Limits are
per API instance and in memory (one Render instance today). Configure with
`RATE_LIMIT_PER_MINUTE` and `RATE_LIMIT_PAID_PER_MINUTE`. The daily/monthly cost
caps (`DAILY_LIMIT_REACHED`, `MONTHLY_LIMIT_REACHED`) apply on top.

## Versioning

`/v1` changes only in backward-compatible ways (new optional fields, new
routes). Breaking changes would go to `/v2`. Every record carries `version` and
`updatedAt` for future conflict handling and sync.
