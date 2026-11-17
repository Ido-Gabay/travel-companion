# Architecture

Status: Phase 1 (foundation). Decisions trace back to the Phase 1, offline-first
and Phase 1.2 research docs. This file describes what exists in the code and the
rules new code must follow.

## System overview

```
iPhone / Android app (Expo, React Native)
   │  1. sign in with email + password ──────────► Supabase Auth
   │  ◄──────────── access token (JWT, ES256) ────┘
   │
   │  2. HTTPS + "Authorization: Bearer <token>"
   ▼
NestJS API (modular monolith)  ── verifies JWT locally with Supabase's public keys (JWKS)
   │
   │  3. SQL, one transaction per request, as role "authenticated" with the caller's claims
   ▼
Supabase Postgres, private schema "app", Row Level Security on every table
```

- **Supabase Auth** issues and refreshes sessions. The app talks to it directly
  for sign-up, sign-in and sign-out only.
- **The NestJS API** is the only way to read or write application data. It owns
  validation and business rules.
- **Postgres** stores everything in the `app` schema. `app` is not exposed
  through Supabase's Data API, so the publishable key in the app cannot query it.

## Repository layout

```
apps/api            NestJS 12 (ESM, TypeScript strict, Vitest)
  src/config        environment validation (fails fast at startup)
  src/auth          JWT verification, global guard, @Public, @CurrentUser
  src/database      postgres.js pool, asUser() transactions
  src/common        error format, exception filter, zod validation pipe
  src/health        /health, /health/ready
  src/me            profile + preferences
  src/trips         trips, trip detail, adding/removing places
  src/places        the global collection (Google place IDs + user data, or custom places)
  src/google        the only code that calls Google Places API (New)
  src/ai            Claude: request -> structured search plan / clarification
  src/discover      interpret + search endpoints (AI proposes, Google finds, user saves)
  src/usage         daily cost caps for paid APIs (app.provider_usage)
apps/mobile         Expo SDK 58 app (milestone M3)
packages/shared     zod schemas = the API contract, used by both sides
supabase/migrations SQL migrations, applied with `supabase db push`
```

## Backend rules

**Modules by feature.** Each feature (`me`, `trips`, later `places`, `itinerary`)
is a Nest module with its own controller, service and SQL. Modules talk through
services, never through each other's tables. No microservices.

**Deny by default.** `AuthGuard` is registered globally. Every route needs a
valid user token unless it is explicitly marked `@Public()` (today only health).

**Token verification.** `JwtVerifier` uses `jose` with
`createRemoteJWKSet(<SUPABASE_URL>/auth/v1/.well-known/jwks.json)`. It checks
signature, `iss`, `aud = authenticated`, expiry, `role = authenticated`, rejects
anonymous users and only allows asymmetric algorithms (no shared-secret HS256).
Keys are cached and refetched on rotation, so there is no network call per request.

**Data isolation, twice.**
1. Every query filters by the caller's id explicitly.
2. `DatabaseService.asUser()` runs the request in a transaction with
   `set local role authenticated` and `request.jwt.claims` set, so Postgres RLS
   policies (`auth.uid() = owner`) apply as well. A missing `WHERE` cannot leak
   another user's rows.

**Validation.** Request bodies are parsed with the zod schemas in
`packages/shared` through `ZodValidationPipe`. Unknown keys are rejected. The
database repeats the important limits as `CHECK` constraints.

**Errors.** Every error body is `{ "error": { "code", "message", "details?" } }`
with a stable `code` (see docs/API.md). Unexpected errors return a generic 500
and are logged server-side; internals never reach the client.

**Config.** `parseAppConfig` validates environment variables at startup. Secrets
are never logged.

**Data access.** Plain SQL with `postgres.js`, no ORM. SQL is short and lives next
to the service that uses it. Calendar dates are returned as `YYYY-MM-DD` strings
(selected `::text`) so they never shift with time zones.

## Place discovery (AI + Google)

```
user text --> POST /discover/interpret --> AiService (Claude Haiku 5.5, structured JSON)
                                             | sees: user text + their trip title/destination/dates
                                             v
                                   plan {textQuery, includedType, openNow, category}  or  clarify
user sees "Searching for …" --> POST /discover/search --> GooglePlacesService.searchText (Pro fields)
                                             v
                     results (+ already saved?) --> user selects --> POST /places/google
```

- AI proposes, the user chooses, the backend validates and saves. Claude
  never sees Google results and never names places.
