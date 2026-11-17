# AI handoff

Give this file to any AI coding assistant (Claude Code, GitHub Copilot with
Claude, …) that picks up this repository. Keep it current.

**Last updated: 2026-11-17, after M13 (smart day planning) was written on main.**

## 1. What this project is

**Travel Companion**: an iPhone app (Expo / React Native) with a NestJS API and
Supabase Postgres that helps one traveler discover real places (Google Maps
search first, AI optional), collect them, plan them day by day, and get live
help during the trip (Today screen + local reminders). First real use: the
owner's New York trip, **Nov 23–29, 2026**. Motto: *Your trip. Fully planned.
Always in control.*

## 2. Read before changing anything

1. [`AGENTS.md`](../AGENTS.md): rules for working in this repo.
2. [`docs/DEVELOPMENT_STATUS.md`](DEVELOPMENT_STATUS.md): exact state, tests run/not run, next steps.
3. [`docs/PROJECT_CONTEXT.md`](PROJECT_CONTEXT.md): vision, principles, flows.
4. [`docs/DECISIONS.md`](DECISIONS.md): decisions you must not reverse silently.
5. [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) and [`docs/ROADMAP.md`](ROADMAP.md).
6. [`docs/DESIGN_SYSTEM.md`](DESIGN_SYSTEM.md) before touching any screen: one primary
   action, lists not cards, actions in `useActionMenu`, sentence-case labels.

As needed: `docs/API.md` (endpoints), `docs/GOOGLE_AND_AI.md` (costs, caps,
Google rules), `docs/LIVE_COMPANION.md` (Today + reminders design),
`docs/DEPLOYMENT.md` (Render/Supabase free tiers), `README.md` (setup, commands).

## 3. Current state

- `main` on the Mac: M12a committed (`37dbf49`, suggested tag `trip-safe`). **M13
  smart day planning is written on main but uncommitted** (app, shared preview
  schema, API preview field mask; no migration). The `my_label` migration from
  M12a may still need `npx supabase db push --remote`.
- M13 session: app 129, shared 45, API 39 tests passed (Node TypeScript mode +
  vitest stand-in, not real vitest); `tsc` clean for shared, API, app; en/he parity clean.
- **Nothing from U1 or M12a has been looked at on a screen yet.** Device behavior
  of M9–M11 (Today, reminders) is also unconfirmed in writing.
- Offline design: docs/ARCHITECTURE.md → "Offline-tolerant trip mode (M12a)".

## 4. Decisions that need the owner's approval to change

- Google Maps search first; AI optional; not a chatbot (P2).
- Collection / Trip Wishlist / Itinerary stay distinct (P3).
- **The app never changes the itinerary on its own**; every change is a user tap (P5).
- Deterministic logic before AI (P7). Foreground location only, never stored; no background tracking (P8).
- **$0: no paid service, API, SKU or plan without explicit approval** with SKU,
  free allowance and price (C2). Google caps must stay under the free allowance (C3).
  Routes API and review text are **not** approved.
- Google terms: store only place IDs; never send Google content to Claude (T6).
- Free Apple ID: no push; keep `enableRemoteNotifications: false` (C6, T10).
- English + Hebrew RTL for every string (P11).
- Minimal UI rules (P13, P14, docs/DESIGN_SYSTEM.md): don't add a second primary
  button, stacked bordered cards or uppercase labels; put new item actions in the menu.
- Offline (P15, T16–T18): never cancel reminders because data failed to load; never
  discard or overwrite local changes silently; cache only the user's own data plus
  Google coordinates ≤ 30 days (enforced in code); `myLabel` is user-typed only; no
  new native dependency before the trip; full PowerSync/SQLite is later (M12).

## 5. Completed

M0–M4 foundation, auth, en/he; trips and places; zero-cost deploy; Discovery v1;
M6 itinerary; M7 Home trip mode; M8 Google-first Discover + preview + hotel pin
+ cost caps/usage (owner verified); M9 Today v1 (committed); M10 reminders (committed, rebuilt);
M11 trip readiness and U1 UX/UI redesign (committed by the owner, not verified on
screen); M12a offline-tolerant trip mode (committed: reminders, offline viewing,
offline edits + sync, `myLabel`); M13 smart day planning (written: summary,
warnings, "Plan this day", opening hours on request, approved as C7).

## 6. Remaining

- Owner verification of M9–M11, U1 and M12a on the Mac/Simulator, including the
  M12a airplane-mode checklist (commands and steps in DEVELOPMENT_STATUS.md).
- Migration push for `my_label` before the API deploy.
- R1: iPhone Release install on Nov 21–22 and the on-device checklist.
- M11b: fixes from R1; optional official Google Maps logo.
- Later: offline (PowerSync POCs), sharing, background location (opt-in), Android.

## 7. Exact next task

Help the owner verify M13 (checks in DEVELOPMENT_STATUS.md → "M13 checks") and
M12a (plus U1, M11 and the M10 reminder checks). If time before Nov 21–22 runs out,
the trip build is the `trip-safe` commit. In this order:
`pnpm test && pnpm typecheck` (fix any failure; the session ran tests outside vitest),
`npx supabase db push --remote` (my_label) **before** pushing the API, commit, push,
`pnpm smoke:api` after the Render deploy, `pnpm ios` (no native rebuild), then the
U1 checklist and the M12a airplane-mode checklist in DEVELOPMENT_STATUS.md →
"Exact next steps". Fix what fails, keeping the itinerary, Today and reminders
working above all. Then R1 (iPhone Release install) on Nov 21–22, repeating the
airplane-mode steps on the phone. Update DEVELOPMENT_STATUS.md, ROADMAP.md and this
file with what was actually verified.
