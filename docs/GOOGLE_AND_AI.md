# Google Maps Platform and Claude: setup, costs and rules

Approved by the owner on 2026-11-17: Google billing **with daily caps**, Claude
**Haiku 5.5**, **no ratings or photos** (they're billed at a higher tier).
Nothing else paid is enabled.

## What the app uses

| Purpose | Service | Billing level | Free per month | Our hard daily cap |
| --- | --- | --- | --- | --- |
| Find places from a request | Places API (New) **Text Search** | Pro | 5,000 | 160 (`GOOGLE_TEXT_SEARCH_DAILY_CAP`) |
| Show a saved place (name, address, location, type) | Places API (New) **Place Details** | Pro | 5,000 | 160 (`GOOGLE_PLACE_DETAILS_DAILY_CAP`) |
| Map on iPhone | **Maps SDK for iOS** (mobile native map, no map ID) | Free | Unlimited | — |
| Understand the request | **Claude Haiku 5.5** | Prepaid tokens | — | 300 (`AI_DAILY_CAP`) |

160 a day × 31 days = 4,960, which is under each 5,000 free allowance. The caps are counted
in our own database (`app.provider_usage`) **before** each call. When a cap is
reached, the API answers `429 DAILY_LIMIT_REACHED` and the app says the free
limit for today is used up. Caps reset at midnight UTC.

**Fields requested** (field masks in `apps/api/src/google/google-places.mapper.ts`):
`id, displayName, formattedAddress, shortFormattedAddress, location, primaryType,
primaryTypeDisplayName, googleMapsUri, businessStatus`. All are Pro-level fields. We never request
ratings, review counts, opening hours, price level, photos or reviews, which
are Enterprise-level. A unit test fails if one of those slips into a mask.

**Claude cost estimate:** a request is roughly 1,000 input tokens and a few hundred output tokens. At
Haiku 5.5's $0.10 / $0.50 per million tokens, that's a small fraction of a cent.
Even the full daily cap of 300 is well under $1 a day. Set a spend limit in the
Anthropic console anyway.

**Saved places:** each Google place in your collection is looked up once per
app session (kept in memory for up to 6 hours, never written to disk), so 30
saved places cost about 30 lookups per app launch.

## Google's rules and how we follow them

| Rule (Places API policies) | What the code does |
| --- | --- |
| Store only place IDs (indefinitely); lat/lng at most 30 days; don't store names, addresses, etc. | `app.places` keeps `google_place_id` + the user's own fields. A database constraint forbids `name`/`address` on Google rows. We store no coordinates at all. |
| Fetch fresh details when needed | `GET /v1/google/places/:id` calls Google every time (no server cache). |
| Places shown on a map must be on a Google map | Maps use `react-native-maps` with `PROVIDER_GOOGLE` on iOS. |
| Without a Google map, show Google attribution | Lists of Google results and Google-sourced place text show "Google Maps" text attribution. **To do:** swap the text for the official logo asset. |
| Users must be able to reach the place on Google Maps | Every result and saved place has "Google Maps" / "Directions" buttons using `googleMapsUri` or official Maps URLs. |
| Don't create content based on Google Maps content | Google results are never sent to Claude, and Claude never ranks or describes them. Claude only turns the user's words (plus their own trip name, destination and dates) into a search. The "Searching for …" line describes the request, not the places. |

Server key and iOS key are different keys. The server key never ships in the app.

## One-time setup (owner)

### Google Cloud (about 15 minutes)

1. Open <https://console.cloud.google.com/> and create a project, e.g. **Travel Companion**.
2. **Billing** → link a billing account (card required). New accounts may get trial credit.
3. **APIs & Services → Library** → enable **Places API (New)** and **Maps SDK for iOS**.
4. **APIs & Services → Credentials → Create credentials → API key**, twice:
   - **server-places**: *API restrictions* → **Places API (New)** only. *Application
     restrictions* → none (Render Free has no fixed IP). It's only used server-side.
     Put it in Render as `GOOGLE_PLACES_API_KEY`, and in `apps/api/.env` for local runs.
   - **ios-maps**: *Application restrictions* → **iOS apps**, bundle ID
     `com.idogabay.travelcompanion`. *API restrictions* → **Maps SDK for iOS** only.
     Put it in `apps/mobile/.env` as `GOOGLE_MAPS_IOS_API_KEY` (or run `pnpm setup:mobile`).
5. Optional extra safety: **Google Maps Platform → Quotas → Places API (New)**:
   lower `SearchText` and `GetPlace` requests per minute (e.g. 30).
6. **Billing → Budgets & alerts** → create a budget of **$1** with email alerts at
   50 / 90 / 100 %. Alerts don't stop spending; our daily caps do.

### Anthropic (about 5 minutes)

1. <https://console.anthropic.com/> → **Billing** → buy the smallest credit.
2. **Settings → Limits** → set a monthly spend limit (e.g. $5).
3. **API keys** → create a key → Render `ANTHROPIC_API_KEY` (and `apps/api/.env`).

Without `ANTHROPIC_API_KEY` the app still works: your words go to Google as
typed (the app labels this "Searched Google for").
Without `GOOGLE_PLACES_API_KEY`, discovery answers `NOT_CONFIGURED`.

## Changing the limits

Edit the cap env vars in Render (and `apps/api/.env`). Raising them past the
free allowance can cost money. Get the owner's approval first.

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
