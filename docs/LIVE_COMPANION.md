# Live Travel Companion: architecture and roadmap

> **Your trip. Fully planned. Always in control.**

Travel Companion is not only a planner or a place collection. During the trip
it should actively help: knowing where you are in your day, what's next, what
fits the time you have, and when the plan should change. This document is the
design that every milestone builds toward.

## The four questions Today answers

The **Today** experience (Home during a trip, later its own screen) is the main
Live Companion surface. Everything on it answers one of four questions:

| Question | What the user sees | Needs |
| --- | --- | --- |
| **1. Where am I in my day?** | Today's itinerary as a timeline: done, current, next; progress | Itinerary (day, order, time), visited state, current time |
| **2. What's next, and when should I leave?** | Next stop, distance and travel time from here, "Leave by 13:40", directions | Current location (foreground), stop times, travel time |
| **3. What can I do right now with the time I have?** | "You have 90 minutes free": nearby wishlist and collection places that fit the gap | Free-time detection (times + planned durations), distance, opening hours, preferences |
| **4. Should I change my plan?** | "Running 25 min late: skip X or move it to tomorrow?" / "Ahead of schedule: add Y?" | Comparing the plan with now and with where the user is |

## The rule that never changes

**The app suggests; the user decides.** Live Companion never edits the
itinerary by itself. Every change is a suggestion with a clear action
("Move to tomorrow", "Add to today", "Dismiss"). Accepting a suggestion uses
the same endpoints the user would use by hand (`PATCH /v1/trips/:id/places/:placeId`,
`PUT …/days/:day/order`), so there is one source of truth and nothing hidden.

## Three kinds of places (kept distinct everywhere)

| Concept | Meaning | Data | UI |
| --- | --- | --- | --- |
| **Global Collection** | Every place the user saved, for any trip or none | `app.places` (one row per Google place, deduplicated by place ID) | Places tab |
| **Trip Wishlist** | Places saved *for this trip* | `app.trip_places` rows of the trip | Trip → Wishlist |
| **Itinerary** | Wishlist places scheduled on a day, in order, optionally with a time | `trip_places.day`, `position`, `start_time` | Trip → Itinerary, Home Today |

A wishlist place with no day is "wishlist only"; removing it from the itinerary
keeps it on the wishlist; removing it from the trip keeps it in the collection.

## Building blocks and where they live

| Block | Status | Where |
| --- | --- | --- |
| Itinerary per day, order, time | ✅ M6 | `trip_places.day/position/start_time`, `ItineraryView` |
| Visited ("Done") | ✅ M7 | `places.visited_at`, `useSetVisited` |
| Today card: next stop, directions, Done | ✅ M7 | `features/trips/TripModeCard.tsx`, `tripMode()` |
| Hotel as a real location | ✅ M8 | `trips.base_google_place_id` (ID only), `HotelPinSheet` |
| Current location, foreground, one reading | ✅ M8 | `features/companion/location.ts` (`useCurrentLocation`) |
| Distance helpers | ✅ M8 | `features/companion/geo.ts` (haversine, formatting in km/mi) |
| Planned duration per stop | ✅ M9 | `trip_places.duration_minutes` (null = category default, `visitMinutes()` in shared) |
| Travel time to next stop | ✅ M9 | `features/companion/travel.ts`: straight line × 1.3, walk 80 m/min up to 25 min, else subway/taxi estimate (10 min + 333 m/min). Free; shown as "≈". Routes API only after cost approval |
| Leave-by time | ✅ M9 | `computeToday()`: start time − travel − 5 min buffer |
| Free-time detection | ✅ M9 | `computeToday()`: from now (or the end of the current visit) to the leave-by time; rest of the day once the plan is done |
| Suggestions that fit | ✅ M9 | Wishlist first, then collection (max 40); travel there + visit + travel on must fit the gap; walking distance only after the plan is done. Opening hours not used yet (would cost Enterprise calls) |
| Running late / overbooked | ✅ M9 | ≥10 min late: "Start at …" or "Move to tomorrow"/"Remove from today"; plan past 23:00: move the last stop. Accept or dismiss (dismissals stored on the phone per day) |
| Local reminders ("leave in 10 min") | ✅ M10 (written) | See "Reminders (M10) as built" below |
| Nearby saved place alerts | Later | Background location / geofencing, own permission, opt-in |

`features/companion/` is the home for Live Companion code in the app. Pure
logic (gaps, leave-by, ranking) lives in plain TypeScript files with unit
tests, so it can move to `packages/shared` if the server ever needs it.

## Today v1 (M9) as built

- **Screen:** `app/today.tsx` → `features/companion/TodayScreen.tsx`, opened from the
  Home trip card ("Open Today" during the trip, "Preview Today" before it).
- **Engine:** `features/companion/today-engine.ts` (`computeToday`): pure and
  deterministic, no AI, no network; unit tests in `today-engine.spec.ts`. It
  returns the timeline, current and next stop, leave-by, free time, hints and
  suggestions. Every change is a `TodayAction` the user must tap.
- **Actions:** `today-actions.ts` runs an accepted action through the normal
  itinerary endpoints (schedule, add to trip, reorder). Nothing else writes.
- **Location:** one reading when Today opens for real, and on pull-to-refresh.
  If the phone is more than 50 km from every place in the plan, it's ignored and
  the hotel is used instead (handy when testing at home).
