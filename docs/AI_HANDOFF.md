# AI handoff

Give this file to any AI coding assistant (Claude Code, GitHub Copilot with
Claude, …) that picks up this repository. Keep it current.

**Last updated: 2026-11-17, after M10 (local reminders) was written.**

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

As needed: `docs/API.md` (endpoints), `docs/GOOGLE_AND_AI.md` (costs, caps,
Google rules), `docs/LIVE_COMPANION.md` (Today + reminders design),
`docs/DEPLOYMENT.md` (Render/Supabase free tiers), `README.md` (setup, commands).

## 3. Current state

- `main` is at M9 (`4ef298a`). M10 local reminders were written in the last
  session and are **not yet verified on a device**; the owner must commit,
  run `pnpm test && pnpm typecheck`, deploy, and do a clean native rebuild.
- 143 pure-logic/API tests and all three typechecks passed in that session (run
  outside vitest; see DEVELOPMENT_STATUS.md). UI and notifications are untested.

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

## 5. Completed

M0–M4 foundation, auth, en/he; trips and places; zero-cost deploy; Discovery v1;
M6 itinerary; M7 Home trip mode; M8 Google-first Discover + preview + hotel pin
+ cost caps/usage (owner verified); M9 Today v1 (committed); M10 reminders (written).

## 6. Remaining

- Owner verification of M9 and M10 on the Mac/Simulator (commands in DEVELOPMENT_STATUS.md).
- R1: iPhone Release install on Nov 21–22 and the on-device checklist.
- M11 trip-readiness polish: fixes from R1, official Google Maps logo, API rate
  limiting, Today in the trip's time zone.
- Later: offline (PowerSync POCs), sharing, background location (opt-in), Android.

## 7. Exact next task

Help the owner verify M10: run `pnpm test && pnpm typecheck`, fix any failure,
commit (`git rm docs/PROGRESS.md` is part of it), push, `pnpm smoke:api` after
the Render deploy, then `npx expo prebuild --platform ios --clean` and
`pnpm ios` and walk the reminder checks in DEVELOPMENT_STATUS.md → "Exact next
steps". Then update DEVELOPMENT_STATUS.md, ROADMAP.md and this file with what
was actually verified.
