# AI handoff

Give this file to any AI coding assistant (Claude Code, GitHub Copilot with
Claude, …) that picks up this repository. Keep it current.

**Last updated: 2026-11-18, after U2 (map-first Today) was written on main, on top of M15 stage 1.**

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

- `main` on the Mac: M14 committed (`9560555`); tag `trip-safe` = M12a (`37dbf49`).
  **M15 stage 1 is written but uncommitted** (journal + recap; migration
  `20261118120000_trip_journal`). Migrations `my_label` and `trip_journal` may still
  need `npx supabase db push --remote` before the API deploy.
- M15 session ran the real `pnpm test` / `pnpm typecheck` (scratch copy on the Mac's
  Linux shell): shared 47, API 52, app logic 138, app screens 13 — all passed;
  typecheck clean. How to test: docs/TESTING.md.
- **U2 written (uncommitted): Today is map-first** (full-screen Google map + three-height
  bottom sheet, `MapSheet` on RN Animated/PanResponder, one-shot "Show my location",
  travel shown only when reliable). Decisions P18. Real run: shared 47, API 52, app
  logic 146, app screens 23; typecheck clean. Not seen on a screen yet.
- Open owner decision: M15 stage 2 (photos) now / after the trip / never (P17).
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
offline edits + sync, `myLabel`); M13 smart day planning and M14 screen tests + CI (committed); M15 trip journal +
recap stage 1 and U2 map-first Today (written).

## 6. Remaining

- Owner verification of M9–M11, U1 and M12a on the Mac/Simulator, including the
  M12a airplane-mode checklist (commands and steps in DEVELOPMENT_STATUS.md).
- Migration push for `my_label` before the API deploy.
- R1: iPhone Release install on Nov 21–22 and the on-device checklist.
- M11b: fixes from R1; optional official Google Maps logo.
- Later: offline (PowerSync POCs), sharing, background location (opt-in), Android.

## 7. Exact next task

First: `pnpm test && pnpm typecheck`, `npx supabase db push --remote` (journal
migration) before pushing the API, commit M15 + U2 together, push, confirm
GitHub CI is green, then the M15 and U2 checks in DEVELOPMENT_STATUS.md.
When touching Today: keep the map the workspace, the next action in the collapsed
sheet, alerts visible collapsed, and never show a travel time `reliableTravel`
rejects.

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
