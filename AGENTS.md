# Instructions for AI coding assistants

This file applies to every AI assistant working in this repository (Claude
Code, GitHub Copilot, others). Start with [docs/AI_HANDOFF.md](docs/AI_HANDOFF.md).

## Before you change anything

1. Read `docs/AI_HANDOFF.md`, then `docs/DEVELOPMENT_STATUS.md`,
   `docs/PROJECT_CONTEXT.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md` and
   `docs/ROADMAP.md`.
2. Inspect the code you will touch and follow its existing patterns. Avoid
   unrelated refactoring.
3. If a task conflicts with a decision in `docs/DECISIONS.md`, or needs a paid
   service, **stop and explain the options to the owner**. Never reverse a
   decision silently.
4. Before a large milestone, present a short plan (what, why, files affected,
   trade-offs) and then proceed.

## Non-negotiable rules

- **No costs without approval.** No paid API, SKU, plan or service (including
  Google Routes API or review text) without the owner's explicit approval
  after you state the SKU, free allowance and price.
- **Never change the user's itinerary automatically.** Suggestions require a tap.
- **Google terms:** store only Google place IDs; fetch other Google content fresh;
  never send Google content to Claude; show attribution; maps with Google
  content use `PROVIDER_GOOGLE`.
- **Location:** foreground, one reading, never stored, no background tracking.
- **Secrets:** never commit or print keys, passwords or connection strings.
  Only `EXPO_PUBLIC_*` public values (and the restricted iOS Maps key) may be in
  the app. Document variable names, never values.
- **Every user-facing string in English and Hebrew** (`apps/mobile/src/i18n/en.ts`,
  `he.ts`); use logical start/end styles for RTL.
- **Database:** migrations are append-only SQL in `supabase/migrations`; never
  edit an applied migration; keep RLS, `version`, `updated_at`, `deleted_at`.
- **Contract:** API request/response shapes live in `packages/shared` (zod).
  Change the schema first, then API and app.

## Conventions

- pnpm workspace; Node 24 (CI) / up to 25 locally; run commands from the repo root.
- API: NestJS module per feature, plain SQL (postgres.js) in the service,
  `DatabaseService.asUser()` for user data, errors as `{error:{code,message,details}}`.
- Mobile: Expo Router screens in `src/app`, features in `src/features/<area>`,
  TanStack Query for server state, shared UI in `src/components/ui`, tokens in `src/theme`.
- Pure logic (no React, no network) goes in plain `.ts` files with a `.spec.ts`
  next to it (Vitest). Live Companion logic lives in `src/features/companion/`.
- Keep comments short and about *why*.

## Commands

```sh
pnpm install            # also builds packages/shared
pnpm test               # all unit tests (shared, api, mobile)
pnpm typecheck          # strict TypeScript everywhere
pnpm dev:api            # local API
pnpm smoke:api          # end-to-end checks against the running/deployed API
pnpm ios                # build + run the app in the iOS Simulator
npx supabase db push --remote   # apply new migrations
```

Native change (new native package, `app.config.ts`, plugins):
`cd apps/mobile && npx expo prebuild --platform ios --clean && cd ../.. && pnpm ios`.

## Documentation is part of the work

In the same task as any meaningful change (feature, schema, integration,
architecture, decision, significant fix, milestone), update the relevant docs:

- `docs/DEVELOPMENT_STATUS.md`: always at the end of a milestone (state,
  tests run / not run, migrations, deployment, next steps, history line).
- `docs/AI_HANDOFF.md`: current state and exact next task.
- `docs/ROADMAP.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md`, `docs/API.md`,
  `docs/GOOGLE_AND_AI.md`, `docs/LIVE_COMPANION.md`, `README.md` as affected.

Keep docs in English, factual and free of duplication.

## Reporting

At the end of a task, report:

1. What changed (files, behavior).
2. What was tested, **how**, and the actual results.
3. What remains unverified (and what the owner must run).
4. Any native rebuild, migration or deployment steps.

**Never claim tests passed, a build worked or a feature works unless you
actually ran it and saw it.** Say "not run" when that is the truth.