- Saved Google places store only the place ID; display data is fetched fresh
  from Google (`GET /google/places/:id`) and kept in app memory for the session.
- Every paid call passes `UsageGuardService.consume()` first (daily caps).
- See [GOOGLE_AND_AI.md](GOOGLE_AND_AI.md) for costs, keys and Google's rules.

## Database conventions

- Private schema `app`; `anon` has no access; `authenticated` has
  SELECT/INSERT/UPDATE, never DELETE.
- Primary keys are UUIDs. Client-generated UUIDs will be accepted later for
  offline creation; today the database generates them.
- Every table has `created_at`, `updated_at` and `version` (bumped by the
  `app.touch_row()` trigger on every update). Deletable entities have
  `deleted_at` (soft delete). These are what a sync engine needs.
- RLS is enabled on every table with per-owner policies.
- A trigger on `auth.users` creates `app.profiles` and `app.user_preferences`
  at sign-up. The API also creates them on first request as a safety net.
- Constraint and index names are explicit. Migrations are append-only: never
  edit a migration that has been applied; add a new one.

Tables today: `profiles`, `user_preferences`, `trips`, `places` (the user's
collection: a Google place ID or a user-typed name, plus category, notes, tags,
visited; constraints forbid copying Google text), `provider_usage` (daily API
counters) and `trip_places` (which places are in which
trip; one row per pair, removed/re-added via `deleted_at`). The RLS insert policy
on `trip_places` also checks that both the trip and the place belong to the
caller. Itinerary tables (`itinerary_revisions`, `itinerary_items`) are not
created until the itinerary feature is built. An optional provider place id
(e.g. a Google place ID, the only Google field the terms allow keeping) can be
added to `places` later without changing anything else.

## Mobile rules

- Expo Router with a development build (not Expo Go). Bottom tabs: Home, Trips,
  Places, Profile.
- Server state through TanStack Query; the API client attaches the Supabase
  access token and maps the error `code` to translated messages.
- English (default) and Hebrew with real RTL layout (logical start/end styles,
  never hard-coded left/right). Changing language flips the layout immediately:
  the root view gets `direction: 'rtl' | 'ltr'` and Expo Router's `LocaleProvider`
  gets the same direction. `I18nManager.forceRTL` is also set so native views
  match from the next launch. The language is stored on the device and in the
  user's server preferences (server wins once the user has changed it).
- Design tokens and a small component set; system fonts (SF Pro / Roboto cover
  Hebrew). Icons from `@expo/vector-icons`, never emoji.
- Only public values in the app: Supabase URL, publishable key, API URL.
- Routing: `src/app` with `Stack.Protected` guards: signed-out users only reach
  `(auth)` (welcome, sign-in, sign-up); signed-in users reach `(tabs)` and
  `trips/new`. Sign-out clears the query cache.
- Every API response is validated with the shared zod schema before use.
- "Open in Maps" passes the user's own name/address as a search to Apple Maps
  (iOS) or Google Maps (Android). Nothing comes back into the app.
- No control is shown unless it works. The Places tab explains the feature and
  has no add button until saving places exists.

## Deliberately postponed (and how the design keeps the door open)

| Later | What keeps it possible now |
| --- | --- |
| PowerSync offline sync | UUIDs, `version`, `updated_at`, `deleted_at` on every table; all writes go through the API, which becomes the PowerSync upload handler (`/sync/mutations`). |
| SQLCipher encrypted local DB | The app does not use `expo-sqlite` (it would conflict with `op-sqlite`, which PowerSync + SQLCipher need). |
| Google Places / Maps / Routes | Only Google place IDs may be stored long-term; names, addresses, photos, hours and reviews are never persisted. Nothing Google-related exists yet. |
| Claude (AI planning) | No Google content will be sent in prompts. Not built yet. |
| Sign in with Apple / Google | Supabase Auth supports them; the API only cares about the JWT. |
| Encrypted session storage | Session storage is behind one adapter in the app, so swapping AsyncStorage for an encrypted store is a one-file change. |

## Deployment

Zero-cost setup: Render Free (API, Singapore) + Supabase Free (Singapore) +
GitHub. Details, free-tier limits and the migration path are in
[DEPLOYMENT.md](DEPLOYMENT.md). The API is a single stateless Node process
configured only by environment variables, with `/health` and `/health/ready`,
so it can move to Railway or Cloud Run without code changes. Because the free
host sleeps when idle, the app pings `/health` at launch, allows 75-second
requests and tells the user when the server is waking up.
