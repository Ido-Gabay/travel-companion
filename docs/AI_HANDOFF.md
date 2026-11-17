# AI handoff

Give this file to any AI coding assistant (Claude Code, GitHub Copilot with
Claude, …) that picks up this repository. Keep it current.

**Last updated: 2026-11-17, after U1 (UX/UI redesign) was written.**

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

- `main` is at M10 (`52c49b6`); the iOS project was rebuilt with reminders.
  M11 trip readiness (trip time zone everywhere, API rate limiting, Google
  attribution to policy) is written but **uncommitted/unverified** until the
  owner runs the steps in DEVELOPMENT_STATUS.md.
- 150 tests and all three typechecks passed in the M11 session (run outside
  vitest). Device behavior of M9–M11 (Today, reminders) is not confirmed.
- **U1 UX/UI redesign** is written on top of M11 (app only: no API, database or
  route changes): new design system, four tabs, every main screen simplified.
  App `tsc` clean and 70 app tests pass; **nothing was looked at on a screen yet**.

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

## 5. Completed

M0–M4 foundation, auth, en/he; trips and places; zero-cost deploy; Discovery v1;
M6 itinerary; M7 Home trip mode; M8 Google-first Discover + preview + hotel pin
+ cost caps/usage (owner verified); M9 Today v1 (committed); M10 reminders (committed, rebuilt);
M11 trip readiness (written); U1 UX/UI redesign (written).

## 6. Remaining

- Owner verification of M9, M10, M11 and U1 on the Mac/Simulator (commands in DEVELOPMENT_STATUS.md).
- Proposed, not decided: offline-tolerant trip mode (cache the trip for flaky subway signal).
- R1: iPhone Release install on Nov 21–22 and the on-device checklist.
- M11b: fixes from R1; optional official Google Maps logo.
- Later: offline (PowerSync POCs), sharing, background location (opt-in), Android.

## 7. Exact next task

Help the owner verify M11 + U1 (and the M10 reminder checks): `pnpm test &&
pnpm typecheck`, fix any failure, commit, push, `pnpm smoke:api` after the
Render deploy, `pnpm ios`, and walk the checks in DEVELOPMENT_STATUS.md →
"Exact next steps" (including the U1 screen checklist in both languages).
Fix visual issues found there against docs/DESIGN_SYSTEM.md. Then R1 on Nov 21–22. Update DEVELOPMENT_STATUS.md,
ROADMAP.md and this file with what was actually verified.
