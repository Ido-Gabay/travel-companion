# Progress

Goal: the app running on a physical iPhone for the New York trip
(Nov 23–29, 2026), with trips and saved places, against a deployed API by Nov 22.

Legend: ✅ done and verified on the Mac · 🟡 written, waiting for verification · ⬜ not started

## Phase 1

| # | Milestone | Status | How it is verified |
| --- | --- | --- | --- |
| M0 | Monorepo, tooling, docs, `packages/shared` | ✅ 32 tests, typecheck clean | `pnpm install`, `pnpm test`, `pnpm typecheck` |
| M1 | Migration: `app` schema, profiles, preferences, trips, RLS, sign-up trigger | ✅ applied 2026-11-16 | `supabase db push`, then `supabase/checks/phase1_checks.sql` all `ok` |
| M2 | API: config, health, JWT guard, `/v1/me`, `/v1/me/preferences`, `GET /v1/trips`, error format, tests | ✅ `pnpm smoke:api` 6/6 with a real user; unit tests pass | `pnpm dev:api`, then `pnpm smoke:api` |
| M3 | Mobile shell: Expo Router tabs, design tokens/components, English/Hebrew + RTL, empty states | ✅ runs in the iOS Simulator (2026-11-17) | Runs in the iOS Simulator |
| M4 | Auth screens, persistent session, API client with real data | ✅ runs in the iOS Simulator (2026-11-17) | Sign up → sign in → profile shows real data; restart keeps session |
| M5 | Development build on the iPhone (Xcode, free Apple ID), Android check | ⏸ postponed by choice; do by Nov 22 (free-account builds expire after 7 days) | App opens on the phone and reaches the API over Wi-Fi |

## Discovery milestone (current)

| Item | Status |
| --- | --- |
| Google Places (Text Search, Place Details) behind daily caps | ✅ live, smoke verified |
| Claude request interpretation + clarification | ✅ live |
| Discover tab: results list/map, multi-select, save to collection/trip | ✅ works in the Simulator |
| Collection by category + map; place detail (directions, visited, notes, tags, trips) | ✅ works in the Simulator |
| Trip wishlist by category + map | ✅ works in the Simulator |
| Edit trip, "staying at" for AI, visited progress, hide visited | 🟡 written |
| Keys configured (Google Cloud, Anthropic, iOS Maps) | ✅ |
| Full flow on a real iPhone | ⬜ |

## Trips/places slice (after Phase 1)

| Item | Status |
| --- | --- |
| `POST /v1/trips` + Create Trip screen | ✅ runs in the Simulator |
| User-owned places with notes (global collection), add place to trip, trip detail, delete | ✅ smoke test 18/18, works in the Simulator |
| Deploy the API (Render Free + Supabase Free + GitHub) and point the app at it | 🟡 config written; waiting for GitHub repo + Render setup |

## Known limitations right now

- No rate limiting yet (planned before the API is public).
- Email confirmation links don't open the app yet; turn off **Confirm email** for development.
- Session storage is AsyncStorage (not encrypted). Planned upgrade is documented in ARCHITECTURE.md.

## Log

- 2026-11-16: M0–M2 written. Shared schemas build and pass smoke tests against zod v4;
  the rest is unverified until it runs on the Mac (no package registry access from the build sandbox).
- 2026-11-16: Migration pushed (`db push --remote`). API compiles and starts; `/health/ready` ok.
  `pnpm smoke:api` passed 6/6 with a real Supabase user, which also proves the API's
  per-request `authenticated` role switch (RLS path) works. Added `pnpm setup:db` and `pnpm smoke:api`.
  Note: Supabase project is in ap-southeast-1 (Singapore).
- 2026-11-16: M3+M4 written together (one install, one native build): Expo Router tabs,
  design tokens + components, en/he with immediate RTL flip, Supabase email auth with
  persistent session, typed API client, Home/Trips/Places/Profile, Create Trip modal.
  `POST /v1/trips` added to the API.
- 2026-11-17: App builds with Xcode 26.4 and runs in the Simulator. Fixed RN 0.88 strict-type errors
  (tab icon color, TextInput ref) and added `redirectTo` on the protected routes (SDK 58).
- 2026-11-17: Phone install postponed. Places slice written: migration `places` + `trip_places`,
  `/v1/places` CRUD, trip detail/delete, add/remove place to trip, Places tab, place form with notes,
  trip detail screen, add-places picker, Open in Maps (user's own text as a search link).
- 2026-11-17: Places slice verified (tests, typecheck, smoke 18/18, Simulator). Root scripts now
  rebuild `packages/shared` first. Hosting decided: zero cost (Render Free + Supabase Free + GitHub),
  no paid services without approval. Region assumption: keep Singapore for both. Added `render.yaml`,
  CI workflow, docs/DEPLOYMENT.md, and cold-start handling in the app.
- 2026-11-17: New priority: AI place discovery with real Google Places. Approved: Google billing with daily caps,
  Claude Haiku 5.5, no ratings/photos. Written: migration `google_places` (place ID dedupe, category, tags,
  visited, provider_usage), Google Places service (Text Search + Place Details, Pro field masks), Claude
  interpretation service (structured output, clarification, direct fallback), discover/save endpoints, daily caps,
  Discover tab (search, AI steps, clarification, results list/map, multi-select save to collection + trip),
  collection by category with map, place detail (directions, visited, category, notes, tags, trips),
  trip wishlist by category with map. Needs: keys (docs/GOOGLE_AND_AI.md), `react-native-maps`, native rebuild.
- 2026-11-17: Discovery verified end to end (AI interpreted "coffee shops in SoHo", Google returned 15 real places,
  save/dedupe/wishlist). Fixed: place ID check regex {10,300} exceeded Postgres' 255 limit (migration
  20261117130000); Simulator crash on the map fixed by `expo prebuild --clean`. Added: edit trip, trip
  "staying at" (sent to the AI for "near my hotel"), visited progress + hide visited.
- 2026-11-17: Phone test postponed again (user's choice); free-account builds expire after 7 days, so install
  on Nov 21–22. Day-by-day itinerary written: migration `itinerary` (`day`, `start_time`, `position` on
  `trip_places`), `PATCH /v1/trips/:id/places/:placeId` (plan for a day / time / back to wishlist),
  `PUT /v1/trips/:id/days/:day/order`, places outside new trip dates go back to the wishlist. Trip screen now
  has Plan / Places / Map: day strip (opens on today during the trip), numbered day map with the route line,
  "walk the day's route" link to Google Maps, timeline of stops with time, reorder, move day, back to wishlist,
  add-from-wishlist sheet; Places tab shows each place's day and plans it from a day picker.
  Typecheck passes (shared, API, mobile); tests + smoke need a run on the Mac.
- 2026-11-17: Itinerary verified by the user. Trip mode on Home: before a trip (within 30 days) a countdown with
  planned / wishlist / days-planned counts and a "where you stay" hint; during the trip today's plan with the next
  stop, directions, "Done", and a tick list of today's stops. "Done" also on each itinerary stop; visited updates
  instantly in every loaded trip (rolled back if saving fails). App-only change: no migration or API deploy.
