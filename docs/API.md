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
| 429 | `RATE_LIMITED` | Reserved; no rate limiting yet. |
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
      "placeId": "6f1c2b9e-…",
      "name": "Katz's Delicatessen",
      "address": "205 E Houston St, New York",
      "notes": "Pastrami on rye. Keep the ticket!",
      "addedAt": "…"
    }
  ]
}
```

### `DELETE /v1/trips/:id`

Soft-deletes the trip. `204`. Places stay in the collection.

### `POST /v1/trips/:id/places`

Body `{ "placeId": "<uuid>" }`. Adds a place from the caller's collection to the
trip and returns the trip detail (`200`). Adding a place that's already in the
trip changes nothing. `404` if the trip or place isn't the caller's.

### `DELETE /v1/trips/:id/places/:placeId`

Takes the place out of the trip (it stays in the collection). Returns the trip
detail (`200`). Idempotent.

## Places

The user's global collection. Every field is text the user typed; nothing is
fetched from or stored for a third-party place provider.

### `GET /v1/places`

Newest first, at most 500.

```json
{
  "items": [
    {
      "id": "6f1c2b9e-…",
      "name": "Katz's Delicatessen",
      "address": "205 E Houston St, New York",
      "notes": "Pastrami on rye.\nCash or card.",
      "tripCount": 1,
      "createdAt": "…",
      "updatedAt": "…",
      "version": 1
    }
  ]
}
```

`tripCount` is how many of the caller's (non-deleted) trips include the place.

### `POST /v1/places`

```json
{ "name": "Katz's Delicatessen", "address": "205 E Houston St", "notes": "Pastrami on rye." }
```

- `name`: required, trimmed, 1–120 characters.
- `address`: optional, up to 200; blank becomes `null`.
- `notes`: optional, up to 2000, line breaks kept; blank becomes `null`.

Returns `201` with the place.

### `GET /v1/places/:id`

One place. `404` if missing or not the caller's.

### `PATCH /v1/places/:id`

Any of `name`, `address`, `notes`; at least one. `null` (or blank) clears
`address`/`notes`. Returns the place.

### `DELETE /v1/places/:id`

Soft-deletes the place and removes it from every trip. `204`.

## Versioning

`/v1` changes only in backward-compatible ways (new optional fields, new
routes). Breaking changes would go to `/v2`. Every record carries `version` and
`updatedAt` for future conflict handling and sync.