- **Preview mode:** outside the trip dates (or with `preview=1`), Today shows a
  chosen day and time, labeled "Preview", with location optional.
- **Time zone:** planned times are the destination's local times. Today's
  "today" and "now" use the trip's time zone (pinned hotel) since M11, so they
  are right even while the phone is on home time; without a pinned hotel, the
  phone's clock is used.

## Today, map first (U2) as built

Same engine and rules as M9; new layout. A full-screen Google map shows the day's
progress (pins: done / next / now / later, the hotel, the next leg, the rest of the
day as faint dots; straight lines, labeled). A bottom sheet (`MapSheet`) has three
heights: collapsed (progress, next stop, leave-by, travel or "unavailable",
Directions / Done, up to two alerts), half (the day), full (everything: preview
controls, offline status, hints with choices, free time and suggestions, Discover
nearby, footnote). Alerts that must be visible collapsed: changes needing a choice,
running late, a stop that may not fit today, offline (+ waiting changes), free time.
Location: one reading on open (live), on refresh and on "Show my location"; the dot
goes hollow after 2 min. Travel is shown only when `reliableTravel` accepts it;
without it there's no leave-by time ("Be there by …") and no free-time window.
Home's trip card opens Today (live during the trip, preview before).

## Reminders (M10) as built

- **What:** for itinerary stops with a planned time: "Leave in N min for X"
  (N = 5/10/15/30), "Time to leave for X", an optional heads-up 1 h before
  (skipped when it would land next to "leave soon"), and an optional morning
  summary at 08:00 on trip days. Never for visited, muted or past stops.
- **When to leave:** start − travel estimate from the previous stop (or the
  hotel for the first stop) − 5 min buffer; 20 min is assumed when a location is
  unknown, and the text says so.
- **Time zone:** reminders are scheduled before the trip, so times are converted
  in the **trip's time zone** (Google `timeZone` of the pinned hotel; Pro field,
  not stored) with `zoned-time.ts`. Without a pinned hotel the phone's zone is
  used and Settings warns.
- **Keeping them current:** `ReminderSync` (mounted at the app root) builds the
  full desired set with `planReminders()` and applies only the difference from
  what is scheduled (`diffReminders()`, by stable id + fingerprint of time and
  text). It runs on input changes (debounced) and whenever the app becomes
  active. It cancels all of this app's reminders when reminders are off,
  permission is missing, there is no current/upcoming trip, or the user signs out.
- **Limits:** at most 50 scheduled (iOS keeps 64 per app). Only the current or
  next trip (within 30 days) is scheduled.
- **Control:** opt-in in Profile → Reminders (permission asked only then); lead
  time and each kind can be switched; per-stop mute from the itinerary menu;
  "Send a test reminder"; scheduled list. Settings live on the device (T11).
- **Tap:** opens Today for that trip.
- **No push:** local notifications only; `enableRemoteNotifications: false`
  keeps the push entitlement out of the iOS app (free Personal Team, T10).
- **Not done (future):** snooze/actions on the notification, reminders that
  react to location (needs background location), server-side scheduling.

## Offline behavior (M12a)

- **Today and the itinerary** run from the phone's saved copy of the trip when the
  server can't be reached. Google places show the user's `myLabel` or the category
  (Google names can't be stored); travel estimates use cached Google coordinates
  (≤ 30 days, expiry enforced) or are omitted.
- **Done, reorder, time, length and day** work offline; they're queued and synced
  later with a conflict check (docs/ARCHITECTURE.md → "Offline-tolerant trip mode").
  Accepting a Today suggestion still needs a connection.
- **Reminders** are never cancelled because data failed to load. When Google
  details are missing, reminders scheduled earlier (with names and the trip's time
  zone) are kept; only stops whose own plan changed are rescheduled, with the
  label/category as the name and, before the trip, the phone's time zone.

## Location and privacy

- **Now (M8–M9): foreground only.** "While Using the App" permission, asked the
  first time the user taps something location-based ("Near me", Today). One
  reading at a time, reused for 2 minutes.
- Location is sent to the API only as part of one request (e.g. a search area)
  and is **never stored** by the API or written to disk by the app.
- **Later (separate milestone, separate opt-in):** background location for
  "you're near a saved place" alerts and geofencing. Not built until the
  foreground experience is proven, as agreed.

## Cost guardrails for Live Companion

- Distance and walking-time estimates are computed on the device (free).
- Opening hours come from the place preview (Place Details Enterprise, already
  approved and capped). Bulk opening-hours lookups for suggestions would need
  their own cap and approval.
- **Routes API** (real travel times, transit) is not enabled. Before adding it,
  the owner gets the SKU, free allowance and price per 1,000.

## Roadmap

| Milestone | Scope | Status |
| --- | --- | --- |
| M6 | Day-by-day itinerary | ✅ |
| M7 | Trip mode on Home (countdown, today, next stop, Done) | ✅ |
| M8 | Google-first Discover, place preview, hotel pin, cost caps + usage monitor, companion location module | ✅ |
| M9 | **Live Today v1**: Today screen with the four questions, visit durations, travel estimate, leave-by, free time, suggestions that fit, late/overbooked hints, accept/dismiss, preview mode | ✅ committed (`4ef298a`) |
| M10 | Local reminders (leave soon / time to leave / heads-up / morning summary), trip time zone, settings, mute | 🟡 written, device test pending |
| Later | Background location, nearby alerts, geofencing (opt-in) | |
