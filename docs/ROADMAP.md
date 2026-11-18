# Roadmap

Status: ✅ done and verified by the owner on the Mac/Simulator · 🟡 written, not
yet verified by the owner · ⏳ in progress · ⬜ not started.
"Verified" means the owner ran it; see DEVELOPMENT_STATUS.md for exact test results.

## Completed and current

| # | Milestone | Status | Acceptance criteria |
| --- | --- | --- | --- |
| M0 | Monorepo, tooling, shared schemas | ✅ | `pnpm install`, `pnpm test`, `pnpm typecheck` pass |
| M1 | DB foundation: `app` schema, profiles, preferences, trips, RLS, sign-up trigger | ✅ | Migration applied; `supabase/checks/phase1_checks.sql` all ok |
| M2 | API: config, health, JWT guard, `/v1/me`, preferences, trips, error format | ✅ | `pnpm smoke:api` passes with a real user |
| M3–M4 | Mobile shell, auth, en/he + RTL, API client | ✅ | Sign up/in, profile shows real data, session survives restart (Simulator) |
| — | Trips/places slice; zero-cost deploy (Render + Supabase + GitHub CI) | ✅ | Smoke passes against Render |
| — | Discovery v1: Google Places + Claude, collection, wishlist, maps | ✅ | Real Google results saved and deduped |
| M6 | Day-by-day itinerary | ✅ | Plan/reorder/move days; dates shrink → out-of-range back to wishlist |
| M7 | Trip mode on Home | ✅ | Countdown before; next stop + Done during |
| M8 | Google-first Discover, place preview (rating/hours/photos), hotel pin, monthly cost caps + usage screen, companion location module | ✅ | Owner: "fully tested and working" on the Mac (Nov 17) |
| M9 | Live Today v1: visit lengths, travel estimates, leave-by, free time, suggestions, late/overbooked hints, accept/dismiss, preview mode | 🟡 | Owner reported "implemented" (committed `4ef298a`); Simulator walkthrough and migration push not confirmed in writing |
| M10 | Local reminders | 🟡 committed (`52c49b6`); native rebuild done | Reminder behavior on the device not confirmed in writing |
| M11 | Trip readiness: Today/Home in the trip's time zone, API rate limiting, Google attribution to policy (one component, photo links, notification subtitle), shorter Hebrew tab label | 🟡 written | See below |
| U1 | UX/UI redesign: design system (DESIGN_SYSTEM.md), four tabs, Home, Today, trip overview, itinerary, wishlist, Discover, place preview, Saved, place detail, Profile | 🟡 written | See below |
| M16 | Real travel times: Google Routes API (Compute Routes Essentials, capped 150/day, 2,000/month), online only, for Today and "Plan this day"; real route line for the next leg; estimates offline | 🟡 written (tests pass in session) | Owner: enable Routes API + key restriction, deploy API |
| U2 | Live Companion redesign: map-first Today (full-screen map, progress pins, next leg, three-height bottom sheet with next action + alerts, one-shot locate with stale state, reliable-travel guard, Home card opens Today) | 🟡 written (tests pass in session) | No native rebuild; device checks in DEVELOPMENT_STATUS.md |
| M15 | Trip journal + recap (stage 1): day notes and ratings, "what you did", highlights, recap + share, offline via the change queue | 🟡 written (tests pass in session) | Stage 2 (photos) awaits the owner's choice |
| M14 | Screen tests + CI: jest-expo + RNTL screen tests (Home, itinerary, Today, conflicts, Profile, reminders), shared fakes, first real Vitest run, CI runs both | 🟡 written (tests pass in session) | docs/TESTING.md |
| M13 | Smart day planning: day summary + warnings (tight, out of order, long leg, late end, overloaded), "Plan this day" (shorter order, fill in times), opening hours on request | 🟡 written | See below |
| M12a | Offline-tolerant trip mode (travel MVP): reminder reliability, per-user saved copy, offline itinerary/Today, offline Done/reorder/time/length/day with safe sync and conflicts, `myLabel`, 30-day coordinate cache | 🟡 written | See below |

### M10 – Local reminders: acceptance criteria

- [x] Reminder kinds: leave in N min (5/10/15/30), time to leave, heads-up (1 h before), morning summary (08:00).
- [x] Only stops with a planned time; never for visited, muted or past stops; at most 50 scheduled (iOS limit 64).
- [x] Scheduled in the trip's time zone (pinned hotel); phone zone fallback with a warning.
- [x] Re-sync on app foreground and itinerary changes; full plan vs. scheduled diff → no duplicates or stale reminders; cancels all on sign-out or when turned off.
- [x] Opt-in; permission asked only when turning on; settings screen with scheduled list and test reminder; per-stop mute in the itinerary menu.
- [x] Tapping a reminder opens Today.
- [x] No push entitlement (free Apple ID can sign).
- [x] Owner: native rebuild (iOS project shows the notifications module and no push entitlement).
- [ ] Owner: test reminder arrives; a real leave reminder arrives at the right time.

### M11 – Trip readiness: acceptance criteria

