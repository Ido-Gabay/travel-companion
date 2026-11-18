# Travel Companion

> **Your trip. Fully planned. Always in control.**

An iPhone app that helps a traveler **discover** real places (Google Maps search
first, AI optional), **collect** them, **plan** them day by day, and get **live
help during the trip**: a Today screen (what's next, when to leave, what fits
your free time, whether to change the plan) and local reminders. The app
suggests; you decide. First real use: a New York trip, Nov 23–29, 2026.

**New here (human or AI assistant)? Start with [docs/AI_HANDOFF.md](docs/AI_HANDOFF.md)
and [AGENTS.md](AGENTS.md).**

## Main features

- Email sign-in; English and Hebrew (full RTL); km or miles.
- Trips with dates, "Staying at" and a hotel pinned on Google Maps.
- **Discover**: Google Places search by keyword or category, near your hotel /
  destination / you / anywhere, list + map, "Search this area", place preview
  (photo, rating, hours, map, directions); optional **Ask AI** (Claude) that
  turns your words into a Google search.
- **Global collection** and **trip wishlist** (deduplicated by Google place ID),
  notes, tags, visited.
- **Itinerary**: day by day, times, visit lengths, order, day map and route.
- **Smart day planning**: each day's load and warnings (too tight, long legs,
  late end, closed); "Plan this day" suggests a shorter order and start times,
  with opening hours on request. Nothing changes until you apply it.
- **Today**: timeline, next stop with leave-by and travel estimate, free time
  with suggestions that fit, running-late hints (accept or dismiss), preview mode.
- **Local reminders**: leave soon, time to leave, heads-up, morning summary.
- **Offline-tolerant trip mode**: trips, itinerary and Today open without a
  connection (saved copy per user); Done, reorder, time, length and day work
  offline and sync later with conflict checks; reminders keep working.
- **Cost control**: hard caps on every paid API and an in-app usage screen.

## Technology

| Part | Stack |
| --- | --- |
| Mobile | Expo SDK 58, React Native 0.88, React 19, Expo Router, TanStack Query, i18next, react-native-maps (Google provider), expo-location, expo-notifications |
| API | NestJS 12 (ESM), postgres.js (plain SQL), zod 4, jose (JWT/JWKS), Vitest |
| Data / Auth | Supabase Postgres (private `app` schema, RLS) and Supabase Auth |
| Integrations | Google Places API (New), Google Maps SDK for iOS, Claude Haiku 5.5 |
| Hosting | Render Free (API), Supabase Free, GitHub + Actions (CI) — all $0 |

## Repository

| Path | What it is |
| --- | --- |
| `apps/api` | NestJS REST API, a modular monolith. The backend is the source of truth. |
| `apps/mobile` | Expo / React Native app (development builds, not Expo Go). |
| `packages/shared` | zod schemas and types shared by API and app (the API contract). |
| `supabase/migrations` | Append-only SQL migrations. `supabase/checks` has verification SQL. |
| `scripts/` | Setup helpers and the API smoke test. |
| `docs/` | Project documentation (see below). |
| `AGENTS.md` | Rules for AI coding assistants. |

## Documentation

| Document | Contents |
| --- | --- |
| [docs/AI_HANDOFF.md](docs/AI_HANDOFF.md) | Start here: state, rules, next task |
| [docs/DEVELOPMENT_STATUS.md](docs/DEVELOPMENT_STATUS.md) | Exact status, tests run / not run, migrations, deployment, known issues, history |
| [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) | Vision, principles, users, flows |
| [docs/ROADMAP.md](docs/ROADMAP.md) | Milestones and acceptance criteria |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Product and technical decisions, open questions |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | System design, data model, security |
| [docs/API.md](docs/API.md) | Endpoint reference |
| [docs/GOOGLE_AND_AI.md](docs/GOOGLE_AND_AI.md) | Google/Claude setup, prices, caps, rules |
| [docs/LIVE_COMPANION.md](docs/LIVE_COMPANION.md) | Today + reminders design |
| [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) | UI principles, tokens, components, patterns |
| [docs/TESTING.md](docs/TESTING.md) | Logic tests (Vitest), screen tests (Jest), fakes, CI |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Render/Supabase free tiers and deploys |

