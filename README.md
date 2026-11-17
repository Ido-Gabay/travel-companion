# Travel Companion

A personal travel planning app: plan trips, keep a global collection of places,
and (later) build day-by-day itineraries that work offline.

This repository is a pnpm monorepo:

| Path | What it is |
| --- | --- |
| `apps/api` | NestJS 12 REST API, a modular monolith. The backend is the source of truth. |
| `apps/mobile` | Expo SDK 58 / React Native app with Expo Router (development builds, not Expo Go). |
| `packages/shared` | zod schemas and TypeScript types shared by the API and the app. |
| `supabase/migrations` | Plain SQL migrations for the Supabase Postgres database. |
| `supabase/checks` | SQL you can run to confirm a migration did what it should. |
| `docs/` | Architecture, API reference, and the progress log. |

Read next: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/API.md](docs/API.md), [docs/GOOGLE_AND_AI.md](docs/GOOGLE_AND_AI.md),
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md), [docs/PROGRESS.md](docs/PROGRESS.md).

## Requirements

- macOS with Xcode (for the iPhone build, milestone M5)
- **Node.js 24 LTS**, 24.15 or newer (the Nest CLI and Expo SDK 58 both need it)
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
npx expo install react-native-maps
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
installed app. Rebuild with `pnpm ios` only when native dependencies or app.json change.

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