- [x] Today, Home's today card and the itinerary's opening day use the trip's time zone (pinned hotel); phone zone otherwise. Tested helper `zonedNow`.
- [x] Per-user rate limits (240/min, 60/min paid routes) with `429 RATE_LIMITED`; unit tests.
- [x] One "Google Maps" attribution component styled to Google's rules on every screen with Google place content; photos link to Google Maps; notifications naming Google places carry the attribution.
- [x] Hebrew "Wishlist" tab label shortened.
- [ ] Owner: tests on the Mac, deploy, Simulator check (Today with the pinned hotel; attribution visible; tapping a photo opens Google Maps).

### U1 – UX/UI redesign: acceptance criteria

- [x] Phase 1 audit and Phase 2 direction presented to the owner (chat, Nov 17).
- [x] Design system: tokens (type, radii, floating elevation), tonal/compact buttons, flat cards, `ListGroup`/`ListRow`, app-wide action menu, quieter empty/error states.
- [x] Four tabs; Home merges trips; Discover uses a search icon.
- [x] Screens: Home, Today, trip overview, itinerary, wishlist, Discover (+ context sheet), place preview, Saved, place detail, Profile, reminders label.
- [x] No feature removed; no API, database or navigation route changed; en/he parity; `tsc` clean; 70 app tests pass (incl. new `pastTrips`).
- [ ] Owner: Simulator walkthrough in English and Hebrew on a small (iPhone SE/mini) and a large iPhone; every menu action works (checklist in DEVELOPMENT_STATUS.md).

### M12a – Offline-tolerant trip mode: acceptance criteria

- [x] Stage 1: reminders are never cancelled because data failed to load; offline keeps reminders scheduled earlier; only stops changed offline are replaced (tests).
- [x] Stage 2: per-user saved copy (trip list, trip details, profile) restored before screens render; Home/Trip/Itinerary/Today/place show it with "Offline · saved copy from …"; wiped on sign-out; other users' copies removed on sign-in (tests).
- [x] Coordinates only: ≤ 30 days, source + timestamp stored, expiry enforced in code (never used after 30 days, deleted at launch/foreground/write) (tests). No Google names, addresses, photos, hours or time zone stored (test).
- [x] Stage 3: Done, reorder, time, length, day work offline; pending queue saved before sending; three-way sync (no duplicates, no silent overwrite, conflicts kept for the user); sign-out warns about unsynced changes (tests with an API stand-in).
- [x] Stage 4: `myLabel` (migration, shared, API, app); user-typed only; used offline (tests for schema and mapper).
- [x] No new native dependency; no paid service; no background location.
- [ ] Owner: `pnpm test && pnpm typecheck`, migration push, deploy, smoke test.
- [ ] Owner: airplane-mode checklist in DEVELOPMENT_STATUS.md (Simulator, then on the iPhone during R1).

### M13 – Smart day planning: acceptance criteria

- [x] Pure planner (`features/planning/day-planner.ts`, `opening-hours.ts`) with tests: summary, warnings, order proposal (timed/done/unlocated stops stay; gap-aware between timed stops; ≥ 5 min saving), time suggestions (only flexible, not done), opening hours windows (closed days, overnight, 24/7) and hours-aware times/warnings.
- [x] Itinerary day: one summary line, warnings on tap, "Plan this day" sheet (toggles, preview, Apply through the change queue: works offline). Nothing applied automatically.
- [x] Opening hours: `regularOpeningHours` added to the preview field mask (same Enterprise SKU, approved C7); fetched only on "Check opening hours"; in memory only; Google attribution shown.
- [ ] Owner: Simulator check (see DEVELOPMENT_STATUS.md → M13 checks), deploy (API mask + mapper change).

## Next

| # | Milestone | Status | Notes / acceptance |
| --- | --- | --- | --- |
| R1 | **iPhone Release install for the trip** | ⬜ | `pnpm ios:release` on **Nov 21–22** (free builds expire after 7 days); walk the test checklist in DEVELOPMENT_STATUS.md on cellular |
| M11b | Fixes from R1 | ⬜ | Whatever the iPhone test finds; official Google Maps logo (optional) |
| M12 | Offline foundation (full offline-first, after the trip) | ⬜ | POCs 1–2 (PowerSync + op-sqlite/SQLCipher), D5a/D11/D15/D17; per-trip "Available offline" (D16). Replaces M12a's AsyncStorage copy and queue behind the same module boundary (`features/offline`) |
| — | Background location / nearby alerts (geofencing) | ⬜ | Separate opt-in phase (P8, D2) |
| — | Sharing a trip, Android release, route optimization (D3), open place data (D12) | ⬜ | After the NY trip |

## Dependencies and blockers

- **Free Apple ID**: 7-day build expiry; no push notifications (local only). Reinstall Nov 21–22.
- **Render Free** sleeps after 15 min (first request ~1 min). **Supabase Free** pauses after ~1 week of inactivity.
- **Paid features need approval**: Routes API (exact travel times), review text (Atmosphere SKU).
- **The build sandbox used by Claude sessions has no npm registry or GitHub access**: installs, vitest, native builds and pushes are run by the owner on the Mac.
