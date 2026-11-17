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

Any of `title`, `destination`, `baseLocation` (where the user stays, e.g. a
hotel or area; used by discovery for "near my hotel"), `startDate`, `endDate`.
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

## Places (the global collection)

A place is either:

- **google**: only `googlePlaceId` is stored (Google's terms). `name` and
  `address` are always `null`; get the current name, address, location and type
  from `GET /v1/google/places/:googlePlaceId`.
- **custom**: typed in by the user; `name`/`address` are theirs.

Both carry the user's own `notes`, `category`, `tags` and `visitedAt`.
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

Any of `notes`, `category`, `tags` (≤10, each ≤30 chars, de-duplicated),
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
  "businessStatus": "OPERATIONAL"
}
```

Counts against `GOOGLE_PLACE_DETAILS_DAILY_CAP`. `404` if Google no longer knows the place.

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

`{ "plan": SearchPlan, "tripId"? }`, where the plan is validated (Google type
from a fixed list). Runs Google Text Search (Pro fields, 15 results,
permanently closed places removed) and marks what's already saved:

```json
{ "results": [ { …GooglePlace, "savedPlaceId": null, "inTrip": false } ] }
```

Counts against `GOOGLE_TEXT_SEARCH_DAILY_CAP`.

## Versioning

`/v1` changes only in backward-compatible ways (new optional fields, new
routes). Breaking changes would go to `/v2`. Every record carries `version` and
`updatedAt` for future conflict handling and sync.
