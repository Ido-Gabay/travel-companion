# Development status

**Last updated: 2026-11-17 (M12a offline-tolerant trip mode written on top of U1).**
Update this file at the end of every milestone or meaningful change.

## Snapshot

- **Last commit seen on the Mac:** `a82061b` "U1: UX/UI redesign" (committed by the owner).
- **Uncommitted when this was written:** M12a (app, shared, API, one migration) and these doc updates.
- **Native build:** the iOS project was regenerated after M10 (contains
  `expo-notifications`, entitlements empty = no push). M11 needs no native rebuild.
- **Current milestone:** M12a written (stages 1–4). Next: owner verification (tests,
  migration push, deploy, Simulator airplane-mode checklist), then the iPhone Release
  install for the trip (R1, Nov 21–22). M12a adds **no native dependency**: no rebuild.
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

## M12a – Offline-tolerant trip mode (written; device checks pending)

Stages (owner's priority order) and their state. Design: docs/ARCHITECTURE.md → "Offline-tolerant trip mode".

| Stage | Scope | Code | Tests run in session | Unverified |
| --- | --- | --- | --- | --- |
| 1 | Reminder reliability: never cancel because data failed to load; offline keeps reminders scheduled earlier (only stops changed offline are replaced) | ✅ written | `reminders.spec.ts` 21/21 (10 new); app `tsc` clean; i18n parity clean | On-device: airplane-mode launch keeps reminders |
| 2 | Offline viewing: per-user saved copy (AsyncStorage) of trip list, trip details, profile; restored before screens render; Home/Trip/Itinerary/Today/place show the copy when refresh fails, with an "Offline · saved copy from …" line; category names offline; Google coordinates ≤ 30 days (auto-deleted); wiped on sign-out | ✅ written | `coords` 6/6, `trip-cache` 7/7, `offline-today` 3/3 (all new); `today-engine` 18/18, `reminders` 21/21, `logic` 13/13; app `tsc` clean; i18n parity clean | Everything on a device (airplane mode) |
| 3 | Offline edits + sync: Done, reorder, time, length and day are recorded on the phone first (shown at once, saved before sending) and synced with a three-way check (already there → drop; unchanged on server → send; changed → conflict kept for the user: Keep mine / Use the server's / Discard). One sync at a time; edits made during a sync are kept. Status lines for pending changes and conflicts; a marker on stops with an unsynced change; sign-out warns about unsynced changes | ✅ written | `pending-ops` 8/8, `sync` 8/8 (all new); app `tsc` clean; i18n parity clean | Everything on a device; real API round trips (the sync tests use an in-memory API stand-in with the server's rules) |
| 4 | `myLabel`: user-typed label on places (migration `20261118090000_place_my_label`, shared schema with default null, API select/update, place screen "Your label" sheet, never prefilled from Google); shown offline instead of the category | ✅ written | shared `schemas.spec` 45/45 (+1), API `mappers` 6/6 (+1) and other API specs 32/32; shared build + `tsc` clean for shared, API, app | Migration push; deploy; label round trip on a device |

## Tests

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
| `20261117220000_visit_duration` | `trip_places.duration_minutes` | **Confirm**: M9 committed; push not confirmed in writing. Check with `npx supabase migration list --linked`. |
| `20261118090000_place_my_label` | `places.my_label` (user-typed, 1–60 chars, trimmed) | **Not applied** (M12a). Push before deploying the API. |

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
