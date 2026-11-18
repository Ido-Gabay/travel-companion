# Decisions

The decisions this project is built on, why they were made, and which are
still open. **Do not silently reverse an accepted decision.** To change one,
explain the trade-off to the owner, get explicit approval, then mark the old
entry *Superseded by …* and add a new entry. Dates are 2026.

Status: **Accepted** (in force) · **Open** (needs the owner) · **Pending POC**
(direction chosen, proof still to do) · **Superseded**.

## Product

| ID | Decision | Why | Status |
| --- | --- | --- | --- |
| P1 | The goal is a genuinely useful iPhone app for the owner's New York trip (Nov 23–29), built as the real product, not a prototype. | A real trip is the best acceptance test. | Accepted (Nov 16) |
| P2 | **Google Maps search is the standard discovery experience; AI is optional** and only enhances it. Discover has "Search" (default) and "Ask AI"; the app must not feel like a chatbot. | Users know Google Maps; AI should help, not gatekeep. | Accepted (Nov 17, M8) |
| P3 | **Three distinct place concepts**: Global Collection (`places`), Trip Wishlist (`trip_places` rows of a trip), Itinerary (wishlist rows with a `day`). Keep them distinct in data and UI. | Users plan at different levels; mixing them confuses. | Accepted (Nov 17) |
| P4 | Saving dedupes by Google place ID: one collection row per place; a saved place can join any number of trips. Save to collection only, or straight to a trip wishlist. | No duplicates; reuse across trips. | Accepted (Nov 17) |
| P5 | **The app suggests; the user decides.** Nothing (Today, hints, reminders, AI) changes the itinerary without an explicit tap. Accepted suggestions use the same endpoints as manual edits. | Trust and control ("Always in control"). | Accepted (Nov 17, M9) |
| P6 | Live Today answers four questions: where am I in my day; what's next and when to leave; what can I do with the time available; should I change my plan. | Defines the Live Companion. | Accepted (Nov 17) |
| P7 | **Deterministic logic before AI** for planning help (travel estimates, free time, ranking, reminders). | Predictable, testable, free, works offline later. | Accepted (Nov 17, M9) |
| P8 | **No continuous or background location** until a later, separate, opt-in phase. Location is read once, in the foreground, when a screen needs it, and is never stored. | Privacy, battery, App Store review. | Accepted (Nov 17) |
| P9 | "Near my hotel" uses the **pinned hotel's real location** (Google place ID on the trip), never a guess from its name. | Accuracy. | Accepted (Nov 17, M8) |
| P10 | Place preview shows rating, review count, opening hours and photos, but **no review text**. | Owner's cost choice (see C3). | Accepted (Nov 17) |
| P11 | English and Hebrew with real RTL from day one. | Owner's languages. | Accepted (D7) |
| P12 | Reminders are **local notifications** only, follow the plan (not location), and their settings live on the device. | No push infrastructure, no cost, privacy. | Accepted (Nov 17, M10) |
| P13 | **Minimal UI (U1 redesign):** one primary action per screen; grouped lists instead of stacked cards; flat surfaces (shadows only for floating elements); secondary and destructive actions in "…" action menus; hints and suggestions only when relevant. Rules in docs/DESIGN_SYSTEM.md. No feature was removed to simplify a screen. | Owner: "Less UI. Less confusion. More clarity." | Accepted (Nov 17, U1) |
| P15 | **Offline-tolerant trip mode (M12a), travel MVP:** the user's own trip data is saved on the phone per user and shown when the server can't be reached; Done, reorder, time, length and day work offline and sync later; nothing is overwritten or discarded silently (conflicts wait for the user). Offline, Google places show the user's **`myLabel`** (typed by the user, never filled from Google) or the category. | A reliable app on the trip (subway, roaming) without a risky architecture change before Nov 23. | Accepted (Nov 17, M12a) |
| P18 | **Map-first Today (U2):** Today is a full-screen Google map with a bottom sheet (collapsed / half / full). The sheet is our own `MapSheet` on React Native Animated + PanResponder (no Reanimated / Gesture Handler: no native rebuild). Location stays one-shot ("Show my location"), shown as stale after 2 min, never tracked. Map lines are straight and labeled as such (no paid Routes/Directions API for drawing). Travel is shown only when `reliableTravel` accepts it; otherwise "unavailable" and "be there by" instead of a leave time. Home's trip card opens Today (live during the trip, preview before). | Owner approved all three recommendations and the extra UX requirements on Nov 18. | Accepted (Nov 18, U2) |
| P17 | **Trip journal (M15):** per trip day a note (≤ 4000) and a 1–5 rating; "what you did" comes from stops marked Done; stops can be starred as highlights; a recap (numbers, highlights, days) shares as plain text via the system share sheet. Edits work offline through the change queue. Photos are a separate decision (stage 2: needs native modules + Supabase Storage; owner to choose now / after the trip / never). | Owner chose "Trip journal + recap". | Accepted (Nov 18, M15) |
| P16 | **Smart day planning (M13):** a day summary and warnings are always computed on the phone (free); "Plan this day" proposes a shorter order (only flexible, not-done, located stops move; ≥ 5 min saving) and start times for stops without one (the user's times never change); opening hours only on request. Nothing is applied until the user taps Apply (P5). | Owner chose "Smart day planning" as the next milestone. | Accepted (Nov 17, M13) |
| P14 | **Four tabs:** Home (active trip + all trips), Discover (search icon), Saved (collection), Profile. The Trips tab is hidden, its route kept. | Home and Trips duplicated each other; the sparkles icon suggested AI-first, contradicting P2. | Accepted (Nov 17, U1) |

## Cost and services

| ID | Decision | Why | Status |
| --- | --- | --- | --- |
| C1 | **Zero-cost hosting**: Render Free (API), Supabase Free (Postgres + Auth), GitHub (code + Actions). No domain, no paid plans. Stay portable (plain Node process, env-only config). | Development and testing only. | Accepted (Nov 17) |
| C2 | **No paid service, API or feature without the owner's explicit approval**, with SKU, free allowance and price stated first. | Owner's rule. | Accepted |
| C3 | Google Maps Platform billing enabled **with hard caps** (daily + monthly per SKU, counted in `app.provider_usage`) below the free allowances; usage visible in `GET /v1/usage` and the app. Approved SKUs: Text Search Pro, Place Details Pro, Place Details Enterprise (rating, count, hours), Place Details Photos. **Not approved:** Enterprise + Atmosphere (reviews, descriptions), Routes API. | Keep the bill at $0. Prices: docs/GOOGLE_AND_AI.md. | Accepted (Nov 17) |
| C4 | Claude **Haiku 5.5** for "Ask AI" (prepaid, spend limit, daily + monthly caps). | Cheap, fast, structured output. | Accepted (Nov 17) |
| C5 | Travel times are **free on-device estimates** (straight line × 1.3, walking 80 m/min, subway/taxi above 25 min), shown with "≈". | Routes API costs money (C2). | Accepted (Nov 17, M9) |
| C6 | iPhone builds use a **free Apple ID (Personal Team)**: builds expire after 7 days; no push notifications. | No paid developer program. | Accepted |
| C7 | Day planning may use **`regularOpeningHours`** (Place Details **Enterprise**, same SKU and caps as the preview: 1,000 free/month, then $20 per 1,000; our caps 30/day, 900/month). Fetched only when the user taps "Check opening hours" (one request per place), kept in memory only, never stored. | Owner approval 2026-11-17 ("approve B"). | Accepted (Nov 17, M13) |

## Technical

| ID | Decision | Why | Status |
| --- | --- | --- | --- |
| T1 | pnpm monorepo: `apps/api` (NestJS 12, ESM), `apps/mobile` (Expo SDK 58), `packages/shared` (zod schemas = the API contract). | One contract for both sides. | Accepted |
| T2 | The NestJS API is the only way to read or write app data. Supabase is used for Auth and Postgres; the `app` schema is not exposed through Supabase's Data API. | Business rules in one place. | Accepted |
| T3 | Each request runs as Postgres role `authenticated` with the caller's JWT claims (RLS applies) and every query also filters by owner. Asymmetric JWTs only (JWKS). | Defense in depth. | Accepted |
| T4 | Plain SQL with postgres.js (`prepare: false`), no ORM. Migrations are append-only SQL in `supabase/migrations`. | Simple, explicit. | Accepted |
| T5 | Every row has UUID, `created_at`, `updated_at`, `version`; deletable rows have `deleted_at` (soft delete). | Ready for offline sync. | Accepted |
| T6 | Google content rules (D1): store **only place IDs**; fetch names/addresses/etc. fresh and keep them in app memory (≤ 6 h); never send Google content to Claude (D6); places on a map are on a Google map (`PROVIDER_GOOGLE`); show "Google Maps" attribution and photo authors. A DB constraint forbids copying Google text into `places`. | Google Maps Platform terms. | Accepted |
| T7 | The itinerary lives on `trip_places` (`day`, `position`, `start_time`, `duration_minutes`), not in separate itinerary tables. | Simpler; one row per place per trip. Supersedes the Phase 1 idea of `itinerary_revisions`/`itinerary_items`. | Accepted (Nov 17, M6) |
| T8 | Live Companion logic lives in `apps/mobile/src/features/companion/` as pure, unit-tested TypeScript (no React, no network) so it can move to `packages/shared` or the server later. | Testability, offline-ready. | Accepted (Nov 17) |
| T9 | Trip time zone comes from the pinned hotel's Google `timeZone` (Pro field, not stored). Reminders, Today, Home's "today" and the itinerary's opening day use that zone; without it, the phone's zone is used and Reminders settings warn. | Reminders are scheduled before the trip; the phone may be on home time. | Accepted (Nov 17, M10; Today/Home since M11) |
| T10 | `expo-notifications` is configured with `enableRemoteNotifications: false` so the iOS push entitlement (`aps-environment`) is never added (a free Personal Team cannot sign it). | C6. Verified with `expo config --type introspect`. | Accepted (Nov 17, M10) |
| T11 | Dismissed Today suggestions and reminder settings/mutes are stored on the device (AsyncStorage), not on the server. | Personal, per device; no schema needed. Revisit for multi-device. | Accepted (Nov 17) |
| T12 | Zod 4 schemas validate every request (server) and every response (app). New response fields are added with defaults (e.g. `.nullable().default(null)`) so a newer app still works against an older server. | Contract mismatches fail loudly; deploy order doesn't matter. | Accepted |
| T13 | API rate limiting is per user, in memory, fixed one-minute windows: 240/min overall, 60/min on paid routes (`/v1/discover/*`, `/v1/google/*`), after authentication. | One Render instance; no new dependency. Move counters to Postgres/Redis if the API ever runs on several instances. | Accepted (Nov 17, M11) |
| T15 | One app-wide action sheet (`ActionMenuProvider` + `useActionMenu`, our own Modal) instead of `Alert`/`ActionSheetIOS` for item menus. The chosen action runs after the menu closes (iOS `onDismiss`). | Android `Alert` allows only 3 buttons; one look on both platforms; RTL; no new dependency. | Accepted (Nov 17, U1) |
| T16 | M12a saved copy = AsyncStorage JSON under `tc.offline.v1.<userId>.…` (trip list, trip details, profile, coordinates, pending changes, conflicts), validated with the zod schemas on load, restored into the query cache before screens render; wiped on sign-out, other users' keys removed on sign-in. Connectivity is learned from API requests (no NetInfo). | No new native module (no rebuild before the trip). Kept behind `features/offline` so PowerSync/SQLite (M12) can replace it. | Accepted (Nov 17, M12a) |
| T17 | Itinerary edits go through a **pending-changes queue** first (also online): each change is a per-field "set" with the value it replaced; sync re-reads the server and sends only if the server still has that value (already there → drop; changed → conflict kept for the user). One sync at a time; changes edited mid-sync are kept. No server API change was needed. | Idempotent, no duplicates, no silent overwrite; one code path online and offline. Small read-then-write window accepted (single user). | Accepted (Nov 17, M12a) |
| T18 | Google caching per the Service Specific Terms (Places API, checked 2026-11-17): place IDs indefinitely; **latitude/longitude ≤ 30 consecutive days** (stored with source and fetch time; expiry enforced in code); nothing else (names, addresses, hours, photos, time zone). | Google Maps Platform terms. | Accepted (Nov 17, M12a) |
| T19 | **Screen tests on Jest with `jest-expo`** (iOS preset) + React Native Testing Library 14; logic tests stay on Vitest. Screen tests fake the API, auth, router, storage and native modules (`src/test/setup.ts`). | Expo's supported way to render RN components in tests; Vitest has no maintained RN renderer. Dev-only packages: no app or build change. | Accepted (Nov 18, M14) |
| T14 | Google attribution uses the "Google Maps" text (one shared component, Google's styling rules) rather than the logo; photos link to their `googleMapsUri`; notifications naming a Google place carry "Google Maps" as subtitle. | Text is allowed where space is limited; the logo needs Google's asset files. | Accepted (Nov 17, M11) |

## Phase 1 research decisions (D1–D19)

From the Phase 1, offline-first and Phase 1.2 research reports (links in
DEVELOPMENT_STATUS.md). Kept here so the IDs stay meaningful.

| ID | Decision | Status |
| --- | --- | --- |
| D1 | Strict Google Maps Platform compliance (see T6). | Accepted |
| D2 | Geofencing/background location only in a later phase. | Accepted (see P8) |
| D3 | Route optimization later with OR-Tools in a Python worker. | Accepted, not started |
| D4 | Background jobs with pg-boss (Postgres-backed queue) when needed. | Accepted, not started |
| D5a | Writes go through NestJS; reads sync to the device via PowerSync. | Pending POC 1 |
| D6 | No Google content in Claude prompts. | Accepted |
| D7 | English + Hebrew with RTL. | Accepted |
| D8 | Travel modes: walking + driving (transit later). | Accepted |
| D9 | Personal-first (single user), sharing later. | Accepted |
| D10 | Hosting incl. self-hosted PowerSync (dev hosting is Render Free for now). | Pending POC 1 |
| D11 | PowerSync self-hosted (Cloud Free for the POC); fallback custom sync on SQLite. | Pending POC 1 |
| D12 | Three tiers of place data: user-owned / open data (Overture, Foursquare OS) / Google online-only. | Pending POC 3 (Israel coverage) |
| D13 | No in-app offline map: list + distance/direction; Google/Apple Maps links. | Accepted |
| D14 | Conflict policy with 5 field classes + history + rejection log. | Pending POC 5 |
| D15 | Encrypted local DB: SQLCipher via op-sqlite, key in Keychain/Keystore, excluded from backups. | Pending POC 2 |
| D16 | Per-trip "Available offline", off by default, Wi-Fi only by default, full-size photos opt-in. | Accepted, not started |
| D17 | op-sqlite only (no expo-sqlite); expo-updates with a third-party SQLite pod. | Pending POC 1 |
| D18 | Sync endpoint contract: synchronous commit, 2xx on rejections, rejection log. | Accepted, not started |
| D19 | Save in-app photos to the phone library by default. | Open (owner) |

## Open questions (need the owner)

1. Multi-device support in the MVP? (recommendation: single device first, server policy from day one)
2. D19 photo library copy default (recommendation: on)
3. PowerSync self-hosted vs Cloud Pro (recommendation: self-host)
4. Accept user-set pins where open place data is weak (Israel) (recommendation: yes)
5. Legal review timing (recommendation: before any public release)
6. Database/API region: stay in Singapore (current) or move closer (e.g. Frankfurt)
7. Repository visibility: earlier docs say private; a 2026-11-17 tool check reported it as public. Confirm on GitHub. No secrets are committed either way.
