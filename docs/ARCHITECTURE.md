# Architecture

Status: as of M10 (2026-11-17). Describes what exists in the code and the rules
new code must follow. Decisions and their reasons: [DECISIONS.md](DECISIONS.md).
Current state and test status: [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md).

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

### External integrations

| Service | Used by | For | Notes |
| --- | --- | --- | --- |
| Supabase Auth | app (sign-in), API (JWKS) | Accounts, JWTs | Email + password |
| Google Places API (New) | API only (server key) | Text Search, Place Details (basic, preview), photos | Capped per SKU; only place IDs stored; see GOOGLE_AND_AI.md |
| Google Maps SDK for iOS | app | Maps (`PROVIDER_GOOGLE`) | Restricted iOS key, free |
| Google Maps URLs | app | Directions, open place, day route | No key, no cost |
| Anthropic Claude Haiku 5.5 | API only | "Ask AI": words → search plan | Capped; never sees Google content |
| Device: location | app | "Near me", Today | Foreground, one reading, never stored |
| Device: local notifications | app | Reminders | No push, no server |

### Main data flows

- **Discover:** app → `POST /v1/discover/search` (plan + area) → Google Text
  Search → results with "already saved?" → user saves → `POST /v1/places/google`
  (dedupe by place ID, optional trip). Ask AI adds `POST /v1/discover/interpret` first.
- **Display a saved place:** app → `GET /v1/google/places/:id` (fresh, cached in
  app memory ≤ 6 h); preview → `/preview`; photo → `/google/photos`.
- **Plan:** app → `PATCH /v1/trips/:id/places/:placeId` (day, time, duration) /
  `PUT …/days/:day/order` → trip detail returned and cached.
- **Today and reminders:** computed **on the device** from the cached trip
  detail, Google details (locations, time zone) and the clock; actions the user
  accepts go back through the planning endpoints. Reminders are scheduled
  locally by `ReminderSync`.

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
  src/usage         daily/monthly cost caps for paid APIs (app.provider_usage), GET /v1/usage
  src/rate-limit    per-user request limits (global guard after AuthGuard)
