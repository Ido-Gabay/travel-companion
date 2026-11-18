# Testing

How the project is tested, and how to add tests. Introduced fully in M14 (2026-11-18).

## Commands

```sh
pnpm test        # everything: shared + API (Vitest), app logic (Vitest) + app screens (Jest)
pnpm typecheck   # tsc for shared, API, app (test files included)
pnpm --filter @travel-companion/mobile test:logic     # app logic only (Vitest)
pnpm --filter @travel-companion/mobile test:screens   # app screens only (Jest)
```

GitHub CI (`.github/workflows/ci.yml`) runs `pnpm install --frozen-lockfile`,
`pnpm test` and `pnpm typecheck` on every push to `main` and every pull request.

## Two kinds of tests

| Kind | Files | Runner | Use for |
| --- | --- | --- | --- |
| Logic | `*.spec.ts` next to the code | Vitest (`vitest.config.ts`, Node) | Pure functions: planner, today engine, reminders, offline queue and sync, schemas, mappers. Fast; no React Native. |
| Screens | `apps/mobile/src/test/screens/*.test.tsx` | Jest with `jest-expo` (iOS preset) + React Native Testing Library 14 | Rendering real screens with all providers: what the user sees and taps, offline behavior, menus, sheets. |

Prefer a logic test when the behavior lives in a pure function; add a screen test
when the risk is in wiring (a screen choosing error vs. data, a menu running an
action, a warning before sign-out).

## How screen tests work

- `src/test/setup.ts` replaces everything outside the app: the API (`@/lib/api`,
  every method a `jest.fn`), the auth session (signed in as `TEST_USER`), the router,
  AsyncStorage (official mock), safe areas, notifications, maps, location, Supabase.
- `src/test/render.tsx` gives:
  - `renderApp(<Screen />)` (async): renders inside QueryClient, language, action
    menu and the offline provider (the saved copy is restored first, like the app).
  - `serverHas(trips)`: the API answers with these trips (Google details fail).
  - `goOffline()`: every request fails like airplane mode; connection = offline.
  - `seedSavedCopy(trips, savedAt, { ops, conflicts })`: what an earlier session left on the phone.
  - `storedOps()`: the pending-changes queue as saved on the device.
  - `setRouteParams({...})`, `resetAll()` (call in `beforeEach`).
- Fixtures: `features/offline/test-fixtures.ts` (`tripDetail`, `tripPlace`, `uuid`).
- Strings: assert with `i18n.t('key')`, not literal English, so copy changes don't break tests.
- Time: `jest.useFakeTimers({ advanceTimers: true, now: … })` to pin "today";
  restore in `afterEach`.
- RNTL 14: `render` and `fireEvent` are async — always `await` them.

## What screen tests cover today (M14)

Home (online; offline cold launch from the saved copy), trip itinerary (offline
view with labels; Done offline → pending change saved; stop menu → move later;
"Plan this day" fills a time and sends it), Today (offline on a trip day), sync
conflict ("Keep mine" re-queues against the server value), Profile (sign-out warns
about unsynced changes), reminder sync (not cancelled when trips can't load; control:
cancelled when the server has no trip).

M15 added: journal (rate the day, write a note, star a highlight offline → pending
changes), recap (numbers, highlights, day note; Share sends the text).

U2 added: map-first Today — the collapsed sheet (next action, leave-by, travel,
progress, alerts, distinct done/next/later pins), all three sheet states by tap and
VoiceOver, running late visible collapsed → full sheet with choices (nothing
queued), travel unavailable instead of a guess, Done offline from the collapsed
sheet, list ↔ pin selection, preview; Home card opens Today (live / preview). The map
is mocked (`react-native-maps` → plain views; markers are pressable) and tests
enable it by mocking `expo-constants` (`googleMapsEnabled`). Collapsed, the sheet
body is hidden from accessibility, so tests open the sheet before using the list.

Bugs these found when first run (fixed in M14): Profile showed an error instead of
the saved copy offline, and its error-screen "Sign out" skipped the unsynced-changes
warning; the action menu relied only on iOS `Modal.onDismiss` (now has a fallback).

## Not covered by automated tests

Native behavior (real notifications firing, AsyncStorage on a device, maps tiles,
location permission dialogs), the live API and Google, visual layout and RTL
mirroring. Those stay on the device checklists in DEVELOPMENT_STATUS.md.