## Requirements

- macOS with Xcode 26.4+ (iOS Simulator and iPhone builds; a free Apple ID is enough)
- **Node.js 24 LTS**, 24.15 or newer (CI uses 24; Node 25 also works locally)
- **pnpm 10** via Corepack (bundled with Node 24)
- A Supabase cloud project
- Optional: `jq` for the curl examples (`brew install jq`)

## First-time setup

### 1. Node and pnpm

```sh
# Any Node version manager works. With Homebrew:
brew install node@24
# follow brew's note to put node@24 on your PATH, then open a new terminal
node -v          # must print v24.15.0 or newer

corepack enable pnpm
pnpm -v          # 10.x
```

### 2. Install dependencies

```sh
cd ~/Programing/travel-companion
pnpm install     # also builds packages/shared (postinstall)
pnpm test        # unit tests for shared + api
pnpm typecheck
```

### 3. Supabase project

1. Create a project at <https://supabase.com/dashboard>. Pick the region closest
   to you (for Israel, Frankfurt `eu-central-1`). Save the database password in
   your password manager.
2. **Project Settings → JWT Keys**: the current signing key should be an
   asymmetric key (ECC P-256 is the default for new projects). The API only
   accepts asymmetric tokens. Check with:
   `curl https://YOUR-REF.supabase.co/auth/v1/.well-known/jwks.json` (must list at least one key).
3. **Authentication → Sign In / Providers → Email**: email + password stays on.
   For development you can turn **Confirm email** off so test sign-ups work
   immediately (the default email sender is heavily rate limited). Turn it back on
   before inviting anyone else.
4. Apply the migrations with the Supabase CLI (runs through `npx`, no global install):

   ```sh
   npx supabase login
   npx supabase init          # creates supabase/config.toml; answer "N" to the editor prompts
   npx supabase link --project-ref YOUR-REF
   npx supabase db push --remote   # without --remote the CLI targets a local Docker database
   ```

   No CLI? Paste `supabase/migrations/*.sql` into **SQL Editor** and run it once.
5. Run `supabase/checks/phase1_checks.sql` in the SQL Editor. Every row must show `ok = true`.

Do **not** add the `app` schema to **Data API → Exposed schemas**. Keeping it
private is what stops the mobile app's publishable key from reading tables directly.

### 4. API environment

```sh
cp apps/api/.env.example apps/api/.env
```

Set `SUPABASE_URL` to `https://<project-ref>.supabase.co`, then run `pnpm setup:db`.
It takes the Session pooler address saved by `supabase link`, asks for your database
password (hidden), escapes it and writes `DATABASE_URL`. Restart the API after changing `.env`. `.env` is git-ignored. Never put
`DATABASE_URL`, the secret key, or the service-role key in the mobile app.

### 5. Run the API

```sh
pnpm dev:api
curl -s localhost:3000/health          # {"status":"ok"}
curl -s localhost:3000/health/ready    # {"status":"ok","database":"ok"}
curl -s localhost:3000/v1/me           # 401 UNAUTHENTICATED (expected without a token)
```

### 6. Call the API as a real user

Create a user in **Authentication → Users → Add user** (tick *Auto confirm*), then run
`pnpm smoke:api` (from the repo folder, with the API running). It signs in and checks six
endpoints. To do it by hand instead:

```sh
export SUPABASE_URL=https://YOUR-REF.supabase.co
export SUPABASE_PUBLISHABLE_KEY=sb_publishable_...   # Project Settings → API Keys
TOKEN=$(curl -s "$SUPABASE_URL/auth/v1/token?grant_type=password" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"your-test-password"}' | jq -r .access_token)

curl -s localhost:3000/v1/me -H "Authorization: Bearer $TOKEN" | jq
curl -s -X PATCH localhost:3000/v1/me/preferences -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" -d '{"locale":"he"}' | jq
curl -s localhost:3000/v1/trips -H "Authorization: Bearer $TOKEN" | jq   # {"items":[]}
```

### 7. Mobile app: first-time install

