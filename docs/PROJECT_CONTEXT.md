# Project context

> **Your trip. Fully planned. Always in control.**

## What Travel Companion is

A personal travel app for iPhone (Android later) that covers a trip from
idea to the last day:

1. **Discover** real places (Google Maps search first, AI optional).
2. **Collect** them in a global collection and in a trip's wishlist.
3. **Plan** them into a day-by-day itinerary with times and visit lengths.
4. **Live Companion during the trip**: a Today screen and local reminders that
   tell you what's next, when to leave, what fits the time you have, and when
   to consider changing the plan. The app suggests; you decide.

**Problem it solves.** Planning tools stop at the list; maps apps don't know
your plan. Travelers juggle saved pins, notes and timing in their heads. Travel
Companion keeps the plan and the places together and helps in the moment.

**Owner and first real use.** Built by Ido for personal use first. The
acceptance test is the owner's New York trip, **Nov 23–29, 2026**, on his
iPhone.

## Target users and use cases

- **Now:** one traveler (the owner), planning and doing a city trip.
- **Later:** couples/families sharing a trip; offline use abroad; more cities
  (Israel has weaker place data, see D12).

Typical use cases:

- "Find good breakfast near my hotel" → results on a list and a map → save 3 to
  the NY wishlist.
- Put MoMA on Tuesday at 13:00 for 90 minutes; move Central Park to Wednesday.
- On the day: "Leave by 12:40 (≈ 12 min walk)"; "You have 1 h 45 min free, here
  are two wishlist places nearby that fit"; "Running 18 min late: start at 13:35
  or move to tomorrow?"; a notification 10 minutes before it's time to leave.

## Product principles (do not change without approval)

1. **Google Maps search is the standard discovery; AI is optional.** Not a chatbot. (P2)
2. **Global Collection / Trip Wishlist / Itinerary** stay distinct. (P3)
3. **The app suggests, the user decides.** No automatic itinerary changes. (P5)
4. **Deterministic first.** Use rules and estimates before AI. (P7)
5. **Privacy-conscious location.** Foreground, one reading, never stored, no
   background tracking yet. (P8)
6. **$0 unless approved.** Every paid API/plan needs the owner's explicit
   approval with numbers. (C2)
7. **Follow Google's terms.** Only place IDs are stored; Google content is
   fetched fresh and never sent to Claude. (T6)
8. **English and Hebrew (RTL) everywhere.** (P11)
9. **Honest UI.** Estimates are marked "≈"; nothing is shown unless it works.

## Core features and user flows (as built)

| Area | Flow |
| --- | --- |
| Account | Email + password (Supabase Auth); profile name, language (en/he), distance unit (km/mi). |
| Trips | Create/edit/delete a trip: title, destination, dates, "Staying at" (user's words) + pinned hotel on Google Maps. |
| Discover | **Search** (default): type or tap a category; area = near my hotel (real location) / destination / near me / anywhere; list + map; "Search this area"; tap a result for the **place preview** (photo, rating, hours, category, map, directions); save one or many to the collection or a trip wishlist. **Ask AI**: describe in your words; one clarification at most; the AI builds a Google search (never invents places). |
| Collection | Places tab: all saved places by category, map, place detail (notes, tags, visited, trips). |
| Trip | Tabs **Itinerary · Wishlist · Map**. Itinerary: day strip, ordered stops with time and visit length, reorder, move day, remove from itinerary, numbered day map, day route in Google Maps. Wishlist: all places saved for the trip with their planned day. |
| Home | Countdown before the trip; during the trip today's next stop with Directions and Done; Open/Preview Today. |
| Today | Timeline of the day, next stop with leave-by and travel estimate, free time with suggestions that fit (wishlist first, then collection), running-late / overbooked hints with accept or dismiss; preview mode before the trip. |
| Reminders | Opt-in local notifications: leave in N minutes, time to leave, heads-up, morning summary; per-stop mute; test reminder; scheduled list. |
| Costs | Profile → Google & AI usage: today / month per paid API vs caps and free allowance. |

## Important product decisions

See [DECISIONS.md](DECISIONS.md) for the full list with reasons and status.
The ones that most shape new work: P2, P3, P5, P7, P8, C2, C3, T6, T9.

## Not in scope yet

Offline mode (PowerSync + encrypted local DB), sharing a trip, background
location/geofencing, route optimization, Android release, push notifications,
App Store release, review text and Routes API (not approved).
