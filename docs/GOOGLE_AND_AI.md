# Google Maps Platform and Claude: setup, costs and rules

Owner approvals (2026-11-17), in order:

1. Google billing **with caps**, Claude **Haiku 5.5**, no ratings or photos.
2. Place preview upgrade: **rating, review count, opening hours and photos;
   no review text** (reviews and Google's descriptions are a pricier SKU that was
   not approved). Caps keep every SKU inside Google's free monthly allowance.

Nothing else paid is enabled. Prices below were checked on Google's official
price list on 2026-11-17 (free usage is per SKU, per month, per billing account).

## What the app uses

| Purpose | Google SKU (or service) | Free / month | Then (per 1,000) | Our caps (daily / monthly) |
| --- | --- | --- | --- | --- |
| Search (standard and AI) | Places API **Text Search Pro** | 5,000 | $32 | 160 / 4,500 |
| Saved place name, address, location | Places API **Place Details Pro** | 5,000 | $17 | 160 / 4,500 |
| Place preview: rating, count, opening hours (also "Check opening hours" in day planning: one per place, on request) | Places API **Place Details Enterprise** | 1,000 | $20 | 30 / 900 |
| Photo list in the preview | Place Details **Essentials (IDs Only)** (`photos` field) | Unlimited | — | (part of the preview call) |
| Each photo image shown | Places API **Place Details Photos** | 1,000 | $7 | 60 / 900 |
| Real travel times + route line (M16: Today, "Plan this day"; online only) | Routes API **Compute Routes Essentials** (walk/transit; never traffic-aware, no waypoint optimization, no intermediate waypoints) | 10,000 | $5 | 150 / 2,000 |
| Maps on iPhone | **Maps SDK** (mobile native) | Unlimited | — | — |
| "Ask AI" | **Claude Haiku 5.5** (tokens) | — | per token | 300 / 3,000 |

Env vars: `GOOGLE_TEXT_SEARCH_DAILY_CAP` / `_MONTHLY_CAP`, `GOOGLE_PLACE_DETAILS_*`,
`GOOGLE_PLACE_PREVIEW_*`, `GOOGLE_PLACE_PHOTO_*`, `GOOGLE_ROUTES_DAILY_CAP` / `_MONTHLY_CAP`,
`AI_DAILY_CAP` / `AI_MONTHLY_CAP`. Routes uses `GOOGLE_ROUTES_API_KEY` if set, else
`GOOGLE_PLACES_API_KEY` (that key must then also allow Routes API).

**Routes (M16), checked 2026-11-18:** one Compute Routes request per leg; Pro is
triggered by 11–25 intermediate waypoints, `optimizeWaypointOrder`, traffic-aware
routing or location modifiers, none of which we send (tested in
`google-routes.spec.ts`). Route results are never stored (Routes caching is
restricted; place IDs excepted): the app keeps them in memory for 20 minutes and
they are not in the offline copy. Shown on our Google map and with "Google Maps"
attribution next to the time. Past a cap, or on any error, the app silently uses
its own estimate. The free allowance is per billing account.