apps/mobile         Expo SDK 58 app
  src/app           Expo Router routes: (auth), (tabs) Home/Discover/Trips/Places/Profile,
                    trips/[id]/*, places/*, today, settings/usage, settings/reminders
  src/features      by area: auth, me, trips, places, discover, companion
  src/features/companion  Live Companion: location, geo, travel estimates, Today engine,
                    zoned time, reminder planner/diff (pure + tested), notifications wrapper,
                    ReminderSync, dismissals, reminder settings
  src/components    ui kit (AppText, Button, Card, Sheet, …), maps (PlacesMap)
  src/i18n          en.ts / he.ts (same keys, checked by a test), RTL handling
  src/lib           API client (validates responses), env, dates, errors
packages/shared     zod schemas = the API contract, used by both sides
supabase/migrations SQL migrations, applied with `supabase db push`
```

## Backend rules

**Modules by feature.** Each feature (`me`, `trips`, later `places`, `itinerary`)
is a Nest module with its own controller, service and SQL. Modules talk through
services, never through each other's tables. No microservices.

**Rate limits.** `RateLimitGuard` runs after `AuthGuard`: per user, 240
requests/minute overall and 60/minute on Google/Claude routes, in memory
(single instance; decision T13). Cost caps apply on top.

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

## Place discovery (Google first, AI optional)

```
Search (default):  typed text / category chip + area ──────────────┐
                   area = near destination | circle around hotel    │
                          (pinned place) or user | map bounds        v
Ask AI (optional): user text -> POST /discover/interpret -> plan -> POST /discover/search
                   (Claude Haiku 5.5 sees only the user's        (GooglePlacesService.searchText,
                    words + their own trip fields)                 Pro fields, category per result)
                                                                     v
                 results (+ already saved / in trip?) -> preview (GET /google/places/:id/preview)
                                                     -> save: POST /places/google (+ optional tripId)
```

- **Google Maps search is the standard experience; AI enhances it.** Both modes
  end in the same Google search and the same results UI.
- AI proposes, the user chooses, the backend validates and saves. Claude
  never sees Google results and never names places.
- Saving is deduplicated by Google place ID: one collection row per place; a
  saved place can be added to any number of trip wishlists.
- Saved Google places store only the place ID; display data is fetched fresh
  from Google and kept in app memory for the session.
- Every paid call passes `UsageGuardService.consume()` first (daily and monthly
  caps); `GET /v1/usage` reports usage and estimated cost.
- See [GOOGLE_AND_AI.md](GOOGLE_AND_AI.md) for costs, keys and Google's rules.

## Live Travel Companion

The long-term core of the product: Today answers *where am I in my day, what's
next and when to leave, what fits the time I have, should I change my plan*.
The app suggests; the user decides. Design, data needs, privacy and the
milestone plan: [LIVE_COMPANION.md](LIVE_COMPANION.md).

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

Tables today (all in `app`, RLS per owner):

| Table | Key columns | Notes |
| --- | --- | --- |
| `profiles` | `id` (= auth user), `display_name` | Created at sign-up |
| `user_preferences` | `locale`, `distance_unit` | |
| `trips` | `title`, `destination`, `start_date`, `end_date`, `base_location` (user's words), `base_google_place_id` (pinned hotel, ID only) | Soft delete |
| `places` | `google_place_id` **or** `name`/`address` (custom), `category`, `notes`, `tags`, `visited_at` | The **Global Collection**. Unique `(owner_id, google_place_id)`; a constraint forbids name/address on Google rows |
| `trip_places` | `trip_id`, `place_id`, `day`, `position`, `start_time`, `duration_minutes` | The **Trip Wishlist**; rows with a `day` form the **Itinerary** (decision T7). One row per pair, re-added via `deleted_at` |
| `provider_usage` | `day`, `metric`, `count` | Paid-API counters for caps; service role only |

The RLS insert policy on `trip_places` also checks that both the trip and the
place belong to the caller. Migration list and status: DEVELOPMENT_STATUS.md.

## Mobile rules

- Expo Router with a development build (not Expo Go). Bottom tabs: Home,
  Discover, Trips, Places, Profile.
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
  `(auth)` (welcome, sign-in, sign-up); signed-in users reach everything else.
  Sign-out clears the query cache and cancels this app's scheduled reminders.
- Every API response is validated with the shared zod schema before use.
- Google places open in Google Maps via official URLs (place, directions,
  multi-stop route). Custom places open a search with the user's own text.
- Device-only state (Today dismissals, reminder settings and mutes) lives in
  AsyncStorage (decision T11).
- Native config is in `app.config.ts`: Google Maps key (only when set),
  `expo-location` (when-in-use text, background off), `expo-notifications`
  (`enableRemoteNotifications: false`, so no push entitlement; decision T10).
- No control is shown unless it works.

## Trip journal (M15)

Server: `app.trip_journal_days` (one row per trip day: note, rating; RLS: owner and
own trip) and `trip_places.highlight`; `GET/PUT /v1/trips/:id/journal[/:day]`.
App: `features/journal/` — `queries.ts` (journal query with pending changes on top;
writes go to the M12a change queue as `journal` ops), `DayJournal.tsx` (under each
day's stops: rating, note sheet, what you did), `recap.ts` (pure recap + share text),
route `trips/[id]/recap`. Highlights are a `schedule` op field. The journal is part
of the offline saved copy (`journal.<tripId>`).

## Smart day planning (M13)

`apps/mobile/src/features/planning/`: `day-planner.ts` (pure: `projectDay`,
`checkDay`, `optimizeOrder` (cheapest insertion + relocation, timed/done/unlocated
stops fixed, gap-aware), `suggestTimes`), `opening-hours.ts` (pure: weekly periods →
day windows, `firstFit`, `hoursIssue`), `DayPlanning.tsx` (summary line, warnings,
"Plan this day" sheet). Inputs: stop locations from Google details or cached
coordinates (M12a), visit lengths, the hotel as the start; travel from
`companion/travel.ts`. Opening hours come from the preview endpoint only after
"Check opening hours" (`useGooglePlacePreviews`, in memory). Apply goes through the
M12a change queue (reorder + per-stop start times), so it works offline and is
conflict-checked.

## Offline-tolerant trip mode (M12a)

A travel MVP, not full offline-first. All code is in `apps/mobile/src/features/offline/`
(pure modules have specs next to them).

| Piece | Module | What it does |
| --- | --- | --- |
| Saved copy | `trip-cache.ts`, `storage.ts` | AsyncStorage JSON per user (`tc.offline.v1.<userId>.trips / trip.<id> / me / coords / ops / conflicts`). Validated with the shared zod schemas on load; Google places' name/address stripped. Wiped on sign-out (`AuthProvider`); other users' keys removed on sign-in. |
| Restore and keep current | `OfflineProvider.tsx` | Before any screen (or ReminderSync) renders, puts the saved copy into the TanStack Query cache with `updatedAt` = when it came from the server (so it refreshes). Saves trip list/details/profile as server data arrives; prefetches up to 3 upcoming trips' details; caches coordinates of trip places. |
| Connectivity | `connection.ts`, `lib/api.ts` | Online/offline learned from real requests (any HTTP answer = online; network error/timeout = offline). While offline: `/health` ping every 30 s and on foreground; when back, refetch active queries and sync. No NetInfo (no native module). |
| Coordinates | `coords.ts` | Google lat/lng only, ≤ 30 days (Google terms), with source and fetch time; expiry enforced on every read and deleted at launch/foreground/write. Used offline for travel estimates (Today, reminders). |
| Pending changes | `pending-ops.ts`, `ops-store.ts` | Done (`visited`), `reorder`, and per-field `schedule` (day, startTime, durationMinutes) are recorded and persisted before sending, merged per target (undo cancels out). Screens show server copy + pending changes (`useTrip`/`usePlace` `select`), so the cache and saved copy stay pure server data. |
| Sync | `sync.ts`, `ops-store.ts` | One run at a time, in creation order: re-read the server; already there → drop; still the starting value → send; otherwise → conflict (kept, never sent). 404 → "gone", 400/409/403 → "rejected" (kept for the user); network → stop and retry later; 5xx/429/401 → retry later. Edits made during a run survive (`settleQueue`). Triggers: after each change, reconnect, foreground, every 30 s while pending, "Sync now". |
| UI | `OfflineStatus.tsx`, `ConflictSheet.tsx` | One quiet status box (offline/saved copy time, changes waiting, changes needing a choice → Keep mine / Use the server's / Discard). Cloud marker on stops with a pending change. Sign-out warns about unsynced changes. |
| Names offline | `places/use-place-display.ts` | `myLabel` (user-typed) or the category; never a stored Google name. |
| Reminders | `companion/reminders.ts`, `ReminderSync.tsx` | `reminderSyncMode`: cancel only for a known reason (off, no permission, trip list known and no trip); missing data → wait. Missing Google details → "preserve": keep reminders scheduled earlier unless the user's own plan for them changed (`reminderPlanKey`, stored with each notification). |

Needs a connection: Discover, maps tiles, photos, add/remove places, edit/delete
trips, accepting Today suggestions. Future PowerSync/SQLite (M12) replaces the copy
and queue behind the same module boundary; the queue already has upload-queue shape.

## Deliberately postponed (and how the design keeps the door open)

| Later | What keeps it possible now |
| --- | --- |
| PowerSync offline sync | UUIDs, `version`, `updated_at`, `deleted_at` on every table; all writes go through the API, which becomes the PowerSync upload handler (`/sync/mutations`). |
| SQLCipher encrypted local DB | The app does not use `expo-sqlite` (it would conflict with `op-sqlite`, which PowerSync + SQLCipher need). |
| Routes API (exact travel times) | Travel estimates are isolated in `features/companion/travel.ts`; swapping in a server-side Routes call later changes one module. Needs cost approval. |
| Background location / geofencing | Location access is isolated in `features/companion/location.ts`; Today and reminders already take "where" as an input. Separate opt-in phase. |
| Server-side reminders / push | Reminder planning is pure (`reminders.ts`) and could run on the server; push needs the paid Apple program. |
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
