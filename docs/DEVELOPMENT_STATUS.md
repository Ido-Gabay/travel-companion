# Development status

**Last updated: 2026-11-17 (M11 trip readiness written).**
Update this file at the end of every milestone or meaningful change.

## Snapshot

- **Last commit on `main`:** `52c49b6` "M10: local reminders, trip time zone; AI handoff docs".
- **Uncommitted when this was written:** M11 trip readiness (trip time zone for
  Today/Home/itinerary, API rate limiting, Google attribution component, photo
  links, notification attribution, Hebrew tab label) and these doc updates.
- **Native build:** the iOS project was regenerated after M10 (contains
  `expo-notifications`, entitlements empty = no push). M11 needs no native rebuild.
- **Current milestone:** M11 written. Next: owner verification, then the iPhone
  Release install for the trip (R1, Nov 21–22).
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

## Tests

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
| `20261117220000_visit_duration` | `trip_places.duration_minutes` | **Confirm**: M9 committed; push not confirmed in writing. Check with `npx supabase migration list --linked`. |

M10 adds no migration.

## Deployment status

| Piece | Where | State |
| --- | --- | --- |
| API | Render Free, Singapore, `https://travel-companion-api-joqe.onrender.com`, auto-deploys `main` | Running M9 if the M9 push deployed; M10 API change (time zone field) deploys on the next push |
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
- **Travel times are estimates** (no Routes API); subway/taxi estimate is coarse.
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
- No offline mode yet (D5a/D11/D15/D17 pending POCs).

## Exact next steps

1. **Owner (M11 verification):**
   ```sh
   cd ~/Programing/travel-companion
   pnpm test && pnpm typecheck
   git add -A && git commit -m "M11: trip readiness" && git push
   pnpm smoke:api                 # after Render shows the new deploy as Live
   pnpm ios                       # no native rebuild needed for M11
   ```
   Check: Today with the NY hotel pinned shows New York's day/time (Preview is
   used before the trip); "Google Maps" label under Google content; tapping a
   preview photo opens Google Maps; Hebrew trip tabs fit.
   Also the M10 checks: Profile → Reminders → on → allow → "Send a test
   reminder" (~5 s); a stop timed ~20 min ahead on a trip day that includes
   today → "Leave in 10 min".
2. Confirm the `visit_duration` migration is applied (`npx supabase migration list --linked`).
3. **R1 (Nov 21–22):** set Team in Xcode, `pnpm ios:release`, walk the checklist:
   cellular data only; sign in; pin hotel; Discover near hotel; save; plan days
   with times; Today preview; reminders test; relaunch keeps session; Hebrew.
4. Then M11 trip-readiness polish (see ROADMAP.md).

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