**How the caps work.** Every paid call is counted in our database
(`app.provider_usage`) **before** it is made. Over the daily cap the API answers
`429 DAILY_LIMIT_REACHED`; over the monthly cap `429 MONTHLY_LIMIT_REACHED`.
Monthly caps sit 10% below the free allowance as a margin (our UTC month and
Google's billing month may not line up exactly). When the preview or photo cap
is reached, the preview quietly falls back to the free basic version
(`detail: "basic"`) instead of failing.

**Cost monitoring.** `GET /v1/usage` (in the app: Profile → Costs → Google & AI
usage) shows today's and this month's count per SKU, the caps, the free
allowance and the estimated charge (stays $0 inside the free allowances).
Google Cloud billing is the final word: keep the budget alert below.

**Field masks** (`apps/api/src/google/google-places.mapper.ts`):

- Search and basic details: `id, displayName, formattedAddress, shortFormattedAddress,
  location, primaryType, primaryTypeDisplayName, googleMapsUri, businessStatus,
  timeZone` (all Pro; `timeZone` added in M10 to schedule reminders in the trip's zone).
- Preview: the same plus `rating, userRatingCount, currentOpeningHours,
  regularOpeningHours, photos` (Enterprise; `regularOpeningHours` added in M13 for
  day planning, same SKU and price, approved as C7). Unit tests fail if `reviews`, `reviewSummary`, `editorialSummary`,
  `generativeSummary` or other Atmosphere fields slip in, or if any Enterprise
  field slips into the search or basic masks.

**Photos.** The preview lists up to 10 photos (free metadata). The app loads the
first image only; more load only when the user taps "Show more photos" (up to 4).
The API asks Google for a short-lived image URL (`skipHttpRedirect`), so the key
never reaches the app, and nothing is stored. Each photo shows its author.

**Claude cost estimate:** a request is roughly 1,000 input tokens and a few hundred output tokens. At
Haiku 5.5's $0.10 / $0.50 per million tokens, that's a small fraction of a cent.
Even the full monthly cap of 3,000 is well under $5. Set a spend limit in the
Anthropic console anyway.

**Saved places:** each Google place in your collection is looked up once per
app session (kept in memory for up to 6 hours, never written to disk). Search
results are reused for the preview and for saving, so those cost no extra lookup.

## Google's rules and how we follow them

| Rule (Places API policies) | What the code does |
| --- | --- |
| Store only place IDs (indefinitely); lat/lng at most 30 days; don't store names, addresses, etc. (Service Specific Terms, Places API "Caching", and general "Google ID caching"; re-checked 2026-11-17) | `app.places` keeps `google_place_id` + the user's own fields (incl. `my_label`, typed by the user, never filled from Google). A database constraint forbids `name`/`address` on Google rows. The pinned hotel is stored as a place ID only (`trips.base_google_place_id`). The server stores no coordinates, ratings, hours or photos. **On the phone (M12a)** only coordinates are cached, for places in the user's trips, each with source `google-places-api` and its fetch time; code refuses to use them after 30 days and deletes them at launch, on return to the foreground and on every write (`features/offline/coords.ts`). The offline copy strips any name/address from Google places as a second guard. Names, addresses, hours, photos and the time zone are never stored. |
| Show photo authors | Every photo shows "Photo: <author>" linking to their Google Maps profile. |
| Fetch fresh details when needed | `GET /v1/google/places/:id` calls Google every time (no server cache). |
| Places shown on a map must be on a Google map | Maps use `react-native-maps` with `PROVIDER_GOOGLE` on iOS. |
| Without a Google map, show Google attribution | One component, `components/GoogleAttribution.tsx`, everywhere Google place content appears outside a map (Discover lists, preview, cards, itinerary, Home, Today, add-places, hotel pin). Text "Google Maps" (allowed where space is limited) styled per Google's rules: sans-serif (Roboto on Android), weight 400, #5E5E5E, 12–16 sp, one line, never translated. Reminder notifications that name a Google place carry "Google Maps" as the iOS subtitle. The official logo (16–19 dp, Google's asset files) is optional polish. |
| Credit photo authors and link photos to Google Maps | Each photo shows "Photo: <author>" (linking to the author) and opens the photo's `googleMapsUri` when tapped. |
| Users must be able to reach the place on Google Maps | Every result and saved place has "Google Maps" / "Directions" buttons using `googleMapsUri` or official Maps URLs. |
| Don't create content based on Google Maps content | Google results are never sent to Claude, and Claude never ranks or describes them. Claude only turns the user's words (plus their own trip name, destination and dates) into a search. The "Searching for …" line describes the request, not the places. |

Server key and iOS key are different keys. The server key never ships in the app.

## One-time setup (owner)

### Google Cloud (about 15 minutes)

1. Open <https://console.cloud.google.com/> and create a project, e.g. **Travel Companion**.
2. **Billing** → link a billing account (card required). New accounts may get trial credit.
3. **APIs & Services → Library** → enable **Places API (New)**, **Maps SDK for iOS** and
   (M16) **Routes API**.
4. **APIs & Services → Credentials → Create credentials → API key**, twice:
   - **server-places**: *API restrictions* → **Places API (New)** and (M16) **Routes API**. *Application
     restrictions* → none (Render Free has no fixed IP). It's only used server-side.
     Put it in Render as `GOOGLE_PLACES_API_KEY`, and in `apps/api/.env` for local runs.
   - **ios-maps**: *Application restrictions* → **iOS apps**, bundle ID
     `com.idogabay.travelcompanion`. *API restrictions* → **Maps SDK for iOS** only.
     Put it in `apps/mobile/.env` as `GOOGLE_MAPS_IOS_API_KEY` (or run `pnpm setup:mobile`).
5. Recommended second safety net (Google's side): **APIs & Services → Places API (New)
   → Quotas & System Limits**. Lower the per-day limits, e.g. *SearchText requests
   per day* ≈ 160, *GetPlace requests per day* ≈ 250 (basic + preview),
   *GetPhotoMedia requests per day* ≈ 60. Google then refuses calls even if our
   counter were wrong.
6. **Billing → Budgets & alerts** → create a budget of **$1** with email alerts at
   50 / 90 / 100 %. Alerts don't stop spending; the caps do.

### Anthropic (about 5 minutes)

1. <https://console.anthropic.com/> → **Billing** → buy the smallest credit.
2. **Settings → Limits** → set a monthly spend limit (e.g. $5).
3. **API keys** → create a key → Render `ANTHROPIC_API_KEY` (and `apps/api/.env`).

Without `ANTHROPIC_API_KEY` the app still works: your words go to Google as
typed (the app labels this "Searched Google for").
Without `GOOGLE_PLACES_API_KEY`, discovery answers `NOT_CONFIGURED`.

## Changing the limits

Edit the cap env vars in Render (and `apps/api/.env`). Raising a monthly cap
past the free allowance can cost money. Get the owner's approval first. Not
approved yet (would need approval, with numbers): review text and Google's
descriptions (Place Details Enterprise + Atmosphere, 1,000 free then $25 per
1,000), and Routes API travel times (for Live Today, M9).

## Sources

- [Places API (New) policies](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Place data fields and their SKUs](https://developers.google.com/maps/documentation/places/web-service/data-fields)
- [Text Search (New)](https://developers.google.com/maps/documentation/places/web-service/text-search)
- [Pricing categories (free caps per SKU)](https://developers.google.com/maps/billing-and-pricing/pricing-categories)
- [Core services pricing list](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Maps SDK for iOS usage and billing](https://developers.google.com/maps/documentation/ios-sdk/usage-and-billing)
- [Places API usage and quotas](https://developers.google.com/maps/documentation/places/web-service/usage-and-billing)
- [Claude Haiku 5.5](https://platform.claude.com/docs/en/models/haiku-5-5/overview)
- [Claude structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
- [react-native-maps in Expo](https://docs.expo.dev/versions/latest/sdk/map-view/)