Expo picks the native library versions that match SDK 58, so they are added with
`expo install` rather than pinned by hand:

```sh
pnpm install
cd apps/mobile
npx expo install react-native-maps expo-location expo-notifications
npx expo install react react-native expo-router react-native-screens react-native-safe-area-context expo-linking expo-constants expo-status-bar expo-localization expo-dev-client expo-font @expo/vector-icons @react-native-async-storage/async-storage @react-native-community/datetimepicker react-native-url-polyfill @supabase/supabase-js @tanstack/react-query i18next react-i18next
npx expo install typescript @types/react -- --save-dev
npx expo-doctor
cd ../..
pnpm setup:mobile        # writes apps/mobile/.env (public values only)
```

### 8. Run the app in the iOS Simulator

Requires the latest Xcode from the App Store (open it once to install the iOS platform).

```sh
pnpm dev:api             # terminal 1: the API
pnpm ios                 # terminal 2: builds the native app (first build takes several minutes)
```

After the first build, day-to-day you only need `pnpm dev:mobile` (Metro) and the
installed app. When native dependencies, `app.json`/`app.config.ts`, or
`GOOGLE_MAPS_IOS_API_KEY` change, regenerate the native project first, or the
app can crash (e.g. the Google map):

```sh
cd apps/mobile && npx expo prebuild --platform ios --clean && cd ../..
pnpm ios
```

### 9. Deploy the API (free; see docs/DEPLOYMENT.md for limits)

Put the code on GitHub (a **private** repo):

```sh
cd ~/Programing/travel-companion
git init -b main
git add .
git status            # check: no .env files listed
git commit -m "Travel Companion: Phase 1 + places"
```

Create an empty private repo named `travel-companion` at <https://github.com/new>
(no README, no .gitignore), then:

```sh
git remote add origin https://github.com/YOUR-USERNAME/travel-companion.git
git push -u origin main
```

Then on <https://render.com>: sign up with GitHub (no card) → **New → Blueprint** →
choose the repo → fill in `SUPABASE_URL` and `DATABASE_URL` → **Apply**.
After the deploy, check `https://<service>.onrender.com/health/ready` and run
`API_URL=https://<service>.onrender.com pnpm smoke:api`.

## Everyday commands

| Command | What it does |
| --- | --- |
| `pnpm dev:api` | API with reload on save |
| `pnpm setup:db` | Write `DATABASE_URL` into `apps/api/.env` |
| `pnpm smoke:api` | Sign in as a test user and check the running API |
| `pnpm setup:mobile` | Write `apps/mobile/.env` (Supabase URL, publishable key, API URL on your Wi-Fi) |
| `pnpm ios` | Build and launch the app in the iOS Simulator |
| `pnpm ios:release` | Release build on a connected iPhone (set the signing Team in Xcode first) |
| `pnpm dev:mobile` | Start Metro for an already-installed development build |
| `pnpm dev:shared` | Rebuild `packages/shared` on save (run next to `dev:api` when editing schemas) |
| `pnpm test` | All unit tests |
| `pnpm typecheck` | Strict TypeScript across the workspace |
| `pnpm build` | Production builds |
| `pnpm format` | Prettier |

## Secrets policy

- Server secrets live only in `apps/api/.env` locally and in the host's secret
  store when deployed.
- The mobile app may contain only public values: the Supabase URL, the
  **publishable** key, and the API URL (`EXPO_PUBLIC_*`). Anything prefixed
  `EXPO_PUBLIC_` is compiled into the app and readable by anyone.
- `.env` files are git-ignored; `.env.example` files document every variable.

## Native rebuilds and the iPhone

- After adding a native package or changing `app.config.ts` / plugins:
  `cd apps/mobile && npx expo prebuild --platform ios --clean && cd ../.. && pnpm ios`.
- `prebuild --clean` recreates `apps/mobile/ios`: set **Signing & Capabilities →
  Team** (your Personal Team) again in Xcode before an iPhone build.
- Free Apple ID builds stop opening after **7 days**; reinstall with `pnpm ios:release`.
- Reminders are local notifications only. Push is deliberately disabled
  (`enableRemoteNotifications: false`) because a free Personal Team can't sign it.
